#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# E2E Sync & Version Compatibility Test
#
# Tests sync between local server, headless desktop, and iOS simulator
# across multiple accounts, multiple profiles, and all 9 version permutations.
#
# Usage:
#   ./scripts/e2e-version-test.sh              # run all phases
#   ./scripts/e2e-version-test.sh --phase 4    # run only phase 4 (setup is automatic)
#   ./scripts/e2e-version-test.sh --phase 2,3  # run phases 2 and 3
#   ./scripts/e2e-version-test.sh --phase 4,5  # run mobile phases
#
# Phases:
#   0  Prerequisites (always runs)
#   1  Setup: server, users, profiles, seed data (always runs)
#   2  Desktop sync tests (automated)
#   3  Version permutation tests (automated)
#   4  Mobile sync test (semi-automated)
#   5  Mobile version mismatch test (semi-automated)
# ============================================================================

# --- Argument parsing -------------------------------------------------------

RUN_PHASES=""  # empty = all

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase|--phases)
      RUN_PHASES="$2"
      shift 2
      ;;
    -h|--help)
      head -22 "$0" | tail -16
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

should_run() {
  local phase="$1"
  # Empty = run all
  [ -z "$RUN_PHASES" ] && return 0
  # Check if phase is in comma-separated list
  echo ",$RUN_PHASES," | grep -q ",$phase,"
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_JS="$PROJECT_ROOT/backend/server/version.js"

TS="$(date +%s)"
LOG_FILE="/tmp/e2e-version-test-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

# --- Logging helpers --------------------------------------------------------

FAILURES=0
PASSES=0
PHASE="init"

log()      { echo "[$(date +%H:%M:%S)] [$1] $2"; }
log_pass() { log "$1" "PASS: $2"; PASSES=$((PASSES + 1)); }
log_fail() { log "$1" "FAIL: $2"; FAILURES=$((FAILURES + 1)); }
log_skip() { log "$1" "SKIP: $2"; }

assert_status() {
  local TEST_NAME="$1" EXPECTED="$2" ACTUAL="$3"
  local RESPONSE_BODY="${4:-}" RESPONSE_HEADERS="${5:-}"
  if [ "$ACTUAL" -eq "$EXPECTED" ]; then
    log_pass "$PHASE" "$TEST_NAME: $ACTUAL"
  else
    log_fail "$PHASE" "$TEST_NAME: got $ACTUAL, expected $EXPECTED"
    [ -n "$RESPONSE_HEADERS" ] && log "$PHASE" "  Response headers: $RESPONSE_HEADERS"
    [ -n "$RESPONSE_BODY" ]    && log "$PHASE" "  Response body: $RESPONSE_BODY"
    if [ -f "$SERVER_LOG" ]; then
      log "$PHASE" "  Server log (last 20 lines):"
      tail -20 "$SERVER_LOG" | while IFS= read -r line; do
        log "$PHASE" "    $line"
      done
    fi
  fi
}

# --- Configuration ----------------------------------------------------------

PORT=$((20000 + RANDOM % 10000))
SERVER_TEMP_DIR="$(mktemp -d /tmp/e2e-peek-server-XXXXXX)"
SERVER_LOG="$SERVER_TEMP_DIR/server.log"
SERVER_PID=""

USER_A_KEY="e2e-a-key-$TS"
USER_B_KEY="e2e-b-key-$TS"

PROFILE_A_DEFAULT_ID=""
PROFILE_A_WORK_ID=""
PROFILE_B_DEFAULT_ID=""

DESKTOP_PROFILE_A_DEFAULT="test-e2e-a-default-$TS"
DESKTOP_PROFILE_A_WORK="test-e2e-a-work-$TS"
DESKTOP_PROFILE_B_DEFAULT="test-e2e-b-default-$TS"

USER_DATA_PATH="$HOME/Library/Application Support/Peek"

ORIGINAL_VERSION_JS=""

log "init" "E2E Sync & Version Compatibility Test"
log "init" "Log file: $LOG_FILE"
log "init" "Server temp dir: $SERVER_TEMP_DIR"
log "init" "Port: $PORT"
if [ -n "$RUN_PHASES" ]; then
  log "init" "Running phases: $RUN_PHASES (setup always included)"
else
  log "init" "Running all phases"
fi

# --- Cleanup trap -----------------------------------------------------------

cleanup() {
  log "cleanup" "Starting cleanup..."

  # Kill server
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    log "cleanup" "Killed server (PID $SERVER_PID)"
  fi

  # Restore version.js
  if [ -n "$ORIGINAL_VERSION_JS" ]; then
    echo "$ORIGINAL_VERSION_JS" > "$VERSION_JS"
    log "cleanup" "Restored version.js"
  fi

  # Remove server temp dir
  rm -rf "$SERVER_TEMP_DIR"
  log "cleanup" "Removed $SERVER_TEMP_DIR"

  # Remove desktop test profiles
  for p in "$DESKTOP_PROFILE_A_DEFAULT" "$DESKTOP_PROFILE_A_WORK" "$DESKTOP_PROFILE_B_DEFAULT"; do
    local dir="$USER_DATA_PATH/$p"
    if [ -d "$dir" ]; then
      rm -rf "$dir"
      log "cleanup" "Removed desktop profile dir: $p"
    fi
  done

  # Clean test profiles from .dev-profiles.db
  local profiles_db="$USER_DATA_PATH/.dev-profiles.db"
  if [ -f "$profiles_db" ]; then
    sqlite3 "$profiles_db" "DELETE FROM profiles WHERE name LIKE 'test-e2e-%';" 2>/dev/null || true
    log "cleanup" "Cleaned test profiles from .dev-profiles.db"
  fi

  # Clear mobile sync config
  clear_mobile_config

  log "cleanup" "Cleanup complete"
  print_results
  log "cleanup" "Log file: $LOG_FILE"
}

trap cleanup EXIT

# --- Helper: start/stop server ----------------------------------------------

start_server() {
  DATA_DIR="$SERVER_TEMP_DIR" PORT="$PORT" node "$PROJECT_ROOT/backend/server/index.js" > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  log "$PHASE" "Starting server on port $PORT (PID: $SERVER_PID)"

  # Wait for server ready
  local attempts=0
  while ! curl -sf "http://localhost:$PORT/" > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ $attempts -gt 30 ]; then
      log_fail "$PHASE" "Server failed to start after 30 attempts"
      log "$PHASE" "Server log:"
      cat "$SERVER_LOG"
      exit 1
    fi
    sleep 0.5
  done
  log "$PHASE" "Server ready (health check OK)"
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    log "$PHASE" "Stopped server (PID $SERVER_PID)"
    SERVER_PID=""
  fi
}

