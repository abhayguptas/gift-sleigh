# Gift Sleigh Studio

Pastel, responsive shell for mentors: helper copy (view-only), locked prompt, embedded OpenClaw chat.

```bash
bash bounty/scripts/run-gateway.sh    # terminal 1
node apps/studio/serve.mjs              # terminal 2
```

→ **http://127.0.0.1:8765**

`serve.mjs` proxies port **18789** and relaxes iframe headers. Plain `python3 -m http.server` cannot embed chat.

| File | Role |
|------|------|
| `serve.mjs` | Static site + reverse proxy + WebSocket |
| `locked-prompt.txt` | Synced from `bounty/prompts/santa-speed-shopper.txt` |
| `icons/` | Mascot and UI accents (SVG) |