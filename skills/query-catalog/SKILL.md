# Query Catalog — canonical metric SQL

Canonical, single-definition SQL for the data agent's common metrics. Load this before answering a headline metric so the same question always runs the same query. Reuse verbatim; do not re-derive.

# Query Catalog — Data Agent

Canonical SQL for the high-frequency questions an owner asks NexAI.
Every query MUST filter by `client_id = '{{clientId}}'` (or skip the filter when superadmin). Soft-deleted leads are excluded by default (`leads.deleted_at IS NULL`) unless the operator explicitly asks for the deleted set.

Conventions used below:
- `{{clientId}}` — the tenant id from session context.
- `{{workflowId}}` — optional; when set, scope further with `AND workflow_id = '{{workflowId}}'`.
- `{{tz}}` — client timezone, default `America/Santiago`.
- `{{today}}` — today's date in client timezone (literal `'YYYY-MM-DD'`).
- Date columns are UTC in DB; always convert with `(col AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date`.
- Soft-delete filter is mandatory on `leads` queries (`AND l.deleted_at IS NULL`).
- For meeting-related queries, restrict to workflows with `goal_type = 'appointment'` when the question is client-wide.

---

## Q1.1 — Leads hoy + movimiento en el embudo

Already iterated; canonical pattern uses three queries — count today, count yesterday, count last 7 days, status distribution today. See conversation history.

---

## Q1.2 — Conversión actual lead → objetivo

Goal status is workflow-defined via flags on `workflow_statuses`:
`is_booking_target = true` (appointment workflows) OR `is_qualified = true` (qualification workflows) OR `category = 'won'` (closed-won terminal).

The metric counts runs that EVER passed through a goal status (via `workflow_run_status_history`), NOT just runs currently sitting there.

```sql
WITH goal_statuses AS (
  SELECT id FROM workflow_statuses
  WHERE client_id = '{{clientId}}'
    AND (is_booking_target = true OR is_qualified = true OR category = 'won')
),
reached AS (
  SELECT DISTINCT wr.id AS run_id, wr.workflow_id
  FROM workflow_runs wr
  WHERE wr.client_id = '{{clientId}}'
    AND (
      wr.current_status_id IN (SELECT id FROM goal_statuses)
      OR EXISTS (
        SELECT 1 FROM workflow_run_status_history h
        WHERE h.workflow_run_id = wr.id
          AND h.to_status_id IN (SELECT id FROM goal_statuses)
      )
    )
)
SELECT
  w.name AS workflow,
  COUNT(DISTINCT wr.id) AS total_leads,
  COUNT(DISTINCT r.run_id) AS reached_goal,
  ROUND(100.0 * COUNT(DISTINCT r.run_id) / NULLIF(COUNT(DISTINCT wr.id), 0), 1) AS conversion_pct
FROM workflows w
LEFT JOIN workflow_runs wr ON wr.workflow_id = w.id AND wr.client_id = '{{clientId}}'
LEFT JOIN leads l ON l.id = wr.lead_id AND l.deleted_at IS NULL
LEFT JOIN reached r ON r.run_id = wr.id
WHERE w.client_id = '{{clientId}}'
  AND COALESCE(w.is_active, true) = true
GROUP BY w.id, w.name
ORDER BY total_leads DESC NULLS LAST;
```

Edge cases:
- A workflow with zero leads returns `conversion_pct = NULL` (the `NULLIF` guard). Render as `—` or "sin datos".
- "Reached goal" via status_history covers runs that converted and then moved on (e.g. won → archived); pure-current view would miss them.

---

## Q1.3 — Dónde estoy perdiendo más leads en el embudo

Drop-off per stage = leads who reached stage N but never reached stage N+1.

