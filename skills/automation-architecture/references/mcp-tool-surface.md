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
| Agent name, description, objective, pause state, group | `update_workflow` — accepts **only** `name`, `description`, `goal_statement`, `is_paused`, `master_workflow_id`; every call must carry at least one | `get_workflow` |
| Agent rename | `update_workflow({ name })` | `get_workflow`, `list_workflows` |
| Agent-group membership | `update_workflow({ master_workflow_id })`; `null` unassigns | `list_agent_groups`, `list_workflows` |
| Agent language, timezone, channels | set at `create_workflow` — **not** parameters of `update_workflow` (see §4) | `get_workflow` |
| Agent-group create/rename/delete | `create_agent_group`, `update_agent_group`, `delete_agent_group` | `list_agent_groups`, `list_workflows` |

Deleting an agent group is relationship-only: it removes the group and clears each member's group assignment. It must never pause, archive, soft-delete, hard-delete, or reconfigure a member agent. Read back both groups and workflows and verify that every former member still exists with `master_workflow_id: null`.
| Base prompt | `set_workflow_prompt` | `get_workflow`, `get_workflow_prompt_history` |
| Per-channel prompt | `set_channel_prompt` | `get_workflow` |
| Create the agent + skeleton statuses + fields | `create_workflow` | `get_workflow` |
| Add/edit statuses & fields (upsert, never deletes) | `update_workflow_structure` | `get_workflow` |
| **Per-status gates, hints, transfers, timeouts, pause** | `update_workflow_status` | `get_workflow` |
| Delete a status | `delete_workflow_status` (after `get_pipeline_impact`) | `get_workflow` |
| Workflow-scoped HTTP tool | `create_workflow_tool` / `update_workflow_tool` | `list_workflow_tools` |
| Reusable customer API tool | `configure_customer_api_tool` or `create_client_tool` + `assign_tool_to_workflow` | `list_client_tools`, `list_workflow_tools` |
| Tool execution mode (hook vs conversational) | `set_workflow_tool_execution` | `list_workflow_tools` |
| Tool stage gate only | `set_tool_stage_gate` | `list_workflow_tools` |
| `config` bag — incl. **`status_automations`**, `gate_outbound_to_hours`, `disabled_channels` | `update_workflow_config` | `get_workflow` |
| Cadence windows and intensity | `set_workflow_cadence` | `get_workflow_cadence` |
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

`create_workflow` accepts statuses and fields inline, but only a thin slice of each. The rich configuration is necessarily a second pass:

1. `create_workflow` — name, goal_type, ordered statuses (`key` + `name`), and the **complete** `fields` array (see §4 — this is your only chance for most field properties).
2. `update_workflow_status` per status — `entry_hint`, `required_field_keys` / `requires_all_fields`, `transition_rules`, `category`, `is_terminal`, `timeout_config`, `pause_bot`. Fields already exist, so gates can reference them.
3. Tools — `create_workflow_tool` / `configure_customer_api_tool`, then `set_workflow_tool_execution` or `set_tool_stage_gate`.
4. `update_workflow_config` — `status_automations` and behavior flags. Tools must exist first: an automation references a tool **by name**.
5. Webhooks, rules, jobs, functions, knowledge bases.
6. **Transfers last** — `update_workflow_status(..., transfer_config)` once every target agent has a real id.
7. Read everything back, then `set_workflow_active`.

---

## 3. Merge, replace, and destroy semantics

The single most dangerous class of mistake: assuming a write merges when it replaces.

| Tool | Semantics | What you must do |
|---|---|---|
| `update_workflow` | Field-level merge, but accepts **only** `name`, `description`, `goal_statement`, `is_paused`, `master_workflow_id` | Pass only what changes, and **at least one** of those five — any other key is ignored and a call with none of them fails `INVALID_INPUT` |
| `update_workflow.master_workflow_id` | Relationship replacement; UUID moves/assigns, `null` unassigns | Resolve the group with `list_agent_groups`; read back `list_workflows` |
| `update_workflow_config` | **Top-level key merge**; nested values replaced wholesale | Read `get_workflow`, send the full array/object for any key you touch |
| `update_workflow_config` with `replace: true` | **Destroys the entire config bag** | Effectively never use it |
| `update_workflow_structure` | Upsert by key; **never deletes** | Removing a status needs `delete_workflow_status` |
| `update_workflow_status` | Field-level merge, but `null` **clears** the block | Pass `null` only to intentionally clear |
| `set_workflow_prompt` | **Full overwrite** of the global prompt | `get_workflow` first, edit, send whole |
| `set_workflow_cadence` | Whole-document PUT for `blocks`; `dayConfig` keys omitted are **preserved** | `get_workflow_cadence` first, send the full edited document |
| `set_workflow_qualification` | Merge by natural key; `replace: true` deletes and replaces | Default to merge |
| `set_workflow_voice` | Key-level merge | Pass only changed keys |
| `delete_workflow_status` | **Destructive.** Fails with `STATUS_HAS_LEADS` unless `migration_target` is given | Always `get_pipeline_impact` first |
| `delete_workflow_tool` | Soft-disable by default; `hard: true` is permanent | Leave `hard` off |
| `detach_knowledge_base` | Removes only the link | Never `delete_kb_document` to revoke one agent's access |

`create_workflow` is idempotent server-side — a guarded duplicate returns the existing id rather than creating a second agent.

---

## 4. What MCP cannot reach

Do not design a configuration that depends on these; the write will be rejected (`additionalProperties: false`) or the property simply has no tool.

- **`variable_refs`** — not a parameter of `update_workflow_status`. Statuses still gate correctly via `required_field_keys` / `requires_all_fields` / `transition_rules`; `variable_refs` only drives the dashboard's per-status hint of which fields matter. **Express every gate through `required_field_keys`, never by assuming `variable_refs` was set.**
- **`futurology_queue`** — no MCP parameter. A "park and recontact later" bucket must be built from a non-terminal status plus a recontact rule or background job, or configured in the dashboard.
- **`sort_order` on `update_workflow_status`** — set order at `create_workflow` / `update_workflow_structure` time.
- **`update_workflow` mutates only five fields: `name`, `description`, `goal_statement`, `is_paused`, `master_workflow_id`.** `language`, `timezone`, `channels`, `agent_name`, and every other identity property are **not** parameters — they are fixed at `create_workflow`. Routing them through `update_workflow` sends unrecognized keys that are dropped, and if none of the five valid fields is also present the call fails `INVALID_INPUT: "Provide is_paused, name, description, goal_statement or master_workflow_id"`. Never call `update_workflow` with only a `workflow_id`; always include at least one of the five it accepts.
- **Most workflow-field properties after creation.** `create_workflow.fields[]` accepts arbitrary properties, but `update_workflow_structure.fields[]` accepts **only** `key`, `label`, `type`, `required`, `sort_order`. So `metadata_key`, `intake_value_map`, `extraction_hints`, `options`, `validation`, and `description` are reachable **only in the initial `create_workflow` call**.

  **This is a Law 1 constraint with teeth:** the metadata → field bridge (`metadata_key`) and select-field `options` must be part of the variable ledger *before* you create the agent. Getting them wrong means recreating the agent or finishing in the dashboard. Write the complete `fields` array on the first call.

---

## 5. Naming traps

- **`create_workflow` statuses use `name`. `update_workflow_structure` statuses use `label`.** Same concept, different key, in adjacent calls. Sending `label` to `create_workflow` fails `additionalProperties: false`.
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
