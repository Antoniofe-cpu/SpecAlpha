"""
Speculative Alpha — Proprietary Confluence Index

A 0-100 score that measures HOW MUCH the three institutional data streams
agree with each other. Higher = stronger confluence (= higher probability
the combined signal will resolve in the dominant direction).

The index is direction-agnostic by construction: it goes up when all three
streams point the SAME way (whether long or short) with non-trivial magnitude,
and falls when they disagree or all read neutral.

Composition (weights match the product spec):
  • COT 40%       — Non-Commercials net positioning + WoW momentum
  • Options 40%   — Put/Call ratio + Gamma Exposure regime
  • Sentiment 20% — Contrarian to Commercials (retail) positioning

Scale:
  0   = signals fully cancel out or all flat (no edge)
  100 = all three signals push strongly in the same direction (max confluence)

Companion field `direction` ("long" / "short" / "neutral") is exposed
separately so the UI can pair the strength badge with an arrow if desired.
"""
from __future__ import annotations

import math
from typing import Dict, Any, Optional


WEIGHTS = {"cot": 0.4, "options": 0.4, "sentiment": 0.2}


def _clip(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ---------------------------------------------------------------------------
# Each component returns a SIGNED magnitude in [-1, +1]
#   +1 = maximally bullish stance
#   -1 = maximally bearish stance
#    0 = neutral / no information
# ---------------------------------------------------------------------------

def _cot_direction(snapshot: Dict[str, Any]) -> float:
    """Non-Commercial positioning + momentum → signed [-1, +1]."""
    long_pos = snapshot.get("long", 0) or 0
    short_pos = snapshot.get("short", 0) or 0
    wow_delta = snapshot.get("wowDelta", 0) or 0

    total = long_pos + short_pos
    if total <= 0:
        return 0.0

    # Net positioning ratio in [-1, +1]
    net_ratio = (long_pos - short_pos) / total
    # WoW momentum in [-1, +1] (cap at ±30k weekly delta)
    momentum = max(-1.0, min(1.0, wow_delta / 30000.0))

    return _clip(0.6 * net_ratio + 0.4 * momentum, -1.0, 1.0)


def _options_direction(options_data: Optional[Dict[str, Any]]) -> float:
    """Put/Call + GEX regime → signed [-1, +1]. Returns 0 when no options data."""
    if not options_data or not isinstance(options_data, dict):
        return 0.0

    pcr_signal = 0.0
    gex_signal = 0.0

    pcr = options_data.get("putCallRatioOI") or options_data.get("pcr")
    if pcr is not None:
        try:
            pcr_val = float(pcr)
            # Low PCR (few puts) is bullish: map 0.5→+0.6, 1.0→0, 1.5→-0.6
            pcr_signal = _clip((1.0 - pcr_val) * 1.2, -1.0, 1.0)
        except (TypeError, ValueError):
            pass

    net_gex = options_data.get("netGex") or options_data.get("netGEX")
    if net_gex is not None:
        try:
            gex_val = float(net_gex)
            # Positive GEX → mild bullish (stable/pin); negative → bearish (vol expansion)
            gex_signal = _clip(gex_val / 1e9, -0.7, 0.7)
        except (TypeError, ValueError):
            pass

    return _clip(0.6 * pcr_signal + 0.4 * gex_signal, -1.0, 1.0)


def _sentiment_direction(snapshot: Dict[str, Any]) -> float:
    """Contrarian to retail (Commercials) → signed [-1, +1]."""
    r_long = snapshot.get("retailLong", 0) or 0
    r_short = snapshot.get("retailShort", 0) or 0
    total = r_long + r_short
    if total <= 0:
        return 0.0

    retail_long_pct = (r_long / total) * 100.0
    # Retail extremely long → bearish contrarian (-1); extremely short → bullish contrarian (+1)
    # Linear: 50% retail long → 0; 100% → -1; 0% → +1
    return _clip((50.0 - retail_long_pct) / 50.0, -1.0, 1.0)


# ---------------------------------------------------------------------------
# Aggregation: alignment-based confluence
# ---------------------------------------------------------------------------

def _label_for_score(score: float) -> str:
    """Strength-only label (no directional language)."""
    if score >= 80:
        return "Very High"
    elif score >= 60:
        return "High"
    elif score >= 40:
        return "Moderate"
    elif score >= 20:
        return "Low"
    else:
        return "Very Low"


def _direction_label(signed_avg: float) -> str:
    if signed_avg > 0.15:
        return "long"
    elif signed_avg < -0.15:
        return "short"
    return "neutral"


def calculate_confluence_index(
    cot_snapshot: Dict[str, Any],
    options_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute the Confluence Index for an asset.

    Returns a dict with:
        score        — 0..100 (direction-agnostic confluence strength)
        label        — "Very Low".."Very High"
        direction    — "long" / "short" / "neutral" (companion sign)
        components   — per-stream signed values (-1..+1)
        weights      — weights used in aggregation
    """
    d_cot = _cot_direction(cot_snapshot)
    d_opt = _options_direction(options_data)
    d_sent = _sentiment_direction(cot_snapshot)

    w_cot, w_opt, w_sent = WEIGHTS["cot"], WEIGHTS["options"], WEIGHTS["sentiment"]

    # Weighted signed average (-1..+1): how strongly the COMBINED signal points
    signed_avg = w_cot * d_cot + w_opt * d_opt + w_sent * d_sent
    # Weighted absolute magnitude (0..1): how much information each stream is providing
    magnitude_avg = w_cot * abs(d_cot) + w_opt * abs(d_opt) + w_sent * abs(d_sent)

    if magnitude_avg <= 1e-9:
        # All three streams are flat → no confluence possible
        score = 0.0
    else:
        # Alignment: 1.0 when all streams agree perfectly, 0 when they cancel out
        alignment = abs(signed_avg) / magnitude_avg
        # Confluence formula: ALIGNMENT is the primary factor (60% weight),
        # MAGNITUDE is a softening modulator (40% weight, starts from 0.4 floor).
        # This way perfectly aligned weak signals still produce a meaningful score
        # (e.g. alignment=1.0, magnitude=0.2 → 100*1.0*(0.4+0.6*0.2) ≈ 52),
        # while perfectly aligned strong signals reach the full 100.
        score = 100.0 * alignment * (0.4 + 0.6 * magnitude_avg)

    score = _clip(score, 0.0, 100.0)

    return {
        "score": round(score, 1),
        "label": _label_for_score(score),
        "direction": _direction_label(signed_avg),
        "components": {
            "cot": round(d_cot, 3),
            "options": round(d_opt, 3),
            "sentiment": round(d_sent, 3),
            "weights": WEIGHTS,
            "signedAvg": round(signed_avg, 3),
            "magnitudeAvg": round(magnitude_avg, 3),
        },
    }