```sql
WITH statuses AS (
  SELECT id, key, label, sort_order, is_terminal, category
  FROM workflow_statuses
  WHERE client_id = '{{clientId}}'
    AND workflow_id = '{{workflowId}}'
  ORDER BY sort_order ASC
),
reached_per_status AS (
  SELECT
    s.id AS status_id,
    s.sort_order,
    s.label,
    s.category,
    COUNT(DISTINCT wr.id) AS reached
  FROM statuses s
  LEFT JOIN workflow_runs wr
    ON wr.client_id = '{{clientId}}'
   AND wr.workflow_id = '{{workflowId}}'
   AND (
     wr.current_status_id = s.id
     OR EXISTS (
       SELECT 1 FROM workflow_run_status_history h
       WHERE h.workflow_run_id = wr.id AND h.to_status_id = s.id
     )
   )
  LEFT JOIN leads l ON l.id = wr.lead_id AND l.deleted_at IS NULL
  GROUP BY s.id, s.sort_order, s.label, s.category
)
SELECT
  label AS status,
  reached,
  LAG(reached) OVER (ORDER BY sort_order) AS reached_previous,
  LAG(reached) OVER (ORDER BY sort_order) - reached AS lost_here,
  ROUND(
    100.0 * (LAG(reached) OVER (ORDER BY sort_order) - reached) /
    NULLIF(LAG(reached) OVER (ORDER BY sort_order), 0),
    1
  ) AS drop_pct
FROM reached_per_status
ORDER BY sort_order;
```

Edge cases:
- Requires `{{workflowId}}` — drop-off is per workflow because each has its own `sort_order`. For multi-workflow, run per workflow and compare.
- If a workflow has parallel branches (transition_rules creating non-linear flows), `sort_order` may misrepresent the funnel. Note that in the reply.

---

## Q1.4 — Comparativa hoy vs semana pasada / mes pasado

```sql
WITH base AS (
  SELECT (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date AS dia
  FROM leads l
  WHERE l.client_id = '{{clientId}}'
    AND l.deleted_at IS NULL
    AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date BETWEEN '{{today}}'::date - INTERVAL '60 days' AND '{{today}}'::date
)
SELECT
  'hoy' AS periodo, COUNT(*) FILTER (WHERE dia = '{{today}}'::date) AS leads
UNION ALL SELECT 'ayer', COUNT(*) FILTER (WHERE dia = '{{today}}'::date - INTERVAL '1 day')
UNION ALL SELECT 'esta_semana_hasta_hoy', COUNT(*) FILTER (WHERE dia BETWEEN date_trunc('week', '{{today}}'::date) AND '{{today}}'::date)
UNION ALL SELECT 'semana_pasada_mismo_dia', COUNT(*) FILTER (WHERE dia BETWEEN date_trunc('week', '{{today}}'::date) - INTERVAL '7 days' AND '{{today}}'::date - INTERVAL '7 days')
UNION ALL SELECT 'este_mes_hasta_hoy', COUNT(*) FILTER (WHERE dia BETWEEN date_trunc('month', '{{today}}'::date) AND '{{today}}'::date)
UNION ALL SELECT 'mes_pasado_mismo_dia', COUNT(*) FILTER (WHERE dia BETWEEN date_trunc('month', '{{today}}'::date - INTERVAL '1 month') AND '{{today}}'::date - INTERVAL '1 month')
FROM base;
```

---

## Q2.1 — Tiempo de contacto post-entrada

`workflow_runs.first_touchpoint_at` is preaggregated. Compare against `leads.created_at`.

```sql
SELECT
  COUNT(*) AS leads_with_first_contact,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (wr.first_touchpoint_at - l.created_at))) AS p50_seconds,
  PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (wr.first_touchpoint_at - l.created_at))) AS p90_seconds,
  AVG(EXTRACT(EPOCH FROM (wr.first_touchpoint_at - l.created_at))) AS avg_seconds
FROM workflow_runs wr
JOIN leads l ON l.id = wr.lead_id
WHERE wr.client_id = '{{clientId}}'
  AND l.deleted_at IS NULL
  AND wr.first_touchpoint_at IS NOT NULL
  AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '30 days' AND '{{today}}'::date;
```

Edge cases:
- Render seconds as the most natural unit: <60s seconds, <3600s minutes, >3600s hours.
- If `first_touchpoint_at` is NULL on a run, that lead was never contacted — feeds Q2.2 directly.

