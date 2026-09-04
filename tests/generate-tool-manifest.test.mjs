import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { buildManifest, extractToolNames, readToolNames } from "../scripts/generate-tool-manifest.mjs";

test("extractToolNames reads one-per-line and inlined ToolDefinition literals, not schema properties", () => {
  const src = `
export const X: ToolDefinition[] = [
  {
    name: 'list_things',
    description: 'x',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
  },
  { name: 'get_thing', description: 'y', handler: async (a) => a },
  { name: "quoted_double", description: 'z' },
];
const notATool = { channel: 'whatsapp', template_name: 'confirm_booking' };
`;
  assert.deepEqual([...extractToolNames(src)].sort(), ["get_thing", "list_things", "quoted_double"]);
});

test("readToolNames scans only *.tools.ts under src/application/tools", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "mcp-"));
  try {
    const dir = path.join(repo, "src", "application", "tools");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "a.tools.ts"), "[{ name: 'b_tool', description: '' }, { name: 'a_tool', description: '' }]");
    writeFileSync(path.join(dir, "index.ts"), "{ name: 'not_a_tool', }");
    assert.deepEqual(readToolNames(repo), ["a_tool", "b_tool"]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("readToolNames rejects a path that is not an MCP checkout", () => {
  assert.throws(() => readToolNames(tmpdir()), /is that the public MCP checkout/);
});

test("buildManifest promotes pending names that landed and keeps the rest", () => {
  const previous = { source: "s", pending: ["landed_tool", "still_pending"] };
  const m = buildManifest(["a_tool", "landed_tool"], previous);
  assert.deepEqual(m.tools, ["a_tool", "landed_tool"]);
  assert.deepEqual(m.pending, ["still_pending"]);
  assert.equal(m.source, "s");
  assert.match(m.generated_at, /^\d{4}-\d{2}-\d{2}$/);
});
