#!/usr/bin/env node
/**
 * Log whether the trial endpoint accepts requests (200 vs 429). Run alongside campaign/UI.
 *   node tools/monitor-rate.mjs [--every 30]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BOUNTY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG = path.join(BOUNTY, 'runs', 'rate-health.jsonl');
const envPath = path.join(BOUNTY, '.env');
if (fs.existsSync(envPath) && !process.env.CEREBRAS_API_KEY) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*CEREBRAS_API_KEY\s*=\s*(.+)\s*$/);
    if (m) process.env.CEREBRAS_API_KEY = m[1].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.CEREBRAS_API_KEY;
const MODEL = process.env.MODEL || 'moonshotai-kimi-k3.1-pro-trial';
const every = Number(process.argv.find((a, i) => process.argv[i - 1] === '--every') || 30) * 1000;

if (!KEY) {
  console.error('Set CEREBRAS_API_KEY');
  process.exit(1);
}
fs.mkdirSync(path.dirname(LOG), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Rate monitor every ${every / 1000}s → ${LOG}`);
console.log('Ctrl+C to stop.\n');

for (;;) {
  const ts = new Date().toISOString();
  const t0 = Date.now();
  let row = { ts, ok: false, status: null, retryAfter: null, ms: null };
  try {
    const r = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_completion_tokens: 8,
        stream: false,
        reasoning_effort: 'low',
      }),
    });
    row.status = r.status;
    row.retryAfter = r.headers.get('retry-after');
    row.ms = Date.now() - t0;
    row.ok = r.status === 200;
    if (!r.ok) row.body = (await r.text()).slice(0, 120);
  } catch (e) {
    row.error = String(e.message || e);
    row.ms = Date.now() - t0;
  }
  fs.appendFileSync(LOG, `${JSON.stringify(row)}\n`);
  const tag = row.ok ? 'OK' : row.status === 429 ? '429 RATE LIMIT' : `ERR ${row.status}`;
  console.log(`${ts} ${tag} ${row.ms}ms${row.retryAfter ? ` retry-after=${row.retryAfter}` : ''}`);
  await sleep(every);
}