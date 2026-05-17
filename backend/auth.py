"""
Authentication module for Speculative Alpha.

Supports two coexisting auth methods:
  1. Custom JWT email/password (POST /api/auth/register, /login, /logout, /me, /refresh)
  2. Emergent-managed Google OAuth (POST /api/auth/session — exchanges Emergent session_id)

Both methods share the same `users` MongoDB collection. After successful auth (either
method) we issue our own JWT cookies — so the rest of the app only needs `get_current_user`.

User model:
    user_id            (str)   custom UUID  — primary identity field
    email              (str)   unique, lowercased
    password_hash      (str|null)  bcrypt — null for Google-only users
    google_id          (str|null)  Emergent Google id when applicable
    name               (str)
    picture            (str|null)
    role               ("user" | "admin")
    subscription_status ("free" | "trialing" | "active" | "canceled")
    trial_ends_at      (datetime|null) — ISO when trial expires
    favorites          (list[str])  — asset ids
    created_at         (datetime)
"""
from __future__ import annotations

import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import bcrypt
import jwt
import httpx
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger("auth")

JWT_ALGORITHM = "HS256"
ACCESS_TTL_MINUTES = 60 * 24  # 1 day access token — long enough to skip refresh dance
REFRESH_TTL_DAYS = 30
EMERGENT_AUTH_URL = os.environ.get(
    "EMERGENT_AUTH_URL",
    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
)
TRIAL_DAYS = 7

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET env var is required")
    return secret


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MINUTES),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def _decode(token: str) -> Dict[str, Any]:
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    # secure + samesite=none required for cross-site cookie (Emergent preview ≠ frontend domain)
    response.set_cookie(
        "access_token", access,
        httponly=True, secure=True, samesite="none",
        max_age=ACCESS_TTL_MINUTES * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", refresh,
        httponly=True, secure=True, samesite="none",
        max_age=REFRESH_TTL_DAYS * 86400, path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


# ---------------------------------------------------------------------------
# User serialization
# ---------------------------------------------------------------------------


def _public_user(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip sensitive fields and MongoDB _id."""
    out = {
        "user_id": doc.get("user_id"),
        "email": doc.get("email"),
        "name": doc.get("name") or "",
        "picture": doc.get("picture") or "",
        "role": doc.get("role") or "user",
        "subscription_status": doc.get("subscription_status") or "free",
        "trial_ends_at": _to_iso(doc.get("trial_ends_at")),
        "favorites": doc.get("favorites") or [],
        "has_password": bool(doc.get("password_hash")),
        "google_linked": bool(doc.get("google_id")),
        "created_at": _to_iso(doc.get("created_at")),
    }
    return out


def _to_iso(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    return None


# ---------------------------------------------------------------------------
# Current user dependency factory
# ---------------------------------------------------------------------------


def get_user_resolver(db_getter):
    """Build a FastAPI dependency that resolves the current user.

    `db_getter` is a callable returning the live motor database. We use a getter
    (not the db itself) so this module can be imported before MongoDB is wired.
    """

    async def get_current_user(request: Request) -> Dict[str, Any]:
        token = request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        try:
            payload = _decode(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        db = db_getter()
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    async def get_optional_user(request: Request) -> Optional[Dict[str, Any]]:
        try:
            return await get_current_user(request)
        except HTTPException:
            return None

    return get_current_user, get_optional_user


def _client_ip(request: Request) -> str:
    """Resolve the real client IP behind reverse proxies (k8s ingress).

    `request.client.host` is the immediate TCP peer (often a service-mesh
    sidecar in our deployment), which can rotate per-request and defeat
    per-IP controls. Prefer X-Forwarded-For when present.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "anon"


# ---------------------------------------------------------------------------
# Brute force
# ---------------------------------------------------------------------------

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


async def _record_failed_login(db: AsyncIOMotorDatabase, identifier: str) -> None:
    await db.login_attempts.update_one(
        {"_id": identifier},
        {"$inc": {"count": 1}, "$set": {"last_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def _is_locked_out(db: AsyncIOMotorDatabase, identifier: str) -> bool:
    doc = await db.login_attempts.find_one({"_id": identifier})
    if not doc:
        return False
    count = doc.get("count", 0)
    last = doc.get("last_at")
    if count < MAX_FAILED_ATTEMPTS or not last:
        return False
    if isinstance(last, str):
        last = datetime.fromisoformat(last)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return last + timedelta(minutes=LOCKOUT_MINUTES) > datetime.now(timezone.utc)


async def _clear_failed_login(db: AsyncIOMotorDatabase, identifier: str) -> None:
    await db.login_attempts.delete_one({"_id": identifier})


# ---------------------------------------------------------------------------
# Startup helpers
# ---------------------------------------------------------------------------


async def ensure_auth_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("google_id", sparse=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("last_at")


async def seed_admin(db: AsyncIOMotorDatabase) -> None:
    admin_email = (os.environ.get("ADMIN_EMAIL") or "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD") or "admin123"
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "subscription_status": "active",  # admin always sees everything
            "trial_ends_at": None,
            "favorites": [],
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("Admin user seeded: %s", admin_email)
    else:
        # Re-hash if env password changed (idempotent across restarts)
        if not existing.get("password_hash") or not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
            )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = ""


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class SessionBody(BaseModel):
    session_id: str


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class FavoritesBody(BaseModel):
    favorites: List[str]


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------


def build_auth_router(db_getter, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/auth", tags=["auth"])

    @router.post("/register")
    async def register(body: RegisterBody, request: Request, response: Response):
        db = db_getter()
        email = body.email.lower()
        existing = await db.users.find_one({"email": email})
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "email": email,
            "password_hash": hash_password(body.password),
            "name": (body.name or email.split("@")[0]).strip(),
            "picture": "",
            "role": "user",
            "subscription_status": "trialing",
            "trial_ends_at": now + timedelta(days=TRIAL_DAYS),
            "favorites": [],
            "created_at": now,
        }
        await db.users.insert_one(doc)
        access = create_access_token(user_id, email)
        refresh = create_refresh_token(user_id)
        _set_auth_cookies(response, access, refresh)
        return _public_user(doc)

    @router.post("/login")
    async def login(body: LoginBody, request: Request, response: Response):
        db = db_getter()
        email = body.email.lower()
        client_ip = _client_ip(request)
        # Two-key lockout: by IP+email AND by email alone. Either tripping locks out.
        # This defeats IP-rotation attacks while still allowing brief shared-NAT collisions.
        ident_ip = f"{client_ip}:{email}"
        ident_email = f"email:{email}"
        if await _is_locked_out(db, ident_ip) or await _is_locked_out(db, ident_email):
            raise HTTPException(status_code=429, detail="Too many failed attempts, try again later")
        user = await db.users.find_one({"email": email})
        if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
            await _record_failed_login(db, ident_ip)
            await _record_failed_login(db, ident_email)
            raise HTTPException(status_code=401, detail="Invalid email or password")
        await _clear_failed_login(db, ident_ip)
        await _clear_failed_login(db, ident_email)
        access = create_access_token(user["user_id"], email)
        refresh = create_refresh_token(user["user_id"])
        _set_auth_cookies(response, access, refresh)
        return _public_user(user)

    @router.post("/logout")
    async def logout(response: Response):
        _clear_auth_cookies(response)
        return {"ok": True}

    @router.get("/me")
    async def me(user: Dict[str, Any] = Depends(get_current_user)):
        return _public_user(user)

    @router.post("/refresh")
    async def refresh_token_endpoint(request: Request, response: Response):
        token = request.cookies.get("refresh_token")
        if not token:
            raise HTTPException(status_code=401, detail="No refresh token")
        try:
            payload = _decode(token)
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Refresh expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        db = db_getter()
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(user["user_id"], user["email"])
        new_refresh = create_refresh_token(user["user_id"])
        _set_auth_cookies(response, access, new_refresh)
        return {"ok": True}

    @router.post("/session")
    async def emergent_session(body: SessionBody, response: Response):
        """Exchange an Emergent OAuth session_id for our own JWT cookies.

        REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH.
        The redirect_url is computed on the frontend via window.location.origin.
        """
        if not body.session_id:
            raise HTTPException(status_code=400, detail="Missing session_id")
        try:
            async with httpx.AsyncClient(timeout=10) as cli:
                r = await cli.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": body.session_id})
        except Exception as e:
            logger.warning("emergent /session-data failed: %s", e)
            raise HTTPException(status_code=502, detail="Auth provider unreachable")
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        data = r.json() or {}
        email = (data.get("email") or "").lower().strip()
        google_id = data.get("id") or ""
        name = data.get("name") or ""
        picture = data.get("picture") or ""
        if not email:
            raise HTTPException(status_code=401, detail="Invalid session payload")

        db = db_getter()
        now = datetime.now(timezone.utc)
        user = await db.users.find_one({"email": email})
        if user is None:
            user = {
                "user_id": f"user_{uuid.uuid4().hex[:12]}",
                "email": email,
                "password_hash": None,
                "google_id": google_id,
                "name": name or email.split("@")[0],
                "picture": picture,
                "role": "user",
                "subscription_status": "trialing",
                "trial_ends_at": now + timedelta(days=TRIAL_DAYS),
                "favorites": [],
                "created_at": now,
            }
            await db.users.insert_one(user)
        else:
            update = {
                "google_id": google_id or user.get("google_id"),
                "name": user.get("name") or name,
                "picture": picture or user.get("picture"),
            }
            await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
            user.update(update)

        access = create_access_token(user["user_id"], email)
        refresh = create_refresh_token(user["user_id"])
        _set_auth_cookies(response, access, refresh)
        return _public_user(user)

    # -------------------- favorites (auth-only persistent storage) --------------------
    @router.get("/favorites")
    async def get_favorites(user: Dict[str, Any] = Depends(get_current_user)):
        return {"favorites": user.get("favorites") or []}

    @router.put("/favorites")
    async def set_favorites(
        body: FavoritesBody,
        user: Dict[str, Any] = Depends(get_current_user),
    ):
        db = db_getter()
        favs = list({f.upper().strip() for f in body.favorites if isinstance(f, str)})[:64]
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"favorites": favs}})
        return {"favorites": favs}

    # -------------------- password reset (minimal — logs link to console) --------------------
    @router.post("/forgot-password")
    async def forgot(body: ForgotBody):
        db = db_getter()
        user = await db.users.find_one({"email": body.email.lower()})
        if not user:
            # Don't leak whether the email exists.
            return {"ok": True}
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["user_id"],
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "used": False,
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("Password reset link for %s: token=%s", body.email, token)
        return {"ok": True}

    @router.post("/reset-password")
    async def reset(body: ResetBody):
        db = db_getter()
        doc = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
        if not doc:
            raise HTTPException(status_code=400, detail="Invalid or expired token")
        expires = doc.get("expires_at")
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires and expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invalid or expired token")
        await db.users.update_one(
            {"user_id": doc["user_id"]},
            {"$set": {"password_hash": hash_password(body.password)}},
        )
        await db.password_reset_tokens.update_one(
            {"_id": doc["_id"]}, {"$set": {"used": True}}
        )
        return {"ok": True}

    return router
