# Booking agent: from an empty account to a bookable appointment agent

The tool definitions in your context are the authority on argument types. This file is the authority on **order and prerequisites**: which booking tool to call after which, what each one needs to exist first, which step a human must perform, and what `get_account_readiness` will report as a blocker until it is done.

Read [mcp-tool-surface.md](mcp-tool-surface.md) for write/read-back pairs and overwrite semantics; read [recipes.md](recipes.md#21-build-a-bookable-appointment-agent-on-a-fresh-account) for the worked example.

## Contents

1. [Runtime tools vs MCP tools](#1-runtime-tools-vs-mcp-tools)
2. [The ordered path](#2-the-ordered-path)
3. [Meeting type](#3-meeting-type)
4. [Hosts, schedule, calendar](#4-hosts-schedule-calendar)
5. [Reminders — the full contract](#5-reminders--the-full-contract)
6. [Host routing](#6-host-routing)
7. [Booking settings](#7-booking-settings)
8. [Operator meeting operations and outcomes](#8-operator-meeting-operations-and-outcomes)
9. [Calendly instead of a native calendar](#9-calendly-instead-of-a-native-calendar)
10. [External booker — the client's own booking endpoint](#10-external-booker--the-clients-own-booking-endpoint)
11. [Readiness and verification](#11-readiness-and-verification)

---

## 1. Runtime tools vs MCP tools

Two tool vocabularies share the word "tool", and only one of them is yours.

| Vocabulary | Who calls it | Examples |
|---|---|---|
| **MCP tools** — the ones in your context | You, on the operator's behalf | `create_meeting_type`, `add_executive`, `set_host_schedule`, `connect_calendar`, `set_reminder_rule`, `book_meeting` |
| **Runtime agent tools** — built into the conversational agent | The agent, mid-conversation with a lead | `get_available_slots`, `confirm_and_book`, `create_event`, `reschedule_event`, `cancel_event`, `request_channel_swap`, `schedule_followup`, `save_field`, `patch_metadata` |

**A runtime tool is not callable over MCP.** It has no MCP tool definition, it is never listed by `list_workflow_tools` unless the client registered a same-named HTTP tool, and calling it from here fails. Runtime tool names appear in this skill for exactly two purposes: stage-gating them via `available_in_statuses` (they honor the same gate as client tools) and disabling them in `disabled_builtin_tools` for an external booker. When an operator wants a meeting created, moved or cancelled *now*, the MCP equivalents are `book_meeting`, `reschedule_meeting`, `cancel_meeting` and `change_meeting_host` (§8) — never the runtime names.

Likewise, account discovery is `get_account_readiness` plus the channel list tools (`list_whatsapp_numbers`, `list_email_senders`, `list_phone_numbers`) and `get_integration_status`. No other inspection tool exists on the MCP.

---

## 2. The ordered path

Each step depends on the one before it: a meeting type needs a workflow, a host needs a meeting type to cover, a schedule needs a host, a calendar connection needs a team member, a reminder needs a channel resource, activation needs all of it. `get_account_readiness` reports the missing step as a blocker on the agent's `booking` block with the `fix_tools` to call; `review_agent_system_plan` refuses an appointment plan that omits a meeting type, a host, or a calendar plan.

| # | Step | Tool | Must already exist | Read back / done when |
|---|---|---|---|---|
| 0 | Discover | `get_account_readiness`, `list_team`, `list_workflows`, `get_integration_status` | — | You know the saved timezone, the team members (their `user_id`s), existing agents, and `calendars[]` / `booking_providers[]` |
| 1 | Create the agent, paused | `create_workflow({ goal_type: "appointment", timezone, language, statuses, fields, … })` | — | `status: "created"`. The three core stages and the virtual Discarded column always exist and are never part of your `statuses`; design your booking stages after them. `timezone` is the booking anchor every offered slot is rendered in — pass it explicitly or read the inherited one back |
| 2 | Meeting type | `create_meeting_type({ workflow_id, name, duration_minutes, location_type, … })` — or reuse the one `list_meeting_types` returns | Step 1 | Exactly one meeting type on the workflow (`status: "existing"` means reuse; `MULTIPLE_MEETING_TYPES` means consolidate first). Created **active**; bookable once a host with availability is assigned |
| 3 | Host | `add_executive({ workflow_id, user_id, meeting_type_ids? })` per human who takes meetings; `invite_user` first when the person is not on the team yet | Step 2, a team member | `list_executives` shows the host active and covering the meeting type. One eligible member and no host yet → `auto_assign_solo_host({ workflow_id })` does this step |
| 4 | Availability | `set_host_schedule({ user_id, timezone, slots: [{ weekday, start, end }] })`, plus `set_host_blocks` for days off | Step 3 | `get_host_availability({ user_id })` returns the schedule; the `BOOKING_AVAILABILITY_REQUIRED` blocker disappears |
| 5 | Calendar — **human step** | `connect_calendar({ user_id, provider: "google" \| "outlook" })` → `connect_url` | Step 3 (`confirm: true` when `user_id` is not the operator) | Send the URL to that host; they authorize in the browser. Poll `get_calendar_connections({ user_id })` until `status: "active"`. Never claim it is connected before the poll says so |
| 6 | Reminders | `get_reminder_catalog({ workflow_id })` → `set_reminder_rule` per rule (§5); `set_host_reminder_rule` for the rep's booking email | A channel resource the catalog marks `available_for_account` | `list_reminder_rules({ workflow_id })` / `list_host_reminder_rules` show each rule `is_active: true` |
| 7 | Routing (2+ hosts) | `set_meeting_type_routing` (§6) | Step 3 with several hosts | Rules read back on the meeting type |
| 8 | Preflight | `review_agent_system_plan({ plan })` with `meeting_type`, `hosts[]` and `calendar_plan` on the appointment agent | Steps 1–7 | `ready_for_signoff: true`, then the operator approves the `plan_fingerprint` |
| 9 | Activate | `set_workflow_active({ workflow_id, active: true })` | `get_account_readiness` shows zero booking blockers | `list_workflows` shows the agent active; a `get_workflow_slots` probe returns slots |

Steps 2–7 mutate; run them only after the review in step 8 has been approved — the review can be run on the plan before anything exists, which is the normal order: plan → review → sign-off → steps 1–7 → read back → activate. Keep the agent paused throughout.

---

## 3. Meeting type

`create_meeting_type` accepts the dashboard's fields; omitted ones take the dashboard defaults (30 min, 15 min buffer, 2 h notice, 14 days ahead, video).

| Field | Contract |
|---|---|
| `name` | Required, ≤120 chars |
| `duration_minutes` | 5–480 |
| `buffer_after_minutes` | 0–120, gap held after each meeting |
| `min_notice_hours` | 0–336 |
| `max_days_ahead` | 1–365 |
| `location_type` | `video` \| `phone` \| `in_person` |
| `video_provider` | `google_meet` \| `teams` \| `null` (whichever calendar the host connected). Only with `video` |
| `location_details` | **Required when `location_type` is `in_person`**; the address guests see |
| `allow_overbooking` + `max_bookings_per_slot` | 2–20 per slot; only with overbooking on |
| `event_title_template`, `event_description_template` | What the calendar invite shows |
| `agent_selection_criteria` | Free text the agent reads when picking a host — **not server-enforced**; §6 |
| `is_active` (`update_meeting_type` only) | Only one type per workflow can be active |

One workflow, one meeting type. If several exist, help the operator consolidate (`delete_meeting_type` reports `agent_assignments_removed` / `future_events_orphaned`; the last type of an appointment workflow cannot be deleted — `LAST_APPOINTMENT_TYPE`).

---

## 4. Hosts, schedule, calendar

**Hosts are team members.** `add_executive` takes a `user_id` from `list_team`; someone not on the team is invited first with `invite_user` and only becomes a host after accepting (`list_pending_invitations` shows the wait). Adding an existing host again fails with a conflict — read `list_executives` first. `update_executive` replaces the host's **complete** `meeting_type_ids` set and toggles `is_active`; `remove_executive` stops new bookings without touching existing meetings.

**Availability is per host, in the host's timezone.** `set_host_schedule` writes the complete weekly schedule (`weekday` 0 = Sunday … 6 = Saturday, `start`/`end` as `HH:MM`); an empty `slots` array clears it. `set_host_timezone` changes the zone the slots are read in (`null` falls back to the account); `set_host_blocks({ add: [{ date, start?, end?, all_day?, reason? }], remove: [ids] })` handles days off. The workflow timezone (step 1) is what the lead sees; the host timezone is what the schedule is expressed in — do not conflate them.

**A calendar connection is the human step.** `connect_calendar` returns a `connect_url` that only the host can complete; there is no token you can paste. Tell the operator exactly who must open which link, then poll `get_calendar_connections`. Statuses: `active` (usable), `expired` / `needs_reauth` / `error` (call `connect_calendar` again — a broken connection blocks that host's slots, a never-connected one merely yields none), `revoked`. `disconnect_calendar({ connection_id, confirm })` previews without `confirm: true`.

Pure-schedule hosts (schedule set, no calendar) are offered; conflicts with their real calendar are then invisible. State that trade-off when a host declines to connect.

---

## 5. Reminders — the full contract

Call `get_reminder_catalog({ workflow_id })` before writing any rule. It is the only source of truth for which channels this account can actually use — never assume from memory, and never propose a channel the catalog marks unavailable.

### `set_reminder_rule` arguments

| Argument | Contract |
|---|---|
| `trigger_event` | One the runtime actually dispatches: `event_created` (a booking happened; **re-dispatched for the new time after a reschedule**), `event_cancelled`, `call_analyzed` (post-**call**, ~30 s after the agent's call — not post-meeting), `event_enrolled` (event-goal agents). **There is no reschedule trigger** — a "reminder after reschedule" is the `event_created` rule firing again |
| `channel` | `whatsapp` \| `retell` \| `sms` \| `email`, each subject to `available_for_account` in the catalog: WhatsApp needs an active number, `retell` a callable number, `sms` an SMS-enabled number, `email` a verified sender. Default `whatsapp` |
| `template_name` | WhatsApp: the exact name of an **APPROVED** template whose intent matches (confirmation / reminder), never an opening or cold-contact template. `retell` / `sms` / `email`: a variant key — `default`, `notification_1h`, `notification_10min`, `notification_5min` |
| `delay_minutes` | **Signed.** `0` = at the trigger; `-1440` = 24 h before; positive = after |
| `delay_reference` | `trigger` (default; count from the moment the event fired) or `event_start` (count from the meeting start — the only sensible reference for pre-meeting reminders). The catalog may list `event_start_local`, `event_end`, `contact_schedule_start` for other agent kinds |
| `is_active` | Default `true`; write `false` for a rule whose WhatsApp template is still pending Meta approval |
| `workflow_id`, `name` | Scope the rule to the agent; name it for the operator |

Writes are idempotent upserts. There is no database check on `trigger_event` / `channel` — the tool validates against the catalog, which is why a hand-typed value must come from it.

### The default set

Propose the complete set in one message, scoped to the channels the catalog allows, and create nothing before the operator approves the batch:

| Rule | `trigger_event` | `channel` | `delay_minutes` | `delay_reference` |
|---|---|---|---|---|
| Confirmation at booking | `event_created` | `whatsapp` (or `email` / `sms`) | `0` | `trigger` |
| Reminder 24 h before | `event_created` | `whatsapp` | `-1440` | `event_start` |
| Reminder 2 h before | `event_created` | `whatsapp` | `-120` | `event_start` |
| Call 10 min before | `event_created` | `retell`, `template_name: "notification_10min"` | `-10` | `event_start` |
| Cancellation notice | `event_cancelled` | any available | `0` | `trigger` |

Dedupe against `list_reminder_rules` on `trigger_event + channel + delay_minutes` before proposing. For each WhatsApp rule, resolve the template first: `sync_whatsapp_templates`, then `list_whatsapp_templates({ status: "APPROVED" })`, match by intent; when nothing matches, draft one with `review_whatsapp_template_drafts` → `create_whatsapp_templates_batch` and create the rule `is_active: false` until Meta approves. Never satisfy a reminder with a template from the opening pool.

### Host notifications

`set_host_reminder_rule` is **email only** and its only trigger is `event_created` (`delay_reference` `trigger` or `event_start`). Host cancellation and reschedule alerts are on by default and are not configured through rules; `list_host_reminder_rules` may therefore look empty on an account that is already notifying.

---

## 6. Host routing

Two layers, and only one is enforced:

- `agent_selection_criteria` on the meeting type (`update_meeting_type`) is prose the agent reads when several hosts are available. Keep it short and ordered; never claim it is a server rule.
- `set_meeting_type_routing({ workflow_id, meeting_type_id?, agent_selection_rules })` is **enforced server-side at offer time and book time**. Reference hosts by `user_id` from `list_executives`; every referenced host must already be assigned to the meeting type. Shapes:
  - Field tiers: `{ field: "<lead field key>", tiers: [{ min: 50000, agents: [<id>] }, { min: 0, agents: [<id>, <id>], weights: [2, 1] }, { min: -1e9, action: "disqualify" }] }` — tiers ordered by descending `min`; `disqualify` blocks booking for leads in that tier.
  - Field-less rotation: `{ routing: "cycle", tiers: [{ agents: [<a>, <b>], mode: "cycle", pattern: [0, 1] }] }` — strict alternation; `mode: "round_robin"` (default) is an even split, `weights` skews it.
  - `agent_selection_rules: null` clears.
- Zero or one host: no routing decision exists — do not write rules. After the operator adds a second host, offer once: keep the even split or define a rule.

`set_host_assigner` is the third option: the client's own endpoint decides the host (`tool` = an existing active workflow tool, `id_field` = the response field carrying the seller id, `external_key` mapping it to a Nexor user or `identity: true` when it already is one). `test_host_assigner` runs the call without booking. Use it only when the client owns the rotation, as in recipe 13.

---

## 7. Booking settings

| Setting | Tool | Notes |
|---|---|---|
| Everything at once | `get_workflow_booking_settings({ workflow_id })` | Read before changing any of the below |
| Guests on every invite | `set_default_attendees({ workflow_id, attendees: [{ email }] })` | Replaces the list |
| Lead confirmation email | `get_meeting_confirmation_email` / `set_meeting_confirmation_email({ workflow_id, meeting_type_id, email_config })` | `subject`, `title`, `greeting_body`, `cta_text`, `calendar_note`, `disclaimer`, `sections[]`, `sender_name`; `send_to_lead: false` suppresses the lead copy. Always `preview_meeting_confirmation_email` and show the operator the render before saving |
| Client-owned host choice | `set_host_assigner` | §6 |
| Client-owned calendar | `set_external_booking` | §10 |

---

## 8. Operator meeting operations and outcomes

These are the MCP-side equivalents of what the agent does at runtime. Every write previews when `confirm` is omitted and executes only with `confirm: true` after the operator approved that exact meeting.

| Ask | Tool | Contract |
|---|---|---|
| "What is booked / who no-showed" | `list_meetings({ workflow_id?, lead_id?, status?, date_from, date_to, date_field })`, `list_lead_meetings` | `status` ∈ `scheduled` \| `completed` \| `cancelled` \| `no_show` \| `rescheduled` |
| "What is our show rate" | `get_meeting_stats({ workflow_id?, date_from, date_to })` | `show_rate`, `completion_rate`, `no_show_rate` |
| "Which slots are free" | `get_workflow_slots({ workflow_id, from, to, meeting_type_id?, host_id? })` | Also the activation probe: empty slots on a fresh agent means step 4 or 5 is missing |
| "Book X for this lead" | `book_meeting({ workflow_id, lead_id, host_id, starts_at, idempotency_key, confirm })` | `starts_at` from `get_workflow_slots`; `idempotency_key` makes a retry return the same meeting instead of a duplicate; `invite_lead: false` skips the lead email |
| "Move it" | `reschedule_meeting({ meeting_id, starts_at \| slot, keep_host, confirm })` | `keep_host: false` requires `host_id` |
| "Give it to another host" | `change_meeting_host({ meeting_id, host_id, confirm })` | |
| "Cancel it" | `cancel_meeting({ meeting_id, reason?, confirm })` | Cancels on the provider **first**, then locally; the lead cancellation email always sends |
| Record the outcome | `set_meeting_status({ meeting_id, status: "no_show" \| "completed", note? })` | Outcomes feed `get_meeting_stats` and no-show recontact; record them, do not leave meetings `scheduled` forever |
| Notes from the meeting | `ingest_meeting_notes` | |

---

## 9. Calendly instead of a native calendar

When hosts book through Calendly, Calendly owns the calendar; Nexor mirrors bookings and offers Calendly's availability. Order:

1. `connect_calendly` → hosted authorization URL (human step); `get_calendly_status` until connected. `reconnect: true` rotates the webhook subscription.
2. `set_calendly_host_mode({ mode: "teams" })` (the only supported mode), then `map_calendly_hosts({ calendly_user_uri, host_user_id })` for every Calendly user → Nexor host. `list_calendly_event_types({ owner_uri? })` shows what each one offers.
3. `set_calendly_binding({ workflow_id, meeting_type_id, host_user_id, event_type_uri })` per host — a host without a binding is **silently excluded** from booking; `get_integration_status.booking_providers[].excluded_hosts` and `get_account_readiness` (`CALENDLY_BINDING_REQUIRED`) both surface it. `list_calendly_bindings({ workflow_id })` reads back; `event_type_uri: null` clears.
4. `provision_calendly({ wait: true })` runs the provisioning report; `disconnect_calendly({ confirm: true })` tears it down.

Steps 4 (host schedule) and 5 (native calendar) of §2 are replaced by this list; steps 2, 3, 6 and 8–9 stay. In the plan, express it as `calendar_plan: { provider: "calendly" }`.

---

## 10. External booker — the client's own booking endpoint

When the client's HTTP endpoint owns the calendar, Nexor does not generate slots; it mirrors every booking into a meeting so reminders, confirmation emails, funnel movement and stats keep working. Configure it with `set_external_booking({ workflow_id, external_booking })`, never through `update_workflow_config`.

**All four verbs are required: slots, create, reschedule, cancel.** `tool` (create), `reschedule_tool` and `cancel_tool` are required arguments, `reschedule_tool` must differ from `tool`, and every named tool must exist and be active on the workflow (`TOOL_NOT_FOUND`). The reason is not tidiness: a verb that is not configured is silently never mirrored — a lead who cancels through the agent keeps a live meeting, reminders keep firing, the dashboard says "scheduled", and the agent, facing an error with no branch for it, narrates a cancellation that never happened.

**The only exception is written acceptance.** If the client genuinely cannot expose cancel or reschedule, the operator must state in the conversation, in their own words, that they accept that cancellations and reschedules made through the agent will not reach their system and will leave phantom meetings and stale reminders. Record that sentence in the configuration spec next to the `external_booking` block. Without it, do not ship a booker with fewer than four verbs — offer the in-code providers (`native`, Calendly, GoHighLevel via `provider: "gohighlevel"`) instead. Do not treat "we'll add cancel later" as acceptance.

Other contract points: `fields` are dot-paths into the **raw** tool response (`data.slots.0.start`, never brackets); `starts_at` is the only required mapping; `success_path` names the field that must be truthy for the booking to count (an endpoint that signals failure with a 200 body otherwise mirrors a phantom booking); `provider` defaults to `external_booker`, which auto-gates the native booking tools — still set `disabled_builtin_tools` with the runtime names (§1) so the prompt and the tool set move together. In the plan, express it as `booking_provider: "external_booker"`.

---

## 11. Readiness and verification

| Check | Tool | Proves |
|---|---|---|
| Booking blockers per agent | `get_account_readiness` → agent `booking` block | Zero blockers (`MEETING_TYPE_REQUIRED`, `BOOKING_AVAILABILITY_REQUIRED`, `CALENDLY_BINDING_REQUIRED`, timezone warnings) and no `fix_tools` left |
| Calendar health | `get_integration_status.calendars[]` | Every host `status: "active"`; `booking_providers[].excluded_hosts` empty |
| Slots exist | `get_workflow_slots` over the next 7 days | Non-empty for every host |
| Reminders wired | `list_reminder_rules({ workflow_id })`, `list_host_reminder_rules` | The approved set, each `is_active: true` |
| Routing | read-back of `set_meeting_type_routing` | Rules name only assigned hosts |
| A real booking | `book_meeting` with `confirm: true` on a test lead, then `list_meetings` and `cancel_meeting` | The meeting exists with host, time in the workflow timezone and a meeting link; cancelling removes it on the provider |

An active agent with booking blockers cannot book. Do not report an appointment agent as done from `set_workflow_active` alone.
