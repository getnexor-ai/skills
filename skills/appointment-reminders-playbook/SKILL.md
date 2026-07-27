---
name: appointment-reminders-playbook
description: Autonomous flow para configurar recordatorios al lead en workflows de tipo appointment. Detecta canales activos, propone set acorde, coordina con templates, crea reglas en una sola pasada.
version: 1.0.0
tags:
  - master-editor
  - reminders
  - appointment
  - autonomous
---

# Appointment Reminders Playbook

Activate this skill when the operator asks for reminders / recordatorios / "que le avise al lead antes de la reunion" / "manda un recordatorio 24h antes" / similar — but ONLY for workflows whose `goal === "appointment"`.

You configure a complete reminder set in ONE round-trip with the operator: detect channels, propose the best-practice set, coordinate templates, create the rules. The operator approves once. You never expose internal terms ("reminder_rules", "trigger_event", "delay_reference").

## ORDER OF OPERATIONS (INVIOLABLE)

You MUST execute steps in this exact order. Skipping a step or reordering produces the failure mode where `createReminderRule` fails with `template_not_approved` and you improvise — that bug is what this checklist exists to prevent.

For ANY appointment-reminders flow:

  ☐ 1. Gate on goal (Step 1)
  ☐ 2. Detect channels (Step 2)
  ☐ 3. List existing rules (Step 3) via agent-leadReminders
  ☐ 4. Build best-practice set scoped to active channels (Step 4)
  ☐ 5. Dedupe vs existing (Step 5)
  ☐ 6. **SYNC + RESOLVE templates per WhatsApp rule (Step 6)** ← the step the bot keeps skipping
       a. Delegate to agent-poolLifecycle: "Sincroniza templates con Meta" (this refreshes WhatsApp template statuses; some PENDING in our DB may already be APPROVED in Meta)
       b. Delegate to agent-templatesCurator to list APPROVED templates
       c. For each WhatsApp rule, find a template that matches the INTENT (confirmation / 24h reminder / 2h reminder) — name keywords + utility category. NOT cold-open / opening templates.
       d. If NO match → AUTO-DELEGATE to agent-templatesAuthor with intent string. Don't ask the operator to pick from non-matching templates.
  ☐ 7. Build single-decision draft (Step 7)
  ☐ 8. Wait for operator confirm, THEN call createReminderRule via agent-leadReminders (Step 8)
  ☐ 9. Report result (Step 9)

If your tool-call list does NOT include `whatsapp-sync-templates` (via pool-lifecycle) AND `agent-templatesCurator` BEFORE `agent-leadReminders.createReminderRule`, you skipped Step 6. STOP. Go back to Step 6 and run it. NEVER call createReminderRule with a `template_name` you have not validated through Step 6.

If a WhatsApp template matching the intent does NOT exist in the catalog after sync + curator listing, the ONLY correct response is to delegate to templatesAuthor and create one. NEVER:
- Ask the operator "qué template uso" with a list of non-matching templates
- Pick a cold-open / opening template as fallback
- Reuse a template name that lives in `workflow.config.template_pool` without validating intent

## Supported channels — HARD LIMIT

The reminder system supports EXACTLY two delivery channels:
- **WhatsApp** (`channel: "whatsapp"`) — uses an APPROVED template
- **Calls** (`channel: "retell"`) — uses a Retell variant (`notification_1h` / `notification_10min` / `notification_5min` / `default`)

**Email is NOT supported. SMS is NOT supported.** These channels exist in other parts of Nexor (host notifications use email; SMS is a runtime channel for the agent) but `reminder_rules` only accepts `whatsapp` and `retell`.

NEVER offer email, SMS, or any other channel to the operator. If the operator asks "puedo mandar recordatorio por email/SMS?", reply once: "Para recordatorios automáticos solo tenemos WhatsApp y llamadas. El email lo usamos para otras notificaciones (al equipo de ventas cuando se agenda una reunión, por ejemplo), pero no para recordatorios al lead." Do not propose unsupported channels under any circumstance.

## Step 1 — Gate on goal

Read `<workflow_context>` from your system prompt. If `goal !== "appointment"` → reply once and stop:

> Esta skill solo aplica para workflows de agendamiento. Este workflow tiene otro objetivo, asi que los recordatorios automaticos no aplican aca. Si quieres notificaciones para otro caso, contame que necesitas y vemos.

Do not call any tool. Do not delegate.

## Step 2 — Detect active channels

Call `read-workflow({ section: "config" })` and inspect `disabled_channels[]`.

- WhatsApp active = `"whatsapp"` NOT in `disabled_channels`
- Retell (calls) active = `"retell"` NOT in `disabled_channels`

If BOTH are disabled → reply once and stop:

> Para configurar recordatorios necesitas tener WhatsApp o llamadas de Retell activos. Actívalos primero en la configuración del workflow y volvemos a esto.

