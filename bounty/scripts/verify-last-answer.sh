#!/usr/bin/env bash
# Paste OpenClaw answer first, or: pbpaste | bash bounty/scripts/verify-last-answer.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$REPO/bounty/tools/verify-gift-links.mjs" "$@"