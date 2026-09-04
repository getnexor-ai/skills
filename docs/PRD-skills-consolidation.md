# PRD 19: Skills: merge the two repos, add hosts and calendar steps, publish the reminder contract, validate tool names

**Status:** Draft for engineering review  
**Owner:** Eun Lee · Product & Ops (engineering owner TBD)  
**Created:** 2026-09-04  
**Program:** Booking parity, Phase 4 — Surfaces, skills and docs · sequence 19 of 21 · index: `nexor-node-api/docs/PRD-booking-parity-program.md`  
**Repositories:** skills, nexor-public-skills  
**Size:** Medium (1 week)  
**Scope:** Skills consolidation and booking guidance.  
**Does not cover:** Engineering-facing provider skills.

---

## 1 · Summary

**Today:** The repos forked on 2026-08-19. The published one lacks identity-at-create and verified-write guidance; the other lacks the meeting-type bootstrap and has no CI. Neither names add_executive, update_executive, list_meetings or get_meeting_stats. Both reference inspectAccountChannels (a Master Editor tool) and the six runtime booking tools as if callable over MCP. The reminder-rule contract exists only in an unmerged playbook. The unmerged add-booking-provider skill contradicts the published configure-external-booking on whether cancel and reschedule are optional.

**After:** Consolidate getnexor-ai/skills and DropoutCapital/nexor-public-skills into one published catalogue, add the missing booking steps, and gate publishing on a tool-name check against the live MCP manifest.

## 2 · The story

**Before.** An AI client follows the published skill on a fresh account. It never adds a host, never mentions a calendar, and tries to call inspectAccountChannels, which does not exist on the MCP.

**After.** One repo, one CI, one booking path that names add_executive, set_host_schedule and connect_calendar in order, and a prepublish check that fails on unknown tool names.

### Evidence

- diff -rq of the two repos and git log after 86149bf.
- Unmerged branch implement-anonymized-features holds add-booking-provider, appointment-reminders-playbook and how-to-manage-executives.
- prepublish-check.mjs validates frontmatter and packaging only.

## 3 · Goals / Non-goals

- **G1** One canonical repo with CI and npm publishing.
- **G2** A booking-agent path that names every MCP tool in order, including hosts, availability, calendar and reminders.
- **G3** No skill can reference a tool name that does not exist on the MCP server.

- **NG1** Writing engineering-facing provider skills for customers.

## 4 · How it works today → how it will work

**Today**

```
two diverged repos; prepublish validates packaging only
```

**After**

```
getnexor-ai/skills canonical → CI + npm publish → booking section → manifest-validated tool names
```

## 5 · The data

- No product data. Skill files, marketplace manifest, checked-in MCP tool manifest.

## 6 · Pseudo-code — the agreement

```
WHEN publishing
  FOR each backtick snake_case token in skills → must exist in the MCP manifest or fail
  FOR each relative link → must resolve or fail
```

## 7 · Requirements

| # | Requirement |
|---|---|
| R1 | Merge both repos into getnexor-ai/skills with the DropoutCapital CI and publish pipeline; archive the other. |
| R2 | automation-architecture gains a Booking agent section: create_workflow (timezone), create_meeting_type or reuse, add_executive, set_host_schedule, connect_calendar with the human step, set_reminder_rule with the full argument contract, review, activation. |
| R3 | Runtime tools are labelled as such and never presented as callable; inspectAccountChannels is replaced by get_account_readiness and the channel list tools. |
| R4 | Resolve the external-booking contradiction: cancel and reschedule tools are required unless the operator explicitly accepts the limitation in writing. |
| R5 | prepublish-check validates every backtick snake_case token against a checked-in MCP manifest and every relative link. |

## 8 · Acceptance criteria

| # | Criterion |
|---|---|
| A1 | An AI client following the published skill on a fresh account builds a bookable appointment agent without visiting the dashboard (with PRDs 08 and 09 shipped). |
| A2 | CI fails on a skill that references a non-existent tool. |

## 9 · Dependencies and sequence

Phase 4, once the Phase 1 tools exist so the skill can name them. The consolidation itself can start immediately.

- **Depends on:** PRD 07 (nexor-public-mcp/docs/PRD-booking-readiness-signals.md), PRD 08 (nexor-node-api/docs/PRD-mcp-connect-calendar.md), PRD 09 (nexor-node-api/docs/PRD-host-availability-tools.md), PRD 14 (nexor-node-api/docs/PRD-reminder-channel-unification.md)
- **Unblocks:** PRD 20 (advisorai/prds/PRD-nexorgpt-booking-completion.md)

## 10 · Telemetry and rollout

- Skill installs from npm; broken-reference count in CI.

## 11 · Open questions

- Who owns the canonical repo going forward?

---

*Source audit: `ops/analysis/parity-audit__eun-lee__internal__2026-09-04__en.html` (Nexor Ops repo). Evidence gathered from repo reads at the 2026-09-04 checkouts, live MCP read-only calls, PlanetScale `mcp_tool_calls` / `api_request_logs`, SigNoz and Linear.*