write_version_js() {
  local DS="$1" PROTO="$2"
  cat > "$VERSION_JS" <<VEOF
const DATASTORE_VERSION = $DS;
const PROTOCOL_VERSION = $PROTO;
module.exports = { DATASTORE_VERSION, PROTOCOL_VERSION };
VEOF
  log "$PHASE" "Wrote version.js: DS=$DS, PROTO=$PROTO"
}

# --- Helper: mobile config --------------------------------------------------

clear_mobile_config() {
  local container
  container="$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null \
    | grep 'group.com.dietrich.peek-mobile' | awk '{print $2}')" || true
  if [ -n "$container" ]; then
    local pjson="$container/profiles.json"
    if [ -f "$pjson" ]; then
      python3 -c "
import json, sys
p = '$pjson'
try:
    d = json.load(open(p))
    for prof in d.get('profiles', []):
        prof['server_url'] = ''
        prof['api_key'] = ''
        prof.pop('server_profile_id', None)
    d.pop('sync', None)
    json.dump(d, open(p, 'w'), indent=2)
except Exception:
    pass
"
      log "cleanup" "Cleared mobile sync config in profiles.json"
    fi
  fi
}

# --- Results ----------------------------------------------------------------

print_results() {
  local TOTAL=$((PASSES + FAILURES))
  echo ""
  echo "=========================================="
  echo "  E2E Sync & Version Test Results"
  echo "=========================================="
  echo ""
  echo "Total: $PASSES/$TOTAL passed"
  if [ "$FAILURES" -gt 0 ]; then
    echo "  *** $FAILURES FAILURE(S) ***"
  fi
  echo ""
  echo "Log: $LOG_FILE"
  echo "=========================================="
}

# ============================================================================
# Phase 0: Prerequisites (always runs)
# ============================================================================
PHASE="prereqs"
log "$PHASE" "Checking prerequisites..."

