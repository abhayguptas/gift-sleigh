#!/usr/bin/env bash
# Copy versioned agent rules + locked prompt into live state and studio UI.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$REPO/.openclaw-bounty-state"
WS="$STATE/workspace"
SKILL="$STATE/agents/main/agent/workshop-skills/speed-bounty-gifts"
mkdir -p "$WS" "$SKILL"
cp "$REPO/bounty/agent-workspace/AGENTS.md" "$WS/"
cp "$REPO/bounty/agent-workspace/IDENTITY.md" "$WS/"
cp "$REPO/bounty/agent-workspace/SOUL.md" "$WS/"
cp "$REPO/bounty/agent-workspace/USER.md" "$WS/"
cp "$REPO/bounty/agent-workspace/skills/speed-bounty-gifts/SKILL.md" "$SKILL/"
rm -f "$WS/BOOTSTRAP.md"
DEP="$STATE/agents/main/agent/workshop-skills/sourced-product-research"
if [ -d "$DEP" ]; then
  mv "$DEP" "$DEP.disabled" 2>/dev/null || true
fi
cp "$REPO/bounty/prompts/santa-speed-shopper.txt" "$REPO/apps/studio/locked-prompt.txt"
echo "Synced agent workspace, skill, and studio locked prompt."
