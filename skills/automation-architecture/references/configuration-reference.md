# Configuration reference

The client-facing configuration surface for each primitive. Field names here are the real ones exposed through the product UI and public API.

## Contents

1. [Statuses and agent routing](#1-statuses-and-agent-routing)
2. [Intake: workflow fields vs metadata](#2-intake-workflow-fields-vs-metadata)
3. [Integration endpoints: deterministic callers and workflow HTTP/MCP tools](#3-integration-endpoints-deterministic-callers-and-workflow-httpmcp-tools)
4. [Getting leads in: the public API](#4-getting-leads-in-the-public-api)
5. [Notifications: outbound webhooks and status automations](#5-notifications-outbound-webhooks-and-status-automations)
6. [Cloud functions (event-driven JS)](#6-cloud-functions-event-driven-js)
7. [Scheduled functions (cron-driven JS)](#7-scheduled-functions-cron-driven-js)
8. [Background jobs (declarative cohort automation)](#8-background-jobs-declarative-cohort-automation)
9. [Workflow transfers](#9-workflow-transfers)
10. [Cadence: contact windows and outreach intensity](#10-cadence-contact-windows-and-outreach-intensity)
11. [Knowledge bases: account catalog and per-agent assignment](#11-knowledge-bases-account-catalog-and-per-agent-assignment)
12. [Account channel inventory and agent binding](#12-account-channel-inventory-and-agent-binding)

---

## 1. Statuses and agent routing

Statuses belong to a workflow (an agent). The list below is the **stored/dashboard shape** of a status, and `create_workflow` accepts nearly all of it directly (each status needs `key` plus `name` or its `label` alias; unknown keys forward to the backend) — so write the full funnel at create time and reserve `update_workflow_status` for edits and late-binding transfer targets. The statuses array is the *complete* pipeline: the backend seeds default stages on create, and the tool prunes them back to your list and reports the outcome in `pipeline_reconciliation`. See [mcp-tool-surface.md §5](mcp-tool-surface.md) for the exact create-time contract. Key config per status:

- **Identity:** `key` (snake_case, unique per workflow), `label`, `description` (an internal note — see below), `color`, `sort_order`, `category` (`active` | `won` | `lost` | `paused` | `deferred`; terminal statuses use `won` / `lost`).
- **Semantic flags:** `is_initial` (exactly one per workflow), `is_terminal` (at least one), stage-type markers `is_auto_contacted` / `is_auto_engaged` / `is_qualified` / `is_booking_target` (mutually exclusive — at most one stage each), `pause_bot` (the only per-status control that silences the agent), `futurology_queue` (a "park and re-contact later" bucket).
- **Agent-facing:** `entry_hint`, `variable_refs[]`, `requires_all_fields`, `required_field_keys[]`.
- **JSON blocks:** `transfer_config`, `timeout_config`, `transition_rules`, `assignment_config`.

**Reachability:** `update_workflow_status` writes everything above **except `variable_refs`, `futurology_queue`, and `sort_order`** — those three are dashboard-only there. Treat `variable_refs` as presentation, never as a gate: the enforcing gate is always `required_field_keys` / `requires_all_fields` / `transition_rules`. `sort_order` is settable at `create_workflow` / `update_workflow_structure` time (defaulting to array position) but not on `update_workflow_status`.

### How the agent decides where a lead goes

The prompt shows the agent its pipeline: every status's `label` and `key`, with `entry_hint` as the placement criterion and `variable_refs` showing which collected fields each status needs. The agent moves leads with the `set_lead_status` tool; the server blocks the move if `requires_all_fields` / `required_field_keys` are unmet.

**`entry_hint` is the routing rule.** `description` is an internal note: it never enters the conversational agent's prompt (its only consumers are the recontact decision agent, as an `entry_hint` fallback on terminal statuses, and the prompt optimizer's context). Placement rules go in `entry_hint`, referencing concrete field values:

> `entry_hint: "Monthly income is confirmed and below $800,000 — place the lead here."`

Keep hints specific (a hint under ~20 characters is flagged as too vague by the workflow validator).

### Value-range routing (e.g. "salary under / over X")

The canonical pattern for "when <variable> is below/above/equal to X, do Y":

1. Define the variable as a workflow field (e.g. `monthly_income`, type `currency`, `required: true`).
2. Create one status per range. Each status: `variable_refs: ["monthly_income"]`, `requires_all_fields: true`, an `entry_hint` stating the exact condition ("income is less than 800,000", "income is 800,000 or more"), and a `transition_rules` rule group encoding the same condition numerically with `auto_evaluate: true` — the hint guides the agent, the rule group routes deterministically.
3. Make the branch statuses that leave this agent's scope **terminal**, and attach `transfer_config` (§9) or a status automation / webhook (§5) to make something happen. Remember the terminal early-return above: the server does not block entry into `lost`/transfer terminals, so the rule groups (via `auto_evaluate`) — not agent placement — should own the routing.

The agent asks for the field, then the platform routes the lead and reacts from there. No code.

### The qualification gate — what the server enforces on `set_lead_status`

`is_qualified` is a stage-type marker for reporting and UI; it enforces nothing by itself (creating a qualified stage defaults `requires_all_fields` to true — that default is the gate). The server validates every transition in this order:

1. **Milestone guard:** leads sitting in an `is_booking_target` or `category: "won"` status cannot be demoted into a `futurology_queue` status.
2. **Booking integrity:** entering `is_booking_target` requires a live upcoming calendar event (native booking only).
3. **Terminal early-return: terminal targets skip the field and value gates — unless the target is `category: "won"` with a gate declared.** Gates protect non-terminal stages and `won`; entry into `lost`/transfer terminals is guided by `entry_hint`, not blocked by the server.
4. **Field-presence gate:** `required_field_keys` (exact list) takes precedence over `requires_all_fields` (all enabled+required workflow fields); missing keys block the move and are returned as `missing_fields`.
5. **Value gate:** `transition_rules.rule_groups` — groups are OR'd, conditions within a group are AND'd; operators `=`, `!=`, `>`, `>=`, `<`, `<=`; a missing/null value fails its condition.

Full `transition_rules` shape:

```json
{
  "auto_evaluate": true,
  "rule_groups": [
    { "label": "High income", "logic": "AND",
      "conditions": [{ "field": "monthly_income", "operator": ">=", "value": 800000 }] }
  ],
  "group_logic": "OR",
  "llm_note": "Free text the agent sees for edge cases"
}
```

`auto_evaluate: true` transitions the lead as soon as its rules are satisfied, instead of waiting for the agent to call `set_lead_status`. (`logic` / `group_logic` are stored but the evaluator hardcodes OR-of-AND-groups.)

### Disqualification / discard statuses

A terminal status with `category: "lost"` is the discard mechanism. The disqualification rule is configured visibly in the agent (`entry_hint` + `transition_rules`) and processed internally during the conversation. `lost` means **"stop initiating," not "stop responding"**: all proactive outbound halts (cadence and jobs skip the lead as `status_lost`), the run cannot be reactivated — but if the lead writes in, the agent still replies briefly and kindly under built-in lost-lead behavior (no selling, no booking offers). Choose by intent:

- **Discard** ("stop pursuing"): terminal + `category: "lost"`. Attach a status automation or filtered webhook when the customer's system must also be told. Add `pause_bot` only if the customer wants total silence, including to inbound messages.
- **Hold** ("stop responding while a human reviews"): `pause_bot` — the run stays live, the agent just goes quiet while the lead sits there.
- **Defer** ("not now, recontact later"): `futurology_queue` parking bucket + a re-activation mechanism (§8).

Status keys starting with `future_`, or exactly `contact_later` / `colder`, are treated as **soft terminals** — recontact machinery keeps running for them. Do not use those key shapes for a hard discard. Prompt-only instructions like "don't message unqualified leads" are speech, not structure — the terminal status is the enforcement.

### Status timeouts

`timeout_config: { timeout: <n>, unit: "minutes"|"hours"|"days", target_status_key: "<key>" }` moves leads that stagnate in a status. `target_status_key` must be a status **in the same workflow** — this is the platform's only status→status pointer (transfers cannot aim at a specific status in another agent, see §9). If the target status is terminal and carries `transfer_config`, the transfer fires. Leads with an upcoming meeting are protected from terminal timeouts; leads in human support and paused workflows are skipped.

### Native member assignment (`assignment_config`)

`{ "mode": "round_robin" | "least_loaded", "agent_ids": ["<user_uuid>"], "restrict_booking_to_assignee": false }` on at most one stage: entering it assigns a human team member (empty `agent_ids` = the whole team; eligible roles are owner/admin/human agent). It does not pause the AI. When "assign sales reps round-robin" means rotating among the customer's own team members *in Nexor*, this native config is the entire answer — no endpoint, no tool. Reach for a client endpoint only when an external system owns the rotation (see the round-robin recipe).

---

## 2. Intake: workflow fields vs metadata

Nexor has **two** custom-data stores. Confusing them is the most common design error.

### Workflow fields — "what the agent should collect"

Per field: `key`, `label`, `description`, `type` (`text`, `number`, `integer`, `currency`, `boolean`, `date`, `datetime`, `email`, `phone`, `select`, `multiselect`, `url`), `required`, `options[]`, `extraction_hints`, `validation`, plus `metadata_key` and `intake_value_map`.

The prompt renders required fields as PENDING and optional ones as "collect if it comes up naturally." The agent saves values with `save_field`; values live per workflow run (not in metadata). Status advancement gates on **fields** (`variable_refs`, `required_field_keys`) — never on metadata.

### Lead metadata — "data that arrives with or about the lead"

Free-form JSON on the lead. Written by:

- The public API at creation/upsert (shallow merge — existing keys survive, incoming keys overwrite).
- The agent mid-conversation via the `patch_metadata` tool (supports dotted paths like `address.city`). Contact data (email/phone/name) goes through `update_lead` instead — metadata does not change where messages are sent.
- Functions (`updateMetadata`), background jobs (`enrich_lead` with `target: "metadata.<path>"`), and post-tool hooks that write a value from a tool's JSON response into a metadata key.
- Bulk: `PATCH /api/public/leads/metadata` with `{ selector: "id"|"email"|"phone"|"external_id", values: [...], patch: {...} }` (up to 1000 per call).

The agent **reads** the full metadata object — it is injected into the prompt with the lead — and HTTP tool templates can reference `{{lead.metadata.X}}`.

### Incoming sync mapping: standard columns vs metadata

Resolve direction before mapping a request described as “sync.” If information is coming **into Nexor**, split the payload deliberately:

| Incoming value | Destination | Why |
|---|---|---|
| First name | `first_name` | Standard lead identity used throughout the product |
| Last name | `last_name` | Standard lead identity |
| Email | `email` | Standard contact destination and upsert key |
| Phone number | `phone` | Standard contact destination and upsert key |
| Any other fact the agent should know on later executions | `metadata.<key>` | Free-form lead context injected into the agent prompt |

For one existing lead, call `PATCH /api/public/leads/:id` (or the compatible `PUT`) with the standard keys at the top level and a `metadata` object for custom facts. Both methods shallow-merge `metadata`: unspecified existing keys survive and incoming keys overwrite matching keys. The MCP `update_lead` tool expresses the same contract as `{ lead_id, fields: { first_name?, last_name?, email?, phone? }, metadata: { ... } }`.

For several existing leads, use `PATCH /api/public/leads/metadata` with a selector and a non-empty patch. For creation/upsert, send the same split to `POST /api/public/leads`: standard columns at the top level, custom context in `metadata`.

A successful metadata write affects the **next agent execution**. It does not rewrite an already-running model call, change the email/phone used for delivery, or send data to an external system. When information is going **out of Nexor**, use an outbound webhook, status automation, cloud function, workflow tool, or scheduled function according to the trigger and cadence; metadata can supply payload values but is not the transport.

### The bridge: `metadata_key`

Set `metadata_key` on a workflow field to mean: "if the lead arrives with this metadata key, pre-fill the field instead of asking." `intake_value_map` normalizes the incoming vocabulary (e.g. `"SMB"` → `"small_business"`). One direction only: metadata → field. `save_field` does not write back to metadata.

**Rule of thumb:** "the agent must ask for X" → workflow field. "Our CRM sends X and the agent should know/use it" → metadata at creation, plus a `metadata_key` mapping if the agent would otherwise ask for it.

### Which reader can see which store

Choosing the store is not cosmetic — most readers can see exactly one of them. Check this table before deciding where a value lives; a fact needed by readers on both sides must exist in both stores.

| Reader | Workflow fields | Lead metadata |
|---|---|---|
| Status gates: `required_field_keys`, `requires_all_fields`, `transition_rules` | Yes | **No** |
| Status automation `args_template` | **No** | Yes (`{{lead.metadata.<key>}}`) |
| Outbound webhook payload / `payload_template` | **No** | Yes (the full lead is in the envelope) |
| HTTP tool `headers` / `query_parameters` / body templates | **No** | Yes (`{{lead.metadata.X}}`) |
| The agent's prompt | Yes (rendered as PENDING/collected) | Yes (full object injected) |
| Background job filters (`lead_filters`) | **No** | Yes (`lead.metadata.<key>`) |
| Background job steps | Yes (`evaluate_field`) | Yes (`evaluate_metadata`) |
| Scheduled function `lookup_config` | **No** | **No** (lead columns and `tags` only) |
| Function code (`ctx`) | Only what the event carries (`information.*` payload, `ctx.changed_fields`) | Yes (`ctx.lead.metadata`, `ctx.leads[].metadata`) |

The two asymmetries that break designs: a gate can never read metadata, and a deterministic sender (status automation, webhook, tool template) can never read a collected field value. When a status gates on `field_x` and an automation on that same status must transmit it, mirror the value into metadata — via a post-tool hook or the agent's `patch_metadata` — **before** the lead can reach that status. Bridging the other direction (`metadata_key`) only pre-fills fields at intake; `save_field` never writes back to metadata.

---

## 3. Integration endpoints: deterministic callers and workflow HTTP/MCP tools

A workflow HTTP/MCP tool defines how Nexor calls a client endpoint. Do not assume the AI agent should be the caller. Choose the caller by reliability and timing:

1. **Status change:** prefer a filtered outbound webhook when the client can act from the standard event, or a status automation when Nexor must run the endpoint exactly once with templated arguments (§5).
2. **Field/variable or other lead event:** prefer a cloud function on the narrowest event, such as `information.collected`, `information.updated`, or `lead.updated`, and guard on the relevant key/change (§6).
3. **Needed before the agent's first message:** make the tool a pre-execution hook with `set_workflow_tool_execution({ workflow_id, tool_id, mode: "on_entry" })`. It fires when the lead enters the workflow, ahead of the first agent message, with no model decision.
4. **Active-turn dependency:** let the agent call the tool only when it must receive the response before it can decide what to say or do next and no state trigger can run the integration first.

The first three paths are deterministic: the platform invokes them even if the model would have forgotten, skipped, or hallucinated a tool call. The client endpoint still owns the custom behavior in every path.

### Execution modes: `on_entry` vs `agent_decides`

`set_workflow_tool_execution` is the switch, and the two modes are mutually exclusive:

| | `on_entry` | `agent_decides` |
|---|---|---|
| Fires | On entry to the workflow, before the first agent message | When the model chooses to call it |
| Stage gating | **Rejected** — passing a non-empty `available_in_statuses` returns `INVALID_INPUT` | `available_in_statuses` gates it; `null`/omitted = every status |
| Reliability | Deterministic | Depends on model selection |
| Use for | Enrichment, eligibility, account context, priming a transfer target on arrival | Anything needing a conversational decision or arguments from the dialogue |

The underlying flag is `auto_run_on_entry`, also settable directly on `create_workflow_tool` / `update_workflow_tool`. Because the hook runs on *workflow* entry rather than status entry, it fires again for a lead transferred into a target agent — which is exactly how a target gets its context ready before it speaks. `call_once` still bounds successful executions per run, and `is_active` is an independent kill switch.

Core `workflow_tools` fields:

- **Identity and selection:** `name` (immutable snake_case), `description` (what it does and the exact condition for calling it), `is_active`.
- **Request:** `url`, `method` (`GET` | `POST` | `PUT` | `PATCH` | `DELETE`), `parameters` (JSON Schema), `headers`, `query_parameters`, `timeout_ms` (1,000–120,000; default 10,000).
- **Control:** `available_in_statuses` (status keys where execution is permitted), `call_once` (at most one successful call per tool per workflow run), `llm_response_fields` (response paths retained for the model).

Example — define the client's HubSpot round-robin endpoint as a backing tool, then invoke it from a status automation rather than relying on the agent:

```json
{
  "name": "assign_sales_rep",
  "description": "Assign the qualified lead to the next eligible sales representative in the client's CRM. This is run automatically when the lead enters qualified; do not call it conversationally or choose a representative yourself.",
  "url": "https://customer.example.com/integrations/hubspot/assign",
  "method": "POST",
  "timeout_ms": 10000,
  "parameters": {
    "type": "object",
    "properties": {
      "lead_id": { "type": "string" },
      "territory": { "type": "string" },
      "product": { "type": "string" }
    },
    "required": ["lead_id", "territory", "product"]
  },
  "headers": { "Authorization": "Bearer {{env.HUBSPOT_ASSIGNMENT_TOKEN}}" },
  "available_in_statuses": ["qualified"],
  "call_once": true,
  "llm_response_fields": ["rep_id", "rep_name", "rep_email", "assignment_id"],
  "is_active": true
}
```

```json
{
  "status_automations": [{
    "key": "assign_rep_on_qualified",
    "on_status_key": "qualified",
    "action": "run_tool",
    "tool": "assign_sales_rep",
    "args_template": {
      "lead_id": "{{lead.id}}",
      "territory": "{{lead.metadata.territory}}",
      "product": "{{lead.metadata.product}}"
    },
    "skip_if_metadata": "sales_assignment_id"
  }]
}
```

`args_template` placeholders support `{{lead.<path>}}` / `{{lead.metadata.<key>}}` only — collected workflow-field values are **not** addressable. Pass `lead_id` plus stable lead/metadata paths and let the endpoint look up the rest, or mirror the needed field values into metadata (post-tool hook or the agent's `patch_metadata`) before the lead can reach the triggering status.

The endpoint should return a stable contract such as:

```json
{
  "success": true,
  "rep_id": "rep_123",
  "rep_name": "Alex Rivera",
  "rep_email": "alex@example.com",
  "assignment_id": "assign_456"
}
```

HubSpot or the client service remains the source of truth for rotation state, eligibility, territory, capacity, and deduplication. The status transition is the reliable Nexor trigger. Persist `assignment_id` to `metadata.sales_assignment_id` with a post-tool hook so the result is auditable and later turns can use it. Do not reproduce the algorithm in the agent prompt, a status hint, or a Nexor function.

### Stage-based tool access

`available_in_statuses` is a structural execution gate. A non-empty array allows the tool only when the lead's live current status key is in the array; `null` or `[]` means unrestricted. The gate applies across messaging and voice tool execution. A status transition can unlock the tool within the same turn.

For "qualify first, then assign, show availability, and book":

1. Define the qualification fields and make them required.
2. Configure status `qualified` with `requires_all_fields: true` and the exact `required_field_keys`.
3. Attach `assign_sales_rep` to the `qualified` status automation so assignment fires without an agent decision. Keep `available_in_statuses: ["qualified"]` and `call_once: true` as additional protection.
4. Set `available_in_statuses: ["qualified"]` on conversational availability and booking tools when qualification is their only prerequisite. If they require the completed assignment response, gate them to a later `assignment_ready` status instead. Gate cancellation/rescheduling tools to the booked status if their lifecycle differs.
5. Keep the qualification prerequisite in each conversational tool description and the agent instructions for good selection behavior, but treat the status gate as the enforcement boundary.
6. Before activation, enter `qualified` without prompting the agent to assign anyone and prove the automation reaches the test endpoint exactly once. Also call availability/booking while unqualified and expect `tool_not_available_in_stage`; after qualification the same valid calls may reach their endpoints.

If availability or booking requires the completed assignment result, do not unlock those tools in the same `qualified` status and hope the agent waits. Add an `assignment_ready` status and gate them there. Note that a status automation can only run a tool — it cannot move the lead — so the transition into `assignment_ready` needs a cloud function: either one triggered on `workflow.status_entered` for `qualified` that calls the assignment endpoint with `axios`, persists the returned IDs, and sets `assignment_ready` only on success; or, if the status automation makes the call, a post-tool hook that persists `assignment_id` to metadata plus a `lead.updated` function guarded on that key that performs the transition. A failed call leaves the lead in `qualified`. This makes the dependency structural instead of conversational.

Use `call_once: true` for assignment, deal creation, or booking when a second successful call in the same workflow run would be wrong. Leave it false for read-only availability/search tools that may need a legitimate refresh. Make every side-effecting endpoint idempotent anyway, keyed by a stable lead/workflow operation identifier.

On failure, instruct the agent not to invent the result. It should explain the temporary problem, retry only under the configured policy, or hand off to a human. Store durable external IDs through a post-tool hook when later steps or deduplication need them. If a deterministic action's result must be available before the agent continues, persist it and unlock a subsequent status; use an agent call only when the platform cannot satisfy that immediate dependency.

---

## 4. Getting leads in: the public API

### `POST /api/public/leads`

Auth: `X-API-Key` header. Accepts one object or an array of up to 1000.

Fields: `first_name` (required), `last_name`, `email`, `phone`, `company`, `title`, `source`, `external_id`, `metadata`, `tags`, `workflow_id`, `campaign_id`, consent flags, and first-contact controls.

`metadata` is the default way to give an agent custom information about a lead. Its root is a JSON object with arbitrary customer-defined keys; each value may be any valid JSON value, including a string, number, boolean, null, array, or nested object. Nexor injects the complete metadata object into the runtime agent prompt across channels, preserving nested values. Pure context needs no workflow field, knowledge base, tool, or function. Add a workflow field with `metadata_key` only when the agent must ask for, validate, normalize, or gate on that value. Metadata updates shallow-merge top-level keys: untouched top-level keys remain, but replacing part of a nested object requires resending that complete nested object.

- **Upsert:** matches by email first, then normalized phone. On match: non-empty fields overwrite, metadata shallow-merges, response says `existed: true`. Duplicate entries within one batch resolve to one lead.
- **Enrollment:** pass `workflow_id` to enroll the lead and start the agent's cadence/first contact immediately. Controls: `skip_first_message: true` (enroll silently), `force_first_channel: "call"|"whatsapp"|"email"|"sms"`, or `force_first_message: { channel, content }` (send a literal opener instead of the agent's own). If the workflow is paused, enrollment waits for unpause. Without `workflow_id` the lead is created inert.
- A per-API-key `intake_field_map` can translate an arbitrary vendor payload shape into the canonical fields, so a third-party webhook can point at this endpoint unmodified.

### Inbound lead webhook (no API key)

`POST /hooks/<unguessable-token>` — a branded intake URL the customer pastes into a form builder, Zapier, or their CRM. Config per hook: `name`, `field_mapping`, `workflow_id`, `deduplicate`, `is_active`. Use when the sending system can't set headers.

---

## 5. Notifications: outbound webhooks and status automations

Two mechanisms fire when a lead reaches a status. Pick by delivery contract:

| | Outbound webhook | Status automation |
|---|---|---|
| Fires | Every matching event | Exactly once per lead per rule |
| Configured | Client-level subscription + filters | Per status, in workflow config |
| Body | Standard envelope or `payload_template` | Any HTTP tool + `args_template` |
| Use for | "Tell my system whenever…" (logging, mirroring, alerting) | "Do this to my system once when the lead gets here" (create CRM deal, trigger fulfillment) |

Both are more reliable than instructing the agent to notice the status and call a tool. The status transition itself invokes them. Prefer these whenever the transition fully defines the action timing.

### Outbound webhooks

Subscription config: `name`, `url` (HTTPS only), `events[]`, `filters[]` (up to 10, ANDed: `{ field, operator, value }`), `auth_type` (`none` | `header` | `basic` | `custom_headers`), `payload_template` (optional), `include_full_lead`, `signing_secret` (HMAC-SHA256, shown once), `retry_enabled` / `max_retries`. The dashboard's per-status "Attach webhook" (pipeline column menu) creates exactly this: a client-level subscription auto-filtered on `workflow_id` + `to_status.key`.

Events: `workflow_run.status_changed`, `meeting.created`, `meeting.updated`, `meeting.cancelled`, `meeting.completed`, `meeting.no_show`, `meeting.confirmed`, `outreach.failed`.

**Scope to a status with filters, not per-status config:** filter fields include `to_status.key`, `to_status.category`, `from_status.key`, `workflow_id`, `trigger_type`, `actor_type`. Operators: `equals`, `not_equals`, `in`, `not_in`, `contains`.

The `workflow_run.status_changed` payload includes the from/to status (key, label, category), the trigger (`trigger_type`, `actor_type`), the full lead (including metadata), the workflow, and the run — enough for most receivers without a follow-up API call. `payload_template` reshapes it with `{{ dot.path }}` tokens over that payload (`lead.*` including metadata, `status_change.*`, `workflow.*`); collected workflow-field values are not part of the event payload.

Delivery: asynchronous (typically seconds), at-least-once, signed (`X-Nexor-Signature`), retried on network errors/429/5xx (≈1m / 5m / 30m), not retried on other 4xx. Design the receiver to be idempotent on `delivery_id`. Caveat: a filter whose field is absent from an event's payload *passes* — subscribe a status-filtered webhook to status events only, not mixed with meeting events.

### Status automations

`status_automations[]` lives in `workflows.config` and has **no dedicated MCP tool** — write it with `update_workflow_config({ workflow_id, config: { status_automations: [...] } })`. The config bag merges at the top level, but the array is replaced wholesale: read `get_workflow` and send the complete array on every change. The `tool` value references a workflow tool **by name**, so the tool must exist first and must never be renamed afterwards.

Each rule:

```json
{
  "key": "push_to_crm",
  "on_status_key": "qualified",
  "enabled": true,
  "action": "run_tool",
  "tool": "<name of a workflow HTTP/MCP tool>",
  "args_template": { "email": "{{lead.email}}", "income": "{{lead.metadata.monthly_income}}" },
  "skip_if_metadata": "crm_deal_id"
}
```

`run_tool` is the only supported `action`. Fires when the lead enters `on_status_key`; exactly once per (workflow, lead, rule key) — **forever**: re-entering the status never re-fires (idempotency ledger). One automatic retry on failure. `args_template` placeholders are `{{lead.<path>}}` / `{{lead.metadata.<key>}}` only; a missing template value aborts the rule rather than sending a broken body. Pair with a post-tool hook to write the response (e.g. a created CRM id) back into metadata.

---

## 6. Cloud functions (event-driven JS)

One lead, one event, custom JavaScript — the most flexible outbound integration path: native access to the lead that triggered the event, plus `axios` to call any external endpoint with any payload. Config: `name`, `description`, `trigger_event` (locked after creation), `code`, `is_active`.

Use an event cloud function instead of an agent tool when a field/variable or lead event defines the action. Select the narrowest trigger and guard the code to the relevant field/key so unrelated updates do not repeat the side effect. This preserves deterministic invocation while allowing custom computation or request shaping.

Triggers: `lead.created`, `lead.updated`, `lead.status_changed`, `lead.assigned`, `lead.tag_added`, `lead.unsubscribed`, `information.collected`, `information.updated`, `message.received`, `message.sent`, `call.completed`, `handoff.requested`, `conversion.detected`, `meeting.created`, `meeting.rescheduled`, `meeting.completed`, `meeting.no_show`, `task.created`, `task.executed`, `workflow.run_started`, `workflow.status_entered`, `workflow.status_left`, `workflow.run_completed`.

Runtime: `axios` and `fetch` are pre-injected globals (no imports); `env.KEY` reads Environment Variables; `ctx` carries the event and lead — update-type events also include the changed keys (`ctx.changed_fields`) for guarding. Limits: 5-minute deadline, 20 outbound requests per run.

**Effects are narrow:** `updateLead(patch)` and `updateMetadata(patch)` only, targeting the event's own lead (`updateLead({ status: "..." })` performs a status transition). Effects are buffered and applied only after the code finishes without throwing; cap 100.

**No chaining:** effect-driven updates do not re-emit events (recursion guard). A design that needs "event → change → another event reacts" belongs in a scheduled function.

Manual test runs preview effects without applying them — but `axios`/`fetch` calls are real even in a dry run.

---

## 7. Scheduled functions (cron-driven JS)

A cohort sweep — and the most flexible *inbound* integration path: query the leads table, call any external API with `axios`, and create or edit leads with custom metadata, all in editable JavaScript. Config: five-field `cron_expression` + IANA `timezone`, a `lookup_config` query selecting the cohort, `max_leads_per_cycle` (1–500), `code`, `is_active`.

Lookup grammar: Supabase-style chained filters over lead columns (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`, `contains`) plus `order()` and `limit()`; relative times via `daysAgo(n)` / `hoursAgo(n)` (recomputed each run). Filterable columns include contact fields, `source`, `external_id`, `created_at`, `last_contacted_at`, `last_response_at`, message counters, boolean flags, and `tags contains`. A cohort preview shows match count and sample rows before you activate.

Context: `ctx.leads[]` (each with `id`, contact fields, `tags`, `metadata`, `status`, `workflow_id`), `ctx.effects`, plus the same `axios`/`fetch`/`env`/`helpers` surface — and the same per-run outbound request limit — as cloud functions. Every effect names its lead — there is no "the" lead. Batch external calls (e.g. the leads API array form) instead of one request per lead.

Effects API: `upsertLead({email?, phone?, firstName?, lastName?, source?, metadata?})`, `updateLead(leadId, patch)`, `updateMetadata(leadId, patch)`, `assignLead(leadId, userId)`, `assignToWorkflow(leadId, workflowId, reason?)`, `tagLead(leadId, tags)`, `setLeadStatus(leadId, statusKey, workflowId?)`, `deactivateWorkflowRun(leadId)`. Buffered, applied after successful completion, cap 2000.

Chaining differs from cloud functions: `assignLead` re-emits events (a sweep can assign and let an event function react per lead), but `tagLead` does **not** emit a tag event.

**Syncing leads in from an external system** — two working shapes:

1. **Preferred:** fetch from the external API with `axios`, then call `POST /api/public/leads` (API key stored in an Environment Variable) for each record. One request does upsert + metadata merge + `workflow_id` enrollment + first contact.
2. **Two-phase effects:** run A calls `upsertLead` with a marker (`source: "crm_sync"`); run B's lookup filters on that marker and calls `assignToWorkflow` / `setLeadStatus` on the now-existing leads. Needed because effects return nothing — a function cannot learn a new lead's id in the same run.

Manual runs always dry-run: candidates found + effects previewed. Read that list before activating anything that messages people. (`assignToWorkflow` starts the target agent's cadence.)

---

## 8. Background jobs (declarative cohort automation)

"Filter leads → condition → action" without code.

- **Triggers:** `trigger_type: "cron"` (five-field expression, evaluated in UTC) or `"event"` with `event_config` — tag events are the reliable event trigger, with match types exact/contains/starts-with/ends-with/regex and `date_in_tag` (extract a date from the tag and act before/after it). Event jobs can be narrowed by source workflow and status.
- **Filters:** `lead_filters` over `lead.email | lead.phone | lead.source | lead.created_at | lead.metadata.<key>` (`eq`, `neq`, `in`, `not_in`, `is_null`, `is_not_null`, `gt`, `lt`, `gte`, `lte`, `contains`); `workflow_filters` (`{never_had_workflow}`, `{has_active_workflow}`, or `[{workflow_id, status_keys}]`); `exclusions: { skip_human_takeover, skip_paused }` (keep both on).
- **Steps (max 3):** `execute_tool` (call an HTTP tool, feed `response.*` into a condition), `condition`, `evaluate_metadata`, `evaluate_field` (over collected workflow fields), `evaluate_tag` (`date_in_tag`, `trigger_when: "future"|"past"`), `action`. Metadata/field operators include `exists`, `equals`, `greater_than`, `less_than`, `date_after_today`, `date_before_today`. **A branch step runs its selected nested action and then ends that lead's chain** — later top-level steps do not resume.
- **Actions:** `send_message` (`channel`, approved `template_name`, `then_status_key` — the send-once mechanism), `set_lead_status`, `assign_workflow`, `workflow_transfer` / `force_transfer`, `enrich_lead` (map values into lead columns or `metadata.<path>`), `deactivate_workflow_run`.
- **Safety:** `max_leads_per_cycle` (cap 500), `cooldown_minutes` (blocks re-acting on the same lead), `lead_concurrency`, `lead_delay_ms`, `dry_run: true` to preview. "Run Now" executes even an inactive job — a successful manual run does not prove the schedule is on.

**Not currently functional — do not design on:** `trigger_type: "api"`, `filter_mode: "workflow_scoped"` (use `lead_scoped` + `workflow_filters`), `rate_limit_per_hour`, the `ai_*` fields, and CRM-event triggers other than tags/payments.

---

## 9. Workflow transfers

The agent-to-agent handoff. Configured as `transfer_config: { "target_workflow_id": "<uuid>", "copy_fields": true }` on a **terminal** status (transfers auto-fire from the terminal-status path; a non-terminal status will not reliably trigger one). The target must belong to the same client and differ from the source workflow. `copy_fields` is accepted by the API but currently inert — the platform always snapshots all source fields into the transfer chain regardless. Cohort-scale transfers use the background-job `workflow_transfer` action; one-off transfers are available via API.

What the platform does on transfer:

1. Cancels the source run's queued cadence and re-contact tasks; deactivates it with outcome `transferred`.
2. Creates a **fresh** run on the target workflow, **always starting at the target's initial status** — `transfer_config` cannot aim at a specific status in another agent (the only status→status pointer is `timeout_config.target_status_key`, same workflow only). Never reactivates an old run, so A→B→A is safe.
3. Reassigns conversation threads so inbound messages route to the new run.
4. Builds a **transfer chain**: a snapshot of the source run's collected fields, accumulated across hops (agent C sees fields from A and B). Fields are **not** copied into the target's own field values — schemas differ by design; the target agent reads the chain.
5. First contact: if the messaging window is open, the target agent composes a contextual AI transition message; otherwise the target's template cascade runs. Never also aim a "welcome" automation at freshly-transferred leads — the handoff already speaks.

Design rules:

- Every hop restarts cadence. If the "transfer" is a stage of the same conversation, it's a status, not a transfer.
- Auto-transfer is skipped while the lead is waiting on a human (support handoff).
- The target agent's prompt should explicitly read the transferred context ("budget and need are in the transfer chain — do not re-ask").

### Boundary shapes: terminal handoff vs pause handoff

An identity switch (tone, persona, goal, tool set, channel mix, contact intensity) is always reached through a status the lead *exits* through. Two supported shapes:

Two conditions are checked *before* `transfer_config` is read, on every path that can fire a transfer (agent messaging, voice, status timeout, document transitions):

1. `is_terminal === true`. A non-terminal status carrying a `transfer_config` saves without error and never fires.
2. The status key is not a **soft terminal** — `future_*`, `contact_later`, or `colder`. These are excluded from the terminal side-effect path entirely, so a correctly terminal status with a valid `transfer_config` still will not transfer if you named it `future_nurture`.

Auto-transfer is additionally skipped while the lead is in human support (`in_support: true`); a manual admin-initiated transfer bypasses that gate.

| | Terminal handoff | Pause handoff |
|---|---|---|
| Status config | `is_terminal: true` + `transfer_config`, key not soft-terminal | `pause_bot: true`, no auto-fire |
| Who executes the transfer | The platform, on entry to the status | You must name it: background-job `workflow_transfer` / `force_transfer`, the one-off transfer API, or a human operator |
| Source run | Deactivated with outcome `transferred` | Stays live but silent until the executor runs |
| Use when | The routing criterion is fully known at the boundary | The handoff needs cohort timing, a human decision, or an external signal that has not arrived yet |

Terminal is the default; reach for the pause shape only when something outside the conversation must decide. A pause boundary without a named executor leaves the lead parked and silent indefinitely — verify the executor moves a test lead before activating. The pause shape is structurally safe: status `pause_bot` does not set `workflow_runs.is_paused`, so a background job carrying the standard `exclusions: { skip_paused: true }` still selects these leads.

Whichever shape, exactly one agent owns a lead at a time, the target starts at its own initial status, and its cadence begins from scratch. Do not attempt an identity switch inside a single agent's prompt: prompt text cannot change the tool set, the channel mix, the cadence, or the pipeline.

### Connection closure for multi-agent builds

Before creation, record every intended handoff as `{ source_agent_ref, source_status_key, target_agent_ref }`. Agent creation order is irrelevant because the connection is written only after the target has a real workflow id. Once all referenced ids exist, iterate the complete manifest and update every source terminal status with `transfer_config.target_workflow_id` set to the exact target id. If a target was created after its source, return to the source and apply the transfer then.

Finalization requires a read-back audit of every involved source agent. For each manifest row, verify that the source status is terminal, has a `transfer_config`, and points to the exact expected target id. Repair and re-read until no expected edge is missing, unresolved, or misdirected. A list of successfully created agents is not proof of a connected system; do not report success or activate it while any expected edge fails this audit.

---

## 10. Cadence: contact windows and outreach intensity

The outreach scheduler is **block-based**, edited in the dashboard's Contact Schedule section: time windows (`blocks[]`) plus per-channel intensity (`dayConfig`). The legacy step sequence (`cadence_steps`) is deprecated — never design on it. Endpoint: `GET/PUT /workflows/:id/block-config` with `{ blocks, dayConfig, timezone }` (public mirror `/api/public/workflows/:id/block-config`); via MCP, `get_workflow_cadence` / `set_workflow_cadence`.

Save semantics: `dayConfig` keys you omit **are preserved** (the server falls back to the existing value, then a default) — but `blocks` are upserted as a document. Always `get_workflow_cadence` first and send the full edited object; that is correct for both halves and is what the tool description requires.

### Windows (`blocks[]`)

`{ "block_index": 0, "label": "Working hours" (required), "start_hour": "09:00", "end_hour": "18:00", "days_of_week": [1,2,3,4,5], "is_enabled": true, "config": {} }` — `days_of_week` uses 0=Sunday…6=Saturday; hours are `"HH:MM"` (a bare `"18"` rejects the whole save, and validation runs before anything is deleted). Windows must not overlap; per-weekday "custom" schedules emit one block per day.

### Intensity (`dayConfig`)

- `max_days` (default 5): how many days the cadence pursues a lead; after that the run goes `colder`.
- `initial_/min_<calls|templates|emails|sms>_per_block` — WhatsApp = `templates`; touches decay linearly from `initial` to `min` across days. Touches interleave round-robin (`WhatsApp → call → WhatsApp → …`) with `template_to_call_delay_minutes` (default 3) between them.
- `daily_template_limit` (1000) / `hourly_template_limit` (100) — WhatsApp templates only.
- New agents use `config.contact_caps_mode: "automatic_v1"`: per-block counters are **ignored** and caps derive from window length (≤4h → 1 touch per channel, ≤6h → 2, longer → 3). An enabled channel never gets a zero cap — turning a channel off is `workflows.config.disabled_channels`, not a zero.

### The channel-hours rule ("WhatsApp 24/7, call only in business hours")

- **Calls are always gated to the block windows** — hard-coded, never 24/7. With no blocks configured, a failsafe window of 09:00–21:00 applies.
- **WhatsApp, email, and SMS run 24/7 by default.** Setting `workflows.config.gate_outbound_to_hours: true` gates them to the windows too — but the flag is **workflow-wide**; per-channel windows are not currently configurable.
- Appointment reminders are never gated (event-anchored).
- **Inbound replies bypass scheduling entirely**: a reply runs the agent immediately and cancels pending cadence (`cadence_state: "responded"`). Windows govern outbound initiative only.

### First contact and recontact

- Fresh runs fire an immediate "hot contact" cascade (default order whatsapp → call → email → sms; `workflows.config.first_contact_channel` picks the opener). The WhatsApp step fires at any hour; the call step waits for a window.
- Recontact (re-engage) is a second scheduler with its own per-workflow policy — `{ max_attempts (1–10, default 3), stale_after_hours (default 4), cooldown_hours (default 24), on_exhausted: "mark_cold" | "pause_run" | "nothing" }` — plus per-status rules (`trigger_status_key`, `channel_override`, `prompt_hint`, one active rule per status). It obeys the same channel-hours rule.

### What is NOT expressible

There is **no weekly frequency cap** — no "email at most N per week" knob exists for any channel. The real caps are per-block intensity, per-day (`max_days`, `daily_template_limit`), per-hour (`hourly_template_limit`), and per-recontact-rule (`max_attempts` + `cooldown_hours`). Approximate weekly-style limits with per-block intensity across `max_days`, or move that channel out of cadence into a background job with `cooldown_minutes`. Never promise a per-week guarantee.

### Timezone

`workflows.timezone` is the single source of truth (default `America/Santiago`). `timing_config.business_hours` is a **derived mirror** of the blocks, recomputed on every save — never present it as hand-editable, and never write it directly.

### Qualification router: fan out by outreach intensity

Use one qualification agent to collect a common set of fields, then create one terminal status per materially different follow-up motion. The source status selects the target; each target workflow owns its prompt, tools, channels, and cadence. The JSON below is valid as a `create_workflow` statuses array (it is also the stored/`update_workflow_status` shape) — the only part that must wait for a follow-up `update_workflow_status` pass is `transfer_config.target_workflow_id` when the target agent does not exist yet.

```json
[
  {
    "key": "qualified_now",
    "label": "Qualified Now",
    "category": "won",
    "is_qualified": true,
    "is_terminal": true,
    "entry_hint": "The lead meets all qualification requirements and wants to act in the current buying window.",
    "variable_refs": ["fit", "timeline", "need"],
    "requires_all_fields": true,
    "required_field_keys": ["fit", "timeline", "need"],
    "transfer_config": { "target_workflow_id": "<high-intensity-sales-agent>" }
  },
  {
    "key": "qualified_later",
    "label": "Qualified for Later",
    "category": "deferred",
    "is_qualified": true,
    "is_terminal": true,
    "entry_hint": "The lead is a fit but their confirmed buying timeline is later; route them to long-term nurture.",
    "variable_refs": ["fit", "timeline", "need"],
    "requires_all_fields": true,
    "required_field_keys": ["fit", "timeline", "need"],
    "transfer_config": { "target_workflow_id": "<low-intensity-nurture-agent>" }
  }
]
```

Keep the `entry_hint` conditions mutually exclusive and exhaustive for the qualified population. Add separate unqualified/discard branches as needed; do not force every lead into one of these two.

Configure the targets independently:

- **High-intensity sales:** use an appointment/sales goal, a prompt focused on acting now, only the tools needed for ownership/availability/booking, and an appropriately intensive block cadence.
- **Low-intensity nurture:** use a nurture-specific prompt, restrict channels to the intended channel mix, and configure a low-frequency recontact rule. For email approximately every two weeks, use `stale_after_hours: 336` and `cooldown_hours: 336`, configure a usable email sender, set `workflows.config.disabled_channels: ["call", "whatsapp", "sms"]` when email must be the only option, and choose `max_attempts` from the campaign horizon. This makes the lead eligible at that spacing; the re-engage decision may still skip a contact. There is no perpetual "twice per month" counter.

Transfers start fresh runs and may produce an immediate contextual handoff before the later cadence begins. If the customer wants no immediate handoff, verify that requirement against the supported transfer behavior instead of assuming the nurture schedule suppresses it. See the worked mapping in [recipes.md](recipes.md#6-route-qualified-leads-into-high-intensity-sales-or-low-intensity-nurture).

---

## 11. Knowledge bases: account catalog and per-agent assignment

Knowledge bases have two distinct scopes:

- `knowledge_bases` is the client/account catalog. A row can exist once and be reused by several agents.
- `workflow_knowledge_bases` is the assignment layer. A runtime agent can retrieve only from the KBs linked to that workflow, ordered by `priority`.

Use the public MCP tools in this order:

1. `list_knowledge_bases({})` inventories every non-archived KB owned by the authenticated client. This establishes what is available, not what any agent can use.
2. Build an exact desired set for each agent using real KB ids. Do not attach every account KB by default. If relevance is ambiguous, resolve it before changing assignments.
3. `list_knowledge_bases({ "workflow_id": "<agent-id>" })` reads the current per-agent assignments and priority order.
4. Call `attach_knowledge_base({ "workflow_id": "<agent-id>", "knowledge_base_id": "<kb-id>", "priority": 1 })` for each missing link. Omit `priority` only when appending is intentional.
5. Call `detach_knowledge_base({ "workflow_id": "<agent-id>", "knowledge_base_id": "<kb-id>" })` for an unexpected link. Detach removes only that agent's access; it does not delete the shared KB or its documents.
6. Repeat the workflow-scoped list and compare exact ids plus priority order with the desired set. Do not report completion until they match.

When the required KB does not exist, create it once at account scope with `create_knowledge_base`, then attach the returned real id to the intended agents. A created KB is not automatically available to an agent. Likewise, seeing a KB in the account-wide list is never proof that an agent can search it.

For a multi-agent build, preserve a knowledge manifest alongside the transfer manifest:

```json
[
  {
    "agent_ref": "qualifier",
    "knowledge_bases": [
      { "knowledge_base_id": "<qualification-faq-id>", "priority": 1 }
    ]
  },
  {
    "agent_ref": "closer",
    "knowledge_bases": [
      { "knowledge_base_id": "<pricing-id>", "priority": 1 },
      { "knowledge_base_id": "<product-id>", "priority": 2 }
    ]
  }
]
```

The final audit is set equality plus order for every agent: no missing KB, no extra KB, no wrong priority. Agent creation order does not affect this contract because assignments happen after real agent and KB ids exist.

## 12. Account channel inventory and agent binding

Never ask the customer to recall configuration that Nexor can read. In the Master Editor, call `inspectAccountChannels` before planning an agent's channels or asking for timezone. Outside that surface, perform the equivalent reads:

| Fact/resource | Source | Usable when | Agent binding |
|---|---|---|---|
| Account timezone | `get_account_readiness.account.timezone` | non-empty IANA timezone | cadence/block config timezone |
| WhatsApp number | `list_whatsapp_numbers.numbers[]` | `status === "active" && is_active !== false && Boolean(business_account_id)` | `assign_whatsapp_to_workflow({ number_id, workflow_id })` |
| Email sender | `list_email_senders.senders[]` | `can_send: true` (`verification_status` alone does not override an explicit `can_send: false`) | `update_workflow_config` with `config.email_sender_id` |
| Call number | `list_phone_numbers.numbers[]` | `is_active: true` and `provision_status !== "released"` | `assign_number_to_workflow({ number_id, workflow_id })` |
| SMS channel | same `list_phone_numbers` row | call-number conditions plus `sms_enabled: true` | `set_number_sms({ number_id, enabled: true, sms_workflow_id })` |

Preserve the returned ids; phone and SMS are two capabilities of the same inventory row, not two unrelated catalogs. Preserve current `workflow_id` / `sms_workflow_id` / WhatsApp `workflow_id` as well. Email senders may be shared by multiple agents. WhatsApp has one direct `workflow_id`, call has one `workflow_id`, and SMS has one independent `sms_workflow_id`; call and SMS on the same physical number may point to different agents. Selecting an exclusive capability already assigned elsewhere is a reassignment.

The Master Editor's `inspectAccountChannels` response normalizes those reads:

```json
{
  "account": { "country": "CL", "timezone": "America/Santiago" },
  "whatsapp": { "available_count": 1, "items": [{ "id": "...", "label": "...", "available": true, "assigned_to": { "workflow_id": "...", "workflow_name": "..." } }], "approved_openers": [{ "id": "...", "name": "intro_v1", "language": "es", "internal_type": "opening", "status": "APPROVED" }] },
  "email": { "available_count": 1, "items": [{ "id": "...", "label": "...", "available": true, "can_send": true }] },
  "phone": { "available_count": 1, "items": [{ "id": "...", "label": "...", "active": true, "assigned_to": null, "sms_enabled": true, "sms_assigned_to": null }] },
  "sms": { "available_count": 1, "items": [{ "id": "...", "label": "Sales · +56…", "phone_number": "+56…", "active": true, "sms_enabled": true, "sms_assigned_to": { "workflow_id": "...", "workflow_name": "..." } }] }
}
```

Selection rules are deterministic:

- **One usable resource:** present two finite choices—use the exact observed number/sender, or configure a new one.
- **Several usable resources:** present every observed resource in a radio/list selector, plus configure a new one. Long lists should be searchable; never ask the customer to type an id or address already returned by the tool.
- **Zero usable resources:** state that none was observed and offer configure now versus continue without that channel. Do not ask whether one exists elsewhere.
- **Saved timezone:** use it by default. Ask for a timezone only when none is stored and local contact hours materially require it, or when the customer explicitly wants a different timezone.

Before mutation, run an account-wide allocation check. No WhatsApp, call, or SMS capability may have two intended direct owners. If a selected exclusive resource already has an owner, the confirmation summary must state its label/id, capability, old agent, new agent, and that inbound routing plus the old agent's direct outbound availability will change. Generic approval does not authorize that disruption. Immediately before each exclusive assignment write, repeat inventory and compare the live owner with the approved old owner. If it changed, abort that write and obtain new targeted approval against the current owner and impact.

When “configure another” is selected, suspend the build until a new real id exists. WhatsApp uses the chat connector and then repeats inventory. Email setup completes on the platform's Email integration surface and resumes only when `can_send: true`. Call/SMS setup completes on the Phone integration surface; provisioning is billable and requires its own action. After the operator returns, repeat inventory and selection—never keep a placeholder id in the manifest.

After workflow creation, apply each selected id and synchronize `config.disabled_channels` plus `first_contact_channel`. Repeat the inventory read and `get_workflow` for every new agent and every displaced existing agent. Disable a lost capability on the displaced agent or assign its separately confirmed replacement. Relationship cleanup uses these exact calls: `assign_whatsapp_to_workflow({ number_id })` omits the optional `workflow_id` to unbind; `update_workflow_config({ workflow_id, config: { email_sender_id: null } })` explicitly clears email (omitting the key in a merge preserves the stale sender); `set_number_sms({ number_id, enabled: true })` omits the optional `sms_workflow_id` when SMS should stay enabled but unowned; `assign_number_to_workflow({ number_id })` omits the optional `workflow_id` and makes call routing client-scoped, so use it only when that account-wide impact was explicitly approved. Completion requires exact binding and config equality for every requested channel. Enabling a channel in cadence without assigning a usable sender/number does not satisfy the manifest.

For WhatsApp outreach, `inspectAccountChannels.whatsapp.approved_openers` is the executable prerequisite inventory. It contains only `list_whatsapp_templates({ status: "APPROVED" })` rows whose `internal_type` is `greeting`, `opening`, `legacy_greeting`, or `outbound`. Require at least one real template id/name, configure the workflow's opening intent with `set_opening_templates({ workflow_id, mode, template_names })`, and read it back with `get_template_pool({ workflow_id })`. Activation is blocked until the selected opener remains approved and the observed opening pool matches.
