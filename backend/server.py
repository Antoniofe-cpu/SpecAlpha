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
from myfxbook_scraper import fetch_myfxbook_sentiment
from price_scraper import fetch_daily_closes, YAHOO_SYMBOL

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


async def _gemini_direct_call(system: str, user: str, api_key: Optional[str] = None, max_retries: int = 0) -> Optional[str]:
    """Call Google Gemini API directly via google-genai SDK.

    Returns the response text, or None on failure / when no API key is available.
    Serialises calls with a lock to avoid free-tier 429 rate limits.
    On 429 we fail fast and let the caller decide (rotate to next key / fallback).
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
                if attempt >= max_retries or is_429:
                    logger.warning("Gemini call failed (key=…%s): %s", key[-4:] if key else "?", msg)
                    return None
                await asyncio.sleep(2)
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
    # 1) Try the permanent AI insight cache (keyed on reportDate). If a macro
    #    insight already exists for THIS exact report, reuse it forever — only
    #    when a new COT report arrives (different reportDate) we regenerate.
    cached_macro = None
    if report_date:
        cached = await get_ai_insight("macro", asset_id, report_date, lang)
        if cached and isinstance(cached.get("text"), str):
            cached_macro = cached["text"]

    if cached_macro:
        snapshot["macro"] = cached_macro
        used_fallback = False
    else:
        macro_text, used_fallback = await generate_macro_insight(asset_id, snapshot, lang=lang)
        snapshot["macro"] = macro_text
        # Persist ALWAYS (even fallback text is better than re-generating on every request)
        # Real AI insights have fallback=False, deterministic fallbacks have fallback=True
        if report_date:
            await set_ai_insight("macro", asset_id, report_date, lang, {
                "text": macro_text,
                "fallback": used_fallback,
            })

    snapshot["fetchedAt"] = _now().isoformat()
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
# Sentiment Calculator (COT + MyFxBook + Yahoo Finance Prices)
# ---------------------------------------------------------------------------
@api.get("/sentiment/{asset_id}")
async def get_sentiment(asset_id: str) -> Dict[str, Any]:
    """Calculate market sentiment from COT + MyFxBook community sentiment.
    
    Returns sentiment score, interpretation, historical trend, and Yahoo Finance prices.
    """
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")
    
    # Get current COT snapshot
    cot_snap = await get_cached(asset_id)
    if cot_snap is None:
        cot_snap = await _fetch_snapshot(asset_id)
    
    # Calculate current sentiment from COT
    sentiment = calculate_sentiment_from_cot(cot_snap)
    
    # Try to get MyFxBook sentiment (overwrites long/short percentages if available)
    myfxbook_sentiment = await fetch_myfxbook_sentiment(asset_id)
    if myfxbook_sentiment:
        sentiment["longPercentage"] = myfxbook_sentiment["longPercentage"]
        sentiment["shortPercentage"] = myfxbook_sentiment["shortPercentage"]
        sentiment["source"] = "MyFxBook"
    else:
        sentiment["source"] = "COT Calculated"
    
    # Get historical data for sentiment trend
    history = await cot_history(asset_id, limit=12)
    sentiment_history = calculate_sentiment_history(history)
    
    # Get price history from Yahoo Finance (90 days)
    price_history = None
    if asset_id in YAHOO_SYMBOL:
        try:
            end_date = datetime.now(timezone.utc)
            start_date = end_date - timedelta(days=90)
            
            price_dict = await fetch_daily_closes(asset_id, start_date, end_date)
            
            # Convert to list format
            price_history = [
                {"date": date, "price": price}
                for date, price in sorted(price_dict.items())
            ]
        except Exception as e:
            logger.warning(f"Failed to fetch Yahoo Finance prices for {asset_id}: {e}")
    
    return {
        "assetId": asset_id,
        "assetName": ASSET_MAP[asset_id]["name"],
        "current": sentiment,
        "history": sentiment_history,
        "priceHistory": price_history,
        "reportDate": cot_snap.get("reportDate"),
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

    cache_key = f"{asset_id}__{lang}"
    if not refresh and report_date:
        # Permanent per-report cache (never expires)
        permanent = await get_ai_insight("macro_sent", asset_id, report_date, lang)
        if permanent:
            return permanent
    if not refresh:
        # Fallback: legacy short-TTL cache (for entries pre-permanent-cache)
        doc = await db[MACRO_COLL].find_one({"_id": cache_key}, {"_id": 0})
        if doc:
            fetched_at = datetime.fromisoformat(doc["fetchedAt"])
            if _now() - fetched_at < timedelta(hours=MACRO_TTL_HOURS):
                return doc["data"]

    events_all = await _get_calendar_events()
    relevant = filter_events_for_asset(events_all, asset_id)
    events_text = compact_events_text(relevant, limit=10)

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

    summary = await _llm_generate(system, prompt, f"macro-{asset_id}-{lang}", fallback)
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

    raw = await _llm_generate(system, context, f"verdict-{asset_id}-{lang}", fallback_json)
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
    Signal Accuracy Backtest — misura quanto il segnale COT della settimana A
    è stato rispettato dall'azione del prezzo nella settimana A+1 (lun-ven).

    Segnale rispettato (definizione chronological):
      - LONG rispettato se il giorno del MINIMO settimanale viene PRIMA del giorno
        del MASSIMO → il prezzo è salito dopo il minimo (direzione LONG confermata).
      - SHORT rispettato se il giorno del MASSIMO viene PRIMA del giorno del MINIMO
        → il prezzo è sceso dopo il massimo (direzione SHORT confermata).

    Due modalità di generazione segnale:
      - LTS (Long-Term & Short-Term): net > 0 AND delta > 0 → LONG;
        net < 0 AND delta < 0 → SHORT; altrimenti WAIT (skip).
      - ST (Short-Term): delta > 0 → LONG; delta < 0 → SHORT; delta = 0 → WAIT.

    Due finestre: ultime 52 settimane + tutto lo storico disponibile.
    Nessuna simulazione di entry/exit: metrica pura di qualità direzionale.
    """
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    hist = await cot_history(asset_id, limit=200)
    if not hist:
        return {
            "assetId": asset_id,
            "generatedAt": _now().isoformat(),
            "modes": {},
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

    def _signal_lts(row: Dict[str, Any]) -> str:
        net = row.get("netPosition", 0) or 0
        delta = row.get("wowDelta", 0) or 0
        if net > 0 and delta > 0:
            return "LONG"
        if net < 0 and delta < 0:
            return "SHORT"
        return "WAIT"

    def _signal_st(row: Dict[str, Any]) -> str:
        delta = row.get("wowDelta", 0) or 0
        if delta > 0:
            return "LONG"
        if delta < 0:
            return "SHORT"
        return "WAIT"

    def _confidence(row: Dict[str, Any]) -> int:
        net = row.get("netPosition", 0) or 0
        delta = row.get("wowDelta", 0) or 0
        lng = row.get("long", 0) or 1
        srt = row.get("short", 0) or 1
        total = lng + srt or 1
        mag = abs(net / total) * 2 + abs(delta / total) * 3
        if mag > 0.9:
            return 5
        if mag > 0.6:
            return 4
        if mag > 0.4:
            return 3
        if mag > 0.2:
            return 2
        return 1

    def _respected(signal: str, high_before_low: Optional[bool]) -> Optional[bool]:
        if signal not in ("LONG", "SHORT") or high_before_low is None:
            return None
        # LONG respected → low came first (high_before_low == False)
        # SHORT respected → high came first (high_before_low == True)
        return (not high_before_low) if signal == "LONG" else high_before_low

    history_out: List[Dict[str, Any]] = []
    for row in hist:
        rd = row.get("date")
        if not rd:
            continue
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

        s_lts = _signal_lts(row)
        s_st = _signal_st(row)
        conf = _confidence(row)
        resp_lts = _respected(s_lts, high_before_low)
        resp_st = _respected(s_st, high_before_low)

        history_out.append({
            "reportDate": rd,
            "weekStart": mon,
            "weekEnd": fri,
            "weekLow": round(week_low, 4) if week_low is not None else None,
            "weekHigh": round(week_high, 4) if week_high is not None else None,
            "weekRangePct": range_pct,
            "highBeforeLow": high_before_low,
            "signalLTS": s_lts,
            "signalST": s_st,
            "confidence": conf,
            "respectedLTS": resp_lts,
            "respectedST": resp_st,
            "netPosition": row.get("netPosition"),
            "wowDelta": row.get("wowDelta"),
        })

    # Oldest first for windowing
    history_out.sort(key=lambda h: h["reportDate"])

    def _metrics(rows: List[Dict[str, Any]], sig_key: str, resp_key: str) -> Dict[str, Any]:
        total_signals = respected = not_resp = skipped = pending = 0
        fav_moves: List[float] = []
        adv_moves: List[float] = []
        hc_total = hc_resp = 0
        for r in rows:
            sig = r.get(sig_key)
            rp = r.get(resp_key)
            if sig == "WAIT":
                skipped += 1
                continue
            if rp is None:
                pending += 1
                continue
            total_signals += 1
            rg = r.get("weekRangePct") or 0
            if rp:
                respected += 1
                if rg:
                    fav_moves.append(rg)
                if (r.get("confidence") or 0) >= 4:
                    hc_total += 1
                    hc_resp += 1
            else:
                not_resp += 1
                if rg:
                    adv_moves.append(rg)
                if (r.get("confidence") or 0) >= 4:
                    hc_total += 1
        accuracy = round(respected / total_signals * 100, 1) if total_signals > 0 else None
        avg_fav = round(sum(fav_moves) / len(fav_moves), 2) if fav_moves else None
        avg_adv = round(sum(adv_moves) / len(adv_moves), 2) if adv_moves else None
        hc_acc = round(hc_resp / hc_total * 100, 1) if hc_total > 0 else None
        return {
            "total": total_signals,
            "respected": respected,
            "notRespected": not_resp,
            "skipped": skipped,
            "pending": pending,
            "accuracy": accuracy,
            "avgFavorableRangePct": avg_fav,
            "avgAdverseRangePct": avg_adv,
            "highConfAccuracy": {
                "minConf": 4,
                "total": hc_total,
                "respected": hc_resp,
                "accuracy": hc_acc,
            },
        }

    window_12w = history_out[-12:]
    window_24w = history_out[-24:]
    modes = {
        "LTS": {
            "label": "LONG-TERM & SHORT-TERM",
            "description": "Segnale emesso solo quando Net Position e Δ WoW sono concordi in direzione.",
            "window12w": _metrics(window_12w, "signalLTS", "respectedLTS"),
            "window24w": _metrics(window_24w, "signalLTS", "respectedLTS"),
        },
        "ST": {
            "label": "SHORT-TERM",
            "description": "Segnale emesso solo in base alla direzione del Δ WoW (momentum settimanale puro).",
            "window12w": _metrics(window_12w, "signalST", "respectedST"),
            "window24w": _metrics(window_24w, "signalST", "respectedST"),
        },
    }

    # Newest first for UI display; cap at 60 rows
    history_display = list(reversed(history_out))[:60]

    return {
        "assetId": asset_id,
        "generatedAt": _now().isoformat(),
        "modes": modes,
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
    or missing, this triggers the scraper + AI insight generation in the
    background, leaving the system ready for the next visitor.
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


@app.on_event("shutdown")
async def on_shutdown() -> None:
    for task in (_refresh_task, _warm_task):
        if task:
            task.cancel()
    client.close()
