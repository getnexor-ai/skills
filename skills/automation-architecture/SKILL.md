---
name: automation-architecture
description: Map plain-language Nexor requirements to exact configuration and build it through Nexor MCP tools. Covers arbitrary lead metadata, notifications, CRM sync, field/status events, qualification gates, workflow tools and hooks, webhooks, jobs, cloud/scheduled functions, cadence, channel and knowledge-base assignment, multi-agent systems, and transfers. Use when a customer asks how an agent can receive or use custom lead information, describes custom behavior, an integration, routing, or a multi-agent build. Discover account configuration before questions, decompose variables, stages, and boundaries, require plan review and sign-off before mutation, prefer deterministic primitives, and read back every expected channel, connection, and knowledge assignment regardless of creation order.
---

# Automation architecture

## Goal

Turn a customer use case into an exact, minimal Nexor configuration: named primitives with concrete field values, connected end to end. The deliverable is a configuration, not a recommendation.

## The three laws of decomposition

Apply these before choosing any primitive. They are not style preferences: each names the only shape the platform can gate, trigger, template, or verify. A design that breaks one is unreliable even when it demos correctly, because the platform cannot see the part that lives in prose.

### Law 1 — every piece of information the system needs is a variable

If the build depends on knowing something, it exists as a named workflow field or as lead `metadata`. Never as prose in a prompt, never as "the agent will remember it from the conversation."

