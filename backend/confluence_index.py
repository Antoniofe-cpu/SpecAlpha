"""
Speculative Alpha — Confluence Index v2 (semplificato).

Tre stream equi (33.3% ciascuno):
  1. NON-COMMERCIAL (speculatori): net positioning + WoW momentum (DIRETTO)
  2. OPTIONS: Put/Call ratio + Gamma Exposure
  3. COMMERCIAL (hedger): net positioning + WoW momentum, **invertito**
     (i Commercial sono smart-money contrarian — quando sono molto long
      → mercato bearish; quando molto short → bullish)

Ogni stream ritorna un valore SIGNED in [-1, +1].
Il Confluence Index 0-100 è funzione di:
  - alignment (quanto i tre stream concordano sulla direzione)
  - magnitude media (quanto è forte la convinzione)

Score = 100 * alignment * (0.5 + 0.5 * magnitudeAvg)
  → con alignment=1 e magnitude=0.4  → 70
  → con alignment=1 e magnitude=0.8  → 90
  → con alignment=0.33 (uno contro)  → 33% * (0.5+0.5*m) ≈ 17-33

direction è derivato dal segno della media pesata.
"""
from __future__ import annotations

from typing import Dict, Any, Optional


WEIGHTS = {"nonComm": 1 / 3, "options": 1 / 3, "comm": 1 / 3}


def _clip(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


# ---------------------------------------------------------------------------
# Streams
# ---------------------------------------------------------------------------


def _noncomm_direction(snapshot: Dict[str, Any]) -> float:
    """Non-Commercial speculators (Funds/Large Specs) — DIRETTO."""
    long_pos = snapshot.get("long", 0) or 0
    short_pos = snapshot.get("short", 0) or 0
    wow_delta = snapshot.get("wowDelta", 0) or 0

    total = long_pos + short_pos
    if total <= 0:
        return 0.0

    net_ratio = (long_pos - short_pos) / total
    # WoW momentum: cap at ±30k weekly delta → [-1, +1]
    momentum = max(-1.0, min(1.0, wow_delta / 30000.0))
    return _clip(0.6 * net_ratio + 0.4 * momentum, -1.0, 1.0)


def _options_direction(options_data: Optional[Dict[str, Any]]) -> float:
    """Put/Call ratio + Gamma Exposure → [-1, +1]. Returns 0 when missing."""
    if not options_data or not isinstance(options_data, dict):
        return 0.0

    pcr_signal = 0.0
    gex_signal = 0.0

    pcr = options_data.get("putCallRatioOI") or options_data.get("pcr")
    if pcr is not None:
        try:
            pcr_val = float(pcr)
            # Low PCR (poche put) = bullish: 0.5→+0.6, 1.0→0, 1.5→-0.6
            pcr_signal = _clip((1.0 - pcr_val) * 1.2, -1.0, 1.0)
        except (TypeError, ValueError):
            pass

    net_gex = options_data.get("netGex") or options_data.get("netGEX")
    if net_gex is not None:
        try:
            gex_val = float(net_gex)
            # GEX positivo → bullish stabile; negativo → bearish (espansione vol)
            gex_signal = _clip(gex_val / 1e9, -0.7, 0.7)
        except (TypeError, ValueError):
            pass

    return _clip(0.6 * pcr_signal + 0.4 * gex_signal, -1.0, 1.0)


def _comm_direction(snapshot: Dict[str, Any]) -> float:
    """Commercial hedgers (Producers/Users) — INVERTITO (contrarian signal).

    Commercials are smart-money hedgers. Heavy long Commercials → mercato bearish.
    Heavy short Commercials → mercato bullish. We negate the raw direction.
    """
    c_long = snapshot.get("commercialLong", 0) or snapshot.get("retailLong", 0) or 0
    c_short = snapshot.get("commercialShort", 0) or snapshot.get("retailShort", 0) or 0
    c_wow = snapshot.get("commercialWowDelta", 0) or snapshot.get("retailWowDelta", 0) or 0
    total = c_long + c_short
    if total <= 0:
        return 0.0

    net_ratio = (c_long - c_short) / total
    momentum = max(-1.0, min(1.0, c_wow / 30000.0))
    raw = 0.6 * net_ratio + 0.4 * momentum
    # Invert: commercials are contrarian
    return _clip(-raw, -1.0, 1.0)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------


def _label_for_score(score: float) -> str:
    if score >= 80:
        return "Very High"
    if score >= 60:
        return "High"
    if score >= 40:
        return "Moderate"
    if score >= 20:
        return "Low"
    return "Very Low"


def _direction_label(signed_avg: float) -> str:
    if signed_avg > 0.15:
        return "long"
    if signed_avg < -0.15:
        return "short"
    return "neutral"


def calculate_confluence_index(
    cot_snapshot: Dict[str, Any],
    options_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute the v2 Confluence Index.

    Returns:
        score:      0..100 (alignment strength × magnitude)
        label:      "Very Low" .. "Very High"
        direction:  "long" / "short" / "neutral"
        components: signed value per stream + weights + signedAvg/magnitudeAvg
    """
    d_nc = _noncomm_direction(cot_snapshot)
    d_opt = _options_direction(options_data)
    d_cm = _comm_direction(cot_snapshot)

    # Renormalise weights when a stream is missing (treats 0 as "no data")
    streams = [
        ("nonComm", d_nc, WEIGHTS["nonComm"]),
        ("options", d_opt, WEIGHTS["options"]),
        ("comm", d_cm, WEIGHTS["comm"]),
    ]
    present = [(n, v, w) for n, v, w in streams if abs(v) > 0.01]
    if not present:
        return {
            "score": 0.0,
            "label": _label_for_score(0.0),
            "direction": "neutral",
            "components": {
                "nonComm": round(d_nc, 3),
                "options": round(d_opt, 3),
                "comm": round(d_cm, 3),
                "weights": WEIGHTS,
                "signedAvg": 0.0,
                "magnitudeAvg": 0.0,
            },
        }

    total_w = sum(w for _, _, w in present)
    signed_avg = sum(w * v for _, v, w in present) / total_w
    magnitude_avg = sum(w * abs(v) for _, v, w in present) / total_w
    alignment = abs(signed_avg) / magnitude_avg if magnitude_avg > 1e-9 else 0.0

    # Pure equally-weighted formula: alignment * (0.5 + 0.5*magnitude) on a 0..100 scale.
    # With alignment=1, magnitude=0.4 → 70  (signal strong & aligned)
    # With alignment=1, magnitude=0.8 → 90
    # With alignment=0.33, magnitude=0.5 → 25 (uno contro due)
    score = 100.0 * alignment * (0.5 + 0.5 * magnitude_avg)
    score = _clip(score, 0.0, 100.0)

    return {
        "score": round(score, 1),
        "label": _label_for_score(score),
        "direction": _direction_label(signed_avg),
        "components": {
            "nonComm": round(d_nc, 3),
            "options": round(d_opt, 3),
            "comm": round(d_cm, 3),
            "weights": WEIGHTS,
            "signedAvg": round(signed_avg, 3),
            "magnitudeAvg": round(magnitude_avg, 3),
        },
    }
