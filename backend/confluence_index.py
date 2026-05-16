"""
Speculative Alpha — Proprietary Confluence Index

A 0-100 score that synthesises three institutional data streams into a single
probability-of-bullish-move signal for the coming week.

Composition (weights match the product spec):
  • COT 40%       — Non-Commercials net positioning + WoW momentum
  • Options 40%   — Put/Call ratio + Gamma Exposure regime
  • Sentiment 20% — Contrarian to Commercials (retail) positioning

Scale:
  0   = extreme bearish probability
  50  = balanced / no edge
  100 = extreme bullish probability
"""
from __future__ import annotations

from typing import Dict, Any, Optional


def _clip(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _cot_component(snapshot: Dict[str, Any]) -> float:
    """Map Non-Commercial positioning + momentum to a 0-100 sub-score.

    50 = balanced. Above = institutional accumulation. Below = institutional distribution.
    """
    long_pos = snapshot.get("long", 0) or 0
    short_pos = snapshot.get("short", 0) or 0
    wow_delta = snapshot.get("wowDelta", 0) or 0

    total = long_pos + short_pos
    if total <= 0:
        return 50.0

    # Net positioning component (60% of COT score): -1..+1 -> 0..100
    net_ratio = (long_pos - short_pos) / total
    net_score = 50 + (net_ratio * 50)

    # WoW momentum component (40% of COT score): institutional flow direction
    # Typical absolute weekly delta is 5k-20k; cap at 30k for normalisation
    momentum_norm = max(-1.0, min(1.0, wow_delta / 30000.0))
    momentum_score = 50 + (momentum_norm * 50)

    return _clip(0.6 * net_score + 0.4 * momentum_score)


def _options_component(options_data: Optional[Dict[str, Any]]) -> float:
    """Map options analytics (PCR + GEX sign) to a 0-100 sub-score.

    Returns 50 (neutral) when no options data is available.
    """
    if not options_data or not isinstance(options_data, dict):
        return 50.0

    # Two sub-signals: PCR (Put/Call ratio) and GEX (gamma regime)
    pcr_score = 50.0
    gex_score = 50.0

    # Put/Call Ratio: < 0.7 = bullish; > 1.2 = bearish; 1.0 = neutral
    pcr = options_data.get("putCallRatioOI") or options_data.get("pcr")
    if pcr is not None:
        try:
            pcr_val = float(pcr)
            # Invert: low PCR (few puts) = bullish positioning
            # Map 0.5 -> 80, 1.0 -> 50, 1.5 -> 20
            pcr_score = _clip(50 + (1.0 - pcr_val) * 60.0)
        except (TypeError, ValueError):
            pass

    # Net GEX sign: positive = market makers long gamma = pin/stable = mild bullish
    # Negative = short gamma = vol expansion = bearish skew
    net_gex = options_data.get("netGex") or options_data.get("netGEX")
    if net_gex is not None:
        try:
            gex_val = float(net_gex)
            # Normalise: |gex| > 1e9 is large
            gex_norm = max(-1.0, min(1.0, gex_val / 1e9))
            gex_score = _clip(50 + gex_norm * 35)
        except (TypeError, ValueError):
            pass

    return _clip(0.6 * pcr_score + 0.4 * gex_score)


def _sentiment_component(snapshot: Dict[str, Any]) -> float:
    """Contrarian sub-score: extreme retail (Commercials) positioning → opposite signal.

    Commercials are typically hedgers (net short producers, e.g. gold miners).
    When retail (commercials) goes extremely long, that's a fade signal.
    When retail goes extremely short, that's a buy signal.

    Returns 50 (neutral) when retail data is missing.
    """
    r_long = snapshot.get("retailLong", 0) or 0
    r_short = snapshot.get("retailShort", 0) or 0
    total = r_long + r_short
    if total <= 0:
        return 50.0

    retail_long_pct = (r_long / total) * 100.0

    # Contrarian: invert. 80% retail long → score 20 (bearish action).
    # 20% retail long → score 80 (bullish action).
    return _clip(100.0 - retail_long_pct)


def _label_for_score(score: float) -> str:
    if score >= 80:
        return "Strong Bullish"
    elif score >= 65:
        return "Bullish"
    elif score >= 55:
        return "Mildly Bullish"
    elif score > 45:
        return "Neutral"
    elif score > 35:
        return "Mildly Bearish"
    elif score > 20:
        return "Bearish"
    else:
        return "Strong Bearish"


def calculate_confluence_index(
    cot_snapshot: Dict[str, Any],
    options_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute the full Confluence Index payload for an asset.

    Args:
        cot_snapshot: a snapshot from `fetch_cot_latest` (must include retail* fields)
        options_data: optional `get_options_analytics` result; can be None for FX

    Returns:
        Dict with keys: score, label, components: {cot, options, sentiment}
    """
    cot_score = _cot_component(cot_snapshot)
    opt_score = _options_component(options_data)
    sent_score = _sentiment_component(cot_snapshot)

    # Weighted aggregation matching product spec
    final_score = 0.4 * cot_score + 0.4 * opt_score + 0.2 * sent_score
    final_score = _clip(final_score)

    return {
        "score": round(final_score, 1),
        "label": _label_for_score(final_score),
        "components": {
            "cot": round(cot_score, 1),
            "options": round(opt_score, 1),
            "sentiment": round(sent_score, 1),
            "weights": {"cot": 0.4, "options": 0.4, "sentiment": 0.2},
        },
    }
