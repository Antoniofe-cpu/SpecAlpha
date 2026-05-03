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
from typing import List, Optional, Dict, Any

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
    next_monday,
    following_friday,
    nearest_close_on_or_after,
    nearest_close_on_or_before,
    YAHOO_SYMBOL,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("server")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

CACHE_TTL_HOURS = int(os.environ.get("COT_CACHE_TTL_HOURS", "6"))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ---------------------------------------------------------------------------
# AI Insight (Gemini via emergentintegrations)
# ---------------------------------------------------------------------------

async def generate_macro_insight(asset_id: str, snapshot: Dict[str, Any]) -> str:
    """Generate a short institutional-style macro insight using Gemini."""
    delta = snapshot.get("wowDelta", 0)
    net = snapshot.get("netPosition", 0)
    sentiment = "Bullish Flow" if delta > 0 else "Bearish Flow"
    if abs(delta) > 10000:
        action = "Forte Accumulo" if delta > 0 else "Forte Distribuzione"
    else:
        action = "Accumulo" if delta > 0 else "Distribuzione"

    fallback = (
        f"Mood: {sentiment}. {action} Non-Commercial. "
        f"Net {net:+,} (Δ {delta:+,}). Watch divergenza prezzo/posizioni."
    )

    if not EMERGENT_LLM_KEY:
        return fallback

    try:
        # Lazy import so backend still works if package unavailable
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"cot-{asset_id}",
            system_message=(
                "Sei un Senior Macro Strategist di un Institutional Desk Bloomberg. "
                "Analizzi flussi COT (Commitment of Traders) Non-Commercial e generi "
                "insight macro tecnici. Tono tagliente, professionale, italiano. "
                "Niente intro, solo analisi sintetica."
            ),
        ).with_model("gemini", "gemini-2.5-flash")

        prompt = (
            f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
            f"Posizione Netta: {net:+,}\n"
            f"Variazione WoW: {delta:+,}\n"
            f"Long: {snapshot.get('long', 0):,} | Short: {snapshot.get('short', 0):,}\n"
            f"Open Interest Share: {snapshot.get('openInterestShare', 0)}%\n"
            f"Sentiment flussi: {action} Non-Commercial.\n\n"
            "OUTPUT: 1-2 frasi (max 180 caratteri) in stile Bloomberg analyst note. "
            "Sintetizza posizionamento, momentum settimanale e implicazioni operative."
        )

        msg = UserMessage(text=prompt)
        response = await chat.send_message(msg)
        text = (response or "").strip().strip('"').strip("'")
        return text[:240] if len(text) > 10 else fallback
    except Exception as e:  # noqa: BLE001
        logger.warning("AI insight failed for %s: %s", asset_id, e)
        return fallback


# ---------------------------------------------------------------------------
# Cache helpers (MongoDB)
# ---------------------------------------------------------------------------

CACHE_COLL = "cot_cache"
HISTORY_COLL = "cot_history_cache"
MACRO_COLL = "macro_cache"
VERDICT_COLL = "verdict_cache"
VERDICT_HISTORY_COLL = "verdict_history"
CALENDAR_COLL = "calendar_cache"

MACRO_TTL_HOURS = 72    # macro summary updates every 3 days
VERDICT_TTL_HOURS = 24  # verdict updates daily
CALENDAR_TTL_HOURS = 6  # calendar scrape cached 6h


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_cached(asset_id: str) -> Optional[Dict[str, Any]]:
    doc = await db[CACHE_COLL].find_one({"_id": asset_id}, {"_id": 0})
    if not doc:
        return None
    fetched_at = datetime.fromisoformat(doc["fetchedAt"])
    if _now() - fetched_at > timedelta(hours=CACHE_TTL_HOURS):
        return None
    return doc["data"]


async def set_cached(asset_id: str, data: Dict[str, Any]) -> None:
    await db[CACHE_COLL].update_one(
        {"_id": asset_id},
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


async def _fetch_snapshot(asset_id: str, force: bool = False) -> Dict[str, Any]:
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail=f"Unknown asset {asset_id}")

    if not force:
        cached = await get_cached(asset_id)
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
    snapshot["macro"] = await generate_macro_insight(asset_id, snapshot)
    snapshot["fetchedAt"] = _now().isoformat()
    await set_cached(asset_id, snapshot)
    return snapshot


@api.get("/cot/bulk", response_model=List[CotSnapshot])
async def cot_bulk(
    scope: str = Query("core", description="core | all"),
    refresh: bool = Query(False),
) -> List[CotSnapshot]:
    asset_ids = [
        k for k, v in ASSET_MAP.items()
        if scope == "all" or v.get("core")
    ]
    # Limit concurrency to be polite
    sem = asyncio.Semaphore(4)

    async def runner(aid: str) -> Optional[Dict[str, Any]]:
        async with sem:
            try:
                return await _fetch_snapshot(aid, force=refresh)
            except Exception as e:  # noqa: BLE001
                logger.exception("snapshot failed %s: %s", aid, e)
                return None

    results = await asyncio.gather(*[runner(a) for a in asset_ids])
    return [CotSnapshot(**r) for r in results if r]


