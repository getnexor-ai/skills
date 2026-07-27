#!/usr/bin/env node
// nexor-skills — copy Nexor's public Agent Skills into a Claude Code skills directory.
//
// Skills are just folders containing a SKILL.md. Claude Code discovers them from:
//   ~/.claude/skills/<name>/SKILL.md          (user level — all projects)
//   <project>/.claude/skills/<name>/SKILL.md  (project level)
// This script copies the skill folders shipped in this package into one of those.

import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC = path.join(HERE, "..", "skills");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const optValue = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};

if (has("--help") || has("-h")) {
  printHelp();
  process.exit(0);
}

if (!existsSync(SKILLS_SRC)) {
  console.error(`No skills/ directory found next to this script (${SKILLS_SRC}).`);
  process.exit(1);
}

const available = readdirSync(SKILLS_SRC)
  .filter((d) => existsSync(path.join(SKILLS_SRC, d, "SKILL.md")))
  .sort();

if (has("--list")) {
  console.log("Available skills:\n" + available.map((s) => "  - " + s).join("\n"));
  process.exit(0);
}

// Destination: --dir <path>  >  --project (./.claude/skills)  >  default (~/.claude/skills)
const dirOpt = optValue("--dir");
const dest = dirOpt
  ? path.resolve(dirOpt)
  : has("--project")
    ? path.resolve(".claude", "skills")
    : path.join(homedir(), ".claude", "skills");

// Positional args (skill names) select a subset; otherwise install everything.
const requested = argv.filter(
  (a) => !a.startsWith("-") && a !== "install" && a !== dirOpt,
);
const unknown = requested.filter((s) => !available.includes(s));
if (unknown.length) {
  console.error(`Unknown skill(s): ${unknown.join(", ")}`);
  console.error(`Run "nexor-skills --list" to see what's available.`);
  process.exit(1);
}
const selected = requested.length ? requested : available;

mkdirSync(dest, { recursive: true });
let installed = 0;
let updated = 0;
for (const name of selected) {
  const target = path.join(dest, name);
  const existed = existsSync(target);
  cpSync(path.join(SKILLS_SRC, name), target, { recursive: true });
  existed ? updated++ : installed++;
  console.log(`  ${existed ? "updated  " : "installed"}  ${name}`);
}

console.log(`\n✓ ${installed} installed, ${updated} updated → ${dest}`);
console.log("Restart Claude Code (or reload your agent) to pick up the new skills.");

function printHelp() {
  console.log(`
nexor-skills — install Nexor's public Agent Skills

Usage:
  npx @nexor/skills [install] [skill...] [options]

Options:
  --project      install into ./.claude/skills (current project only)
  --dir <path>   install into a custom skills directory
  --list         list the skills in this package and exit
  -h, --help     show this help

Default destination: ~/.claude/skills  (user level, available in every project)

Examples:
  npx @nexor/skills                       install every skill into ~/.claude/skills
  npx @nexor/skills --project             install every skill into ./.claude/skills
  npx @nexor/skills voice-scripting-v3    install a single skill
  npx @nexor/skills --list
`);
}
