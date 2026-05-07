"""
FXSSI Retail Sentiment Scraper

Scrapes retail trader sentiment from FXSSI.com for forex, indices, and commodities.
FXSSI aggregates data from multiple brokers - free and public.
Perfect for CONTRARIAN strategies (trade against retail crowd).
"""
from __future__ import annotations

import logging
from typing import Dict, Any, Optional
import httpx
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)

# Map COT asset IDs to FXSSI symbols
FXSSI_SYMBOL_MAP: Dict[str, str] = {
    # Forex
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
    "USDJPY": "USDJPY",
    "AUDUSD": "AUDUSD",
    "USDCAD": "USDCAD",
    "USDCHF": "USDCHF",
    "NZDUSD": "NZDUSD",
    
    # Indices (via CFD)
    "SP500": "US500",  # S&P 500
    "NAS100": "NAS100",  # NASDAQ 100
    "DOW": "US30",  # Dow Jones
    
    # Commodities
    "GOLD": "XAUUSD",
    "SILVER": "XAGUSD",
    "OIL": "USOIL",
}


async def fetch_fxssi_sentiment(asset_id: str) -> Optional[Dict[str, Any]]:
    """Scrape retail sentiment from FXSSI for contrarian analysis.
    
    FXSSI shows % of retail traders long vs short from multiple brokers.
    
    CONTRARIAN INTERPRETATION:
    - >70% long = SELL signal (retail overextended)
    - <30% long = BUY signal (retail capitulated)
    - 40-60% = Neutral
    
    Args:
        asset_id: Asset identifier
        
    Returns:
        Dict with longPercentage, shortPercentage, contrarian signal
    """
    symbol = FXSSI_SYMBOL_MAP.get(asset_id)
    if not symbol:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # FXSSI current ratios page
            response = await client.get(
                "https://fxssi.com/current-ratio",
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }
            )
            
            if response.status_code != 200:
                logger.warning(f"FXSSI returned {response.status_code}")
                return None
            
            # Parse HTML
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Find symbol row (format varies, try multiple selectors)
            # FXSSI shows data in table format with symbol name
            symbol_patterns = [
                symbol.upper(),
                symbol.replace("USD", "/USD"),
                symbol.replace("US", ""),
            ]
            
            long_pct = None
            short_pct = None
            
            # Search for symbol in page
            for pattern in symbol_patterns:
                # Look for pattern in text
                text_content = soup.get_text()
                if pattern in text_content:
                    # Try to extract percentages near the symbol
                    # FXSSI format: "Symbol: XX% long / YY% short"
                    matches = re.findall(rf'{pattern}.*?(\d+(?:\.\d+)?)%.*?(\d+(?:\.\d+)?)%', text_content, re.IGNORECASE)
                    if matches:
                        long_pct = float(matches[0][0])
                        short_pct = float(matches[0][1])
                        break
            
            if long_pct is None or short_pct is None:
                logger.debug(f"Could not parse FXSSI data for {symbol}")
                return None
            
            # Determine contrarian signal
            if long_pct >= 70:
                signal = "SELL"  # Retail overextended long = contrarian short
                strength = "Strong"
            elif long_pct >= 60:
                signal = "SELL"
                strength = "Weak"
            elif long_pct <= 30:
                signal = "BUY"  # Retail capitulated = contrarian long
                strength = "Strong"
            elif long_pct <= 40:
                signal = "BUY"
                strength = "Weak"
            else:
                signal = "NEUTRAL"
                strength = "None"
            
            return {
                "longPercentage": long_pct,
                "shortPercentage": short_pct,
                "source": "FXSSI (Retail)",
                "contrarian": {
                    "signal": signal,
                    "strength": strength,
                    "logic": f"Retail {long_pct:.1f}% long → Trade opposite"
                }
            }
            
    except Exception as e:
        logger.warning(f"Failed to fetch FXSSI sentiment for {asset_id}: {e}")
        return None


async def fetch_vix_fear_gauge() -> Optional[Dict[str, Any]]:
    """Fetch VIX (Volatility Index) as fear gauge for US indices.
    
    VIX > 30 = High fear (contrarian BUY)
    VIX < 15 = Complacency (contrarian SELL)
    
    Returns:
        Dict with VIX value and contrarian interpretation
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Yahoo Finance VIX data
            response = await client.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX",
                params={"range": "1d", "interval": "1d"}
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            quote = data.get("chart", {}).get("result", [{}])[0]
            meta = quote.get("meta", {})
            
            vix_value = meta.get("regularMarketPrice")
            if vix_value is None:
                return None
            
            # Contrarian interpretation
            if vix_value > 30:
                signal = "BUY"
                interpretation = "High Fear"
                strength = "Strong"
            elif vix_value > 20:
                signal = "BUY"
                interpretation = "Elevated Fear"
                strength = "Weak"
            elif vix_value < 12:
                signal = "SELL"
                interpretation = "Complacency"
                strength = "Strong"
            elif vix_value < 15:
                signal = "SELL"
                interpretation = "Low Fear"
                strength = "Weak"
            else:
                signal = "NEUTRAL"
                interpretation = "Normal"
                strength = "None"
            
            # Convert VIX to long/short percentages for consistency
            # VIX 10 = 90% complacent (long bias)
            # VIX 40 = 10% confident (short bias)
            # Inverse relationship
            long_pct = max(0, min(100, 100 - (vix_value * 2)))
            short_pct = 100 - long_pct
            
            return {
                "longPercentage": long_pct,
                "shortPercentage": short_pct,
                "source": "VIX Fear Gauge",
                "rawValue": vix_value,
                "interpretation": interpretation,
                "contrarian": {
                    "signal": signal,
                    "strength": strength,
                    "logic": f"VIX {vix_value:.1f} = {interpretation}"
                }
            }
            
    except Exception as e:
        logger.warning(f"Failed to fetch VIX: {e}")
        return None