---

## Q2.2 — Porcentaje de leads contactados

```sql
SELECT
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE wr.first_touchpoint_at IS NOT NULL) AS contacted,
  ROUND(100.0 * COUNT(*) FILTER (WHERE wr.first_touchpoint_at IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_contacted
FROM workflow_runs wr
JOIN leads l ON l.id = wr.lead_id
WHERE wr.client_id = '{{clientId}}'
  AND l.deleted_at IS NULL
  AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '30 days' AND '{{today}}'::date;
```

---

## Q2.3 — Intentos promedio por lead

`workflow_runs.total_touchpoints` is preaggregated.

```sql
SELECT
  COUNT(*) AS leads,
  ROUND(AVG(wr.total_touchpoints)::numeric, 2) AS avg_touchpoints,
  ROUND(AVG(wr.total_responses)::numeric, 2) AS avg_responses,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wr.total_touchpoints) AS p50_touchpoints
FROM workflow_runs wr
JOIN leads l ON l.id = wr.lead_id
WHERE wr.client_id = '{{clientId}}'
  AND l.deleted_at IS NULL
  AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '30 days' AND '{{today}}'::date;
```

Bonus split — by contacted vs not contacted: add `, FILTER (WHERE wr.first_touchpoint_at IS NOT NULL)` to the AVG.

---

## Q2.4 — Mejor canal para contactar

`workflow_run_channel_state` has per-channel touchpoints + response timing.

```sql
SELECT
  cs.channel,
  COUNT(DISTINCT cs.workflow_run_id) AS leads_attempted,
  SUM(cs.touchpoints_total) AS total_outbound,
  COUNT(*) FILTER (WHERE cs.last_response_at IS NOT NULL) AS leads_with_response,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cs.last_response_at IS NOT NULL) /
    NULLIF(COUNT(DISTINCT cs.workflow_run_id), 0),
    1
  ) AS response_rate_pct
FROM workflow_run_channel_state cs
JOIN workflow_runs wr ON wr.id = cs.workflow_run_id
JOIN leads l ON l.id = wr.lead_id
WHERE cs.client_id = '{{clientId}}'
  AND l.deleted_at IS NULL
  AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '30 days' AND '{{today}}'::date
GROUP BY cs.channel
ORDER BY response_rate_pct DESC;
```

Edge cases:
- Client may only have 1 channel enabled — the comparison is degenerate. State that explicitly.

---

## Q3.1 — Porcentaje de leads que agenda reunión

Applies ONLY to workflows with `goal_type = 'appointment'`. Use `calendar_events` (not workflow status proxies).

```sql
WITH appointment_workflows AS (
  SELECT id FROM workflows
  WHERE client_id = '{{clientId}}'
    AND (config->>'goal_type' = 'appointment' OR ai_config->>'goal_type' = 'appointment')
)
SELECT
  COUNT(DISTINCT wr.id) AS total_leads,
  COUNT(DISTINCT ce.lead_id) AS leads_with_meeting,
  ROUND(100.0 * COUNT(DISTINCT ce.lead_id) / NULLIF(COUNT(DISTINCT wr.id), 0), 1) AS pct_scheduled
FROM workflow_runs wr
JOIN leads l ON l.id = wr.lead_id
LEFT JOIN calendar_events ce
  ON ce.lead_id = wr.lead_id
 AND ce.workflow_id = wr.workflow_id
 AND ce.client_id = '{{clientId}}'
WHERE wr.client_id = '{{clientId}}'
  AND wr.workflow_id IN (SELECT id FROM appointment_workflows)
  AND l.deleted_at IS NULL
  AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '30 days' AND '{{today}}'::date;
```

---

## Q3.2 — Tasa de asistencia