@api.get("/cot/{asset_id}", response_model=CotSnapshot)
async def cot_one(asset_id: str, refresh: bool = Query(False)) -> CotSnapshot:
    data = await _fetch_snapshot(asset_id.upper(), force=refresh)
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
    """Invalidate cache for all assets (used by Saturday cron and manual refresh)."""
    await db[CACHE_COLL].delete_many({})
    await db[HISTORY_COLL].delete_many({})
    await db[MACRO_COLL].delete_many({})
    await db[VERDICT_COLL].delete_many({})
    await db[CALENDAR_COLL].delete_many({})
    return {"status": "cache cleared", "time": _now().isoformat()}


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
async def macro_sentiment(asset_id: str, refresh: bool = Query(False)) -> Dict[str, Any]:
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    if not refresh:
        doc = await db[MACRO_COLL].find_one({"_id": asset_id}, {"_id": 0})
        if doc:
            fetched_at = datetime.fromisoformat(doc["fetchedAt"])
            if _now() - fetched_at < timedelta(hours=MACRO_TTL_HOURS):
                return doc["data"]

    events_all = await _get_calendar_events()
    relevant = filter_events_for_asset(events_all, asset_id)
    events_text = compact_events_text(relevant, limit=10)

    meta = ASSET_MAP[asset_id]
    prompt = (
        f"Asset: {asset_id} ({meta['name']}). Tipo: {meta['type']}.\n\n"
        f"Eventi macro da tradingeconomics.com (ultimi 7 giorni + prossimi):\n{events_text}\n\n"
        "TASK: Sintesi in italiano (2-3 frasi, max 260 caratteri) dello stato macroeconomico "
        "rilevante per questo asset. Cita eventi chiave. Indica se il contesto è bullish, bearish o misto."
    )
    fallback = f"Nessuna news rilevante nel range settimanale. {len(relevant)} eventi macro tracciati da tradingeconomics."
    summary = await _llm_generate(
        "Sei un senior macro analyst. Stile Bloomberg tagliente. Niente intro, solo analisi.",
        prompt, f"macro-{asset_id}", fallback,
    )
    data = {
        "assetId": asset_id,
        "summary": summary[:280],
        "events": relevant[:8],
        "eventCount": len(relevant),
        "fetchedAt": _now().isoformat(),
    }
    await db[MACRO_COLL].update_one(
        {"_id": asset_id}, {"$set": {"data": data, "fetchedAt": _now().isoformat()}}, upsert=True,
    )
    return data


@api.get("/verdict/{asset_id}")
async def final_verdict(asset_id: str, refresh: bool = Query(False)) -> Dict[str, Any]:
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    if not refresh:
        doc = await db[VERDICT_COLL].find_one({"_id": asset_id}, {"_id": 0})
        if doc:
            fetched_at = datetime.fromisoformat(doc["fetchedAt"])
            if _now() - fetched_at < timedelta(hours=VERDICT_TTL_HOURS):
                return doc["data"]

    cot_snap = await _fetch_snapshot(asset_id)
    macro = await macro_sentiment(asset_id)
    history = await cot_history(asset_id, limit=4)
    # price change last week (from oldest to newest in last 4 reports -> approx 1 week)
    price_change_pct = None
    latest_price = history[0].get("price") if history else None
    prev_price = history[1].get("price") if len(history) > 1 else None
    if latest_price and prev_price and prev_price != 0:
        price_change_pct = round(((latest_price - prev_price) / prev_price) * 100, 2)

    context = (
        f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
        f"COT Non-Commercial: Net {cot_snap['netPosition']:+,}, Δ WoW {cot_snap['wowDelta']:+,}, "
        f"Long {cot_snap['long']:,}, Short {cot_snap['short']:,}.\n"
        f"COT Macro insight: {cot_snap.get('macro', '')}\n"
        f"Macro sentiment settimanale: {macro['summary']}\n"
        f"Prezzo ultimo: {latest_price or '—'} · Variazione WoW: "
        f"{(str(price_change_pct) + '%') if price_change_pct is not None else 'N/A'}.\n\n"
        "TASK: Restituisci SOLO JSON con questa struttura: "
        '{"verdict":"LONG|SHORT|WAIT","confidence":1-5,"summary":"..."}. '
        "Verdetto operazionale sintetico considerando (1) posizionamento istituzionale COT, "
        "(2) contesto macro ultima settimana, (3) andamento prezzo. Summary max 200 caratteri in italiano."
    )
    fallback_json = '{"verdict":"WAIT","confidence":2,"summary":"Dati insufficienti per un verdetto solido."}'
    raw = await _llm_generate(
        "Sei un senior portfolio manager. Risponde solo in JSON valido, nessun commento extra.",
        context, f"verdict-{asset_id}", fallback_json,
    )
    # Best-effort JSON extraction
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
        {"_id": asset_id}, {"$set": {"data": data, "fetchedAt": _now().isoformat()}}, upsert=True,
    )
    # Append to immutable verdict history for later P/L tracking
    await db[VERDICT_HISTORY_COLL].insert_one({**data, "savedAt": _now().isoformat()})
    return data


