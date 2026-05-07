#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================


user_problem_statement: |
  Verifica i seguenti endpoint del backend Speculative Alpha (FastAPI a localhost:8001) dopo modifiche significative.
  Test endpoints: verdict, verdict/performance, cot/refresh, cron/warm, health, assets, cot/{asset}

backend:
  - task: "GET /api/health endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Endpoint returns status='ok' with timestamp. All fields present and valid."

  - task: "GET /api/assets endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Returns 18 assets with unique assetIds. All required fields (assetId, name, type, core) present."

  - task: "GET /api/cot/{asset_id} endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Tested with SP500. Returns all required fields: netPosition, wowDelta, long, short, reportDate. Data is valid."

  - task: "GET /api/verdict/{asset_id} endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Tested with SP500, NAS100, GOLD, EURUSD. All return valid verdict (LONG/SHORT/WAIT), confidence (1-5), and non-empty summary. GEMINI_API_KEY is working - 3 out of 4 assets returned proper LLM-generated summaries. NAS100 showed 'Dati insufficienti' fallback due to rate limiting (429 error - free tier limit of 5 requests/minute). This is expected behavior, not a bug."

  - task: "GET /api/verdict/{asset_id}/performance endpoint (Signal Accuracy)"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Tested with SP500, NAS100, GOLD, BTC. All return correct structure with modes.LTS.window12w, modes.LTS.window24w, modes.ST.window12w, modes.ST.window24w. Each window contains: total, respected, notRespected, skipped, accuracy, avgFavorableRangePct, avgAdverseRangePct, highConfAccuracy. Accuracy values are within 0-100 range. History array contains all required fields: reportDate, weekStart, weekEnd, weekLow, weekHigh, weekRangePct, signalLTS, signalST, confidence, respectedLTS, respectedST."

  - task: "POST /api/cot/refresh endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Returns status='cache cleared' without errors. Verified via MongoDB that cot_history_cache collection is preserved (7 documents with 200 entries each). Only clears cot_cache, macro_cache, verdict_cache, and calendar_cache as intended."

  - task: "GET /api/cron/warm endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Returns status='warm started' immediately (async). Response is instant as expected."

  - task: "POST /api/cron/warm endpoint"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "testing"
        comment: "Returns status='warm started' immediately (async). Response is instant as expected."

frontend:
  - task: "Frontend testing"
    implemented: false
    working: "NA"
    file: ""
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "testing"
        comment: "Frontend testing not requested. Backend-only testing as per review request."

metadata:
  created_by: "testing_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "All backend endpoints tested and verified"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "testing"
    message: |
      Backend testing completed successfully. All 8 endpoint groups tested:
      
      ✅ PASSED (14 tests total):
      1. GET /api/health - Working correctly
      2. GET /api/assets - Returns 18 assets with unique IDs
      3. GET /api/cot/SP500 - Returns valid COT data
      4. GET /api/verdict/SP500 - Working with LLM-generated summary
      5. GET /api/verdict/NAS100 - Working (fallback due to rate limit)
      6. GET /api/verdict/GOLD - Working with LLM-generated summary
      7. GET /api/verdict/EURUSD - Working with LLM-generated summary
      8. GET /api/verdict/SP500/performance - All fields valid, accuracy in range
      9. GET /api/verdict/NAS100/performance - All fields valid, accuracy in range
      10. GET /api/verdict/GOLD/performance - All fields valid, accuracy in range
      11. GET /api/verdict/BTC/performance - All fields valid, accuracy in range
      12. POST /api/cot/refresh - Cache cleared, history preserved
      13. GET /api/cron/warm - Async warm started
      14. POST /api/cron/warm - Async warm started
      
      ⚠️ MINOR OBSERVATIONS (not bugs):
      - NAS100 verdict showed "Dati insufficienti" fallback due to Gemini API rate limiting (429 error)
      - This is expected behavior on free tier (5 requests/minute limit)
      - GEMINI_API_KEY is working correctly (verified by successful responses on SP500, GOLD, EURUSD)
      - Backend logs show successful Gemini API calls with 200 OK responses
      
      🔍 VERIFIED:
      - cot_history_cache collection preserved after POST /api/cot/refresh (7 documents, 200 entries each)
      - All accuracy values are within 0-100 range
      - All verdict responses have valid structure (verdict: LONG/SHORT/WAIT, confidence: 1-5, non-empty summary)
      - Performance endpoint returns complete structure with LTS/ST modes and 12w/24w windows
      
      NO CRITICAL ISSUES FOUND. All endpoints working as expected.
