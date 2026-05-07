"""
COT-based Sentiment Calculator

Calculates market sentiment metrics from Commitment of Traders positioning data.
Provides sentiment score, historical trend, and interpretation.
"""
from __future__ import annotations

import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def calculate_sentiment_score(net_position: float, wow_delta: float, long_pos: int, short_pos: int) -> float:
    """Calculate a sentiment score from -100 (extreme bearish) to +100 (extreme bullish).
    
    Combines:
    - Net positioning (weight: 40%)
    - Week-over-week delta momentum (weight: 40%)
    - Long/short ratio (weight: 20%)
    """
    total_positions = long_pos + short_pos
    if total_positions == 0:
        return 0.0
    
    # Normalize net position to -1 to +1 scale (typical range: -150k to +150k)
    net_norm = max(-1.0, min(1.0, net_position / 150000))
    
    # Normalize delta to -1 to +1 scale (typical range: -30k to +30k)
    delta_norm = max(-1.0, min(1.0, wow_delta / 30000))
    
    # Calculate long/short ratio normalized to -1 to +1
    # ratio > 2 = bullish, ratio < 0.5 = bearish
    ratio = long_pos / short_pos if short_pos > 0 else 1.0
    if ratio > 1:
        ratio_norm = min(1.0, (ratio - 1) / 2)  # 1-3 maps to 0-1
    else:
        ratio_norm = max(-1.0, (ratio - 1) * 2)  # 0-1 maps to -2-0, scaled to -1-0
    
    # Weighted combination
    sentiment = (net_norm * 0.4 + delta_norm * 0.4 + ratio_norm * 0.2) * 100
    
    return round(sentiment, 2)


def interpret_sentiment(score: float) -> str:
    """Return human-readable interpretation of sentiment score."""
    if score >= 70:
        return "Extremely Bullish"
    elif score >= 40:
        return "Bullish"
    elif score >= 10:
        return "Slightly Bullish"
    elif score > -10:
        return "Neutral"
    elif score > -40:
        return "Slightly Bearish"
    elif score > -70:
        return "Bearish"
    else:
        return "Extremely Bearish"


def get_sentiment_color(score: float) -> str:
    """Return color code for sentiment visualization."""
    if score >= 40:
        return "#10b981"  # green
    elif score >= 10:
        return "#34d399"  # light green
    elif score > -10:
        return "#94a3b8"  # gray
    elif score > -40:
        return "#fb7185"  # light red
    else:
        return "#f43f5e"  # red


def calculate_sentiment_from_cot(cot_data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate comprehensive sentiment metrics from COT snapshot.
    
    Args:
        cot_data: COT snapshot with netPosition, wowDelta, long, short
        
    Returns:
        Dictionary with sentiment score, interpretation, color, and components
    """
    net_position = cot_data.get("netPosition", 0) or 0
    wow_delta = cot_data.get("wowDelta", 0) or 0
    long_pos = cot_data.get("long", 0) or 0
    short_pos = cot_data.get("short", 0) or 0
    
    score = calculate_sentiment_score(net_position, wow_delta, long_pos, short_pos)
    interpretation = interpret_sentiment(score)
    color = get_sentiment_color(score)
    
    # Calculate percentage of longs vs shorts
    total = long_pos + short_pos
    long_pct = round((long_pos / total * 100), 1) if total > 0 else 50.0
    short_pct = round((short_pos / total * 100), 1) if total > 0 else 50.0
    
    return {
        "score": score,
        "interpretation": interpretation,
        "color": color,
        "longPercentage": long_pct,
        "shortPercentage": short_pct,
        "components": {
            "netPosition": net_position,
            "wowDelta": wow_delta,
            "long": long_pos,
            "short": short_pos,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def calculate_sentiment_history(history: List[Dict[str, Any]], limit: int = 12) -> List[Dict[str, Any]]:
    """Calculate sentiment scores for historical COT data.
    
    Args:
        history: List of COT snapshots (most recent first)
        limit: Maximum number of historical points to return
        
    Returns:
        List of sentiment data points with date and score
    """
    sentiment_history = []
    
    for entry in history[:limit]:
        net = entry.get("netPosition", 0) or 0
        delta = entry.get("wowDelta", 0) or 0
        long_pos = entry.get("long", 0) or 0
        short_pos = entry.get("short", 0) or 0
        date = entry.get("date", "")
        
        score = calculate_sentiment_score(net, delta, long_pos, short_pos)
        
        sentiment_history.append({
            "date": date,
            "score": score,
            "interpretation": interpret_sentiment(score),
        })
    
    return sentiment_history
