#!/usr/bin/env bash
# Gift Sleigh Studio UI — http://127.0.0.1:8765 (gateway must be on 18789).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$REPO/apps/studio/serve.mjs"