for tool in node electron curl sqlite3 python3 xcrun; do
  if command -v "$tool" &>/dev/null; then
    log "$PHASE" "  $tool: $(command -v "$tool")"
  else
    if [ "$tool" = "xcrun" ]; then
      log "$PHASE" "  $tool: not found (mobile tests will be skipped)"
    else
      log_fail "$PHASE" "$tool not found"
      exit 1
    fi
  fi
done

# Save original version.js
ORIGINAL_VERSION_JS="$(cat "$VERSION_JS")"
log "$PHASE" "Saved original version.js ($(wc -c < "$VERSION_JS") bytes)"

# Build desktop
log "$PHASE" "Building desktop app (yarn build)..."
(cd "$PROJECT_ROOT" && yarn build) 2>&1 | tail -5
log "$PHASE" "Desktop build complete"

# ============================================================================
# Phase 1: Setup (always runs)
# ============================================================================
PHASE="setup"
log "$PHASE" "=== Phase 1: Setup ==="

# Create test users
log "$PHASE" "Creating test users..."
USER_JSON="$(DATA_DIR="$SERVER_TEMP_DIR" USER_A_KEY="$USER_A_KEY" USER_B_KEY="$USER_B_KEY" \
  node "$SCRIPT_DIR/e2e-setup-users.js")"
log "$PHASE" "Users created: $USER_JSON"

# Start server
start_server

# Create profiles for account-a
log "$PHASE" "Creating profiles for account-a..."
RESP="$(curl -sf -X POST "http://localhost:$PORT/profiles" \
  -H "Authorization: Bearer $USER_A_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"default","name":"Default"}')"
PROFILE_A_DEFAULT_ID="$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['profile']['id'])")"
log "$PHASE" "Created profile default for account-a → id=$PROFILE_A_DEFAULT_ID"

RESP="$(curl -sf -X POST "http://localhost:$PORT/profiles" \
  -H "Authorization: Bearer $USER_A_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"work","name":"Work"}')"
PROFILE_A_WORK_ID="$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['profile']['id'])")"
log "$PHASE" "Created profile work for account-a → id=$PROFILE_A_WORK_ID"

# Create profile for account-b
log "$PHASE" "Creating profile for account-b..."
RESP="$(curl -sf -X POST "http://localhost:$PORT/profiles" \
  -H "Authorization: Bearer $USER_B_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"default","name":"Default"}')"
PROFILE_B_DEFAULT_ID="$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['profile']['id'])")"
log "$PHASE" "Created profile default for account-b → id=$PROFILE_B_DEFAULT_ID"

# Seed test data
log "$PHASE" "Seeding test data..."

seed_item() {
  local KEY="$1" PROFILE_ID="$2" TYPE="$3" CONTENT="$4" LABEL="$5"
  local STATUS BODY
  BODY="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "http://localhost:$PORT/items?profile=$PROFILE_ID" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d "{\"type\":\"$TYPE\",\"content\":\"$CONTENT\"}")"
  log "$PHASE" "Seeded $LABEL → HTTP $BODY"
}

# Account A / default (2 items)
seed_item "$USER_A_KEY" "$PROFILE_A_DEFAULT_ID" "url"  "https://acct-a-default-1.example.com" "account-a/default item 1 (url)"
seed_item "$USER_A_KEY" "$PROFILE_A_DEFAULT_ID" "text" "acct-a-default-note-$TS"              "account-a/default item 2 (text)"

# Account A / work (2 items)
seed_item "$USER_A_KEY" "$PROFILE_A_WORK_ID" "url"  "https://acct-a-work-1.example.com" "account-a/work item 1 (url)"
seed_item "$USER_A_KEY" "$PROFILE_A_WORK_ID" "text" "acct-a-work-note-$TS"              "account-a/work item 2 (text)"

# Account B / default (2 items)
seed_item "$USER_B_KEY" "$PROFILE_B_DEFAULT_ID" "url"  "https://acct-b-default-1.example.com" "account-b/default item 1 (url)"
seed_item "$USER_B_KEY" "$PROFILE_B_DEFAULT_ID" "text" "acct-b-default-note-$TS"              "account-b/default item 2 (text)"

log "$PHASE" "Seeded 6 items total"

# ============================================================================
# Phase 2: Desktop Sync Tests
# ============================================================================
if should_run 2; then
PHASE="desktop"
log "$PHASE" "=== Phase 2: Desktop Sync Tests ==="

