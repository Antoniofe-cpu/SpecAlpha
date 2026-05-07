"""
TradingView Technical Analysis Scraper

Scrapes technical summary from TradingView for all asset classes.
TradingView provides aggregated sentiment from technical indicators (MA, RSI, MACD, etc.)
Perfect for contrarian strategy - no auth required.
"""
from __future__ import annotations

import logging
from typing import Dict, Any, Optional
import httpx
import json

logger = logging.getLogger(__name__)

# TradingView symbol mapping
TRADINGVIEW_SYMBOL_MAP: Dict[str, Dict[str, str]] = {
    # Forex
    "EURUSD": {"symbol": "FX:EURUSD", "exchange": "FX_IDC"},
    "GBPUSD": {"symbol": "FX:GBPUSD", "exchange": "FX_IDC"},
    "USDJPY": {"symbol": "FX:USDJPY", "exchange": "FX_IDC"},
    "AUDUSD": {"symbol": "FX:AUDUSD", "exchange": "FX_IDC"},
    "USDCAD": {"symbol": "FX:USDCAD", "exchange": "FX_IDC"},
    "USDCHF": {"symbol": "FX:USDCHF", "exchange": "FX_IDC"},
    "NZDUSD": {"symbol": "FX:NZDUSD", "exchange": "FX_IDC"},
    
    # Indices
    "SP500": {"symbol": "SP:SPX", "exchange": "SP"},
    "NAS100": {"symbol": "NASDAQ:NDX", "exchange": "NASDAQ"},
    "DOW": {"symbol": "DJ:DJI", "exchange": "DJ"},
    "RUSSELL": {"symbol": "TVC:RUT", "exchange": "TVC"},
    
    # Commodities
    "GOLD": {"symbol": "TVC:GOLD", "exchange": "TVC"},
    "SILVER": {"symbol": "TVC:SILVER", "exchange": "TVC"},
    "COPPER": {"symbol": "COMEX:HG1!", "exchange": "COMEX"},
    "OIL": {"symbol": "TVC:USOIL", "exchange": "TVC"},
    "NATGAS": {"symbol": "NYMEX:NG1!", "exchange": "NYMEX"},
    
    # Crypto
    "BTC": {"symbol": "BINANCE:BTCUSDT", "exchange": "BINANCE"},
    "ETH": {"symbol": "BINANCE:ETHUSDT", "exchange": "BINANCE"},
}


async def fetch_tradingview_sentiment(asset_id: str) -> Optional[Dict[str, Any]]:
    """Fetch technical sentiment from TradingView for contrarian analysis.
    
    TradingView aggregates 26 indicators into a sentiment:
    - Strong Buy / Buy / Neutral / Sell / Strong Sell
    
    CONTRARIAN INTERPRETATION:
    - Strong Buy (>15 indicators buy) = Retail overextended → SELL
    - Strong Sell (>15 indicators sell) = Retail panic → BUY
    
    Args:
        asset_id: Asset identifier
        
    Returns:
        Dict with longPercentage, shortPercentage, contrarian signal
    """
    mapping = TRADINGVIEW_SYMBOL_MAP.get(asset_id)
    if not mapping:
        return None
    
    try:
        # TradingView's technical analysis endpoint (public, no auth)
        # Different scanner endpoints for different asset types
        if asset_id in {"BTC", "ETH"}:
            scanner_type = "crypto"
        elif asset_id in {"EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"}:
            scanner_type = "forex"
        elif asset_id in {"SP500", "NAS100", "DOW", "RUSSELL"}:
            scanner_type = "america"
        else:
            scanner_type = "global"  # Commodities and others
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            payload = {
                "symbols": {
                    "tickers": [mapping["symbol"]],
                },
                "columns": [
                    "Recommend.All",
                    "Recommend.MA", 
                    "Recommend.Other",
                ]
            }
            
            response = await client.post(
                f"https://scanner.tradingview.com/{scanner_type}/scan",
                json=payload,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code != 200:
                logger.warning(f"TradingView API returned {response.status_code}")
                return None
            
            data = response.json()
            
            if not data.get("data") or len(data["data"]) == 0:
                return None
            
            # Extract technical analysis
            row = data["data"][0]
            d = row.get("d", [])
            
            if len(d) < 3:
                return None
            
            # d[0] = Overall recommendation (-1 to +1 scale)
            # d[1] = Moving averages recommendation
            # d[2] = Other indicators recommendation
            overall = float(d[0]) if d[0] is not None else 0
            ma_signal = float(d[1]) if d[1] is not None else 0
            other_signal = float(d[2]) if d[2] is not None else 0
            
            # Convert -1 to +1 scale to percentage
            # -1 = 100% sell (0% long), 0 = 50/50, +1 = 100% buy (100% long)
            long_pct = ((overall + 1) / 2) * 100
            short_pct = 100 - long_pct
            
            # Determine contrarian signal
            if overall >= 0.6:  # Strong buy (>80% bullish)
                signal = "SELL"
                strength = "Strong"
                logic = f"Technical overextended bullish ({long_pct:.0f}% long)"
            elif overall >= 0.2:
                signal = "SELL"
                strength = "Weak"
                logic = f"Technical bullish ({long_pct:.0f}% long)"
            elif overall <= -0.6:  # Strong sell (<20% bullish)
                signal = "BUY"
                strength = "Strong"
                logic = f"Technical oversold ({long_pct:.0f}% long)"
            elif overall <= -0.2:
                signal = "BUY"
                strength = "Weak"
                logic = f"Technical bearish ({long_pct:.0f}% long)"
            else:
                signal = "NEUTRAL"
                strength = "None"
                logic = f"Technical neutral ({long_pct:.0f}% long)"
            
            # Classify overall sentiment
            if overall >= 0.5:
                classification = "Strong Buy"
            elif overall >= 0.1:
                classification = "Buy"
            elif overall >= -0.1:
                classification = "Neutral"
            elif overall >= -0.5:
                classification = "Sell"
            else:
                classification = "Strong Sell"
            
            return {
                "longPercentage": round(long_pct, 1),
                "shortPercentage": round(short_pct, 1),
                "source": "TradingView Technical",
                "rawValue": round(overall, 2),
                "classification": classification,
                "components": {
                    "overall": round(overall, 2),
                    "movingAverages": round(ma_signal, 2),
                    "indicators": round(other_signal, 2),
                },
                "contrarian": {
                    "signal": signal,
                    "strength": strength,
                    "logic": logic
                }
            }
            
    except Exception as e:
        logger.warning(f"Failed to fetch TradingView sentiment for {asset_id}: {e}")
        return None
