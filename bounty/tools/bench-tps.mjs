#!/usr/bin/env node
// Raw-endpoint benchmark + load probe for Kimi K3.1 Pro on Cerebras.
// BENCHMARK ONLY: the synthetic context below is never used in the demo.
//
// The official patch scores each model call as completion_tokens / time_info.completion_time
// (server-side decode speed) and averages calls equally. So the primary rate here is that
// server rate ("srv"). Client-side timing is only a fallback when time_info is missing.
//
//   node bench.mjs sweep  --efforts low,high --styles free,copy --temps default,0 --reps 4 --max 16384
//   node bench.mjs probe  --every 15 [--count 40]
//   node bench.mjs report
//   node bench.mjs once   --effort high --style copy --debug
//   node bench.mjs pair   --effort high --reps 5     (2-call agent: tool turn + final; predicts the patch mean)
// Styles: free | copy | short (tiny answer) | tool (emits tool calls, like an agent's first turn)
//
// Env: CEREBRAS_API_KEY (required), MODEL, CEREBRAS_BASE_URL, TPM_BUDGET (default 80000)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tps } from './parse-tps.mjs';

const BOUNTY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_DIR = path.join(BOUNTY_ROOT, 'runs');
const SHOTS_DIR = path.join(RUNS_DIR, 'screenshots');