run_desktop_sync() {
  local PROFILE_NAME="$1" API_KEY="$2" SERVER_SLUG="$3" EXPECTED_COUNT="$4" LABEL="$5"

  log "$PHASE" "Syncing profile $PROFILE_NAME (slug=$SERVER_SLUG)..."

  PROFILE="$PROFILE_NAME" \
  SERVER_URL="http://localhost:$PORT" \
  API_KEY="$API_KEY" \
  SERVER_PROFILE_SLUG="$SERVER_SLUG" \
    electron "$SCRIPT_DIR/preconfigure-sync.mjs" 2>&1 | while IFS= read -r line; do
      log "$PHASE" "  [electron] $line"
    done

  # Verify via sqlite3
  local DB_PATH="$USER_DATA_PATH/$PROFILE_NAME/datastore.sqlite"
  if [ ! -f "$DB_PATH" ]; then
    log_fail "$PHASE" "$LABEL — database not found at $DB_PATH"
    return
  fi

  local ITEM_COUNT
  ITEM_COUNT="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM items WHERE deletedAt = 0;")"
  log "$PHASE" "  Item count: $ITEM_COUNT (expected $EXPECTED_COUNT)"

  if [ "$ITEM_COUNT" -eq "$EXPECTED_COUNT" ]; then
    log_pass "$PHASE" "$LABEL: $ITEM_COUNT/$EXPECTED_COUNT items, isolation OK"
  else
    log_fail "$PHASE" "$LABEL: got $ITEM_COUNT items, expected $EXPECTED_COUNT"
    log "$PHASE" "  Items in DB:"
    sqlite3 "$DB_PATH" "SELECT id, type, content, syncSource FROM items WHERE deletedAt = 0;" | while IFS= read -r row; do
      log "$PHASE" "    $row"
    done
  fi
}

run_desktop_sync "$DESKTOP_PROFILE_A_DEFAULT" "$USER_A_KEY" "default" 2 "Account A default"
run_desktop_sync "$DESKTOP_PROFILE_A_WORK"    "$USER_A_KEY" "work"    2 "Account A work"
run_desktop_sync "$DESKTOP_PROFILE_B_DEFAULT"  "$USER_B_KEY" "default" 2 "Account B default"

else
  log "desktop" "=== Phase 2: SKIPPED ==="
fi

# ============================================================================
# Phase 3: Version Permutation Tests
# ============================================================================
if should_run 3; then
PHASE="version"
log "$PHASE" "=== Phase 3: Version Permutation Tests ==="

# Test matrix: server_ds, server_proto, expected_status, label
VERSION_TESTS=(
  "1 1 200 match"
  "2 1 409 DS-server-higher"
  "0 1 409 DS-server-lower"
  "1 2 409 PROTO-server-higher"
  "1 0 409 PROTO-server-lower"
  "2 2 409 both-higher"
  "0 0 409 both-lower"
  "2 0 409 DS-high-PROTO-low"
  "0 2 409 DS-low-PROTO-high"
)

