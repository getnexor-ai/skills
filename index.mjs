// @nexor/skills — programmatic access to the bundled Agent Skills.
//
//   import { list, read, skillsDir, meta } from "@nexor/skills";
//   list();                       // -> ["add-booking-provider", ...]
//   read("voice-scripting-v3");   // -> the SKILL.md contents (string)
//   skillsDir;                    // -> absolute path to the skills/ folder
//   meta("voice-scripting-v3");   // -> { name, description }
//
// Zero dependencies. Point your own agent's skill loader at `skillsDir`,
// or read individual skills to build a picker.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the bundled `skills/` directory. */
export const skillsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "skills",
);

/** Names of every bundled skill (a folder with a SKILL.md), sorted. */
export function list() {
  return readdirSync(skillsDir)
    .filter((d) => existsSync(path.join(skillsDir, d, "SKILL.md")))
    .sort();
}

/** Absolute path to a skill's SKILL.md. Throws if the skill is unknown. */
export function skillPath(name) {
  const p = path.join(skillsDir, name, "SKILL.md");
  if (!existsSync(p)) throw new Error(`Unknown skill: ${name}`);
  return p;
}

/** Full SKILL.md contents for a skill. */
export function read(name) {
  return readFileSync(skillPath(name), "utf8");
}

/** `{ name, description }` parsed from a skill's YAML frontmatter. */
export function meta(name) {
  const fm = parseFrontmatter(read(name));
  return { name: fm.name ?? name, description: fm.description ?? "" };
}

/** `{ name, description }` for every bundled skill. */
export function describe() {
  return list().map((name) => meta(name));
}

function parseFrontmatter(md) {
  const block = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!block) return {};
  const lines = block[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    // Folded / literal block scalar (`>-`, `>`, `|`, `|-`): join indented lines.
    if (/^[>|][-+]?$/.test(value)) {
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
        buf.push(lines[(i += 1)].trim());
      }
      value = buf.join(" ");
    }
    out[kv[1]] = value;
  }
  return out;
}

export default { skillsDir, list, skillPath, read, meta, describe };
