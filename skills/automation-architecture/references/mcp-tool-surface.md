# MCP tool surface: how configuration actually gets written

The tool definitions in your context are the authority on **arguments**. This file is the authority on **sequence, reachability, and blast radius** — what to call in what order, what each write silently overwrites, and which parts of the configuration surface cannot be reached through MCP at all.

Read [configuration-reference.md](configuration-reference.md) for what the payloads *mean*. Read this for how to write them without destroying something.

## Contents

1. [The mandatory build protocol](#1-the-mandatory-build-protocol)
2. [Write tool → read-back tool](#2-write-tool--read-back-tool)
3. [Merge, replace, and destroy semantics](#3-merge-replace-and-destroy-semantics)
4. [What MCP cannot reach](#4-what-mcp-cannot-reach)
5. [Naming traps](#5-naming-traps)
6. [The verification surface](#6-the-verification-surface)

---

## 1. The mandatory build protocol

The platform ships its own required process, returned by `describe_agent_configuration`. It is not optional and it is not advice — `review_agent_system_plan` returns a `signoff_prompt` that explicitly instructs you not to mutate anything until the user approves a fingerprint.

1. **`describe_agent_configuration`** — call before proposing any non-trivial or multi-agent build. Returns the current canonical surface map, clarification checklist, and required process.
2. **Read current state** — `list_workflows`, `get_workflow`, `list_workflow_tools`, `list_knowledge_bases`, `list_webhooks`, `get_workflow_cadence`.
3. **`review_agent_system_plan({ plan })`** — preflight the whole system before mutating. It validates the plan and returns `ready_for_signoff`, `blocking_issues`, `clarification_questions`, and a stable `plan_fingerprint`.
4. **Get explicit user approval of the fingerprint.** Show the returned summary verbatim and ask the exact `signoff_prompt` question.
5. **Create paused, configure, read back.** `create_workflow` always creates a PAUSED workflow — that is the safety property the whole protocol rests on. Do not activate as part of the build.
6. **`set_workflow_active`** only after read-back and a separate confirmation.

### The plan shape `review_agent_system_plan` validates

```json
{
  "agents": [{
    "ref": "qualifier",
    "name": "Qualification agent",
    "goal_type": "qualification",
    "primary_responsibility": "One sentence. Missing → clarification question.",
    "language": "es",
    "timezone": "America/Santiago",
    "channels": ["whatsapp", "email"],
    "statuses": [
      { "key": "new", "is_initial": true },
      { "key": "qualified_now", "entry_hint": "…", "transfer_to_agent_ref": "closer" }
    ],
    "tools": [], "pre_execution_hooks": [], "activate": false
  }],
  "status_webhooks": [{ "agent_ref": "qualifier", "status_key": "qualified_now", "url": "https://…" }],
  "cloud_functions": [], "scheduled_functions": [], "background_jobs": [],
  "open_questions": ["Anything you are assuming — these surface as clarifications."]
}
```

**This is the native form of the Law 3 connection manifest.** `transfer_to_agent_ref` is validated against the set of defined agent refs, so a handoff pointing at an agent that does not exist in the plan is a *blocking* issue before anything is created. Use agent refs here; real `target_workflow_id`s only exist after creation.

What the validator blocks: missing `name` / `goal_type`, zero statuses, duplicate agent refs or status keys, a status with no key, a `transfer_to_agent_ref` that matches no agent, a `status_webhook` with no valid `agent_ref` / `status_key`.

What it raises as a clarification (also blocks `ready_for_signoff`): missing `primary_responsibility`, `language`, `timezone`, `channels`, or a non-initial status with neither `entry_hint` nor `transition_rules` — i.e. **the validator enforces Law 2's "every stage needs an entry criterion" for you.**

What it warns about: `activate: true` on any agent, and the presence of functions (their test runs make real external HTTP calls).

---

## 2. Write tool → read-back tool

Every write below has a paired read. A configuration is not done when the write returns 200; it is done when the read shows the intended value.

| Concern | Write | Read back with |
|---|---|---|
| Agent name, description, objective, identity, group | `update_workflow` — accepts `name`, `description`, `goal_statement`, `language`, `timezone`, `region_style`, `agent_name`, `agent_role`, `company_name`, `begin_message`, `master_workflow_id`; every call must carry at least one. **Verified, not echoed:** the response carries the persisted `identity` read-back and `verified_fields`; a field the store did not keep fails with `CONFLICT` / `FIELDS_NOT_PERSISTED` naming it — never report that field as updated. `null` / non-string identity values are rejected `INVALID_INPUT` (they used to be silently dropped); to clear `region_style` send `''` | `get_workflow` |
| Pause state | `set_workflow_active` — **not** an `update_workflow` parameter | `list_workflows` |
| Agent rename | `update_workflow({ name })` | `get_workflow`, `list_workflows` |
| Agent-group membership | `update_workflow({ master_workflow_id })`; `null` unassigns | `list_agent_groups`, `list_workflows` |
| Channels | channel-binding tools + `config.disabled_channels` — **not** parameters of `update_workflow` (see §4) | `get_workflow`, channel inventory tools |
| iMessage number → agent | `assign_imessage_to_workflow({ number_id, workflow_id })`; omit `workflow_id` to unbind (one iMessage number per agent **group** — siblings under the same `master_workflow_id` share it like WhatsApp; read `owner` + `sharedWith` before re-assigning) | `list_imessage_numbers`, `get_imessage_number` |
| iMessage display identity (name + photo leads see) | `set_imessage_display_name({ number_id, first_name?, last_name? })`, `set_imessage_profile_photo({ number_id, image_url })` — once set by hand the name no longer follows the agent persona | `get_imessage_number` |
| Buy an iMessage number (**charges $350, full first month today, never prorated**) | `get_imessage_offer` → explicit confirmation → `provision_imessage_number({ accept_charge: true })` | `list_imessage_numbers` (poll to `setupStatus: ready`) |
| Agent/workflow deletion | `delete_workflow` — first call without `confirm:true` for a write-free preview; repeat with `confirm:true` after explicit approval. Archives the agent and releases its channels. **Refuses with HTTP 409 `AGENT_HAS_LEADS` (with distinct `lead_count`) when the agent still holds active leads in its pipeline** (at least one active `workflow_run`) | `list_workflows` (the agent is gone/archived) |
| Agent-group create/rename/delete | `create_agent_group`, `update_agent_group`, `delete_agent_group` | `list_agent_groups`, `list_workflows` |
| Un-archive an agent | `restore_workflow` — inverse of `delete_workflow`; the agent comes back **paused** with its channels detached (they were released on archive). Find it first with `list_workflows({ include_archived: true })` — archived rows carry `archived: true` + `deleted_at` | `list_workflows`, `get_workflow` |
| Payment link (goal `payment_link`) | `set_payment_link` — `source: 'fixed'` (+`url`, optional `label`), `'tool'` (+`tool`, optional `capture` dot-path), `'lead'` (+`metadata_key`) or `'none'` to clear. Validated per source and read back; **never hand-write `config.payment_link` through `update_workflow_config`** (any shape merges "successfully" there but is never read). Writing the URL inside the prompt does NOT configure it | `get_workflow` (`config.payment_link`) |
| Reversible lead archive | `delete_lead` / `bulk_archive_leads` under `leads:write`; clarify ambiguous delete requests before choosing archive | `get_lead` / `get_leads` |
| Permanent lead deletion | `hard_delete_lead` / `bulk_hard_delete_leads` under separately granted `leads:delete`; first call without `confirm:true` for a write-free exact-id preview, repeat with `confirm:true` only after explicit approval | Success response plus the backend forensic audit |

Deleting an agent group is relationship-only: it removes the group and clears each member's group assignment. It must never pause, archive, soft-delete, hard-delete, or reconfigure a member agent. Read back both groups and workflows and verify that every former member still exists with `master_workflow_id: null`.

| Opening (first) message per channel | `set_opening_message` — `channel:'call'` → `message` (spoken opening line; `''` restores the language default), `agent_speaks_first` (default true), `silence_ms` (1000–30000 when the lead speaks first); `channel:'email'` → fixed first `subject` + `body` (`enabled:false` + empty removes it); `channel:'webchat'` → widget `message`; `channel:'sms'` → fixed first outbound SMS `message` (a legally required STOP notice is still appended for US numbers); `channel:'messenger'` → fixed first reply `message` in a new Messenger conversation. `''` clears any of them so the agent composes from the prompt. `create_workflow` also takes `begin_message` so a call agent is born with its opener. WhatsApp openers stay approved templates (`set_opening_templates`) because Meta must approve the text | `get_workflow` → `opening_messages.{call,email,webchat,sms,messenger}` |
| Base prompt | `set_workflow_prompt` — returns `{ status: "saved", prompt_length }` **only** when the backend proves the stored length matches what was sent; otherwise it fails `CONFLICT` / `PROMPT_NOT_SAVED`. A prompt is written only when you see `saved` | `get_workflow`, `get_workflow_prompt_history` |
| Per-channel prompt | `set_channel_prompt` | `get_workflow` |
| Create the agent + skeleton statuses + fields | `create_workflow` | `get_workflow` |
| Add/edit statuses & fields (upsert, never deletes) | `update_workflow_structure` | `get_workflow` |
| Reorder every status after the protected semantic head | `reorder_workflow_statuses` with the complete persisted tail | `get_workflow` |
| **Per-status gates, hints, transfers, timeouts, pause** | `update_workflow_status` | `get_workflow` |
| Delete a status | `delete_workflow_status` (after `get_pipeline_impact`) | `get_workflow` |
| Workflow-scoped HTTP tool | `create_workflow_tool` / `update_workflow_tool` | `list_workflow_tools` |
| Reusable customer API tool | `configure_customer_api_tool` or `create_client_tool` + `assign_tool_to_workflow` | `list_client_tools`, `list_workflow_tools` |
| Tool execution mode (hook vs conversational) | `set_workflow_tool_execution` | `list_workflow_tools` |
| Tool stage gate only | `set_tool_stage_gate` | `list_workflow_tools` |
| `config` bag — incl. **`status_automations`**, `gate_outbound_to_hours`, `disabled_channels` | `update_workflow_config` | `get_workflow` |
| Cadence windows and intensity | `set_workflow_cadence` | `get_workflow_cadence` |
| Re-contact reasons (qualification / futurology) | `set_workflow_qualification` | `get_workflow_qualification` |
| Status-scoped webhook | `configure_status_webhook` | `list_webhooks`, `get_webhook` |
| General event webhook | `create_webhook` / `update_webhook` | `list_webhooks` |
| Reminders / host notifications / recontact | `set_reminder_rule`, `set_host_reminder_rule`, `set_recontact_rule` | `list_reminder_rules`, `list_host_reminder_rules`, `list_recontact_rules` |
| Status timeout | `set_status_timeout_rule` | `list_status_timeout_rules` |
| Knowledge assignment | `attach_knowledge_base` / `detach_knowledge_base` | `list_knowledge_bases({ workflow_id })` |
| Cohort automation | `create_background_job` / `update_background_job` | `get_background_job` |
| Event-driven JS | `create_cloud_function` | `get_cloud_function` |
| Cron JS | `create_scheduled_function` | `get_scheduled_function` |
| Secrets | `set_function_environment_variable` | `list_function_environment_variables` |
| Inbound lead routing (pre-agent) | `set_processor`, `set_processor_rule` | `list_processors`, `get_processor` |
| Go live | `set_workflow_active` | `list_workflows` |

**`status_automations` has no dedicated tool.** It lives in the workflow `config` bag and is written with `update_workflow_config({ workflow_id, config: { status_automations: [...] } })`. Because that call merges top-level keys, you must send the *entire* `status_automations` array every time — the array itself is replaced wholesale, not merged element-by-element. Read `get_workflow` first and append to the existing array.

### Correct build order

`create_workflow` accepts the full funnel inline — statuses carry the complete stage config (`entry_hint`, `category`, `color`, `is_initial` / `is_terminal` and the other `is_*` flags, `transition_rules`, `requires_all_fields` / `required_field_keys`, `timeout_config`, `transfer_config`, `pause_bot`, `assignment_config`), so design the whole pipeline before the call instead of planning a second pass:

1. `create_workflow` — name, goal_type, the ordered statuses with their full stage config (each status needs `key` plus `name` or its `label` alias; unknown status keys are forwarded to the backend as-is), and the **complete** `fields` array (see §4 — this is your only chance for most field properties). Statuses without flags derive them: first = initial, last = terminal. **Set the identity and language here too:** `language` (BCP-47 from the enum, e.g. `en-US` / `es-CL` — match the conversation; without it the agent is born `es-CL`), `agent_name`, `agent_role`, `company_name` (without them it is born as "Agent" / "sales"). The result carries a top-level `status`: `"created"` or `"created_with_warnings"` — with warnings, resolve `pipeline_reconciliation` before configuring anything else.
2. **Check the `pipeline_reconciliation` report in the response** (see "Seeded default pipelines" below) and resolve every leftover, missing key, and warning before configuring anything else.
3. `update_workflow_status` — only for later edits, or for `transfer_config` targets that did not exist yet at create time.
4. Tools — `create_workflow_tool` / `configure_customer_api_tool`, then `set_workflow_tool_execution` or `set_tool_stage_gate`.
5. `update_workflow_config` — `status_automations` and behavior flags. Tools must exist first: an automation references a tool **by name**.
6. Webhooks, rules, jobs, functions, knowledge bases.
7. **Transfers last** — `update_workflow_status(..., transfer_config)` once every target agent has a real id.
8. Read everything back, then `set_workflow_active`.

### Seeded default pipelines

The backend's create endpoint seeds a default funnel (New, Contacted, In conversation, plus system stages such as "Esperando respuesta humana") and **appends** your statuses to it. `create_workflow` reconciles this for you: after creating, it reads the workflow back, re-asserts your initial/terminal flags, deletes seeded statuses that are not in your list, and returns `{ status, workflow, pipeline_reconciliation }` where `status` is `"created"` or `"created_with_warnings"` and the report carries `status` (`ok` / `needs_attention`), `requested_status_keys`, `seeded_statuses_removed`, `unrequested_statuses_remaining` (each with the backend's reason — e.g. `STATUS_HAS_LEADS` when the idempotency guard returned an existing agent, or a protected goal-target stage that cannot be deleted), `missing_requested_statuses`, `duplicate_labels` (two stages sharing one label — typically a protected seeded goal-target such as "Payment link sent" plus your own stage with the same label; keep the seeded key and delete yours, or rename one), and `warnings`. `created_with_warnings` is never a built agent.

Treat the report as part of the write: a build step is not done until `unrequested_statuses_remaining`, `missing_requested_statuses`, and `warnings` are all empty or explicitly resolved (`delete_workflow_status` after `get_pipeline_impact` for leftovers, `update_workflow_structure` for missing keys). Never leave seeded stages in a designed funnel — they are invisible to your gates, hints, and transfers, and leads routed into them go stale. Pass `prune_unrequested_statuses: false` only when you deliberately want to keep the defaults.

---

## 3. Merge, replace, and destroy semantics

The single most dangerous class of mistake: assuming a write merges when it replaces.

| Tool | Semantics | What you must do |
|---|---|---|
| `update_workflow` | Field-level merge over name/description/`goal_statement`, the identity fields (`language`, `timezone`, `region_style`, `agent_name`, `agent_role`, `company_name`, `begin_message`) and `master_workflow_id` | Pass only what changes, and **at least one** accepted field — a call with none fails `INVALID_INPUT`. Pause state goes through `set_workflow_active`, channels through channel-binding tools |
| `update_workflow.master_workflow_id` | Relationship replacement; UUID moves/assigns, `null` unassigns | Resolve the group with `list_agent_groups`; read back `list_workflows` |
| `update_workflow_config` | **Top-level key merge**; nested values replaced wholesale | Read `get_workflow`, send the full array/object for any key you touch |
| `update_workflow_config` with `replace: true` | **Destroys the entire config bag** | Effectively never use it |
| `update_workflow_structure` | Upsert by key; **never deletes** | Removing a status needs `delete_workflow_status` |
| `reorder_workflow_statuses` | Atomic complete-tail replacement; the first three semantic stages stay fixed | Read `get_workflow`, submit every persisted tail key exactly once, then read back and compare |
| `update_workflow_status` | Field-level merge, but `null` **clears** the block | Pass `null` only to intentionally clear |
| `set_workflow_prompt` | **Full overwrite** of the global prompt | `get_workflow` first, edit, send whole |
| `set_workflow_cadence` | Whole-document PUT for `blocks`; `dayConfig` keys omitted are **preserved** | `get_workflow_cadence` first, send the full edited document. Two `dayConfig` keys it returns are legacy v1 and unread by the block engine: `call_interval_minutes` and `template_interval_minutes` pass through untouched on a round-trip but are **refused if you change them** — use `template_to_call_delay_minutes` for the gap between touchpoints |
| `set_workflow_qualification` | Merge by key; `replace: true` clears the workflow's **entire** model before writing. `categories` and `conditions` are two names for the **same rows**, so the same key in both is refused | Every row needs its key **and** its human-readable name (`category_name` / `condition_name`); a row without one is refused. Re-contact timing defaults to a fixed 30-day delay, so set `timing_type` + `timing_config` only to override it. Default to merge |
| `set_workflow_voice` | Switches the voice AND/OR merges tuning keys | To change the voice pass **one** of `gender` (`male`/`female`), `voice_id`, or `voice_name` — the server resolves and writes the effective voice, and returns `resolved_voice.preview_url` to share. Tuning knobs (`voiceSpeed`, …) go in the `voice` object |
| `delete_workflow_status` | **Destructive.** Fails with `STATUS_HAS_LEADS` unless `migration_target` is given | Always `get_pipeline_impact` first |
| `delete_workflow_tool` | Soft-disable by default; `hard: true` is permanent | Leave `hard` off |
| `detach_knowledge_base` | Removes only the link | Never `delete_kb_document` to revoke one agent's access |

`create_workflow` is idempotent server-side — a guarded duplicate returns the existing id rather than creating a second agent. Its post-create reconciliation never deletes a status holding leads (the delete is refused server-side and surfaces in `unrequested_statuses_remaining` instead), so a duplicate-return with live leads stays safe.

---

## 4. What MCP cannot reach

Do not design a configuration that depends on these; the write will be rejected (`additionalProperties: false`) or the property simply has no tool.

- **Deleting an agent that still has active pipeline leads.** Agent deletion itself *is* available through the two-step `delete_workflow` contract: preview without `confirm:true`, obtain explicit approval for that exact agent, then repeat with `confirm:true`. The one thing MCP cannot force is deleting an agent whose pipeline still holds active leads (at least one active `workflow_run`) — the backend refuses with HTTP 409 `AGENT_HAS_LEADS` (with distinct `lead_count`), exactly as the dashboard Delete button is blocked. When this happens, do not dead-end: report the count and offer to move those leads to another agent, archive them reversibly, or permanently erase exact leads only under the separate `leads:delete` scope and its own preview-then-confirm flow. **Never** archive, delete, or status-change leads as a silent way to empty the pipeline. Agent-group deletion (`delete_agent_group`) stays relationship-only — never delete, pause, or mutate a member agent as a substitute.
- **`variable_refs`** — not a parameter of `update_workflow_status`. Statuses still gate correctly via `required_field_keys` / `requires_all_fields` / `transition_rules`; `variable_refs` only drives the dashboard's per-status hint of which fields matter. **Express every gate through `required_field_keys`, never by assuming `variable_refs` was set.**
- **`futurology_queue`** — no MCP parameter. A "park and recontact later" bucket must be built from a non-terminal status plus a recontact rule or background job, or configured in the dashboard.
- **Raw `sort_order` edits on an existing pipeline.** Set initial order through `create_workflow`; later order changes go through `reorder_workflow_statuses`, which protects the semantic head and rewrites the complete tail contiguously.
- **`channels` and pause state are not `update_workflow` parameters.** `update_workflow` covers name, description, `goal_statement`, the agent identity (`language`, `timezone`, `region_style`, `agent_name`, `agent_role`, `company_name`, `begin_message`) and `master_workflow_id` — but the channel mix lives in the channel-binding tools (`assign_whatsapp_to_workflow`, `config.email_sender_id`, `assign_number_to_workflow`, `set_number_sms`, `assign_imessage_to_workflow`) plus `config.disabled_channels`, and pausing/activating is `set_workflow_active`. A call carrying only a `workflow_id` (or only unaccepted keys) fails `INVALID_INPUT`; always include at least one accepted field. SMS is not provisioned like the others: it is activated per agent with `set_number_sms({ number_id, enabled: true, sms_workflow_id })` on a phone number the account already has (a Twilio-carrier number; Telnyx cannot carry SMS), so it needs no buy-a-number step when an active Twilio number already exists.
- **Most workflow-field properties after creation.** `create_workflow.fields[]` accepts arbitrary properties, but `update_workflow_structure.fields[]` accepts **only** `key`, `label`, `type`, `required`, `sort_order`. So `metadata_key`, `intake_value_map`, `extraction_hints`, `options`, `validation`, and `description` are reachable **only in the initial `create_workflow` call**.

  **This is a Law 1 constraint with teeth:** the metadata → field bridge (`metadata_key`) and select-field `options` must be part of the variable ledger *before* you create the agent. Getting them wrong means recreating the agent or finishing in the dashboard. Write the complete `fields` array on the first call.

---

## 5. Naming traps

- **`create_workflow` statuses take the full stage config — use it.** Each status needs `key` plus `name` (or its `label` alias) and accepts `is_initial`, `is_terminal`, `sort_order`, `entry_hint`, `category`, `color`, `transition_rules`, `requires_all_fields` / `required_field_keys`, `timeout_config`, `transfer_config`, `pause_bot`, `assignment_config` and the other `is_*` flags; unknown keys are forwarded to the backend. Deferring stage config to a follow-up pass leaves a window where the funnel is wrong — configure at create and reserve `update_workflow_status` for edits and late-binding `transfer_config` targets. One plan-only key remains: `transfer_to_agent_ref` belongs to `review_agent_system_plan` and must be resolved to a real `target_workflow_id` before it appears in any `transfer_config`.
- **`update_workflow_structure` statuses use `label` and accept only `key`, `label`, `is_initial`, `is_terminal`, `sort_order`.** `create_workflow` takes either `name` or `label`, but sending `name` — or any rich stage key — to `update_workflow_structure` fails `additionalProperties: false`; rich config on an existing status goes through `update_workflow_status`, and whole-pipeline ordering goes through `reorder_workflow_statuses`.
- **Tool `name` is immutable.** Renaming means `delete_workflow_tool` + recreate. `status_automations.tool` references it by name, so a rename silently breaks every automation pointing at it.
- **`goal_type` is a fixed vocabulary:** `appointment`, `sale`, `qualification`, `information`, `payment_link`, `support`, `custom`, `quote`, `document_collection`. `custom` **does not schedule meetings** — pair it with `update_workflow({ goal_statement })`, which is what actually renders the objective into the prompt.
- **Three unrelated things are called "paused."** Confusing them produces silent no-ops:
  - `workflows.is_paused` — the agent is off. Set by `set_workflow_active`. All new agents start here.
  - `workflow_runs.is_paused` — one lead's run is paused. Set by `stop_automation`. This is what background-job `exclusions.skip_paused` filters on.
  - status `pause_bot` — the agent goes quiet while the lead sits in that status. **Does not set `workflow_runs.is_paused`**, so a background job with `skip_paused: true` still processes these leads. That is precisely why the Law 3 pause boundary works: the job executing the handoff can still see the parked lead.
- **Appointment workflows cannot activate without at least one active meeting type** (`list_meeting_types` / `update_meeting_type`).

---

## 6. The verification surface

Preview and dry-run tools exist for nearly every risky primitive. Using them is the difference between a build you can defend and one you hope about.

| Check | Tool | What proves success |
|---|---|---|
| Whole-system preflight | `review_agent_system_plan` | `ready_for_signoff: true`, zero blocking issues |
| Funnel exactness after create | `pipeline_reconciliation` in the `create_workflow` response, then `get_workflow` | Status keys are exactly the designed set; empty `unrequested_statuses_remaining`, `missing_requested_statuses`, and `warnings` |
| Existing pipeline order | `get_workflow` before and after `reorder_workflow_statuses` | Protected semantic head remains at 0–2; complete persisted tail exactly matches the submitted keys at 3 onward |
| Status deletion safety | `get_pipeline_impact` | Lead counts per status before deleting |
| Cron correctness | `preview_scheduled_function_schedule` | The next N fire times in the right timezone |
| Cohort size | `preview_scheduled_function_cohort` | The candidate list before anything runs |
| Job behavior | `create_background_job` with `dry_run: true`, then `run_background_job` | Candidate list and intended actions, nothing sent |
| Webhook wiring | `test_webhook` | A delivery your receiver actually got |
| Function logic | `run_cloud_function` → `get_cloud_function_run` | Effects previewed. **Outbound HTTP is real** — point at test endpoints |
| Transfer edges | `get_workflow` on each source | `transfer_config.target_workflow_id` equals the real target id |
| Knowledge assignment | `list_knowledge_bases({ workflow_id })` | Exact id set and priority order |
| Stage gate | Call the tool before and after the gating status | `tool_not_available_in_stage`, then success |

`run_background_job` executes even an inactive job, and `run_scheduled_function` requires `confirm` because manual runs apply **real** effects. A successful manual run never proves the schedule is on — check `is_active` separately.
