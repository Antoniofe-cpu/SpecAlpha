#!/usr/bin/env python3
"""
Backend API Testing for Speculative Alpha
Tests all endpoints after significant backend modifications.
"""
import asyncio
import json
import sys
from typing import Dict, Any, List
import httpx

# Backend URL from frontend/.env
BASE_URL = "https://ai-verdict-options.preview.emergentagent.com/api"

# Test results storage
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}


def log_pass(test_name: str, details: str = ""):
    """Log a passing test"""
    msg = f"✅ PASS: {test_name}"
    if details:
        msg += f" - {details}"
    print(msg)
    test_results["passed"].append({"test": test_name, "details": details})


def log_fail(test_name: str, reason: str):
    """Log a failing test"""
    msg = f"❌ FAIL: {test_name} - {reason}"
    print(msg)
    test_results["failed"].append({"test": test_name, "reason": reason})


def log_warning(test_name: str, message: str):
    """Log a warning"""
    msg = f"⚠️  WARNING: {test_name} - {message}"
    print(msg)
    test_results["warnings"].append({"test": test_name, "message": message})


async def test_health():
    """Test GET /api/health"""
    print("\n" + "="*80)
    print("TEST: GET /api/health")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{BASE_URL}/health")
            
            if response.status_code != 200:
                log_fail("GET /api/health", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            # Check required fields
            if "status" not in data:
                log_fail("GET /api/health", "Missing 'status' field")
                return
            
            if data["status"] != "ok":
                log_fail("GET /api/health", f"Status is '{data['status']}', expected 'ok'")
                return
            
            if "time" not in data:
                log_fail("GET /api/health", "Missing 'time' field")
                return
            
            log_pass("GET /api/health", f"Status: {data['status']}, Time: {data['time']}")
            
    except Exception as e:
        log_fail("GET /api/health", f"Exception: {str(e)}")


async def test_assets():
    """Test GET /api/assets"""
    print("\n" + "="*80)
    print("TEST: GET /api/assets")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{BASE_URL}/assets")
            
            if response.status_code != 200:
                log_fail("GET /api/assets", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            if not isinstance(data, list):
                log_fail("GET /api/assets", "Response is not a list")
                return
            
            if len(data) != 18:
                log_fail("GET /api/assets", f"Expected 18 assets, got {len(data)}")
                return
            
            # Check for unique assetIds
            asset_ids = [asset.get("assetId") for asset in data]
            if len(asset_ids) != len(set(asset_ids)):
                log_fail("GET /api/assets", "Duplicate assetIds found")
                return
            
            # Check required fields
            for asset in data:
                if not all(k in asset for k in ["assetId", "name", "type", "core"]):
                    log_fail("GET /api/assets", f"Missing required fields in asset: {asset}")
                    return
            
            log_pass("GET /api/assets", f"18 assets with unique IDs: {', '.join(asset_ids[:5])}...")
            
    except Exception as e:
        log_fail("GET /api/assets", f"Exception: {str(e)}")


async def test_cot_endpoint(asset_id: str):
    """Test GET /api/cot/{asset_id}"""
    print("\n" + "="*80)
    print(f"TEST: GET /api/cot/{asset_id}")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{BASE_URL}/cot/{asset_id}")
            
            if response.status_code != 200:
                log_fail(f"GET /api/cot/{asset_id}", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            # Check required fields
            required_fields = ["assetId", "name", "type", "long", "short", "netPosition", 
                             "wowDelta", "openInterest", "reportDate"]
            
            missing = [f for f in required_fields if f not in data]
            if missing:
                log_fail(f"GET /api/cot/{asset_id}", f"Missing fields: {missing}")
                return
            
            log_pass(f"GET /api/cot/{asset_id}", 
                    f"Net: {data['netPosition']:+,}, Δ: {data['wowDelta']:+,}, Date: {data['reportDate']}")
            
    except Exception as e:
        log_fail(f"GET /api/cot/{asset_id}", f"Exception: {str(e)}")


async def test_verdict_endpoint(asset_id: str):
    """Test GET /api/verdict/{asset_id}"""
    print("\n" + "="*80)
    print(f"TEST: GET /api/verdict/{asset_id}")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{BASE_URL}/verdict/{asset_id}")
            
            if response.status_code != 200:
                log_fail(f"GET /api/verdict/{asset_id}", f"Status code {response.status_code}")
                return None
            
            data = response.json()
            
            # Check required fields
            if "verdict" not in data:
                log_fail(f"GET /api/verdict/{asset_id}", "Missing 'verdict' field")
                return None
            
            if "confidence" not in data:
                log_fail(f"GET /api/verdict/{asset_id}", "Missing 'confidence' field")
                return None
            
            if "summary" not in data:
                log_fail(f"GET /api/verdict/{asset_id}", "Missing 'summary' field")
                return None
            
            # Validate verdict values
            if data["verdict"] not in ["LONG", "SHORT", "WAIT"]:
                log_fail(f"GET /api/verdict/{asset_id}", 
                        f"Invalid verdict '{data['verdict']}', expected LONG/SHORT/WAIT")
                return None
            
            # Validate confidence range
            if not isinstance(data["confidence"], int) or not (1 <= data["confidence"] <= 5):
                log_fail(f"GET /api/verdict/{asset_id}", 
                        f"Invalid confidence {data['confidence']}, expected int 1-5")
                return None
            
            # Check if summary is empty
            if not data["summary"] or len(data["summary"].strip()) == 0:
                log_fail(f"GET /api/verdict/{asset_id}", "Summary is empty")
                return None
            
            # Check for fallback indicator (LLM not working)
            if "Dati insufficienti" in data["summary"]:
                log_warning(f"GET /api/verdict/{asset_id}", 
                           f"Summary contains 'Dati insufficienti' - LLM fallback detected")
            
            log_pass(f"GET /api/verdict/{asset_id}", 
                    f"Verdict: {data['verdict']}, Confidence: {data['confidence']}, Summary: {data['summary'][:60]}...")
            
            return data
            
    except Exception as e:
        log_fail(f"GET /api/verdict/{asset_id}", f"Exception: {str(e)}")
        return None


async def test_verdict_performance(asset_id: str):
    """Test GET /api/verdict/{asset_id}/performance"""
    print("\n" + "="*80)
    print(f"TEST: GET /api/verdict/{asset_id}/performance")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{BASE_URL}/verdict/{asset_id}/performance")
            
            if response.status_code != 200:
                log_fail(f"GET /api/verdict/{asset_id}/performance", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            # Check required top-level fields
            if "modes" not in data:
                log_fail(f"GET /api/verdict/{asset_id}/performance", "Missing 'modes' field")
                return
            
            if "history" not in data:
                log_fail(f"GET /api/verdict/{asset_id}/performance", "Missing 'history' field")
                return
            
            # Check modes structure
            modes = data["modes"]
            if "LTS" not in modes or "ST" not in modes:
                log_fail(f"GET /api/verdict/{asset_id}/performance", "Missing LTS or ST modes")
                return
            
            # Check LTS windows
            lts = modes["LTS"]
            if "window12w" not in lts or "window24w" not in lts:
                log_fail(f"GET /api/verdict/{asset_id}/performance", "Missing LTS windows")
                return
            
            # Check ST windows
            st = modes["ST"]
            if "window12w" not in st or "window24w" not in st:
                log_fail(f"GET /api/verdict/{asset_id}/performance", "Missing ST windows")
                return
            
            # Check window fields
            required_window_fields = ["total", "respected", "notRespected", "skipped", 
                                     "accuracy", "avgFavorableRangePct", "avgAdverseRangePct", 
                                     "highConfAccuracy"]
            
            for mode_name, mode_data in [("LTS", lts), ("ST", st)]:
                for window_name in ["window12w", "window24w"]:
                    window = mode_data[window_name]
                    missing = [f for f in required_window_fields if f not in window]
                    if missing:
                        log_fail(f"GET /api/verdict/{asset_id}/performance", 
                                f"Missing fields in {mode_name}.{window_name}: {missing}")
                        return
                    
                    # Validate accuracy range (0-100 or None)
                    acc = window.get("accuracy")
                    if acc is not None and not (0 <= acc <= 100):
                        log_fail(f"GET /api/verdict/{asset_id}/performance", 
                                f"Invalid accuracy {acc} in {mode_name}.{window_name}, expected 0-100")
                        return
            
            # Check history structure
            history = data["history"]
            if not isinstance(history, list):
                log_fail(f"GET /api/verdict/{asset_id}/performance", "History is not a list")
                return
            
            if len(history) > 0:
                # Check first history entry
                entry = history[0]
                required_history_fields = ["reportDate", "weekStart", "weekEnd", "weekLow", 
                                          "weekHigh", "weekRangePct", "signalLTS", "signalST", 
                                          "confidence", "respectedLTS", "respectedST"]
                missing = [f for f in required_history_fields if f not in entry]
                if missing:
                    log_fail(f"GET /api/verdict/{asset_id}/performance", 
                            f"Missing fields in history entry: {missing}")
                    return
            
            # Log summary
            lts_12w_acc = lts["window12w"].get("accuracy")
            st_12w_acc = st["window12w"].get("accuracy")
            
            log_pass(f"GET /api/verdict/{asset_id}/performance", 
                    f"LTS 12w accuracy: {lts_12w_acc}%, ST 12w accuracy: {st_12w_acc}%, History entries: {len(history)}")
            
    except Exception as e:
        log_fail(f"GET /api/verdict/{asset_id}/performance", f"Exception: {str(e)}")


async def test_cot_refresh():
    """Test POST /api/cot/refresh"""
    print("\n" + "="*80)
    print("TEST: POST /api/cot/refresh")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{BASE_URL}/cot/refresh")
            
            if response.status_code != 200:
                log_fail("POST /api/cot/refresh", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            if "status" not in data:
                log_fail("POST /api/cot/refresh", "Missing 'status' field")
                return
            
            if data["status"] != "cache cleared":
                log_fail("POST /api/cot/refresh", f"Status is '{data['status']}', expected 'cache cleared'")
                return
            
            log_pass("POST /api/cot/refresh", f"Status: {data['status']}")
            
            # Note: We should verify that cot_history collection is NOT deleted
            # This would require MongoDB access, which we'll note in the warning
            log_warning("POST /api/cot/refresh", 
                       "Cannot verify cot_history collection preservation without MongoDB access")
            
    except Exception as e:
        log_fail("POST /api/cot/refresh", f"Exception: {str(e)}")


async def test_cron_warm_get():
    """Test GET /api/cron/warm"""
    print("\n" + "="*80)
    print("TEST: GET /api/cron/warm")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(f"{BASE_URL}/cron/warm")
            
            if response.status_code != 200:
                log_fail("GET /api/cron/warm", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            if "status" not in data:
                log_fail("GET /api/cron/warm", "Missing 'status' field")
                return
            
            if data["status"] != "warm started":
                log_fail("GET /api/cron/warm", f"Status is '{data['status']}', expected 'warm started'")
                return
            
            log_pass("GET /api/cron/warm", f"Status: {data['status']} (async)")
            
    except Exception as e:
        log_fail("GET /api/cron/warm", f"Exception: {str(e)}")


async def test_cron_warm_post():
    """Test POST /api/cron/warm"""
    print("\n" + "="*80)
    print("TEST: POST /api/cron/warm")
    print("="*80)
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{BASE_URL}/cron/warm")
            
            if response.status_code != 200:
                log_fail("POST /api/cron/warm", f"Status code {response.status_code}")
                return
            
            data = response.json()
            
            if "status" not in data:
                log_fail("POST /api/cron/warm", "Missing 'status' field")
                return
            
            if data["status"] != "warm started":
                log_fail("POST /api/cron/warm", f"Status is '{data['status']}', expected 'warm started'")
                return
            
            log_pass("POST /api/cron/warm", f"Status: {data['status']} (async)")
            
    except Exception as e:
        log_fail("POST /api/cron/warm", f"Exception: {str(e)}")


async def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("SPECULATIVE ALPHA BACKEND API TESTING")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print("="*80)
    
    # Test 1: Health check
    await test_health()
    
    # Test 2: Assets list
    await test_assets()
    
    # Test 3: COT endpoint for SP500
    await test_cot_endpoint("SP500")
    
    # Test 4: Verdict endpoints for multiple assets
    # Note: We'll test these with delays to avoid rate limits
    print("\n⏳ Testing verdict endpoints (with delays to avoid rate limits)...")
    
    for asset in ["SP500", "NAS100", "GOLD", "EURUSD"]:
        await test_verdict_endpoint(asset)
        await asyncio.sleep(2)  # Delay to avoid rate limits
    
    # Test 5: Performance endpoints
    print("\n⏳ Testing performance endpoints (with delays to avoid rate limits)...")
    
    for asset in ["SP500", "NAS100", "GOLD", "BTC"]:
        await test_verdict_performance(asset)
        await asyncio.sleep(2)  # Delay to avoid rate limits
    
    # Test 6: COT refresh
    await test_cot_refresh()
    
    # Test 7: Cron warm endpoints
    await test_cron_warm_get()
    await test_cron_warm_post()
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {len(test_results['passed'])}")
    print(f"❌ FAILED: {len(test_results['failed'])}")
    print(f"⚠️  WARNINGS: {len(test_results['warnings'])}")
    print("="*80)
    
    if test_results['failed']:
        print("\n❌ FAILED TESTS:")
        for fail in test_results['failed']:
            print(f"  - {fail['test']}: {fail['reason']}")
    
    if test_results['warnings']:
        print("\n⚠️  WARNINGS:")
        for warn in test_results['warnings']:
            print(f"  - {warn['test']}: {warn['message']}")
    
    # Check for critical issue: ALL assets showing "Dati insufficienti"
    fallback_count = sum(1 for w in test_results['warnings'] 
                        if 'Dati insufficienti' in w.get('message', ''))
    
    if fallback_count >= 4:  # If all tested assets show fallback
        print("\n🚨 CRITICAL: Gemini API key appears to be non-functional!")
        print("   All assets are showing 'Dati insufficienti' fallback.")
        print("   This indicates the GEMINI_API_KEY is not working properly.")
    
    print("\n" + "="*80)
    
    # Exit with appropriate code
    sys.exit(1 if test_results['failed'] else 0)


if __name__ == "__main__":
    asyncio.run(main())
