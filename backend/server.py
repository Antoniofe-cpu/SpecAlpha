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
    fetch_daily_ohlc,
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

async def generate_macro_insight(asset_id: str, snapshot: Dict[str, Any], lang: str = "it") -> str:
    """Generate a short institutional-style macro insight using Gemini."""
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

    if not EMERGENT_LLM_KEY:
        return fallback

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
    snapshot["macro"] = await generate_macro_insight(asset_id, snapshot, lang=lang)
    snapshot["fetchedAt"] = _now().isoformat()
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
    sem = asyncio.Semaphore(4)

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
async def macro_sentiment(asset_id: str, refresh: bool = Query(False), lang: str = Query("it")) -> Dict[str, Any]:
    asset_id = asset_id.upper()
    lang = "en" if lang == "en" else "it"
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    cache_key = f"{asset_id}__{lang}"
    if not refresh:
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
    return data


@api.get("/verdict/{asset_id}")
async def final_verdict(asset_id: str, refresh: bool = Query(False), lang: str = Query("it")) -> Dict[str, Any]:
    asset_id = asset_id.upper()
    lang = "en" if lang == "en" else "it"
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    cache_key = f"{asset_id}__{lang}"
    if not refresh:
        doc = await db[VERDICT_COLL].find_one({"_id": cache_key}, {"_id": 0})
        if doc:
            fetched_at = datetime.fromisoformat(doc["fetchedAt"])
            if _now() - fetched_at < timedelta(hours=VERDICT_TTL_HOURS):
                return doc["data"]

    cot_snap = await _fetch_snapshot(asset_id, lang=lang)
    macro = await macro_sentiment(asset_id, lang=lang)
    history = await cot_history(asset_id, limit=4)
    price_change_pct = None
    latest_price = history[0].get("price") if history else None
    prev_price = history[1].get("price") if len(history) > 1 else None
    if latest_price and prev_price and prev_price != 0:
        price_change_pct = round(((latest_price - prev_price) / prev_price) * 100, 2)

    if lang == "en":
        context = (
            f"Asset: {asset_id} ({ASSET_MAP[asset_id]['name']}).\n"
            f"COT Non-Commercial: Net {cot_snap['netPosition']:+,}, Δ WoW {cot_snap['wowDelta']:+,}, "
            f"Long {cot_snap['long']:,}, Short {cot_snap['short']:,}.\n"
            f"COT macro insight: {cot_snap.get('macro', '')}\n"
            f"Weekly macro sentiment: {macro['summary']}\n"
            f"Last price: {latest_price or '—'} · WoW change: "
            f"{(str(price_change_pct) + '%') if price_change_pct is not None else 'N/A'}.\n\n"
            "TASK: Return ONLY JSON with this structure: "
            '{"verdict":"LONG|SHORT|WAIT","confidence":1-5,"summary":"..."}. '
            "Synthetic operational verdict considering (1) institutional COT positioning, "
            "(2) last-week macro context, (3) price action. Summary max 200 chars in English."
        )
        system = "You are a senior portfolio manager. Reply only with valid JSON, no extra commentary. English only."
        fallback_json = '{"verdict":"WAIT","confidence":2,"summary":"Insufficient data for a solid verdict."}'
    else:
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
        system = "Sei un senior portfolio manager. Risponde solo in JSON valido, nessun commento extra. Solo italiano."
        fallback_json = '{"verdict":"WAIT","confidence":2,"summary":"Dati insufficienti per un verdetto solido."}'

    raw = await _llm_generate(system, context, f"verdict-{asset_id}-{lang}", fallback_json)
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
    return data