@api.get("/verdict/{asset_id}/performance")
async def verdict_performance(asset_id: str) -> Dict[str, Any]:
    """
    Weekly trading logic:
      - COT is published Friday (data as of Tuesday). Trader enters MONDAY after publication.
      - Exit on FRIDAY close of the same week.
      - Entry/Exit prices fetched from Yahoo Finance daily close.
    """
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    cursor = db[VERDICT_HISTORY_COLL].find(
        {"assetId": asset_id}, {"_id": 0}
    ).sort("savedAt", 1)
    verdicts = await cursor.to_list(length=500)

    # Deduplicate by entryReportDate (keep first verdict per COT report)
    seen_entries = set()
    unique_verdicts = []
    for v in verdicts:
        ed = v.get("entryReportDate")
        if not ed or ed in seen_entries:
            continue
        seen_entries.add(ed)
        unique_verdicts.append(v)

    # Batch-fetch daily prices covering all verdict weeks
    prices: Dict[str, float] = {}
    if unique_verdicts and asset_id in YAHOO_SYMBOL:
        dates = [v["entryReportDate"] for v in unique_verdicts if v.get("entryReportDate")]
        if dates:
            min_d = datetime.strptime(min(dates), "%Y-%m-%d")
            max_d = datetime.strptime(max(dates), "%Y-%m-%d") + timedelta(days=14)
            prices = await fetch_daily_closes(asset_id, min_d - timedelta(days=3), max_d)

    results = []
    wins = losses = pending = 0
    pnl_sum = 0.0
    for v in unique_verdicts:
        report_date = v.get("entryReportDate")
        monday = next_monday(report_date)
        friday = following_friday(monday)
        entry = nearest_close_on_or_after(prices, monday)
        exit_ = nearest_close_on_or_before(prices, friday)
        entry_price = entry[1] if entry else None
        exit_price = exit_[1] if exit_ else None
        entry_date = entry[0] if entry else monday
        exit_date = exit_[0] if exit_ else None

        pnl_pct = None
        outcome = "PENDING"
        if entry_price is not None and exit_price is not None:
            direction = 1 if v.get("verdict") == "LONG" else (-1 if v.get("verdict") == "SHORT" else 0)
            if direction == 0:
                outcome = "NEUTRAL"
            else:
                pnl_pct = round(((exit_price - entry_price) / entry_price) * 100 * direction, 2)
                if pnl_pct > 0:
                    wins += 1
                    outcome = "WIN"
                elif pnl_pct < 0:
                    losses += 1
                    outcome = "LOSS"
                else:
                    outcome = "FLAT"
                pnl_sum += pnl_pct
        else:
            pending += 1

        results.append({
            "verdictDate": report_date,
            "verdict": v.get("verdict"),
            "confidence": v.get("confidence"),
            "entryDate": entry_date,
            "entryPrice": entry_price,
            "exitDate": exit_date,
            "exitPrice": exit_price,
            "pnlPct": pnl_pct,
            "outcome": outcome,
            "summary": v.get("summary"),
        })

    total_evaluated = wins + losses
    win_rate = round((wins / total_evaluated) * 100, 1) if total_evaluated else None
    return {
        "assetId": asset_id,
        "totalVerdicts": len(results),
        "evaluated": total_evaluated,
        "wins": wins,
        "losses": losses,
        "pending": pending,
        "winRate": win_rate,
        "cumulativePnlPct": round(pnl_sum, 2),
        "history": list(reversed(results))[:200],
    }


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


async def _saturday_refresh_loop() -> None:
    """Every Saturday at 22:00 UTC clear caches so next request returns fresh data."""
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
            logger.info("Saturday refresh: clearing COT cache")
            await db[CACHE_COLL].delete_many({})
            await db[HISTORY_COLL].delete_many({})
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("Saturday refresh loop error: %s", e)
            await asyncio.sleep(3600)


@app.on_event("startup")
async def on_startup() -> None:
    global _refresh_task
    _refresh_task = asyncio.create_task(_saturday_refresh_loop())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    if _refresh_task:
        _refresh_task.cancel()
    client.close()
