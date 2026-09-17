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
20. [“Change the agent's call voice — make it male / female / a specific voice”](#20-change-the-agents-call-voice--make-it-male--female--a-specific-voice)
21. [Build a bookable appointment agent on a fresh account](#21-build-a-bookable-appointment-agent-on-a-fresh-account)
22. [“Once the lead says yes, a payment agent sends the link”](#22-once-the-lead-says-yes-a-payment-agent-sends-the-link)
23. [“If they go quiet for N hours, follow up, then hand them to the follow-up agent”](#23-if-they-go-quiet-for-n-hours-follow-up-then-hand-them-to-the-follow-up-agent)
24. [“The deal closes in our CRM — count it in Nexor”](#24-the-deal-closes-in-our-crm--count-it-in-nexor)
25. [“Sell tickets on our ecommerce and follow up with a discount”](#25-sell-tickets-on-our-ecommerce-and-follow-up-with-a-discount)

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

**Primitive:** scheduled function calling the public leads API. ("Syncing information into Nexor" is usually just the API; the scheduled function is the cron wrapper when the external tool can't push.)

- If the external tool **can push** (webhooks, Zapier, forms): skip the function entirely — point it at `POST /api/public/leads` with an API key, or at a branded inbound hook URL if it can't set headers. Done.
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

1. The sending external tool includes the data in the lead's `metadata` object on `POST /api/public/leads` (or via the inbound hook's `field_mapping`). The root is an object, while its customer-defined values may use any JSON shape:

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
2. Create two mutually exclusive terminal statuses. `create_workflow` statuses accept this full shape directly (only `transfer_config.target_workflow_id` must wait for the per-status pass when the target agent does not exist yet):

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

Handoff messaging is composed automatically (contextual transition when the messaging window is open, otherwise the target's template cascade). Do **not** also aim a welcome job/automation at freshly transferred leads, and do **not** script hand-off dialogue on the source — the source moves the lead and ends its turn; the target speaks next (recipe 22). Apply the 80% test within one intent only: if the two targets share the same intent and register and nearly all prompt, tools, channels, and schedule, use one mode with more statuses instead — never merge two different intents or registers into one mode.

---

## 7. “Remind the lead before the meeting”

**Primitive:** rules. Nothing else — not a cron, not a function. Host notifications ("tell the rep when a meeting books") are also rules; only "notify our *external API / CRM*" needs a webhook on `meeting.created`.

1. `get_reminder_catalog({ workflow_id })` — which channels this account can use (`available_for_account`), which trigger events are dispatched, and the default templates. Propose only channels it marks available.
2. `list_reminder_rules({ workflow_id })` — dedupe on `trigger_event + channel + delay_minutes`.
3. For each WhatsApp rule, resolve an APPROVED template by intent (`sync_whatsapp_templates` → `list_whatsapp_templates({ status: "APPROVED" })`); when none matches, draft one (`review_whatsapp_template_drafts` → `create_whatsapp_templates_batch`) and create the rule `is_active: false` until Meta approves. Never reuse an opening/cold-contact template.
4. Present the whole set once, then write it after approval:

```json
[
  { "trigger_event": "event_created", "channel": "whatsapp", "template_name": "meeting_confirmation", "delay_minutes": 0,     "delay_reference": "trigger",     "workflow_id": "<id>", "name": "Confirmation" },
  { "trigger_event": "event_created", "channel": "whatsapp", "template_name": "meeting_reminder",     "delay_minutes": -1440, "delay_reference": "event_start", "workflow_id": "<id>", "name": "24h before" },
  { "trigger_event": "event_created", "channel": "whatsapp", "template_name": "meeting_reminder",     "delay_minutes": -120,  "delay_reference": "event_start", "workflow_id": "<id>", "name": "2h before" },
  { "trigger_event": "event_created", "channel": "retell",   "template_name": "notification_10min",   "delay_minutes": -10,   "delay_reference": "event_start", "workflow_id": "<id>", "name": "Call 10 min before" }
]
```

Each row is one `set_reminder_rule` call. `delay_minutes` is signed; `delay_reference: "event_start"` counts from the meeting, `"trigger"` from the booking. There is no reschedule trigger — `event_created` fires again for the new time. A rep notification is `set_host_reminder_rule({ trigger_event: "event_created", channel: "email", template_name: "default", workflow_id })`; host cancellation/reschedule alerts are on by default. Full contract: [booking-agent.md §5](booking-agent.md#5-reminders--the-full-contract).

**Rejected rungs:** a cron job or function re-derives timing the rules engine already owns — pure maintenance with no new capability; a channel the catalog marks unavailable is a rule that never sends.

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

A wait measured from *entering a stage* ("after 3 days in Proposal sent…") is not a stored date and not this recipe: it is `timeout_config` on that stage (recipe 23).

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

**Primitive:** one mode, statuses only — because contacted / qualified / booked are one intent (close this sale) in one register. Splitting a *single* intent into three modes chained by transfers is the canonical mistake: every hop resets cadence, fragments conversation history, and re-triggers first-contact logic. This recipe is not a licence for one broad mode: the moment a second intent or register appears (a follow-up chase, a discount, a payment step) it becomes its own mode (recipes 22, 23, 25), and the default shape of an agent is 2–3 modes.

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

   `get_available_slots` and `create_event` are runtime agent tools — not callable over MCP. They appear here only because `available_in_statuses` gates them exactly like a client tool; you never invoke them yourself. If the client's endpoint should pick the host for Nexor's own booking instead of running its own booker, `set_host_assigner({ workflow_id, tool: "assign_sales_rep", id_field: "rep_id", external_key: "<crm key>" })` is the native shape — see [booking-agent.md §6](booking-agent.md#6-host-routing).

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
4. If the customer's CRM or external API must also know, attach a filtered webhook (recipe 1) or status automation (recipe 2) to the discard status.

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
- Goal, prompt content, tool set, channel mix, or contact intensity changes → **Law 3: a second mode behind a boundary status.** This is the default answer whenever the *intent* changes (informing → selling → chasing) or the *register* changes (friendly → insistent); the operator must explicitly ask for one single mode to keep it in one prompt (SKILL.md, "Default shape").

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

The closing tone, the booking tools, and the higher-intensity cadence now live on `<closer-agent-id>`, not in a paragraph. Instruct the closer to read budget from the transfer chain rather than re-asking — transferred fields are a read-only snapshot, not copied into its own fields. Write the boundary silently on the source: when the criterion is met it moves the lead and ends its turn, with no hand-off dialogue; the closer speaks next from its own arrival rule (recipe 22 shows the payment-link variant).

If the handover must wait on *elapsed time* ("48h with no reply, then hand over"), that is still the terminal shape: `timeout_config` on the waiting status aimed at the terminal transfer status (recipe 23). Only when it must wait on something outside the conversation (a human review, a nightly batch, an external signal) use the pause boundary instead: `pause_bot: true` on the status and a background job with the `workflow_transfer` action as the named executor. A pause boundary with no executor parks the lead silently forever.

**Step 3 — verify structurally, not conversationally.** Before the boundary, the closer-only tools must return `tool_not_available_in_stage`; after it, a fresh run must exist on the target agent at *its* initial status with the source run deactivated. A conversation that merely *sounds* like it switched proves nothing.

**Rejected rungs:** a prompt-only persona switch is speech, not structure; a `mode` flag in metadata is invisible to every gate and filter; a tool whose purpose is “change tone” gives the model a decision the pipeline should own; three agents for what is one conversation with three stages resets cadence at every hop (recipe 12).

---

## 18. “Create two agents using the account’s existing channels”

**Primitive:** account channel inventory + allocation manifest + per-agent binding (reference §12). Availability and assignment are different.

Suppose the account has one WhatsApp number and one active call route assigned to a distinct legacy **Intake** workflow, two send-capable email senders, and that phone's SMS route is unassigned. The customer asks to create two new agents: **Qualifier** and **Closer**.

1. Run `get_account_readiness`, then `list_whatsapp_numbers`, `list_email_senders` and `list_phone_numbers`. Use the saved timezone. Never ask whether the account already has those channels.
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

**Note on SMS above:** SMS is never provisioned here. Because the account already has an active Twilio number, SMS is activated per agent on that existing number with `set_number_sms({ number_id, enabled: true, sms_workflow_id })` — no buy-a-number step (a Twilio-carrier number is required; there is no country restriction).

---

## 19. Build a two-agent system end to end, from brief to live

**Primitive:** the full protocol. This is the shape every multi-agent build follows; earlier recipes are the parts. Brief: *"Qualify inbound leads, and once they're qualified hand them to a closer that books meetings."*

### Phase 1 — orient (no mutations)

```
describe_agent_configuration          # the platform's own current surface map + required process
list_workflows / get_workflow         # what already exists; reuse before creating
list_client_tools, list_webhooks, list_knowledge_bases({})
get_account_readiness                 # saved timezone, blockers, next tools
list_whatsapp_numbers, list_email_senders, list_phone_numbers   # real channel resources (recipe 18)
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
                statuses:[{key:"new",name:"New",is_initial:true},
                          {key:"engaged",name:"Engaged",entry_hint:"…"},
                          {key:"qualified",name:"Qualified",category:"won",is_terminal:true,
                           entry_hint:"…", required_field_keys:["fit","need","timeline"],
                           transition_rules:{auto_evaluate:true, rule_groups:[…]}},
                          {key:"unqualified",name:"Unqualified",category:"lost",is_terminal:true,entry_hint:"…"}],
                fields:[{key:"fit",label:"Fit",type:"text",required:true,
                         extraction_hints:"…", metadata_key:"fit"}, …])
```

The `fields` array must be **complete here** — `metadata_key`, `options`, `extraction_hints` and `validation` cannot be added later through MCP.

**`create_workflow` statuses carry the full stage config, and the array is the entire funnel.** Each status needs `key` plus `name` (or `label`); `is_initial`/`is_terminal`, `sort_order`, `entry_hint`, `category`, gates, `timeout_config`, `pause_bot` and the rest are all settable at create — configure everything except `transfer_config` targets that do not have real ids yet. The backend seeds a default pipeline on create and the tool prunes it back to your list, returning a `pipeline_reconciliation` report — **check it after every create** and resolve any leftover, missing, or warning entries before continuing. Plan-only key: `transfer_to_agent_ref` belongs to `review_agent_system_plan`, never to `create_workflow`. `update_workflow_structure` statuses still use `label` only.

```
create_workflow(name:"Closer", goal_type:"appointment", …)     # note: needs an active meeting type to activate
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

---

## 20. “Change the agent's call voice — make it male / female / a specific voice”

**Primitive:** agent config only — the voice the call agent speaks with. One tool does the whole job: `set_workflow_voice`. It resolves the request against the client's voice catalog and writes the *effective* voice where the call runtime reads it — you do not edit `ai_config` by hand.

The one trap this recipe exists to kill: **gender is not a free-text prompt line, and it is not `ai_config.style.gender` alone.** Telling the agent "usa una voz de hombre" in the prompt, or flipping only the grammatical gender, does **not** change the voice the lead hears. The lead keeps hearing the old voice. You must select a real catalog voice.

**When the ask names a gender ("que sea voz de hombre" / "a female voice"):**

```
set_workflow_voice(workflow_id, gender:"male")
```

The server picks a male voice in the workflow's language, sets it as the effective voice, and aligns the grammatical gender to match. The response returns `resolved_voice` — read back `resolved_voice.name` and share `resolved_voice.preview_url` (a playable .mp3) so the user can hear it before trusting it.

**When the ask names a specific voice, or you want to let the user choose:**

```
list_workflow_voices(workflow_id)                     # each voice has a preview_url sample
set_workflow_voice(workflow_id, voice_id:"<id from the list>")
# or, to match by name:
set_workflow_voice(workflow_id, voice_name:"Kailey", gender:"female")
```

Always pass the `voice_id` (not the catalog row `id`) when you have it. Combine `voice_name` + `gender` when a name is ambiguous.

**Tuning (speed, temperature, volume) is a separate concern** — those go in the `voice` object and do not select a voice:

```
set_workflow_voice(workflow_id, voice:{ voiceSpeed:1.1 })
```

You can switch and tune in one call: `set_workflow_voice(workflow_id, gender:"male", voice:{ voiceSpeed:1.05 })`.

**Failure modes to surface, not swallow:** an unknown `voice_id` or a gender with no match in the workflow's language returns `INVALID_VOICE` with `available_voices`. Do not silently fall back — tell the user the catalog has no such voice for their language, list what is available (with preview URLs), and offer to add one via the add-language flow.

**Rejected rungs:** a prompt line asking the agent to "sound male" (speech, not the TTS voice); setting only the grammatical gender field (changes es/pt self-reference wording, never the voice); hand-writing `ai_config.voice.voice_id` (the call runtime reads top-level `ai_config.voice_id`, so a nested-only write is ignored — the exact bug this tool now prevents).

---

## 21. Build a bookable appointment agent on a fresh account

**Primitive:** the booking path — agent config + meeting type + hosts + availability + calendar + rules. Brief: *"An agent that books 30-minute video demos with our two sales reps, with WhatsApp reminders."* Full contracts in [booking-agent.md](booking-agent.md).

### Phase 1 — orient (no mutations)

```
get_account_readiness                  # timezone, team, existing agents, per-agent booking blockers
list_team                              # user_id of each rep
get_integration_status                 # calendars[] and booking_providers[] — who is already connected
get_reminder_catalog                   # which reminder channels this account can use
```

### Phase 2 — plan and review

Plan the appointment agent with its booking block, then `review_agent_system_plan`; it refuses the plan until `meeting_type`, `hosts[]` and a calendar plan are present:

```json
{ "agents": [{
  "ref": "demo_booker", "name": "Demo booker", "goal_type": "appointment",
  "primary_responsibility": "Qualify interest and book a 30-minute demo.",
  "language": "en-US", "timezone": "America/New_York", "channels": ["whatsapp"],
  "statuses": [
    { "key": "new", "is_initial": true },
    { "key": "demo_booked", "entry_hint": "A demo slot has been confirmed with the lead — place the lead here.", "is_booking_target": true }
  ],
  "meeting_type": { "name": "Demo", "duration_minutes": 30, "location_type": "video", "video_provider": "google_meet" },
  "hosts": [{ "user_id": "<rep-1>" }, { "user_id": "<rep-2>" }],
  "calendar_plan": { "provider": "google" },
  "activate": false
}], "open_questions": [] }
```

Show the summary, ask the `signoff_prompt`, wait for the fingerprint approval.

### Phase 3 — build, in dependency order (agent stays paused)

```
create_workflow({ goal_type:"appointment", timezone:"America/New_York", language:"en-US", statuses, fields })
create_meeting_type({ workflow_id, name:"Demo", duration_minutes:30, location_type:"video", video_provider:"google_meet" })
add_executive({ workflow_id, user_id:"<rep-1>" })            # and rep-2
set_host_schedule({ user_id:"<rep-1>", timezone:"America/New_York",
                    slots:[{ weekday:1, start:"09:00", end:"17:00" }, …] })   # and rep-2
connect_calendar({ user_id:"<rep-1>", provider:"google", confirm:true })     # → connect_url — send it to rep-1
connect_calendar({ user_id:"<rep-2>", provider:"google", confirm:true })     # → connect_url — send it to rep-2
set_reminder_rule(…)                                          # the recipe-7 set, channels the catalog allows
set_host_reminder_rule({ trigger_event:"event_created", channel:"email", template_name:"default", workflow_id })
set_meeting_type_routing({ workflow_id, agent_selection_rules:{ routing:"cycle", tiers:[{ agents:["<rep-1>","<rep-2>"], mode:"round_robin" }] } })
```

The calendar step is the human one: say exactly who must open which link, then poll `get_calendar_connections({ user_id })` for each rep until `status: "active"`. Do not proceed to activation on a promise.

### Phase 4 — read back, then activate separately

```
get_account_readiness            # the agent's booking block: zero blockers, no fix_tools
get_integration_status           # calendars[] both active
list_executives, get_host_availability, list_reminder_rules, list_meeting_types
get_workflow_slots({ workflow_id, from:"<today>", to:"<today+7d>" })   # non-empty for both hosts
```

Only then, after a separate confirmation, `set_workflow_active`. Prove it with one `book_meeting({ …, idempotency_key, confirm:true })` on a test lead, `list_meetings`, and `cancel_meeting({ meeting_id, confirm:true })`.

**Rejected rungs:** activating on `create_meeting_type` alone (no host, no slots — the agent offers nothing and says so to every lead); asking the reps to "share their calendar" instead of sending the `connect_url` (there is no other way in); a reminder on a channel the catalog marks unavailable; writing routing as prompt prose when `set_meeting_type_routing` enforces it; calling `get_available_slots` or `confirm_and_book` from here — they are runtime tools, not callable over MCP.

---

## 22. “Once the lead says yes, a payment agent sends the link”

**Primitive:** Law 3 — a boundary status on the selling/qualifying agent with `transfer_config` to a payment agent (goal `payment_link`), plus `set_payment_link` on that target. The link is never prose in a prompt.

**What the platform does at the boundary — design around it.** The moment the source agent places the lead in the terminal status, the platform deactivates the source run, creates a fresh run on the payment agent, and makes the **payment agent speak next**: with the messaging window open (or an active iMessage thread) it composes its arrival message from *its own* prompt plus the carried context (the runtime tells it: continue naturally, do not introduce yourself again, do not repeat answered questions, move toward this workflow's goal); with the window closed it sends its opening WhatsApp template. Two consequences:

- **The source never speaks the hand-off.** No "te paso con mi colega de pagos", no "en un momento te llega el link", no farewell, no preview of what happens next. The source's last turn is the natural end of its own job (confirming the choice); the status move is silent, and the next message the lead sees comes from the payment agent. Hand-off dialogue produces two voices, a promise the source cannot keep, and a duplicated first message. Write the source prompt so that when the acceptance criterion is met it places the lead in the boundary status and ends its turn — it does not announce, narrate, or explain the transfer.
- **The payment agent's first message is the payment link, in context.** Its prompt states the arrival rule explicitly: the lead arrives having already decided — read what they chose, the amount, and any delivery/date details from the transfer chain (and lead metadata), acknowledge that in one line, and send the link. No greeting, no self-introduction, no re-qualification, no "how can I help", no re-asking anything the chain already holds. Everything after that turn is payment support: confirm payment, handle a failed or expired link, answer price objections, re-send.

**Build:**

1. **Source** (selling/qualifying agent). One terminal status with the acceptance criterion and the pre-payment facts as required fields:

```json
{
  "key": "ready_to_pay",
  "label": "Ready to pay",
  "category": "won",
  "is_terminal": true,
  "entry_hint": "The lead has explicitly accepted the offer and every pre-payment detail (plan or item, quantity, amount, date/address when required) is confirmed and saved — place the lead here.",
  "required_field_keys": ["selected_plan", "amount"],
  "transfer_config": { "target_workflow_id": "<payment-agent-id>" }
}
```

   Source prompt rule (prose, in the agent's language): *"When the lead accepts and every pre-payment detail is saved, move them to Ready to pay and end your turn. Do not announce a hand-off, a colleague, or an incoming link."*

2. **Target** (payment agent, goal `payment_link`). Configure the link first with `set_payment_link` (`fixed` URL, `tool` capture path, or `lead` metadata key) and read `config.payment_link` back with `get_workflow`. The agent sends the link through its built-in transactional retrieval, which reads the lead's link and then `config.payment_link` — with neither configured it cannot send, and a `{{payment_link}}` template is refused (`payment_link_missing`), so do this before any read-back. Arrival rule in the payment agent's prompt: *"The lead arrives having already accepted <plan/item> for <amount>; those facts are in the transferred context and are never re-asked. Your first message acknowledges exactly that in one sentence and sends the payment link — nothing else: no greeting, no introduction, no questions. If the link cannot be retrieved, say it is being prepared and escalate."* For the window-closed WhatsApp path, `set_opening_templates` with an approved template whose body carries `{{payment_link}}` and the same context-first tone (no greeting-and-ask). On other channels the prompt rule governs the AI turn.

3. **Connection manifest:** `ready_to_pay → <payment-agent-id>`; reconcile and read back per recipe 19.

**Verify** with a raw conversation driven to acceptance: (a) the source's last outbound message contains no hand-off language; (b) a fresh run exists on the payment agent at its initial status and the source run is `transferred`; (c) the payment agent's first outbound message contains the link and names the accepted item/amount; (d) nothing re-asks a field the chain already holds.

**Editing either side later:** these two prompts are one contract. Before rewriting the source's closing behaviour or the payment agent's first message, read the other agent's relevant status and prompt (they share an agent group — read the group, not the single agent) so the boundary stays silent on one side and context-aware on the other.

**Rejected rungs:** one agent whose prompt says "after they accept, send the link" when the payment side needs a different persona, tool set, or cadence (Law 3, recipe 17); a source prompt that "warms up" the transfer; a welcome job or automation aimed at transferred leads (the arrival message already speaks); the URL written into a prompt (`set_payment_link` is the only path the runtime reads).

---

## 23. “If they go quiet for N hours, follow up, then hand them to the follow-up agent”

**Primitive:** status timeouts (`timeout_config`) chained across statuses of the same agent, ending in a terminal status that carries `transfer_config`. No code. This is exactly what the dashboard writes when the operator ticks **“If the lead does not reply → After N hrs → Move to”** on a stage and **“Continue with another agent”** on the terminal stage — so it is the first thing to reach for, and the one to name to the user.

**Rejected rungs:** a scheduled function sweeping “leads silent for 4h” (re-implements the timer, invisible in the stage editor, cannot transfer without extra code); a background job with `workflow_transfer` (right only when a human or an external signal decides — §9 pause shape); recontact `on_exhausted` (it can only mark cold, pause or do nothing — it never transfers, and it cannot name a target status); a prompt line “after 24 hours move them to Follow up” (the agent has no clock between turns).

**How the timer works — read before designing.** The clock is time since the lead *entered* the status (`status_changed_at`), 24/7, checked every 2 minutes. `unit` is `minutes | hours | days`; the dashboard shows hours only. A reply does **not** reset it — only a status change does. Leads in human support, paused runs/agents and sandbox runs are skipped; a terminal target is skipped while the lead has an upcoming meeting. The timeout is inert on a terminal status or the goal stage, so the wait always sits on the status *before* the exit.

Two cases from the brief in the title:

**Case A — never replied: nudge at 24h and 72h, then hand off.** The opener and its nudges are the outreach cadence (`set_workflow_cadence`: windows, `max_days`, touches per block); recontact rules are refused on `new` / `contacted` (409 `CADENCE_OWNED_STAGE`). The handoff is one timeout on `contacted` (a core stage; it accepts timeouts):

```json
set_status_timeout_rule({ "workflow_id": "<qualifier>", "status_key": "contacted", "timeout": 72, "unit": "hours", "target_status_key": "handoff_followup" })
update_workflow_status({ "workflow_id": "<qualifier>", "status_key": "handoff_followup", "is_terminal": true, "transfer_config": { "target_workflow_id": "<follow-up agent>" } })
```

**Case B — replied, then went silent: touches at 4h, 12h, 24h, 48h, then hand off.** Unequal gaps mean one waiting status per gap; each `timeout` is the gap *from the previous hop*, not the cumulative figure:

```text
engaged --4h--> silent_4h --8h--> silent_12h --12h--> silent_24h --24h--> silent_48h --<final wait>--> handoff_followup (terminal, transfer_config → follow-up agent)
```

Build the chain in one `create_workflow` call (statuses carry `timeout_config` inline) or with one `set_status_timeout_rule` per hop; add `transfer_config` once the follow-up agent has a real id. The last hop's timeout is the answer to “how long after the final touch do we hand over” — ask the user for that number instead of inventing it.

The status timeout moves the lead **silently**. For the touch at each hop choose one, in this order:

1. **Hand off earlier and let the follow-up agent's cadence do the touches.** Different contact intensity is the textbook reason for a second agent (Law 3): `engaged --4h--> handoff_followup` and the follow-up agent's cadence/recontact policy owns 12h/24h/48h. Fewer moving parts, fully operator-visible.
2. **Exact unequal gaps inside one agent:** one recontact rule per waiting status — `set_recontact_rule({ "workflow_id", "trigger_status_key": "silent_4h", "name": "Nudge 1", "stale_reference": "status_changed_at", "stale_after_hours": 1, "max_attempts": 1, "on_exhausted": "nothing", "prompt_hint": "<what this nudge says>" })`. `stale_after_hours` is at least 1, so the touch lands about an hour after the hop; shift the hop by that hour if the exact figure matters. Recontact already skips a lead who replied.

**Non-negotiable in both cases:** a reply must take the lead *out* of the waiting statuses, or the chain hands off a live conversation. Write the active stage's `entry_hint` so the agent moves a lead who writes back out of `silent_*` (e.g. “the lead answered after a silence — resume here”), and keep the waiting statuses' own `entry_hint` limited to “no reply for N hours” so the agent never parks a talking lead there.

**Verify:** `list_status_timeout_rules({ workflow_id })` shows every hop with the intended unit and target; `get_workflow_status(handoff_followup)` shows `is_terminal: true` and the `transfer_config`; drive one test lead into `silent_12h` with a short `unit: "minutes"` timeout, let it reply, and confirm the run is back on an active stage (no timeout fires); let another go quiet through the chain and confirm a fresh run exists on the follow-up agent at its initial status with the source run `transferred`. Restore the real hours before activation.


---

## 24. “The deal closes in our CRM — count it in Nexor”

**Primitive:** a conversion event posted by the external tool that owns the outcome — their CRM, ERP or own backend — (`POST /api/public/conversions`, `create_conversion` over MCP), plus `set_conversion_destination` on the source agent so the lead moves when one arrives. No code on the Nexor side.

**Rejected rungs:** counting it in the prompt (“when they say they signed, mark it”) — the agent is not in that conversation and the signature happens days later, elsewhere; an inbound lead webhook (it upserts a lead, it does not record an outcome); an outbound webhook (that is Nexor telling them, the direction is reversed); a scheduled function *first* (correct only when their external tool cannot make any outgoing call — see below).

**Applies to** every goal that is not booking a meeting or collecting a Nexor payment link: qualification, information, support, document collection, quote, sale, custom. The agent qualifies, a human or an external tool closes, and without this the account reports zero conversions while the business is closing every week.

**Ask exactly two things.** Which external tool (CRM, ERP, own backend, spreadsheet) knows the moment of conversion, and how that tool identifies the person: the email, the phone, or the Nexor `lead_id` it stored from an outbound webhook or the leads API response. Do not ask what to put in `metadata` — propose keys from what the customer already said (deal id, product, seller, branch, plan) and let them trim.

**1. Set the destination first**, so the lead lands somewhere the moment the first real event arrives:

```json
set_conversion_destination({ "workflow_id": "<qualifier>", "destination_workflow_id": "<onboarding>", "destination_status_key": "welcome" })
```

Use `agent_group_id` instead of `workflow_id` when every agent in the group should share the fallback. A named conversion type is optional: add one with `set_conversion_type` only when the customer wants the events labelled by name in reports or a default currency — it is never a prerequisite.

**2. The request their external tool sends** when the deal reaches its won stage (from the CRM's own webhook/automation, from a Zapier / Make / n8n HTTP step, or from their application):

```http
POST https://api.getnexor.ai/api/public/conversions
X-API-Key: $NEXOR_API_KEY
Content-Type: application/json

{ "lead_email": "{{person.email}}",
  "amount": {{deal.value}},
  "currency": "CLP",
  "description": "Contrato firmado",
  "metadata": { "deal_id": "{{deal.id}}", "owner": "{{deal.owner}}", "product": "{{deal.product}}" } }
```

Only the lead identifier is required. Everything the business will want to slice by later goes in `metadata`, never inside the description: it is shown on the lead, delivered to cloud functions on `conversion.detected`, and filterable with `metadata[key]=value`.

**3. When their external tool cannot call out at all**, invert the direction: a Scheduled Function on a cron that queries their API for deals closed since the last run and posts one conversion per lead. Same endpoint, same payload. Do not offer this when a webhook or a Zapier step is available — it adds a polling window and code to maintain.

**Already covered without any of this:** a Shopify store (orders are recorded automatically) and HubSpot deal sync (a won deal emits the conversion). Confirm those, then ask whether any *other* outcome closes outside them.

**Verify:** post one real event for a test lead, then `list_conversions({ lead_id: "<test lead>" })` must return it with the amount, description and metadata as sent; `get_workflow({ workflow_id: "<qualifier>" })` must read back `conversion_destination` with the expected agent and status and `source: "own"` (or `"group"` when the fallback is the group's); and the test lead must now have a fresh run on the destination agent. Until both read-backs pass, the wiring is pending, not done.

---

## 25. “Sell tickets on our ecommerce and follow up with a discount”

**Primitive:** the default shape — 2–3 modes split by intent and register, chained by terminal transfers, inside one agent. Brief: *"We sell event tickets on our online store. The agent should sell them, and if people don't buy, follow up and offer a discount."*

**Sizing.** Three intents with three registers: get the lead to buy now (warm, informative, answers questions, sends the checkout link); bring back a lead who did not complete checkout (short reminders on a cadence, resolves blockers, no new offer); close a still-unconverted lead with the approved discount (one concession, a deadline, then close or stop). That is three modes. Two if the operator has no plain-reminder motion and the discount *is* the follow-up (the reminder and the concession then share intent and register). Never one broad "sales" mode — the review blocks a single-mode plan unless the operator explicitly asked for exactly one (`plan.decomposition.single_mode_explicitly_requested` with their quoted words) — and never a mode per message.

**Mode ledger:**

| ref | intent | register | boundary out |
|---|---|---|---|
| `sell_tickets` (entry) | buy a ticket now | warm, informative, checkout link | `not_purchased` (terminal, after the stage timeout) → `follow_up_unpaid` |
| `follow_up_unpaid` | complete the abandoned checkout | short reminders on a cadence, blockers only | `still_unpaid` (terminal) → `offer_discount` |
| `offer_discount` | accept the approved discount | one concession, deadline, close or stop | `purchased` / `declined` (terminal, no transfer) |

**Preflight** (plan-local refs, one plan agent per mode; only `sell_tickets` is the entry point, so no `entry_point` flags are needed):

```json
{
  "agents": [
    {
      "ref": "sell_tickets", "name": "Sell event tickets", "goal_type": "sale",
      "primary_responsibility": "Get the lead to buy a ticket on the store.",
      "language": "en", "timezone": "America/Los_Angeles", "channels": ["whatsapp"],
      "statuses": [
        { "key": "new", "is_initial": true },
        { "key": "link_sent", "entry_hint": "The checkout link was sent for a chosen event and quantity." },
        { "key": "purchased", "entry_hint": "The order is confirmed.", "is_terminal": true, "category": "won" },
        { "key": "not_purchased", "entry_hint": "No order after the wait window.", "is_terminal": true, "transfer_to_agent_ref": "follow_up_unpaid" }
      ]
    },
    {
      "ref": "follow_up_unpaid", "name": "Follow up abandoned checkouts", "goal_type": "sale",
      "primary_responsibility": "Bring the lead back to complete the purchase without changing the offer.",
      "language": "en", "timezone": "America/Los_Angeles", "channels": ["whatsapp"],
      "statuses": [
        { "key": "new", "is_initial": true },
        { "key": "purchased", "entry_hint": "The order is confirmed.", "is_terminal": true, "category": "won" },
        { "key": "still_unpaid", "entry_hint": "Reminders exhausted and no order.", "is_terminal": true, "transfer_to_agent_ref": "offer_discount" }
      ]
    },
    {
      "ref": "offer_discount", "name": "Offer the discount", "goal_type": "sale",
      "primary_responsibility": "Close with the approved discount or stop.",
      "language": "en", "timezone": "America/Los_Angeles", "channels": ["whatsapp"],
      "statuses": [
        { "key": "new", "is_initial": true },
        { "key": "purchased", "entry_hint": "The discounted order is confirmed.", "is_terminal": true, "category": "won" },
        { "key": "declined", "entry_hint": "The deadline passed or the lead refused.", "is_terminal": true, "category": "lost" }
      ]
    }
  ]
}
```

`review_agent_system_plan` returns `decomposition: { mode_count: 3, entry_points: ["sell_tickets"], orphan_modes: [] }` and no decomposition issue; show that with the fingerprint and get sign-off.

**Build:** `create_workflow` per mode, each with its complete funnel; the wait before `not_purchased` is `timeout_config` on `link_sent` aimed at `not_purchased` (recipe 23 — the delay is a stage timeout, never a job); the checkout link is a `set_payment_link` `lead` key or `fixed` URL when the store gives one link per event, or a customer API tool that creates the cart (recipe 11 shape); the follow-up cadence is `set_workflow_cadence` on `follow_up_unpaid`; the discount code and its deadline are Law 1 variables in the `offer_discount` prompt's transferred context, not prose. Reconcile the connection manifest (`not_purchased → <follow_up_unpaid id>`, `still_unpaid → <offer_discount id>`) once every id is real, per recipe 19.

**Verify:** a raw conversation that ignores the link must, after the timeout, show a `transferred` source run and a fresh `follow_up_unpaid` run; the follow-up's first message references the chosen event without re-asking it (recipe 22 arrival rule); after its cadence exhausts, a fresh `offer_discount` run whose first message carries the discount and the deadline.

**Rejected rungs:** one mode whose prompt says "if they don't buy, remind them, then offer 10% off" (three intents and registers in one unfenced prompt: nothing gates the discount, nothing cadences the reminders separately, nothing can transfer); five modes (choose event → send link → remind once → remind twice → discount) — the middle three share intent and register and are statuses or cadence steps, not modes; a scheduled function polling for abandoned carts when the stage timeout already expresses the wait.
