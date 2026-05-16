"""
Speculative Alpha — Institutional COT Dashboard backend.

Endpoints (all prefixed with /api):
  GET  /api/assets                         → list of available assets (core + expansion)
  GET  /api/cot/{asset_id}                 → latest COT snapshot + AI insight
  GET  /api/cot/{asset_id}/history?limit=N → historical series
  GET  /api/cot/bulk                       → snapshots for all assets (used for dashboard)
  POST /api/cot/refresh                    → invalidate cache and refetch
  GET  /api/health                         → readiness probe
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

from cot_scraper import (
    ASSET_MAP,
    fetch_cot_history,
    fetch_cot_latest,
)
from macro_scraper import (
    fetch_calendar_events,
    filter_events_for_asset,
    compact_events_text,
)
from price_scraper import (
    fetch_daily_closes,
    fetch_daily_ohlc,
    next_monday,
    following_friday,
    nearest_close_on_or_after,
    nearest_close_on_or_before,
    YAHOO_SYMBOL,
)
from options_scraper import get_options_analytics, OPTIONS_MAP
from sentiment_calculator import calculate_sentiment_from_cot, calculate_sentiment_history
from confluence_index import calculate_confluence_index
from historical_options import historical_options_signal as _hist_opt_signal

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

CACHE_TTL_HOURS = int(os.environ.get("COT_CACHE_TTL_HOURS", "6"))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
# Direct Google Gemini API key — used for self-hosted deployments (Render/Railway/etc.).
# When set, takes priority over EMERGENT_LLM_KEY (which only works inside Emergent).
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# Optional secondary key. When the primary key is rate-limited (free tier 15 RPM
# / 50 RPD) we transparently rotate to this one — effectively doubling the
# daily AI quota at zero cost.
GEMINI_API_KEY_2 = os.environ.get("GEMINI_API_KEY_2")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
# Alpha Vantage API key for options data
ALPHA_VANTAGE_API_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY")


_GEMINI_LOCK = asyncio.Lock()  # serialise Gemini calls (free tier = 15 RPM)


async def _gemini_direct_call(system: str, user: str, api_key: Optional[str] = None, max_retries: int = 2) -> Optional[str]:
    """Call Google Gemini API directly via google-genai SDK.

    Returns the response text, or None on failure / when no API key is available.
    Serialises calls with a lock to avoid free-tier 429 rate limits.
    On 429 we fail fast (rotate keys / fallback). On 503 (transient overload) we retry.
    """
    key = api_key or GEMINI_API_KEY
    if not key:
        return None
    try:
        from google import genai  # type: ignore
        from google.genai import types  # type: ignore
    except Exception as e:  # noqa: BLE001
        logger.warning("google-genai import failed: %s", e)
        return None

    def _sync_call() -> str:
        client_g = genai.Client(api_key=key)
        resp = client_g.models.generate_content(
            model=GEMINI_MODEL,
            contents=user,
            config=types.GenerateContentConfig(system_instruction=system),
        )
        return (getattr(resp, "text", "") or "").strip()

    async with _GEMINI_LOCK:
        attempt = 0
        while attempt <= max_retries:
            try:
                result = await asyncio.to_thread(_sync_call)
                # gentle pacing under free-tier 15 RPM (~4s between calls)
                await asyncio.sleep(4.5)
                return result
            except Exception as e:  # noqa: BLE001
                msg = str(e)[:200]
                is_429 = "429" in msg or "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower()
                is_503 = "503" in msg or "UNAVAILABLE" in msg or "overload" in msg.lower()
                if is_429 or attempt >= max_retries:
                    logger.warning("Gemini call failed (key=…%s): %s", key[-4:] if key else "?", msg)
                    return None
                # 503 → exponential backoff (Gemini "high demand")
                wait = 3 * (2 ** attempt) if is_503 else 2
                logger.info("Gemini transient error, retrying in %ss: %s", wait, msg[:80])
                await asyncio.sleep(wait)
                attempt += 1
        return None


async def _ai_text(system: str, user: str) -> Optional[str]:
    """Unified AI call: rotate Gemini key #1 → Gemini key #2 → None.

    Two Gemini keys = double the free-tier daily quota at zero cost.
    """
    # Try primary Gemini key
    if GEMINI_API_KEY:
        primary = await _gemini_direct_call(system, user, api_key=GEMINI_API_KEY)
        if primary:
            return primary
    # Rotate to secondary Gemini key
    if GEMINI_API_KEY_2:
        secondary = await _gemini_direct_call(system, user, api_key=GEMINI_API_KEY_2)
        if secondary:
            return secondary
    # No keys available
    return None

# ---------------------------------------------------------------------------
# AI Insight (Gemini via emergentintegrations)
# ---------------------------------------------------------------------------

def _macro_fallback_text(asset_id: str, snapshot: Dict[str, Any], lang: str = "it") -> str:
    """Deterministic Bloomberg-style fallback text used when AI cache is empty.

    Cheap, synchronous, no external calls. Served from the user request path.
    """
    delta = snapshot.get("wowDelta", 0) or 0
    net = snapshot.get("netPosition", 0) or 0
    sentiment = "Bullish Flow" if delta > 0 else "Bearish Flow"
    if lang == "en":
        if abs(delta) > 10000:
            action = "Strong Accumulation" if delta > 0 else "Strong Distribution"
        else:
            action = "Accumulation" if delta > 0 else "Distribution"
        return (
            f"Mood: {sentiment}. {action} Non-Commercial. "
            f"Net {net:+,} (Δ {delta:+,}). Watch price/positioning divergence."
        )
    if abs(delta) > 10000:
        action = "Forte Accumulo" if delta > 0 else "Forte Distribuzione"
    else:
        action = "Accumulo" if delta > 0 else "Distribuzione"
    return (
        f"Mood: {sentiment}. {action} Non-Commercial. "
        f"Net {net:+,} (Δ {delta:+,}). Watch divergenza prezzo/posizioni."
    )


async def generate_macro_insight(asset_id: str, snapshot: Dict[str, Any], lang: str = "it") -> Tuple[str, bool]:
    """Generate a short institutional-style macro insight using Gemini.

    Returns (text, used_fallback). When `used_fallback` is True the caller should
    avoid caching the result for the full TTL so we retry the AI on next access.
    """
    delta = snapshot.get("wowDelta", 0)
    net = snapshot.get("netPosition", 0)
    sentiment = "Bullish Flow" if delta > 0 else "Bearish Flow"
    if lang == "en":
        if abs(delta) > 10000:
            action = "Strong Accumulation" if delta > 0 else "Strong Distribution"
        else:
            action = "Accumulation" if delta > 0 else "Distribution"
        fallback = (
            f"Mood: {sentiment}. {action} Non-Commercial. "
            f"Net {net:+,} (Δ {delta:+,}). Watch price/positioning divergence."
        )
        system = (
            "You are a Senior Macro Strategist on an Institutional Bloomberg Desk. "
            "You analyse Non-Commercial COT (Commitment of Traders) flows and produce technical "
            "macro insights. Sharp, professional English. No intro, only synthetic analysis."
        )
        prompt_tpl = (
            f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
            f"Net Position: {net:+,}\n"
            f"WoW change: {delta:+,}\n"
            f"Long: {snapshot.get('long', 0):,} | Short: {snapshot.get('short', 0):,}\n"
            f"Open Interest Share: {snapshot.get('openInterestShare', 0)}%\n"
            f"Flow sentiment: {action} Non-Commercial.\n\n"
            "OUTPUT: 1-2 sentences (max 180 chars) in Bloomberg analyst-note style. "
            "Synthesise positioning, weekly momentum and trade implications. English only."
        )
    else:
        if abs(delta) > 10000:
            action = "Forte Accumulo" if delta > 0 else "Forte Distribuzione"
        else:
            action = "Accumulo" if delta > 0 else "Distribuzione"
        fallback = (
            f"Mood: {sentiment}. {action} Non-Commercial. "
            f"Net {net:+,} (Δ {delta:+,}). Watch divergenza prezzo/posizioni."
        )
        system = (
            "Sei un Senior Macro Strategist di un Institutional Desk Bloomberg. "
            "Analizzi flussi COT (Commitment of Traders) Non-Commercial e generi "
            "insight macro tecnici. Tono tagliente, professionale, italiano. "
            "Niente intro, solo analisi sintetica."
        )
        prompt_tpl = (
            f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
            f"Posizione Netta: {net:+,}\n"
            f"Variazione WoW: {delta:+,}\n"
            f"Long: {snapshot.get('long', 0):,} | Short: {snapshot.get('short', 0):,}\n"
            f"Open Interest Share: {snapshot.get('openInterestShare', 0)}%\n"
            f"Sentiment flussi: {action} Non-Commercial.\n\n"
            "OUTPUT: 1-2 frasi (max 180 caratteri) in stile Bloomberg analyst note. "
            "Sintetizza posizionamento, momentum settimanale e implicazioni operative. Solo italiano."
        )

    if not EMERGENT_LLM_KEY and not GEMINI_API_KEY:
        return fallback, True

    # Priority 1: Gemini dual-key rotation (works in any deployment)
    direct = await _ai_text(system, prompt_tpl)
    if direct:
        text = direct.strip().strip('"').strip("'")
        if len(text) > 10:
            return text[:240], False
        return fallback, True

    # Priority 2: Emergent LLM Key (works only inside Emergent platform)
    if not EMERGENT_LLM_KEY:
        return fallback, True

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"cot-{asset_id}-{lang}",
            system_message=system,
        ).with_model("gemini", "gemini-2.5-flash")

        msg = UserMessage(text=prompt_tpl)
        response = await chat.send_message(msg)
        text = (response or "").strip().strip('"').strip("'")
        if len(text) > 10:
            return text[:240], False
        return fallback, True
    except Exception as e:  # noqa: BLE001
        logger.warning("AI insight failed for %s: %s", asset_id, e)
        return fallback, True


# ---------------------------------------------------------------------------
# Cache helpers (MongoDB)
# ---------------------------------------------------------------------------

CACHE_COLL = "cot_cache"
HISTORY_COLL = "cot_history_cache"
MACRO_COLL = "macro_cache"
VERDICT_COLL = "verdict_cache"
VERDICT_HISTORY_COLL = "verdict_history"
CALENDAR_COLL = "calendar_cache"
OPTIONS_COLL = "options_cache"
# Permanent AI insight cache, keyed by (asset, reportDate, lang).
# Never expires: regenerated only when reportDate changes (i.e. a new COT report).
AI_INSIGHT_COLL = "ai_insight_cache"

MACRO_TTL_HOURS = 72    # macro summary updates every 3 days
VERDICT_TTL_HOURS = 24  # verdict updates daily
CALENDAR_TTL_HOURS = 6  # calendar scrape cached 6h


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---- Permanent per-report AI insight cache ----
async def get_ai_insight(kind: str, asset_id: str, report_date: str, lang: str) -> Optional[Dict[str, Any]]:
    """Look up a previously-generated AI artefact for this (kind, asset, reportDate, lang).
    Returns the saved data dict, or None if not present.
    """
    key = f"{kind}__{asset_id}__{report_date}__{lang}"
    doc = await db[AI_INSIGHT_COLL].find_one({"_id": key}, {"_id": 0})
    return doc["data"] if doc else None


async def set_ai_insight(kind: str, asset_id: str, report_date: str, lang: str, data: Any) -> None:
    """Store an AI artefact permanently (never expires) keyed on the report date."""
    key = f"{kind}__{asset_id}__{report_date}__{lang}"
    await db[AI_INSIGHT_COLL].update_one(
        {"_id": key},
        {"$set": {"data": data, "savedAt": _now().isoformat()}},
        upsert=True,
    )


# ---- Batch AI cache (ONE call covers ALL assets for the week) -----------
async def get_batch_ai_cache(report_date: str, lang: str) -> Optional[Dict[str, Any]]:
    """Return the batch dict {asset_id: {macro, verdict, summary, confidence}} or None."""
    if not report_date:
        return None
    key = f"batch__{report_date}__{lang}"
    doc = await db[AI_INSIGHT_COLL].find_one({"_id": key}, {"_id": 0})
    return doc.get("data") if doc else None


async def set_batch_ai_cache(report_date: str, lang: str, data: Dict[str, Any]) -> None:
    key = f"batch__{report_date}__{lang}"
    await db[AI_INSIGHT_COLL].update_one(
        {"_id": key},
        {"$set": {"data": data, "savedAt": _now().isoformat()}},
        upsert=True,
    )


async def get_cached(asset_id: str, lang: str = "it") -> Optional[Dict[str, Any]]:
    key = f"{asset_id}__{lang}"
    doc = await db[CACHE_COLL].find_one({"_id": key}, {"_id": 0})
    if not doc:
        return None
    fetched_at = datetime.fromisoformat(doc["fetchedAt"])
    if _now() - fetched_at > timedelta(hours=CACHE_TTL_HOURS):
        return None
    return doc["data"]


async def set_cached(asset_id: str, data: Dict[str, Any], lang: str = "it") -> None:
    key = f"{asset_id}__{lang}"
    await db[CACHE_COLL].update_one(
        {"_id": key},
        {"$set": {"data": data, "fetchedAt": _now().isoformat()}},
        upsert=True,
    )


async def get_cached_history(asset_id: str) -> Optional[List[Dict[str, Any]]]:
    doc = await db[HISTORY_COLL].find_one({"_id": asset_id}, {"_id": 0})
    if not doc:
        return None
    fetched_at = datetime.fromisoformat(doc["fetchedAt"])
    if _now() - fetched_at > timedelta(hours=CACHE_TTL_HOURS):
        return None
    return doc["data"]


async def set_cached_history(asset_id: str, data: List[Dict[str, Any]]) -> None:
    await db[HISTORY_COLL].update_one(
        {"_id": asset_id},
        {"$set": {"data": data, "fetchedAt": _now().isoformat()}},
        upsert=True,
    )


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class AssetMeta(BaseModel):
    assetId: str
    name: str
    type: str
    core: bool


class CotSnapshot(BaseModel):
    assetId: str
    name: str
    type: str
    long: int
    short: int
    changeLong: int
    changeShort: int
    netPosition: int
    wowDelta: int
    openInterest: int
    openInterestShare: float
    pctLong: float
    pctShort: float
    longPctChange: float
    shortPctChange: float
    intensityIndex: int
    reportDate: str
    macro: Optional[str] = None
    fetchedAt: Optional[str] = None
    # Retail traders (CFTC Commercials, renamed for UX)
    retailLong: Optional[int] = None
    retailShort: Optional[int] = None
    retailChangeLong: Optional[int] = None
    retailChangeShort: Optional[int] = None
    retailNetPosition: Optional[int] = None
    retailWowDelta: Optional[int] = None
    retailPctLong: Optional[float] = None
    retailPctShort: Optional[float] = None
    retailLongPctChange: Optional[float] = None
    retailShortPctChange: Optional[float] = None
    # Proprietary Confluence Index (0-100): strength of agreement across COT + Options + Sentiment
    confluenceIndex: Optional[float] = None
    confluenceComponents: Optional[Dict[str, Any]] = None
    confluenceLabel: Optional[str] = None
    confluenceDirection: Optional[str] = None


# ---------------------------------------------------------------------------
# FastAPI setup
# ---------------------------------------------------------------------------

app = FastAPI(title="Speculative Alpha COT API", version="1.0.0")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "time": _now().isoformat()}


@api.get("/assets", response_model=List[AssetMeta])
async def list_assets() -> List[AssetMeta]:
    return [
        AssetMeta(assetId=k, name=v["name"], type=v["type"], core=bool(v.get("core")))
        for k, v in ASSET_MAP.items()
    ]


async def _fetch_snapshot(asset_id: str, force: bool = False, lang: str = "it") -> Dict[str, Any]:
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail=f"Unknown asset {asset_id}")

    if not force:
        cached = await get_cached(asset_id, lang=lang)
        if cached:
            return cached

    raw = await fetch_cot_latest(asset_id)
    meta = ASSET_MAP[asset_id]
    snapshot: Dict[str, Any] = {
        "assetId": asset_id,
        "name": meta["name"],
        "type": meta["type"],
        **raw,
    }
    report_date = str(snapshot.get("reportDate") or "")
    # AI insight: ALWAYS serve from the BATCH cache (one call → all assets).
    # The real Gemini call happens once per week via _prewarm_ai_insights_batch.
    batch = await get_batch_ai_cache(report_date, lang)
    cached = (batch or {}).get(asset_id) if batch else None
    if cached and isinstance(cached.get("macro"), str):
        snapshot["macro"] = cached["macro"]
    else:
        snapshot["macro"] = _macro_fallback_text(asset_id, snapshot, lang=lang)

    snapshot["fetchedAt"] = _now().isoformat()
    # Compute the proprietary Confluence Index (uses COT + cached options if available)
    try:
        options_data = None
        if asset_id in OPTIONS_MAP:
            opt_doc = await db[OPTIONS_COLL].find_one({"_id": asset_id}, {"_id": 0})
            if opt_doc and "data" in opt_doc:
                options_data = opt_doc["data"]
        ci = calculate_confluence_index(snapshot, options_data)
        snapshot["confluenceIndex"] = ci["score"]
        snapshot["confluenceLabel"] = ci["label"]
        snapshot["confluenceDirection"] = ci["direction"]
        snapshot["confluenceComponents"] = ci["components"]
    except Exception as e:  # noqa: BLE001
        logger.warning("Confluence index computation failed for %s: %s", asset_id, e)
    # Always cache the scrape result (short TTL keeps page loads snappy);
    # the AI text inside is stable thanks to the permanent insight cache above.
    await set_cached(asset_id, snapshot, lang=lang)
    return snapshot


@api.get("/cot/bulk", response_model=List[CotSnapshot])
async def cot_bulk(
    scope: str = Query("core", description="core | all"),
    refresh: bool = Query(False),
    lang: str = Query("it"),
) -> List[CotSnapshot]:
    lang = "en" if lang == "en" else "it"
    asset_ids = [
        k for k, v in ASSET_MAP.items()
        if scope == "all" or v.get("core")
    ]
    sem = asyncio.Semaphore(2)

    async def runner(aid: str) -> Optional[Dict[str, Any]]:
        async with sem:
            try:
                return await _fetch_snapshot(aid, force=refresh, lang=lang)
            except Exception as e:  # noqa: BLE001
                logger.exception("snapshot failed %s: %s", aid, e)
                return None

    results = await asyncio.gather(*[runner(a) for a in asset_ids])
    return [CotSnapshot(**r) for r in results if r]


@api.get("/cot/{asset_id}", response_model=CotSnapshot)
async def cot_one(asset_id: str, refresh: bool = Query(False), lang: str = Query("it")) -> CotSnapshot:
    lang = "en" if lang == "en" else "it"
    data = await _fetch_snapshot(asset_id.upper(), force=refresh, lang=lang)
    return CotSnapshot(**data)


@api.get("/cot/{asset_id}/history")
async def cot_history(asset_id: str, limit: int = Query(60, ge=1, le=200), refresh: bool = Query(False)) -> List[Dict[str, Any]]:
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")
    if not refresh:
        cached = await get_cached_history(asset_id)
        if cached:
            return cached[:limit]
    data = await fetch_cot_history(asset_id, limit=200)

    # Override `price` field using Yahoo Finance daily closes (real market prices)
    if data and asset_id in YAHOO_SYMBOL:
        try:
            dates = [d["date"] for d in data if d.get("date")]
            if dates:
                min_d = datetime.strptime(min(dates), "%Y-%m-%d")
                max_d = datetime.strptime(max(dates), "%Y-%m-%d") + timedelta(days=1)
                closes = await fetch_daily_closes(asset_id, min_d - timedelta(days=3), max_d)
                if closes:
                    for row in data:
                        nearest = nearest_close_on_or_before(closes, row["date"], max_back_days=6)
                        if nearest:
                            row["price"] = round(nearest[1], 4)
        except Exception as e:  # noqa: BLE001
            logger.warning("yahoo price override failed for %s: %s", asset_id, e)

    await set_cached_history(asset_id, data)
    return data[:limit]


@app.post("/api/cot/refresh")
async def refresh_all() -> Dict[str, Any]:
    """Manual / cron-triggered refresh.

    Clears only the per-asset snapshot cache + per-asset macro/verdict caches
    (so the NEXT fetch produces fresh AI insight). Also wipes the permanent
    per-report AI insight cache so the next visit forces a clean regeneration.
    Does NOT touch cot_history (the accumulated weekly time-series).
    """
    await db[CACHE_COLL].delete_many({})
    await db[MACRO_COLL].delete_many({})
    await db[VERDICT_COLL].delete_many({})
    await db[CALENDAR_COLL].delete_many({})
    await db[AI_INSIGHT_COLL].delete_many({})
    return {"status": "cache cleared", "time": _now().isoformat()}


@app.post("/api/cron/warm")
@app.get("/api/cron/warm")
async def cron_warm() -> Dict[str, Any]:
    """Endpoint for external cron schedulers (e.g. cron-job.org) to keep
    the backend warm and ensure all core assets have fresh data ready.

    Triggers an asynchronous background pre-warm of every core asset's
    snapshot, so users always land on populated cards. Safe to call as
    often as every 10-15 minutes — uses internal TTL to avoid redundant
    work.
    """
    asyncio.create_task(_prewarm_all_assets(scope="all"))
    return {"status": "warm started", "time": _now().isoformat()}


@app.post("/api/cron/ai-prewarm")
async def cron_ai_prewarm(scope: str = Query("all"), lang: str = Query("it")) -> Dict[str, Any]:
    """Trigger the weekly AI insight prewarm in background.

    Runs Gemini once per (asset, reportDate, lang) and stores result forever.
    Subsequent user requests serve cached text with zero AI calls.
    Designed to be called manually after a new COT release (Friday/Saturday).
    """
    asyncio.create_task(_prewarm_ai_insights(scope=scope, lang=lang))
    return {"status": "ai prewarm started", "scope": scope, "lang": lang, "time": _now().isoformat()}


# ---------------------------------------------------------------------------
# Options & GEX (refreshed weekly, cached per (asset, expiry))
# ---------------------------------------------------------------------------
@api.get("/options/{asset_id}")
async def options_analytics(asset_id: str, refresh: bool = Query(False)) -> Dict[str, Any]:
    """Weekly options analytics: Max Pain, OI walls, GEX (indices/commodities)
    or Risk Reversal / Vol Skew (currencies, VIX, BTC).

    Cached weekly: result is keyed on the actual options expiry date — when a
    new weekly expiry rolls, the next call regenerates automatically. Safe to
    call any time; auto-refreshes when the cached expiry is in the past.
    """
    asset_id = asset_id.upper()
    if asset_id not in OPTIONS_MAP:
        raise HTTPException(status_code=404, detail=f"Options not supported for {asset_id}")

    cache_key = asset_id
    if not refresh:
        doc = await db[OPTIONS_COLL].find_one({"_id": cache_key}, {"_id": 0})
        if doc:
            data = doc.get("data") or {}
            expiry = data.get("expiry")
            if expiry:
                try:
                    exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
                    # If the cached expiry is still in the future, reuse it.
                    if exp_date >= _now().date():
                        return data
                except ValueError:
                    pass

    result = await _options_with_underlying(asset_id)
    if not result:
        raise HTTPException(status_code=503, detail="Options chain unavailable")

    await db[OPTIONS_COLL].update_one(
        {"_id": cache_key},
        {"$set": {"data": result, "fetchedAt": _now().isoformat()}},
        upsert=True,
    )
    return result


async def _options_with_underlying(asset_id: str) -> Optional[Dict[str, Any]]:
    """Wrapper that fetches the real underlying spot (futures `=F` or FX `=X`)
    and passes it to the options analytics so the UI can show recognisable
    prices (e.g. real S&P 500 / Gold / EUR/USD) next to the ETF-derived chain.
    """
    underlying_spot: Optional[float] = None
    if asset_id in YAHOO_SYMBOL:
        try:
            today = _now()
            ohlc = await fetch_daily_ohlc(asset_id, today - timedelta(days=7), today + timedelta(days=1))
            if ohlc:
                # Pick the most recent close
                latest_date = max(ohlc.keys())
                underlying_spot = ohlc[latest_date].get("close")
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to fetch underlying spot for %s: %s", asset_id, e)
    return await get_options_analytics(asset_id, underlying_spot=underlying_spot)




# ---------------------------------------------------------------------------
# Sentiment Calculator (COT-only — Non-Commercials = Institutional, Commercials = Retail)
# CONTRARIAN STRATEGY: Trade AGAINST retail (Commercials) positioning
# ---------------------------------------------------------------------------
@api.get("/sentiment/{asset_id}")
async def get_sentiment(asset_id: str) -> Dict[str, Any]:
    """Calculate market sentiment from CFTC COT data.

    SOURCE: CFTC Commitments of Traders (weekly, Friday close)
    - Non-Commercials → Institutional positioning (smart money)
    - Commercials → Retail positioning (the "crowd" we fade contrarian-style)

    CONTRARIAN LOGIC (on retail/Commercials):
    - retail long% >= 70 → Overextended → SELL signal
    - retail long% <= 30 → Capitulated → BUY signal
    """
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    # Load latest COT snapshot (cached or fresh)
    cot_snap = await get_cached(asset_id)
    if cot_snap is None:
        cot_snap = await _fetch_snapshot(asset_id)

    retail_long = cot_snap.get("retailLong", 0) or 0
    retail_short = cot_snap.get("retailShort", 0) or 0
    retail_total = retail_long + retail_short

    if retail_total > 0:
        long_pct = round((retail_long / retail_total) * 100, 1)
        short_pct = round(100.0 - long_pct, 1)
    else:
        long_pct = 50.0
        short_pct = 50.0

    # CROWD SCORE: aligned with retail (Commercials) positioning
    # 75% retail long → score +50 (Bullish crowd)
    # 25% retail long → score -50 (Bearish crowd)
    score = (long_pct - 50) * 2

    # Interpretation reflects the retail crowd positioning
    if score >= 70:
        interpretation = "Extremely Bullish"
        color = "#10b981"
    elif score >= 40:
        interpretation = "Bullish"
        color = "#34d399"
    elif score >= 10:
        interpretation = "Slightly Bullish"
        color = "#34d399"
    elif score > -10:
        interpretation = "Neutral"
        color = "#94a3b8"
    elif score > -40:
        interpretation = "Slightly Bearish"
        color = "#fb7185"
    elif score > -70:
        interpretation = "Bearish"
        color = "#f43f5e"
    else:
        interpretation = "Extremely Bearish"
        color = "#f43f5e"

    # Contrarian signal based on the same retail positioning
    if long_pct >= 70:
        signal, strength = "SELL", "Strong"
    elif long_pct >= 60:
        signal, strength = "SELL", "Weak"
    elif long_pct <= 30:
        signal, strength = "BUY", "Strong"
    elif long_pct <= 40:
        signal, strength = "BUY", "Weak"
    else:
        signal, strength = "NEUTRAL", "None"

    if long_pct >= 60:
        crowd_label = "Bullish Crowd"
    elif long_pct <= 40:
        crowd_label = "Bearish Crowd"
    else:
        crowd_label = "Mixed Crowd"

    current_sentiment = {
        "score": round(score, 2),
        "interpretation": interpretation,
        "color": color,
        "longPercentage": long_pct,
        "shortPercentage": short_pct,
        "crowdLabel": crowd_label,
        "source": "CFTC COT Commercials (Retail proxy)",
        "contrarian": {
            "signal": signal,
            "strength": strength,
            "logic": f"Retail {long_pct:.1f}% long → Contrarian {signal}",
        },
        # Institutional view for the dual-line chart
        "institutional": {
            "long": cot_snap.get("long", 0),
            "short": cot_snap.get("short", 0),
            "netPosition": cot_snap.get("netPosition", 0),
            "wowDelta": cot_snap.get("wowDelta", 0),
        },
    }

    # Historical sentiment trend (COT-based, weekly)
    try:
        history = await cot_history(asset_id, limit=24)
        sentiment_history = []
        for row in history:
            r_l = row.get("retailLong") or 0
            r_s = row.get("retailShort") or 0
            tot = r_l + r_s
            if tot > 0:
                lp = round((r_l / tot) * 100, 1)
            else:
                lp = 50.0
            sentiment_history.append({
                "date": row.get("date"),
                "score": round((lp - 50) * 2, 2),
                "retailLongPct": lp,
            })
    except Exception as e:
        logger.warning(f"Failed to fetch sentiment history for {asset_id}: {e}")
        sentiment_history = []

    # Price history from Yahoo Finance (90 days) for dual-line chart
    price_history = None
    if asset_id in YAHOO_SYMBOL:
        try:
            end_date = datetime.now(timezone.utc)
            start_date = end_date - timedelta(days=90)
            price_dict = await fetch_daily_closes(asset_id, start_date, end_date)
            price_history = [
                {"date": date, "price": price}
                for date, price in sorted(price_dict.items())
            ]
        except Exception as e:
            logger.warning(f"Failed to fetch Yahoo Finance prices for {asset_id}: {e}")

    return {
        "assetId": asset_id,
        "assetName": ASSET_MAP[asset_id]["name"],
        "current": current_sentiment,
        "history": sentiment_history,
        "priceHistory": price_history,
        "strategy": "contrarian",
        "contrarian_note": "Trade AGAINST retail (Commercials): >70% long = SELL, <30% long = BUY",
    }



# ---------------------------------------------------------------------------
# Macro Sentiment & Final Verdict endpoints
# ---------------------------------------------------------------------------

async def _get_calendar_events():
    doc = await db[CALENDAR_COLL].find_one({"_id": "events"}, {"_id": 0})
    if doc:
        fetched_at = datetime.fromisoformat(doc["fetchedAt"])
        if _now() - fetched_at < timedelta(hours=CALENDAR_TTL_HOURS):
            return doc["events"]
    events = await fetch_calendar_events()
    await db[CALENDAR_COLL].update_one(
        {"_id": "events"},
        {"$set": {"events": events, "fetchedAt": _now().isoformat()}},
        upsert=True,
    )
    return events


async def _llm_generate(system: str, user: str, session: str, fallback: str) -> str:
    if not EMERGENT_LLM_KEY and not GEMINI_API_KEY:
        return fallback

    # Priority 1: Gemini dual-key rotation (works in any deployment)
    direct = await _ai_text(system, user)
    if direct:
        return direct

    # Priority 2: Emergent LLM Key (only inside Emergent platform)
    if not EMERGENT_LLM_KEY:
        return fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY, session_id=session, system_message=system,
        ).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=user))
        text = (resp or "").strip()
        return text or fallback
    except Exception as e:  # noqa: BLE001
        logger.warning("llm_generate failed (%s): %s", session, e)
        return fallback


# ---------------------------------------------------------------------------
# BATCH AI generator — ONE Gemini call covers ALL assets for the week
# ---------------------------------------------------------------------------
async def generate_batch_insights(snapshots: List[Dict[str, Any]], lang: str) -> Optional[Dict[str, Any]]:
    """Generate macro insight + verdict for ALL assets in a SINGLE LLM call.

    Returns dict keyed by asset_id with shape:
        {asset_id: {macro: str, macroNote: str, verdict: "BUY"|"SELL"|"WAIT",
                    summary: str, confidence: int}}
    or None if the LLM call fails entirely.
    """
    if not snapshots:
        return {}

    # Fetch all macro events ONCE (shared across all assets in the prompt)
    events_all: List[Dict[str, Any]] = []
    try:
        events_all = await _get_calendar_events()
    except Exception as e:  # noqa: BLE001
        logger.warning("batch macro events fetch failed: %s", e)

    # Compact JSON-like dump that the LLM can reason about
    rows = []
    for s in snapshots:
        aid = s.get("assetId") or ""
        try:
            relevant = filter_events_for_asset(events_all, aid) if events_all else []
        except Exception:
            relevant = []
        ev_compact = []
        for ev in (relevant or [])[:6]:
            ev_compact.append({
                "date": ev.get("date"),
                "country": ev.get("country"),
                "title": ev.get("title") or ev.get("event"),
                "impact": ev.get("impact"),
                "actual": ev.get("actual"),
                "forecast": ev.get("forecast"),
            })
        rows.append({
            "id": aid,
            "name": s.get("name"),
            "ncNet": s.get("netPosition"),
            "ncWow": s.get("wowDelta"),
            "ncLong": s.get("long"),
            "ncShort": s.get("short"),
            "retailNet": s.get("retailNetPosition"),
            "retailLong": s.get("retailLong"),
            "retailShort": s.get("retailShort"),
            "ci": s.get("confluenceIndex"),
            "ciDir": s.get("confluenceDirection"),
            "ciLabel": s.get("confluenceLabel"),
            "intensity": s.get("intensityIndex"),
            "events": ev_compact,
        })

    if lang == "en":
        system = (
            "You are a Bloomberg-style senior institutional analyst writing for a "
            "professional COT-data publication. You analyse ALL the assets in the "
            "user message in a SINGLE response and return ONLY valid JSON. "
            "Each asset gets 4 fields:\n"
            "  (1) macroNote: 1-2 sentences in English citing 1-2 of the asset's "
            "macro events (tradingeconomics) and their bullish/bearish skew (~220 chars)\n"
            "  (2) verdict: BUY/SELL/WAIT\n"
            "  (3) summary: 2-3 lines (50-80 words) explaining the verdict from "
            "NC flow + retail divergence + Confluence Index\n"
            "  (4) confidence: 1..5\n"
            "Make each entry DIFFERENT and asset-specific. macroNote MUST reference "
            "the events array; summary MUST reference the COT/retail/CI numbers."
        )
        instr = (
            "Return ONLY this JSON shape (no markdown fences, no commentary):\n"
            "{\"<assetId>\": {\"macroNote\": \"...\", \"verdict\": \"BUY|SELL|WAIT\", "
            "\"summary\": \"...\", \"confidence\": 1-5}, ...}\n\n"
            "Asset data + events:\n" + json.dumps(rows, ensure_ascii=False)
        )
    else:
        system = (
            "Sei un analista istituzionale senior in stile Bloomberg, scrivi per una "
            "testata professionale sul COT report. Analizza TUTTI gli asset nel messaggio "
            "in UNA SOLA risposta e restituisci SOLO JSON valido. Per ogni asset 4 campi:\n"
            "  (1) macroNote: 1-2 frasi in italiano citando 1-2 eventi macro (tradingeconomics) "
            "dell'asset e il loro skew rialzista/ribassista (~220 char)\n"
            "  (2) verdict: BUY/SELL/WAIT\n"
            "  (3) summary: 2-3 righe (50-80 parole) che spiegano il verdetto basandosi su "
            "flusso NC + divergenza retail + Confluence Index\n"
            "  (4) confidence: 1..5\n"
            "Rendi ogni voce DIVERSA e specifica per l'asset. macroNote DEVE citare gli eventi "
            "del campo events; summary DEVE citare i numeri COT/retail/CI."
        )
        instr = (
            "Restituisci SOLO questo JSON (no markdown fences, no commenti):\n"
            "{\"<assetId>\": {\"macroNote\": \"...\", \"verdict\": \"BUY|SELL|WAIT\", "
            "\"summary\": \"...\", \"confidence\": 1-5}, ...}\n\n"
            "Dati asset + eventi:\n" + json.dumps(rows, ensure_ascii=False)
        )

    raw = await _llm_generate(system, instr, f"batch-{lang}", "")
    if not raw:
        return None

    # Strip optional ```json fences
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", cleaned, flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            return None
        # Sanitise: keep only known asset ids and required fields
        out: Dict[str, Any] = {}
        for aid, payload in data.items():
            if not isinstance(payload, dict):
                continue
            out[aid.upper()] = {
                "macro": str(payload.get("macro") or payload.get("macroNote") or "").strip(),
                "macroNote": str(payload.get("macroNote") or payload.get("macro") or "").strip(),
                "verdict": str(payload.get("verdict") or "WAIT").upper(),
                "summary": str(payload.get("summary") or "").strip(),
                "confidence": int(payload.get("confidence") or 3),
            }
        return out
    except Exception as e:  # noqa: BLE001
        logger.warning("batch parse failed: %s | raw[:200]=%s", e, cleaned[:200])
        return None


@api.get("/macro/{asset_id}")
async def macro_sentiment(asset_id: str, refresh: bool = Query(False), lang: str = Query("it")) -> Dict[str, Any]:
    asset_id = asset_id.upper()
    lang = "en" if lang == "en" else "it"
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    # Find the current report date for this asset (used as the permanent cache key)
    snap = await get_cached(asset_id, lang=lang)
    if snap is None:
        # Lazy-load to obtain reportDate
        snap = await _fetch_snapshot(asset_id, lang=lang)
    report_date = str((snap or {}).get("reportDate") or "")

    # Always fetch live macro events (these are independent from AI text)
    events_all = await _get_calendar_events()
    relevant = filter_events_for_asset(events_all, asset_id)
    events_text = compact_events_text(relevant, limit=10)
    events_payload = [
        {
            "date": ev.get("date"),
            "country": ev.get("country"),
            "title": ev.get("title") or ev.get("event"),
            "impact": ev.get("impact"),
            "actual": ev.get("actual"),
            "forecast": ev.get("forecast"),
            "previous": ev.get("previous"),
        }
        for ev in (relevant or [])[:10]
    ]

    cache_key = f"{asset_id}__{lang}"
    if not refresh and report_date:
        # Batch cache (ONE LLM call for ALL assets) — provides ONLY the macro note text
        batch = await get_batch_ai_cache(report_date, lang)
        if batch and asset_id in batch:
            entry = batch[asset_id]
            macro_text = entry.get("macroNote") or entry.get("macro") or ""
            if macro_text:
                return {
                    "summary": macro_text,
                    "eventCount": len(relevant),
                    "events": events_payload,
                    "fetchedAt": _now().isoformat(),
                    "source": "batch",
                    "usedFallback": False,
                }
        # Permanent per-report cache (legacy)
        permanent = await get_ai_insight("macro_sent", asset_id, report_date, lang)
        if permanent:
            # Inject live events into legacy cache too
            permanent["events"] = events_payload
            permanent["eventCount"] = len(relevant)
            return permanent
    if not refresh:
        # Fallback: legacy short-TTL cache (for entries pre-permanent-cache)
        doc = await db[MACRO_COLL].find_one({"_id": cache_key}, {"_id": 0})
        if doc:
            fetched_at = datetime.fromisoformat(doc["fetchedAt"])
            if _now() - fetched_at < timedelta(hours=MACRO_TTL_HOURS):
                data = doc["data"]
                data["events"] = events_payload
                data["eventCount"] = len(relevant)
                return data

    meta = ASSET_MAP[asset_id]
    if lang == "en":
        prompt = (
            f"Asset: {asset_id} ({meta['name']}). Type: {meta['type']}.\n\n"
            f"Macro events from tradingeconomics.com (last 7 days + upcoming):\n{events_text}\n\n"
            "TASK: Synthesise in English (2-3 sentences, max 260 chars) the macro state relevant "
            "for this asset. Cite key events. Indicate whether context is bullish, bearish, or mixed."
        )
        system = "You are a senior macro analyst. Sharp Bloomberg style. No intro, only analysis. English only."
        fallback = f"No relevant news in the weekly window. {len(relevant)} macro events tracked from tradingeconomics."
    else:
        prompt = (
            f"Asset: {asset_id} ({meta['name']}). Tipo: {meta['type']}.\n\n"
            f"Eventi macro da tradingeconomics.com (ultimi 7 giorni + prossimi):\n{events_text}\n\n"
            "TASK: Sintesi in italiano (2-3 frasi, max 260 caratteri) dello stato macroeconomico "
            "rilevante per questo asset. Cita eventi chiave. Indica se il contesto è bullish, bearish o misto."
        )
        system = "Sei un senior macro analyst. Stile Bloomberg tagliente. Niente intro, solo analisi. Solo italiano."
        fallback = f"Nessuna news rilevante nel range settimanale. {len(relevant)} eventi macro tracciati da tradingeconomics."

    summary: str
    # When refresh=False (regular user request), serve cache or deterministic fallback.
    # When refresh=True (background prewarm or explicit cache bust), allow Gemini call.
    if refresh:
        summary = await _llm_generate(system, prompt, f"macro-{asset_id}-{lang}", fallback)
    else:
        summary = fallback
    is_real_ai = bool(summary) and summary != fallback
    data = {
        "assetId": asset_id,
        "summary": summary[:280],
        "events": relevant[:8],
        "eventCount": len(relevant),
        "fetchedAt": _now().isoformat(),
    }
    await db[MACRO_COLL].update_one(
        {"_id": cache_key}, {"$set": {"data": data, "fetchedAt": _now().isoformat()}}, upsert=True,
    )
    # Persist permanently per (asset, reportDate, lang) ALWAYS (even fallback)
    if report_date:
        await set_ai_insight("macro_sent", asset_id, report_date, lang, data)
    return data


@api.get("/verdict/{asset_id}")
async def final_verdict(asset_id: str, refresh: bool = Query(False), lang: str = Query("it")) -> Dict[str, Any]:
    asset_id = asset_id.upper()
    lang = "en" if lang == "en" else "it"
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    # Establish current reportDate for permanent caching
    snap = await get_cached(asset_id, lang=lang)
    if snap is None:
        snap = await _fetch_snapshot(asset_id, lang=lang)
    report_date = str((snap or {}).get("reportDate") or "")

    cache_key = f"{asset_id}__{lang}"
    if not refresh and report_date:
        # Batch cache (ONE LLM call for ALL assets, cached for the whole week)
        batch = await get_batch_ai_cache(report_date, lang)
        if batch and asset_id in batch and batch[asset_id].get("summary"):
            entry = batch[asset_id]
            return {
                "verdict": entry.get("verdict", "WAIT"),
                "confidence": entry.get("confidence", 3),
                "summary": entry.get("summary"),
                "entryPrice": None,
                "entryReportDate": report_date,
                "priceChangePct": None,
                "generatedAt": _now().isoformat(),
                "source": "batch",
            }
        permanent = await get_ai_insight("verdict", asset_id, report_date, lang)
        if permanent:
            return permanent
    if not refresh:
        doc = await db[VERDICT_COLL].find_one({"_id": cache_key}, {"_id": 0})
        if doc:
            fetched_at = datetime.fromisoformat(doc["fetchedAt"])
            if _now() - fetched_at < timedelta(hours=VERDICT_TTL_HOURS):
                return doc["data"]

    cot_snap = await _fetch_snapshot(asset_id, lang=lang)
    macro = await macro_sentiment(asset_id, lang=lang)
    history = await cot_history(asset_id, limit=4)
    
    # Fetch options analytics if available
    options_data = None
    if asset_id in OPTIONS_MAP:
        try:
            options_data = await _options_with_underlying(asset_id)
        except Exception as e:
            logger.warning(f"Failed to fetch options for {asset_id}: {e}")
    
    # Calculate sentiment from COT data
    sentiment_data = calculate_sentiment_from_cot(cot_snap)
    
    price_change_pct = None
    latest_price = history[0].get("price") if history else None
    prev_price = history[1].get("price") if len(history) > 1 else None
    if latest_price and prev_price and prev_price != 0:
        price_change_pct = round(((latest_price - prev_price) / prev_price) * 100, 2)

    if lang == "en":
        # Build options context if available
        options_context = ""
        if options_data and options_data.get("kind") == "full":
            max_pain = options_data.get("maxPain")
            spot = options_data.get("underlyingSpot") or options_data.get("spot")
            net_gex = options_data.get("netGex", 0)
            regime = options_data.get("regime", "neutral")
            call_wall = options_data.get("callWall")
            put_wall = options_data.get("putWall")
            flip_strike = options_data.get("flipStrike")
            
            regime_desc = "dealers long gamma (suppressing vol)" if regime == "long_gamma" else \
                         "dealers short gamma (amplifying moves)" if regime == "short_gamma" else "neutral"
            
            options_context = (
                f"Options: Spot {spot}, Max Pain {max_pain}, "
                f"Call Wall {call_wall}, Put Wall {put_wall}, "
                f"Net GEX ${net_gex/1e6:.1f}M ({regime_desc})"
            )
            if flip_strike:
                options_context += f", Gamma Flip {flip_strike}"
            options_context += ". "
        
        sentiment_context = (
            f"Sentiment: {sentiment_data['interpretation']} "
            f"(score {sentiment_data['score']}, {sentiment_data['longPercentage']}% long / "
            f"{sentiment_data['shortPercentage']}% short). "
        )
        
        context = (
            f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
            f"COT Non-Commercial: Net {cot_snap['netPosition']:+,}, Δ WoW {cot_snap['wowDelta']:+,}, "
            f"Long {cot_snap['long']:,}, Short {cot_snap['short']:,}.\n"
            f"COT macro insight: {cot_snap.get('macro', '')}\n"
            f"{sentiment_context}\n"
            f"{options_context}\n" if options_context else ""
            f"Weekly macro sentiment: {macro['summary']}\n"
            f"Last price: {latest_price or '—'} · WoW change: "
            f"{(str(price_change_pct) + '%') if price_change_pct is not None else 'N/A'}.\n\n"
            "TASK: Return ONLY JSON with this structure: "
            '{"verdict":"LONG|SHORT|WAIT","confidence":1-5,"summary":"..."}. '
            "Synthetic operational verdict considering (1) institutional COT positioning, "
            "(2) market sentiment, (3) options levels & GEX regime if available, "
            "(4) macro context, (5) price action. Summary max 200 chars in English."
        )
        system = "You are a senior portfolio manager. Reply only with valid JSON, no extra commentary. English only."
        fallback_json = '{"verdict":"WAIT","confidence":2,"summary":"Insufficient data for a solid verdict."}'
    else:
        # Build options context if available (Italian)
        options_context = ""
        if options_data and options_data.get("kind") == "full":
            max_pain = options_data.get("maxPain")
            spot = options_data.get("underlyingSpot") or options_data.get("spot")
            net_gex = options_data.get("netGex", 0)
            regime = options_data.get("regime", "neutral")
            call_wall = options_data.get("callWall")
            put_wall = options_data.get("putWall")
            flip_strike = options_data.get("flipStrike")
            
            regime_desc = "dealer long gamma (vol compressa)" if regime == "long_gamma" else \
                         "dealer short gamma (vol amplificata)" if regime == "short_gamma" else "neutrale"
            
            options_context = (
                f"Opzioni: Spot {spot}, Max Pain {max_pain}, "
                f"Call Wall {call_wall}, Put Wall {put_wall}, "
                f"Net GEX ${net_gex/1e6:.1f}M ({regime_desc})"
            )
            if flip_strike:
                options_context += f", Gamma Flip {flip_strike}"
            options_context += ". "
        
        sentiment_context = (
            f"Sentiment: {sentiment_data['interpretation']} "
            f"(score {sentiment_data['score']}, {sentiment_data['longPercentage']}% long / "
            f"{sentiment_data['shortPercentage']}% short). "
        )
        
        context = (
            f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
            f"COT Non-Commercial: Net {cot_snap['netPosition']:+,}, Δ WoW {cot_snap['wowDelta']:+,}, "
            f"Long {cot_snap['long']:,}, Short {cot_snap['short']:,}.\n"
            f"COT Macro insight: {cot_snap.get('macro', '')}\n"
            f"{sentiment_context}\n"
            f"{options_context}\n" if options_context else ""
            f"Macro sentiment settimanale: {macro['summary']}\n"
            f"Prezzo ultimo: {latest_price or '—'} · Variazione WoW: "
            f"{(str(price_change_pct) + '%') if price_change_pct is not None else 'N/A'}.\n\n"
            "TASK: Restituisci SOLO JSON con questa struttura: "
            '{"verdict":"LONG|SHORT|WAIT","confidence":1-5,"summary":"..."}. '
            "Verdetto operazionale sintetico considerando (1) posizionamento istituzionale COT, "
            "(2) sentiment di mercato, (3) livelli opzioni e regime GEX se disponibili, "
            "(4) contesto macro, (5) andamento prezzo. Summary max 200 caratteri in italiano."
        )
        system = "Sei un senior portfolio manager. Risponde solo in JSON valido, nessun commento extra. Solo italiano."
        fallback_json = '{"verdict":"WAIT","confidence":2,"summary":"Dati insufficienti per un verdetto solido."}'

    raw: str
    # When refresh=False, serve cache or deterministic fallback (no AI call)
    if refresh:
        raw = await _llm_generate(system, context, f"verdict-{asset_id}-{lang}", fallback_json)
    else:
        raw = fallback_json
    is_real_ai = bool(raw) and raw != fallback_json
    import json as _json
    parsed = None
    try:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = _json.loads(m.group(0)) if m else None
    except Exception:
        parsed = None
    if not parsed:
        parsed = {"verdict": "WAIT", "confidence": 2, "summary": raw[:180]}

    verdict = str(parsed.get("verdict", "WAIT")).upper()
    if verdict not in ("LONG", "SHORT", "WAIT"):
        verdict = "WAIT"
    confidence = int(parsed.get("confidence", 2) or 2)
    confidence = max(1, min(5, confidence))
    summary = str(parsed.get("summary", ""))[:240]

    data = {
        "assetId": asset_id,
        "verdict": verdict,
        "confidence": confidence,
        "summary": summary,
        "entryPrice": latest_price,
        "entryReportDate": history[0].get("date") if history else None,
        "priceChangePct": price_change_pct,
        "generatedAt": _now().isoformat(),
    }
    await db[VERDICT_COLL].update_one(
        {"_id": cache_key}, {"$set": {"data": data, "fetchedAt": _now().isoformat()}}, upsert=True,
    )
    # Append to immutable verdict history for later P/L tracking
    await db[VERDICT_HISTORY_COLL].insert_one({**data, "savedAt": _now().isoformat()})
    # Persist permanently per (asset, reportDate, lang) ALWAYS (even fallback)
    if report_date:
        await set_ai_insight("verdict", asset_id, report_date, lang, data)
    return data


@api.get("/verdict/{asset_id}/performance")
async def verdict_performance(asset_id: str) -> Dict[str, Any]:
    """
    Confluence Index Track Record — replaces the old Signal Accuracy backtest.

    For every historical COT week we re-compute the Confluence Index
    (using COT NET + Sentiment-via-Retail-NET; the Options component is
    not historical and is mocked to neutral=0). We bucket weeks by index
    band and direction, then measure how often the implied direction was
    confirmed by Yahoo OHLC in the following Monday→Friday window.

    Definition of "respected":
      - direction LONG  respected when intra-week LOW comes BEFORE the HIGH
      - direction SHORT respected when intra-week HIGH comes BEFORE the LOW

    Buckets exposed to the UI:
      - Confidence Band: HIGH (CI ≥ 60), MEDIUM (40-60), LOW (<40)
      - Window: 24-week and 52-week

    Disclaimer: this is a directional quality metric (not a P/L backtest).
    It tells you whether the Confluence Index direction has historically
    been confirmed by the next week's price action.
    """
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    hist = await cot_history(asset_id, limit=200)
    if not hist:
        return {
            "assetId": asset_id,
            "generatedAt": _now().isoformat(),
            "bands": {},
            "history": [],
        }

    ohlc: Dict[str, Dict[str, float]] = {}
    if asset_id in YAHOO_SYMBOL:
        dates = [h.get("date") for h in hist if h.get("date")]
        if dates:
            min_d = datetime.strptime(min(dates), "%Y-%m-%d")
            max_d = datetime.strptime(max(dates), "%Y-%m-%d") + timedelta(days=14)
            ohlc = await fetch_daily_ohlc(asset_id, min_d - timedelta(days=3), max_d)

    def _week_days(start_iso: str, end_iso: str):
        try:
            sd = datetime.strptime(start_iso, "%Y-%m-%d").date()
            ed = datetime.strptime(end_iso, "%Y-%m-%d").date()
        except Exception:
            return []
        out = []
        cur = sd
        while cur <= ed:
            key = cur.isoformat()
            r = ohlc.get(key)
            if r and r.get("high") is not None and r.get("low") is not None:
                out.append((key, float(r["high"]), float(r["low"])))
            cur = cur + timedelta(days=1)
        return out

    def _respected(direction: str, high_before_low: Optional[bool]) -> Optional[bool]:
        if direction not in ("long", "short") or high_before_low is None:
            return None
        return (not high_before_low) if direction == "long" else high_before_low

    history_out: List[Dict[str, Any]] = []
    for row in hist:
        rd = row.get("date")
        if not rd:
            continue
        # Compute Confluence Index for THIS historical week
        # Options proxy via volatility index (VIX/GVZ/OVX) when available.
        opt_sig = _hist_opt_signal(asset_id, rd)
        opt_data = None
        if opt_sig is not None:
            # Inject a synthetic options blob whose calculate_confluence_index sees
            # the signed signal directly via netGex sign + a complementary PCR proxy.
            # We pass the raw signed score through pcr because that's where the
            # primary weight (60%) of the options component sits.
            # `options_direction` then ≈ 0.6 * pcr_signal + 0.4 * gex_signal.
            # Map -1..+1 to a PCR-equivalent: pcr = 1 - (signed/1.2)
            pcr_proxy = max(0.1, 1.0 - opt_sig / 1.2)
            gex_proxy = opt_sig * 1e9
            opt_data = {"putCallRatioOI": pcr_proxy, "netGex": gex_proxy}

        ci = calculate_confluence_index(row, options_data=opt_data)
        score = ci["score"]
        direction = ci["direction"]
        comp = ci.get("components", {})

        mon = next_monday(rd)
        fri = following_friday(mon)
        week = _week_days(mon, fri)

        week_low = week_high = None
        high_before_low: Optional[bool] = None
        range_pct: Optional[float] = None

        if len(week) >= 2:
            min_idx = min(range(len(week)), key=lambda i: week[i][2])
            max_idx = max(range(len(week)), key=lambda i: week[i][1])
            if min_idx != max_idx:
                week_low = week[min_idx][2]
                week_high = week[max_idx][1]
                high_before_low = max_idx < min_idx
                if week_low > 0:
                    range_pct = round((week_high - week_low) / week_low * 100, 3)

        respected = _respected(direction, high_before_low)
        history_out.append({
            "reportDate": rd,
            "weekStart": mon,
            "weekEnd": fri,
            "weekLow": round(week_low, 4) if week_low is not None else None,
            "weekHigh": round(week_high, 4) if week_high is not None else None,
            "weekRangePct": range_pct,
            "highBeforeLow": high_before_low,
            "confluenceIndex": score,
            "direction": direction,
            "componentCot": comp.get("cot"),
            "componentSentiment": comp.get("sentiment"),
            "respected": respected,
        })

    # Oldest first for windowing
    history_out.sort(key=lambda h: h["reportDate"])

    def _metrics(rows: List[Dict[str, Any]], min_score: float = 0.0) -> Dict[str, Any]:
        total_signals = respected_n = not_resp = skipped = pending = 0
        fav_moves: List[float] = []
        adv_moves: List[float] = []
        for r in rows:
            if (r.get("confluenceIndex") or 0) < min_score:
                continue
            if r.get("direction") == "neutral":
                skipped += 1
                continue
            rp = r.get("respected")
            if rp is None:
                pending += 1
                continue
            total_signals += 1
            rg = r.get("weekRangePct") or 0
            if rp:
                respected_n += 1
                if rg:
                    fav_moves.append(rg)
            else:
                not_resp += 1
                if rg:
                    adv_moves.append(rg)
        accuracy = round(respected_n / total_signals * 100, 1) if total_signals > 0 else None
        return {
            "total": total_signals,
            "respected": respected_n,
            "notRespected": not_resp,
            "skipped": skipped,
            "pending": pending,
            "accuracy": accuracy,
            "avgFavorableRangePct": round(sum(fav_moves) / len(fav_moves), 2) if fav_moves else None,
            "avgAdverseRangePct": round(sum(adv_moves) / len(adv_moves), 2) if adv_moves else None,
        }

    window_24w = history_out[-24:]
    window_52w = history_out[-52:]
    bands = {
        "ALL": {
            "label": "All Signals",
            "description": "Tutti i segnali (CI ≥ 0) escluso direction=neutral.",
            "window24w": _metrics(window_24w, 0.0),
            "window52w": _metrics(window_52w, 0.0),
        },
        "HIGH": {
            "label": "High Confluence (≥60)",
            "description": "Solo le settimane in cui il Confluence Index era ≥ 60 (concordanza alta).",
            "window24w": _metrics(window_24w, 60.0),
            "window52w": _metrics(window_52w, 60.0),
        },
        "VERY_HIGH": {
            "label": "Very High (≥80)",
            "description": "Solo le settimane in cui il Confluence Index era ≥ 80 (concordanza estrema).",
            "window24w": _metrics(window_24w, 80.0),
            "window52w": _metrics(window_52w, 80.0),
        },
    }

    # Newest first for UI display; cap at 60 rows
    history_display = list(reversed(history_out))[:60]

    return {
        "assetId": asset_id,
        "generatedAt": _now().isoformat(),
        "bands": bands,
        "history": history_display,
    }


def _synthetic_verdict(snapshot: Dict[str, Any]) -> Dict[str, Any]:
    """Deterministic rule-based verdict from COT metrics, NO LLM.
    Trade only when short-term (Δ WoW) and long-term (Net Position) bias agree;
    otherwise WAIT (no trade).
    """
    net = snapshot.get("netPosition", 0)
    delta = snapshot.get("wowDelta", 0)
    long = snapshot.get("long", 0) or 1
    short = snapshot.get("short", 0) or 1
    total = long + short or 1
    net_ratio = net / total
    delta_ratio = delta / total

    conf = 1
    mag = abs(net_ratio) * 2 + abs(delta_ratio) * 3
    if mag > 0.2: conf = 2
    if mag > 0.4: conf = 3
    if mag > 0.6: conf = 4
    if mag > 0.9: conf = 5

    # Only fire LONG/SHORT when short-term and long-term bias are concordant
    if net > 0 and delta > 0:
        verdict = "LONG"
    elif net < 0 and delta < 0:
        verdict = "SHORT"
    else:
        verdict = "WAIT"
    return {"verdict": verdict, "confidence": conf}


async def _backfill_verdicts(asset_id: str, depth: int = 20) -> None:
    """Create rule-based synthetic verdicts for the last N COT reports.
    Always re-generates synthetic entries so verdict logic changes propagate.
    Real (non-synthetic) verdicts from the LLM are preserved.
    """
    # Wipe synthetic entries for this asset so we can regenerate them
    await db[VERDICT_HISTORY_COLL].delete_many({"assetId": asset_id, "synthetic": True})
    existing = await db[VERDICT_HISTORY_COLL].distinct("entryReportDate", {"assetId": asset_id})
    existing_set = set(existing)
    hist = await cot_history(asset_id, limit=depth)
    to_insert = []
    for row in hist:
        rd = row.get("date")
        if not rd or rd in existing_set:
            continue
        syn = _synthetic_verdict(row)
        to_insert.append({
            "assetId": asset_id,
            "verdict": syn["verdict"],
            "confidence": syn["confidence"],
            "summary": f"Synthetic · Net {row.get('netPosition', 0):+,} · Δ {row.get('wowDelta', 0):+,}",
            "entryPrice": row.get("price"),
            "entryReportDate": rd,
            "priceChangePct": None,
            "generatedAt": _now().isoformat(),
            "savedAt": _now().isoformat(),
            "synthetic": True,
        })
    if to_insert:
        await db[VERDICT_HISTORY_COLL].insert_many(to_insert)


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Saturday refresh background task
# ---------------------------------------------------------------------------

_refresh_task: Optional[asyncio.Task] = None
_warm_task: Optional[asyncio.Task] = None


async def _prewarm_all_assets(scope: str = "core") -> None:
    """Pre-fetch snapshots for all (or core) assets so the cache is populated.

    Uses normal TTL: if an asset's cache is fresh it's a no-op. If stale
    or missing, this triggers the scraper in the background. AI generation
    is intentionally separate (see _prewarm_ai_insights) so user requests
    never pay the AI latency.
    """
    asset_ids = list(ASSET_MAP.keys())
    if scope == "core":
        asset_ids = [k for k, v in ASSET_MAP.items() if v.get("core")]
    logger.info("Pre-warm started for %d assets (scope=%s)", len(asset_ids), scope)
    for aid in asset_ids:
        try:
            await _fetch_snapshot(aid, lang="it")
            await asyncio.sleep(0.5)  # gentle pacing to avoid rate limits
        except Exception as e:  # noqa: BLE001
            logger.warning("pre-warm failed for %s: %s", aid, e)
    logger.info("Pre-warm completed (%d assets)", len(asset_ids))


async def _prewarm_ai_insights(scope: str = "all", lang: str = "it") -> None:
    """ONE Gemini call covers ALL assets for the entire week.

    Strategy:
      1. Fetch every asset snapshot (so we know the reportDate + numbers).
      2. Build ONE batched prompt with all assets, send a SINGLE LLM call.
      3. Parse the JSON response and persist to `batch_ai_cache`
         keyed by (reportDate, lang). Permanent until next COT release.

    This replaces the per-asset prewarm loop that previously cost up to
    18 × 3 = 54 calls. With this strategy we burn at most 1 credit per
    week per language. Subsequent user requests are 100% cache-served.
    """
    if not (GEMINI_API_KEY or EMERGENT_LLM_KEY):
        logger.info("AI batch prewarm skipped — no API key configured")
        return

    asset_ids = list(ASSET_MAP.keys())
    if scope == "core":
        asset_ids = [k for k, v in ASSET_MAP.items() if v.get("core")]

    snapshots: List[Dict[str, Any]] = []
    report_date = ""
    for aid in asset_ids:
        try:
            snap = await get_cached(aid, lang=lang)
            if snap is None:
                snap = await _fetch_snapshot(aid, lang=lang)
            if not snap:
                continue
            snapshots.append(snap)
            if not report_date:
                report_date = str(snap.get("reportDate") or "")
        except Exception as e:  # noqa: BLE001
            logger.warning("Skipping %s during batch prewarm: %s", aid, e)

    if not snapshots or not report_date:
        logger.warning("AI batch prewarm: no snapshots / report_date — abort")
        return

    # Skip if already cached for this (reportDate, lang)
    existing = await get_batch_ai_cache(report_date, lang)
    if existing and not all(
        (existing.get(aid, {}) or {}).get("summary") in (None, "") for aid in [s.get("assetId") for s in snapshots]
    ):
        logger.info("AI batch already cached for report=%s lang=%s — skip", report_date, lang)
        return

    logger.info("AI batch prewarm: 1 LLM call for %d assets (report=%s, lang=%s)", len(snapshots), report_date, lang)
    batch = await generate_batch_insights(snapshots, lang)
    if not batch:
        logger.warning("AI batch prewarm: LLM call failed, keeping deterministic fallbacks")
        return

    await set_batch_ai_cache(report_date, lang, batch)
    logger.info("AI batch prewarm completed: %d assets cached", len(batch))


async def _prewarm_options() -> None:
    """Pre-fetch options analytics for every supported asset. Cached weekly."""
    logger.info("Options pre-warm started for %d assets", len(OPTIONS_MAP))
    for aid in OPTIONS_MAP:
        try:
            doc = await db[OPTIONS_COLL].find_one({"_id": aid}, {"_id": 0})
            stale = True
            if doc:
                expiry = (doc.get("data") or {}).get("expiry")
                if expiry:
                    try:
                        if datetime.strptime(expiry, "%Y-%m-%d").date() >= _now().date():
                            stale = False
                    except ValueError:
                        pass
            if stale:
                result = await _options_with_underlying(aid)
                if result:
                    await db[OPTIONS_COLL].update_one(
                        {"_id": aid},
                        {"$set": {"data": result, "fetchedAt": _now().isoformat()}},
                        upsert=True,
                    )
            await asyncio.sleep(0.8)
        except Exception as e:  # noqa: BLE001
            logger.warning("options pre-warm failed for %s: %s", aid, e)
    logger.info("Options pre-warm completed")


async def _saturday_refresh_loop() -> None:
    """Every Saturday at 22:00 UTC clear caches AND pre-warm so users on
    Sunday morning find fresh data already loaded."""
    while True:
        try:
            now = _now()
            # Compute next Saturday 22:00 UTC
            days_ahead = (5 - now.weekday()) % 7  # Monday=0, Saturday=5
            target = (now + timedelta(days=days_ahead)).replace(hour=22, minute=0, second=0, microsecond=0)
            if target <= now:
                target += timedelta(days=7)
            wait_seconds = (target - now).total_seconds()
            logger.info("Next COT cache refresh in %.1f hours (%s)", wait_seconds / 3600, target.isoformat())
            await asyncio.sleep(wait_seconds)
            logger.info("Saturday refresh: clearing snapshot caches & re-warming")
            await db[CACHE_COLL].delete_many({})
            await db[MACRO_COLL].delete_many({})
            await db[VERDICT_COLL].delete_many({})
            await db[OPTIONS_COLL].delete_many({})
            # Pre-warm so next visitor gets data instantly
            await _prewarm_all_assets(scope="all")
            await _prewarm_options()
            # AI insights: one-time weekly batched calls (1 LLM call per language).
            # Total cost: 2 credits per week for full IT + EN coverage.
            await _prewarm_ai_insights(scope="all", lang="it")
            await _prewarm_ai_insights(scope="all", lang="en")
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("Saturday refresh loop error: %s", e)
            await asyncio.sleep(3600)


@app.on_event("startup")
async def on_startup() -> None:
    global _refresh_task, _warm_task
    _refresh_task = asyncio.create_task(_saturday_refresh_loop())
    # Initial pre-warm on startup so the very first visit (e.g. after a
    # cold-start on Render free tier) finds populated data within ~1 min.
    _warm_task = asyncio.create_task(_prewarm_all_assets(scope="core"))
    # Options pre-warm runs in its own task — Yahoo throttling can be slow.
    asyncio.create_task(_prewarm_options())
    # AI insight prewarm runs in its own task — calls Gemini ONCE (batched)
    # for all assets, then never again until next COT report. Keeps user
    # requests AI-free.
    asyncio.create_task(_prewarm_ai_insights(scope="all", lang="it"))
    asyncio.create_task(_prewarm_ai_insights(scope="all", lang="en"))


@app.on_event("shutdown")
async def on_shutdown() -> None:
    for task in (_refresh_task, _warm_task):
        if task:
            task.cancel()
    client.close()
