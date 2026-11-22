#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const home = os.homedir();
const cfgPath = path.join(home, ".openclaw", "openclaw.json");
const repoRoot = path.resolve(import.meta.dirname, "../..");
const mergePath = path.join(repoRoot, "openclaw/dev/cerebras-kimi/openclaw.json");
const projectEnv = path.resolve(import.meta.dirname, "../.env");
const envDest = path.join(home, ".openclaw", ".env");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(home, `.openclaw/openclaw.json.backup-${stamp}`);

function deepMerge(a, b) {
  const out = { ...a };
  for (const key of Object.keys(b)) {
    const bv = b[key];
    const av = a[key];
    if (
      bv &&
      typeof bv === "object" &&
      !Array.isArray(bv) &&
      av &&
      typeof av === "object" &&
      !Array.isArray(av)
    ) {
      out[key] = deepMerge(av, bv);
    } else {
      out[key] = bv;
    }
  }
  return out;
}

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}

fs.mkdirSync(path.join(home, ".openclaw"), { recursive: true });
if (fs.existsSync(cfgPath)) {
  fs.copyFileSync(cfgPath, backupPath);
  console.log("Backed up:", backupPath);
}

const patch = JSON.parse(fs.readFileSync(mergePath, "utf8"));
let merged = deepMerge(existing, patch);
if (patch.models) {
  merged.models = {
    ...(existing.models ?? {}),
    ...patch.models,
    providers: {
      ...(existing.models?.providers ?? {}),
      ...(patch.models.providers ?? {}),
    },
  };
}

fs.writeFileSync(cfgPath, `${JSON.stringify(merged, null, 2)}\n`);
fs.copyFileSync(projectEnv, envDest);
console.log("Wrote:", cfgPath);
console.log("Wrote:", envDest);