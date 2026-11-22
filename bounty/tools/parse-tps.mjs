// The bounty formula. Times are in seconds.
// TPS = (output_token_count - 1) / (last_token_time - first_token_time)
export function tps({ tokens, first, last }) {
  if (![tokens, first, last].every(Number.isFinite)) return null;
  if (tokens <= 1 || last <= first) return null;
  return (tokens - 1) / (last - first);
}

// Unit check: node tps.mjs
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cases = [
    [{ tokens: 101, first: 0, last: 0.05 }, 2000],
    [{ tokens: 1, first: 0, last: 1 }, null],
    [{ tokens: 50, first: 1, last: 1 }, null],
    [{ tokens: undefined, first: 0, last: 1 }, null],
  ];
  let bad = 0;
  for (const [input, want] of cases) {
    const got = tps(input);
    const ok = got === want;
    if (!ok) bad++;
    console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(input), '->', got);
  }
  process.exit(bad ? 1 : 0);
}
