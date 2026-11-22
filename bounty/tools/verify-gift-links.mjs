#!/usr/bin/env node
// Checks that the five links from a recorded attempt are real, distinct product pages.
//
//   node verify-links.mjs answer.txt                 # any text file; URLs are extracted
//   pbpaste | node verify-links.mjs                  # or pipe the model's answer in
//   node verify-links.mjs https://a https://b ...    # or pass URLs directly
//   Options: --label run-07   (name for the log)   --allow-big-retail (skip Amazon/Target/Walmart block)
//
// PASS only if exactly five distinct URLs are found and every one passes.
// A live page check, not a guarantee: always click the links yourself before filming the final run.
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BIG_RETAIL = /(^|\.)(amazon\.[a-z.]+|target\.com|walmart\.com)$/i;
const PLACEHOLDER = /(^|\.)(example\.(com|org|net)|[a-z0-9-]+\.invalid|localhost\.localdomain)$/i;
const BLOCKED_PAGE = /(captcha|verify you are human|are you a robot|access denied|robot check|unusual traffic|enable javascript and cookies)/i;

const argv = process.argv.slice(2);
const flags = { label: '', allow: false };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--label') flags.label = argv[++i] || '';
  else if (argv[i] === '--allow-big-retail') flags.allow = true;
  else positional.push(argv[i]);
}

async function readInput() {
  const parts = [];
  for (const p of positional) parts.push(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : p);
  if (!parts.length && !process.stdin.isTTY) parts.push(fs.readFileSync(0, 'utf8'));
  return parts.join('\n');
}

function extractUrls(text) {
  const found = text.match(/https?:\/\/[^\s<>"'`]+/g) || [];
  const clean = found.map((u) => u.replace(/[)\]}>.,;:!?*_]+$/, ''));
  return [...new Set(clean)];
}

const norm = (u) => { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase(); };
const isHome = (u) => { const x = new URL(u); return x.pathname.replace(/\/+$/, '') === ''; };
function isWrapperOrListicle(url) {
  const x = new URL(url);
  if (/google\.com$/i.test(x.hostname) && /^\/url/i.test(x.pathname)) return 'Google redirect wrapper (use the real destination)';
  if (/\/(blog|article|gift-guide|guides?|lists?|roundup|ideas|perfect-gifts|best-gifts)/i.test(x.pathname)) return 'looks like an article/listicle, not a product page';
  return '';
}
function looksLikeSearch(u) {
  const x = new URL(u);
  if (/(product|\/p\/|\/dp\/|\/ip\/|\/item|\/pd\/)/i.test(x.pathname)) return false;
  if (/search|\/s\/|\/sch\//i.test(x.pathname)) return true;
  return ['q', 'query', 'keyword', 'keywords', 'searchterm', 'k'].some((k) => x.searchParams.has(k));
}
function productSignals(html) {
  const sig = [];
  if (/"@type"\s*:\s*\[?\s*"Product"/i.test(html)) sig.push('JSON-LD Product');
  if (/property=["']og:type["'][^>]*content=["'][^"']*product/i.test(html) || /content=["'][^"']*product[^"']*["'][^>]*property=["']og:type/i.test(html)) sig.push('og:type product');
  if (/product:price|itemprop=["']price["']/i.test(html)) sig.push('price meta');
  if (/(add to (cart|bag|basket)|buy now)/i.test(html) && /[$£€]\s?\d/.test(html)) sig.push('cart+price text');
  return sig;
}
const titleOf = (html) => (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 80);

async function check(url) {
  const out = { url, ok: false, reason: '', title: '', finalUrl: '' };
  let u;
  try { u = new URL(url); } catch { out.reason = 'not a valid URL'; return out; }
  if (PLACEHOLDER.test(u.hostname)) { out.reason = 'placeholder domain'; return out; }
  if (!flags.allow && BIG_RETAIL.test(u.hostname)) { out.reason = 'Amazon/Target/Walmart blocked until proven (use --allow-big-retail after a live check)'; return out; }
  const wrap = isWrapperOrListicle(url);
  if (wrap) { out.reason = wrap; return out; }
  if (looksLikeSearch(url)) { out.reason = 'looks like a search or listing URL'; return out; }
  if (isHome(url)) { out.reason = 'homepage, not a product page'; return out; }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' } });
    out.finalUrl = r.url; out.status = r.status;
    if (r.status === 404 || r.status === 410) { out.reason = `dead link (HTTP ${r.status})`; return out; }
    if (r.status === 403 || r.status === 429) { out.reason = `blocked by the site (HTTP ${r.status}); check by hand`; return out; }
    if (!r.ok) { out.reason = `HTTP ${r.status}`; return out; }
    if (isHome(r.url) && !isHome(url)) { out.reason = 'redirected to homepage'; return out; }
    if (looksLikeSearch(r.url) && !looksLikeSearch(url)) { out.reason = 'redirected to a search page'; return out; }
    const html = (await r.text()).slice(0, 800000);
    out.title = titleOf(html);
    const sig = productSignals(html);
    if (!sig.length) {
      out.reason = BLOCKED_PAGE.test(html) && html.length < 20000 ? 'captcha or bot-block page' : 'no product signals in the page (may be JS-rendered; check by hand)';
      return out;
    }
    out.ok = true; out.reason = sig.join(', ');
  } catch (e) {
    out.reason = e.name === 'AbortError' ? 'timeout' : `fetch failed: ${e.cause?.code || e.message}`;
  } finally { clearTimeout(timer); }
  return out;
}

const urls = extractUrls(await readInput());
if (!urls.length) { console.error('No URLs found. Pass a file, pipe text in, or list URLs.'); process.exit(2); }

const results = [];
const seen = new Map();
for (const url of urls) {
  const res = await check(url);
  try { const key = norm(url); if (res.ok && seen.has(key)) { res.ok = false; res.reason = `duplicate of #${seen.get(key)}`; } else if (res.ok) seen.set(key, results.length + 1); } catch {}
  results.push(res);
}

console.log('');
results.forEach((r, i) => console.log(`${r.ok ? 'PASS' : 'FAIL'}  #${i + 1}  ${r.url}\n        ${r.title ? `"${r.title}" · ` : ''}${r.reason}`));
const passes = results.filter((r) => r.ok).length;
let verdict = passes === 5 && results.length === 5;
let note = '';
if (results.length !== 5) note = `found ${results.length} URLs; the demo must show exactly five`;
console.log(`\n${verdict ? 'ATTEMPT PASSES' : 'ATTEMPT FAILS'}: ${passes}/${results.length} links pass${note ? ' (' + note + ')' : ''}`);
console.log('Reminder: open all five in the browser yourself before filming the final run.');

fs.mkdirSync('runs', { recursive: true });
fs.appendFileSync('runs/links.jsonl', JSON.stringify({ ts: new Date().toISOString(), label: flags.label, verdict, passes, results }) + '\n');
process.exit(verdict ? 0 : 1);