TEST_NUM=0
for test_line in "${VERSION_TESTS[@]}"; do
  read -r SRV_DS SRV_PROTO EXPECTED LABEL <<< "$test_line"
  TEST_NUM=$((TEST_NUM + 1))

  log "$PHASE" "Test #$TEST_NUM: Server DS=$SRV_DS, PROTO=$SRV_PROTO (expect $EXPECTED — $LABEL)"

  stop_server
  write_version_js "$SRV_DS" "$SRV_PROTO"
  start_server

  # Test GET /items
  GET_HEADERS="$(mktemp)"
  GET_BODY="$(curl -s -D "$GET_HEADERS" -o - -w '\n%{http_code}' \
    "http://localhost:$PORT/items?profile=$PROFILE_A_DEFAULT_ID" \
    -H "Authorization: Bearer $USER_A_KEY" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1")"
  GET_STATUS="$(echo "$GET_BODY" | tail -1)"
  GET_RESPONSE="$(echo "$GET_BODY" | sed '$d')"
  GET_HDRS="$(cat "$GET_HEADERS")"
  rm -f "$GET_HEADERS"

  assert_status "#$TEST_NUM GET ($LABEL)" "$EXPECTED" "$GET_STATUS" "$GET_RESPONSE" "$GET_HDRS"

  # Verify response headers contain server version values
  DS_HDR="$(echo "$GET_HDRS" | grep -i 'x-peek-datastore-version' | tr -d '\r' | awk '{print $2}')"
  PROTO_HDR="$(echo "$GET_HDRS" | grep -i 'x-peek-protocol-version' | tr -d '\r' | awk '{print $2}')"
  if [ "$DS_HDR" = "$SRV_DS" ] && [ "$PROTO_HDR" = "$SRV_PROTO" ]; then
    log_pass "$PHASE" "#$TEST_NUM headers: DS=$DS_HDR, PROTO=$PROTO_HDR"
  else
    log_fail "$PHASE" "#$TEST_NUM headers: DS=$DS_HDR (expected $SRV_DS), PROTO=$PROTO_HDR (expected $SRV_PROTO)"
  fi

  # For 409 responses, verify JSON body fields
  if [ "$EXPECTED" -eq 409 ]; then
    ERROR_FIELD="$(echo "$GET_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error',''))" 2>/dev/null || echo "")"
    TYPE_FIELD="$(echo "$GET_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type',''))" 2>/dev/null || echo "")"
    if [ "$ERROR_FIELD" = "Version mismatch" ] && [ -n "$TYPE_FIELD" ]; then
      log_pass "$PHASE" "#$TEST_NUM body: error='$ERROR_FIELD', type='$TYPE_FIELD'"
    else
      log_fail "$PHASE" "#$TEST_NUM body: error='$ERROR_FIELD', type='$TYPE_FIELD'"
    fi
  fi

  # Test POST /items
  POST_HEADERS="$(mktemp)"
  POST_BODY="$(curl -s -D "$POST_HEADERS" -o - -w '\n%{http_code}' \
    -X POST "http://localhost:$PORT/items?profile=$PROFILE_A_DEFAULT_ID" \
    -H "Authorization: Bearer $USER_A_KEY" \
    -H "Content-Type: application/json" \
    -H "X-Peek-Datastore-Version: 1" \
    -H "X-Peek-Protocol-Version: 1" \
    -d "{\"type\":\"text\",\"content\":\"version-test-$TEST_NUM-$TS\"}")"
  POST_STATUS="$(echo "$POST_BODY" | tail -1)"
  POST_RESPONSE="$(echo "$POST_BODY" | sed '$d')"
  POST_HDRS="$(cat "$POST_HEADERS")"
  rm -f "$POST_HEADERS"

  assert_status "#$TEST_NUM POST ($LABEL)" "$EXPECTED" "$POST_STATUS" "$POST_RESPONSE" "$POST_HDRS"
done

# Restore version.js and restart with correct versions
log "$PHASE" "Restoring version.js to original (DS=1, PROTO=1)..."
echo "$ORIGINAL_VERSION_JS" > "$VERSION_JS"
stop_server
start_server

else
  log "version" "=== Phase 3: SKIPPED ==="
fi

# ============================================================================
# Phase 4: Mobile Sync Test (Semi-Automated)
# ============================================================================
if should_run 4; then
PHASE="mobile"
log "$PHASE" "=== Phase 4: Mobile Sync Test ==="

# Ensure server is running with correct versions
if [ -z "$SERVER_PID" ] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "$ORIGINAL_VERSION_JS" > "$VERSION_JS"
  start_server
fi

MOBILE_CONTAINER=""

if command -v xcrun &>/dev/null; then
  MOBILE_CONTAINER="$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null \
    | grep 'group.com.dietrich.peek-mobile' | awk '{print $2}')" || true
fi

if [ -z "$MOBILE_CONTAINER" ]; then
  log_skip "$PHASE" "No booted simulator or app not installed — skipping mobile tests"
else
  LOCAL_IP="$(ipconfig getifaddr en0 2>/dev/null || echo "")"
  if [ -z "$LOCAL_IP" ]; then
    log_skip "$PHASE" "Could not determine local IP (en0) — skipping mobile tests"
  else
    log "$PHASE" "App Group container: $MOBILE_CONTAINER"
    log "$PHASE" "Local IP: $LOCAL_IP"

    # Write sync config to profiles.json
    PROFILES_JSON="$MOBILE_CONTAINER/profiles.json"
    python3 -c "
import json, os
path = '$PROFILES_JSON'
data = {'profiles': []}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except Exception:
        pass

