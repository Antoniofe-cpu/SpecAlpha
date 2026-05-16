"""
Tradingeconomics macro calendar scraper.
Fetches high-importance economic events from https://tradingeconomics.com/calendar
and filters them by country relevant to each COT asset.
"""
from __future__ import annotations

import re
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE = "https://tradingeconomics.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Map COT asset -> list of ISO-like country codes used in tradingeconomics calendar
ASSET_COUNTRY_MAP: Dict[str, List[str]] = {
    "EURUSD": ["EA", "DE", "FR"],
    "GBPUSD": ["GB", "UK"],
    "USDJPY": ["JP", "US"],
    "AUDUSD": ["AU"],
    "USDCAD": ["CA"],
    "USDCHF": ["CH"],
    "NZDUSD": ["NZ"],
    "SP500":   ["US"],
    "NAS100":  ["US"],
    "DOW":     ["US"],
    "RUSSELL": ["US"],
    "VIX":     ["US"],
    "GOLD":    ["US"],
    "SILVER":  ["US"],
    "COPPER":  ["CN", "US"],
    "OIL":     ["US"],
    "NATGAS":  ["US"],
    "BTC":     ["US"],
}

COUNTRY_NAME = {
    "US": "United States", "EA": "Euro Area", "DE": "Germany", "FR": "France",
    "GB": "United Kingdom", "UK": "United Kingdom", "JP": "Japan", "AU": "Australia",
    "CA": "Canada", "CH": "Switzerland", "NZ": "New Zealand", "CN": "China",
}


async def fetch_calendar_events(lookback_days: int = 7) -> List[Dict]:
    """Fetch medium+high importance events (2★ and 3★ only) tagged with their impact."""
    urls = [
        (f"{BASE}/calendar?importance=3", 3),  # high impact (3 stars)
        (f"{BASE}/calendar?importance=2&range=this+week", 2),  # medium (2 stars)
    ]
    events: List[Dict] = []
    async with httpx.AsyncClient(timeout=20.0, headers=HEADERS, follow_redirects=True) as client:
        for url, importance in urls:
            try:
                r = await client.get(url)
                if r.status_code != 200:
                    continue
                parsed = _parse_calendar(r.text)
                for e in parsed:
                    e["importance"] = importance
                events.extend(parsed)
            except Exception as e:  # noqa: BLE001
                logger.warning("calendar fetch failed %s: %s", url, e)
    # Deduplicate by (date, event name, country) — keep the HIGHEST importance
    seen: Dict[tuple, Dict] = {}
    for e in events:
        key = (e.get("date"), e.get("country"), e.get("event"))
        if key in seen and seen[key].get("importance", 0) >= e.get("importance", 0):
            continue
        seen[key] = e
    return list(seen.values())


def _parse_calendar(html: str) -> List[Dict]:
    soup = BeautifulSoup(html, "lxml")
    events: List[Dict] = []
    current_date: Optional[str] = None
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        for row in rows:
            cells = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
            if not cells:
                continue
            date_match = re.match(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$", cells[0])
            if date_match:
                # parse date
                try:
                    current_date = datetime.strptime(cells[0], "%A %B %d %Y").strftime("%Y-%m-%d")
                except Exception:
                    current_date = cells[0]
                continue
            # event row: time | country-flag | country-code | event | actual | previous | consensus | forecast
            if len(cells) < 4:
                continue
            if not re.match(r"^\d{1,2}:\d{2}\s?(AM|PM)$", cells[0]):
                # event rows may have "" in first col; keep only rows with time
                continue
            # typical layout varies; find country code (2 upper letters) and event title
            country = None
            event = None
            actual = previous = consensus = ""
            for idx, c in enumerate(cells):
                if re.match(r"^[A-Z]{2}$", c) and not country:
                    country = c
                    continue
                if country and event is None and len(c) > 3 and not re.match(r"^[A-Z]{2}$", c):
                    event = c
                    # take next cells as actual/previous/consensus if present
                    rest = cells[idx + 1: idx + 5]
                    actual = rest[0] if len(rest) > 0 else ""
                    previous = rest[1] if len(rest) > 1 else ""
                    consensus = rest[2] if len(rest) > 2 else ""
                    break
            if country and event and current_date:
                events.append({
                    "date": current_date,
                    "time": cells[0],
                    "country": country,
                    "event": event,
                    "actual": actual,
                    "previous": previous,
                    "consensus": consensus,
                })
    return events


def filter_events_for_asset(events: List[Dict], asset_id: str, lookback_days: int = 7, forward_days: int = 7) -> List[Dict]:
    codes = ASSET_COUNTRY_MAP.get(asset_id, ["US"])
    today = datetime.utcnow().date()
    lo = today - timedelta(days=lookback_days)
    hi = today + timedelta(days=forward_days)
    out: List[Dict] = []
    for e in events:
        if e.get("country") not in codes:
            continue
        try:
            dt = datetime.strptime(e["date"], "%Y-%m-%d").date()
        except Exception:
            continue
        if not (lo <= dt <= hi):
            continue
        out.append(e)
    # sort by date desc
    out.sort(key=lambda x: x.get("date", ""), reverse=True)
    return out


def compact_events_text(events: List[Dict], limit: int = 12) -> str:
    """Compact one-liner per event for LLM prompt. Keep cheap."""
    lines: List[str] = []
    for e in events[:limit]:
        actual = e.get("actual") or "—"
        prev = e.get("previous") or "—"
        line = f"{e['date']} {e['country']} · {e['event']} · actual {actual} (prev {prev})"
        lines.append(line)
    return "\n".join(lines) if lines else "(Nessun evento macro rilevante nella settimana)"
