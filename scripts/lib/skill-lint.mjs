// skill-lint — the content half of the prepublish gate.
//
// Two checks over skills/**/*.md:
//   1. Every snake_case identifier inside an inline code span must be a known
//      MCP tool (docs/mcp-tool-manifest.json), a runtime agent tool that the
//      file explicitly labels as not callable over MCP, or an allowlisted
//      non-tool token (docs/tool-name-allowlist.json). Fenced code blocks are
//      ignored — JSON payload examples are not tool references.
//   2. Every relative markdown link resolves to a file, and its #anchor (if
//      any) resolves to a heading in that file.
//
// Pure functions; the CLI wrapper lives in ../prepublish-check.mjs.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const SNAKE_TOKEN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

/** Replace fenced code blocks with blank lines so line numbers survive. */
export function stripFencedCode(md) {
  return md.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, (block) => block.replace(/[^\n]/g, ""));
}

/** snake_case identifiers found inside single-backtick inline code spans. */
export function extractInlineCodeTokens(md) {
  const out = [];
  const stripped = stripFencedCode(md);
  const span = /`([^`\n]+)`/g;
  let m;
  while ((m = span.exec(stripped))) {
    const line = lineAt(stripped, m.index);
    for (const token of m[1].match(SNAKE_TOKEN) ?? []) out.push({ token, line });
  }
  return out;
}

/** Relative markdown links: `[text](href)` where href is not a URL scheme. */
export function extractRelativeLinks(md) {
  const out = [];
  const stripped = stripFencedCode(md);
  const link = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = link.exec(stripped))) {
    const href = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // http:, mailto:, …
    out.push({ href, line: lineAt(stripped, m.index) });
  }
  return out;
}

/** GitHub-style heading slug. */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

/** Every anchor GitHub would render for the headings in a markdown file. */
export function headingSlugs(md) {
  const slugs = new Set();
  const seen = new Map();
  for (const line of stripFencedCode(md).split("\n")) {
    const h = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!h) continue;
    const base = slugify(h[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n === 0 ? base : `${base}-${n}`);
  }
  return slugs;
}

export function loadJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** All *.md files under a directory, sorted, as absolute paths. */
export function listMarkdownFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listMarkdownFiles(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

/**
 * Lint every markdown file under `skillsDir`.
 *
 * @param {object} opts
 * @param {string} opts.skillsDir absolute path to skills/
 * @param {{tools: string[], pending?: string[]}} opts.manifest
 * @param {{runtime_agent_tools?: string[], runtime_label?: string, allowed_tokens?: string[], forbidden_tokens?: Record<string,string>}} opts.allowlist
 * @param {string} [opts.root] directory links must stay inside (defaults to skillsDir's parent)
 */
export function lintSkills({ skillsDir, manifest, allowlist, root }) {
  const errors = [];
  const warnings = [];
  const boundary = root ?? path.dirname(skillsDir);

  const known = new Set([...(manifest.tools ?? []), ...(manifest.pending ?? [])]);
  const runtime = new Set(allowlist.runtime_agent_tools ?? []);
  const runtimeLabel = (allowlist.runtime_label ?? "not callable over MCP").toLowerCase();
  const allowed = new Set(allowlist.allowed_tokens ?? []);
  const forbidden = allowlist.forbidden_tokens ?? {};

  for (const t of allowed) {
    if (known.has(t)) warnings.push(`allowlist: "${t}" is also an MCP tool in the manifest — drop it from allowed_tokens.`);
    if (runtime.has(t)) warnings.push(`allowlist: "${t}" is listed both as runtime tool and allowed token.`);
  }
  for (const t of runtime) {
    if (known.has(t)) errors.push(`allowlist: runtime tool "${t}" is also in the MCP manifest — it cannot be both.`);
  }

  const usedAllowed = new Set();
  const files = listMarkdownFiles(skillsDir);
  const stats = { files: files.length, tokens: 0, links: 0, unknown: [] };

  for (const file of files) {
    const rel = path.relative(boundary, file);
    const md = readFileSync(file, "utf8");

    // forbidden tokens are checked on the raw text: they are wrong anywhere.
    for (const [token, hint] of Object.entries(forbidden)) {
      const re = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(token)}(?![A-Za-z0-9_-])`, "g");
      let m;
      while ((m = re.exec(md))) {
        errors.push(`${rel}:${lineAt(md, m.index)} references "${token}", which does not exist on the MCP. ${hint}`);
      }
    }

    const mentionsRuntime = new Set();
    for (const { token, line } of extractInlineCodeTokens(md)) {
      stats.tokens += 1;
      if (known.has(token)) continue;
      if (runtime.has(token)) {
        mentionsRuntime.add(token);
        continue;
      }
      if (allowed.has(token)) {
        usedAllowed.add(token);
        continue;
      }
      stats.unknown.push({ file: rel, line, token });
      errors.push(`${rel}:${line} \`${token}\` is not an MCP tool in docs/mcp-tool-manifest.json nor an allowlisted token.`);
    }
    if (mentionsRuntime.size && !md.toLowerCase().includes(runtimeLabel)) {
      errors.push(
        `${rel} mentions runtime agent tool(s) ${[...mentionsRuntime].map((t) => `\`${t}\``).join(", ")} but never states "${allowlist.runtime_label ?? "not callable over MCP"}".`,
      );
    }

    const ownSlugs = headingSlugs(md);
    for (const { href, line } of extractRelativeLinks(md)) {
      stats.links += 1;
      const [target, anchor] = splitAnchor(href);
      let targetFile = file;
      if (target) {
        targetFile = path.resolve(path.dirname(file), decodeURIComponent(target));
        if (!targetFile.startsWith(boundary + path.sep)) {
          errors.push(`${rel}:${line} link "${href}" escapes the repository.`);
          continue;
        }
        if (!existsSync(targetFile)) {
          errors.push(`${rel}:${line} link "${href}" points at a file that does not exist.`);
          continue;
        }
      }
      if (anchor) {
        if (!targetFile.endsWith(".md")) continue;
        const slugs = targetFile === file ? ownSlugs : headingSlugs(readFileSync(targetFile, "utf8"));
        if (!slugs.has(anchor)) {
          errors.push(`${rel}:${line} link "${href}" — no heading with anchor "#${anchor}" in ${path.relative(boundary, targetFile)}.`);
        }
      }
    }
  }

  for (const t of allowed) {
    if (!usedAllowed.has(t)) warnings.push(`allowlist: "${t}" is no longer used by any skill — remove it from allowed_tokens.`);
  }

  return { errors, warnings, stats };
}

function splitAnchor(href) {
  const i = href.indexOf("#");
  if (i === -1) return [href, null];
  return [href.slice(0, i), href.slice(i + 1).toLowerCase()];
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
