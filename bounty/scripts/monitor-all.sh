#!/usr/bin/env bash
# Gateway + studio + rate-health monitor (hackathon 429 watching).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BOUNTY="$REPO/bounty"

if ! curl -sf -o /dev/null http://127.0.0.1:18789/ 2>/dev/null; then
  echo "Starting gateway…"
  bash "$BOUNTY/scripts/run-gateway.sh" &
  sleep 12
fi
if ! curl -sf -o /dev/null http://127.0.0.1:8765/ 2>/dev/null; then
  echo "Starting studio…"
  node "$REPO/apps/studio/serve.mjs" &
  sleep 2
fi

echo "Gateway: http://127.0.0.1:18789"
echo "Studio:  http://127.0.0.1:8765"
echo "Rate log: bounty/runs/rate-health.jsonl"
echo ""
cd "$BOUNTY"
set -a && [ -f .env ] && . ./.env && set +a
exec node tools/monitor-rate.mjs --every "${EVERY:-30}"