"""
Admin analytics & user management.

Collections used:
    users           — primary identity (also feeds KPIs)
    events          — append-only stream of user actions (login, asset_view, …)
    stripe_events   — Stripe webhook audit log (already populated by billing.py)

All routes here require role="admin". The dependency is injected by server.py.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("admin")

# Event types we track. Anything in this set is considered "valid" for the
# funnel/feed. Free-form metadata can come along in `meta` field.
EVENT_TYPES = {
    "register", "login", "logout",
    "asset_view", "favorite_toggle",
    "paywall_click", "checkout_start",
    "subscription_started", "subscription_canceled",
    "trial_started", "page_view",
}


async def log_event(
    db: AsyncIOMotorDatabase,
    event_type: str,
    request: Optional[Request] = None,
    user_id: Optional[str] = None,
    email: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    """Fire-and-forget event logger. Safe to call from any handler."""
    if event_type not in EVENT_TYPES:
        return
    doc: Dict[str, Any] = {
        "type": event_type,
        "user_id": user_id,
        "email": (email or "").lower() or None,
        "ts": datetime.now(timezone.utc),
        "meta": meta or {},
    }
    if request is not None:
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
            request.client.host if request.client else None
        )
        ua = request.headers.get("user-agent", "")[:300]
        doc["ip"] = ip
        doc["ua"] = ua
    try:
        await db.events.insert_one(doc)
    except Exception as e:  # noqa: BLE001
        logger.warning("event log failed: %s", e)


def _parse_range(
    days: Optional[int],
    from_iso: Optional[str],
    to_iso: Optional[str],
    default_days: int = 30,
) -> tuple[datetime, datetime]:
    """Resolve a (since, until) UTC range from either presets or explicit ISO dates.

    Priority: explicit from/to > days preset > default_days.
    """
    now = datetime.now(timezone.utc)

    def _parse(iso: Optional[str]) -> Optional[datetime]:
        if not iso:
            return None
        try:
            s = iso.replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:  # noqa: BLE001
            return None

    f = _parse(from_iso)
    t = _parse(to_iso)
    if f or t:
        since = f or (now - timedelta(days=365 * 10))
        until = t or now
        return since, until
    d = max(1, min(int(days or default_days), 365))
    return now - timedelta(days=d), now


async def ensure_admin_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.events.create_index([("ts", -1)])
    await db.events.create_index("user_id")
    await db.events.create_index("type")


# ---------------------------------------------------------------------------
# Pydantic
# ---------------------------------------------------------------------------


class TrackBody(BaseModel):
    type: str
    meta: Optional[Dict[str, Any]] = None


class ExtendTrialBody(BaseModel):
    days: int = 7


class SetRoleBody(BaseModel):
    role: str  # "admin" | "user"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pub_user(u: Dict[str, Any]) -> Dict[str, Any]:
    """Sanitized user row for the admin table."""
    return {
        "user_id": u.get("user_id"),
        "email": u.get("email"),
        "name": u.get("name") or "",
        "picture": u.get("picture") or "",
        "role": u.get("role") or "user",
        "subscription_status": u.get("subscription_status") or "free",
        "trial_ends_at": _iso(u.get("trial_ends_at")),
        "current_period_end": _iso(u.get("current_period_end")),
        "stripe_customer_id": u.get("stripe_customer_id"),
        "cancel_at_period_end": bool(u.get("cancel_at_period_end")),
        "favorites_count": len(u.get("favorites") or []),
        "google_linked": bool(u.get("google_id")),
        "created_at": _iso(u.get("created_at")),
        "last_login_at": _iso(u.get("last_login_at")),
    }


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


def require_admin(get_current_user):
    async def dep(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if (user.get("role") or "user") != "admin":
            raise HTTPException(status_code=403, detail="Admin only")
        return user
    return dep


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def build_admin_router(db_getter, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["admin"])
    admin_dep = require_admin(get_current_user)

    # ----- Public tracker (auth-optional) - used by FE to log paywall clicks etc.
    # Mounted under /admin for organization, but no admin role check.
    @router.post("/track")
    async def track(body: TrackBody, request: Request):
        # Best-effort identify the user from JWT if present
        user = None
        try:
            user = await get_current_user(request)
        except HTTPException:
            user = None
        await log_event(
            db_getter(),
            body.type,
            request=request,
            user_id=(user or {}).get("user_id"),
            email=(user or {}).get("email"),
            meta=body.meta or {},
        )
        return {"ok": True}

    # ----- KPIs -----
    @router.get("/kpis")
    async def kpis(
        _: Dict[str, Any] = Depends(admin_dep),
        days: Optional[int] = Query(None, ge=1, le=365),
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
    ):
        db = db_getter()
        now = datetime.now(timezone.utc)
        # Period the user picked (used for "new users" + "active users")
        since, until = _parse_range(days, from_iso, to_iso, default_days=30)
        # Keep the 7d slice for legacy widgets
        d7 = now - timedelta(days=7)
        d90 = now - timedelta(days=90)

        total_users = await db.users.count_documents({})
        users_7d = await db.users.count_documents({"created_at": {"$gte": d7}})
        users_period = await db.users.count_documents({"created_at": {"$gte": since, "$lte": until}})
        active_7d = len(await db.events.distinct("user_id", {"ts": {"$gte": d7}, "user_id": {"$ne": None}}))
        active_period = len(await db.events.distinct(
            "user_id", {"ts": {"$gte": since, "$lte": until}, "user_id": {"$ne": None}}
        ))
        trialing = await db.users.count_documents({"subscription_status": "trialing"})
        active_subs = await db.users.count_documents({"subscription_status": "active"})
        past_due = await db.users.count_documents({"subscription_status": "past_due"})
        canceled = await db.users.count_documents({"subscription_status": "canceled"})

        # Conversion: % of users that ever had subscription_status active / total
        ever_paid = await db.users.count_documents({
            "$or": [
                {"subscription_status": {"$in": ["active", "past_due", "canceled"]}},
                {"stripe_subscription_id": {"$ne": None}},
            ]
        })
        conversion_pct = round((ever_paid / total_users * 100) if total_users else 0, 1)

        # MRR estimate from active subs × price (assume $24.99 USD)
        price_usd = float(24.99)
        mrr_usd = round(active_subs * price_usd, 2)

        # Revenue series — last 90d, counted via invoice.payment_succeeded stripe_events
        series: List[Dict[str, Any]] = []
        try:
            pipeline = [
                {"$match": {"type": "invoice.payment_succeeded", "created_at": {"$gte": d90}}},
                {"$group": {
                    "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "count": {"$sum": 1},
                }},
                {"$sort": {"_id": 1}},
            ]
            async for row in db.stripe_events.aggregate(pipeline):
                series.append({"date": row["_id"], "payments": row["count"]})
        except Exception as e:  # noqa: BLE001
            logger.warning("revenue series failed: %s", e)

        return {
            "total_users": total_users,
            "new_users_7d": users_7d,
            "new_users_30d": users_period,
            "active_7d": active_7d,
            "active_30d": active_period,
            "trialing": trialing,
            "active_subs": active_subs,
            "past_due": past_due,
            "canceled": canceled,
            "conversion_pct": conversion_pct,
            "mrr_usd": mrr_usd,
            "revenue_series_90d": series,
            "period_from": since.isoformat(),
            "period_to": until.isoformat(),
            "as_of": now.isoformat(),
        }

    # ----- Funnel -----
    @router.get("/funnel")
    async def funnel(
        _: Dict[str, Any] = Depends(admin_dep),
        days: Optional[int] = Query(None, ge=1, le=365),
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
    ):
        db = db_getter()
        since, until = _parse_range(days, from_iso, to_iso, default_days=30)
        ts_filter = {"$gte": since, "$lte": until}
        # Use distinct user/IP buckets per step. For anonymous we fall back to IP.
        anon_visits = len(await db.events.distinct("ip", {"ts": ts_filter, "type": "page_view"}))
        registered = await db.users.count_documents({"created_at": ts_filter})
        activated = len(await db.events.distinct(
            "user_id", {"ts": ts_filter, "type": "asset_view", "user_id": {"$ne": None}}
        ))
        trialing_or_paid = await db.users.count_documents({
            "created_at": ts_filter,
            "subscription_status": {"$in": ["trialing", "active"]},
        })
        paid = await db.users.count_documents({
            "created_at": ts_filter,
            "subscription_status": {"$in": ["active", "past_due", "canceled"]},
        })
        return {
            "from": since.isoformat(),
            "to": until.isoformat(),
            "steps": [
                {"key": "visit", "label": "Visite anonime", "count": anon_visits},
                {"key": "register", "label": "Registrazioni", "count": registered},
                {"key": "activate", "label": "Asset visualizzati", "count": activated},
                {"key": "trial", "label": "In trial/Pro", "count": trialing_or_paid},
                {"key": "paid", "label": "Hanno pagato", "count": paid},
            ],
        }

    # ----- Events live feed -----
    @router.get("/events")
    async def events(
        _: Dict[str, Any] = Depends(admin_dep),
        limit: int = Query(100, ge=1, le=500),
        type: Optional[str] = Query(None),
        user_id: Optional[str] = Query(None),
        days: Optional[int] = Query(None, ge=1, le=365),
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
    ):
        db = db_getter()
        q: Dict[str, Any] = {}
        if type:
            q["type"] = type
        if user_id:
            q["user_id"] = user_id
        # Apply period filter only if user passed one explicitly.
        if days or from_iso or to_iso:
            since, until = _parse_range(days, from_iso, to_iso, default_days=30)
            q["ts"] = {"$gte": since, "$lte": until}
        out: List[Dict[str, Any]] = []
        cursor = db.events.find(q, {"_id": 0}).sort("ts", -1).limit(limit)
        async for ev in cursor:
            ev["ts"] = _iso(ev.get("ts"))
            out.append(ev)
        return {"events": out}

    # ----- Bulk delete events (purge) -----
    @router.delete("/events")
    async def delete_events(
        _: Dict[str, Any] = Depends(admin_dep),
        type: Optional[str] = Query(None),
        days: Optional[int] = Query(None, ge=1, le=3650),
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        all_: bool = Query(False, alias="all"),
    ):
        db = db_getter()
        q: Dict[str, Any] = {}
        if type:
            q["type"] = type
        if days or from_iso or to_iso:
            since, until = _parse_range(days, from_iso, to_iso, default_days=30)
            q["ts"] = {"$gte": since, "$lte": until}
        elif not all_:
            raise HTTPException(
                status_code=400,
                detail="Specify at least one filter (type, days, from/to) or all=true",
            )
        res = await db.events.delete_many(q)
        return {"ok": True, "deleted": res.deleted_count}

    # ----- Top assets viewed -----
    @router.get("/top-assets")
    async def top_assets(
        _: Dict[str, Any] = Depends(admin_dep),
        days: Optional[int] = Query(None, ge=1, le=365),
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
    ):
        db = db_getter()
        since, until = _parse_range(days, from_iso, to_iso, default_days=30)
        pipeline = [
            {"$match": {"type": "asset_view", "ts": {"$gte": since, "$lte": until}}},
            {"$group": {"_id": "$meta.assetId", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 25},
        ]
        rows = []
        async for r in db.events.aggregate(pipeline):
            if r["_id"]:
                rows.append({"assetId": r["_id"], "count": r["count"]})
        return {"items": rows}

    # ----- Users table -----
    @router.get("/users")
    async def list_users(
        _: Dict[str, Any] = Depends(admin_dep),
        q: Optional[str] = Query(None),
        plan: Optional[str] = Query(None),
        page: int = Query(1, ge=1),
        per_page: int = Query(50, ge=1, le=200),
    ):
        db = db_getter()
        query: Dict[str, Any] = {}
        if q:
            esc = q.replace("\\", "\\\\").replace(".", "\\.").replace("@", "\\@")
            query["$or"] = [
                {"email": {"$regex": esc, "$options": "i"}},
                {"name": {"$regex": esc, "$options": "i"}},
                {"user_id": q},
            ]
        if plan and plan != "all":
            query["subscription_status"] = plan
        total = await db.users.count_documents(query)
        cursor = db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip((page - 1) * per_page).limit(per_page)
        rows = [_pub_user(u) async for u in cursor]
        return {"total": total, "page": page, "per_page": per_page, "items": rows}

    @router.get("/users/{user_id}")
    async def user_detail(user_id: str, _: Dict[str, Any] = Depends(admin_dep)):
        db = db_getter()
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        recent_events = []
        async for ev in db.events.find({"user_id": user_id}, {"_id": 0}).sort("ts", -1).limit(50):
            ev["ts"] = _iso(ev.get("ts"))
            recent_events.append(ev)
        return {"user": _pub_user(u), "events": recent_events}

    @router.post("/users/{user_id}/extend-trial")
    async def extend_trial(user_id: str, body: ExtendTrialBody, _: Dict[str, Any] = Depends(admin_dep)):
        db = db_getter()
        u = await db.users.find_one({"user_id": user_id})
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        # Reset trial_ends_at = now + days, mark trialing
        new_end = datetime.now(timezone.utc) + timedelta(days=max(1, body.days))
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"subscription_status": "trialing", "trial_ends_at": new_end}},
        )
        return {"ok": True, "trial_ends_at": new_end.isoformat()}

    @router.post("/users/{user_id}/role")
    async def set_role(
        user_id: str,
        body: SetRoleBody,
        current: Dict[str, Any] = Depends(admin_dep),
    ):
        if body.role not in ("user", "admin"):
            raise HTTPException(status_code=400, detail="Invalid role")
        if current.get("user_id") == user_id:
            raise HTTPException(status_code=400, detail="Cannot change your own role")
        db = db_getter()
        res = await db.users.update_one({"user_id": user_id}, {"$set": {"role": body.role}})
        if not res.matched_count:
            raise HTTPException(status_code=404, detail="User not found")
        return {"ok": True}

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, current: Dict[str, Any] = Depends(admin_dep)):
        if current.get("user_id") == user_id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        db = db_getter()
        res = await db.users.delete_one({"user_id": user_id})
        if not res.deleted_count:
            raise HTTPException(status_code=404, detail="User not found")
        # Also wipe their events
        await db.events.delete_many({"user_id": user_id})
        return {"ok": True}

    return router
