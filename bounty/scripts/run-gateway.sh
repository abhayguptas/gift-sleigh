#!/usr/bin/env bash
# Patched OpenClaw @ 8b18b55 — isolated from global ~/.openclaw.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$REPO/.openclaw-bounty-state"
bash "$REPO/bounty/scripts/sync-agent-workspace.sh"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 24.22.1
export OPENCLAW_STATE_DIR="$STATE"
export OPENCLAW_CONFIG_PATH="$STATE/openclaw.json"
export OPENCLAW_ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS=1
set -a
# shellcheck disable=SC1091
[ -f "$STATE/.env" ] && . "$STATE/.env"
[ -f "$REPO/bounty/.env" ] && . "$REPO/bounty/.env"
[ -f "$REPO/.env" ] && . "$REPO/.env"
set +a
node -e "
const fs=require('fs');
const p=process.env.OPENCLAW_CONFIG_PATH;
const j=JSON.parse(fs.readFileSync(p,'utf8'));
j.meta=j.meta||{};
if(j.meta.lastTouchedVersion!=='2026.10.9'){j.meta.lastTouchedVersion='2026.10.9';fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');}
"
cd "$REPO/openclaw"
exec node openclaw.mjs gateway run --force