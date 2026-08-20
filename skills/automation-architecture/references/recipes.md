# Recipes: customer ask → exact configuration

Worked mappings. Start from the closest one, keep the shape, swap the domain values. Field names and semantics are defined in [configuration-reference.md](configuration-reference.md).

## Contents

1. [“Notify us when a lead reaches X”](#1-notify-us-when-a-lead-reaches-x)
2. [“When a lead is qualified, create a deal in our CRM — once”](#2-when-a-lead-is-qualified-create-a-deal-in-our-crm--once)
3. [“Sync leads in from our CRM / database every night”](#3-sync-leads-in-from-our-crm--database-every-night)
4. [“Our form sends custom data; the agent should use it”](#4-our-form-sends-custom-data-the-agent-should-use-it)
5. [“Qualify by salary; branch on the amount”](#5-qualify-by-salary-branch-on-the-amount)
6. [“Route qualified leads into high-intensity sales or low-intensity nurture”](#6-route-qualified-leads-into-high-intensity-sales-or-low-intensity-nurture)
7. [“Remind the lead before the meeting”](#7-remind-the-lead-before-the-meeting)
8. [“After every completed meeting, send a survey — once”](#8-after-every-completed-meeting-send-a-survey--once)
9. [“When a lead unsubscribes, flag them in our CRM”](#9-when-a-lead-unsubscribes-flag-them-in-our-crm)
10. [“Re-activate leads whose follow-up date arrived”](#10-re-activate-leads-whose-follow-up-date-arrived)
11. [“Enrich every new lead from an external API”](#11-enrich-every-new-lead-from-an-external-api)
12. [“One sales conversation with contacted / qualified / booked stages”](#12-one-sales-conversation-with-contacted--qualified--booked-stages)
13. [“Once qualified, assign a HubSpot sales rep round-robin and then book”](#13-once-qualified-assign-a-hubspot-sales-rep-round-robin-and-then-book)
14. [“If the lead doesn’t qualify, stop contacting them”](#14-if-the-lead-doesnt-qualify-stop-contacting-them)
15. [“WhatsApp 24/7 instantly, but only call during business hours”](#15-whatsapp-247-instantly-but-only-call-during-business-hours)
16. [“Give each agent only the knowledge bases it needs”](#16-give-each-agent-only-the-knowledge-bases-it-needs)
17. [“Partway through, the agent should change its tone / start selling / hand over”](#17-partway-through-the-agent-should-change-its-tone--start-selling--hand-over)
18. [“Create two agents using the account’s existing channels”](#18-create-two-agents-using-the-accounts-existing-channels)
19. [Build a two-agent system end to end, from brief to live](#19-build-a-two-agent-system-end-to-end-from-brief-to-live)

---

## 1. “Notify us when a lead reaches X”

**Primitive:** outbound webhook. Every "I want to be notified when…" maps here first.

```json
{
  "name": "Notify on qualified",
  "url": "https://customer.example.com/nexor-events",
  "events": ["workflow_run.status_changed"],
  "filters": [{ "field": "to_status.key", "operator": "equals", "value": "qualified" }],
  "auth_type": "header"
}
```

The payload already carries the full lead (including metadata) and the from/to statuses — the receiver rarely needs a follow-up call. For Slack/email-style notifications, point the URL at the customer's alerting endpoint or a relay they own.

Variants: filter `to_status.category equals won` for "any win"; add `workflow_id` to scope to one agent; subscribe `meeting.created` / `meeting.no_show` for booking notifications. Keep status-filtered subscriptions on status events only (an absent filter field passes).

**Rejected rungs:** an agent tool only fires mid-conversation (misses timeout/job/human-driven status changes); a cloud function is code for what config already does.

---

## 2. “When a lead is qualified, create a deal in our CRM — once”

**Primitive:** status automation (act once per lead, custom body), not a webhook (fires every occurrence, fixed envelope unless templated).

1. Define a workflow HTTP/MCP tool for the CRM's create-deal endpoint (auth via `{{env.CRM_API_KEY}}`).
2. Add to workflow config:

```json
{
  "status_automations": [{
    "key": "create_crm_deal",
    "on_status_key": "qualified",
    "action": "run_tool",
    "tool": "crm_create_deal",
    "args_template": {
      "email": "{{lead.email}}",
      "name": "{{lead.first_name}} {{lead.last_name}}",
      "budget": "{{lead.metadata.budget}}"
    },
    "skip_if_metadata": "crm_deal_id"
  }]
}
```

3. Add a post-tool hook writing the returned deal id into `metadata.crm_deal_id` — that makes `skip_if_metadata` a second idempotency layer and gives later automations the CRM reference.

**Rejected rungs:** a webhook fires on every matching transition and needs receiver-side dedup; an agent tool depends on the model noticing the status change — the automation is invoked by the transition itself.

---

## 3. “Sync leads in from our CRM / database every night”

**Primitive:** scheduled function calling the public leads API. ("Syncing information into the system" is usually just the API; the scheduled function is the cron wrapper when the external system can't push.)

- If the external system **can push** (webhooks, Zapier, forms): skip the function entirely — point it at `POST /api/public/leads` with an API key, or at a branded inbound hook URL if it can't set headers. Done.
- If Nexor must **pull**, create a scheduled function (e.g. `0 2 * * *`, customer's timezone):

```js
const { data } = await axios.get("https://crm.example.com/api/contacts?updated_since=yesterday", {
  headers: { Authorization: `Bearer ${env.CRM_API_KEY}` }
});
const leads = data.contacts.map(c => ({
  first_name: c.firstName, last_name: c.lastName,
  email: c.email, phone: c.phone,
  source: "crm_sync",
  metadata: { crm_id: c.id, plan: c.plan, region: c.region },
  workflow_id: env.SALES_WORKFLOW_ID,
  skip_first_message: true
}));
await axios.post(`${env.NEXOR_API_BASE}/api/public/leads`, leads, {
  headers: { "X-API-Key": env.NEXOR_API_KEY }
});
```

The API upserts (email → phone match), shallow-merges metadata, and enrolls in one request — always the array form (up to 1000 leads per call), never one request per lead: the per-run outbound request limit makes the loop a bug, not a style choice. Set `skip_first_message: false` only when the sync should start first contact immediately — the cron hour is when messages go out, and anything that messages humans needs the customer's explicit sign-off before activation.

**Rejected rungs:** the `upsertLead` effect can create the lead but cannot enroll it in the same run (effects return nothing) — only use it with a two-phase sweep when calling the API back is undesirable.

---

## 4. “Our form sends custom data; the agent should use it”

**Primitive:** metadata at intake + `metadata_key` bridges. Whenever the customer says "the agent should know/use custom information about the lead," configure the intake through metadata.

1. The sending system includes the data in the lead's `metadata` object on `POST /api/public/leads` (or via the inbound hook's `field_mapping`). The root is an object, while its customer-defined values may use any JSON shape:

```json
{
  "metadata": {
    "plan": "pro",
    "score": 87.5,
    "eligible": true,
    "preferences": ["email", "morning"],
    "crm": { "deal_id": "D-42", "products": [{ "sku": "A1", "qty": 2 }] }
  }
}
```

2. The agent automatically sees the complete metadata object in its runtime prompt — every key and nested value is available as context. For purely contextual data ("mention their plan" or "use the CRM products"), metadata plus a prompt instruction is enough; do not add a field, KB, tool, or function for each key.
3. For data the agent would otherwise **ask** for, define a workflow field with `metadata_key` so it pre-fills and the agent skips the question:

```json
{ "key": "company_size", "label": "Company size", "type": "select",
  "options": ["1-10", "11-50", "51-200", "200+"],
  "required": true, "metadata_key": "company_size",
  "intake_value_map": { "SMB": "11-50", "Enterprise": "200+" } }
```

Leads arriving without the key get asked; leads arriving with it don't. Status gates (`required_field_keys`) then work identically for both. Later metadata writes shallow-merge top-level keys, so resend the whole `crm` object when changing only `crm.deal_id`.

**Rejected rungs:** making the agent re-ask for data the form already sent wastes turns; a cloud function copying metadata into fields duplicates the `metadata_key` bridge.

---

## 5. “Qualify by salary; branch on the amount”

**Primitive:** one workflow field + one status per range (`entry_hint` carries the condition) + transfer/automation on the branch statuses. The pattern for any "when <variable> is under / over / equal to X, do Y."

1. Field: `{ "key": "monthly_income", "type": "currency", "required": true, "extraction_hints": "Ask naturally during the conversation; accept approximate figures." }`
2. Statuses (both `variable_refs: ["monthly_income"]`, `requires_all_fields: true`):
   - `income_qualified` — `entry_hint: "Monthly income is confirmed and at least 800,000 — place the lead here."`, `is_terminal: true`, `transfer_config: { "target_workflow_id": "<premium-booking-agent>" }`
   - `income_below_threshold` — `entry_hint: "Monthly income is confirmed and below 800,000 — place the lead here."` Route per the customer's intent: a terminal `category: "lost"` status if unqualified means discard (recipe 14), a terminal status with `transfer_config` to a nurture agent, a `futurology_queue` parking status for later recontact, or a status automation notifying their system.
3. Encode each range as a server-evaluated rule so routing is deterministic:

```json
{ "transition_rules": {
    "auto_evaluate": true,
    "rule_groups": [{ "label": "Below threshold", "logic": "AND",
      "conditions": [{ "field": "monthly_income", "operator": "<", "value": 800000 }] }],
    "group_logic": "OR" } }
```

The platform routes the lead the moment `save_field` stores the income — the branch never depends on the agent choosing to call `set_lead_status`; the `entry_hint` stays as guidance. Note the server's blocking gates protect only non-terminal and `won` targets — entry into terminal branch statuses (transfer/lost) is not blocked server-side, which is exactly why the rule groups, not agent placement, should own the routing.
4. Equality/multi-band cases are just more statuses (`under 800k` / `exactly the promo tier` / `over 800k`), each with an unambiguous, mutually exclusive `entry_hint`.

The rule lives in `entry_hint` — not `description`, which the agent never sees.

**Rejected rungs:** a cloud function on `information.collected` could compare numbers in code, but auto-evaluated statuses give the same determinism while keeping the routing visible and editable by operators — the code earns nothing.

---

## 6. “Route qualified leads into high-intensity sales or low-intensity nurture”

**Primitive:** a qualification-router workflow with multiple terminal transfer statuses. One agent qualifies and filters; each target agent implements a different conversation and outreach intensity.

1. Define the shared qualification fields on the source: fit, need, and buying timeline. Require them before either qualified branch.
2. Create two mutually exclusive terminal statuses (shown below in stored shape — this is the `update_workflow_status` payload, **not** a `create_workflow` statuses array; at `create_workflow` these are just `{key, name}`, and `category`/`is_terminal`/`entry_hint`/`transfer_config` are applied in the follow-up per-status pass):

```json
[
  {
    "key": "qualified_now",
    "label": "Qualified Now",
    "category": "won",
    "is_qualified": true,
    "is_terminal": true,
    "entry_hint": "All qualification fields are complete, the lead is a fit, and the confirmed timeline is now.",
    "variable_refs": ["fit", "need", "timeline"],
    "requires_all_fields": true,
    "required_field_keys": ["fit", "need", "timeline"],
    "transfer_config": { "target_workflow_id": "<sales-now-agent>" }
  },
  {
    "key": "qualified_later",
    "label": "Qualified for Later",
    "category": "deferred",
    "is_qualified": true,
    "is_terminal": true,
    "entry_hint": "All qualification fields are complete and the lead is a fit, but the confirmed timeline is later.",
    "variable_refs": ["fit", "need", "timeline"],
    "requires_all_fields": true,
    "required_field_keys": ["fit", "need", "timeline"],
    "transfer_config": { "target_workflow_id": "<nurture-later-agent>" }
  }
]
```

3. Configure `<sales-now-agent>` with a hyper-specific sales/appointment prompt, only the ownership and booking tools it needs, stage gates for those tools, and the high-intensity contact schedule approved by the customer.
4. Configure `<nurture-later-agent>` with an educational, low-pressure prompt and email as its only outbound nurture channel. Do not copy the source qualification fields into it; instruct it to read fit, need, and timeline from the transfer chain.
5. For a three-month nurture example at approximately two emails per month, configure the target's active nurture status with:

```json
{
  "name": "Qualified later — biweekly email",
  "workflow_id": "<nurture-later-agent>",
  "trigger_status_key": "nurture_active",
  "stale_after_hours": 336,
  "stale_reference": "last_message_at",
  "cooldown_hours": 336,
  "max_attempts": 6,
  "on_exhausted": "mark_cold",
  "priority": 5,
  "prompt_hint": "Send one useful, low-pressure nurture email based on the transferred need and timeline. Do not re-qualify or push for an immediate meeting.",
  "conditions": {},
  "is_active": true
}
```

Enable the client's re-engage agent before creating this rule. Ensure the nurture workflow has a usable email sender and set `workflows.config.disabled_channels: ["call", "whatsapp", "sms"]` if email must be the only choice. `336` hours makes the lead eligible every 14 days; the re-engage decision may still skip a contact. `max_attempts: 6` bounds this example to six attempts, so change both frequency and horizon to the customer's approved policy. If exactly two sends per month is a hard deterministic contract rather than nurture guidance, use a scheduled/background automation with send-once state instead of an AI recontact rule.

6. Treat both handoffs as an expected connection manifest. After the source and both targets have real ids, update the source statuses even if the source was created first, then read the source back and prove `qualified_now → <sales-now-agent id>` and `qualified_later → <nurture-later-agent id>`. Repair and re-read any missing or misdirected edge before calling the system complete.
7. Verify each branch with a raw conversation: `qualified_now` must create a fresh sales run and start the sales cadence; `qualified_later` must create a fresh nurture run with the biweekly rule. Confirm both targets read the transfer chain without asking for fit, need, or timeline again.

Handoff messaging is composed automatically (contextual transition when the messaging window is open, otherwise the target's template cascade). Do **not** also aim a welcome job/automation at freshly transferred leads. Apply the 80% test: if the two targets share nearly all prompt, tools, channels, and schedule, use one agent with more statuses instead.

---

## 7. “Remind the lead before the meeting”

**Primitive:** rules. Two reminder rules on the meeting start time (e.g. −1440 and −180 minutes). Nothing else — not a cron, not a function. Host notifications ("tell the rep when a meeting books") are also rules; only "notify our *system*" needs a webhook on `meeting.created`.

**Rejected rungs:** a cron job or function re-derives timing the rules engine already owns — pure maintenance with no new capability.

---

## 8. “After every completed meeting, send a survey — once”

**Primitive:** background job (dry-run first).

```json
{
  "trigger_type": "cron", "cron_expression": "0 18 * * *",
  "workflow_filters": [{ "workflow_id": "<sales-agent>", "status_keys": ["meeting_completed"] }],
  "steps": [{ "type": "action",
    "action": { "action": "send_message",
      "channel": "whatsapp", "template_name": "satisfaction_survey",
      "then_status_key": "surveyed" } }],
  "max_leads_per_cycle": 200, "cooldown_minutes": 10080, "dry_run": true,
  "exclusions": { "skip_human_takeover": true, "skip_paused": true }
}
```

`then_status_key` is the send-once mechanism: once surveyed, the lead leaves the filter. Cohort messaging without it re-sends every cycle. Template must be approved. Read the dry-run candidate list, then set `dry_run: false`.

**Rejected rungs:** a `meeting.completed` cloud function cannot send templated messages (function effects are lead/metadata updates only); the job's `then_status_key` gives send-once for free.

---

## 9. “When a lead unsubscribes, flag them in our CRM”

**Primitive:** cloud function on `lead.unsubscribed` → CRM HTTP call, plus `updateMetadata({ crm_flagged: true })`. An agent tool is wrong here — unsubscribes also happen outside conversations. An outbound webhook cannot carry this either: `lead.unsubscribed` is not a webhook event (webhooks cover status changes, meeting lifecycle, and outreach failures). The function is the deterministic path; its code is earned by the trigger, not the payload shaping.

---

## 10. “Re-activate leads whose follow-up date arrived”

**Primitive:** background job first; scheduled function only if the date needs computing.

- Date parked in a collected field: cron job, `evaluate_field` with `date_before_today`, `on_match` → `set_lead_status` back to an active status (or `assign_workflow` to a recontact agent).
- Date parked in a tag (`followup:2026-09-01`): `evaluate_tag` with `date_in_tag`, `trigger_when: "past"`.
- Date must be computed (e.g. "90 days after their contract ends" from metadata math): scheduled function — lookup on the parked status/tag, compute in code, `setLeadStatus` per lead.

Statuses meant for parking should be `futurology_queue` buckets so booked/won leads can't be demoted into them.

---

## 11. “Enrich every new lead from an external API”

**Primitive:** decided by *when* the enrichment must be ready.

**If it must be ready before the agent's first message → pre-execution hook, not code.** Register the enrichment endpoint as a workflow tool, then:

```json
{ "tool": "set_workflow_tool_execution",
  "args": { "workflow_id": "<agent-id>", "tool_id": "<tool-id>", "mode": "on_entry", "call_once": true } }
```

It fires on workflow entry, ahead of the first message, with no model decision and no JavaScript. It also re-fires when a lead is *transferred in*, which is how a target agent arrives with context already loaded. Note it cannot be stage-gated — the call is rejected if you pass `available_in_statuses`.

**If it must react to a later event → cloud function** on `lead.created`, or `lead.updated` guarded on the relevant field actually changing (`ctx.changed_fields`). Fetch with `axios` + `env.KEY`, then `updateMetadata({ ...enrichment })` / `updateLead({...})`. Code is earned by the event, not the payload shaping.

**Rejected rungs:** a cloud function on `lead.created` to enrich before first contact re-implements what `mode: "on_entry"` does natively, and needs the `skip_first_message: true` + re-activate dance to win the race; an agent-callable enrichment tool can be skipped entirely.

---

## 12. “One sales conversation with contacted / qualified / booked stages”

**Primitive:** one agent, statuses only. Three agents chained by transfers is the canonical mistake: every hop resets cadence, fragments conversation history, and re-triggers first-contact logic. Reserve transfers for genuinely different conversations (different goal, persona, cadence, or channel mix).

---

## 13. “Once qualified, assign a HubSpot sales rep round-robin and then book”

**Primitives:** required intake fields → `qualified` status → deterministic status automation for round robin → `assignment_ready` after success → stage-gated availability and booking tools. The client's endpoint owns round robin; state transitions invoke and verify assignment without depending on the model, while the agent retains only the tools that require conversational choices.

First check who owns the rotation: if "round robin" just means distributing leads among the customer's own team members *in Nexor*, native `assignment_config: { "mode": "round_robin", "agent_ids": [] }` on the qualified stage does it with zero integration (reference §1) — stop there. This recipe is for rotation owned by the client's CRM or endpoint.

1. Define every qualification input as a required workflow field. Configure `qualified` with `requires_all_fields: true` and `required_field_keys` containing those keys. Its `entry_hint` must state the customer's actual qualification rule.
2. Register the client's assignment endpoint as the backing tool `assign_sales_rep`. Pass stable facts such as `lead_id`, territory, and product. Require a response containing `rep_id`, `rep_name`, and `assignment_id`; never ask the model to choose among representatives.
3. Invoke it deterministically when the lead enters `qualified`:

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

`args_template` supports `{{lead.<path>}}` / `{{lead.metadata.<key>}}` only — collected workflow fields are not addressable. Pass `lead_id` and stable metadata paths (mirror needed field values into metadata via a post-tool hook or the agent's `patch_metadata` before qualification), or let the endpoint fetch the details itself.

4. Configure tool access and duplicate-call protection:

```json
[
  {
    "name": "assign_sales_rep",
    "available_in_statuses": ["qualified"],
    "call_once": true,
    "llm_response_fields": ["rep_id", "rep_name", "rep_email", "assignment_id"]
  },
  {
    "name": "get_available_slots",
    "available_in_statuses": ["assignment_ready"],
    "call_once": false
  },
  {
    "name": "create_event",
    "available_in_statuses": ["assignment_ready"],
    "call_once": true
  }
]
```

5. Booking here depends on the assigned representative, so gate availability and booking to `assignment_ready`, not merely `qualified` — and make the transition structural. A status automation can only run a tool; it cannot move the lead. Two working shapes:
   - Keep the status automation as the caller; a post-tool hook persists `assignment_id` to `metadata.sales_assignment_id`, and a cloud function on `lead.updated` guarded on that key moves the lead to `assignment_ready`.
   - Or replace the status automation with one cloud function on `workflow.status_entered` for `qualified`: call the assignment endpoint with `axios`, persist the returned IDs, and set `assignment_ready` only on success — call and transition succeed or fail together.

   A failed call leaves the lead in `qualified`. If booking did *not* depend on the assignment result, skip `assignment_ready` and gate availability/booking at `qualified` directly.
6. Give the agent the execution sequence. Do not make it responsible for firing round robin:

```text
Collect and save every required qualification field. Move the lead to qualified only when
the configured qualification rule is satisfied; entering that status assigns the representative
automatically. Never select a representative or call the assignment tool conversationally.
Wait until the workflow reaches assignment_ready. Then offer scheduling and call get_available_slots only when
the lead wants to book. Call create_event with a returned slot. If any integration fails, do not
claim that assignment or booking succeeded.
```

7. Keep rotation state, rep eligibility/capacity, territory rules, and HubSpot ownership in the client endpoint. Make assignment and booking idempotent and store `assignment_id` / meeting ID in metadata through post-tool hooks.
8. Verify determinism and boundaries: enter `qualified` without telling the agent to call assignment and confirm the endpoint runs exactly once. Confirm failed assignment never reaches `assignment_ready`. Before that status, availability and booking must return `tool_not_available_in_stage` without reaching their endpoints; after it, they may run. Confirm repeated assignment/booking is blocked or returns the original idempotent result.

**Rejected rungs:** an agent-selected assignment tool can be skipped or hallucinated; prompt-only instructions do not prevent premature booking calls; reimplementing round robin in Nexor creates a second, drifting source of truth. Prefer the single-function shape over the automation when assignment needs custom computation, a multi-step request, or when success must atomically unlock `assignment_ready` (a status automation cannot move the lead).

---

## 14. “If the lead doesn’t qualify, stop contacting them”

**Primitive:** agent config only — a terminal `category: "lost"` status carrying the discard rule. The rule is configured visibly in the agent's behavior and processed internally during the conversation; the status ends outreach deterministically.

1. Put the discard rule in the status's `entry_hint` (e.g. `unqualified` — "Lead confirmed there is no budget / they are outside the service area — place the lead here."), with `variable_refs` + `requires_all_fields` when the rule depends on collected field values.
2. Configure `category: "lost"` and `is_terminal: true`. Entering the status stops all proactive outbound (cadence and jobs skip the lead) and the run cannot be reactivated. The agent still replies briefly and kindly if the lead writes in — built-in lost-lead behavior: no selling, no booking offers. Add `pause_bot` only if the customer wants total silence, including to inbound messages. Encode the disqualifying condition in `transition_rules.rule_groups` with `auto_evaluate: true` when field values fully determine it.
3. Do not confuse the neighbors: `pause_bot` is a hold (agent stops responding while a human reviews; the run stays live) and `futurology_queue` is a deferral (park now, recontact later — recipe 10). Only the terminal `lost` status discards. Avoid status keys starting with `future_` (or `contact_later` / `colder`) for a hard discard — those are soft terminals and recontact keeps running for them.
4. If the customer's system must also know, attach a filtered webhook (recipe 1) or status automation (recipe 2) to the discard status.

**Rejected rungs:** a background job that "deactivates unqualified leads" re-derives what the status already enforces; a prompt line saying "don't message unqualified leads" is speech, not structure — nothing stops the cadence.

---

## 15. “WhatsApp 24/7 instantly, but only call during business hours”

**Primitive:** cadence config (reference §10). This is mostly default behavior plus contact windows — no code, no per-channel scheduler.

1. Define the contact windows (blocks) in the workflow's timezone (`workflows.timezone`): e.g. `09:00–13:00` and `15:00–19:00`, `days_of_week: [1,2,3,4,5]`.
2. Calls are automatically restricted to those windows — that gating is hard-coded and can't be turned off (failsafe 09:00–21:00 if no blocks exist).
3. Leave `config.gate_outbound_to_hours` at its default `false` so WhatsApp, email, and SMS stay 24/7. Set it `true` only when the customer wants *everything* inside the windows — the flag is workflow-wide; per-channel windows are not configurable.
4. Instant behavior is built in: fresh runs fire the hot-contact cascade immediately (default whatsapp → call → email → sms; `first_contact_channel` picks the opener; the call step waits for a window), and inbound replies always get an immediate agent response regardless of windows.
5. Per-window intensity comes from `dayConfig` (`initial_*_per_block` decaying to `min_*`) or automatically from window length under `contact_caps_mode: "automatic_v1"` (≤4h → 1 touch per channel, ≤6h → 2, longer → 3). Turn a channel fully off with `config.disabled_channels`, never with a zero cap.
6. "Email at most 4–5 times a week" is **not expressible as a weekly cap** — no weekly knob exists. Approximate it: `initial_emails_per_block: 1` with one block per day gives ≈5 sends over `max_days: 5`, or move email out of cadence into a background job with `cooldown_minutes` (e.g. 1440–2880). Tell the customer which approximation you chose; do not promise a per-week guarantee.

**Rejected rungs:** a cloud/scheduled function re-implementing the scheduler fights the cadence engine (and still can't ungate calls); prompt instructions like "only call in the morning" don't control outbound scheduling at all.

---

## 16. “Give each agent only the knowledge bases it needs”

**Primitive:** account-level knowledge-base catalog plus per-agent assignment links (reference §11). Knowledge ownership and agent access are separate.

Suppose the account owns `General Company FAQ`, `Qualification Policy`, and `Pricing & Products`, while a qualification agent should use the first two and a closer should use the first and third.

1. Call `list_knowledge_bases({})` once to resolve the three real KB ids from the account catalog.
2. Record the exact desired assignment manifest before writing:

```json
[
  {
    "agent_ref": "qualifier",
    "knowledge_bases": ["<general-faq-id>", "<qualification-policy-id>"]
  },
  {
    "agent_ref": "closer",
    "knowledge_bases": ["<general-faq-id>", "<pricing-products-id>"]
  }
]
```

3. After both agents have real ids, call `list_knowledge_bases({ "workflow_id": "<agent-id>" })` for each. Attach every missing expected link and detach every unexpected link. Detaching from one agent does not delete the KB or affect another agent that shares it.
4. Read both workflow-scoped lists again. Completion means exact id-set equality and the intended priority order for each agent. The account-wide result is not verification.
5. If a required KB does not exist, create it once at account scope, attach its returned id only where planned, and include it in the same read-back audit.

**Rejected rungs:** copying KB content into prompts creates stale duplicate facts; attaching every account KB to every agent leaks irrelevant context; deleting a KB to remove one agent's access can break every other agent sharing it.

---

## 17. “Partway through, the agent should change its tone / start selling / hand over”

**Primitive:** decided by the Law 2 / Law 3 discriminator — one more status, or a boundary status plus a transfer. Never prompt prose.

**The illegal shape.** A single agent whose prompt says *“start friendly and informative; once the lead confirms budget, switch to a closing tone and push for the meeting.”* Nothing about that switch is enforceable: the tool set does not change, no automation can fire on it, no webhook can observe it, no job can filter on it, and the model may switch early, late, or never. Same for a `mode` boolean written to metadata — no gate, filter, or automation reads it as a stage.

**Step 1 — run the discriminator.** What actually changes at the switch?

- Only what is *known* about the lead changes; goal, persona, tools, channels, and cadence stay the same → **Law 2: one more status.**
- Goal, prompt content, tool set, channel mix, or contact intensity changes → **Law 3: a second agent behind a boundary status.**

**Step 2a — the status answer (Law 2).** Make the switch a stage of the same pipeline:

```json
{
  "key": "budget_confirmed",
  "label": "Budget confirmed",
  "entry_hint": "The lead has stated and saved a budget at or above the qualifying amount — place the lead here.",
  "variable_refs": ["budget"],
  "required_field_keys": ["budget"],
  "transition_rules": {
    "auto_evaluate": true,
    "rule_groups": [{ "label": "Qualifying budget", "logic": "AND",
      "conditions": [{ "field": "budget", "operator": ">=", "value": 5000 }] }],
    "group_logic": "OR"
  }
}
```

The emphasis shift belongs in that status's `entry_hint` and in per-status prompt guidance — but the *enforcement* is structural: gate `get_available_slots` / `create_event` with `available_in_statuses: ["budget_confirmed"]`, and attach any CRM push as a status automation on `on_status_key: "budget_confirmed"`. The agent cannot book early even if it decides to talk like a closer early.

**Step 2b — the agent answer (Law 3).** If the closer genuinely has a different goal, prompt, tool set, or cadence, make `budget_confirmed` a boundary status and hand the lead over:

```json
{
  "key": "budget_confirmed",
  "label": "Budget confirmed — to closer",
  "category": "won",
  "is_terminal": true,
  "entry_hint": "The lead has stated and saved a qualifying budget — place the lead here.",
  "variable_refs": ["budget"],
  "required_field_keys": ["budget"],
  "transfer_config": { "target_workflow_id": "<closer-agent-id>" }
}
```

The closing tone, the booking tools, and the higher-intensity cadence now live on `<closer-agent-id>`, not in a paragraph. Instruct the closer to read budget from the transfer chain rather than re-asking — transferred fields are a read-only snapshot, not copied into its own fields.

If the handover must wait on something outside the conversation (a human review, a nightly batch, an external signal), use the pause boundary instead: `pause_bot: true` on the status and a background job with the `workflow_transfer` action as the named executor. A pause boundary with no executor parks the lead silently forever.

**Step 3 — verify structurally, not conversationally.** Before the boundary, the closer-only tools must return `tool_not_available_in_stage`; after it, a fresh run must exist on the target agent at *its* initial status with the source run deactivated. A conversation that merely *sounds* like it switched proves nothing.

**Rejected rungs:** a prompt-only persona switch is speech, not structure; a `mode` flag in metadata is invisible to every gate and filter; a tool whose purpose is “change tone” gives the model a decision the pipeline should own; three agents for what is one conversation with three stages resets cadence at every hop (recipe 12).

---

## 18. “Create two agents using the account’s existing channels”

**Primitive:** account channel inventory + allocation manifest + per-agent binding (reference §12). Availability and assignment are different.

Suppose the account has one WhatsApp number and one active call route assigned to a distinct legacy **Intake** workflow, two send-capable email senders, and that phone's SMS route is unassigned. The customer asks to create two new agents: **Qualifier** and **Closer**.

1. Run `inspectAccountChannels`. Use its saved timezone. Never ask whether the account already has those channels.
2. Build one allocation table before any mutation:

```json
[
  { "agent_ref": "qualifier", "channel": "whatsapp", "resource_id": "<wa-id>", "current_owner": "<legacy-intake-id>" },
  { "agent_ref": "qualifier", "channel": "call", "resource_id": "<phone-id>", "current_owner": "<legacy-intake-id>" },
  { "agent_ref": "closer", "channel": "email", "resource_id": "<closer-email-id>", "current_owner": null },
  { "agent_ref": "closer", "channel": "sms", "resource_id": "<phone-id>", "current_owner": null }
]
```

The same physical phone id is valid here because call and SMS have independent owner columns. Assigning that WhatsApp or call capability to **Closer** too would be an invalid duplicate claim. Sharing one email sender would be valid.

3. The final summary must explicitly say: “Move WhatsApp `<label>` and the call route on `<phone label>` from legacy **Intake** to new **Qualifier**; inbound WhatsApp/calls will route to **Qualifier**, and **Intake** loses those direct channels.” Require approval of that exact impact. Immediately before both assignment writes, re-run inventory; if either owner is no longer **Intake**, stop and re-approve against the live owner.
4. Apply ids only after approval. Set `disabled_channels` to match each agent's manifest and make sure `first_contact_channel` remains enabled and usable. If a new resource is chosen, pause: complete its integration setup, repeat inventory, replace the placeholder with a real id, and then return to review.
5. Read back both new agents plus displaced legacy **Intake**. The selected ids, `disabled_channels`, `first_contact_channel`, direct owners, and SMS owner must all match. Disable WhatsApp/call on **Intake** or apply its separately approved replacements. If **Qualifier** initiates WhatsApp outreach, select a real row from `approved_openers`, call `set_opening_templates`, and verify the workflow-specific result with `get_template_pool` before activation.

**Rejected rungs:** asking “do you have WhatsApp?” ignores account data; assigning the same exclusive capability to both agents causes a reconciliation loop; treating SMS and call as one owner discards supported routing; generic build approval does not authorize breaking an existing agent; a placeholder “new number” is not a binding.

---

## 19. Build a two-agent system end to end, from brief to live

**Primitive:** the full protocol. This is the shape every multi-agent build follows; earlier recipes are the parts. Brief: *"Qualify inbound leads, and once they're qualified hand them to a closer that books meetings."*

### Phase 1 — orient (no mutations)

```
describe_agent_configuration          # the platform's own current surface map + required process
list_workflows / get_workflow         # what already exists; reuse before creating
list_client_tools, list_webhooks, list_knowledge_bases({})
inspectAccountChannels                # saved timezone + real channel resources (recipe 18)
```

### Phase 2 — decompose with the three laws

Two agents, because the closer differs in goal, prompt, tools, and cadence — not merely in what is known (SKILL.md, "Law 2 or Law 3?"). Write the three ledgers before touching the plan:

- **Variables:** `fit`, `need`, `timeline` (all `required`), plus `territory` arriving as metadata. Because a status automation must later send `territory`, it must exist in metadata — it does, so no mirroring is needed.
- **Stages (qualifier):** `new` (initial) → `engaged` → `qualified` (terminal boundary) and `unqualified` (terminal, `category: "lost"`).
- **Boundary:** `qualified` → closer, terminal handoff. Note the key is *not* `future_*` / `contact_later` / `colder`.

### Phase 3 — preflight and sign-off

```json
{ "tool": "review_agent_system_plan", "args": { "plan": {
  "agents": [
    { "ref": "qualifier", "name": "Qualifier", "goal_type": "qualification",
      "primary_responsibility": "Collect fit, need and timeline, then route.",
      "language": "es", "timezone": "America/Santiago", "channels": ["whatsapp", "email"],
      "statuses": [
        { "key": "new", "is_initial": true },
        { "key": "engaged", "entry_hint": "The lead has replied at least once." },
        { "key": "qualified", "entry_hint": "fit, need and timeline are saved and the lead is a fit.",
          "transfer_to_agent_ref": "closer" },
        { "key": "unqualified", "entry_hint": "The lead confirmed no need or no budget." }
      ], "activate": false },
    { "ref": "closer", "name": "Closer", "goal_type": "appointment",
      "primary_responsibility": "Book a meeting with an already-qualified lead.",
      "language": "es", "timezone": "America/Santiago", "channels": ["whatsapp"],
      "statuses": [ { "key": "new", "is_initial": true },
                    { "key": "booked", "entry_hint": "A meeting exists on the calendar." } ],
      "activate": false }
  ],
  "open_questions": ["Confirm the closer's cadence intensity."] } } }
```

Resolve every `blocking_issue` and `clarification_question`, then show the summary and ask the returned `signoff_prompt` verbatim. **No mutation happens before the user approves the `plan_fingerprint`.**

### Phase 4 — build (agents are created paused)

```
create_workflow(name:"Qualifier", goal_type:"qualification",
                statuses:[{key:"new",name:"New"}, {key:"engaged",name:"Engaged"}, …],
                fields:[{key:"fit",label:"Fit",type:"text",required:true,
                         extraction_hints:"…", metadata_key:"fit"}, …])
```

The `fields` array must be **complete here** — `metadata_key`, `options`, `extraction_hints` and `validation` cannot be added later through MCP.

**`create_workflow` statuses accept only `key` + `name`.** Nothing else. The first status in the array is the initial status (there is no `is_initial` at create time), and order is taken from array position (no `sort_order`). `is_initial`, `is_terminal`, `label`, `sort_order`, `entry_hint`, `category`, `transition_rules`, and `transfer_config` are all rejected here with `additionalProperties: false` — they belong to the `review_agent_system_plan` plan schema (which *does* take `is_initial`/`entry_hint`/`transfer_to_agent_ref`) or to the follow-up `update_workflow_status` call, not to `create_workflow`. Set terminals, categories, gates and hints in the per-status `update_workflow_status` pass below; note that `update_workflow_structure` statuses use `label`, not `name`.

```
create_workflow(name:"Closer", goal_type:"appointment", …)     # note: needs an active meeting type to activate
update_workflow_status(qualifier, "qualified", category:"won", is_terminal:true,
                       entry_hint:"…", required_field_keys:["fit","need","timeline"],
                       transition_rules:{auto_evaluate:true, rule_groups:[…]})
update_workflow_status(qualifier, "unqualified", category:"lost", is_terminal:true, entry_hint:"…")
create_workflow_tool(closer, …) → set_tool_stage_gate(closer, <id>, ["new"])
update_workflow_config(qualifier, { config: { status_automations: [ … ] } })   # send the whole array
configure_status_webhook(qualifier, "qualified", …)
attach_knowledge_base(qualifier, <policy-kb>, priority:1)
```

**Transfers last**, once the closer has a real id:

```
update_workflow_status(qualifier, "qualified", transfer_config:{ target_workflow_id:"<closer real id>" })
```

### Phase 5 — read back, then activate separately

```
get_workflow(qualifier)                     # qualified: is_terminal ✓, transfer_config → closer's real id ✓
get_workflow(closer)                        # initial status, prompt, gates
list_workflow_tools(closer)                 # stage gate present
list_knowledge_bases({workflow_id: …})      # exact ids and priority order
list_meeting_types(closer)                  # appointment agents cannot activate without one
set_workflow_active(closer, true)           # target first, so a transfer never lands on a paused agent
set_workflow_active(qualifier, true)
```

**Activate the target before the source.** The transfer path does not check whether the target is paused: it deactivates the source run and creates the target run either way. If the target is still paused at that moment, the lead has been handed off into an agent that will not speak. Ordering activation target-first removes the window entirely.

**Rejected rungs:** creating both agents then wiring transfers from memory (creation order never satisfies a connection — read back); building three agents for qualify/engage/book (recipe 12); activating during the build; naming the boundary `future_qualified` (soft terminal — the transfer silently never fires).
