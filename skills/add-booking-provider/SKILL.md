---
name: add-booking-provider
description: >-
  A vendor-agnostic contract for connecting a booking/calendar provider
  (cal.com, Calendly, GoHighLevel, Outlook, or a client's own HTTP booker) to an
  AI-agent + MCP platform. Use this skill BEFORE writing a line for a new
  provider, when a client says "we use cal.com / Acuity / our own booker", or
  when debugging why an existing provider's meetings do not mirror, do not
  remind, or do not cancel. It encodes the hard-won invariants of booking
  integration as a checklist. Picking the wrong integration shape
  (external-booker vs in-code provider) is the first and most expensive mistake;
  shipping an in-code provider that touches only its own feature directory —
  and none of the cross-cutting registrations — is the second.
---

# Adding a booking provider to an agent + MCP platform

**One question, answered definitively: "I need to connect a booking provider. What EXACTLY do I have to build so it is 100% complete and I repeat none of the known mistakes?"**

This skill is written for a two-service architecture common to conversational-agent booking systems:

- an **API service** that owns events, tools, prompts, reminders, cancel/reschedule, OAuth, and webhooks, and
- an **MCP service** that owns slot generation, availability reads, and the agent-facing booking write path.

The exact file names differ per codebase; the **concerns** and their failure modes do not. Map each concern below onto your own modules before you start.

**Start at §1** — it picks your integration shape, and the shape decides which half of this doc is yours.

| | **External-booker** (client's own HTTP tools, config only) | **In-code provider** (you write the vendor integration) |
|---|---|---|
| Build | §3 (the config contract) | §2 (every concern, both services) + §5 (tool + prompt gating) |
| Then, both | §4 downstream acceptance · §4A visibility · §6 invariants · §7 ops · §8 don't-touch list | ← same |
| Ship | §9 N/A table (zero blanks) → §10 checklist | ← same |

§6 (invariants) and §9 (dimensions) are written for in-code. On external-booker most of §6 and many §9 dimensions are N/A — **but you still owe each one a written reason** (§9). That is the whole point: **N/A is a decision, silently skipping is a bug.**

## North star (three clauses)

1. **Every booking, from every provider, converges on exactly ONE canonical event record + one side-effect bundle — and that record is ASSIGNED to a human who can SEE it.** The record is what lights up reminders, host notification, the lead's confirmation, funnel movement, cadence-stop, activity log, and transcription. "Converges" also means it **never silently fails to converge**: a self-serve booking link that returns before the insert when the lead can't be resolved produces zero records — swallowed at `info` level (§6.3). And a record nobody is assigned to is a record nobody works: an unassigned meeting sends no confirmation email and cannot be deleted from the vendor. Assignment and visibility are **downstream acceptance criteria (§4A)**, not an afterthought.
2. **A guard that keys on a registration you skipped provides ZERO protection for exactly the case it was written for.** If your "refuse to cancel/reschedule an externally-managed event" guard reads a set your provider was never added to, the guard is decorative for your provider.
3. **Every dimension in the matrix is either IMPLEMENTED or explicitly declared NOT APPLICABLE with a written reason. Never silently skipped.** The classic failure is high-quality local code with zero cross-cutting registrations: no alerts, no reconciler, no kill switch, no doc index entry. The author was careful everywhere they could *see*.

**The meta-rule that makes that failure impossible to repeat — THE DIFF.** Take your most completely-wired existing provider. Every file it touches and yours does not is a decision you owe an answer to.

```bash
# run from your API service. `diff` exits 1 when the lists differ — read the output, not the exit code.
diff <(grep -rIl "<reference-provider>" src/ | grep -v test | sort) \
     <(grep -rIl "<your-provider-key>" src/ | grep -v test | sort)
```

**That diff — not your feature directory — is the real checklist.** Every `<` line is implemented, or N/A with a written reason, in the §9 table. Drive *unanswered* to zero — not *implemented* to the full count.

Two scoping rules, because getting them wrong is how this check gets muted:
- **Keep `| grep -v test` and stay in `src/`.** Widen to fixtures/docs and the totals balloon with noise. Cover migrations and docs as their own passes instead.
- **Totals ≠ diff-exclusives.** A provider's file *total* is not the count of files that are *only* that provider's. Quoting one as the other is how a calibration figure rots.

*(This is a pre-ship gate, not step one — you need a decided key and shape first. Start at §1.)*

---

## 1. DECISION TREE — external-booker vs in-code provider

**Pick wrong and everything downstream is wrong. Decide this first, in writing, before any code.**

```
Does the CLIENT already have a working booking endpoint they control?
│
├─ YES ─► Do they want the agent to call THEIR HTTP endpoint?
│         │
│         ├─ YES ─► Do they have all FOUR verbs? (slots/read, create, reschedule, cancel)
│         │         ├─ YES ─► ►►► EXTERNAL-BOOKER (§3). Zero integration code. Config only.
│         │         └─ NO  ─► ►►► STOP. Do NOT ship. See §3.0 — cancel and reschedule
│         │                       tools are REQUIRED, not optional. Either they build the
│         │                       missing verbs, or you go in-code.
│         │
│         └─ NO (they want you to talk to the vendor's API directly) ─► fall through ▼
│
└─ NO / vendor-native (cal.com, Calendly, Acuity, GoHighLevel, Outlook)
   │
   ├─ Is the provider used by >1 client, or will it be? ──── YES ─► ►►► IN-CODE (§2)
   ├─ Does the agent need to OFFER slots from it? ────────── YES ─► ►►► IN-CODE (§2)
   ├─ Does the vendor own the calendar (you must not mutate it)? ─► IN-CODE (§2),
   │                                                   and it is EXTERNALLY-MANAGED (§2.3)
   └─ One-off, client-specific, they'll wire their own webhook ─► EXTERNAL-BOOKER (§3)
```

### Criteria table

| Signal | External-booker | In-code provider |
|---|---|---|
| Who calls the vendor? | The **agent**, via an HTTP tool the client configured | **Your code**, via a provider client module |
| Who owns availability? | The client's endpoint. You never generate slots. | Your MCP slots service, with a provider branch reading vendor availability |
| Code delta | **Zero.** Workflow config only. | Many files across both services. See §2. |
| Reusable across clients? | No — the tool is per-workflow, name-keyed | Yes — a registry key |
| You write the underlying Google/Outlook calendar directly? | No — you have no credential for it | Externally-managed (Calendly, cal.com) → **no**, the vendor owns that. Native (Outlook/Google) → **yes**. |
| You call the **vendor's own API** to cancel/reschedule? | **Yes** — via the client's cancel/reschedule tools | **Yes, even for externally-managed.** "Externally-managed" means *you do not own the calendar*, **never** *you are read-only*. Conflating the two ships a mirror-only cancel and leaves the meeting live on the host's calendar forever. |
| Time to ship | Hours | Weeks |
| Blast radius of a mistake | Silent phantom meetings for 1 client | Silent split-brain cancels for every client on the key |

### A worked example: an availability-model, externally-managed vendor (e.g. cal.com)

A vendor like cal.com is **in-code, externally-managed, availability-model**:

- It has a public API, will be multi-client, and you must OFFER its slots → **in-code**.
- It owns the calendar; you must not write the host's underlying Google/Outlook → add the key to your **externally-managed** set (§2.3).
- Its availability is an **API you query**, not a **busy-list you subtract**. Model it on your other *query-availability* provider, not on your *subtract-busy-list* one.
- **Do not model it on "Google"** if your Google path has three write routes behind one label and decorative per-host tokens — you would copy a shape whose tokens do nothing. Model the **write** on whichever provider actually writes through your dispatcher, and the **read** on your other query-availability provider.
- If the vendor **has** a native reschedule API, implement a real update path — do **not** copy a rebook-then-cancel composition or a cancel-reason sentinel that only exists because some *other* vendor lacks a reschedule API.

**Write the decision down in a short design note before coding.** "We chose in-code because X; it is externally-managed because Y" is the artifact that stops the next person re-litigating it.

---

## 2. IN-CODE PROVIDER — the complete registration checklist

### 2.0 The API ↔ MCP split (memorize this before touching anything)

A provider PR almost always touches **both** services. Know which concern lives where:

| Concern | Owner |
|---|---|
| Slot generation / availability read / fan-out per host | **MCP** slots service — the API's slots endpoint is usually a *pure proxy* to it |
| Slot-cache / positional slot memory | **MCP** |
| Intent gate before booking (a cheap classifier) | **MCP** |
| Agent selection / tier filtering / round-robin | **MCP** |
| Calendar-fetch audit rows | **MCP** — *but the table + CHECK constraint migration lives in the API service* |
| Canonical event INSERT (agent path) | **MCP** create-event service |
| Web/manual event INSERT | **API** service — **two row-writers with different column coverage**; this is why some columns are "only populated on one of several creation paths" |
| **Provider-write boundary** (create-conferencing / delete / update / host-move) | **API** service — MCP MUST delegate. Owning the write in two places is how a cancel reports success while the meeting stays live. |
| All OAuth / token refresh / vendor auth | **API** — MCP pulls a fresh token from an internal endpoint |
| Emails, host reminders, side-effect bundle | **API** — MCP fire-and-forgets into internal routes |
| Prompt blocks + tool gating | **API** — the MCP tool list is typically global and unfiltered (**every tenant sees every MCP tool**) |
| Webhooks in (vendor → you) | **API** |

**Consequence:** a new provider is **never** a one-service change. If your diff touches only the MCP, cancel is broken. If it touches only the API, you offer no slots.

**And there may be a THIRD surface: the frontend.** "Can the assigned advisor see the meeting?" (§4A) is often answered by a frontend that queries the database directly, with **no API endpoint mediating it**. You will not normally *edit* it for a provider, but you **must read it** to know what your host assignment does or does not light up.

### 2.1 API service — every concern, in order

| # | Concern | What you add | Skipping it costs |
|---|---|---|---|
| 1 | Provider registry entry | `{ key, external, autoGatedTools }`. **Only the gated-tools field is load-bearing** — the "external" boolean is often decorative. Set it for consistency; do not believe it gates anything. | Native tools stay live → agent double-books natively against a calendar you don't own |
| 2 | **Externally-managed provider set** | Add your key to the **hand-maintained** set (§2.3) | **THE most important line.** This is the one most often skipped |
| 3 | Binding resolver | Resolver branch + **validate the config key against the registry** before dispatch | Unknown key falls back to `native` with booking tools ON |
| 4 | Cancel implementation | Vendor-API cancel, with already-gone / transport-layer / tool-level-failure classifiers | Cancel silently converges to "already gone" on a transport error |
| 5 | Provider-write dispatcher | Provider constant + **create branch** + **delete branch** + **update branch or explicit no-op** | **create often fails OPEN** (books on Google silently); delete/update fail CLOSED. Asymmetric on purpose, easy to miss. |
| 6 | Event-create service | Persist provider key / external event id / vendor URIs / cancel & reschedule URLs / an origin flag; confirmation-email opt-out if the vendor already emails | See §4 |
| 7 | Reschedule service | Inbound-only skip guard, provider-first ordering, refusal guard, and a sync-calendar branch. **Beware locally-shadowed helpers in this file — resolve where each helper actually comes from before you call it.** | **Unknown provider returns `{success:true, skipped:true}`** → you tell the lead it moved, vendor keeps the old time |
| 8 | Conferencing create | Provider branch + widen the return type. **Decide what a PARTIAL success persists** (§6.2). | A meet-link miss that returns success-with-no-event **orphans the vendor event you just created** — no dedup key, no delete handle |
| 9 | Chat tool gate | Gate if chat needs different gating than voice | Split-brain: chat holds both native + provider tools |
| 10 | Built-in tool registry | Register provider-specific in-process tools | |
| 11 | Agent context | Provider resolve + a derived `bookingSuppressed` flag + provider booking flags | §5 |
| 12 | Prompt factory | Thread the provider flags through context/assembly/helpers | |
| 13 | System-rule prompt blocks | Provider prompt block wired into **every** channel builder. **The least-used channel is the one everyone forgets** — see §5.3. | §5 |
| 14 | Voice tool defs | A **second** implementation of the same tools | §5.4 |
| 15 | Voice proxy handlers | | |
| 16 | Router + webhook plumbing | Router mount, internal router, raw-body prefix whitelist if you take signed webhooks, init calls | Signature verify returns 400 if raw body isn't captured for your prefix |
| 17 | **Inbound webhook** (route + processor + signature verify + lead resolver + anti-echo) | **How a vendor-owned booking becomes YOUR record.** If the vendor's calendar can be booked WITHOUT the agent (a link, the host's page, the vendor UI), this **is** north-star clause #1. | **The most-forgotten file.** No intake → self-serve bookings produce **zero records** and no reconciler can find them (a reconciler scans records that exist). |
| 18 | **Alert types** | Ghost-cancel / inverse-ghost / host-drift / fetch-failure / host-miss / partial-provision | Your provider is unobservable |
| 19 | Health cron + drift reconciler | | A revoked credential is discovered only when it costs a lead |
| 20 | Migrations | Table(s) + columns + RLS + audit-outcome CHECK widening | §2.5 |
| 21 | Doc **+ an entry in your doc index** | | An unindexed doc is an absent doc; the on-call engineer greps the index |
| 22 | Env kill switch | `<PROVIDER>_BOOKING_WRITE_ENABLED` + `<PROVIDER>_SYNC_ENABLED` | A vendor incident needs a deploy or a hand-written per-client UPDATE |

### 2.2 MCP service — every concern

| # | Concern | What you add | Skipping it costs |
|---|---|---|---|
| 1 | Availability provider | Availability fetch, window tiling, min-notice re-application, bucket into per-day slots **in the workflow timezone** | The slot-union step is provider-blind — it only works if your shape matches |
| 2 | Availability client | Call to an API-service internal route (auth lives in the API service) | |
| 3 | Slots service — **TWO places** | (a) the async pre-fetch, and (b) a **separate synchronous** merge loop | **Adding only to (a) yields fetched-but-silently-discarded slots.** Both re-derive the branch. |
| 4 | Slots branch predicate | `flag AND host-flag`, exported for tests | |
| 5 | Calendar-audit outcome union | Add `<provider>_ok` / `<provider>_excluded` | And the **DB CHECK in the API migration**. Ship the migration first or every audit insert **silently** fails (fire-and-forget) |
| 6 | Cancel / reschedule **delegation** | Never local writes for a provider-backed record; narrow any legacy fallback to the one provider it was written for | Widening a legacy 404 fallback re-creates the "cancel reported success, meeting live" lie |
| 7 | Conferencing response type | Widen it beyond the two native calendar types | The read/write asymmetry — you offer slots the vendor never reserves |
| 8 | Slots RPC / query | Project `is_<provider>_host` + the vendor event-type identifier per agent, **and UNION your hosts into the host-id set** | A pure-vendor host has **no availability-schedule row** (their availability IS the API) → the base query **silently drops them**. Ordering is load-bearing (undefined order biases bookings). |
| 9 | Tests | branch/flag predicate, union, fail-closed, audit-outcome | |

**Do NOT add a new MCP tool for your provider** if the MCP returns all tools to every tenant unfiltered. Prefer a **provider branch behind the existing `get_available_slots`**. Provider-specific tool names usually **do not exist** as MCP tools — if a brief names them, the brief is wrong.

### 2.3 The registry can lie. Read this twice.

A provider registry often has two fields that look identical in kind but are not:

| Field | Reality |
|---|---|
| gated-tools set | **LOAD-BEARING.** Genuinely gates the native tools. |
| "external" boolean | Frequently **DECORATIVE** — its only reader may build a set nothing consumes but a test. |

And the docblock may actively mislead ("external drives cancel/reschedule routing" when it drives neither). **The real switch is usually one hand-maintained literal** — an "externally-managed providers" set that three guards depend on:

- refuse-to-cancel-without-a-confirmed-provider-cancel,
- inbound-only reschedule hard-skip,
- refuse-to-reschedule-without-a-confirmed-provider-reschedule.

**A guard whose predicate depends on the registration you skipped is decorative.** If you add exactly one line for a new externally-managed provider, make it the entry in **that set**, not the registry.

### 2.4 What a missed registration actually does (the concrete cost)

For a record whose provider was added to the registry but **not** to the externally-managed set, a cancel can walk a path where the "this record has a provider-owned event to delete" check is TRUE, dispatch hits the provider-write dispatcher, the dispatcher has no branch for the key, and the cancel **hard-fails** — the meeting can never be cancelled through your system. **And it bifurcates on host resolution**: if host resolution fails open to `null`, the same cancel **silently succeeds locally while the appointment stays live**. Identical user action, opposite outcome, decided by whether a host happened to be resolvable.

**Invariant:** fail-open host resolution is correct at booking time and becomes a **nondeterministic branch selector** at cancel time. Audit every downstream `Boolean(host_id)` before you fail open.

### 2.5 Migrations

- **Staging first**, save the `.sql`, prod only after explicit approval.
- If an audit column has both a **DB CHECK** and a code-level union, widen **both**, and ship the migration **before** the code deploy — or every audit insert fails **silently** (fire-and-forget).
- **A new column in an INSERT must survive the migration not existing yet.** Register it in your graceful-degrade strip list, or the deploy is coupled to migration order. Idempotent migrations are not enough — there is a window where code runs without the column.
- **Never `NOT NULL` on a new column without auditing whether code inserts `null` with intentional semantics.** A 3-state marker (true / false / NULL) shipped as `NOT NULL DEFAULT false` can make **every** insert fail. A DEFAULT does not protect against an explicit `null` in the INSERT.
- **RLS is row-level, not column-level.** If your table stores a live API credential, careful route code cannot save a loose policy — copy a policy that restricts SELECT to privileged roles, not one that lets any authenticated tenant user read the credential straight through the data layer. And first ask: **can this credential live somewhere the browser cannot reach at all?**
- Partial unique indexes bite on INSERT. If "one active primary per user" is enforced provider-agnostically, a host cannot have two active primaries even across different providers. Revoke/expire first, then insert.
- **Constrain the provider column to a known vocabulary, and ship the CHECK in your PR.** With no constraint, the DB accepts every spelling of your key — and a drifted row (`ghl` vs `gohighlevel`) fails **every** provider branch at once and books on the default calendar. **Backfill the drifted rows to the canonical key BEFORE adding the constraint** — do not widen the CHECK to accept both spellings, which enshrines the exact drift the constraint exists to kill. Note the provider-write vocabulary is a **different namespace** from the binding-registry vocabulary; constrain to the write vocabulary (native calendar types ∪ externally-managed set ∪ your key), and keep a `NULL OR ...` clause if NULL is load-bearing anywhere.

---

## 3. EXTERNAL-BOOKER — the exact config contract

The client's own HTTP endpoint owns the calendar. You mirror the meeting into ONE canonical event record so the side-effect bundle fires. **Zero integration code.** A post-tool hook fires fire-and-forget after every successful external HTTP tool call on **both** channels (chat and voice).

### 3.0 Cancel and reschedule tools are REQUIRED, not optional

The dispatch is a mutually-exclusive `else if` chain. Omitting a key is **silently accepted** — the branch just never matches.

**A booker shipped without a cancel tool makes every cancellation invisible to the mirror: live phantom meeting, reminders still firing, the UI says scheduled.** A booker with fewer than all four verbs is **NOT ready to ship** — the lying concentrates entirely in the missing verbs, where the agent, facing an error with no prompt branch for it, improvises a confirmation that never happened.

| Verb | Required? | If missing |
|---|---|---|
| slots (read) | yes (**never gate the client's own slots tool**) | Agent can neither offer nor book → improvises |
| create | **yes** | No mirror at all |
| reschedule | **YES** | Reschedules never mirror; record keeps the old time |
| cancel | **YES** | Cancellations never mirror → phantom meeting + reminders |

Also: pointing create and reschedule at the **same** tool name makes the reschedule branch **unreachable** (else-if).

### 3.1 External-booking config — full key list

> **Where this config comes from: a hand-written UPDATE.** If nothing in the app writes it, the "config only, zero code" shape has **no supported authoring path** — and because the JSON is hand-written and nothing re-derives it, **duplicating a workflow in the UI produces a copy that silently drops the whole block** → the copy books **natively, against a calendar you do not own**. Staging first, then prod, and re-run the sibling sweep (§10-A) after **any** workflow duplication.

```jsonc
{
  "external_booking": {
    "tool":            "book_appointment",        // REQUIRED. Exact tool name. NAME-keyed → rename-unsafe.
    "reschedule_tool": "reschedule_appointment",  // REQUIRED (§3.0)
    "cancel_tool":     "cancel_appointment",      // REQUIRED (§3.0)
    "provider":        "external_booker",         // optional. The literal string becomes the provider key,
                                                  //           defaulting to a generic external-booker key.
    "source":          "external_booker",         // optional → the record's source
    "default_duration_min": 30,                   // optional, default 30
    "title_fallback":  "Meeting",                 // optional
    "fields": {                                   // dot-paths into the RAW response
      "starts_at":       "data.appointment.start",       // ★ THE ONLY REQUIRED MAPPING
      "ends_at":         "data.appointment.end",         // else starts_at + default_duration_min
      "meeting_url":     "data.appointment.meetLink",    // else the link renders a placeholder
      "external_id":     "data.appointment.id",          // dedup key ONLY. NOT used by reschedule/cancel.
      "title":           "data.appointment.label",
      "timezone":        "data.appointment.tz",          // else resolve from workflow config
      "host_id":         null,                           // ⚠ written RAW, NO validation, NO mapping
      "organizer_email": null
    }
  },
  "disabled_builtin_tools": ["get_available_slots","create_event","confirm_and_book","reschedule_event"]
  //  ↑ MANDATORY for an external booker. See §3.4.
}
```

### 3.2 Response shape the endpoint must satisfy

| Requirement | Detail |
|---|---|
| HTTP 200 + JSON **object** | |
| A truthy success signal | An endpoint that signals failure with a 200 body (`{status:'error'}`, `{ok:false}`) → **capture fires → phantom record + confirmation email + status flip for a booking that never happened.** |
| `starts_at` parses as a date | Else a silent skip |
| **Array paths: dot-numeric works, brackets do NOT** | `data.slots.0.start` resolves (an array is an object); `data.slots[0].start` looks up a literal key `"slots[0]"` → undefined → **silent no-op.** Index arrays with `.0.`, never `[0]`. |
| Paths resolve against the **RAW** response | Sanitization runs separately. **Mapping paths from what you see in a sanitized trace is the most likely first mistake.** |
| Same shape for create and reschedule | The reschedule response carries start/end/link/id → the same dot-paths map it with **zero** config change |
| One active booking per lead | reschedule/cancel match the **furthest-future non-cancelled event for the lead**, not by external id. A booker that allows 2 concurrent bookings per lead will mutate the wrong record. |
| Error vocabulary matches the tool description | If the description advertises an error code the endpoint never returns, the prompt's per-error branches can never fire. The prompt needs an **explicit branch per real error code**. |

### 3.3 The reschedule path only MOVES mirrors — it never CREATES one

If reschedule finds no existing mirror, it returns `{skipped:'no_event'}` and **the response carrying start/end/link/id is thrown away** — muted because the caller only logs the non-skipped branch.

**Invariant:** every external-booking side path (reschedule, cancel, confirm) must fall back to an **idempotent capture** (keyed by external event id) when there is no mirror to move. And **a `skipped` outcome must be logged/alerted, never dropped.**

**Also:** a stage gate the agent can unblock by calling a set-status tool is **not a gate**. If a tool is stage-gated, moving into that stage must not itself be freely available to the agent, or the gate is theatre.

### 3.4 Native tools are NOT auto-gated for a generic external booker — the biggest trap

If your registry auto-gates only for *specific* external keys, a generic external booker (or an absent provider value) **falls through to native with an empty gated-tools set**. **You MUST hand-set `disabled_builtin_tools`.**

**Gate via `disabled_builtin_tools`, NOT via marking the tool inactive.** Both hide the tool; only the disabled-builtin path feeds the **prompt** gate. Gating one way and hiding the other leaves the agent told about a tool it no longer holds. **One signal must move the tool AND its prompt.**

> ### ⚠ CONFIG DECAYS. It is not a one-time setup.
> Per-workflow config that ordinary UI actions silently drop is a recurring failure, not a one-time setup. **Cloning a workflow does not carry it → the clone falls back to native booking against a calendar you don't own.** A provider is not done until config decay is **DETECTED** (a recurring drift check), not just documented — decay happens *after* the PR, so a one-shot sweep is not detection.

### 3.5 External-booker known holes (declare them, don't rediscover them)

| Hole | Consequence |
|---|---|
| `host_id` written raw, no resolution | Host reminders fall back to the client owner/admin. If the endpoint returns its **own** user id, you cannot map it to your user without a resolver on this path. |
| attendee email always from the lead record | Never from the response. A lead who books with a different email gets the stale one; a lead with no email **silently** skips the confirmation email. |
| the cancel side path may get no `config` | It cannot read your field mappings even if defined. Pure lead-scoped guesswork. |
| many silent skip reasons | Nothing reads them — callers only log the success branch. |
| side-effect failures also silent | Reminders can fail entirely and the log still prints "captured." |
| the whole block gated on lead-id AND workflow-id | Missing workflow id kills create, reschedule **AND** cancel. |
| dedup gated on `provider && external_id` | The realistic external post (provider absent) **skips dedup entirely and plain-inserts** → duplicates on redelivery. Keep dedup predicates consistent across every inbound path. |
| a create path that fires **no** side effects | "A record exists" ≠ "the booking bundle ran." Verify the bundle, not the row. |
| **NULL provider key means the DEFAULT calendar** | A NULL-provider row can take the default-provider branch, create a fallback event, and **overwrite the vendor's external id / provider / meeting url — destroyed and unrecoverable.** **Write the provider key on EVERY path that can create your rows.** |

---

## 4. DOWNSTREAM ACCEPTANCE CRITERIA — "the booking is real"

**A canonical-event INSERT succeeding proves almost nothing.** If the side-effect bundle runs inside one `Promise.allSettled` where every skipped op degrades to a success-shaped result, the operations object **cannot distinguish "fired" from "skipped".** Any acceptance test asserting on it passes on a totally broken booking.

> **Never trust the operations object. Assert on the resulting records.**

### 4.1 The must-have list — each with its concrete breakage

| # | Field | If NULL / wrong → |
|---|---|---|
| 1 | **workflow id** | **THE MASTER GATE.** Gates lead reminders, host reminders, funnel transition, and no-show recontact. Reminder lookups hard-filter on it with no global fallback. ⇒ **no reminder, no host email, lead frozen pre-booking, cadence keeps dialing — and zero errors anywhere.** |
| 2 | **workflow-run id** | No funnel move; cadence isn't marked responded ⇒ **cadence keeps hammering a lead who already booked**; host email opens with zero qualification data. |
| 3 | **lead id** | No activity row; scheduled follow-ups still fire at a lead who booked; **invisible on the lead-detail page.** |
| 4 | **event start in the hand-built reminder context** (not just on the row) | The reminder is **NOT enqueued**, only persisted as skipped. A perfect row still yields zero reminders if a new call site forgets the field. |
| 5 | **event id in that context** | Host notification returns "no event id"; reminder-cancellation matches nothing ⇒ **the lead is reminded about a meeting that no longer exists.** |
| 6 | **attendee email** | If gated on the event column only with no fallback to the lead record ⇒ **the lead is never told the meeting exists**, while the host still gets notified so **nobody notices.** |
| 7 | **host id** | **THE MONEY.** A missing host silently kills the lead's confirmation email, **prevents the vendor-side delete** (so the event stays live forever), skips busy-block cleanup, and makes the meeting **invisible to the advisor** (§4A). The host *notice* often survives via an owner/admin fallback — so "the rep got an email" is **NOT** evidence the host is set. Assert on the actual recipient. |
| 8 | **status is the exact expected value** | Any other value ⇒ invisible to every reminder re-lookup that filters on status. Confirm your insertable status vocabulary — a value the code filters for but the CHECK forbids is a silent hole. |
| 9 | **meeting url** | Degrades **into a lie**: no transcript; the reminder substitutes a "pending" placeholder for the link ⇒ **the lead gets a reminder minutes before the call saying the link is pending**; the Join button never renders. |
| 10 | **exactly ONE booking-target status on that workflow** | A `.single()` over 0 or 2+ rows goes falsy ⇒ **the event exists, the funnel never moves.** A workflow-config precondition, not an event field. |
| 11 | **provider key written on every path** | NULL means the default calendar (§3.5). |
| 12 | **timezone consistent with the workflow timezone** | The row's value is not what every consumer renders — some re-resolve. A row whose tz disagrees with the workflow's ⇒ **lead and host are quoted different wall-clock times for the same instant.** |

### 4.2 The verification rule

**Never trust the operations object. Assert on the data:**

- reminder rows exist with a *pending* (not *skipped*) status and the event id set,
- a host-notification log row with the **right recipient**,
- a lead-activity row of the booking type,
- the workflow run's current status equals the booking-target status.

### 4.3 UI reads you should NOT use as evidence

Frontends drift from the schema — a card may read fields that were never selected or no longer exist, so those lines simply never render. And a query against a table that doesn't exist may return `{data:null,error}` (not throw); code that ignores the error renders an empty value **silently, forever.** Verify against the source of truth, not a rendered card.

---

## 4A. ADVISOR VISIBILITY — the assignment / credential / identity split

**§2–§4 answer "is the provider registered" and "did the row get written". Neither answers the question the client actually asks: _can the assigned human SEE the meeting?_ That is a downstream acceptance criterion.**

### 4A.0 Host assignment is easy to lose silently

A common pattern: host assignment was built into the *first* provider's path (say, native Google), and **every provider added since inherited the host *column* but none inherited the *assignment logic*** — so non-native providers end up with a null host 100% of the time, and nobody decided that. **Assume you will ship the same bug unless you make host assignment an explicit deliverable of your PR.**

"One shared calendar" is solvable **today** without new fallback code: a shared/resource host is **one real user row** that every booking maps to (the host id is a foreign key to a users table, so a resource host is a first-class host, not a hack). Pick one, explicitly:

1. **Vendor exposes host identity** (email/owner on the booking) → resolve to a user id and write the host. The fully-supported path.
2. **Vendor has one shared calendar** → designate a single user row for it and map every booking to it. You keep lead confirmation, vendor-side delete, host reminders, and visibility.
3. **Host null** → the event still saves (never block the write on a missing host), but you are shipping the visibility bug. **Declare it (§9) with a reason, or fix it — do not drift into it.**

### 4A.1 A calendar-connection row can mean TWO different things

| Kind | Has tokens? | Written by |
|---|---|---|
| **CREDENTIAL** (google / outlook) | yes | the OAuth flow, by the advisor |
| **IDENTITY MAPPING** (a teams-style vendor) | **no tokens** | the operator |

**Decide which kind yours is before you write a row.** An owner-mode mapping is a mapping, not a credential.

### 4A.2 Do NOT reuse the "primary" role for a mapping

Reusing the primary role for an identity mapping produces two live failure modes: an advisor who already has a calendar connected **cannot be mapped** (connecting a calendar *prevents* assignment — read that twice), and a globally-unique "one primary per user" index fires across tenants. Also watch for **tenancy leaks**: a not-client-scoped join can mark a user a "host" in the wrong tenant's pool.

### 4A.3 Visibility is often ONE line

A frontend meetings query is frequently `if (hostId) q = q.eq("host_id", hostId)`. **A null host matches no `eq` → the meeting is invisible to EVERY advisor, permanently** — not degraded, absent. And an admin view may *label* a genuinely-assigned meeting as "AI Assistant" when the host is unset, so the fallback *looks* deliberate. **There is often NO backend endpoint mediating this** and RLS may be role-agnostic — so "only mine" is a client-side convention, not an authorization boundary. Do not reason about it as authorization.

### 4A.4 The write path is honest; the read path is not

The write path fails open to a null host **by design, and that is correct** — an unresolvable host must not block a real booking. The read path assumes it never happens. **That asymmetry is the whole bug.** The two missing pieces — a resolution ladder (`host_id` → `organizer_email` → external mapping) and an explicit **Unassigned bucket** both roles can see — are usually **cross-provider platform debt in a third repo**, not your provider's obligation. **Do not build them in a provider PR; do not silently inherit their absence either.** Your obligation is the **outcome**: a meeting for your key must render when you **log in as the assigned advisor** (admin view is not evidence). If you can't hit that because the ladder is missing, **file it as a blocking platform issue — do not declare it N/A.**

### 4A.5 Several tables may disagree on "who can be a host"

The CRM identity table, the workflow-agent picker, and the connection pool can each have a different opinion. If the picker is **stricter** than the assignment endpoint, you **cannot manually rescue** a null-host meeting for an advisor the picker excludes. The escape hatch for the failure mode is itself blocked by a different table's opinion — check all three.

---

## 5. Voice + text — tool gating and prompt coupling

### 5.1 The one signal

```
gatedTools        = the provider's auto-gated set  ∪  the workflow's disabled-builtin set
bookingSuppressed = gatedTools covers ALL the native booking tools
```

Native booking tools are typically `get_available_slots`, `create_event`, `confirm_and_book`, `reschedule_event`. **`cancel_event` is deliberately NOT gated** — it is ROUTED to the provider, not gated. `bookingSuppressed` is **derived, never configured** — resolve it ONCE and cover both origins (registry gated-tools + config-disabled). **Never test for "is this cal.com/Calendly?" — test the resolved flag.**

### 5.2 The prompt gate must move in lockstep with the tool gate

**The classic failure: tools were suppressed while the prompt still instructed their use → the model invents slots from training data and narrates confirmations for meetings that do not exist.** Three separate incidents of this shape are enough to make it a law.

**Invariants:**
- Extract the **FULL** resolved object from the resolver. Pass every derived flag downstream — destructuring only `provider` and defaulting the rest is how the gate gets ignored.
- Shared cross-tenant guardrails must be **tool-agnostic** or gated by the resolved set. A block that hard-names a native tool the agent no longer holds gets **discarded whole by the model** — taking its unrelated anti-deflection rules with it.
- The generic wisdom ("don't invent slots", "don't confirm before the tool returns success") needs a **tool-agnostic FLOOR that survives the gate** — a booking-integrity block wired as `bookingSuppressed ? INTEGRITY_FLOOR : NATIVE_BLOCK` at **every** channel. Native builders must **NOT** also receive the floor (bloat + conflict).
- **Test the invariant "zero native tool names in all channels when `bookingSuppressed`".**
- Cover the **caller's integration pattern** in tests, not just the primitives.

### 5.3 Watch the least-used channel

The channel with the least booking traffic is the one most likely to have **no booking protocol block at all** — so a "zero native tool names in all channels" test passes on it **vacuously** (it names no tools because it has no block, not because your gate works), while the integrity floor is silently missing there too. **Decide explicitly: wire it or declare it N/A with a reason. Do not let the vacuous pass decide for you.** Any slot-protocol block that names a native tool must **also** be gated by `bookingSuppressed`, or it emits a native tool name into an external-booker prompt on day one.

### 5.4 Chat and voice diverge — plan for it

1. **Chat and voice gate differently.** One path's gated set may be voice-safe but chat-incorrect; chat may need to **force** `bookingSuppressed` rather than derive it.
2. **Tools are implemented TWICE** (in-process for chat, HTTP-proxied for voice). **A semantic change must land in both + the prompt block** that hard-codes the success/terminal protocol.
3. **Server-injected args may differ by channel.** If voice forwards the model's args verbatim and text server-injects source-bound args, any voice flow building its **own** prompt must surface those bindings or the model sends a literal token. Ship the strip/inject code **before** enabling the feature.
4. **A "safe" wrapper tool may exist on only one channel.** If an intent-check-guarded booking tool is voice-only while the raw create tool is the main text path, text books on the less-safe path. **Two obligations: (a) YOURS (no N/A) — your booking tool must be reachable on voice AND text; shipping one side is the default failure. (b) THE PLATFORM'S (disclose only) — the safety asymmetry itself is pre-existing; state the baseline so the next reader knows which side your tool lands on.**

### 5.5 Any flow that builds a call/message must take tools from the SAME source

A reminder/notification call that builds tools from a **hardcoded native set** — no workflow tools, no `bookingSuppressed`, no custom vars — will, for a custom-booker client, see only native tools and never move the meeting. **Use the shared booking-gate resolver; never hand-roll a tool set.**

### 5.6 The tool schema IS part of the prompt

**An announced parameter the server ignores is worse than no parameter.** A phantom `timezone` param the agent believes it set (but the server ignores) is a coin flip on over-conversion. **If a param dies server-side, kill it in the schema the LLM sees** — in **every** place the schema is declared.

---

## 6. THE ANTI-MISTAKE SECTION — every documented mistake, phrased as an invariant

Each line is a real failure mode. Satisfy the invariant or declare it N/A with a reason.

### 6.1 Registration & routing

- **Add your key to the externally-managed set, not just the registry.** Registry-external is decorative; the set is load-bearing.
- **The registry "external" flag is decorative; the gated-tools set is load-bearing.** Nothing in code, types, or tests distinguishes them — do not trust the docblock.
- **Add a create branch to the provider-write dispatcher.** Unknown provider → books on the default calendar, success:true, wrong calendar, no error. Create fails OPEN; delete/update fail CLOSED. Asymmetric on purpose.
- **Add a sync-calendar branch in reschedule.** Unknown → `{success:true, skipped:true}` + caller stamps "synced". Green UI, vendor at the old time, only a warning.
- **Validate the config key against the registry before dispatch.** A typo (`ghl`, `GoHighLevel`, trailing space) re-enables every native booking tool against a calendar you don't own. Symptom (double bookings) is many steps from the cause.
- **Write the provider key on EVERY path that can create your rows.** NULL means the default calendar → phantom event + your external id destroyed.
- **Provider binding is WORKFLOW-level, not client-level.** A client can run a vendor workflow AND a native workflow simultaneously; a client-level flag would kill one.
- **Two create row-writers exist** (web + agent). A column you add in one is NOT written by the other.

### 6.2 Guards that don't guard

- **A guard whose predicate depends on the registration you skipped is decorative.**
- **A comment is not a guard.** When a comment claims a cross-file invariant, go read the other file.
- **Fail-open host resolution becomes a nondeterministic branch selector downstream.** Audit every `Boolean(host_id)`.
- **Validate a param's FORMAT before comparing it.** A guard comparing a model-supplied value against an id can trip on the **correct** entity when the model only ever *sees* a name, not the id.
- **Audit the SUM of guards.** Each layer correct, the sum rejects valid inputs (or deadlocks a round-robin).
- **A vendor SDK call that RESOLVES on tool-level failure is not proof.** A resolved promise carrying `{successful:false}` is not a success. Check the operation result.
- **A "not found" about the transport layer must NEVER converge to "already gone."**
- **Narrow legacy fallbacks by provider.** A 404 fallback written for one provider must not apply to all — that resurrects the "reported cancelled, still live" lie.
- **A 2xx envelope is not proof the event is gone.** Check the specific delete operation's success.
- **A stage gate the agent can unblock with a set-status tool is not a gate.**
- **Prompt gates are soft. A runtime invariant goes on the tool, in the harness.** And **verify the flag is ON in data**, not that the mechanism exists.
- **A partial success is still a WRITE. Never discard the vendor id on a partial success — persist what you created, or delete it.** A dropped id is an orphan you can never dedup against.

### 6.3 Silence

- **Grep your CALLER before writing a `{skipped, reason}`.** A reason computed and then discarded by a caller that only logs the success branch is information destroyed — including reasons an operator could act on.
- **A guard skip is information for the MODEL, not just the log.** Re-packaging an honest skip as full success (with a formatted date) makes the agent promise something no one will do.
- **Register alert types + a health cron, or your provider is unobservable.** A reactive-only auth-error flag makes a revoked credential invisible until it costs a lead.
- **A reconciler must NEVER report clean when fetches failed**, and scan truncation must be **logged loudly**. A silent cap reads as all-clear.
- **The real alarm is the ABSENCE of downstream rows.** A trigger POSTing to a dead endpoint can drop side-effects for months while the happy-path log still prints success.
- **Instrument a new route's ACTIVATION the day you ship it**, not when you suspect it. A field lost in a destructure can silently disable a feature on every request for months.
- **If you gate a new format behind another feature "out of conservatism", SCHEDULE step 2** or it becomes an accidental flag forever — and the simplest clients get the worst treatment for being simple.
- **An aggregate error rate MIXES recovered failures with real ones.** Do not read it as loss; the honest signal is the successful call + a matching artifact.
- **A miss-alert must fire on the EMPTY-CANDIDATES path, not only on the no-match path.** The most common miss is "nothing to match against" — the case where you have the least information is the case your net skips.
- **An intake that cannot resolve the lead must ALERT, not `info`-log.** A dropped booking leaves no record, and a reconciler that scans existing records can never find it. This directly violates north-star clause #1.

### 6.4 Timezone

- **The workflow timezone is the ONLY anchor.** The client timezone and the host's schedule tz are **traps**. A hardcoded default at creation time seeds systemic mismatch.
- **Single-source-of-truth is not done until you audit EVERY service.** After the API is fixed, an RPC in the other service reading a different column keeps bookings wrong.
- **An LLM must NEVER convert timezones from memory.** Precompute server-side and inject. Models assume abolished DST rules and confirm false conversions with **no tool error**. Turn REASONING into READING.
- **Gate tz disclosure on real UTC OFFSET, not IANA string equality.** Two different IANA zones at the same offset produce redundant disclosure that primes the model to invent an offset.
- **When DETECTION can fail, the safety net must not depend on detection** — always label the zone in multi-tz countries, and route **every** lead-facing path through the same disclosure point (a separately-built reminder prompt is the one that misses it).
- **Never hand-write a `timezone:` string next to `formatTime(date, tz)`.** Label and digits from the SAME source; audit all emitters of an email family in lockstep.
- **A resolver's precedence is fiction if the loader never SELECTs the canonical column.** Pin the SELECT in a test.
- **Say `YYYY-MM-DD` and forbid time/tz; harden the parser.** A full ISO string where a date was expected can produce `NaN` and a summary that **lies** about availability.
- **Don't make the LLM do date arithmetic.** Give it a resolved calendar table and an explicit civil-day rule for after-midnight times.
- **An agreed time has an OWNER.** A time for a human on the client's team is NOT a system callback — don't schedule an agent action at it.

### 6.5 Slots, hosts, buffers

- **FAIL-CLOSED is a feature. Copy it exactly.** A broken primary calendar must **THROW** so the host is dropped. Treating an interval you cannot see as **FREE** IS the double-booking bug; returning `[]` on error hides it. Surface excluded hosts explicitly.
- **Exclude non-actionable targets from the rotation POOL, not just from the count.** A counter derived from a domain event that can't occur (a broken host that books nobody) never advances → the pool gets permanently stuck on the broken host.
- **Three connection states, and the middle one silently kills the host:** never-connected (safe empty), active (fetch), and connected-but-broken (**THROW / block**). Counter-intuitively, a host who never connected is safer than one whose connection broke.
- **A status='active'-only filter cannot distinguish "broken" from "never connected."** Check status explicitly if broken must block.
- **UNION your hosts into the availability query's host set.** A pure-vendor host has no availability-schedule row — their availability IS the API — and the base query silently drops them.
- **Buffers must be SYMMETRIC** (`[start − buffer, end + buffer]`), and **the direct-start path is the recurring bypass of every grid guarantee** — it often applies no buffer at all. A booked time that doesn't fit the slot grid is the tell.
- **The create tool may not re-query the vendor at booking time** — its conflict check is your own records. The double-book window between offer and reservation is open unless you close it.
- **Calendar blindness must be a ROW, not a missing row.** Write an audit from the single chokepoint so "the host had zero connections and was offered 100% free" is diagnosable without archaeology.
- **NEVER read request-scoped storage inside fire-and-forget work.** Capture ids synchronously first.
- **A positional slot counter that restarts each call and has a short TTL has no stable identity.** It is the root of many mis-booking incidents; a durable slot identity is the real cure.
- **When a tool accepts two sources of truth, the contradiction is FREE signal.** Compare them; don't silently prefer one. (A slot index and an explicit start time that disagree, silently resolving to one, books the wrong time.)
- **The slot-grid cache is a CACHE, not availability truth.** Anchor both "deny if not available" and "re-fetch if absent" rules to the SAME source, or they contradict and falsely deny a valid day.
- **Pick ONE time representation. Never mix UTC and local in what the LLM sees.**
- **Tool results are DATA + a pointer. Protocol goes in a cached system-prompt block.** A multi-kilobyte protocol blob returned *as* the tool result correlates with empty model turns.
- **Tile the availability window and fetch SEQUENTIALLY** if the vendor has a hard window size + rate limit. Parallelizing produces 429s, which fail-closed and silently drop the host. Do your own limit analysis — another vendor's window does not transfer.
- **Apply min-notice AFTER concatenation, even if the vendor has its own.** Slots fetched ahead of the floor in the first chunk otherwise survive.
- **Connection lookup is by user id.** Do not "fix" it by adding a client-id filter — that misses connections under a different membership and disagrees with the write path. Tenant isolation belongs upstream.
- **Round-robin weights are POSITIONALLY aligned with the agent list.** Reordering one silently re-routes traffic; fuzzy name matching that misses silently drops a host.
- **Rules the LLM must READ are suggestions; rules that filter what it can SEE are laws.** Move eligibility from prose to a pre-filter; order the slots to bias the pick.
- **Two enforcement points: offer-time AND book-time.** Slots go stale between offering and booking.

### 6.6 Lifecycle, status, side effects

- **Every guard that reads the canonical events table or names a native tool is blind for external bookers.** Derive from the RESOLVED TOOL SET + run status, or a "has-meeting" check misses external bookings and an analyzer schedules a call at a lead who just booked.
- **…and every heuristic added for case X needs an EXPLICIT discriminator that you are IN case X**, or it backfires on the other case.
- **Auto-cancel on leaving the booking stage must condition on the target's CATEGORY**, never on a boolean negation. Cancel only on a genuinely lost/paused/deferred category — **never on won**; unknown target → no cancel. (The failure: fresh meetings auto-cancelled seconds after creation.)
- **An entry hint describing the RESULT of a prior action reads as an instruction to apply now.** Hints describe the lead's SITUATION.
- **A terminal-status guard reading "never book again" breaks the booking-target state.** A booking-target status that is also terminal can leave the agent, in exactly the state where rescheduling is normal, with only the destructive half of the tools.
- **A post-booking pause with a FUTURE EVENT needs a carve-out for intents affecting that event** — otherwise a lead asking to move the meeting minutes before it goes unanswered.
- **Provider-first ordering on cancel.** Delete externally BEFORE the local write; on failure return early, row untouched, lead not emailed. The reverse order + a retry short-circuit leaves the event live forever. Use a CAS that treats every live status as live, not just one.
- **Capture idempotency: voice agents double-fire the booking tool.** Dedup by external event id (fallback lead+start). Aggravated when a tool both speaks-during and speaks-after execution.
- **Dedup predicates must MATCH across every inbound path.** Three writers, three rules → duplicates, throws over 2 rows, resurrection of cancelled rows.
- **When you narrow an LLM tool's schema, audit everything the old params carried as implicit context/guard and re-port EACH.** Dropping an email backfill silently NULLs invites; dropping a proposed-time param can disable a mismatch guard AND throw on a `new Date(undefined)`.
- **Reimplementing the same function in two services diverges silently.** Leave a "mirrors X — keep in sync" note or share a package. (Two template-resolver regexes that differ render `{}` in titles and emails.)
- **A downgraded token scope can 403 the write fallbacks** even if it works today — it breaks on the first reconnect after deploy. Trace every call site before downgrading a scope.
- **The service account IS the organizer of every meeting. Never connect a personal account** — a personal organizer blocks that person's calendar for every booking, and you cannot change an existing event's organizer.
- **Capture the PROVIDER'S canonical value in EVERY creation path**, not an id that depends on which branch ran — a signal populated in only some paths is useless for attribution.
- **Host at book time is an INTENDED guess. Re-resolve at echo time.** Never substitute a default host on a miss — the assignee may not be your user at all. A point backfill without fixing the handler guarantees recurrence.
- **When an external source does not supply a required field, the intake must RESOLVE it** — never trust that it arrives.
- **A feature with a client half (schema/prompt) and a server half (resolution/hook) must be verified in EVERY channel.** Grep the call sites of the RESOLVER, not the injector — injection can be cross-channel while resolution is wired to only one.
- **Know which path your channel takes.** If one channel calls the MCP directly and another goes through a hook, a post-hook won't fire for the direct one → duplicate or missing side-effects.
- **A transactional "X happened, tell the responsible human" notification belongs default-on at the state-change chokepoint** — never behind an optional agent toggle + a per-client config row.
- **When adding a new send type, audit that it passes the SAME gates as existing sends.** Extract a named helper so coverage is greppable. (A new email path bypassed a send-suppression flag.)
- **A host-notification template name can be a ROUTING SWITCH**, not a label — deciding booking-vs-cancellation email AND bypassing safety nets. Treat it as control flow.
- **A spoken/system name mismatch:** the spoken booking text may live in the other service and have TWO builders — patch one, miss the other.
- **A confirmation-email function can create a calendar event as a side effect** when the meeting url is empty. If your provider can produce a row without a meeting url, opt out of that side effect or you get a phantom event on the host's calendar.
- **The playground/sandbox does NOT sandbox booking** if it hits the same MCP and the same calendar. A "bare" row is not a playground guard — it just means no connected host.
- **Bookings live in the canonical events table, NEVER a legacy `meetings` table.** Count ALL statuses when verifying — a cancelled row still means the booking existed.
- **Cancelling a phantom event does NOT revert the funnel stage.** Reverting may fire the client's CRM webhook.

### 6.7 Anti-echo (only if your vendor echoes your own writes)

A vendor that webhooks you about bookings **you** made needs guards so your own writes don't round-trip into duplicates:

| Guard | Mechanism | If skipped |
|---|---|---|
| 1 | inbound cancel on a row already cancelled + canceled-by-you | double-cancel |
| 2 | an "originated-by-you" marker on the normalized payload (live webhooks never carry it) | |
| 3 | created-echo of a row you originated → treat as echo **but still backfill** | This may be the ONLY place the join url and true host attribution arrive — "cleaning up" the echo to return early loses the link and freezes the wrong host forever. |
| 4 | an exact-match reschedule-cancel-reason sentinel | Recognizes the echo from the payload alone, before any row lookup, in either race ordering. Do not translate it to a human-facing reason — that re-enables the double-cancel. |
| 5 (belt) | an in-flight reschedule marker | |

Plus: **a health-cron interval fires on EVERY replica.** If recreating a subscription mints a new signing key, a per-integration lock is **not optional** — divergent keys across replicas cause **permanent** signature failure.

---

## 7. Cross-cutting deploy & ops rules

- Migration order and contents — see §2.5. Know which of your migrations are staging-only right now.
- **A data-move that passes staging can fail in prod on cardinality.** A duplicate-key aggregation THROWS (it does not take the last). **Verify the RESULT in prod, not that the migration ran.**
- Ship a **kill switch** (§2.1 #22). The default provider often has none — it is the unconditional fallback everything degrades to.
- **A process-global flag has no gradual rollout** — it activates for every host across all tenants at once. The only per-host safety is a DB flag.
- Your test service may have pre-existing typecheck errors in unrelated files. Confirm YOUR files compile clean; don't chase the rest.
- Isolated worktrees may lack env files → the app exits and the runner reports "no tests." Run the suite from the main checkout. **Do NOT copy a prod-pointing env file into a worktree.**
- If an integration test **counts ordered `.single()` calls** on a table, adding or removing any `.single()` on that table shifts the fixture counter and breaks the test for unrelated reasons.
- Add the doc to your **doc index** (§2.1 #21).

---

## 8. Known dead / stale things — do not "fix" or copy

Every mature codebase carries traps that look live. Before you copy a pattern, confirm it isn't one of these shapes:

- **A dead dual-write path** (secondary-calendar columns/roles forced to null, zero callers) that reads like a live feature. Do not implement it — **but note the irony**: the dead column may carry the **only** vocabulary CHECK in the family, worth copying onto the live column (§2.5).
- **Dead "external provider keys" code** whose only consumer is a test that passes whether or not your provider is present.
- **TWO functions with one name** (a local shadow + an imported one) with different signatures and different organizer semantics. Not dead — **ambiguous**, which is worse. Resolve where each helper comes from before calling it.
- **A config key specified in a design doc but never shipped.** Grep the code, not the doc.
- **A tool param honored in code but absent from the JSON schema** (or vice-versa) → always undefined / silent drift, with no validation to catch it.
- **A stale system doc** that predates your provider and isn't the contract.
- **Tool names referenced only in comments** that "do not exist" as real tools.
- **A status value the code filters for but the CHECK forbids.** Don't propagate it.
- **An eliminated multi-storage scheme** — code still reading the old location is archaeology and a bug.
- **Hitting a hardcoded geographic default at runtime** — it doesn't fail, it books at the wrong hour. Worth capturing to your error tracker.

---

## 9. THE N/A DECLARATION RULE

**Every dimension below is IMPLEMENTED, N/A with a written reason, or DISCLOSED. Never silently skipped.** Put this table in the provider's design doc, filled in, before you open the PR. A blank cell is a **blocking review comment**. "It didn't seem to apply" is not a reason; "the vendor has a native reschedule API, so the rebook-then-cancel composition is N/A" **is**.

| Status | Means | When |
|---|---|---|
| `IMPLEMENTED` | you wired it | default |
| `N/A — <reason>` | genuinely does not apply to your vendor | the reason must name a **property of the vendor**, not your schedule |
| `DISCLOSED — <ticket>` | **platform debt** — real, pre-existing, not yours to fix in a provider PR | you must still **cite it and file it.** Silently inheriting a platform gap is the classic failure mode. |

**Which applies?** Ask: *does this gap break MY provider on day one?* Yes → `IMPLEMENTED`, it ships in your PR even if it predates you. No, it's broken for everyone regardless of you → `DISCLOSED`. **Do not smuggle platform work into a provider PR, and do not inherit a platform bug in silence.**

| # | Dimension | Status | Reason (required if N/A) |
|---|---|---|---|
| 1 | Registry entry | | |
| 2 | **Externally-managed set entry** | | |
| 3 | Binding resolver + key validation | | |
| 4 | Cancel impl + 3 classifiers | | |
| 5 | Provider-write create branch | | |
| 6 | Provider-write delete branch | | |
| 7 | Provider-write update branch **or explicit no-op** | | |
| 8 | Event-create persistence + origin entry | | |
| 9 | Reschedule 3 guards + sync-calendar branch (state which helper the branch calls) | | |
| 10 | Conferencing branch + widened return type | | |
| 11 | Chat tool gate — **`NO N/A`**: your tool must be reachable on text | | |
| 12 | Voice tool defs — **`NO N/A`**: same tool, reachable on voice | | |
| 13 | Voice proxy handlers | | |
| 14 | Prompt block + **all** channel builders (incl. the least-used one). Any native-tool-naming slot block is also gated: **`NO N/A`** | | |
| 15 | Your provider's flags reach the prompt builders | | |
| 16 | MCP availability provider + client | | |
| 17 | MCP slots service — **BOTH** loops | | |
| 18 | MCP branch predicate + flag | | |
| 19 | Calendar-audit outcome union **+ the DB CHECK migration** | | |
| 20 | MCP cancel/reschedule delegation | | |
| 21 | Slots query projection **+ host-id UNION** | | |
| 22 | Webhooks in (route, signature, raw-body prefix, dedup+TTL, queue) | | |
| 23 | **Anti-echo guards** (§6.7) | | |
| 24 | **Host resolution cascade** (vendor identity → mapped user → …, never a default host), with the email tier **escaped** against wildcard metacharacters | | |
| 24b | **Advisor visibility** (§4A): mapping-or-credential on purpose; not the "primary" role if a mapping; outcome proven by login-as-advisor; query is client-scoped | | |
| 25 | **Alert types** (ghost cancel / inverse ghost / host drift / fetch failure / host miss / partial provision / config drift) | | |
| 26 | **Health cron** + per-replica lock | | |
| 27 | **Drift reconciler** + heartbeat row | | |
| 28 | **Env kill switch** (write + sync) | | |
| 29 | Migration(s) + **RLS** + **provider-column CHECK** with drifted rows backfilled first + key exported as ONE constant | | |
| 30 | Credential rotation reminder (if the token is long-lived) | | |
| 31 | **Doc + doc-index entry** | | |
| 32 | **Ops runbook** | | |
| 33 | Tests: branch predicate, union, fail-closed, audit outcome, cancel delegation, caller integration, "zero native tool names when suppressed" | | |
| 34 | Timezone anchored to the workflow timezone in **both** services | | |
| 35 | Downstream acceptance (§4) verified **by DB query**, not the operations object | | |

---

## 10. COPY-PASTE ACCEPTANCE CHECKLIST

Tick every box. **Every item is a query, a test, or a grep — none is vibes.** Paste this into the PR with evidence inline.

### A. Shape decision
- [ ] The design doc states external-booker vs in-code **and why** (§1).
- [ ] If external-booker: **all four verbs exist** (slots/create/reschedule/cancel), and the config names create/reschedule/cancel.
- [ ] If in-code + vendor owns the calendar: the key is in the **externally-managed set**.
- [ ] **Config-decay sweep** (§3.4): an appointment workflow that LOST its external-booking config **while its siblings still have it** books natively. Scope by sibling, never absolutely (absolute scoping is a false-positive generator that gets muted).
- [ ] Orphan-mirror sweep: workflow-tool mirrors with no source link and your tool names → **0 rows**.

### B. THE DIFF (the real checklist)
- [ ] **Run THE DIFF** (North star) against your most-complete provider. Every `<` line is answered in §9 — implemented, or N/A with a reason. Zero unanswered.
- [ ] Your key is inside the **externally-managed set** (read the line, not just a grep count).
- [ ] Your key appears in the **alert types** file (≥4 hits).
- [ ] Your key appears in the router/init beyond the router mount (cron/queue/processor).
- [ ] Your kill-switch env vars appear in the code (≥2 hits).
- [ ] Your key appears in the doc index (≥1 hit).
- [ ] **Anchored** provider-spelling check: exactly ONE spelling in the events table, == your key (a bare substring match cannot pass — anchor the regex).
- [ ] Every INSERT path writes the exported constant, never a repeated string literal.
- [ ] The provider-column CHECK is on the **LIVE** column (read the definition, not the name) and lists your key.
- [ ] §9 table has **zero blank cells**.

### C. Routing correctness (in-code)
- [ ] Create with your provider returns a **real result**, not the fallback.
- [ ] Delete/reschedule with your provider don't hit the unknown-provider / skipped tails.
- [ ] A **typo'd** key does not resolve to native with an empty gated set.
- [ ] Cancel with host null and with host set take the **intended** branch in both cases (§2.4).
- [ ] Your externally-managed predicate returns **true** for your key.
- [ ] Host resolution with a wildcard-metachar email resolves to **that user or nobody** (escape check present).
- [ ] A conferencing partial success **persists the external event id**.
- [ ] If reschedule has a locally-shadowed helper, the PR states **which** one your branch calls and why.

### D. MCP
- [ ] Your provider's slots appear in the **merged** output (proves BOTH loops), not just the fetch.
- [ ] A vendor fetch error **excludes the host** and surfaces it — it does not degrade to `[]`.
- [ ] The branch predicate = flag AND host-flag.
- [ ] Staging: audit rows for your key exist (proves the CHECK was widened before deploy).
- [ ] The slots query returns a **pure-vendor host** (no availability-schedule row).
- [ ] MCP cancel/reschedule for a provider-backed row **delegates** and never writes cancelled locally.
- [ ] The conferencing response type includes your key (or explicit N/A).

### E. Gating + prompt
- [ ] The resolved gated-tool set for your provider ⊇ the native booking tools, and `cancel_event` is **NOT** in it.
- [ ] **Zero native tool names in the assembled prompt across all channels** when suppressed.
- [ ] Tested at the **CALLER** level that the full resolved object is destructured and every derived flag reaches the prompt builder.
- [ ] Any native-tool-naming slot block is **not** injected for a suppressed workflow (extend the existing harness).
- [ ] The reminder/notification call path uses the shared booking-gate resolver, not a hardcoded tool set.
- [ ] No param exists in a schema the LLM sees that the server ignores (check DB params AND the registry).
- [ ] **Channel reachability**: your booking tool name appears in the assembled tool set on **BOTH** voice and text (assert on tool `.name`, not string identity).
- [ ] Intent-check / safe-path baseline **disclosed** if it is asymmetric across channels.

### F. Downstream acceptance — run for ONE real staging booking
Book one meeting end-to-end through the agent, capture the ids, then:
- [ ] The event row has **no NULL** in the column-backed must-haves (§4.1), correct status, provider = your key. (Host id is the one that will actually be NULL — that is §4A, not a pass.)
- [ ] Lead-reminder rows exist, **pending** (not skipped), event id set.
- [ ] Host-reminder rows exist, same.
- [ ] A host-notification log row **with the real host** as recipient, not the client owner.
- [ ] A lead-activity booking row exists.
- [ ] The workflow run's current status = the booking-target status.
- [ ] **Exactly 1** booking-target status on the workflow.
- [ ] The lead's confirmation email arrived with a **real link**, not a placeholder.
- [ ] The host email's tz **label** and **digits** agree with the workflow timezone.
- [ ] **Advisor visibility** (§4A): log in as the **assigned advisor** (not admin) and confirm the meeting renders. A null host is invisible forever.
- [ ] Count of your-key events with null host in the last 90 days → **0**.
- [ ] The advisor's connection row is a **mapping or credential** on purpose, and not the "primary" role if a mapping.
- [ ] **You did NOT use the operations object as evidence for any of the above.**

### G. Lifecycle
- [ ] Reschedule → vendor shows the **new** time AND the record matches AND sync status is synced.
- [ ] Cancel → **the vendor event is gone** (check the vendor, not your DB) AND the row is cancelled AND its reminders are cancelled.
- [ ] Cancel with the vendor already-cancelled → **idempotent success**, not an error.
- [ ] External-booker only: a reschedule for a lead with **no mirror** → a mirror is **created** (§3.3).
- [ ] External-booker only: cancel → the mirror flips to cancelled and reminders die.
- [ ] Book twice in a row (double-fire) → **1** record.
- [ ] Set-status out of the booking target into lost/paused/deferred → event auto-cancelled. Into **won** → **NOT** cancelled.

### H. Observability + ops
- [ ] Force a vendor error → an alert fires in your ops channel, not just a warning.
- [ ] **Empty-candidates miss** (§6.3): a webhook whose host candidate list resolves **empty** → your host-miss alert **FIRES**.
- [ ] **Unresolvable lead** (§6.3): a booking matching **none** of your resolution tiers → an **alert** fires and evidence is persisted (no silent `info`-log at the drop).
- [ ] Your drift reconciler has a **heartbeat** row in the last couple hours, including on clean sweeps.
- [ ] Flip the kill switch off → writes stop and the agent degrades **gracefully** (no phantom confirmations).
- [ ] Your table's RLS: SELECT restricted to privileged roles; INSERT/DELETE service-role only.
- [ ] Staging: run the migration, reload the schema cache, re-run F.
- [ ] The `.sql` file is committed.
- [ ] Prod migration applied **only after explicit approval**, and the **RESULT verified in prod**.

### I. Final
- [ ] Full test suite green except any known pre-existing flake.
- [ ] Any ordered-`.single()` integration-test counter is intact.
- [ ] Pre-prod checks run for the surfaces you touched.
- [ ] The design doc is written and indexed.
- [ ] PR targets your integration branch, never prod.

---

## 11. The one-paragraph version

Decide external-booker vs in-code in writing before coding. External-booker needs all four verbs (a booker shipped without a cancel tool has invisible cancellations) plus a hand-set `disabled_builtin_tools`. In-code needs two services, and the single most important line is not the registry — it is the **externally-managed set**, because the registry's "external" flag is decorative and every mutation guard reads that set instead. Model the write on whichever provider actually writes through your dispatcher, the read on your query-availability provider, and never on a provider whose per-host tokens are decorative. A canonical-event INSERT proves nothing: the side-effect bundle returns success for ops it never attempted, so **verify by querying the resulting records** — and assign a host, because non-native providers tend to end up with a null host 100% of the time, which silently kills the confirmation email and the vendor-side delete. Gate the tools and the prompt with the same derived signal, or the model narrates confirmations for meetings that do not exist. Finally: fill in the **§9 table with zero blanks** and run THE DIFF against your most-complete provider. The files you never open are the ones that bite.
