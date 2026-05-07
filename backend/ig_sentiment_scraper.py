"""
IG Markets Sentiment & Price Data Scraper

Fetches real-time client sentiment and historical price data from IG Markets
using the trading-ig library.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from trading_ig import IGService
from trading_ig.config import ConfigEnvVar

logger = logging.getLogger(__name__)

# IG Markets EPIC mapping for COT assets
# EPIC codes are IG's internal market identifiers
IG_EPIC_MAP: Dict[str, str] = {
    # Indices
    "SP500":   "IX.D.SPTRD.IFE.IP",      # S&P 500
    "NAS100":  "IX.D.NASDAQ.IFE.IP",     # NASDAQ 100
    "DOW":     "IX.D.DOW.IFE.IP",        # Dow Jones
    "RUSSELL": "IX.D.RUSSELL.IFE.IP",    # Russell 2000
    
    # Commodities
    "GOLD":    "CS.D.CFEGOLD.CFE.IP",    # Gold
    "SILVER":  "CS.D.CFESILVER.CFE.IP",  # Silver
    "COPPER":  "CS.D.COPPER.CFE.IP",     # Copper
    "OIL":     "CS.D.USCRD.CFE.IP",      # WTI Crude Oil
    "NATGAS":  "CS.D.NGAS.CFE.IP",       # Natural Gas
    
    # Forex
    "EURUSD":  "CS.D.EURUSD.CFD.IP",     # EUR/USD
    "GBPUSD":  "CS.D.GBPUSD.CFD.IP",     # GBP/USD
    "USDJPY":  "CS.D.USDJPY.CFD.IP",     # USD/JPY
    "AUDUSD":  "CS.D.AUDUSD.CFD.IP",     # AUD/USD
    "NZDUSD":  "CS.D.NZDUSD.CFD.IP",     # NZD/USD
    "USDCAD":  "CS.D.USDCAD.CFD.IP",     # USD/CAD
    "USDCHF":  "CS.D.USDCHF.CFD.IP",     # USD/CHF
    
    # Crypto
    "BTC":     "CS.D.BITCOIN.CFD.IP",    # Bitcoin
}

# Cache for IG service instance
_ig_service: Optional[IGService] = None
_ig_service_timestamp: Optional[datetime] = None
_SESSION_TTL_MINUTES = 30


def _get_ig_service() -> Optional[IGService]:
    """Get or create IG service instance with session management."""
    global _ig_service, _ig_service_timestamp
    
    # Check if we need to create or refresh session
    now = datetime.now(timezone.utc)
    if _ig_service is None or _ig_service_timestamp is None or \
       (now - _ig_service_timestamp).total_seconds() > (_SESSION_TTL_MINUTES * 60):
        
        username = os.environ.get("IG_USERNAME")
        password = os.environ.get("IG_PASSWORD")
        api_key = os.environ.get("IG_API_KEY") or ""  # API key is optional but recommended
        acc_type = os.environ.get("IG_ACC_TYPE", "DEMO")
        
        if not username or not password:
            logger.warning("IG Markets credentials not found in environment")
            return None
        
        if not api_key:
            logger.warning(
                "IG_API_KEY not set. To get an API key: "
                "1) Log into IG Web Platform, 2) Go to 'My IG' > 'Settings' > 'API Keys', "
                "3) Create a new key for your DEMO account, 4) Add to .env as IG_API_KEY=..."
            )
            return None
        
        try:
            _ig_service = IGService(
                username=username,
                password=password,
                api_key=api_key,
                acc_type=acc_type
            )
            _ig_service.create_session()
            _ig_service_timestamp = now
            logger.info(f"IG Markets session created ({acc_type} account)")
        except Exception as e:
            logger.error(f"Failed to create IG Markets session: {e}")
            _ig_service = None
            return None
    
    return _ig_service


async def fetch_ig_sentiment(asset_id: str) -> Optional[Dict[str, Any]]:
    """Fetch client sentiment from IG Markets for a specific asset.
    
    Returns:
        Dict with longPercentage, shortPercentage, or None if unavailable
    """
    epic = IG_EPIC_MAP.get(asset_id)
    if not epic:
        logger.debug(f"No IG EPIC mapping for {asset_id}")
        return None
    
    ig_service = _get_ig_service()
    if not ig_service:
        return None
    
    try:
        # Fetch client sentiment via trading-ig
        sentiment = ig_service.fetch_client_sentiment(epic)
        
        if not sentiment:
            return None
        
        return {
            "longPercentage": float(sentiment.get("longPositionPercentage", 50)),
            "shortPercentage": float(sentiment.get("shortPositionPercentage", 50)),
            "source": "IG Markets",
            "epic": epic,
        }
    except Exception as e:
        logger.warning(f"Failed to fetch IG sentiment for {asset_id} ({epic}): {e}")
        return None


async def fetch_ig_price_history(asset_id: str, days: int = 90) -> Optional[List[Dict[str, Any]]]:
    """Fetch historical price data from IG Markets.
    
    Args:
        asset_id: Asset identifier (e.g., "SP500", "GOLD")
        days: Number of days of history to fetch (default 90)
        
    Returns:
        List of dicts with date and price, or None if unavailable
    """
    epic = IG_EPIC_MAP.get(asset_id)
    if not epic:
        return None
    
    ig_service = _get_ig_service()
    if not ig_service:
        return None
    
    try:
        # Calculate date range
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        # Fetch historical prices (daily resolution)
        # trading-ig uses format: YYYY-MM-DD HH:MM:SS
        start_str = start_date.strftime("%Y-%m-%d %H:%M:%S")
        end_str = end_date.strftime("%Y-%m-%d %H:%M:%S")
        
        prices = ig_service.fetch_historical_prices_by_epic_and_date_range(
            epic=epic,
            resolution="D",  # Daily
            start_date=start_str,
            end_date=end_str
        )
        
        if not prices or "prices" not in prices:
            return None
        
        # Extract price data
        price_list = prices["prices"]
        if not price_list:
            return None
        
        # Convert to our format
        history = []
        for entry in price_list:
            snapshot_time = entry.get("snapshotTime") or entry.get("snapshotTimeUTC")
            if not snapshot_time:
                continue
            
            # Parse date (format: 2026/05/07 00:00:00)
            try:
                dt = datetime.strptime(snapshot_time, "%Y/%m/%d %H:%M:%S")
                date_str = dt.strftime("%Y-%m-%d")
            except:
                # Try alternative format
                try:
                    dt = datetime.strptime(snapshot_time.split()[0], "%Y/%m/%d")
                    date_str = dt.strftime("%Y-%m-%d")
                except:
                    continue
            
            # Get close price (or last traded price)
            close_price = entry.get("closePrice", {}).get("bid")
            if close_price is None:
                close_price = entry.get("lastTradedPrice", {}).get("bid")
            
            if close_price is not None:
                history.append({
                    "date": date_str,
                    "price": float(close_price),
                })
        
        return history
        
    except Exception as e:
        logger.warning(f"Failed to fetch IG price history for {asset_id} ({epic}): {e}")
        return None


async def get_ig_data(asset_id: str) -> Dict[str, Any]:
    """Get both sentiment and price history from IG Markets.
    
    Returns dict with:
    - sentiment: {longPercentage, shortPercentage, source} or None
    - priceHistory: [{date, price}, ...] or None
    """
    sentiment = await fetch_ig_sentiment(asset_id)
    price_history = await fetch_ig_price_history(asset_id, days=90)
    
    return {
        "sentiment": sentiment,
        "priceHistory": price_history,
        "available": sentiment is not None or price_history is not None,
    }
