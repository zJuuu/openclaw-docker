#!/bin/bash
STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
TOKEN_FILE="$STATE_DIR/gateway.token"
GATEWAY_PORT="${INTERNAL_GATEWAY_PORT:-18789}"

[ -f "$TOKEN_FILE" ] || exit 0

TOKEN=$(cat "$TOKEN_FILE")
[ -n "$TOKEN" ] || exit 0

curl -sf -X POST "http://127.0.0.1:${GATEWAY_PORT}/hooks/wake" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"mode":"now"}' > /dev/null 2>&1 || true
