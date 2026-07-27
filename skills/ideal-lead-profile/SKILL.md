---
name: ideal-lead-profile
description: Define and find the IDEAL / BEST lead (LIP — Lead Ideal Profile). The best lead has RICH, REAL, two-way history — it REPLIED across several channels (inbound, not just got contacted), has depth of interaction over time, an ongoing follow-up plan, AND reached the workflow's goal. Activate when asked about "best leads", "mejores leads", "lead ideal", "perfil ideal", "ICP", "top leads", "omnicanal", "leads con harta historia", or "qué tienen en común los que convierten".
version: 2
tags: [data, analytics, leads, icp, omnichannel, inbound, conversion]
---

# Ideal Lead Profile (LIP) — the best lead has rich, real, two-way history

NOT the lead with the highest budget or the most outbound touches. The best lead is the
one the platform built a real relationship with: it **replied across several channels**,
has **depth of history**, an **ongoing follow-up plan**, and **reached the goal**.
Weight inbound + history heavily — a lead we talked AT across 3 channels but who never
replied is NOT ideal; one who answered on WhatsApp, took the call, and replied by email IS.

The key distinction everywhere: `conversation_messages.direction` = `inbound` (the LEAD
spoke/replied) vs `outbound` (we contacted them). Channels: `whatsapp`, `call`, `email`,
`sms`, `instagram`, `messenger` (calls ARE a channel — `channel='call'`). Exclude
`playground` (test traffic).

## 1. Inbound omnichannel — replied across channels (primary)

Count the channels where the lead actually REPLIED, not just the channels we used.

```sql
SELECT lead_id,
  count(DISTINCT channel) FILTER (WHERE direction='inbound') AS canales_respondidos,
  count(*)               FILTER (WHERE direction='inbound') AS respuestas,
  count(DISTINCT channel)                                   AS canales_totales
FROM conversation_messages
WHERE client_id = '<clientId>' AND channel <> 'playground'
GROUP BY lead_id
```

A lead with `canales_respondidos >= 2` (replied on WhatsApp + answered the call, etc.) is
far stronger than one with 3 outbound channels and 0 replies. Rank by `canales_respondidos`
first, then total channels.

## 2. Historia / profundidad — "harta historia"

Depth and span of the real relationship: how many inbound replies, over how long.

```sql
SELECT lead_id,
  count(*) FILTER (WHERE direction='inbound') AS respuestas,
  min(sent_at) AS primer_contacto, max(sent_at) AS ultimo_contacto
FROM conversation_messages
WHERE client_id = '<clientId>' AND channel <> 'playground'
GROUP BY lead_id
```

Many inbound replies spread over days/weeks = a lead with real history. A burst of 1 reply
in 5 minutes is thinner than 12 replies over 3 weeks.

## 3. Plan de futuro — futurology tasks (ongoing relationship)

The lead has scheduled follow-ups in `futurology_tasks` (the follow-up system): a future
task means the relationship is alive and planned, not abandoned. A lead with futurology
tasks scored + a real inbound history is a prime nurture target.

```sql
SELECT lead_id, count(*) AS tareas_futuro, min(scheduled_for) AS proxima
FROM futurology_tasks
WHERE workflow_id = '<workflowId>' AND status NOT IN ('cancelled','failed')
GROUP BY lead_id
```

## 4. Cumplió el goal del workflow

The lead's run reached the goal status (`workflow_statuses.is_booking_target` for
appointment, `is_qualified` for qualification, or `category='won'`). Count leads that EVER
reached it via the status history (`workflow_run_status_history`, `workflow_run_id` +
`to_status_id`), not only the current status.

```sql
SELECT DISTINCT wr.lead_id
FROM workflow_runs wr
JOIN workflow_run_status_history h ON h.workflow_run_id = wr.id
JOIN workflow_statuses ws ON ws.id = h.to_status_id
WHERE wr.workflow_id = '<workflowId>'
  AND (ws.is_booking_target OR ws.is_qualified OR ws.category = 'won')
```

## 5. Calidad de la llamada — bonus, not a filter

If the lead took a **real call** (a `call_transcripts` row whose `disconnection_reason` is
a normal hangup, not `voicemail_reached` / no-answer), that adds to the profile. Low
latency is a soft tiebreaker — never drop a lead for lacking it.

## Putting it together

Best lead = high inbound omnichannel (replied on 2-3+ channels) + deep history + (bonus)
futurology plan + reached the goal. Build it as CTEs: inbound-channels ∩ goal-reached,
left-joined with history depth + futurology counts, ordered by `canales_respondidos`,
then `respuestas`, then goal, then a clean call.

Present in business language only — link each lead (`[Nombre](/leads/<id>)`), columns like
"Canales que respondió", "Respuestas", "Días de historia", "¿Llegó al objetivo?". Never raw
columns/ids/table names. If asked "qué tienen en común", summarize the shared profile
(avg channels replied, avg history length, % that took a call, % with a future task).
