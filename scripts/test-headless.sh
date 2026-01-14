#!/bin/bash
# Run Peek headless for testing and capture output
# Usage: ./scripts/test-headless.sh [sleep_seconds]

SLEEP_TIME=${1:-8}

yarn kill 2>/dev/null
PEEK_HEADLESS=1 yarn start:electron 2>&1 &
PID=$!
sleep $SLEEP_TIME
yarn kill 2>/dev/null
wait $PID 2>/dev/null
