"""End-to-end backend tests for Speculative Alpha COT API."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CORE_IDS = {"SP500", "NAS100", "GOLD", "OIL", "EURUSD", "GBPUSD", "USDJPY"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
def test_health(session):
    r = session.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "time" in data


# ---------- Assets list ----------
def test_assets_list(session):
    r = session.get(f"{API}/assets", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 19, f"Expected 19 assets, got {len(data)}"
    ids = {a["assetId"] for a in data}
    assert CORE_IDS.issubset(ids)
    core_count = sum(1 for a in data if a["core"])
    assert core_count == 7, f"Expected 7 core assets, got {core_count}"
    # type fields valid
    for a in data:
        assert a["type"] in {"INDEX", "COMMODITY", "CURRENCY"}
        assert a["name"]


# ---------- Single asset (force refresh first to ensure fresh fetch) ----------
def test_cot_gold_full_snapshot(session):
    r = session.get(f"{API}/cot/GOLD", timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    required = {
        "assetId", "name", "type", "long", "short", "netPosition",
        "wowDelta", "openInterest", "openInterestShare",
        "intensityIndex", "reportDate", "macro", "fetchedAt",
    }
    missing = required - set(data.keys())
    assert not missing, f"Missing fields: {missing}"
    assert data["assetId"] == "GOLD"
    assert data["type"] == "COMMODITY"
    assert data["long"] > 0, "Long positions should be > 0 for GOLD"
    assert data["short"] > 0, "Short positions should be > 0 for GOLD"
    assert isinstance(data["netPosition"], int)
    assert data["macro"] and isinstance(data["macro"], str)
    assert 0 <= data["intensityIndex"] <= 100


def test_cot_eurusd_with_ai_macro(session):
    r = session.get(f"{API}/cot/EURUSD", timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["assetId"] == "EURUSD"
    assert data["type"] == "CURRENCY"
    assert data["macro"], "AI macro insight should not be empty"
    assert len(data["macro"]) > 10


def test_cot_invalid_asset(session):
    r = session.get(f"{API}/cot/INVALID", timeout=15)
    assert r.status_code == 404


def test_cot_lowercase_asset_works(session):
    """Server.py uppercases the path param, so lowercase should also work."""
    r = session.get(f"{API}/cot/gold", timeout=60)
    assert r.status_code == 200
    assert r.json()["assetId"] == "GOLD"


# ---------- Bulk ----------
def test_cot_bulk_core(session):
    r = session.get(f"{API}/cot/bulk", params={"scope": "core"}, timeout=120)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 7, f"Expected 7 core, got {len(data)}"
    ids = {a["assetId"] for a in data}
    assert ids == CORE_IDS


def test_cot_bulk_all(session):
    r = session.get(f"{API}/cot/bulk", params={"scope": "all"}, timeout=180)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 17, f"Expected >= 17 assets in scope=all, got {len(data)}"


# ---------- History ----------
def test_cot_history_gold(session):
    r = session.get(f"{API}/cot/GOLD/history", params={"limit": 10}, timeout=60)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) == 10, f"Expected 10 history entries, got {len(data)}"
    # verify required fields
    for entry in data:
        assert "date" in entry
        assert "long" in entry and "short" in entry
        assert "netPosition" in entry
        assert "wowDelta" in entry
    # The history endpoint returns most recent first (descending)
    dates = [d["date"] for d in data]
    assert dates == sorted(dates, reverse=True), "History dates should be descending"


# ---------- Refresh ----------
def test_refresh_cache(session):
    r = session.post(f"{API}/cot/refresh", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "cache cleared"
    assert "time" in data


# ---------- Caching speed ----------
def test_cache_hit_is_fast(session):
    # First call (after potential refresh)
    t0 = time.time()
    r1 = session.get(f"{API}/cot/GOLD", timeout=60)
    elapsed1 = time.time() - t0
    assert r1.status_code == 200
    # Second call should be cache hit and faster
    t0 = time.time()
    r2 = session.get(f"{API}/cot/GOLD", timeout=30)
    elapsed2 = time.time() - t0
    assert r2.status_code == 200
    print(f"First call: {elapsed1:.2f}s, Cached: {elapsed2:.2f}s")
    # Cached call should be substantially faster (<2s typically)
    assert elapsed2 < max(2.0, elapsed1), f"Cached call ({elapsed2:.2f}s) not faster than first ({elapsed1:.2f}s)"
