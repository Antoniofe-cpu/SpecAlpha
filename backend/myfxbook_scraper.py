"""
MyFxBook Sentiment Scraper

Fetches community outlook (long/short sentiment) from MyFxBook API.
"""
from __future__ import annotations

import logging
import os
import xml.etree.ElementTree as ET
from typing import Dict, Any, Optional
import httpx

logger = logging.getLogger(__name__)

# Map COT asset IDs to MyFxBook symbols
MYFXBOOK_SYMBOL_MAP: Dict[str, str] = {
    # Forex
    "EURUSD": "EURUSD",
    "GBPUSD": "GBPUSD",
    "USDJPY": "USDJPY",
    "AUDUSD": "AUDUSD",
    "USDCAD": "USDCAD",
    "USDCHF": "USDCHF",
    "NZDUSD": "NZDUSD",
    
    # Gold/Silver (commodities on MyFxBook)
    "GOLD": "XAUUSD",
    "SILVER": "XAGUSD",
    
    # Note: MyFxBook doesn't have direct indices sentiment, only forex & metals
    # For indices, will fallback to COT calculated sentiment
}

# Cache for MyFxBook session
_myfxbook_session_id: Optional[str] = None
_myfxbook_session_timestamp: Optional[float] = None
_SESSION_TTL_HOURS = 24


async def _get_myfxbook_session() -> Optional[str]:
    """Get or create MyFxBook session ID."""
    global _myfxbook_session_id, _myfxbook_session_timestamp
    
    import time
    now = time.time()
    
    # Check if session is still valid
    if _myfxbook_session_id and _myfxbook_session_timestamp:
        if (now - _myfxbook_session_timestamp) < (_SESSION_TTL_HOURS * 3600):
            return _myfxbook_session_id
    
    # Create new session
    email = os.environ.get("MYFXBOOK_EMAIL")
    password = os.environ.get("MYFXBOOK_PASSWORD")
    
    if not email or not password:
        logger.warning("MyFxBook credentials not found in environment")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://www.myfxbook.com/api/login.json",
                data={"email": email, "password": password},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }
            )
            
            if response.status_code != 200:
                logger.error(f"MyFxBook login failed: {response.status_code}")
                return None
            
            # Parse XML response
            root = ET.fromstring(response.text)
            
            # Check for error
            if root.get("error") == "true":
                error_msg = root.get("message", "Unknown error")
                logger.error(f"MyFxBook login error: {error_msg}")
                return None
            
            # Extract session ID
            session_elem = root.find(".//session")
            if session_elem is not None and session_elem.text:
                _myfxbook_session_id = session_elem.text
                _myfxbook_session_timestamp = now
                logger.info("MyFxBook session created successfully")
                return _myfxbook_session_id
            
            logger.error("MyFxBook session ID not found in response")
            return None
            
    except Exception as e:
        logger.error(f"Failed to create MyFxBook session: {e}")
        return None


async def fetch_myfxbook_sentiment(asset_id: str) -> Optional[Dict[str, Any]]:
    """Fetch community sentiment from MyFxBook for a specific asset.
    
    Returns:
        Dict with longPercentage, shortPercentage, or None if unavailable
    """
    symbol = MYFXBOOK_SYMBOL_MAP.get(asset_id)
    if not symbol:
        logger.debug(f"No MyFxBook symbol mapping for {asset_id}")
        return None
    
    session_id = await _get_myfxbook_session()
    if not session_id:
        return None
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                "https://www.myfxbook.com/api/get-community-outlook.json",
                params={"session": session_id},
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                }
            )
            
            if response.status_code != 200:
                logger.warning(f"MyFxBook API returned {response.status_code}")
                return None
            
            # Parse XML response
            root = ET.fromstring(response.text)
            
            # Check for error
            if root.get("error") == "true":
                error_msg = root.get("message", "Unknown error")
                logger.warning(f"MyFxBook API error: {error_msg}")
                return None
            
            # Find our symbol
            for symbol_elem in root.findall(".//symbol"):
                name_elem = symbol_elem.find("name")
                if name_elem is not None and name_elem.text == symbol:
                    # Extract sentiment data
                    long_pct_elem = symbol_elem.find("longPercentage")
                    short_pct_elem = symbol_elem.find("shortPercentage")
                    
                    if long_pct_elem is not None and short_pct_elem is not None:
                        return {
                            "longPercentage": float(long_pct_elem.text),
                            "shortPercentage": float(short_pct_elem.text),
                            "source": "MyFxBook",
                            "symbol": symbol,
                        }
            
            logger.debug(f"Symbol {symbol} not found in MyFxBook response")
            return None
            
    except Exception as e:
        logger.warning(f"Failed to fetch MyFxBook sentiment for {asset_id}: {e}")
        return None
