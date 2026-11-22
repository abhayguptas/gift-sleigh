#!/usr/bin/env bash
# One-time: build patched OpenClaw and merge bounty config into isolated state.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO/openclaw"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1090
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 24.22.1
nvm use 24.22.1

pnpm install
pnpm build
pnpm ui:build

node "$REPO/bounty/tools/merge-openclaw-config.mjs"

echo "Done. Next: bash bounty/scripts/run-gateway.sh"