# Set sync config on ALL profile entries + top-level sync section
profiles = data.get('profiles', [])
for p in profiles:
    p['server_url'] = 'http://$LOCAL_IP:$PORT'
    p['api_key'] = '$USER_A_KEY'
    p['server_profile_id'] = '$PROFILE_A_DEFAULT_ID'

# Ensure at least one profile exists
if not profiles:
    profiles.append({
        'id': 'e2e-default-profile',
        'name': 'Default',
        'createdAt': '2026-01-01T00:00:00+00:00',
        'lastUsedAt': '2026-01-01T00:00:00+00:00',
        'server_url': 'http://$LOCAL_IP:$PORT',
        'api_key': '$USER_A_KEY',
        'server_profile_id': '$PROFILE_A_DEFAULT_ID'
    })
    data['currentProfileId'] = 'e2e-default-profile'

data['profiles'] = profiles
data['sync'] = {
    'server_url': 'http://$LOCAL_IP:$PORT',
    'api_key': '$USER_A_KEY',
    'auto_sync': False
}
json.dump(data, open(path, 'w'), indent=2)
print('Wrote profiles.json')
"
    log "$PHASE" "Wrote sync config to $PROFILES_JSON"

    # Clear stale last_sync from per-profile databases
    for dbfile in "$MOBILE_CONTAINER"/peek-*.db; do
      if [ -f "$dbfile" ]; then
        sqlite3 "$dbfile" "DELETE FROM settings WHERE key = 'last_sync';" 2>/dev/null || true
        log "$PHASE" "Cleared last_sync in $(basename "$dbfile")"
      fi
    done

    echo ""
    echo "============================================"
    echo "  MOBILE SYNC TEST"
    echo "============================================"
    echo "  Server: http://$LOCAL_IP:$PORT"
    echo "  Account: account-a (default profile)"
    echo "  Server profile: $PROFILE_A_DEFAULT_ID"
    echo ""
    echo "  1. Force-quit and relaunch the app in simulator"
    echo "  2. Go to Settings → verify server URL and API key"
    echo "  3. Tap 'Sync All'"
    echo "  4. Verify 2 items pulled (Account A default profile data)"
    echo ""
    echo -n "  Press ENTER when done (or 's' to skip): "
    read -r MOBILE_RESPONSE

    if [ "$MOBILE_RESPONSE" = "s" ]; then
      log_skip "$PHASE" "Mobile sync test skipped by user"
    else
      log_pass "$PHASE" "Mobile sync pull: user confirmed"
    fi
  fi
fi

else
  log "mobile" "=== Phase 4: SKIPPED ==="
fi

# ============================================================================
# Phase 5: Mobile Version Mismatch Test (Semi-Automated)
# ============================================================================
if should_run 5; then
PHASE="mobile-version"
log "$PHASE" "=== Phase 5: Mobile Version Mismatch Test ==="

MOBILE_CONTAINER=""
if command -v xcrun &>/dev/null; then
  MOBILE_CONTAINER="$(xcrun simctl get_app_container booted com.dietrich.peek-mobile groups 2>/dev/null \
    | grep 'group.com.dietrich.peek-mobile' | awk '{print $2}')" || true
fi

if [ -z "$MOBILE_CONTAINER" ]; then
  log_skip "$PHASE" "No booted simulator or app not installed — skipping"
else
  stop_server
  write_version_js 2 1
  start_server

  echo ""
  echo "============================================"
  echo "  MOBILE VERSION MISMATCH TEST"
  echo "============================================"
  echo "  Server now has DS=2 (mismatch with mobile's DS=1)."
  echo ""
  echo "  1. Trigger sync in the app"
  echo "  2. Expect: Error message about version mismatch"
  echo ""
  echo -n "  Press ENTER when done (or 's' to skip): "
  read -r MISMATCH_RESPONSE

  if [ "$MISMATCH_RESPONSE" = "s" ]; then
    log_skip "$PHASE" "Mobile version mismatch test skipped by user"
  else
    log_pass "$PHASE" "Mobile version mismatch: user confirmed error shown"
  fi

  # Restore for cleanup
  echo "$ORIGINAL_VERSION_JS" > "$VERSION_JS"
  stop_server
fi

else
  log "mobile-version" "=== Phase 5: SKIPPED ==="
fi

# ============================================================================
# Done (cleanup handled by trap)
# ============================================================================
PHASE="done"
log "$PHASE" "All requested phases complete."