```sql
SELECT
  COUNT(*) AS total_meetings,
  COUNT(*) FILTER (WHERE ce.status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE ce.status = 'no_show') AS no_show,
  COUNT(*) FILTER (WHERE ce.status = 'cancelled') AS cancelled,
  COUNT(*) FILTER (WHERE ce.status = 'rescheduled') AS rescheduled,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE ce.status = 'completed') /
    NULLIF(COUNT(*) FILTER (WHERE ce.status IN ('completed','no_show')), 0),
    1
  ) AS attendance_rate_pct
FROM calendar_events ce
WHERE ce.client_id = '{{clientId}}'
  AND (ce.starts_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '30 days' AND '{{today}}'::date;
```

Edge cases:
- Attendance denominator excludes `cancelled` / `rescheduled` (they didn't happen, can't be a no-show).
- For client-wide queries, JOIN to `workflows.goal_type = 'appointment'`.

---

## Q3.4 — Mejores horarios / días de asistencia

```sql
SELECT
  TO_CHAR((ce.starts_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}'), 'Day') AS dia_semana,
  EXTRACT(DOW FROM (ce.starts_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')) AS dow_num,
  EXTRACT(HOUR FROM (ce.starts_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')) AS hora,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE ce.status = 'completed') AS asistidos,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE ce.status = 'completed') /
    NULLIF(COUNT(*) FILTER (WHERE ce.status IN ('completed','no_show')), 0),
    1
  ) AS attendance_pct
FROM calendar_events ce
WHERE ce.client_id = '{{clientId}}'
  AND (ce.starts_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '90 days' AND '{{today}}'::date
GROUP BY dia_semana, dow_num, hora
HAVING COUNT(*) >= 3
ORDER BY attendance_pct DESC NULLS LAST, total DESC
LIMIT 15;
```

Edge cases:
- `HAVING COUNT(*) >= 3` avoids spurious 100% on tiny samples — state the cutoff in the reply.
- 90-day window is wider than the 30-day default; attendance patterns need volume.

---

## Q4.2 — Tasa de cierre reunión → venta

Uses `workflow_run_status_history` to capture the sequence: lead had a meeting status, later moved to a won/sale status.

```sql
WITH meeting_statuses AS (
  SELECT id FROM workflow_statuses
  WHERE client_id = '{{clientId}}' AND is_booking_target = true
),
sale_statuses AS (
  SELECT id FROM workflow_statuses
  WHERE client_id = '{{clientId}}' AND (category = 'won' OR is_qualified = true)
),
runs_with_meeting AS (
  SELECT DISTINCT h.workflow_run_id, MIN(h.changed_at) AS meeting_at
  FROM workflow_run_status_history h
  WHERE h.client_id = '{{clientId}}'
    AND h.to_status_id IN (SELECT id FROM meeting_statuses)
    AND h.changed_at >= '{{today}}'::date - INTERVAL '90 days'
  GROUP BY h.workflow_run_id
),
runs_with_sale_after_meeting AS (
  SELECT rm.workflow_run_id
  FROM runs_with_meeting rm
  WHERE EXISTS (
    SELECT 1 FROM workflow_run_status_history h2
    WHERE h2.workflow_run_id = rm.workflow_run_id
      AND h2.to_status_id IN (SELECT id FROM sale_statuses)
      AND h2.changed_at > rm.meeting_at
  )
)
SELECT
  (SELECT COUNT(*) FROM runs_with_meeting) AS meetings,
  (SELECT COUNT(*) FROM runs_with_sale_after_meeting) AS sales_post_meeting,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM runs_with_sale_after_meeting) /
    NULLIF((SELECT COUNT(*) FROM runs_with_meeting), 0),
    1
  ) AS close_rate_pct;
```

---

## Q4.3 — Tipo / segmento que convierte mejor

Uses `analyze-leads-data` tool with `statusKeys` set to the goal status keys. Avoid raw SQL on `lead_field_values` for >100 leads (timeout risk per operational rules). Two calls — converted vs not — then compare top categorical values.

```pseudo
analyze-leads-data({{clientId}}, workflowId={{workflowId}}, statusKeys=<goal>) → fieldStats_converted
analyze-leads-data({{clientId}}, workflowId={{workflowId}}, statusKeys=<not_goal>) → fieldStats_unconverted
diff: for each field with >=2 categories, surface the category whose share differs most between the two groups.
```

