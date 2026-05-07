"""
MyFxBook Community Outlook Scraper - REAL Retail Positioning

Fetches REAL trader positioning from MyFxBook community for ALL symbols.
Returns actual long/short percentages from verified live accounts.
"""
from __future__ import annotations

import logging
from typing import Dict, Any, Optional, List
import httpx
import os

logger = logging.getLogger(__name__)

# Cache for MyFxBook session and data
_myfxbook_session_id: Optional[str] = None
_myfxbook_data_cache: Optional[Dict[str, Any]] = None
_myfxbook_cache_timestamp: Optional[float] = None
_CACHE_TTL_SECONDS = 3600  # 1 hour (MyFxBook updates every 60s but we don't need that frequency)


async def _get_myfxbook_session() -> Optional[str]:
    """Get or create MyFxBook session ID."""
    global _myfxbook_session_id
    
    if _myfxbook_session_id:
        return _myfxbook_session_id
    
    email = os.environ.get("MYFXBOOK_EMAIL")
    password = os.environ.get("MYFXBOOK_PASSWORD")
    
    if not email or not password:
        logger.warning("MyFxBook credentials not configured")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://www.myfxbook.com/api/login.json",
                data={"email": email, "password": password}
            )
            
            if response.status_code != 200:
                logger.error(f"MyFxBook login failed: {response.status_code}")
                return None
            
            data = response.json()
            
            if data.get("error"):
                logger.error(f"MyFxBook login error: {data.get('message')}")
                return None
            
            session_id = data.get("session")
            if session_id:
                _myfxbook_session_id = session_id
                logger.info("MyFxBook session created successfully")
                return session_id
            
            return None
            
    except Exception as e:
        logger.error(f"Failed to create MyFxBook session: {e}")
        return None


async def fetch_all_myfxbook_positioning() -> Optional[Dict[str, Dict[str, Any]]]:
    """Fetch ALL symbols positioning from MyFxBook community outlook.
    
    Returns:
        Dict mapping symbol name to positioning data
    """
    global _myfxbook_data_cache, _myfxbook_cache_timestamp
    
    import time
    now = time.time()
    
    # Return cache if still valid
    if _myfxbook_data_cache and _myfxbook_cache_timestamp:
        if (now - _myfxbook_cache_timestamp) < _CACHE_TTL_SECONDS:
            return _myfxbook_data_cache
    
    session_id = await _get_myfxbook_session()
    if not session_id:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://www.myfxbook.com/api/get-community-outlook.json",
                params={"session": session_id}
            )
            
            if response.status_code != 200:
                logger.warning(f"MyFxBook API returned {response.status_code}")
                return None
            
            data = response.json()
            
            if data.get("error"):
                logger.warning(f"MyFxBook API error: {data.get('message')}")
                return None
            
            # Parse symbols
            symbols = data.get("symbols", [])
            if not symbols:
                return None
            
            # Build lookup dict
            positioning_map = {}
            for symbol in symbols:
                name = symbol.get("name", "").upper()
                if name:
                    positioning_map[name] = {
                        "longPercentage": float(symbol.get("longPercentage", 50)),
                        "shortPercentage": float(symbol.get("shortPercentage", 50)),
                        "longPositions": int(symbol.get("longPositions", 0)),
                        "shortPositions": int(symbol.get("shortPositions", 0)),
                        "totalPositions": int(symbol.get("totalPositions", 0)),
                        "source": "MyFxBook Real Accounts"
                    }
            
            # Cache results
            _myfxbook_data_cache = positioning_map
            _myfxbook_cache_timestamp = now
            
            logger.info(f"Fetched MyFxBook positioning for {len(positioning_map)} symbols")
            return positioning_map
            
    except Exception as e:
        logger.warning(f"Failed to fetch MyFxBook community outlook: {e}")
        return None


async def get_myfxbook_positioning(asset_id: str) -> Optional[Dict[str, Any]]:
    """Get positioning for specific asset from MyFxBook.
    
    Args:
        asset_id: Asset identifier (e.g., "EURUSD", "GOLD")
        
    Returns:
        Dict with longPercentage, shortPercentage, source
    """
    # Symbol mapping
    symbol_map = {
        "EURUSD": "EURUSD",
        "GBPUSD": "GBPUSD",
        "USDJPY": "USDJPY",
        "AUDUSD": "AUDUSD",
        "USDCAD": "USDCAD",
        "USDCHF": "USDCHF",
        "NZDUSD": "NZDUSD",
        "GOLD": "XAUUSD",
        "SILVER": "XAGUSD",
        "OIL": "USOIL",
        "BTC": "BTCUSD",
    }
    
    symbol = symbol_map.get(asset_id)
    if not symbol:
        return None
    
    # Fetch all positioning data
    all_positioning = await fetch_all_myfxbook_positioning()
    if not all_positioning:
        return None
    
    # Get specific symbol
    positioning = all_positioning.get(symbol)
    if not positioning:
        logger.debug(f"Symbol {symbol} not found in MyFxBook data")
        return None
    
    return positioning
