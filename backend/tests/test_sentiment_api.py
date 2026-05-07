"""Backend tests for /api/sentiment, /api/options, /api/cot, /api/final-verdict.

Validates:
 - MyFxBook sentiment with inverted/contrarian score
 - crowdLabel field present
 - priceHistory >= 30 entries
 - history (sentiment trend) populated
 - options chain regression
 - cot regression
 - final-verdict regression (calc fallback OK)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

SENTIMENT_ASSETS = ["EURUSD", "GBPUSD", "GOLD", "BTC", "USDJPY", "AUDUSD", "USDCAD"]


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Sentiment per asset ----------
@pytest.mark.parametrize("asset_id", SENTIMENT_ASSETS)
def test_sentiment_myfxbook_real(session, asset_id):
    r = session.get(f"{API}/sentiment/{asset_id}", timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["assetId"] == asset_id
    assert "current" in data
    cur = data["current"]
    # Required fields
    for k in ("score", "interpretation", "color", "longPercentage", "shortPercentage",
              "crowdLabel", "source", "contrarian"):
        assert k in cur, f"{asset_id}: missing field {k}"

    # Real source
    assert cur["source"] == "MyFxBook Real Accounts", (
        f"{asset_id}: expected MyFxBook Real Accounts source, got {cur['source']}"
    )

    long_pct = cur["longPercentage"]
    short_pct = cur["shortPercentage"]
    assert 0 <= long_pct <= 100, f"{asset_id}: bad longPercentage {long_pct}"
    assert 0 <= short_pct <= 100, f"{asset_id}: bad shortPercentage {short_pct}"
    assert abs((long_pct + short_pct) - 100) <= 1.5, (
        f"{asset_id}: long+short should be ~100, got {long_pct}+{short_pct}"
    )

    score = cur["score"]
    # Inverted/contrarian score: score = (50 - long_pct) * 2 (within rounding)
    expected = round((50 - long_pct) * 2, 2)
    assert abs(score - expected) <= 1.5, (
        f"{asset_id}: score {score} not aligned with formula (50-long)*2 = {expected}"
    )

    # Score sign aligned with contrarian action
    if long_pct >= 60:
        assert score < 0, f"{asset_id}: long_pct {long_pct}>=60 should yield score<0, got {score}"
    elif long_pct <= 40:
        assert score > 0, f"{asset_id}: long_pct {long_pct}<=40 should yield score>0, got {score}"

    # Contrarian signal correct
    sig = cur["contrarian"]["signal"]
    if long_pct >= 60:
        assert sig == "SELL", f"{asset_id}: long_pct {long_pct} → expected SELL, got {sig}"
    elif long_pct <= 40:
        assert sig == "BUY", f"{asset_id}: long_pct {long_pct} → expected BUY, got {sig}"
    else:
        assert sig == "NEUTRAL", f"{asset_id}: long_pct {long_pct} → expected NEUTRAL, got {sig}"

    # Crowd label correct
    cl = cur["crowdLabel"]
    if long_pct >= 60:
        assert cl == "Bullish Crowd", f"{asset_id}: expected Bullish Crowd, got {cl}"
    elif long_pct <= 40:
        assert cl == "Bearish Crowd", f"{asset_id}: expected Bearish Crowd, got {cl}"
    else:
        assert cl == "Mixed Crowd", f"{asset_id}: expected Mixed Crowd, got {cl}"


# ---------- Price history ----------
@pytest.mark.parametrize("asset_id", SENTIMENT_ASSETS)
def test_sentiment_price_history(session, asset_id):
    r = session.get(f"{API}/sentiment/{asset_id}", timeout=90)
    assert r.status_code == 200
    data = r.json()
    ph = data.get("priceHistory")
    assert isinstance(ph, list), f"{asset_id}: priceHistory missing/not list"
    assert len(ph) >= 30, f"{asset_id}: expected >=30 daily entries, got {len(ph)}"
    sample = ph[0]
    assert "date" in sample and "price" in sample
    assert isinstance(sample["price"], (int, float))


# ---------- Sentiment history (COT-based trend) ----------
@pytest.mark.parametrize("asset_id", ["EURUSD", "GOLD", "GBPUSD"])
def test_sentiment_history_array(session, asset_id):
    r = session.get(f"{API}/sentiment/{asset_id}", timeout=90)
    assert r.status_code == 200
    data = r.json()
    hist = data.get("history")
    assert isinstance(hist, list), f"{asset_id}: history missing/not list"
    assert len(hist) > 0, f"{asset_id}: history empty"
    for h in hist:
        assert "date" in h
        assert "score" in h


# ---------- Options regression ----------
@pytest.mark.parametrize("asset_id", ["SP500", "GOLD"])
def test_options_chain(session, asset_id):
    # User mentions SPX but actual asset id is SP500 (SPY proxy in OPTIONS_MAP)
    r = session.get(f"{API}/options/{asset_id}", timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    # Real keys exposed: symbol, expiry, spot, maxPain, callWall, putWall,
    # topCalls, topPuts, gexBars, netGex, callGexTotal, putGexTotal, flipStrike,
    # regime, pcr, totalCallOi, totalPutOi
    assert "symbol" in data and "expiry" in data
    assert "maxPain" in data
    assert "callWall" in data and "putWall" in data
    assert "gexBars" in data and isinstance(data["gexBars"], list)
    assert "netGex" in data
    assert data["spot"] is None or isinstance(data["spot"], (int, float))


# ---------- COT regression ----------
def test_cot_eurusd_regression(session):
    r = session.get(f"{API}/cot/EURUSD", timeout=60)
    assert r.status_code == 200
    data = r.json()
    assert data["assetId"] == "EURUSD"
    assert data["long"] > 0 and data["short"] > 0


# ---------- Final verdict regression (calc fallback OK) ----------
def test_final_verdict_eurusd(session):
    # Actual route is /api/verdict (the "final-verdict" name in the request was a misnomer)
    r = session.get(f"{API}/verdict/EURUSD", timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    # Either AI or calculated fallback acceptable; just assert verdict text present
    assert any(k in data for k in ("verdict", "summary", "text", "finalVerdict", "decision",
                                   "macro", "rationale", "outlook"))
