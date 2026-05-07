"""
Weekly options analytics powered by Yahoo Finance.

For each tracked COT asset we map to the most liquid US-listed options
proxy (ETF or future) and compute:

  * Key Levels & GEX (indices + commodities, scope='full'):
      - Max Pain
      - Top OI walls (calls = resistance, puts = support)
      - GEX (Gamma Exposure) per strike using Black-Scholes gamma
      - Net GEX, Gamma Flip strike, dealer hedging regime
  * Vol Skew / Risk Reversal (currencies, VIX, BTC, scope='skew'):
      - 25-delta Risk Reversal proxy
      - OTM put vs call IV ratio
      - Skew interpretation (bullish / bearish / neutral)

Refreshed weekly (Saturday) and cached permanently per (asset, expiry).
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Asset → Yahoo options ticker mapping
# ---------------------------------------------------------------------------
# `kind`:
#   'full'  → indices + commodities — compute Max Pain, walls and GEX
#   'skew'  → currencies, VIX, BTC — compute Vol Skew / Risk Reversal
OPTIONS_MAP: Dict[str, Dict[str, str]] = {
    # Indices (ETF proxies — most liquid options chains)
    "SP500":   {"symbol": "SPY",  "kind": "full",  "label": "SPY (S&P 500 proxy)"},
    "NAS100":  {"symbol": "QQQ",  "kind": "full",  "label": "QQQ (NASDAQ-100 proxy)"},
    "DOW":     {"symbol": "DIA",  "kind": "full",  "label": "DIA (Dow Jones proxy)"},
    "RUSSELL": {"symbol": "IWM",  "kind": "full",  "label": "IWM (Russell 2000 proxy)"},
    # Commodities (ETF proxies)
    "GOLD":    {"symbol": "GLD",  "kind": "full",  "label": "GLD (Gold ETF)"},
    "SILVER":  {"symbol": "SLV",  "kind": "full",  "label": "SLV (Silver ETF)"},
    "COPPER":  {"symbol": "CPER", "kind": "full",  "label": "CPER (Copper ETF)"},
    "OIL":     {"symbol": "USO",  "kind": "full",  "label": "USO (WTI Crude ETF)"},
    "NATGAS":  {"symbol": "UNG",  "kind": "full",  "label": "UNG (NatGas ETF)"},
    # Skew-only (less directional options market or thin OI)
    "VIX":     {"symbol": "VIXY", "kind": "skew",  "label": "VIXY"},
    "BTC":     {"symbol": "BITO", "kind": "skew",  "label": "BITO (BTC futures ETF)"},
    "EURUSD":  {"symbol": "FXE",  "kind": "skew",  "label": "FXE (EUR ETF)"},
    "GBPUSD":  {"symbol": "FXB",  "kind": "skew",  "label": "FXB (GBP ETF)"},
    "USDJPY":  {"symbol": "FXY",  "kind": "skew",  "label": "FXY (JPY ETF)"},
    "AUDUSD":  {"symbol": "FXA",  "kind": "skew",  "label": "FXA (AUD ETF)"},
    "USDCAD":  {"symbol": "FXC",  "kind": "skew",  "label": "FXC (CAD ETF)"},
    "USDCHF":  {"symbol": "FXF",  "kind": "skew",  "label": "FXF (CHF ETF)"},
    "NZDUSD":  {"symbol": "BNZ",  "kind": "skew",  "label": "BNZ (NZD ETF)"},
}


# ---------------------------------------------------------------------------
# Black-Scholes gamma (risk-free r=4%, dividend q=0 for simplicity)
# ---------------------------------------------------------------------------
SQRT_2PI = math.sqrt(2 * math.pi)


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / SQRT_2PI


def bs_gamma(spot: float, strike: float, t_years: float, iv: float, r: float = 0.04) -> float:
    """Black-Scholes gamma. Robust to junk inputs (returns 0)."""
    if spot <= 0 or strike <= 0 or t_years <= 0 or iv <= 0:
        return 0.0
    try:
        sqrt_t = math.sqrt(t_years)
        d1 = (math.log(spot / strike) + (r + 0.5 * iv * iv) * t_years) / (iv * sqrt_t)
        return _norm_pdf(d1) / (spot * iv * sqrt_t)
    except (ValueError, ZeroDivisionError, OverflowError):
        return 0.0


# ---------------------------------------------------------------------------
# Fetch options chain via yfinance
# ---------------------------------------------------------------------------
def _fetch_chain_sync(symbol: str) -> Optional[Dict[str, Any]]:
    """Sync yfinance call. Returns dict with `expiry`, `spot`, `calls`, `puts`."""
    try:
        import yfinance as yf
    except ImportError:
        logger.warning("yfinance not installed")
        return None
    try:
        t = yf.Ticker(symbol)
        expiries = t.options or []
        if not expiries:
            return None

        # Pick the first expiry at least 3 days away (skip 0-DTE/1-DTE noise)
        # but no more than 14 days out — keep the "weekly" framing.
        today = datetime.now(timezone.utc).date()
        chosen = None
        for exp in expiries:
            try:
                d = datetime.strptime(exp, "%Y-%m-%d").date()
            except ValueError:
                continue
            days = (d - today).days
            if 3 <= days <= 14:
                chosen = exp
                break
        if not chosen:
            chosen = expiries[0]

        chain = t.option_chain(chosen)
        info = {}
        try:
            info = t.fast_info or {}
        except Exception:  # noqa: BLE001
            info = {}
        spot = (
            info.get("lastPrice")
            or info.get("last_price")
            or info.get("regularMarketPrice")
            or info.get("previousClose")
        )
        if spot is None:
            try:
                hist = t.history(period="2d")
                if not hist.empty:
                    spot = float(hist["Close"].iloc[-1])
            except Exception:  # noqa: BLE001
                pass
        if spot is None:
            return None

        def _rows(df):
            return [
                {
                    "strike": float(r["strike"]),
                    "oi": int(r["openInterest"]) if r.get("openInterest") and not _isnan(r["openInterest"]) else 0,
                    "volume": int(r["volume"]) if r.get("volume") and not _isnan(r["volume"]) else 0,
                    "iv": float(r["impliedVolatility"]) if r.get("impliedVolatility") and not _isnan(r["impliedVolatility"]) else 0.0,
                    "last": float(r["lastPrice"]) if r.get("lastPrice") and not _isnan(r["lastPrice"]) else 0.0,
                }
                for _, r in df.iterrows()
            ]

        return {
            "symbol": symbol,
            "expiry": chosen,
            "spot": float(spot),
            "calls": _rows(chain.calls),
            "puts": _rows(chain.puts),
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("options chain fetch failed for %s: %s", symbol, e)
        return None


def _isnan(x) -> bool:
    try:
        return math.isnan(float(x))
    except (TypeError, ValueError):
        return False


async def fetch_chain(symbol: str) -> Optional[Dict[str, Any]]:
    """Async wrapper — runs yfinance in a thread."""
    import asyncio
    return await asyncio.to_thread(_fetch_chain_sync, symbol)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
def compute_full(chain: Dict[str, Any]) -> Dict[str, Any]:
    """Indices + commodities: Max Pain, walls, GEX profile."""
    spot = chain["spot"]
    calls = chain["calls"]
    puts = chain["puts"]
    expiry = chain["expiry"]

    # Days-to-expiry in years (incl. 1-day floor)
    try:
        d = datetime.strptime(expiry, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        dte_days = max(1, (d - datetime.now(timezone.utc)).days)
    except ValueError:
        dte_days = 7
    t_years = dte_days / 365.0

    # ---- All strikes
    all_strikes = sorted({r["strike"] for r in calls + puts})
    by_call = {r["strike"]: r for r in calls}
    by_put = {r["strike"]: r for r in puts}

    # ---- Max Pain: strike that minimises total option payout
    def total_pain(K: float) -> float:
        pain = 0.0
        for r in calls:
            if r["strike"] < K:
                pain += (K - r["strike"]) * (r["oi"] or 0)
        for r in puts:
            if r["strike"] > K:
                pain += (r["strike"] - K) * (r["oi"] or 0)
        return pain

    pains = [(K, total_pain(K)) for K in all_strikes]
    max_pain = min(pains, key=lambda x: x[1])[0] if pains else None

    # ---- Top OI walls (within ±15% of spot to filter junk)
    band_lo, band_hi = spot * 0.85, spot * 1.15

    def _filter_band(rows):
        return [r for r in rows if band_lo <= r["strike"] <= band_hi and (r["oi"] or 0) > 0]

    top_calls = sorted(_filter_band(calls), key=lambda r: r["oi"], reverse=True)[:5]
    top_puts = sorted(_filter_band(puts), key=lambda r: r["oi"], reverse=True)[:5]

    call_wall = top_calls[0]["strike"] if top_calls else None
    put_wall = top_puts[0]["strike"] if top_puts else None

    # ---- GEX profile (per strike)
    # Convention: dealers are SHORT calls (short gamma) and LONG puts (long gamma)
    # so dealer net gamma per strike ≈ (call_OI × γ × S² × 100) − (put_OI × γ × S² × 100)
    # Positive net GEX → dealers LONG gamma → suppress vol; negative → amplify.
    contract_size = 100.0
    gex_per_strike: List[Dict[str, Any]] = []
    cum_gex = 0.0
    for K in all_strikes:
        if not (band_lo <= K <= band_hi):
            continue
        c = by_call.get(K, {})
        p = by_put.get(K, {})
        c_iv = c.get("iv") or 0.0
        p_iv = p.get("iv") or 0.0
        c_oi = c.get("oi") or 0
        p_oi = p.get("oi") or 0
        if c_oi == 0 and p_oi == 0:
            continue
        # Use the side's own IV; fallback to the other side
        c_gamma = bs_gamma(spot, K, t_years, c_iv if c_iv > 0 else p_iv)
        p_gamma = bs_gamma(spot, K, t_years, p_iv if p_iv > 0 else c_iv)
        call_gex = c_oi * c_gamma * spot * spot * contract_size
        put_gex = p_oi * p_gamma * spot * spot * contract_size
        net = call_gex - put_gex
        cum_gex += net
        gex_per_strike.append({
            "strike": round(K, 2),
            "callOi": c_oi,
            "putOi": p_oi,
            "callGex": round(call_gex, 0),
            "putGex": round(put_gex, 0),
            "netGex": round(net, 0),
        })

    # Net GEX (in $millions for readability)
    total_net_gex = sum(r["netGex"] for r in gex_per_strike)
    total_call_gex = sum(r["callGex"] for r in gex_per_strike)
    total_put_gex = sum(r["putGex"] for r in gex_per_strike)

    # Gamma flip: strike where running cumulative GEX changes sign (approx zero-gamma)
    flip_strike = None
    running = 0.0
    sorted_gex = sorted(gex_per_strike, key=lambda r: r["strike"])
    prev_running = 0.0
    for row in sorted_gex:
        running += row["netGex"]
        if prev_running != 0 and (prev_running * running) < 0:
            flip_strike = row["strike"]
            break
        prev_running = running

    # PCR (Put/Call OI Ratio) within the band
    sum_call_oi = sum(r["oi"] for r in calls if band_lo <= r["strike"] <= band_hi)
    sum_put_oi = sum(r["oi"] for r in puts if band_lo <= r["strike"] <= band_hi)
    pcr = round(sum_put_oi / sum_call_oi, 2) if sum_call_oi else None

    # Regime label
    regime = "neutral"
    if total_net_gex > 0:
        regime = "long_gamma"   # dealers long gamma → mean-reverting / range
    elif total_net_gex < 0:
        regime = "short_gamma"  # dealers short gamma → trending / volatile

    return {
        "kind": "full",
        "symbol": chain["symbol"],
        "expiry": expiry,
        "dte": dte_days,
        "spot": round(spot, 4),
        "maxPain": max_pain,
        "callWall": call_wall,
        "putWall": put_wall,
        "topCalls": [{"strike": r["strike"], "oi": r["oi"]} for r in top_calls],
        "topPuts":  [{"strike": r["strike"], "oi": r["oi"]} for r in top_puts],
        "gexBars": sorted_gex,
        "netGex": round(total_net_gex, 0),
        "callGexTotal": round(total_call_gex, 0),
        "putGexTotal": round(total_put_gex, 0),
        "flipStrike": flip_strike,
        "regime": regime,
        "pcr": pcr,
        "totalCallOi": sum_call_oi,
        "totalPutOi": sum_put_oi,
    }


def compute_skew(chain: Dict[str, Any]) -> Dict[str, Any]:
    """Currencies, VIX, BTC: 25Δ Risk Reversal proxy.

    We approximate by picking the OTM call ~5-8% above spot and OTM put
    ~5-8% below spot and comparing their IVs. RR > 0 means calls more
    expensive than equivalent puts (bullish skew); RR < 0 puts richer
    (bearish skew, "fear premium").
    """
    spot = chain["spot"]
    calls = chain["calls"]
    puts = chain["puts"]
    expiry = chain["expiry"]

    def _pick_otm(rows, target_strike: float):
        candidates = [r for r in rows if (r["iv"] or 0) > 0 and (r["oi"] or 0) > 0]
        if not candidates:
            return None
        return min(candidates, key=lambda r: abs(r["strike"] - target_strike))

    # ~7% OTM both sides
    otm_call = _pick_otm(calls, spot * 1.07)
    otm_put = _pick_otm(puts, spot * 0.93)

    # ATM straddle proxy
    atm_call = _pick_otm(calls, spot)
    atm_put = _pick_otm(puts, spot)
    atm_iv = None
    if atm_call and atm_put and atm_call["iv"] and atm_put["iv"]:
        atm_iv = (atm_call["iv"] + atm_put["iv"]) / 2

    if not otm_call or not otm_put or not otm_call["iv"] or not otm_put["iv"]:
        return {
            "kind": "skew",
            "symbol": chain["symbol"],
            "expiry": expiry,
            "spot": round(spot, 4),
            "atmIv": round(atm_iv * 100, 2) if atm_iv else None,
            "rr": None,
            "callIv": None,
            "putIv": None,
            "interpretation": "insufficient_data",
        }

    rr = otm_call["iv"] - otm_put["iv"]
    rr_pct = rr * 100  # in vol points

    # Interpretation
    if abs(rr_pct) < 0.5:
        interp = "neutral"
    elif rr_pct > 0:
        interp = "bullish_skew"
    else:
        interp = "bearish_skew"

    return {
        "kind": "skew",
        "symbol": chain["symbol"],
        "expiry": expiry,
        "spot": round(spot, 4),
        "atmIv": round(atm_iv * 100, 2) if atm_iv else None,
        "rr": round(rr_pct, 2),
        "callIv": round(otm_call["iv"] * 100, 2),
        "putIv": round(otm_put["iv"] * 100, 2),
        "callStrike": otm_call["strike"],
        "putStrike": otm_put["strike"],
        "interpretation": interp,
    }


# ---------------------------------------------------------------------------
# Top-level entrypoint
# ---------------------------------------------------------------------------
async def get_options_analytics(asset_id: str) -> Optional[Dict[str, Any]]:
    """Fetch + analyse options for an asset. Returns None if unsupported / failed."""
    cfg = OPTIONS_MAP.get(asset_id)
    if not cfg:
        return None
    chain = await fetch_chain(cfg["symbol"])
    if not chain:
        return None
    chain["assetLabel"] = cfg["label"]
    if cfg["kind"] == "full":
        out = compute_full(chain)
    else:
        out = compute_skew(chain)
    out["assetLabel"] = cfg["label"]
    out["fetchedAt"] = datetime.now(timezone.utc).isoformat()
    return out
