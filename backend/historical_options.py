"""
Historical Options Sentiment Proxy

Alpha Vantage's HISTORICAL_OPTIONS endpoint requires a premium plan.
For the Confluence Index back-test we need a directional bullish/bearish
options reading for every historical COT week.

This module uses CBOE Volatility Indices (VIX family) as the directional
proxy — sourced from Yahoo Finance, free and reliable:

  - VIX  → S&P 500, NASDAQ, DOW, RUSSELL (equity indices)
  - GVZ  → GOLD
  - OVX  → OIL (WTI crude)
  - BVZ  → BTC (Bitcoin)

Logic: rising VIX = elevated put demand = bearish options stance.
Map normalised VIX deviation from its 200-day mean to a signed score in
[-1, +1] aligned with the rest of the Confluence Index components.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import yfinance as yf

logger = logging.getLogger(__name__)

# Asset → Yahoo volatility index ticker
VIX_PROXY: Dict[str, str] = {
    "SP500": "^VIX",
    "NAS100": "^VXN",
    "DOW": "^VXD",
    "RUSSELL": "^RVX",
    "GOLD": "^GVZ",
    "OIL": "^OVX",
    "BTC": "^BVZ",
}

_cache: Dict[str, Dict[str, float]] = {}


def _fetch_vix_series(symbol: str) -> Dict[str, float]:
    """Fetch the full daily Close series for a Yahoo VIX-family symbol."""
    if symbol in _cache:
        return _cache[symbol]
    try:
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=400 * 5)  # 5 years
        df = yf.download(symbol, start=start, end=end, progress=False, auto_adjust=False)
        if df is None or df.empty:
            return {}
        series = {}
        for idx, row in df.iterrows():
            d = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            try:
                close = float(row["Close"].iloc[0]) if hasattr(row["Close"], "iloc") else float(row["Close"])
                if close > 0:
                    series[d] = close
            except (TypeError, ValueError):
                continue
        _cache[symbol] = series
        return series
    except Exception as e:  # noqa: BLE001
        logger.warning("yfinance VIX fetch failed for %s: %s", symbol, e)
        return {}


def historical_options_signal(asset_id: str, on_or_before: str) -> Optional[float]:
    """Return a [-1, +1] options sentiment score for `asset_id` on the given date.

    Args:
        asset_id: e.g. "SP500", "GOLD"
        on_or_before: YYYY-MM-DD string (the COT report date)

    Returns:
        Signed score in [-1, +1] (positive = bullish options regime).
        None when no volatility proxy is available for this asset.
    """
    asset_id = asset_id.upper()
    symbol = VIX_PROXY.get(asset_id)
    if not symbol:
        return None

    series = _fetch_vix_series(symbol)
    if not series:
        return None

    # Find the most recent close on-or-before the requested date
    target = on_or_before
    sorted_dates = sorted(series.keys())
    snapshot_close = None
    snapshot_date = None
    for d in reversed(sorted_dates):
        if d <= target:
            snapshot_close = series[d]
            snapshot_date = d
            break
    if snapshot_close is None:
        return None

    # 200-day rolling mean ending at snapshot_date
    window = [series[d] for d in sorted_dates if d <= snapshot_date][-200:]
    if len(window) < 30:
        return None
    mean = sum(window) / len(window)
    if mean <= 0:
        return None

    # Normalised deviation: VIX 50% above its 200-day mean → score -1 (max bearish)
    # VIX 30% below its mean → score +1 (max bullish complacency / call-heavy)
    deviation = (snapshot_close - mean) / mean
    raw = -deviation / 0.4  # 40% deviation = saturation
    return max(-1.0, min(1.0, raw))


def current_options_signal(asset_id: str) -> Optional[float]:
    """Live options sentiment using the latest VIX-family close.

    Useful when no Alpha Vantage options data is configured for the asset.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return historical_options_signal(asset_id, today)
