"""
Tradingster COT (Commitment of Traders) scraper.
Parses Legacy Futures reports from https://www.tradingster.com/cot/legacy-futures/
"""
from __future__ import annotations

import re
import logging
from typing import List, Dict, Any, Optional

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

BASE_URL = "https://www.tradingster.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# CFTC contract codes used by tradingster URLs
ASSET_MAP: Dict[str, Dict[str, Any]] = {
    "SP500":   {"code": "13874A", "name": "S&P 500 E-Mini", "type": "INDEX",     "core": True},
    "NAS100":  {"code": "209742", "name": "NASDAQ 100",     "type": "INDEX",     "core": True},
    "DOW":     {"code": "124603", "name": "Dow Jones",      "type": "INDEX",     "core": False},
    "RUSSELL": {"code": "239742", "name": "Russell 2000",   "type": "INDEX",     "core": False},
    "VIX":     {"code": "1170E1", "name": "VIX",            "type": "INDEX",     "core": False},

    "GOLD":    {"code": "088691", "name": "Oro",            "type": "COMMODITY", "core": True},
    "SILVER":  {"code": "084691", "name": "Argento",        "type": "COMMODITY", "core": False},
    "COPPER":  {"code": "085692", "name": "Rame",           "type": "COMMODITY", "core": False},
    "OIL":     {"code": "067651", "name": "Petrolio (WTI)", "type": "COMMODITY", "core": True},
    "NATGAS":  {"code": "023391", "name": "Gas Naturale",   "type": "COMMODITY", "core": False},

    "EURUSD":  {"code": "099741", "name": "Euro (EUR)",     "type": "CURRENCY",  "core": True},
    "GBPUSD":  {"code": "096742", "name": "Sterlina (GBP)", "type": "CURRENCY",  "core": True},
    "USDJPY":  {"code": "097741", "name": "Yen (JPY)",      "type": "CURRENCY",  "core": True},
    "AUDUSD":  {"code": "232741", "name": "Dollaro Australiano", "type": "CURRENCY",  "core": False},
    "USDCAD":  {"code": "090741", "name": "Dollaro Canadese",    "type": "CURRENCY",  "core": False},
    "USDCHF":  {"code": "092741", "name": "Franco Svizzero",     "type": "CURRENCY",  "core": False},
    "NZDUSD":  {"code": "112741", "name": "Dollaro Neozelandese","type": "CURRENCY",  "core": False},
    "BTC":     {"code": "133741", "name": "Bitcoin",        "type": "COMMODITY", "core": False},
}


def _to_int(s: str) -> int:
    if not s:
        return 0
    s = s.strip().replace(",", "").replace("+", "").replace("(", "-").replace(")", "")
    try:
        return int(float(s))
    except ValueError:
        return 0


