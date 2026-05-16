"""
MyFxBook Community Outlook + IG.com Client Sentiment

Re-introduced after the previous deletion. Provides retail (real-money)
trader positioning per asset, used to populate the AssetCard "Retail
Sentiment" block (replaces the old AI macro text).

MyFxBook covers forex / metals / oil / BTC.
IG.com covers equity indices (NAS100/SP500/DOW/RUSSELL) + commodities.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from typing import Dict, Any, Optional
from urllib.parse import unquote

import httpx

logger = logging.getLogger(__name__)


# --- MyFxBook ---------------------------------------------------------------

MYFXBOOK_SYMBOL: Dict[str, str] = {
    "EURUSD": "EURUSD", "GBPUSD": "GBPUSD", "USDJPY": "USDJPY",
    "AUDUSD": "AUDUSD", "USDCAD": "USDCAD", "USDCHF": "USDCHF",
    "NZDUSD": "NZDUSD", "GOLD": "XAUUSD", "SILVER": "XAGUSD",
    "OIL": "OILUSD", "BTC": "BTCUSD",
}

_mfx_session: Optional[str] = None
_mfx_lock = asyncio.Lock()
_mfx_data: Dict[str, Dict[str, Any]] = {}
_mfx_fetched_at: float = 0.0


async def _ensure_mfx_session() -> Optional[str]:
    global _mfx_session
    email = os.environ.get("MYFXBOOK_EMAIL")
    password = os.environ.get("MYFXBOOK_PASSWORD")
    if not email or not password:
        return None
    async with _mfx_lock:
        if _mfx_session:
            return _mfx_session
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(
                    "https://www.myfxbook.com/api/login.json",
                    params={"email": email, "password": password},
                )
                data = r.json()
                if data.get("error"):
                    logger.warning("MyFxBook login error: %s", data.get("message"))
                    return None
                sess = data.get("session")
                if sess:
                    _mfx_session = unquote(sess)
                    return _mfx_session
        except Exception as e:  # noqa: BLE001
            logger.warning("MyFxBook login failed: %s", e)
    return None


async def _refresh_mfx_all() -> None:
    """Fetch the community outlook for all symbols at once (single API call)."""
    global _mfx_data, _mfx_fetched_at
    sess = await _ensure_mfx_session()
    if not sess:
        return
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                "https://www.myfxbook.com/api/get-community-outlook.json",
                params={"session": sess},
            )
            payload = r.json()
            if payload.get("error"):
                # Session expired
                global _mfx_session
                _mfx_session = None
                logger.warning("MyFxBook outlook error: %s", payload.get("message"))
                return
            symbols = payload.get("symbols", [])
            new_data: Dict[str, Dict[str, Any]] = {}
            for s in symbols:
                name = s.get("name")
                if not name:
                    continue
                long_pct = s.get("longPercentage")
                short_pct = s.get("shortPercentage")
                if long_pct is None or short_pct is None:
                    continue
                new_data[name] = {
                    "longPercentage": float(long_pct),
                    "shortPercentage": float(short_pct),
                    "longPositions": int(s.get("longPositions") or 0),
                    "shortPositions": int(s.get("shortPositions") or 0),
                    "totalPositions": int(s.get("totalPositions") or 0),
                    "source": "MyFxBook",
                }
            _mfx_data = new_data
            _mfx_fetched_at = time.time()
            logger.info("MyFxBook refreshed: %d symbols", len(new_data))
    except Exception as e:  # noqa: BLE001
        logger.warning("MyFxBook refresh failed: %s", e)


async def get_myfxbook_positioning(asset_id: str) -> Optional[Dict[str, Any]]:
    asset_id = asset_id.upper()
    symbol = MYFXBOOK_SYMBOL.get(asset_id)
    if not symbol:
        return None
    # Refresh every 30 min
    if not _mfx_data or (time.time() - _mfx_fetched_at) > 1800:
        await _refresh_mfx_all()
    return _mfx_data.get(symbol)


# --- IG.com -----------------------------------------------------------------

IG_URLS: Dict[str, str] = {
    "SP500": "https://www.ig.com/it/indici/mercati-indici/us-spx-500",
    "NAS100": "https://www.ig.com/it/indici/mercati-indici/us-tech-100",
    "DOW": "https://www.ig.com/it/indici/mercati-indici/wall-street",
    "RUSSELL": "https://www.ig.com/it/indici/mercati-indici/us-russell-2000",
    "VIX": "https://www.ig.com/it/indici/mercati-indici/volatility-index",
    "COPPER": "https://www.ig.com/it/materie-prime/mercati-materie-prime/copper",
    "NATGAS": "https://www.ig.com/it/materie-prime/mercati-materie-prime/natural-gas",
}

_ig_cache: Dict[str, tuple] = {}
_IG_TTL = 30 * 60
_ig_browser = None
_ig_lock = asyncio.Lock()


async def _ig_browser_get():
    global _ig_browser
    async with _ig_lock:
        if _ig_browser is None or not _ig_browser.is_connected():
            from playwright.async_api import async_playwright
            pw = await async_playwright().start()
            _ig_browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
        return _ig_browser


def _ig_extract(html: str) -> tuple[Optional[int], Optional[int]]:
    m = re.search(
        r'price-ticket__percent[^>]*>\s*(\d{1,3})\s*%\s*</span>[\s\S]{0,400}?ha\s*posizioni\s*(long|short)\s*</?(?:strong|b|span|em)?>?\s*su\s*questo\s*mercato',
        html, re.IGNORECASE,
    )
    if m:
        pct = int(m.group(1))
        side = m.group(2).lower()
        return (pct, 100 - pct) if side == "long" else (100 - pct, pct)
    return None, None


async def get_ig_positioning(asset_id: str) -> Optional[Dict[str, Any]]:
    asset_id = asset_id.upper()
    url = IG_URLS.get(asset_id)
    if not url:
        return None
    now = time.time()
    if asset_id in _ig_cache:
        ts, data = _ig_cache[asset_id]
        if (now - ts) < _IG_TTL:
            return data
    try:
        browser = await _ig_browser_get()
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            locale="it-IT", viewport={"width": 1280, "height": 800},
        )
        page = await ctx.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            try:
                await page.wait_for_function(
                    "() => /\\d{1,3}\\s*%\\s*dei\\s*client[ie]\\s*ha\\s*posizioni/i.test(document.body.innerText)",
                    timeout=15000,
                )
            except Exception:
                pass
            html = await page.content()
        finally:
            await ctx.close()
        long_pct, short_pct = _ig_extract(html)
        if long_pct is None or short_pct is None:
            return None
        data = {
            "longPercentage": float(long_pct),
            "shortPercentage": float(short_pct),
            "source": "IG.com",
        }
        _ig_cache[asset_id] = (now, data)
        return data
    except Exception as e:  # noqa: BLE001
        logger.warning("IG positioning fetch failed for %s: %s", asset_id, e)
        return None


# --- Unified facade ---------------------------------------------------------

async def get_retail_positioning(asset_id: str) -> Optional[Dict[str, Any]]:
    """Return real-money retail positioning for the given asset.

    Tries MyFxBook first (forex/metals/oil/BTC), then IG.com (indices/commodities).
    """
    data = await get_myfxbook_positioning(asset_id)
    if data:
        return data
    return await get_ig_positioning(asset_id)
