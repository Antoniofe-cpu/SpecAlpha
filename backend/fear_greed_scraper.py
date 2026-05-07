"""
Alternative.me Fear & Greed Index Scraper

Fetches crypto market sentiment from Alternative.me (100% free, no API key needed).
Provides Fear & Greed Index (0-100 scale) with historical data.
"""
from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional
import httpx

logger = logging.getLogger(__name__)

# Map COT asset IDs to Fear & Greed support
# Alternative.me provides crypto-wide sentiment (Bitcoin-based but affects all crypto)
FEAR_GREED_ASSETS = {"BTC", "ETH", "CRYPTO"}  # Can be used as proxy for all crypto


async def fetch_fear_greed_index(days: int = 30) -> Optional[Dict[str, Any]]:
    """Fetch Fear & Greed Index from Alternative.me.
    
    Args:
        days: Number of days of historical data (1-365)
        
    Returns:
        Dict with current value, classification, and historical data
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # API: limit=0 for latest only, or limit=N for N days
            response = await client.get(
                "https://api.alternative.me/fng/",
                params={"limit": min(days, 365)},
            )
            
            if response.status_code != 200:
                logger.warning(f"Fear & Greed API returned {response.status_code}")
                return None
            
            data = response.json()
            
            if not data or "data" not in data or not data["data"]:
                logger.warning("Fear & Greed API returned empty data")
                return None
            
            # Parse response
            latest = data["data"][0]  # Most recent
            history = data["data"][1:] if len(data["data"]) > 1 else []
            
            # Convert to sentiment score (-100 to +100 scale for consistency)
            # Fear & Greed is 0-100: 0=Extreme Fear, 100=Extreme Greed
            # Convert: FG 0 → Sentiment -100, FG 50 → 0, FG 100 → +100
            fg_value = int(latest.get("value", 50))
            sentiment_score = (fg_value - 50) * 2  # Scale to -100/+100
            
            # Map classification to our format
            classification = latest.get("value_classification", "Neutral")
            
            # Convert to long/short percentages
            # Fear (0-49) = more shorts, Greed (51-100) = more longs
            long_pct = fg_value
            short_pct = 100 - fg_value
            
            return {
                "value": fg_value,
                "classification": classification,
                "sentimentScore": sentiment_score,
                "longPercentage": float(long_pct),
                "shortPercentage": float(short_pct),
                "timestamp": latest.get("timestamp"),
                "timeUntilUpdate": latest.get("time_until_update"),
                "history": [
                    {
                        "date": h.get("timestamp"),
                        "value": int(h.get("value", 50)),
                        "classification": h.get("value_classification", ""),
                    }
                    for h in history
                ],
                "source": "Alternative.me Fear & Greed Index",
            }
            
    except Exception as e:
        logger.warning(f"Failed to fetch Fear & Greed Index: {e}")
        return None


async def get_retail_sentiment(asset_id: str) -> Optional[Dict[str, Any]]:
    """Get retail sentiment for crypto assets using Fear & Greed Index.
    
    Args:
        asset_id: Asset identifier (e.g., "BTC", "ETH")
        
    Returns:
        Dict with longPercentage, shortPercentage, source, or None
    """
    # Only supported for crypto assets
    if asset_id not in FEAR_GREED_ASSETS:
        return None
    
    fg_data = await fetch_fear_greed_index(days=1)
    if not fg_data:
        return None
    
    return {
        "longPercentage": fg_data["longPercentage"],
        "shortPercentage": fg_data["shortPercentage"],
        "source": "Fear & Greed Index (Retail)",
        "rawValue": fg_data["value"],
        "classification": fg_data["classification"],
    }
