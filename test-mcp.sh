#!/bin/bash
# MCP Protocol Smoke Test for cpp-oas-estimator
# Usage: Start the server first (npm run build && node dist/index.js),
# then run: bash test-mcp.sh
#
# NOTE: This script calls tools repeatedly and deliberately exhausts the
# server's free quota (5 estimates/month, FREE_MONTHLY_LIMIT) to test quota
# enforcement. Run the server with the DEFAULT limit (do NOT set
# FREE_MONTHLY_LIMIT) so the quota section works.

BASE_URL="${MCP_URL:-http://localhost:8080}"
MCP_ENDPOINT="$BASE_URL/mcp"
HEALTH_ENDPOINT="$BASE_URL/health"
PASSED=0
FAILED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; PASSED=$((PASSED + 1)); }
fail() { echo -e "${RED}FAIL${NC} $1: $2"; FAILED=$((FAILED + 1)); }

echo "Testing MCP server at $BASE_URL"
echo "================================"

# 1. Health check
echo ""
echo "--- Health Check ---"
HEALTH=$(curl -sf "$HEALTH_ENDPOINT" 2>/dev/null) || true
if echo "$HEALTH" | grep -q "healthy"; then
  pass "GET /health returns healthy"
else
  fail "GET /health" "Expected 'healthy' in response, got: $HEALTH"
fi

# 2. Initialize handshake
echo ""
echo "--- MCP Initialize ---"
INIT_RESPONSE=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "smoke-test", "version": "1.0" }
    }
  }' 2>/dev/null) || true

if echo "$INIT_RESPONSE" | grep -q '"result"'; then
  pass "initialize returns result"
else
  fail "initialize" "No 'result' in response: $INIT_RESPONSE"
fi

# 3. List tools
echo ""
echo "--- List Tools ---"
TOOLS_RESPONSE=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' 2>/dev/null) || true

if echo "$TOOLS_RESPONSE" | grep -q '"tools"'; then
  pass "tools/list returns tools array"
  TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['result']['tools']))" 2>/dev/null || echo "?")
  echo "     Found $TOOL_COUNT tool(s)"
else
  fail "tools/list" "No 'tools' in response: $TOOLS_RESPONSE"
fi

# 4. Check specific tools exist
EXPECTED_TOOLS=("estimate_cpp" "estimate_oas" "clawback_check")
for TOOL in "${EXPECTED_TOOLS[@]}"; do
  if echo "$TOOLS_RESPONSE" | grep -q "\"$TOOL\""; then
    pass "Tool '$TOOL' is registered"
  else
    fail "Tool '$TOOL'" "Not found in tools/list response"
  fi
done

# 5. Call estimate_cpp (max-input scenario)
echo ""
echo "--- Call estimate_cpp ---"
CALL_CPP=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "estimate_cpp",
      "arguments": { "avg_pensionable_earnings": 74600, "contributory_years": 47, "retirement_age": 65 }
    }
  }' 2>/dev/null) || true

if echo "$CALL_CPP" | grep -q '"monthly_benefit"'; then
  pass "estimate_cpp returns monthly_benefit"
  echo "     $(echo "$CALL_CPP" | python3 -c "import sys,json; t=json.load(sys.stdin)['result']['content'][0]['text']; print('monthly_benefit:', json.loads(t)['monthly_benefit'])" 2>/dev/null)"
else
  fail "estimate_cpp" "No 'monthly_benefit' in response"
fi

# 6. Call estimate_oas (40 years, 65-74)
echo ""
echo "--- Call estimate_oas ---"
CALL_OAS=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "estimate_oas",
      "arguments": { "residency_years_18_65": 40, "deferral_months": 0, "age_band": "65-74" }
    }
  }' 2>/dev/null) || true

if echo "$CALL_OAS" | grep -q '"monthly_benefit"'; then
  pass "estimate_oas returns monthly_benefit"
  echo "     $(echo "$CALL_OAS" | python3 -c "import sys,json; t=json.load(sys.stdin)['result']['content'][0]['text']; print('monthly_benefit:', json.loads(t)['monthly_benefit'])" 2>/dev/null)"
else
  fail "estimate_oas" "No 'monthly_benefit' in response"
fi

# 7. Call clawback_check (above threshold)
echo ""
echo "--- Call clawback_check ---"
CALL_CLAW=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "clawback_check",
      "arguments": { "net_income": 100323 }
    }
  }' 2>/dev/null) || true

if echo "$CALL_CLAW" | grep -q '"annual_clawback"'; then
  pass "clawback_check returns annual_clawback"
  echo "     $(echo "$CALL_CLAW" | python3 -c "import sys,json; t=json.load(sys.stdin)['result']['content'][0]['text']; d=json.loads(t); print('annual_clawback:', d['annual_clawback'], '| monthly_reduction:', d['monthly_reduction'])" 2>/dev/null)"
else
  fail "clawback_check" "No 'annual_clawback' in response"
fi

# 8. Invalid input: retirement_age 59 must fail validation
echo ""
echo "--- Invalid input validation ---"
CALL_BAD=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "estimate_cpp",
      "arguments": { "contributory_years": 40, "retirement_age": 59 }
    }
  }' 2>/dev/null) || true

if echo "$CALL_BAD" | grep -qiE '"error"|Invalid'; then
  pass "invalid retirement_age 59 rejected"
else
  fail "invalid input" "Expected a validation error, got: $(echo "$CALL_BAD" | head -c 200)"
fi

# 9. Quota enforcement: exhaust the quota, next call must fail
echo ""
echo "--- Free quota enforcement ---"
for i in 7 8 9 10 11 12; do
  curl -sf -X POST "$MCP_ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $i,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"clawback_check\",
        \"arguments\": { \"net_income\": 50000 }
      }
    }" >/dev/null 2>&1 || true
done
CALL_QUOTA=$(curl -sf -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 13,
    "method": "tools/call",
    "params": {
      "name": "clawback_check",
      "arguments": { "net_income": 50000 }
    }
  }' 2>/dev/null) || true

if echo "$CALL_QUOTA" | grep -q "Free quota exceeded"; then
  pass "free quota exceeded returns the quota message"
else
  fail "quota enforcement" "Expected 'Free quota exceeded' message, got: $(echo "$CALL_QUOTA" | head -c 200)"
fi

# Summary
echo ""
echo "================================"
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"

if [ $FAILED -gt 0 ]; then
  exit 1
fi