def _to_float(s: str) -> float:
    if not s:
        return 0.0
    s = s.strip().replace(",", "").replace("%", "").replace("+", "")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _parse_legacy_report(html: str) -> Dict[str, Any]:
    """
    Parse a Tradingster legacy-futures report page.
    Table layout (single table):
      row[0] = category headers (Non-Commercial / Commercial / Total / Non-Reportable)
      row[1] = sub-headers (Long, Short, Spreads, Long, Short, Long, Short, Long, Short)
      row[2] = (info row) ... Open Interest: X
      row[3] = positions numbers (Non-Commercial Long, Short, Spreads, ...)
      row[4] = "Changes" label row containing "(Change In Open Interest: +N)"
      row[5] = changes numbers (with +/- signs)
      row[6] = "Percent of Open Interest..." label
      row[7] = percent numbers
      row[8] = "Number of Traders..." label
      row[9] = trader counts
    """
    soup = BeautifulSoup(html, "lxml")

    # Date detection
    text_dump = soup.get_text(" ", strip=True)
    report_date = None
    m = re.search(r"as of\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})", text_dump, re.IGNORECASE)
    if m:
        report_date = m.group(1)
    else:
        m = re.search(r"(\d{4}-\d{2}-\d{2})", text_dump)
        if m:
            report_date = m.group(1)

    open_interest = 0
    oi_match = re.search(r"Open Interest[:\s]*([\d,]+)", text_dump)
    if oi_match:
        open_interest = _to_int(oi_match.group(1))

    long_pos = short_pos = 0
    change_long = change_short = 0
    pct_long = pct_short = 0.0
    # Commercials (rebranded "Retail" in UI per product requirement)
    comm_long = comm_short = 0
    comm_change_long = comm_change_short = 0
    comm_pct_long = comm_pct_short = 0.0

    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        # Need at least 4 rows to contain positions
        if len(rows) < 4:
            continue
        header_text = " ".join(rows[i].get_text(" ", strip=True) for i in range(min(2, len(rows)))).lower()
        if "non-commercial" not in header_text and "non commercial" not in header_text:
            continue

        rows_cells = []
        for r in rows:
            cells = [c.get_text(" ", strip=True) for c in r.find_all(["td", "th"])]
            rows_cells.append(cells)

        def is_numeric_row(cells: List[str]) -> bool:
            if len(cells) < 4:
                return False
            num_count = sum(1 for c in cells if re.match(r"^[+\-]?[\d,]+(?:\.\d+)?%?$", c.strip()))
            return num_count >= len(cells) - 1 and num_count >= 4

        # Find the first numeric row (positions)
        idx_positions = None
        for i, cells in enumerate(rows_cells):
            if is_numeric_row(cells):
                idx_positions = i
                break

        if idx_positions is None or len(rows_cells[idx_positions]) < 2:
            continue

        positions_row = rows_cells[idx_positions]
        # Layout (legacy futures): NC Long | NC Short | NC Spreads | Comm Long | Comm Short | Total L | Total S | NonRep L | NonRep S
        long_pos = _to_int(positions_row[0])
        short_pos = _to_int(positions_row[1])
        if len(positions_row) >= 5:
            comm_long = _to_int(positions_row[3])
            comm_short = _to_int(positions_row[4])

        # Look for next numeric row after a "Changes" label - search subsequent rows
        for j in range(idx_positions + 1, len(rows_cells)):
            if is_numeric_row(rows_cells[j]):
                changes_row = rows_cells[j]
                change_long = _to_int(changes_row[0])
                change_short = _to_int(changes_row[1])
                if len(changes_row) >= 5:
                    comm_change_long = _to_int(changes_row[3])
                    comm_change_short = _to_int(changes_row[4])
                # Now look for percent row
                for k in range(j + 1, len(rows_cells)):
                    if is_numeric_row(rows_cells[k]):
                        pct_row = rows_cells[k]
                        pct_long = _to_float(pct_row[0])
                        pct_short = _to_float(pct_row[1])
                        if len(pct_row) >= 5:
                            comm_pct_long = _to_float(pct_row[3])
                            comm_pct_short = _to_float(pct_row[4])
                        break
                break
        break

    net_position = long_pos - short_pos
    wow_delta = change_long - change_short
    total = long_pos + short_pos or 1
    intensity = round(min(100, max(0, 50 + (net_position / total) * 100)))
    long_pct_change = round((change_long / long_pos) * 100, 2) if long_pos else 0.0
    short_pct_change = round((change_short / short_pos) * 100, 2) if short_pos else 0.0

    # Commercials ("Retail" in the UI)
    retail_net = comm_long - comm_short
    retail_wow_delta = comm_change_long - comm_change_short
    retail_total = comm_long + comm_short or 1
    retail_long_pct_change = round((comm_change_long / comm_long) * 100, 2) if comm_long else 0.0
    retail_short_pct_change = round((comm_change_short / comm_short) * 100, 2) if comm_short else 0.0

    return {
        "long": long_pos,
        "short": short_pos,
        "changeLong": change_long,
        "changeShort": change_short,
        "netPosition": net_position,
        "wowDelta": wow_delta,
        "openInterest": open_interest,
        "openInterestShare": round(pct_long + pct_short, 2),
        "pctLong": pct_long,
        "pctShort": pct_short,
        "longPctChange": long_pct_change,
        "shortPctChange": short_pct_change,
        "intensityIndex": intensity,
        "reportDate": report_date or "Latest",
        # Retail trader block (CFTC Commercials, renamed for UX)
        "retailLong": comm_long,
        "retailShort": comm_short,
        "retailChangeLong": comm_change_long,
        "retailChangeShort": comm_change_short,
        "retailNetPosition": retail_net,
        "retailWowDelta": retail_wow_delta,
        "retailPctLong": comm_pct_long,
        "retailPctShort": comm_pct_short,
        "retailLongPctChange": retail_long_pct_change,
        "retailShortPctChange": retail_short_pct_change,
    }


