---
name: data-analysis-playbook
description: Schema gotchas, exact column names, and SQL patterns for querying the Nexor Postgres correctly. Activate before writing any non-trivial query (joins, status funnels, time-series, percentiles, email/conversation/transcript lookups) so the SQL is right the first time.
version: 1
tags: [data, analytics, sql, schema, nexor]
---

# Data Analysis Playbook

Load this when a question needs more than a trivial COUNT — joins, funnels,
time-series, percentiles, or reading conversations/transcripts. The exact
column names below are the ones that bite; guessing them wastes a tool call.

## Column-name traps (verify, don't assume)

These tables use NON-obvious column names. Get them wrong and the query errors:

- `conversation_messages` — direction (`'inbound'`/`'outbound'`) NOT `role`; `content_text` NOT `content`; `sent_at`; `channel` (`whatsapp`/`sms`/`email`); `meta` (jsonb).
- `meeting_transcripts` — `transcript_text` (full text), `summary`, `action_items[]`, `questions[]`, `keywords[]`; linked to a meeting via `calendar_event_id`.
- `calendar_events` — `starts_at` / `ends_at` NOT `start_time`/`end_time`; `status` (scheduled/confirmed/completed/no_show/cancelled/rescheduled).
- `lead_insights` — `title` + `description` NOT `content`.
- `workflow_runs` — `current_status_id` NOT `current_status`.
- `lead_field_values` — both `value` (jsonb) and `value_text` (text); field identity via `field_id` / the field's `key`.
- `email_senders` — `sender_email` / `sender_name` / `can_send` NOT `email`/`name`/`is_active`.
- `mail_logs` — delivery metadata: `recipient_email`, `subject`, `status` (queued/sent/delivered/bounced/complained), `opened_at`, `bounced_at`, `sent_at`.
- `leads` — `first_name` + `last_name` (no single `name`); `email`, `phone`.

When unsure, call get-db-schema for the table rather than guessing.

## Time / timezone (mandatory)

Timestamps are stored in UTC. NEVER use `CURRENT_DATE`, `NOW()`, `today()`.
Convert to the client timezone before comparing or grouping by date:

```sql
(created_at AT TIME ZONE 'UTC' AT TIME ZONE '<tz>')::date
```

"Last 7 days" = from (today − 6 days) to today inclusive, no future dates.
Always use the literal `'<today-in-tz>'` from the session context, not SQL now.

## Status funnels — count history, don't stack

- A lead "reached" a status if its run EVER had that status — count `workflow_runs`
  whose history includes the status, not only runs currently sitting there.
- Do NOT use `workflow_statuses.sort_order` to infer the funnel order or to
  "stack" statuses. Count each status's runs directly.
- "engaged" = runs that at some point had `engaged`, regardless of current status.

## Hygiene filters (state them in a closing note)

- Exclude soft-deleted rows: `WHERE deleted_at IS NULL`. Note how many you excluded.
- Exclude test/clone workflows (names like `[TEST ...]`, `[CLONE prod ...]`, demo).
- Always filter by `client_id` unless superadmin (clientId NULL).

## Email lives in TWO places

- Content + direction → `conversation_messages WHERE channel = 'email'`.
- Delivery / opens / bounces / subjects → `mail_logs`.
  For email analytics use `mail_logs`; for thread content use `conversation_messages`.

## Common recipes

- Percentiles: `percentile_cont(0.5) WITHIN GROUP (ORDER BY x)` (P25/P50/P75).
- Numeric field from `lead_field_values`: prefer the `analyze-leads-data` tool
  (pre-computes min/max/mean/median/p25/p75 per field key) over hand SQL —
  field keys are per-workflow and often Spanish (`sueldo_liquido`, not `salary`).
- Meetings are only meaningful for workflows with `goal_type = 'appointment'`.
- Always show the full meeting status breakdown, not just `completed`.
