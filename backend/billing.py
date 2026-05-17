"""
Stripe LIVE subscription billing for Speculative Alpha.

Flow:
    1. Premium-less user clicks "Inizia la prova" →
       frontend calls POST /api/billing/checkout → backend returns the
       Payment Link URL with `client_reference_id=<user_id>` and
       `prefilled_email=<email>`.
    2. Stripe handles 7-day trial + first payment.
    3. Stripe Dashboard webhook → POST /api/billing/webhook
       (signature-verified) → we update the user's subscription_status,
       trial_ends_at, current_period_end, stripe_customer_id,
       stripe_subscription_id.
    4. Active subscribers can hit POST /api/billing/portal → backend
       creates a Stripe Customer Portal session URL.

Env vars (loaded by server.py):
    STRIPE_SECRET_KEY      — sk_live_...
    STRIPE_WEBHOOK_SECRET  — whsec_...
    STRIPE_PAYMENT_LINK    — https://buy.stripe.com/...
"""
from __future__ import annotations

import os
import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import stripe
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("billing")


def _stripe_key() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise RuntimeError("STRIPE_SECRET_KEY env var is required")
    return key


def _webhook_secret() -> str:
    s = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not s:
        raise RuntimeError("STRIPE_WEBHOOK_SECRET env var is required")
    return s


def _payment_link() -> str:
    p = os.environ.get("STRIPE_PAYMENT_LINK")
    if not p:
        raise RuntimeError("STRIPE_PAYMENT_LINK env var is required")
    return p


def _utc_from_ts(ts: Optional[int]) -> Optional[datetime]:
    if ts in (None, 0):
        return None
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _status_from_subscription(sub: Dict[str, Any]) -> str:
    """Map Stripe subscription status → our short enum.

    Stripe values: trialing, active, past_due, canceled, unpaid,
    incomplete, incomplete_expired, paused.
    We collapse to: trialing, active, past_due, canceled, free.
    """
    s = (sub.get("status") or "").lower()
    if s == "trialing":
        return "trialing"
    if s == "active":
        return "active"
    if s in ("past_due", "unpaid"):
        return "past_due"
    if s in ("canceled", "incomplete_expired"):
        return "canceled"
    if s in ("incomplete", "paused"):
        return "free"
    return "free"


