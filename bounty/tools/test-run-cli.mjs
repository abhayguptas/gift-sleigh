#!/usr/bin/env node
import { execFileSync, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const STATE = path.join(REPO, '.openclaw-bounty-state');
const OPENCLAW_CLI = path.join(REPO, 'openclaw', 'openclaw.mjs');
const PROMPT_FILE = path.join(REPO, 'bounty', 'prompts', 'santa-speed-shopper.txt');
const AGENT_DB = path.join(STATE, 'agents', 'main', 'agent', 'openclaw-agent.sqlite');

const prompt = fs.readFileSync(PROMPT_FILE, 'utf8').trim();
const ident = crypto.randomUUID();
const sessionKey = `agent:main:cli-bench-${ident}`;

function gatewayRpc(method, params, timeoutMs = 60000) {
  const args = [
    OPENCLAW_CLI,
    'gateway',
    'call',
    method,
    '--json',
    '--timeout',
    String(timeoutMs),
    '--params',
    JSON.stringify(params),
  ];
  const env = {
    ...process.env,
    OPENCLAW_STATE_DIR: STATE,
    OPENCLAW_CONFIG_PATH: path.join(STATE, 'openclaw.json'),
  };
  const stdout = execFileSync(process.execPath, args, { env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

console.log('====================================================');
console.log('  Live OpenClaw CLI Speed Test');
console.log('====================================================');
console.log('Session Key:', sessionKey);
console.log('Run ID:     ', ident);
console.log('\nCreating fresh session...');

const createRes = gatewayRpc('sessions.create', {
  key: sessionKey,
  agentId: 'main',
  model: 'cerebras/moonshotai-kimi-k3.1-pro-trial',
  thinkingLevel: 'low',
});
console.log('Session created.');

console.log('\nSending prompt to Gateway...');
console.log('----------------------------------------------------');
console.log(prompt);
console.log('----------------------------------------------------');

const sendRes = gatewayRpc('chat.send', {
  sessionKey,
  message: prompt,
  thinking: 'low',
  deliver: false,
  idempotencyKey: ident,
});

console.log('Prompt dispatched. Run started (ID:', sendRes.runId, ')');
console.log('Waiting for run completion (timeout 90s)...');

const waitRes = gatewayRpc('agent.wait', { runId: ident, timeoutMs: 90000 }, 95000);
console.log('Run finished with status:', waitRes.status);

// Query transcript_events for all assistant calls in this session
let assistantCalls = [];
const sessionId = createRes?.sessionId;
try {
  if (sessionId) {
    const sqliteQuery = `
      SELECT json_extract(event_json, '$.message') 
      FROM transcript_events 
      WHERE session_id = '${sessionId}'
        AND json_extract(event_json, '$.message.role') = 'assistant'
      ORDER BY seq ASC;
    `;
    const rawJsonLines = execSync(`sqlite3 "${AGENT_DB}" "${sqliteQuery.replace(/\n/g, ' ')}"`, { encoding: 'utf8' }).trim();
    if (rawJsonLines) {
      const lines = rawJsonLines.split('\n').filter(Boolean);
      assistantCalls = lines.map((l) => JSON.parse(l));
    }
  }
} catch (e) {
  // fallback
}

if (assistantCalls.length === 0) {
  const history = gatewayRpc('chat.history', {
    sessionKey,
    limit: 100,
    toolResultMaxChars: 512,
  });
  assistantCalls = (history.messages || []).filter((m) => m.role === 'assistant');
}

console.log(`\nFound ${assistantCalls.length} assistant model call(s) in this run:`);

const rates = [];
for (let i = 0; i < assistantCalls.length; i++) {
  const m = assistantCalls[i];
  const sg = m.serverGeneration;
  if (sg && sg.outputTokens && sg.completionMs) {
    const tps = sg.outputTokens / (sg.completionMs / 1000);
    rates.push(tps);
    console.log(
      `  Call #${i + 1} (${m.stopReason}): ${sg.outputTokens} tokens in ${(sg.completionMs / 1000).toFixed(4)}s -> ${tps.toFixed(2)} TPS`
    );
  } else {
    console.log(`  Call #${i + 1} (${m.stopReason}): no serverGeneration metadata`);
  }
}

if (rates.length > 0) {
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  console.log('\n====================================================');
  console.log(`🏆 OFFICIAL MEAN TPS: ${mean.toFixed(2)} tok/s (${Math.round(mean).toLocaleString()} displayed)`);
  console.log('====================================================\n');
}

const finalMsg = assistantCalls.slice().reverse().find((m) => m.stopReason === 'stop');
if (finalMsg) {
  const content = typeof finalMsg.content === 'string' ? finalMsg.content : JSON.stringify(finalMsg.content);
  console.log('Final Answer:');
  console.log(content);
}
