"""
Yahoo Finance daily close price scraper (free, no key).
Used to compute entry (Monday close) / exit (Friday close) for verdict P/L.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

# Map COT assetId -> Yahoo Finance symbol
YAHOO_SYMBOL = {
    "SP500":   "^GSPC",
    "NAS100":  "^NDX",
    "DOW":     "^DJI",
    "RUSSELL": "^RUT",
    "VIX":     "^VIX",
    "GOLD":    "GC=F",
    "SILVER":  "SI=F",
    "COPPER":  "HG=F",
    "OIL":     "CL=F",
    "NATGAS":  "NG=F",
    "EURUSD":  "EURUSD=X",
    "GBPUSD":  "GBPUSD=X",
    "USDJPY":  "JPY=X",
    "AUDUSD":  "AUDUSD=X",
    "USDCAD":  "CAD=X",
    "USDCHF":  "CHF=X",
    "NZDUSD":  "NZDUSD=X",
    "BTC":     "BTC-USD",
}


async def fetch_daily_closes(asset_id: str, start: datetime, end: datetime) -> Dict[str, float]:
    """Return {yyyy-mm-dd: close} for the date range [start, end] (inclusive)."""
    sym = YAHOO_SYMBOL.get(asset_id)
    if not sym:
        return {}
    p1 = int(start.replace(hour=0, minute=0, second=0, tzinfo=timezone.utc).timestamp())
    p2 = int((end + timedelta(days=1)).replace(hour=0, minute=0, second=0, tzinfo=timezone.utc).timestamp())
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
        f"?period1={p1}&period2={p2}&interval=1d"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0, headers=HEADERS) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return {}
            data = r.json()
            res = (data.get("chart") or {}).get("result") or []
            if not res:
                return {}
            ts = res[0].get("timestamp", []) or []
            closes = (((res[0].get("indicators") or {}).get("quote") or [{}])[0]).get("close", []) or []
            out: Dict[str, float] = {}
            for t, c in zip(ts, closes):
                if c is None:
                    continue
                d = datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%d")
                out[d] = float(c)
            return out
    except Exception as e:  # noqa: BLE001
        logger.warning("yahoo fetch failed %s: %s", asset_id, e)
        return {}


def next_monday(from_date: str) -> str:
    """Given a yyyy-mm-dd report date (usually a Tuesday when COT is as-of), return the next Monday yyyy-mm-dd."""
    d = datetime.strptime(from_date, "%Y-%m-%d").date()
    # weekday(): Mon=0 ... Sun=6
    days_ahead = (7 - d.weekday()) % 7
    if days_ahead == 0:
        days_ahead = 7
    return (d + timedelta(days=days_ahead)).isoformat()


def following_friday(monday_date: str) -> str:
    d = datetime.strptime(monday_date, "%Y-%m-%d").date()
    return (d + timedelta(days=4)).isoformat()


def nearest_close_on_or_after(prices: Dict[str, float], target: str, max_forward_days: int = 6) -> Optional[tuple]:
    """Find the first trading day with a close on/after target within N days."""
    d = datetime.strptime(target, "%Y-%m-%d").date()
    for offset in range(max_forward_days + 1):
        day = (d + timedelta(days=offset)).isoformat()
        if day in prices:
            return day, prices[day]
    return None


def nearest_close_on_or_before(prices: Dict[str, float], target: str, max_back_days: int = 6) -> Optional[tuple]:
    d = datetime.strptime(target, "%Y-%m-%d").date()
    for offset in range(max_back_days + 1):
        day = (d - timedelta(days=offset)).isoformat()
        if day in prices:
            return day, prices[day]
    return None