async def _apply_subscription_to_user(
    db: AsyncIOMotorDatabase,
    sub: Dict[str, Any],
    user_id: Optional[str] = None,
    email: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Locate the app user (by user_id, customer_id, or email) and persist
    the relevant subscription fields. Returns the updated user (or None)."""
    customer_id = sub.get("customer")
    # Find the user
    user = None
    if user_id:
        user = await db.users.find_one({"user_id": user_id})
    if user is None and customer_id:
        user = await db.users.find_one({"stripe_customer_id": customer_id})
    if user is None and email:
        user = await db.users.find_one({"email": email.lower()})
    if user is None:
        logger.warning("Subscription %s could not be matched to a user", sub.get("id"))
        return None

    status = _status_from_subscription(sub)
    update: Dict[str, Any] = {
        "subscription_status": status,
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": sub.get("id"),
        "current_period_end": _utc_from_ts(sub.get("current_period_end")),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "stripe_synced_at": datetime.now(timezone.utc),
    }
    trial_end = _utc_from_ts(sub.get("trial_end"))
    if trial_end is not None:
        update["trial_ends_at"] = trial_end
    elif status not in ("trialing",):
        # Once out of trial, the field is no longer meaningful
        update["trial_ends_at"] = None
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    user.update(update)
    return user


async def refresh_user_from_stripe_if_stale(
    db: AsyncIOMotorDatabase,
    user: Dict[str, Any],
    *,
    max_age_sec: int = 600,
) -> Dict[str, Any]:
    """Self-heal: re-pull the subscription from Stripe whenever the user's
    cached status could be out of date (e.g. webhook missed, trial expired,
    just-completed checkout). Cheap no-op when not needed.

    Trigger conditions (any):
        - cached status is "trialing" but trial_ends_at has passed
        - cached status is "past_due" (could have recovered)
        - cached status is "free"/None but a stripe_subscription_id exists
          (webhook hasn't fired yet)
        - last sync older than `max_age_sec`
    """
    sub_id = user.get("stripe_subscription_id")
    if not sub_id:
        return user
    status = user.get("subscription_status") or "free"
    trial_end = user.get("trial_ends_at")
    now = datetime.now(timezone.utc)

    stale = False
    if status == "trialing":
        if not trial_end or (isinstance(trial_end, datetime) and trial_end <= now):
            stale = True
    if status in ("past_due", "free") or status is None:
        stale = True
    last_sync = user.get("stripe_synced_at")
    if isinstance(last_sync, datetime):
        if (now - (last_sync if last_sync.tzinfo else last_sync.replace(tzinfo=timezone.utc))).total_seconds() > max_age_sec:
            stale = True
    else:
        stale = True

    if not stale:
        return user

    try:
        stripe.api_key = _stripe_key()
        sub = stripe.Subscription.retrieve(sub_id)
        updated = await _apply_subscription_to_user(db, sub, user_id=user.get("user_id"))
        return updated or user
    except Exception as e:  # noqa: BLE001
        logger.warning("self-heal stripe refresh failed for %s: %s", user.get("user_id"), e)
        return user


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class CheckoutBody(BaseModel):
    origin_url: Optional[str] = None  # for return_url; not strictly required


class PortalBody(BaseModel):
    origin_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Router builder
# ---------------------------------------------------------------------------


def build_billing_router(db_getter, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/billing", tags=["billing"])

    @router.post("/checkout")
    async def checkout(body: CheckoutBody, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
        """Return the Stripe Payment Link URL pre-filled for this user."""
        link = _payment_link()
        params = {
            "client_reference_id": user["user_id"],
            "prefilled_email": user["email"],
        }
        sep = "&" if "?" in link else "?"
        url = f"{link}{sep}{urllib.parse.urlencode(params)}"
        try:
            from admin import log_event as _log
            await _log(db_getter(), "checkout_start", request=request, user_id=user["user_id"], email=user["email"])
        except Exception:
            pass
        return {"url": url}

    @router.post("/portal")
    async def portal(body: PortalBody, request: Request, user: Dict[str, Any] = Depends(get_current_user)):
        """Create a Stripe Customer Portal session for managing the subscription."""
        if not user.get("stripe_customer_id"):
            raise HTTPException(status_code=400, detail="No active subscription")
        # Resolve a sensible return URL: explicit body > Origin/Referer > Request host.
        origin = (body.origin_url or "").rstrip("/")
        if not origin:
            hdr = request.headers.get("origin") or request.headers.get("referer") or ""
            if hdr:
                # Strip path from Referer if needed
                from urllib.parse import urlparse
                p = urlparse(hdr)
                origin = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else ""
        if not origin:
            origin = f"{request.url.scheme}://{request.headers.get('host', request.url.netloc)}"
        stripe.api_key = _stripe_key()
        try:
            session = stripe.billing_portal.Session.create(
                customer=user["stripe_customer_id"],
                return_url=origin + "/dashboard",
            )
        except Exception as e:  # noqa: BLE001
            logger.exception("portal session failed: %s", e)
            raise HTTPException(status_code=502, detail="Stripe portal unavailable")
        return {"url": session.url}

    @router.get("/status")
    async def status(user: Dict[str, Any] = Depends(get_current_user)):
        """Return the user's billing summary."""
        # Refresh from Stripe if we have a subscription id (best-effort, cached on user doc otherwise)
        sub_id = user.get("stripe_subscription_id")
        if sub_id:
            try:
                stripe.api_key = _stripe_key()
                sub = stripe.Subscription.retrieve(sub_id)
                await _apply_subscription_to_user(db_getter(), sub, user_id=user["user_id"])
                user = await db_getter().users.find_one({"user_id": user["user_id"]}, {"_id": 0}) or user
            except Exception as e:  # noqa: BLE001
                logger.warning("status refresh failed: %s", e)
        return {
            "subscription_status": user.get("subscription_status") or "free",
            "trial_ends_at": _iso(user.get("trial_ends_at")),
            "current_period_end": _iso(user.get("current_period_end")),
            "cancel_at_period_end": bool(user.get("cancel_at_period_end")),
            "stripe_customer_id": user.get("stripe_customer_id"),
        }

    @router.post("/webhook")
    async def webhook(request: Request):
        """Stripe → us. Verifies the signature, updates the user document."""
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature", "")
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, _webhook_secret())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")
        except Exception as e:  # noqa: BLE001
            logger.exception("webhook parse error: %s", e)
            raise HTTPException(status_code=400, detail="Webhook error")

        evt_type = event["type"]
        data = event["data"]["object"]
        db = db_getter()
        # Persist raw event for audit (idempotent on Stripe event id)
        try:
            await db.stripe_events.update_one(
                {"_id": event["id"]},
                {"$set": {"type": evt_type, "created_at": datetime.now(timezone.utc), "raw": event}},
                upsert=True,
            )
        except Exception:  # noqa: BLE001
            pass

        try:
            stripe.api_key = _stripe_key()
            if evt_type == "checkout.session.completed":
                user_id = data.get("client_reference_id")
                email = (data.get("customer_details") or {}).get("email") or data.get("customer_email")
                customer_id = data.get("customer")
                sub_id = data.get("subscription")
                if sub_id:
                    sub = stripe.Subscription.retrieve(sub_id)
                    await _apply_subscription_to_user(db, sub, user_id=user_id, email=email)
                elif customer_id and (user_id or email):
                    # No subscription yet (one-off?) — just stash the customer id
                    query = {"user_id": user_id} if user_id else {"email": (email or "").lower()}
                    await db.users.update_one(query, {"$set": {"stripe_customer_id": customer_id}})
            elif evt_type in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
                updated = await _apply_subscription_to_user(db, data)
                if updated:
                    try:
                        from admin import log_event as _log
                        if evt_type == "customer.subscription.created":
                            await _log(db, "subscription_started", user_id=updated["user_id"], email=updated.get("email"))
                        elif evt_type == "customer.subscription.deleted":
                            await _log(db, "subscription_canceled", user_id=updated["user_id"], email=updated.get("email"))
                    except Exception:
                        pass
            elif evt_type == "invoice.payment_succeeded":
                sub_id = data.get("subscription")
                if sub_id:
                    sub = stripe.Subscription.retrieve(sub_id)
                    await _apply_subscription_to_user(db, sub)
            elif evt_type == "invoice.payment_failed":
                sub_id = data.get("subscription")
                if sub_id:
                    sub = stripe.Subscription.retrieve(sub_id)
                    await _apply_subscription_to_user(db, sub)
            else:
                logger.info("Unhandled stripe event: %s", evt_type)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("webhook handling error for %s: %s", evt_type, e)
            # Return 200 anyway so Stripe doesn't keep retrying for our bugs
        return {"received": True}

    return router


def _iso(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    return None
