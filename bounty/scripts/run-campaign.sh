#!/usr/bin/env bash
# Continuous TPS campaign (API 2-call shape). Optional: gateway + studio in other terminals for UI runs.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BOUNTY="$REPO/bounty"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24.22.1 2>/dev/null || true

bash "$BOUNTY/scripts/sync-agent-workspace.sh"
set -a
# shellcheck disable=SC1091
[ -f "$BOUNTY/.env" ] && . "$BOUNTY/.env"
set +a

if [ -z "${CEREBRAS_API_KEY:-}" ]; then
  echo "Set CEREBRAS_API_KEY in bounty/.env"
  exit 1
fi

cd "$BOUNTY"
echo "Logs: bounty/runs/campaign-*.jsonl · best: bounty/runs/campaign-best.json"
echo "For UI attempts: also run run-gateway.sh + apps/studio/serve.mjs and use fresh sessions."
echo ""
# Hackathon: slow down — Cerebras enforces RPM as ~1 req/s bursts; pair = 2 calls.
export CEREBRAS_MIN_GAP_MS="${CEREBRAS_MIN_GAP_MS:-2500}"
export CEREBRAS_PAIR_GAP_MS="${CEREBRAS_PAIR_GAP_MS:-3500}"
exec node tools/bench-tps.mjs campaign --effort low --pause "${PAUSE:-45}" "$@"