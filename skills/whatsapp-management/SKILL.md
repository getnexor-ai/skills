---
name: whatsapp-management
description: "Manage a Nexor customer's WhatsApp end to end through Nexor MCP tools: connect a number (hosted setup link), check account health and risk (quality rating, messaging limits, sending status), create/review/submit and organize message templates, run cadence template pools, set the business display name and photo, tune inbound response timing, assign a number to an agent, and send messages. Use whenever a customer wants to connect WhatsApp, is asked about WhatsApp risk/quality/limits, wants to create or fix a template, or wants to change anything about how their WhatsApp behaves. Everything is done through Nexor — the customer never touches Meta or the provider directly."
---

# WhatsApp management (through Nexor)

Nexor is the single front door for everything WhatsApp. The customer never calls Meta
or the underlying provider directly — even connecting a number is a hosted setup link
Nexor generates. Every tool below is tenant-scoped automatically from the API key;
never accept or pass a `client_id` from the user.

Read `references/whatsapp-reference.md` before creating a template or interpreting a
health payload — it holds the durable Meta rules (template formatting, categories,
quality rating, the 24-hour window) that rarely change and are easy to get wrong.

## The tools, by job

| Job | Tools |
|-----|-------|
| See numbers | `list_whatsapp_numbers` |
| Connect a number | `connect_whatsapp_number` → returns a hosted setup link the customer opens |
| Fix a broken number | `reconcile_whatsapp_number`; if it needs fresh Meta auth, `connect_whatsapp_number` again |
| Assign to an agent | `assign_whatsapp_to_workflow` |
| Turn a number off / remove | `deactivate_whatsapp_number` (reversible); `disconnect_whatsapp_number` (admin, destructive) |
| Rename (internal label) | `rename_whatsapp_number` |
| Business profile | `get_whatsapp_business_profile`, `set_whatsapp_display_name`, `set_whatsapp_profile_photo` |
| Health & risk | `get_whatsapp_health` |
| Response timing (debounce) | `get_whatsapp_response_timing`, `set_whatsapp_response_timing` |
| "Are my templates approved / how long?" | `get_whatsapp_template_approval_status` |
| Templates — read | `list_whatsapp_templates`, `get_whatsapp_template`, `check_whatsapp_template_approvals`, `sync_whatsapp_templates` |
| Templates — create | `review_whatsapp_template_drafts` → `create_whatsapp_templates_batch` (preferred); `create_whatsapp_template` (single) |
| Templates — organize | `set_whatsapp_template_purpose`, `delete_whatsapp_template` |
| Cadence pools | `get_template_pool`, `set_template_pool`, `set_opening_templates` |
| Send a message | `send_message` |

## Connect a number

1. `connect_whatsapp_number` → returns a **hosted setup link**. Give the customer the
   link and tell them to open it; the authorization (Meta login, choosing
   dedicated/coexistence) happens there — it cannot be completed inside chat.
2. Nexor records the number automatically on completion and registers its inbound
   webhook. Confirm with `list_whatsapp_numbers`.
3. Bind it to an agent with `assign_whatsapp_to_workflow` — this is what makes inbound
   messages reach that agent.
4. There is a per-client cap (default 10); `connect_whatsapp_number` fails with
   `WHATSAPP_LIMIT_REACHED` at the cap.

There is no OTP/verification step to script — provisioning lives entirely on the
hosted link. If a connected number later breaks, run `reconcile_whatsapp_number`
first; only if it needs a new Meta authorization do you send another setup link.

## Health & risk

"Is my WhatsApp at risk / why can't it send / what's my limit" → `get_whatsapp_health`
for that number. Risk is **not one field** — read these together (details in the
reference):

- `quality_rating`: GREEN (fine) · YELLOW (watch) · **RED (at risk of Meta
  restriction)**.
- `messaging_health.can_send_message`: AVAILABLE · LIMITED · BLOCKED, with per-entity
  (WABA / phone) errors and suggested fixes.