@api.get("/verdict/{asset_id}/performance")
async def verdict_performance(asset_id: str) -> Dict[str, Any]:
    """
    Logica semplificata:
      - Entry: Monday close della settimana successiva al report COT.
      - Risk window: Mon → Fri (min/max daily price).
      - Per ogni verdict: WIN (+1R) se MFE > MAE, LOSS (-1R) se MAE > MFE, FLAT (0R) se uguali.
      - Cumulative R = somma dei +1/-1 (= wins - losses).
    Auto-backfills synthetic verdicts (rule-based, NO LLM) for last 50 reports.
    """
    asset_id = asset_id.upper()
    if asset_id not in ASSET_MAP:
        raise HTTPException(status_code=404, detail="Unknown asset")

    await _backfill_verdicts(asset_id, depth=50)

    cursor = db[VERDICT_HISTORY_COLL].find(
        {"assetId": asset_id}, {"_id": 0}
    ).sort("entryReportDate", 1)
    verdicts = await cursor.to_list(length=500)

    seen_entries = set()
    unique_verdicts = []
    for v in verdicts:
        ed = v.get("entryReportDate")
        if not ed or ed in seen_entries:
            continue
        # Skip WAIT verdicts: only LONG/SHORT trades count for performance
        if v.get("verdict") not in ("LONG", "SHORT"):
            continue
        seen_entries.add(ed)
        unique_verdicts.append(v)

    unique_verdicts = unique_verdicts[-50:]

    # Fetch daily OHLC (use high/low to capture intra-day extremes)
    ohlc: Dict[str, Dict[str, float]] = {}
    if unique_verdicts and asset_id in YAHOO_SYMBOL:
        dates = [v["entryReportDate"] for v in unique_verdicts if v.get("entryReportDate")]
        if dates:
            min_d = datetime.strptime(min(dates), "%Y-%m-%d")
            max_d = datetime.strptime(max(dates), "%Y-%m-%d") + timedelta(days=14)
            ohlc = await fetch_daily_ohlc(asset_id, min_d - timedelta(days=3), max_d)

    def _week_days(start_date: str, end_date: str):
        """Return ordered list of (date_iso, high, low) for trading days within [start, end]."""
        try:
            sd = datetime.strptime(start_date, "%Y-%m-%d").date()
            ed = datetime.strptime(end_date, "%Y-%m-%d").date()
        except Exception:
            return []
        out = []
        cur = sd
        while cur <= ed:
            key = cur.isoformat()
            row = ohlc.get(key)
            if row and row.get("high") is not None and row.get("low") is not None:
                out.append((key, row["high"], row["low"]))
            cur = cur + timedelta(days=1)
        return out

    def _chronological_week_trade(week: list, direction: str):
        """Uses intra-day high/low. For LONG the weekly low is the best entry
        (cheapest price of the week) and the weekly high is the best exit.
        Outcome depends on chronological order of the days hosting those extremes.
        LONG:
          - if low day comes before high day → WIN (entry=low, exit=high)
          - else trader is caught at the high, drags to the low → LOSS (entry=high, exit=low)
        SHORT: mirrored.
        """
        if len(week) < 2:
            return None
        # Indices of the day hosting the absolute weekly low and high
        min_idx = min(range(len(week)), key=lambda i: week[i][2])  # lowest low
        max_idx = max(range(len(week)), key=lambda i: week[i][1])  # highest high
        if min_idx == max_idx:
            return None
        if direction == "LONG":
            if min_idx < max_idx:
                ed_in, _, entry_low = week[min_idx]
                ed_out, exit_high, _ = week[max_idx]
                return ed_in, entry_low, ed_out, exit_high
            else:
                ed_in, entry_high, _ = week[max_idx]
                ed_out, _, exit_low = week[min_idx]
                return ed_in, entry_high, ed_out, exit_low
        else:  # SHORT
            if max_idx < min_idx:
                ed_in, entry_high, _ = week[max_idx]
                ed_out, _, exit_low = week[min_idx]
                return ed_in, entry_high, ed_out, exit_low
            else:
                ed_in, _, entry_low = week[min_idx]
                ed_out, exit_high, _ = week[max_idx]
                return ed_in, entry_low, ed_out, exit_high

    results = []
    wins = losses = pending = 0
    cum_r = 0
    cum_net_pct = 0.0
    for v in unique_verdicts:
        report_date = v.get("entryReportDate")
        week_mon = next_monday(report_date)
        week_fri = following_friday(week_mon)
        week = _week_days(week_mon, week_fri)
        # Informational week low/high (true daily high/low, not close)
        w_min = min((lo for _, _, lo in week), default=None)
        w_max = max((hi for _, hi, _ in week), default=None)

        verdict_dir = v.get("verdict")
        entry_price = None
        exit_price = None
        entry_date = week_mon
        exit_date = week_fri
        r = None
        net_pct = None
        outcome = "PENDING"

        if verdict_dir in ("LONG", "SHORT"):
            best = _chronological_week_trade(week, verdict_dir)
            if best is not None:
                entry_date, entry_price, exit_date, exit_price = best
                direction = 1 if verdict_dir == "LONG" else -1
                if entry_price and entry_price != 0:
                    raw_pct = ((exit_price - entry_price) / entry_price) * 100 * direction
                    net_pct = round(raw_pct, 3)
                    if net_pct > 0:
                        r = 1
                        outcome = "WIN"
                        wins += 1
                    elif net_pct < 0:
                        r = -1
                        outcome = "LOSS"
                        losses += 1
                    else:
                        r = 0
                        outcome = "FLAT"
                    cum_r += r
                    cum_net_pct += net_pct
            else:
                pending += 1
        else:
            pending += 1

        results.append({
            "verdictDate": report_date,
            "verdict": verdict_dir,
            "confidence": v.get("confidence"),
            "entryDate": entry_date,
            "entryPrice": entry_price,
            "exitDate": exit_date,
            "exitPrice": exit_price,
            "weekMin": w_min,
            "weekMax": w_max,
            "r": r,
            "netPct": net_pct,
            "outcome": outcome,
            "summary": v.get("summary"),
            "synthetic": v.get("synthetic", False),
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
        "cumulativeR": cum_r,
        "cumulativeNetPct": round(cum_net_pct, 2),
        "history": list(reversed(results))[:50],
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
