# Bounty engine

Config, prompts, agent rules, and scripts for the Gift Sleigh Speed Bounty run.

## Commands

| Script | What it does |
|--------|----------------|
| `scripts/install-openclaw.sh` | First-time OpenClaw build + config merge |
| `scripts/run-gateway.sh` | Start patched gateway on **18789** (syncs workspace first) |
| `scripts/sync-agent-workspace.sh` | Push `agent-workspace/` + prompt into state + studio |
| `tools/bench-tps.mjs` | Measure API tok/s (`pair`, `probe`, `report`) |
| `tools/verify-gift-links.mjs` | Check five URLs from clipboard |
| `tools/parse-tps.mjs` | Parse logged tok/s lines |
| `scripts/run-campaign.sh` | Loop 2-call API benchmark, save best + optional screenshot |

## Files

- **`prompts/santa-speed-shopper.txt`** — locked bounty prompt (source of truth)
- **`agent-workspace/SPEED-BOUNTY.md`** — two-call rules; live Shopify catalog, products not pasted into the prompt
- **`agent-workspace/skills/speed-bounty-gifts/`** — skill injected into OpenClaw state

## Environment

Copy `bounty/.env.example` → `bounty/.env` with your Cerebras key. Never commit `.env`.

## Docs

- [`docs/hackathon-plan.md`](docs/hackathon-plan.md) — planning notes
- [`docs/setup-status.md`](docs/setup-status.md) — machine setup snapshot (optional)