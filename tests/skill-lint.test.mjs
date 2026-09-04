import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractInlineCodeTokens,
  extractRelativeLinks,
  headingSlugs,
  lintSkills,
  loadJson,
  slugify,
  stripFencedCode,
} from "../scripts/lib/skill-lint.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const manifest = { tools: ["create_workflow", "list_meetings"], pending: ["connect_crm"] };
const allowlist = {
  runtime_agent_tools: ["get_available_slots"],
  runtime_label: "not callable over MCP",
  allowed_tokens: ["workflow_id"],
  forbidden_tokens: { inspectAccountChannels: "Use get_account_readiness." },
};

function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "skill-lint-"));
  const skills = path.join(dir, "skills");
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(skills, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  return { dir, skills, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function lint(files) {
  const f = fixture(files);
  try {
    return lintSkills({ skillsDir: f.skills, manifest, allowlist, root: f.dir });
  } finally {
    f.cleanup();
  }
}

test("stripFencedCode blanks fenced blocks but keeps line numbers", () => {
  const md = "a\n```json\n{ \"tool_x\": 1 }\n```\nb `tool_y`";
  const out = stripFencedCode(md);
  assert.equal(out.split("\n").length, md.split("\n").length);
  assert.ok(!out.includes("tool_x"));
  assert.ok(out.includes("tool_y"));
});

test("extractInlineCodeTokens finds snake_case inside inline code only", () => {
  const md = "Call `create_workflow({ workflow_id })` then `get_workflow.config.email_sender_id`.\nplain snake_case_here is ignored.\n```\n`fenced_tool`\n```";
  const tokens = extractInlineCodeTokens(md).map((t) => t.token);
  assert.deepEqual(tokens, ["create_workflow", "workflow_id", "get_workflow", "email_sender_id"]);
});

test("extractRelativeLinks skips URLs and reports line numbers", () => {
  const md = "x\n[a](references/a.md#top) [b](https://example.com) [c](mailto:x@y.z)\n[d](#local)";
  const links = extractRelativeLinks(md);
  assert.deepEqual(links, [
    { href: "references/a.md#top", line: 2 },
    { href: "#local", line: 3 },
  ]);
});

test("slugify matches GitHub heading anchors", () => {
  assert.equal(slugify("3. Merge, replace, and destroy semantics"), "3-merge-replace-and-destroy-semantics");
  assert.equal(slugify("Law 1 — every piece of information"), "law-1--every-piece-of-information");
  assert.equal(slugify("The bridge: `metadata_key`"), "the-bridge-metadata_key");
  assert.equal(slugify("Write tool → read-back tool"), "write-tool--read-back-tool");
});

test("headingSlugs de-duplicates repeated headings like GitHub", () => {
  const slugs = headingSlugs("# A\n## A\n### B");
  assert.deepEqual([...slugs], ["a", "a-1", "b"]);
});

test("passes on a skill that only names manifest tools, pending tools and allowlisted tokens", () => {
  const r = lint({
    "ok/SKILL.md": "---\nname: ok\n---\n# Ok\n\nCall `create_workflow({ workflow_id })`, then `connect_crm`.\n\nSee [ref](references/r.md#details).\n",
    "ok/references/r.md": "# Ref\n\n## Details\n\n`list_meetings`\n",
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.stats.tokens, 4);
  assert.equal(r.stats.links, 1);
});

test("fails on a tool name that is not in the manifest", () => {
  const r = lint({ "bad/SKILL.md": "# Bad\n\nCall `create_reminder_rule`.\n" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /bad\/SKILL\.md:3 `create_reminder_rule` is not an MCP tool/);
});

test("ignores tool-looking tokens inside fenced code blocks", () => {
  const r = lint({ "fenced/SKILL.md": "# F\n\n```json\n{ \"tool\": \"phantom_tool\" }\n```\n" });
  assert.deepEqual(r.errors, []);
});

test("forbidden tokens are rejected anywhere in the file, even outside backticks", () => {
  const r = lint({ "forbid/SKILL.md": "# F\n\nRun inspectAccountChannels first.\n" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /forbid\/SKILL\.md:3 references "inspectAccountChannels".*Use get_account_readiness/);
});

test("runtime agent tools require the not-callable label in the same file", () => {
  const missing = lint({ "rt/SKILL.md": "# R\n\nGate `get_available_slots` by status.\n" });
  assert.equal(missing.errors.length, 1);
  assert.match(missing.errors[0], /runtime agent tool\(s\) `get_available_slots` but never states "not callable over MCP"/);

  const labelled = lint({ "rt/SKILL.md": "# R\n\n`get_available_slots` is a runtime tool — not callable over MCP.\n" });
  assert.deepEqual(labelled.errors, []);
});

test("a runtime tool that is also in the manifest is a configuration error", () => {
  const f = fixture({ "x/SKILL.md": "# x\n" });
  try {
    const r = lintSkills({
      skillsDir: f.skills,
      manifest: { tools: ["get_available_slots"] },
      allowlist: { runtime_agent_tools: ["get_available_slots"] },
      root: f.dir,
    });
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /cannot be both/);
  } finally {
    f.cleanup();
  }
});

test("relative links must resolve to a file and to a heading anchor", () => {
  const r = lint({
    "links/SKILL.md": "# L\n\n[missing](references/nope.md)\n[bad anchor](references/r.md#nowhere)\n[good](references/r.md#details)\n[self](#l)\n[self-bad](#zzz)\n",
    "links/references/r.md": "# R\n\n## Details\n",
  });
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /links\/SKILL\.md:3 link "references\/nope\.md" points at a file that does not exist/);
  assert.match(r.errors[1], /links\/SKILL\.md:4 link "references\/r\.md#nowhere" — no heading with anchor "#nowhere"/);
  assert.match(r.errors[2], /links\/SKILL\.md:7 link "#zzz"/);
});

test("links may not escape the repository root", () => {
  const r = lint({ "esc/SKILL.md": "# E\n\n[up](../../../etc/passwd)\n" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /escapes the repository/);
});

test("unused allowlist entries and manifest duplicates surface as warnings, not errors", () => {
  const f = fixture({ "w/SKILL.md": "# W\n\n`create_workflow`\n" });
  try {
    const r = lintSkills({
      skillsDir: f.skills,
      manifest,
      allowlist: { allowed_tokens: ["never_used", "create_workflow"] },
      root: f.dir,
    });
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('"never_used" is no longer used')));
    assert.ok(r.warnings.some((w) => w.includes('"create_workflow" is also an MCP tool')));
  } finally {
    f.cleanup();
  }
});

test("the checked-in skills pass against the checked-in manifest and allowlist", () => {
  const r = lintSkills({
    skillsDir: path.join(ROOT, "skills"),
    manifest: loadJson(path.join(ROOT, "docs", "mcp-tool-manifest.json")),
    allowlist: loadJson(path.join(ROOT, "docs", "tool-name-allowlist.json")),
    root: ROOT,
  });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.stats.tokens > 500, `expected a real corpus, saw ${r.stats.tokens} tokens`);
  assert.ok(r.stats.links > 20, `expected real cross-links, saw ${r.stats.links}`);
});

test("the checked-in manifest names every booking tool the skill depends on", () => {
  const m = loadJson(path.join(ROOT, "docs", "mcp-tool-manifest.json"));
  const all = new Set([...m.tools, ...m.pending]);
  for (const t of [
    "create_workflow", "create_meeting_type", "add_executive", "set_host_schedule", "connect_calendar",
    "get_calendar_connections", "get_reminder_catalog", "set_reminder_rule", "set_host_reminder_rule",
    "set_meeting_type_routing", "review_agent_system_plan", "set_workflow_active", "get_workflow_slots",
    "book_meeting", "reschedule_meeting", "cancel_meeting", "change_meeting_host", "set_meeting_status",
    "set_external_booking", "connect_calendly", "set_calendly_binding", "connect_crm", "get_account_readiness",
  ]) {
    assert.ok(all.has(t), `manifest is missing ${t}`);
  }
  assert.deepEqual(m.tools, [...m.tools].sort(), "tools must be sorted");
  assert.equal(new Set(m.tools).size, m.tools.length, "tools must be unique");
});
