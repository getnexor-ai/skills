#!/usr/bin/env node
// prepublish-check — the gate between this repo and a permanent public artifact.
//
// npm unpublish is only possible within 72h, so everything that reaches the
// tarball is public forever. This script is the last thing that can say no.
// It runs in CI on every PR *and* as `prepublishOnly`, so it cannot be skipped
// by publishing from a laptop.
//
// It enforces seven things when the catalog contains skills:
//   1. Every skill has usable frontmatter (an agent picks skills by description).
//   2. marketplace.json and skills/ agree — no phantom entries, no orphans.
//   3. Nothing under an `internal/` directory can reach the tarball.
//   4. Nothing listed in package.json > nexorSkills.unpublished can reach it.
//   5. Every skill that IS meant to publish actually made it in.
//   6. Every snake_case token in inline code is a real MCP tool
//      (docs/mcp-tool-manifest.json), a labelled runtime tool, or an
//      allowlisted non-tool token (docs/tool-name-allowlist.json).
//   7. Every relative link (and its #anchor) resolves.
//
// Exit code 0 = safe to publish.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintSkills, loadJson } from "./lib/skill-lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const MANIFEST_PATH = path.join(ROOT, "docs", "mcp-tool-manifest.json");
const ALLOWLIST_PATH = path.join(ROOT, "docs", "tool-name-allowlist.json");

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const unpublished = new Set(pkg.nexorSkills?.unpublished ?? []);

// ---------------------------------------------------------------- 1. skills
const onDisk = existsSync(SKILLS_DIR)
  ? readdirSync(SKILLS_DIR)
      .filter((d) => existsSync(path.join(SKILLS_DIR, d, "SKILL.md")))
      .sort()
  : [];

for (const name of onDisk) {
  const md = readFileSync(path.join(SKILLS_DIR, name, "SKILL.md"), "utf8");
  const fm = parseFrontmatter(md);
  if (!fm) {
    fail(`skills/${name}/SKILL.md has no YAML frontmatter — an agent cannot know when to load it.`);
    continue;
  }
  if (!fm.name) fail(`skills/${name}/SKILL.md frontmatter is missing \`name\`.`);
  else if (fm.name !== name) {
    fail(`skills/${name}/SKILL.md declares name "${fm.name}" but lives in "${name}/". They must match.`);
  }
  if (!fm.description) {
    fail(`skills/${name}/SKILL.md frontmatter is missing \`description\` — this is the trigger surface.`);
  } else if (fm.description.length < 40) {
    warn(`skills/${name} has a very short description (${fm.description.length} chars); triggering will be unreliable.`);
  }
}

// Every unpublished skill must have a matching negation in `files`, or the
// declaration is a lie and the exclusion silently does nothing.
for (const name of unpublished) {
  if (!onDisk.includes(name)) {
    warn(`package.json > nexorSkills.unpublished lists "${name}", which is not in skills/. Stale entry?`);
  }
  const negation = `!skills/${name}`;
  if (!(pkg.files ?? []).includes(negation)) {
    fail(`"${name}" is marked unpublished but package.json > files has no "${negation}" entry.`);
  }
}

// ------------------------------------------------------- 2. marketplace.json
const marketplacePath = path.join(ROOT, ".claude-plugin", "marketplace.json");
if (!existsSync(marketplacePath)) {
  fail(".claude-plugin/marketplace.json is missing.");
} else {
  const marketplace = JSON.parse(readFileSync(marketplacePath, "utf8"));
  const listed = [];
  for (const plugin of marketplace.plugins ?? []) {
    for (const ref of plugin.skills ?? []) listed.push(ref.replace(/^\.\/skills\//, ""));
  }
  const seen = new Set();
  for (const name of listed) {
    if (seen.has(name)) fail(`marketplace.json lists "${name}" more than once.`);
    seen.add(name);
    if (!onDisk.includes(name)) fail(`marketplace.json references "${name}", which has no skills/${name}/SKILL.md.`);
  }
  for (const name of onDisk) {
    if (unpublished.has(name)) {
      if (seen.has(name)) {
        fail(`marketplace.json lists "${name}", but it is unpublished — the tarball ships a manifest pointing at a missing skill.`);
      }
      continue;
    }
    if (!seen.has(name)) fail(`skills/${name} is not listed in marketplace.json under any plugin.`);
  }
  if (marketplace.metadata?.version && marketplace.metadata.version !== pkg.version) {
    warn(`marketplace.json metadata.version (${marketplace.metadata.version}) != package.json version (${pkg.version}).`);
  }
}

// --------------------------------------------------------- 3-5. the tarball
let files = [];
try {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  files = (JSON.parse(out)[0]?.files ?? []).map((f) => f.path);
} catch (e) {
  fail(`\`npm pack --dry-run\` failed: ${e.message}`);
}

if (files.length) {
  for (const f of files) {
    const segments = f.split("/");
    if (segments.includes("internal")) {
      fail(`TARBALL LEAK: "${f}" sits under an internal/ directory and would be published permanently.`);
    }
    if (segments[0] === "skills" && unpublished.has(segments[1])) {
      fail(`TARBALL LEAK: "${f}" belongs to unpublished skill "${segments[1]}".`);
    }
  }
  for (const name of onDisk) {
    if (unpublished.has(name)) continue;
    if (!files.includes(`skills/${name}/SKILL.md`)) {
      fail(`skills/${name}/SKILL.md is missing from the tarball — check the \`files\` negations.`);
    }
  }
}

// ------------------------------------------------- 6-7. tool names and links
let lint = { errors: [], warnings: [], stats: { tokens: 0, links: 0 } };
if (!existsSync(MANIFEST_PATH)) {
  fail(`${path.relative(ROOT, MANIFEST_PATH)} is missing — regenerate it with scripts/generate-tool-manifest.mjs.`);
} else if (!existsSync(ALLOWLIST_PATH)) {
  fail(`${path.relative(ROOT, ALLOWLIST_PATH)} is missing.`);
} else {
  lint = lintSkills({ skillsDir: SKILLS_DIR, manifest: loadJson(MANIFEST_PATH), allowlist: loadJson(ALLOWLIST_PATH), root: ROOT });
  lint.errors.forEach(fail);
  lint.warnings.forEach(warn);
}

// -------------------------------------------------------------------- report
const publishable = onDisk.filter((n) => !unpublished.has(n));
console.log(`prepublish-check — @nexor/skills@${pkg.version}`);
console.log(`  skills on disk : ${onDisk.length}`);
console.log(`  publishable    : ${publishable.length}`);
console.log(`  withheld       : ${unpublished.size ? [...unpublished].join(", ") : "none"}`);
console.log(`  tarball entries: ${files.length}`);
console.log(`  tool tokens    : ${lint.stats.tokens} checked against the MCP manifest`);
console.log(`  relative links : ${lint.stats.links} resolved`);

for (const w of warnings) console.warn(`  warn  ${w}`);

if (errors.length) {
  console.error(`\n✗ ${errors.length} blocking problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nNothing was published.");
  process.exit(1);
}

console.log("\n✓ safe to publish");

function parseFrontmatter(md) {
  const block = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return null;
  const lines = block[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    if (/^[>|][-+]?$/.test(value)) {
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[(i += 1)].trim());
      value = buf.join(" ");
    }
    out[kv[1]] = value.trim();
  }
  return out;
}