- The agent must obtain it → workflow field, `required: true`, with `extraction_hints`.
- An external system supplies lead identity/contact information → write `first_name`, `last_name`, `email`, and `phone` through the standard lead create/update contract. Never hide those values in metadata; metadata does not change Nexor's contact destinations.
- An external system supplies other contextual information → put it directly in the lead's `metadata` JSON object. Keys may hold strings, numbers, booleans, null, arrays, or nested objects; the complete metadata object is injected into the next runtime agent prompt, so the agent can access every parameter and value without one field per key.
- The agent must ask for, validate, normalize, or gate on externally supplied information → add a workflow field with `metadata_key` (and `intake_value_map` when needed) so metadata pre-fills the field instead of being asked. **`metadata_key`, `options`, `extraction_hints`, and `validation` can only be written in the initial `create_workflow` call** — `update_workflow_structure` accepts just `key`, `label`, `type`, `required`, `sort_order`. Finish the variable ledger before creating the agent.
- A tool produces it → `llm_response_fields` keeps it in the turn; a post-tool hook writes it to metadata when a later step needs it.
- **Gates read fields only.** `required_field_keys`, `requires_all_fields`, and `transition_rules` cannot see metadata.
- **Deterministic senders read metadata only.** Status-automation `args_template`, webhook `payload_template`, and HTTP tool templates address `{{lead.<path>}}` / `{{lead.metadata.<key>}}` and cannot read collected field values. Anything an automation must transmit must be mirrored into metadata (post-tool hook or `patch_metadata`) before the lead can reach the triggering status. The full reader/store matrix is in [references/configuration-reference.md](references/configuration-reference.md#which-reader-can-see-which-store).

For every fact the design uses, name its key and its store. A fact that lives only in conversation history cannot gate a status, route a lead, fill a request body, or filter a job.

### Law 2 — every state change inside one agent is a status

If the agent's behavior, permissions, or obligations change at some moment, that moment is a status in that agent's pipeline. Never a "phase" described in the prompt, never a boolean parked in metadata.

Statuses are the only handle the rest of the platform can grab. A stage that is not a status is invisible to `workflow_tools.available_in_statuses`, `status_automations.on_status_key`, webhook filters on `to_status.key`, `timeout_config`, `transition_rules` / `required_field_keys`, background-job `workflow_filters.status_keys`, recontact `trigger_status_key`, and `assignment_config`.

Give each stage a `key`, a `label`, an `entry_hint` stating its entry criterion in terms of Law 1 variables, and an explicit gate. When field values fully determine the move, add `transition_rules.rule_groups` with `auto_evaluate: true` so the platform advances the lead instead of depending on the agent calling `set_lead_status`.

Express every gate as `required_field_keys` (or `requires_all_fields`) plus `transition_rules`. **`variable_refs` is not writable through MCP** — it is a dashboard display hint, so a design that relies on it has no gate at all. `review_agent_system_plan` enforces this law for you: any non-initial status with neither `entry_hint` nor `transition_rules` comes back as a clarification question.

### Law 3 — every switch of agent identity happens at a boundary status that transfers

Changing tone, persona, goal, prompt content, tool set, channel mix, or contact intensity means a different agent. The switch is never made inside a prompt. It is made by a boundary status the lead exits through:

- **Terminal handoff (default):** `is_terminal: true` plus `transfer_config: { "target_workflow_id": "<real id>" }`. This is the only shape that auto-fires a transfer. Every agent path checks `is_terminal` before reading `transfer_config`, so **a non-terminal status with a `transfer_config` never fires** — the config saves cleanly and silently does nothing.
- **Never name a boundary status `future_*`, `contact_later`, or `colder`.** Those keys are treated as soft terminals and are excluded from the terminal side-effect path *before* `transfer_config` is read, so the transfer is skipped even on a correctly terminal status. This is the most silent failure in the whole surface.
- **Pause boundary:** `pause_bot: true` when the handoff is executed out of band — a background job's `workflow_transfer` / `force_transfer` action, the one-off transfer API, or a human. A pause boundary must name its executor or the lead sits silent forever. It is safe to build on: `pause_bot` is a *status* flag and does not set `workflow_runs.is_paused`, so a job with the standard `exclusions.skip_paused: true` still picks these leads up.

Either shape ends the source agent's ownership at the boundary: exactly one agent is live per lead. The target always starts at its own initial status, its cadence starts over, and the source's collected fields travel as a read-only transfer-chain snapshot.

Forbidden shapes: a prompt that says "once qualified, switch to a closing tone"; a tool whose purpose is to change the agent's persona; two agents live on the same lead; a transfer aimed at a specific status inside the target.

### Law 2 or Law 3?

Same goal, same persona, same tool set, same cadence — only more known about the lead → **status**. Different goal, prompt, tools, channels, or contact intensity → **new agent behind a boundary status**. If two candidate agents would share ~80% of prompt, tools, and schedule, collapse them into one agent with more statuses.

## The primitives

Everything a customer asks for lands on one or more of these:

| # | Primitive | Trigger | Code? | Scope |
|---|-----------|---------|-------|-------|
| 1 | Agent config (statuses + intake fields) | Lead's message, mid-conversation | No | One lead, in-turn |
| 2 | Workflow HTTP/MCP tool | Agent needs external information or action during its turn | No | One lead, synchronous |
| 3 | Rules (reminders / host notifications / recontact) | Meeting lifecycle, staleness | No | One lead |
| 4 | Outbound webhook | Platform event (status change, meeting lifecycle) | No | Notify an external system, every occurrence |
| 5 | Status automation | Lead reaches a specific status | No | Call one HTTP/MCP tool, exactly once per lead |
| 6 | Background job | `cron` or tag event | No | Filtered cohort, declarative steps |
| 7 | Cloud function | A `lead.*` / `workflow.*` / `meeting.*` event | JS | One lead per event |
| 8 | Scheduled function | Cron + timezone | JS | Cohort from a lookup query |
| 9 | Workflow transfer | Terminal status with `transfer_config` | No | One lead, agent-to-agent handoff |
| 10 | Intake API / inbound webhook | External system pushes a lead in | No | Lead creation + enrollment |
| 11 | Cadence config (contact blocks + day config) | Outreach scheduling: windows, per-channel intensity, hot contact | No | A workflow's entire outbound initiative |
| 12 | Knowledge-base assignment | Agent needs selected account-owned knowledge at runtime | No | Exact per-agent subset, ordered by retrieval priority |
| 13 | Pre-execution hook (tool with `mode: "on_entry"`) | Lead enters the workflow, before the first agent message | No | One lead, deterministic, cannot be stage-gated |
| 14 | Pre-processor | Inbound lead arrives, before any agent owns it | No | Ordered condition rules choosing the entry workflow |

## Decision ladder — config beats code

Config is operator-visible, editable in the UI, and cannot crash; code is invisible to operators and yours to maintain forever. Walk the ladder top-down and stop at the first rung that expresses the requirement.

1. **Can native conversation config express it?** A status, intake field, prompt rule, or deterministic branch → agent config. "Ask for X and branch on it" is statuses + fields, not code. Laws 1 and 2 have usually already placed most of this rung.
2. **Is it a standard lifecycle nudge?** Booking confirmations, pre-meeting reminders, host notifications, stale-lead recontact → rules. Configure and stop.
3. **Can a state change define exactly when it should happen?** Prefer deterministic execution over asking the model to choose a tool. Status change → filtered outbound webhook when the receiver can act from the event, or status automation when Nexor must call a configured endpoint once with a custom body. Field/variable or other lead event → trigger cloud function (`information.collected`, `information.updated`, `lead.updated`, or the narrowest supported event) guarded to the relevant key/change.
4. **Must the result exist before the agent's first message?** → pre-execution hook: `set_workflow_tool_execution({ mode: "on_entry" })`. The platform runs the tool the moment the lead enters the workflow, before the agent speaks, with no model decision involved. This is the right shape for enrichment, eligibility lookups, and account context — and for a transfer *target* that needs data ready on arrival. It cannot be stage-gated (the two modes are mutually exclusive), so use it only when "on entry" really is the moment.
5. **Does the agent genuinely need an external result before it can continue the active turn, with no state event that can run it first?** Expose the client endpoint as a workflow HTTP/MCP tool in `mode: "agent_decides"`. This is the least reliable rung because the model must select and call it. Keep client-specific logic in the client's system, make the contract narrow, and gate it with `available_in_statuses` when valid only after a stage such as `qualified`.
6. **Is it "filter leads → condition → action"?** → background job with declarative steps and actions. Always set `max_leads_per_cycle` and `cooldown_minutes`; dry-run anything that messages humans.
7. **Does asynchronous work need custom logic or an external API the job vocabulary can't express?** Trigger grammar routes it: "*when* a lead …" → cloud function (event, one lead). "*every* morning / Monday …" → scheduled function (cron, cohort). A "when" that tolerates hours of latency across many leads → prefer the scheduled sweep (its dry run shows the whole cohort first).
8. **Does the lead need a fundamentally different conversation or outreach intensity?** Goal, persona, cadence, channel mix, or tool set changes → workflow transfer from a boundary status (Law 3). A qualification agent can fan out through terminal statuses such as `qualified_now` and `qualified_later`, each with its own `transfer_config`; the targets own the high-intensity sales or low-frequency nurture behavior. If both targets would share 80% of their prompt, tools, and schedule, keep one agent with more statuses.

## Integration and client-owned capabilities

When the requirement is *integration* — moving data between Nexor and another system — resolve **direction** (into Nexor / out of Nexor) and **cadence** before choosing a surface; those two pick the primitive. Treat the client's endpoint as the capability and Nexor as the orchestrator: keep the authoritative business decision (round-robin, territory, eligibility, pricing) behind the endpoint, wire a deterministic trigger to call it whenever a status/field/lead event defines the moment, and reach for an agent-callable tool only when the active turn genuinely needs the result before continuing. Functions (editable JavaScript with `axios`) are the fully flexible path in both directions.

Read [references/integration.md](references/integration.md) for the direction/cadence trigger table, the inbound-key classification (identity columns vs metadata vs `metadata_key` bridge), and the six-step client-endpoint contract before configuring any sync.

## Workflow

1. Restate the ask as **trigger → condition → action**, resolve sync direction as **into Nexor / out of Nexor** before choosing a surface, classify its timing as **in-turn / event / batch / inbound**, and separate what the agent must **ask** (intake fields), what the customer's systems **send** (standard lead identity columns versus metadata), and what must **happen** (tool call or automation).
2. Apply the three laws to draft the skeleton before choosing any primitive: list every fact the design needs as a named variable with its store and its readers (Law 1); list every in-agent stage as a status key with its entry criterion and gate (Law 2); list every identity switch as a boundary status with its shape, target agent, and — for a pause boundary — its executor (Law 3). Anything you cannot place in one of those three lists is not designed yet; place it before continuing.
3. Call `describe_agent_configuration` before proposing any non-trivial or multi-agent build, and read current state with `list_workflows` / `get_workflow` / `list_workflow_tools` / `list_webhooks`. The platform ships its own required process and surface map; follow it rather than a remembered one.
4. Walk the ladder. Note every rung you skip and why — that reasoning is part of the deliverable.
5. Prefer a deterministic state trigger. For a status change choose webhook/status automation first; for a field/variable or other lead event choose a cloud function. Use an in-turn tool only when the agent must receive the result before continuing, then gate it to the statuses where it is valid.
6. Read [references/recipes.md](references/recipes.md) and start from the closest worked mapping; read [references/configuration-reference.md](references/configuration-reference.md) to fill in exact field names and values for the chosen primitives; read [references/mcp-tool-surface.md](references/mcp-tool-surface.md) before the first write.
7. Before asking the customer about timezone or channels, call `inspectAccountChannels` (or, outside the Master Editor, `get_account_readiness` plus `list_whatsapp_numbers`, `list_email_senders`, and `list_phone_numbers`). Treat SMS as the active phone-number rows with `sms_enabled: true`. Account facts are evidence, not clarification prompts: never ask whether the customer already has a WhatsApp number, email sender, call number, SMS channel, or saved timezone.
8. Write an expected channel manifest per agent: enabled channel + the exact selected resource id for WhatsApp, email, call, and SMS, each with its current owner. Email senders are shareable; a WhatsApp number, a call number (`workflow_id`), and an SMS route (`sms_workflow_id`) each have one exclusive owner (call and SMS may legitimately route the same physical number to different agents). Resolve duplicate exclusive claims across the plan before mutation. Offer observed resources as finite choices — one → use-it-or-configure-another; several → a real selector plus the new-resource path; none → an explicit setup-or-omit decision — never an open-text question.
9. **Preflight the whole system with `review_agent_system_plan({ plan })` before mutating anything**, expressing handoffs as `transfer_to_agent_ref` between plan-local agent refs. Resolve every `blocking_issue` and `clarification_question` until `ready_for_signoff` is true, then show the returned summary and ask the exact `signoff_prompt` question. Do not call any create/update/run tool until the user approves the `plan_fingerprint`.
10. Mutate in dependency order so nothing references an id or key that does not exist yet: `create_workflow` (statuses + the **complete** fields array — most field properties cannot be added later) → `update_workflow_status` for gates, hints and timeouts → workflow tools → `update_workflow_config` for status automations → webhooks and rules → channel bindings → transfers → knowledge-base attachments. Agents are created paused; keep them paused through the whole build. See [references/mcp-tool-surface.md](references/mcp-tool-surface.md) for the exact tool per step and what each write overwrites.
11. Write an expected knowledge manifest per agent: inventory the account catalog with `list_knowledge_bases` **without** `workflow_id`, then list the exact account-owned KB ids/names each agent should use and their retrieval order. Account ownership is availability, not assignment — infer relevance only when the KB description and agent responsibility make it unambiguous, and never attach every KB by default.
12. For a multi-agent design, write an expected connection manifest independent of creation order: one row per handoff with `source_agent_ref`, `source_status_key`, `boundary_shape` (terminal transfer, or pause + executor), and `target_agent_ref`.
13. After every involved agent has a real id, reconcile all three manifests and read every one back. **Channels:** write `config.email_sender_id`, `assign_whatsapp_to_workflow`, `assign_number_to_workflow`, `set_number_sms`; sync `config.disabled_channels`; keep `first_contact_channel` on an enabled usable channel. Never steal a bound number without approval naming the resource, capability, old owner, new owner, and routing impact (handle every displaced agent). **Transfers:** write each source status's `transfer_config` with the destination's real id, returning to earlier-created sources as later targets appear. **Knowledge:** attach missing and detach extra KBs (the relationship only — never delete the client-owned KB). Repair and re-read until there are zero missing, misdirected, or extra channels, connections, and assignments; do not finalize, report success, or activate while any manifest is incomplete.
14. Produce the configuration spec (see Output).
15. State the verification path: which previews/dry runs, channel/connection/KB read-backs, and blocked/allowed tool tests to perform, and what they must show, before anything is activated.

## Facts that decide designs

The three laws above carry the compressed versions of the load-bearing semantics, but the platform has ~20 specific behaviors that customers and naive designs get wrong — each a place where a config that demos correctly still fails silently. The highest-consequence ones:

- **The agent routes on `entry_hint`, not `description`** — a status `description` never reaches the prompt; encode a field-determined branch as `transition_rules.rule_groups` with `auto_evaluate: true`.
- **Transfers fire only from hard-terminal statuses** — `is_terminal` is read before `transfer_config`, and soft-terminal keys (`future_*`, `contact_later`, `colder`) plus `in_support` are filtered out first; either mistake saves cleanly and never fires.
- **Deterministic triggers beat model-selected tools** — if "when" is a status/field/lead/meeting event, let the platform fire the integration; tool descriptions can be skipped, subscriptions cannot.
- **Three unrelated things are called "paused"** — `workflows.is_paused` (agent off), `workflow_runs.is_paused` (one run), and status `pause_bot` (agent quiet) do not imply each other.

Read [references/semantics.md](references/semantics.md) for the full catalog — gates vs marks, channel-hour flags, discard/`lost` behavior, metadata-vs-intake, the two shapes of "notify me", account-order-never-satisfies-a-connection, account-channels-are-not-questions, buffered function effects, send-once state, on-entry hooks, and status-automation config semantics — before writing gates, transfers, channels, or automations.

## Guardrails

- Never mutate before `review_agent_system_plan` returns `ready_for_signoff: true` **and** the user approves the returned `plan_fingerprint`. Agents are created paused; keep them paused until read-back passes and activation is confirmed separately.
- Know what each write destroys before sending it. `set_workflow_prompt` overwrites the whole prompt, `update_workflow_config` replaces any array you touch, `set_workflow_cadence` is a whole-document PUT for blocks, and `update_workflow_config({ replace: true })` wipes the config bag. Read the current value first — see [references/mcp-tool-surface.md](references/mcp-tool-surface.md#3-merge-replace-and-destroy-semantics).
- Reject any design that breaks a law and fix its shape rather than compensating with prompt wording. Name the violated law: a needed fact carried only in prompt prose or conversation history (Law 1); a stage change with no status key (Law 2); a tone, persona, or tool-set switch that is not a boundary status with a named target agent (Law 3). Prompt text is speech; fields, statuses, and transfers are structure — only structure is enforced.
- A pause boundary with no named executor is an unfinished transfer. Either make the boundary terminal with `transfer_config`, or state the job/API/human that performs the handoff and verify it moves a test lead.
- Never make a fact reachable in only one store when both a gate and an automation need it. If a status gates on `field_x` and an `args_template` must send it, the value must exist as a field *and* in metadata before the lead reaches that status.
- Dry-run first for anything that messages humans or mutates many leads, and read the candidate list before activating. Manual function runs preview effects without applying them — but outbound HTTP in a dry run is **real**; point test runs at test endpoints.
- Get explicit customer confirmation before activating any cohort automation or anything that sends messages.
- Make side-effecting tools idempotent and return a persistent external operation ID. Set `call_once` where a second successful call would be wrong, and define what the agent says when the endpoint times out or fails.
- For every proposed agent tool, state why a webhook, status automation, or event cloud function cannot provide the same behavior. If no immediate conversational dependency exists, replace the tool with the deterministic mechanism.
- Test every stage-gated tool twice: a call before the allowed status must return `tool_not_available_in_stage`, and the same valid call after qualification must reach the endpoint. Do not rely on prompt wording as the gate.
- Do not design on unsupported surface: API-triggered background jobs, `workflow_scoped` filter mode, and CRM-event job triggers (other than tag and payment events) are not currently functional — see the reference for the supported list.
- Never place credentials in function code or tool config; store them as Environment Variables and reference `env.KEY` / `{{env.KEY}}`.
- If the requirement genuinely fits no primitive, say exactly what is missing instead of forcing an approximation.
- Treat multi-agent finalization as graph closure, not agent-count completion. If any expected transfer is missing, unresolved, attached to the wrong source status, or points to the wrong target id, report the build as incomplete and continue reconciliation or surface the exact failed edge. Never emit a success claim for a partially connected system.
- Treat knowledge configuration as assignment closure. Compare each agent's observed KB ids and priority order with its expected manifest; attach missing links and detach extra links, then read back again. Never infer access from the account catalog, and never claim an agent is fully configured while its KB set differs from the plan.
- Treat channel configuration as assignment closure. Compare every requested channel and selected resource id with the post-build account inventory and workflow config. Never infer a binding from “channel enabled,” never reassign an already-bound number without targeted confirmation, and re-read the exclusive owner immediately before the write so stale approval cannot move a resource from a different incumbent. Never claim completion while a selected sender/number is missing, unusable, bound to the wrong agent, disabled by config, or contradicted by `first_contact_channel`. If WhatsApp will initiate outreach, list an `APPROVED` greeting/opening/legacy_greeting/outbound template, configure it with `set_opening_templates`, and read it back with `get_template_pool` before activation.

## Output

Produce a configuration spec containing:

- A **variable ledger** (Law 1): every fact the design needs, its `key`, its store (workflow field / metadata / both), how it is obtained (agent asks, intake payload, tool response), and what reads it (gate, template, filter, prompt).
- A **stage ledger** (Law 2): every status key per agent with its `entry_hint` criterion, its gate (`required_field_keys` / `transition_rules`), and what entering it unlocks or fires.
- Each primitive used: its name, its trigger, and the exact configuration (JSON snippets with real field names from the reference).
- For every workflow HTTP/MCP tool: endpoint owner, input/output schema, `available_in_statuses`, `call_once`, response fields stored or shown to the agent, prompt invocation rule, and failure behavior.
- For every integration action: explain why its invocation is deterministic, or explicitly justify why an agent-selected tool is unavoidable and accept the lower reliability.
- For every transfer branch: define its source status criterion and target workflow, then specify the target's goal, prompt focus, tools, channels, contact cadence/recontact rule, and transferred fields it must not ask for again.
- A connection manifest for every multi-agent system (Law 3): each edge's source agent, source boundary status, boundary shape (terminal transfer, or pause plus its named executor), and target agent — followed by observed read-back evidence for each edge (`source agent + source status → target agent id`). The order agents were created must not affect this list.
- A knowledge manifest for every created or edited agent, followed by observed read-back evidence for the exact assigned KB ids/names and priority order. Distinguish account-owned availability from per-agent access.
- A channel manifest for every created or edited agent, followed by observed read-back evidence for the exact WhatsApp number, email sender, call number, and SMS number ids selected and assigned. Distinguish account availability from per-agent binding and call out any reassignment explicitly.
- How the pieces connect (e.g. "field `salary` → status `low_income` via `entry_hint` → `transfer_config` → agent B").
- The ladder rungs you rejected and why, in one line each.
- A verification checklist: the previews/dry runs to perform and the observable result that means "safe to activate."

## Resources

- Read [references/semantics.md](references/semantics.md) for the full catalog of platform behaviors that decide designs — read it while drafting any non-trivial build and before writing gates, transfers, channels, or automations.
- Read [references/integration.md](references/integration.md) when the ask is a sync/integration: the direction/cadence trigger table, inbound-key classification, and the client-endpoint contract.
- Read [references/recipes.md](references/recipes.md) when matching a customer ask to a known pattern — start from the closest recipe.
- Read [references/configuration-reference.md](references/configuration-reference.md) when writing the concrete configuration for any primitive.
- Read [references/mcp-tool-surface.md](references/mcp-tool-surface.md) before the first write: which tool writes what, its read-back pair, what it overwrites, and which properties MCP cannot reach at all.