- `messaging_limit`: the daily tier + ceiling.
- `route_verification`: whether the provider route is valid or needs
  reconnect/resync — if it says reconnect, run `reconcile_whatsapp_number`.

One health call triggers several Meta calls, so results are briefly cached — do not
poll in a loop. Summarize the state in plain language and recommend the concrete next
action.

## Templates

Creating a template is the highest-value WhatsApp task. **A template is never generic:
it belongs to a specific agent and echoes that agent's persona, product, goal, and
language.** Read `references/whatsapp-reference.md` for the durable Meta rules and the
starter library organized by agent goal. Follow this flow end to end — do not jump
straight to drafting.

### 1. Establish the target agent — never skip this

A template must land on a real agent's cadence; do not create a floating template.

- If the conversation is already scoped to one agent, use it.
- Otherwise **ask which agent**, listing the options with `list_workflows`.
- If the user asks for "a booking confirmation template" without naming an agent, the
  agent is the missing piece — resolve it first, then draft.

### 2. Read the agent's context before drafting

Call `get_workflow(workflow_id)` and read its `goal_type`, base prompt/persona,
product/company, language, and connected channels. This is what makes the copy
contextual — **match the agent's tone, name its product, write in its language**, do
not invent a generic voice. Note whether the agent books meetings (`goal_type` of
`appointment`, or a booking stage in the funnel): that is what unlocks the meeting
variables and the confirmation/reminder starter set.

### 3. Propose a contextual starter set

Offer 2–4 drafts tailored to the agent's goal, drawn from the starter library in
`references/whatsapp-reference.md` and adapted with the agent's real product, company,
persona, and language. Lead with what fits the goal:

- **Appointment / booking / confirmation agents** → a booking **confirmation**
  (`UTILITY`, `{{fecha}}` / `{{hora}}` / `{{link_reunion}}`, **Confirm** + **Reschedule**
  quick-reply buttons), a **reminder**, and a no-show **reactivation**.
- **Sale / qualification / information agents** → a **greeting** opener, a **follow-up**,
  and a **reactivation**.

Prefer Nexor's canonical variables so they auto-resolve at send time — `{{nombre}}`,
`{{agente}}`/`{{ejecutivo}}`, `{{empresa}}`, `{{producto}}`, and for meetings
`{{fecha}}`, `{{hora}}`, `{{asesor}}`, `{{link_reunion}}` — and add the agent's own
lead-metadata fields when they add value. Other names still work but fall back to LLM
resolution.

### 4. Build buttons and variables exactly as the dashboard form allows

The chat has full parity with the dashboard template builder — use it.

- **Buttons**: `QUICK_REPLY`, `URL` (requires `url`), `PHONE_NUMBER` (requires `phone`).
  Max 10 total, ≤ 2 URL, ≤ 1 phone; a URL button's variable must be at the end of the
  URL; do not interleave quick-reply buttons with URL/phone buttons; label ≤ 25 chars.
- **Variables**: named `{{...}}`, never at the start/end of the body and never adjacent;
  **every variable needs a realistic example** in `variables`. Footer allows no
  variables. A TEXT header may hold at most one variable and needs its own example.

### 5. Preflight → sign-off → submit

1. `review_whatsapp_template_drafts` — read-only preflight. The operator sees each draft
   rendered as a WhatsApp preview (the review card) with its validity and issues. Show
   the returned `normalized_templates`, errors and warnings; revise and repeat until
   `all_valid=true` (you get a `review_id`).
2. Get explicit sign-off on those exact drafts.
3. `create_whatsapp_templates_batch` with those exact drafts, the `review_id`, and
   `confirm=true`. Never invent confirmation. (`create_whatsapp_template` is the
   single-template shortcut when a batch/review loop is overkill.)

### 6. Wire the approved templates into THAT agent's cadence

**This is the step that makes the template actually take effect for the chosen agent** —
a created template does nothing until it has a purpose and is in the agent's pool. After
submitting, for the `workflow_id` from step 1:

- Set each template's purpose with `set_whatsapp_template_purpose` if you did not already
  pass `internal_type` (greeting / follow_up / reminder / reactivation).
- Read the current pool with `get_template_pool`, then add the follow-up / reminder /
  reactivation templates with `set_template_pool` (full-state replace — send the complete
  desired list).
- Set the first-contact openers with `set_opening_templates`.
- Read back with `get_template_pool` and report **which agent now uses which templates**.

### 7. Report approval + wiring

Meta approval is asynchronous — poll `check_whatsapp_template_approvals` until each is
APPROVED or REJECTED. Close by stating the agent, the templates, their purposes, and the
pool wiring so the user sees the whole picture.

- Meta has **no in-place edit**. To fix a REJECTED template, revise it under a **new
  name** and resubmit (optionally `delete_whatsapp_template` the old one after a
  preview).

## "Have my templates been approved?" / "How long until approval?"

In Nexor a bare **"template" always means a WhatsApp template**, so treat any
unqualified template question (approved? how long? list? edit?) as WhatsApp. Templates
also only exist for a **fully connected WhatsApp number** — they are meaningless without
one.

This is the most common template question — answer it with **one tool, from data**, never a guessed time.

1. Call `get_whatsapp_template_approval_status` (it refreshes from Meta first, so the
   answer is current). If it returns `no_whatsapp: true`, there is no connected WhatsApp
   number yet — tell the customer to connect one first (`connect_whatsapp_number`), do
   NOT say they have zero templates. Otherwise it returns a summary, not a dump: `counts` by status,
   `all_approved` / `none`, each `pending[]` template with `pending_hours` (how long it
   has *actually* been waiting), `longest_pending_hours`, `some_pending_over_24h`, each
   `rejected[]` with its Meta `reason`, and `review_window`.
2. Answer from those facts, in the customer's language:
   - `all_approved: true` → "All N templates are approved ✅."
   - Some pending → "X of N approved; Y still under Meta review." Give the **canonical
     window, never a made-up ETA**: *approval is asynchronous and decided by Meta —
     usually a few minutes to about an hour, occasionally up to 24–48h.* If you want to
     be concrete, cite the real wait from `pending_hours` ("the oldest has been pending
     ~3h").
   - `some_pending_over_24h: true` → say it is taking **longer than usual**; if a
     template passes ~48h, the fix is to revise it under a new name and resubmit (Meta
     has no in-place edit).
   - Any `rejected[]` → name them with their `reason`, and offer to revise under a new
     name.
   - `none: true` → there are no templates yet; offer to draft some.
3. Do **not** promise an exact approval time and do **not** poll in a tight loop — one
   call per ask. Approval is genuinely Meta-owned and variable.

## Sending

`send_message` sends to a lead over `whatsapp` (also email/sms/call). Inside the 24-hour
customer-service window you can send free text; **outside it you must pass an approved
`template_id`** — that is how you reopen the conversation or make first contact.

## Response timing

`get_whatsapp_response_timing` / `set_whatsapp_response_timing` control the inbound
debounce (buffer window, ~5-60s): how long Nexor waits to group a lead's rapid
consecutive messages into one reply. Larger = more natural but slightly slower.

## Guardrails

- Never pass `client_id` — the tenant is derived from the key.
- Destructive actions (`disconnect_whatsapp_number`, `delete_whatsapp_template`) are
  preview/confirm or admin-gated; confirm with the customer first and read back what
  will change.
- Images (`set_whatsapp_profile_photo`, IMAGE/VIDEO template headers) need a public
  **https** URL — you cannot upload a local file through these tools.
- Template writes and profile changes go to Meta for review; surface the pending
  review status rather than implying the change is instantly live.

## Related skills

- `automation-architecture` — wiring the agent's workflow, statuses, cadence, and
  transfers that WhatsApp plugs into.