## Step 3 — List existing rules

Delegate to `agent-leadReminders` with input:

> Lista las reglas de recordatorio existentes para este workflow.

The sub-agent calls `listReminderRules` and returns the array. Keep the result; you need it to dedupe.

## Step 4 — Build the best-practice set

Build the proposed set based on the active channels detected in Step 2.

All rules use `trigger_event = "event_created"` (the event that fires when a meeting gets booked). The difference between "fire immediately" and "fire X before/after the event" is encoded in `delay_reference`:
- `delay_reference: "trigger"` + `delay_minutes: 0` → fires at booking time (confirmation)
- `delay_reference: "event_start"` + `delay_minutes: -N` → fires N minutes BEFORE the event start
- `delay_reference: "event_start"` + `delay_minutes: +N` → fires N minutes AFTER the event ends

| Active channels | Rules to propose |
|---|---|
| WhatsApp only | confirmacion_post_booking (channel: whatsapp, delay_minutes 0, delay_reference trigger), recordatorio_24h (channel: whatsapp, delay_minutes -1440, delay_reference event_start), recordatorio_2h (channel: whatsapp, delay_minutes -120, delay_reference event_start) |
| Retell only | llamada_10min_antes (channel: retell, template_name "notification_10min", delay_minutes -10, delay_reference event_start) |
| Both | the 3 WhatsApp rules + the Retell call |

`trigger_event` is always `"event_created"` for all rules in this playbook. Other valid trigger_events (`cancel_event`, `reschedule_event`, `call_analyzed`) are out of scope here — handle them via direct CRUD with agent-leadReminders if the operator asks.

Do NOT propose WhatsApp rules if WhatsApp is disabled. Do NOT propose Retell rules if Retell is disabled.

## Step 5 — Dedupe vs existing

For each proposed rule, check the existing list (Step 3) for a match on `trigger_event + channel + template_name + delay_minutes ≈ same`. If a match exists → drop that proposal, the operator already has it. Keep only the gaps.

If the gap set is empty → reply once and stop:

> Ya tienes el set completo de recordatorios para agendamiento. Si quieres ajustar tiempos o contenido, contame cual.

## Step 6 — Resolve WhatsApp templates per rule (MANDATORY before Step 8)

For each remaining proposal where `channel === "whatsapp"`, you MUST resolve which template to use BEFORE attempting to create the rule. Skipping this step causes `createReminderRule` to fail with `template_not_approved` and forces you to recover by improvising — that is the failure mode we are blocking.

DO NOT use template names from `workflow.config.template_pool` to satisfy this step. The pool is the **assignment list** for outbound sends — those templates were chosen for opening / cold contact, NOT for booking confirmations or meeting reminders. Reusing a `cold_open_*` template for a confirmation reads like a robot to the lead.

The CLIENT's template catalog (everything APPROVED in their WhatsApp Business Account) is the source of truth.

### Step 6a — Sync templates with Meta first

Before reading the catalog, refresh template statuses with Meta. Some templates that show PENDING in our DB may already be APPROVED on Meta's side. Delegate to `agent-poolLifecycle`:

> Sincroniza los templates con Meta para refrescar estados.

This is invisible plumbing — the operator does not need to see "syncing first". Just do it. Sub-agent `pool-lifecycle` already knows the silent-sync pattern.

### Step 6b — List the catalog

After the sync:

1. Delegate to `agent-templatesCurator`:
   > Lista los templates WhatsApp APPROVED para este cliente.
2. From the returned list, look for an existing template that matches the **intent** of the rule:
   - confirmation post-booking → name patterns like `*confirmation*`, `*confirma*`, `*booking*`, `*agendamiento*`, `*reunion_confirmada*`
   - reminder 24h / 2h before → patterns like `*recordatorio*`, `*reminder*`, `*meeting_reminder*`, `*upcoming*`
   Match generously by name keywords AND by category (utility templates intended for transactional flows). DO NOT match cold-open / opening / outbound templates — those are for first contact, never for confirmation/reminder.
