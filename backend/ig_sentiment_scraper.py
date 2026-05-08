"""
IG.com Client Sentiment Scraper

Extracts long/short percentages from public IG.com market pages (no login required).
Uses Playwright headless because the percentages are injected by client-side JS.

Coverage focus: indices, commodities, FX where MyFxBook is missing or unreliable.
"""
from __future__ import annotations

import logging
import re
import time
import asyncio
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# Asset id → IG.com public URL slug
# Coverage focus: indices + select commodities (MyFxBook covers forex/metals/oil/BTC).
IG_URLS: Dict[str, str] = {
    # Indices
    "SP500": "https://www.ig.com/it/indici/mercati-indici/us-spx-500",
    "NAS100": "https://www.ig.com/it/indici/mercati-indici/us-tech-100",
    "DOW": "https://www.ig.com/it/indici/mercati-indici/wall-street",
    "RUSSELL": "https://www.ig.com/it/indici/mercati-indici/us-russell-2000",
    "VIX": "https://www.ig.com/it/indici/mercati-indici/volatility-index",
    # Commodities (Gold also has MyFxBook XAUUSD; IG is fallback)
    "GOLD": "https://www.ig.com/it/materie-prime/mercati-materie-prime/gold",
    "SILVER": "https://www.ig.com/it/materie-prime/mercati-materie-prime/silver",
    "COPPER": "https://www.ig.com/it/materie-prime/mercati-materie-prime/copper",
    "NATGAS": "https://www.ig.com/it/materie-prime/mercati-materie-prime/natural-gas",
}

# Cache: asset_id → (timestamp, data)
_cache: Dict[str, tuple] = {}
_CACHE_TTL = 30 * 60  # 30 minutes (IG updates ~every 15 min)
_browser = None
_browser_lock = asyncio.Lock()


async def _get_browser():
    global _browser
    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            from playwright.async_api import async_playwright
            pw = await async_playwright().start()
            _browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
            )
        return _browser


async def fetch_ig_sentiment(asset_id: str) -> Optional[Dict[str, Any]]:
    """Fetch IG client sentiment for the given asset id.

    Returns dict with longPercentage, shortPercentage, source — or None.
    """
    asset_id = asset_id.upper()
    url = IG_URLS.get(asset_id)
    if not url:
        return None

    now = time.time()
    if asset_id in _cache:
        ts, data = _cache[asset_id]
        if (now - ts) < _CACHE_TTL:
            return data

    try:
        browser = await _get_browser()
        ctx = await browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            locale="it-IT",
            viewport={"width": 1280, "height": 800},
        )
        page = await ctx.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Wait for the canonical IG sentiment phrase to be populated by JS
            try:
                await page.wait_for_function(
                    """() => {
                        const t = document.body.innerText || '';
                        return /\\d{1,3}\\s*%\\s*dei\\s*client[ie]\\s*ha\\s*posizioni/i.test(t);
                    }""",
                    timeout=15000,
                )
            except Exception:
                pass

            html = await page.content()
        finally:
            await ctx.close()

        # Extract first Long X% / Short Y% pair
        long_pct, short_pct = _extract_long_short(html)
        if long_pct is None or short_pct is None:
            logger.warning(f"IG sentiment not found in page for {asset_id}")
            return None

        data = {
            "longPercentage": float(long_pct),
            "shortPercentage": float(short_pct),
            "source": "IG.com Client Sentiment",
        }
        _cache[asset_id] = (now, data)
        return data
    except Exception as e:
        logger.warning(f"IG sentiment fetch failed for {asset_id}: {e}")
        return None


def _extract_long_short(html: str) -> tuple[Optional[int], Optional[int]]:
    """Find the primary 'X% dei clienti ha posizioni long/short su questo mercato' line.

    The IG page renders this as:
        <span class="price-ticket__percent">55%</span> ... dei clienti
        <strong>ha posizioni short</strong> su questo mercato
    """
    # Pattern A (primary): price-ticket__percent span followed by 'ha posizioni long|short'
    m = re.search(
        r'price-ticket__percent[^>]*>\s*(\d{1,3})\s*%\s*</span>[\s\S]{0,400}?ha\s*posizioni\s*(long|short)\s*</?(?:strong|b|span|em)?>?\s*su\s*questo\s*mercato',
        html,
        re.IGNORECASE,
    )
    if m:
        pct = int(m.group(1))
        side = m.group(2).lower()
        if side == "long":
            return pct, 100 - pct
        else:
            return 100 - pct, pct

    # Pattern A2 (fallback, plain text after HTML stripping)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)
    m = re.search(
        r"(\d{1,3})\s*%\s*dei\s*client[ie]\s*ha\s*posizioni\s*(long|short)\s*su\s*questo\s*mercato",
        text,
        re.IGNORECASE,
    )
    if m:
        pct = int(m.group(1))
        side = m.group(2).lower()
        if side == "long":
            return pct, 100 - pct
        else:
            return 100 - pct, pct

    # Pattern B: 'Long X% Short Y%' close together (donut labels) — last resort
    m = re.search(
        r"Long\s*[^A-Za-z0-9%]{0,10}(\d{1,3})\s*%\s*[^A-Za-z0-9%]{0,40}Short\s*[^A-Za-z0-9%]{0,10}(\d{1,3})\s*%",
        html,
        re.IGNORECASE,
    )
    if m:
        l = int(m.group(1)); s = int(m.group(2))
        if 0 <= l <= 100 and 0 <= s <= 100 and 95 <= (l + s) <= 105:
            return l, s

    return None, None


async def shutdown_ig_scraper():
    """Cleanly shut down the shared browser."""
    global _browser
    async with _browser_lock:
        if _browser is not None:
            try:
                await _browser.close()
            except Exception:
                pass
            _browser = None