Render as a table with columns: Field | Top category among converted | Share converted | Share unconverted | Delta.

---

## Q7.3 — Mejores fuentes / campañas

Requires the client to have a source/utm field captured in `lead_field_values`. Discover the field key first.

```sql
-- Step 1: discover candidate source fields
SELECT DISTINCT lfv.field_key
FROM lead_field_values lfv
JOIN leads l ON l.id = lfv.lead_id
WHERE l.client_id = '{{clientId}}'
  AND l.deleted_at IS NULL
  AND lfv.field_key ILIKE ANY (ARRAY['%source%', '%utm%', '%campaign%', '%campana%', '%canal%', '%channel%', '%origen%']);
```

If empty: report "No source/campaign field is being captured for this client". Do not invent metrics.

```sql
-- Step 2: aggregate per source (replace :source_field with discovered key)
SELECT
  COALESCE(lfv.value_text, lfv.value::text) AS source,
  COUNT(DISTINCT l.id) AS leads,
  COUNT(DISTINCT l.id) FILTER (
    WHERE wr.current_status_id IN (
      SELECT id FROM workflow_statuses WHERE client_id = '{{clientId}}' AND (is_qualified = true OR is_booking_target = true OR category = 'won')
    ) OR EXISTS (
      SELECT 1 FROM workflow_run_status_history h
      WHERE h.workflow_run_id = wr.id AND h.to_status_id IN (
        SELECT id FROM workflow_statuses WHERE client_id = '{{clientId}}' AND (is_qualified = true OR is_booking_target = true OR category = 'won')
      )
    )
  ) AS reached_goal,
  ROUND(
    100.0 * COUNT(DISTINCT l.id) FILTER (...) /
    NULLIF(COUNT(DISTINCT l.id), 0),
    1
  ) AS conversion_pct
FROM lead_field_values lfv
JOIN leads l ON l.id = lfv.lead_id
LEFT JOIN workflow_runs wr ON wr.lead_id = l.id AND wr.client_id = '{{clientId}}'
WHERE l.client_id = '{{clientId}}'
  AND l.deleted_at IS NULL
  AND lfv.field_key = ':source_field'
  AND (l.created_at AT TIME ZONE 'UTC' AT TIME ZONE '{{tz}}')::date
      BETWEEN '{{today}}'::date - INTERVAL '90 days' AND '{{today}}'::date
GROUP BY source
HAVING COUNT(DISTINCT l.id) >= 5
ORDER BY conversion_pct DESC NULLS LAST, leads DESC
LIMIT 15;
```

Edge cases:
- `lead_field_values` has BOTH `value` (jsonb) and `value_text` (text). Use `value_text` when present, fall back to `value::text`.
- The `HAVING >= 5` cutoff hides noisy sources. State the cutoff.
- If discovered field is empty (`Step 1` returns 0 rows): report and stop, do not synthesize.

---

## Tenant-scope checklist (every query)

1. Every base table reference (`FROM x`, `JOIN y`, subqueries) that has `client_id` MUST include `WHERE client_id = '{{clientId}}'` or `AND ...client_id = '{{clientId}}'`.
2. Tables WITHOUT `client_id` (e.g. `workflow_run_status_history`, `workflow_run_channel_state` — actually both DO have client_id, double-checked) — verify against the schema before assuming.
3. `leads.deleted_at IS NULL` is the default. Drop the filter ONLY when the operator asks about deleted/archived leads.
4. For meeting-related queries, ALWAYS scope to `workflows.goal_type = 'appointment'` (via `config->>'goal_type'` or `ai_config->>'goal_type'`) when the question is client-wide.
5. The `execute-sql` tool string-matches `clientId` in the SQL as a defense; subquery-only scope is risky — prefer outer-query filter.

---

## How to use this catalog

When the operator asks one of these questions (or a close paraphrase), prefer the canonical query over generating ad-hoc SQL. Substitute the template variables from session context. If the operator's question deviates (different window, additional grouping), adapt the query but KEEP the scope filters intact.
