#!/usr/bin/env node
// lint — zero-dependency syntax gate: every .mjs in the repo must parse, and
// every JSON under docs/ and .claude-plugin/ must be valid.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git"]);

function walk(dir, exts, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

let failed = 0;
for (const f of walk(ROOT, [".mjs"])) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    failed += 1;
    console.error(`✗ ${path.relative(ROOT, f)}\n${e.stderr}`);
  }
}
for (const f of [...walk(path.join(ROOT, "docs"), [".json"]), ...walk(path.join(ROOT, ".claude-plugin"), [".json"])]) {
  try {
    JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    failed += 1;
    console.error(`✗ ${path.relative(ROOT, f)}: ${e.message}`);
  }
}
if (failed) {
  console.error(`\n${failed} file(s) failed lint.`);
  process.exit(1);
}
console.log("✓ lint clean");