3. If a CLEAR match exists in the client catalog → use that `template_name` for the rule, mark `is_active: true`.
4. If NO clear match exists → AUTO-DELEGATE to `agent-templatesAuthor`. Do NOT ask the operator to pick from the pool's existing templates — those don't fit the intent. Pass a clear intent string and let the author propose a new one. Examples (use the workflow's `language` from `<workflow_context>`):
   - confirmacion_post_booking → "Crea un template UTILITY para confirmar al lead que su cita quedó agendada. Idioma: [language]. Variables: nombre del lead, fecha, hora. Tono breve, profesional, sin emojis."
   - recordatorio_24h → "Crea un template UTILITY para recordar al lead 24 horas antes de su cita. Idioma: [language]. Variables: fecha, hora. Tono breve, recordatorio amable."
   - recordatorio_2h → "Crea un template UTILITY para recordar al lead 2 horas antes de su cita. Idioma: [language]. Variables: hora y link de acceso si aplica."

   The author proposes the template content. The operator will approve it and the system submits to Meta automatically. Meta approval takes 1-24h. **In your draft message to the operator (Step 7), mark this rule as "esperando aprobación de Meta" and set `is_active: false` when you eventually call `createReminderRule` (Step 8).**

Use the `language` from `<workflow_context>` to instruct the author. Reference `name` and `company` from the same context to personalize.

NEVER skip this step. NEVER pass a `template_name` to `createReminderRule` (Step 8) that you have not verified exists in the client catalog OR that you have not just proposed via the author. If you call `createReminderRule` with a template name that doesn't exist, it returns `template_not_approved` and you end up improvising in front of the operator — exactly the bug we are preventing.

## Step 7 — Build the single-decision draft

Compose ONE message to the operator that summarizes everything in plain language. Pattern:

> Te propongo configurar N recordatorios para este workflow de agendamiento:
>
> • Confirmacion apenas se agenda la cita (WhatsApp) — usando template "X" que ya tienes aprobado
> • Recordatorio 24 horas antes (WhatsApp) — voy a crear un template nuevo y mandarlo a Meta para aprobacion (tarda entre 1 y 24h)
> • Recordatorio 2 horas antes (WhatsApp) — usando template "Y"
> • Llamada 10 minutos antes (Retell)
>
> Los que dependen de templates en aprobacion quedan listos pero inactivos hasta que Meta los apruebe. ¿Aplico todo?

Wait for explicit confirmation. Do NOT pre-create anything before the operator says yes.

## Step 8 — Create the rules

On confirmation, delegate to `agent-leadReminders` with one batched input:

> Crea estas reglas de recordatorio (una por una via createReminderRule). Todas con trigger_event="event_created":
> 1. channel="whatsapp", template_name="X", delay_minutes=0, delay_reference="trigger", is_active=true
> 2. channel="whatsapp", template_name="recordatorio_24h", delay_minutes=-1440, delay_reference="event_start", is_active=false  // template pending Meta
> 3. channel="retell", template_name="notification_10min", delay_minutes=-10, delay_reference="event_start", is_active=true

The exact param names (`trigger_event`, `delay_minutes`, `delay_reference`, `is_active`) belong to the sub-agent contract — pass them through. Never surface them to the operator.

## Step 9 — Report result

Reply once with the outcome:

> Listo. Cree N recordatorios. M estan activos ahora. K quedaron en espera porque dependen de templates que Meta tiene que aprobar — cuando aprueben (entre 1 y 24h) se activan solos. Si Meta rechaza alguno, te aviso para ajustarlo.

## Hard rules

- Never expose `reminder_rules`, `trigger_event`, `delay_reference`, `delay_minutes` or any DB column to the operator. Translate to plain language ("apenas se agenda", "24 horas antes", "10 minutos antes").
- Never propose a rule for a channel that is in `disabled_channels`.
- Never duplicate a rule that already exists (Step 5 dedupe is mandatory).
- Never invent a template the author did not propose. If the curator found nothing AND the author has not produced one yet, the rule waits.
- Never create rules before the operator confirms the batch in Step 7.
- Never use voseo. Spanish output is neutral: tienes / puedes / contame is OK, but never tenés / podés.
- **Never list templates from `workflow.config.template_pool` as "available templates" for reminders.** The pool is the OUTBOUND ASSIGNMENT list (cold-open / opening templates the agent uses for first contact). Reminder templates have a different intent. Only the curator's catalog of CLIENT-LEVEL APPROVED templates qualifies as "available", filtered by intent match.
- **Never recover from `template_not_approved` by asking the operator to pick from existing templates.** That error means Step 6 was skipped. The recovery is: STOP the createReminderRule loop, run Step 6 properly (curator → match by intent → if no match, AUTO-DELEGATE to author), then resume from Step 7 with the new draft. Do NOT improvise a new question to the operator.

## Anti-pattern examples

**WRONG (asking the operator what to configure):**
> ¿Quieres recordatorio 24h, 2h, ambos? ¿Por WhatsApp o llamada?

You already know the answer from `disabled_channels` and the best-practice table. Propose the full set.

**WRONG (creating rules before approval):**
> *(calls createReminderRule x3 without asking)*
> Listo, cree 3 recordatorios.

Always batch the proposal in Step 7 and wait for yes.

**WRONG (proposing for a disabled channel):**
> Te configuro la llamada 10 minutos antes (Retell)

…when Retell is in `disabled_channels`. Skip it silently.

**WRONG (jerga interna):**
> Cree una reminder_rule con trigger_event=event_created, delay_reference=event_start, delay_minutes=-1440.

Translate: "recordatorio 24 horas antes de la cita".