async def fetch_cot_latest(asset_id: str, client: Optional[httpx.AsyncClient] = None) -> Dict[str, Any]:
    """Fetch the latest COT report for a given asset."""
    asset = ASSET_MAP.get(asset_id)
    if not asset:
        raise ValueError(f"Unknown asset {asset_id}")

    url = f"{BASE_URL}/cot/legacy-futures/{asset['code']}"
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=20.0, headers=HEADERS, follow_redirects=True)
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        return _parse_legacy_report(resp.text)
    finally:
        if own_client:
            await client.aclose()


async def fetch_cot_history_dates(asset_id: str, client: Optional[httpx.AsyncClient] = None) -> List[Dict[str, str]]:
    """Fetch list of historical report dates available for an asset."""
    asset = ASSET_MAP.get(asset_id)
    if not asset:
        raise ValueError(f"Unknown asset {asset_id}")

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=20.0, headers=HEADERS, follow_redirects=True)
    try:
        url = f"{BASE_URL}/cot/legacy-futures/{asset['code']}"
        resp = await client.get(url)
        if resp.status_code != 200:
            return []
        # Tradingster encodes available dates inside an `availableDates` JS array
        m = re.search(r"var\s+availableDates\s*=\s*\[([^\]]+)\]", resp.text)
        dates: List[str] = []
        if m:
            dates = re.findall(r"(\d{4}-\d{2}-\d{2})", m.group(1))
        dates.sort(reverse=True)
        return [{"date": d, "url": f"{url}?date={d}"} for d in dates]
    finally:
        if own_client:
            await client.aclose()


async def fetch_cot_history(asset_id: str, limit: int = 60) -> List[Dict[str, Any]]:
    """
    Build historical data series by parsing the chart data embedded in the page.
    Returns list ordered most recent first.
    """
    asset = ASSET_MAP.get(asset_id)
    if not asset:
        raise ValueError(f"Unknown asset {asset_id}")

    async with httpx.AsyncClient(timeout=20.0, headers=HEADERS, follow_redirects=True) as client:
        url = f"{BASE_URL}/cot/legacy-futures/{asset['code']}"
        resp = await client.get(url)
        resp.raise_for_status()
        text = resp.text

    def parse_var(name: str) -> Dict[str, Dict[str, float]]:
        m = re.search(r"var\s+" + name + r"\s*=\s*(\[.*?\]);", text, re.DOTALL)
        if not m:
            return {}
        body = m.group(1)
        out: Dict[str, Dict[str, float]] = {}
        for entry in re.finditer(
            r"\{\s*date:\s*new Date\('(\d{4}-\d{2}-\d{2})'\)\s*,(.*?)\}",
            body,
            re.DOTALL,
        ):
            date = entry.group(1)
            payload = entry.group(2)
            fields: Dict[str, float] = {}
            for fm in re.finditer(r"(\w+)\s*:\s*([+\-]?[\d\.]+)", payload):
                key = fm.group(1)
                try:
                    fields[key] = float(fm.group(2))
                except ValueError:
                    pass
            out[date] = fields
        return out

    net_map = parse_var("dataNet")
    long_map = parse_var("dataLong")
    short_map = parse_var("dataShort")

    all_dates = sorted(set(net_map) | set(long_map) | set(short_map), reverse=True)
    prev_long = prev_short = None
    asc_dates = list(reversed(all_dates))
    snapshots: List[Dict[str, Any]] = []
    for d in asc_dates:
        long_val = int(long_map.get(d, {}).get("NonCommercial", 0))
        short_val = int(short_map.get(d, {}).get("NonCommercial", 0))
        net_val = int(net_map.get(d, {}).get("NonCommercial", long_val - short_val))
        price_val = net_map.get(d, {}).get("close")
        change_long = (long_val - prev_long) if prev_long is not None else 0
        change_short = (short_val - prev_short) if prev_short is not None else 0
        wow = change_long - change_short
        snapshots.append({
            "date": d,
            "long": long_val,
            "short": short_val,
            "netPosition": net_val,
            "changeLong": change_long,
            "changeShort": change_short,
            "wowDelta": wow,
            "price": round(float(price_val), 4) if price_val is not None else None,
        })
        prev_long, prev_short = long_val, short_val
    snapshots.reverse()
    return snapshots[:limit]