function loadEnvFile() {
  if (process.env.CEREBRAS_API_KEY) return;
  for (const p of [path.join(BOUNTY_ROOT, '.env'), path.join(BOUNTY_ROOT, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*CEREBRAS_API_KEY\s*=\s*(.+)\s*$/);
      if (m) process.env.CEREBRAS_API_KEY = m[1].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnvFile();

const KEY = process.env.CEREBRAS_API_KEY || '';
const BASE = process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';
const MODEL = process.env.MODEL || 'moonshotai-kimi-k3.1-pro-trial';
const TPM_BUDGET = Number(process.env.TPM_BUDGET || 80000); // stay under the 100K cap
const TIMEOUT_MS = 240000;
fs.mkdirSync(RUNS_DIR, { recursive: true });

// ---------- synthetic context (static prefix, task goes last) ----------
const ITEMS = [
  ['Trail Lantern Pro', 'Rechargeable camping lantern with a 40-hour battery and a hanging hook.'],
  ['Cast Iron Skillet 12in', 'Pre-seasoned skillet that moves from stovetop to oven to campfire.'],
  ['Brick Builder Set 900pc', 'Modular building set with instructions for three different models.'],
  ['Wool Hiking Socks 3-pack', 'Merino blend socks with reinforced heels and a seamless toe.'],
  ['Pocket Telescope', 'Compact 25x telescope with a tripod and a carrying pouch.'],
  ['Board Game: Harbor Traders', 'Trading game for two to five players with a playing time of about 45 minutes.'],
  ['Insulated Steel Bottle 32oz', 'Keeps drinks cold for 24 hours and hot for 12 hours.'],
  ['Chef Knife 8in', 'Forged stainless blade with a balanced handle and a lifetime warranty.'],
  ['Puzzle 1000pc Night Sky', 'Glow-in-the-dark jigsaw puzzle with a finished size of 20 by 27 inches.'],
  ['Knit Throw Blanket', 'Soft chunky knit blanket in oatmeal, machine washable.'],
].map(([t, s], i) => ({ title: t, url: `https://shop.example.invalid/p/${i + 1}`, snippet: s }));

const CONTEXT = ITEMS.map((x, i) => `[${i + 1}] ${x.title}\nURL: ${x.url}\n${x.snippet}`).join('\n\n');
const SYSTEM = 'You are a gift advisor. Use only the product data provided. Never invent URLs.';
const TASKS = {
  free: 'Pick five of the products above for a household with two kids and a dad who cooks. For each, write the title, the URL, then two sentences on why it fits, based on the snippet.',
  copy: 'Pick five of the products above. For each output exactly three lines:\nTITLE: <exact title>\nURL: <exact url>\nFACT: <exact snippet sentence copied verbatim>\nSeparate gifts with a blank line. Output nothing else.',
};
TASKS.short = 'Name one product above that suits a cook. Answer in one short sentence.';
TASKS.tool = 'You are starting a gift search. In this one message, call web_search three times (three different gift categories). Do not write any other text.';
const TOOLS = [
  { type: 'function', function: { name: 'web_search', description: 'Search the web', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch a page', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
];
const messages = (style) => [
  { role: 'system', content: SYSTEM },
  { role: 'user', content: `PRODUCTS\n\n${CONTEXT}\n\nTASK\n${TASKS[style]}` },
];

// ---------- rate-limit governor ----------
const spent = []; // {t, n} uncached input + output tokens
let lastCost = 0;
async function throttle(estimate) {
  for (;;) {
    const now = Date.now();
    while (spent.length && now - spent[0].t > 60000) spent.shift();
    if (spent.reduce((a, b) => a + b.n, 0) + estimate <= TPM_BUDGET) return;
    await sleep(1000);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cerebras may enforce RPM as ~1 req/s bursts — space every HTTP call.
const MIN_GAP_MS = Number(process.env.CEREBRAS_MIN_GAP_MS || 2500);
let lastHttpAt = 0;
async function paceHttp() {
  const wait = MIN_GAP_MS - (Date.now() - lastHttpAt);
  if (wait > 0) await sleep(wait);
  lastHttpAt = Date.now();
}

// ---------- one streamed request ----------
async function run(cfg, debug = false) {
  await paceHttp();
  const body = {
    model: MODEL,
    messages: messages(cfg.style),
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: cfg.max,
    reasoning_effort: cfg.effort,
  };
  if (cfg.temp !== 'default') body.temperature = Number(cfg.temp);
  if (cfg.style === 'tool') body.tools = TOOLS;

  await throttle(lastCost || Math.min(cfg.max, 6000) + 2000);

  const res = { ...cfg, ts: new Date().toISOString(), ok: false };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;
  let first = null, last = null, firstContent = null, textChunks = 0, usage = null, finish = null, timeInfo = null, rawShown = 0;

  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    res.status = r.status;
    if (!r.ok) {
      res.error = (await r.text()).slice(0, 300);
      if (r.status === 429) res.retryAfter = Number(r.headers.get('retry-after')) || 20;
      return res;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let j;
        try { j = JSON.parse(payload); } catch { continue; }
        if (debug && rawShown++ < 4) console.log('RAW', payload.slice(0, 400));
        const ch = j.choices?.[0];
        const d = ch?.delta ?? {};
        const reasoning = d.reasoning ?? d.reasoning_content ?? '';
        const content = d.content ?? '';
        if (reasoning || content || d.tool_calls) {
          const t = now();
          if (first === null) first = t;
          last = t;
          textChunks++;
          if (content && firstContent === null) firstContent = t;
        }
        if (ch?.finish_reason) finish = ch.finish_reason;
        if (j.usage) usage = j.usage;
        if (j.time_info) timeInfo = j.time_info;
      }
    }
    const tokens = usage?.completion_tokens;
    Object.assign(res, {
      ok: tokens != null && first !== null,
      ttft: first,
      first, last, firstContent,
      tokens,
      reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null,
      promptTokens: usage?.prompt_tokens ?? null,
      cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? null,
      textChunks,
      finish,
      truncated: finish === 'length',
      tps: tps({ tokens, first, last }), // client-side, approximate
      timeInfo, // raw server-side timing if the endpoint sends it
    });
    // What the official patch uses: tokens / server decode time.
    const ct = Number(timeInfo?.completion_time);
    res.serverTps = tokens > 0 && ct > 0 ? tokens / ct : null;
    res.rate = res.serverTps ?? res.tps;
    res.rateSrc = res.serverTps != null ? 'srv' : 'client';
    if (tokens == null) res.error = 'incomplete stream: no usage';
    const cost = (res.promptTokens ?? 2000) - (res.cachedTokens ?? 0) + (tokens ?? 0);
    spent.push({ t: Date.now(), n: cost });
    lastCost = cost;
  } catch (e) {
    res.error = e.name === 'AbortError' ? 'timeout' : String(e.message || e);
  } finally {
    clearTimeout(timer);
  }
  return res;
}

// ---------- stats ----------
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (x, d = 0) => (x == null ? '-' : x.toFixed(d));
function table(rows, keyFn, label) {
  const g = new Map();
  for (const r of rows) { const k = keyFn(r); (g.get(k) ?? g.set(k, []).get(k)).push(r); }
  console.log(`\n${label.padEnd(34)} n  ok  medSRV  p90SRV  maxSRV  medTok  medTTFT  trunc  (SRV = server tok/s, the patch's number)`);
  for (const [k, rs] of [...g].sort()) {
    const good = rs.filter((r) => r.ok && r.rate != null);
    const t = good.map((r) => r.rate);
    console.log(
      `${String(k).padEnd(34)} ${String(rs.length).padStart(2)} ${String(good.length).padStart(3)} ${f(med(t)).padStart(7)} ${f(pct(t, 0.9)).padStart(7)} ${f(Math.max(...t, 0)).padStart(7)} ${f(med(good.map((r) => r.tokens))).padStart(7)} ${f(med(good.map((r) => r.ttft)), 2).padStart(8)} ${String(rs.filter((r) => r.truncated).length).padStart(5)}`
    );
  }
}
const line = (r) =>
  r.ok
    ? `${r.effort}/${r.style}/t=${r.temp} tok=${r.tokens} (reason=${r.reasoningTokens ?? '?'}) ttft=${f(r.ttft, 2)}s srv=${f(r.serverTps)} (client~${f(r.tps)}${r.rateSrc === 'client' ? ', NO time_info' : ''}) chunks=${r.textChunks} finish=${r.finish}`
    : `${r.effort}/${r.style} FAIL status=${r.status ?? '-'} ${r.error ?? ''}`;

// ---------- CLI ----------
const [cmd = 'help', ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; args[k] = v; }
if (cmd !== 'report' && cmd !== 'help' && !KEY) { console.error('Set CEREBRAS_API_KEY first.'); process.exit(1); }

async function runWithRetry(cfg, debug) {
  const maxTry = Number(process.env.CEREBRAS_429_RETRIES || 6);
  for (let a = 0; a < maxTry; a++) {
    const r = await run(cfg, debug);
    if (r.status === 429) {
      const wait = Math.max(Number(r.retryAfter) || 20, 25);
      console.log(`429, waiting ${wait}s (burst/RPM limit — everyone on shared pool)`);
      await sleep(wait * 1000);
      continue;
    }
    return r;
  }
  return { ...cfg, ok: false, error: `rate limited x${maxTry}` };
}

const pairGapMs = () => Number(process.env.CEREBRAS_PAIR_GAP_MS || 3500);

if (cmd === 'sweep') {
  const efforts = String(args.efforts || 'low,high').split(',');
  const styles = String(args.styles || 'free,copy').split(',');
  const temps = String(args.temps || 'default').split(',');
  const reps = Number(args.reps || 3), max = Number(args.max || 16384);
  const plan = [];
  for (const effort of efforts) for (const style of styles) for (const temp of temps) for (let i = 0; i < reps; i++) plan.push({ effort, style, temp, max });
  for (let i = plan.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [plan[i], plan[j]] = [plan[j], plan[i]]; } // shuffle: no time-of-day bias
  const out = path.join(RUNS_DIR, `sweep-${Date.now()}.jsonl`);
  console.log(`${plan.length} runs, shuffled, one at a time -> ${out}`);
  const rows = [];
  for (const cfg of plan) {
    const r = await runWithRetry(cfg, !!args.debug);
    rows.push(r); fs.appendFileSync(out, JSON.stringify(r) + '\n'); console.log(line(r));
  }
  table(rows, (r) => `${r.effort}/${r.style}/t=${r.temp}`, 'config');
} else if (cmd === 'once') {
  const r = await runWithRetry({ effort: args.effort || 'high', style: args.style || 'copy', temp: args.temp || 'default', max: Number(args.max || 16384) }, !!args.debug);
  console.log(line(r)); console.log(JSON.stringify(r, null, 2));
} else if (cmd === 'pair') {
  // Simulates the cheapest real agent: call 1 emits tool calls, call 2 writes the answer.
  // The patch mean = average of the two per-call server rates.
  const reps = Number(args.reps || 5), effort = args.effort || 'high', max = Number(args.max || 16384);
  const means = [];
  for (let i = 0; i < reps; i++) {
    const a = await runWithRetry({ effort, style: 'tool', temp: 'default', max }, !!args.debug);
    await sleep(pairGapMs());
    const b = await runWithRetry({ effort, style: args.final || 'copy', temp: 'default', max }, false);
    fs.appendFileSync(path.join(RUNS_DIR, `pair-${effort}.jsonl`), JSON.stringify({ a, b }) + '\n');
    if (a.rate != null && b.rate != null) {
      const m = (a.rate + b.rate) / 2; means.push(m);
      console.log(`pair ${i + 1}: tool-turn ${f(a.rate)} (${a.tokens} tok) + final ${f(b.rate)} (${b.tokens} tok) -> predicted mean ${f(m)}`);
    } else console.log(`pair ${i + 1}: incomplete (${a.error ?? b.error ?? 'no rate'})`);
  }
  console.log(`\npredicted patch mean over ${means.length} pairs: median ${f(med(means))}, best ${f(Math.max(...means, 0))}`);
} else if (cmd === 'probe') {
  // Cheap fixed probe: low effort, small cap. Measures endpoint speed over the day.
  const every = Number(args.every || 15), count = Number(args.count || Infinity);
  for (let i = 0; i < count; i++) {
    const r = await runWithRetry({ effort: 'low', style: 'copy', temp: 'default', max: 400 }, false);
    const d = new Date();
    const zone = (tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    r.ist = zone('Asia/Kolkata'); r.pt = zone('America/Los_Angeles');
    fs.appendFileSync(path.join(RUNS_DIR, 'probe.jsonl'), JSON.stringify(r) + '\n');
    console.log(`[IST ${r.ist} / PT ${r.pt}] ${line(r)}`);
    if (i < count - 1) await sleep(every * 60000);
  }
} else if (cmd === 'campaign') {
  // Continuous 2-call API benchmark; keeps best patch mean on disk (same formula as UI).
  const effort = args.effort || 'low';
  const pauseMs = Number(args.pause || 10) * 1000;
  const maxRuns = Number(args.runs || 0) || Infinity;
  const finalStyle = args.final || 'copy';
  const shots = args.screenshots !== 'false';
  const maxTok = Number(args.maxTokens || 16384);
  const logPath = path.join(RUNS_DIR, `campaign-${effort}-${Date.now()}.jsonl`);
  const bestPath = path.join(RUNS_DIR, 'campaign-best.json');
  let best = fs.existsSync(bestPath) ? JSON.parse(fs.readFileSync(bestPath, 'utf8')) : null;
  let leaderShot = path.join(SHOTS_DIR, 'leader.png');
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const snap = () => {
    if (!shots || process.platform !== 'darwin') return null;
    try {
      if (fs.existsSync(leaderShot)) fs.unlinkSync(leaderShot);
      execFileSync('screencapture', ['-x', leaderShot], { stdio: 'ignore' });
      return leaderShot;
    } catch {
      return null;
    }
  };

  console.log(`Campaign: effort=${effort} pause=${pauseMs / 1000}s log=${logPath}`);
  console.log('Patch mean = average of per-call server tok/s (2 calls). Ctrl+C to stop.\n');
  let n = 0;
  for (;;) {
    n++;
    if (n > maxRuns) break;
    const a = await runWithRetry({ effort, style: 'tool', temp: 'default', max: maxTok }, false);
    await sleep(pairGapMs());
    const b = await runWithRetry({ effort, style: finalStyle, temp: 'default', max: maxTok }, false);
    const rates = [a.serverTps, b.serverTps].filter((x) => x != null);
    const patchMean = rates.length === 2 ? (rates[0] + rates[1]) / 2 : null;
    const row = {
      n,
      ts: new Date().toISOString(),
      effort,
      patchMean,
      callA: a.serverTps,
      callB: b.serverTps,
      tokensA: a.tokens,
      tokensB: b.tokens,
      queueA: a.timeInfo?.queue_time,
      queueB: b.timeInfo?.queue_time,
      ok: patchMean != null,
    };
    fs.appendFileSync(logPath, JSON.stringify({ row, a, b }) + '\n');
    const improved = patchMean != null && (!best?.patchMean || patchMean > best.patchMean);
    if (improved) {
      const shot = snap();
      best = { ...row, logPath, screenshot: shot };
      fs.writeFileSync(bestPath, `${JSON.stringify(best, null, 2)}\n`);
      console.log(`★ NEW BEST #${n} mean=${f(patchMean)} (A=${f(a.serverTps)} B=${f(b.serverTps)})${shot ? ' screenshot' : ''}`);
    } else {
      console.log(
        `#${n} mean=${patchMean != null ? f(patchMean) : 'FAIL'} (A=${f(a.serverTps)} B=${f(b.serverTps)}) best=${f(best?.patchMean)}`,
      );
    }
    if (n < maxRuns) await sleep(pauseMs);
  }
  console.log('\nDone. Best:', bestPath, best ? `mean=${f(best.patchMean)}` : '(none)');
} else if (cmd === 'report') {
  const file = path.join(RUNS_DIR, 'probe.jsonl');
  if (!fs.existsSync(file)) { console.error('No probe data yet.'); process.exit(1); }
  const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  table(rows, (r) => `IST ${String(r.ist).slice(0, 2)}:00 (PT ${String(r.pt).slice(0, 2)}:00)`, 'hour');
  console.log('\nLast probes:'); rows.slice(-6).forEach((r) => console.log(`[IST ${r.ist}] ${line(r)}`));
  console.log('\nFast hours = candidate windows for your recorded best-of-N campaign.');
} else {
  console.log('Commands: sweep | pair | probe | report | once | campaign');
  console.log('  campaign --effort low --pause 10 [--max 0] [--screenshots true]');
}