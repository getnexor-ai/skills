---
name: meta-whatsapp-templates-spec
description: Meta WhatsApp Business templates specification — variables, components, limits, categories, status flow, and anti-spam rules. Activate when proposing, creating, validating, listing, or interpreting templates so output matches what Meta will actually accept.
version: 1.0.0
tags:
  - whatsapp
  - meta
  - templates
  - validation
---

# Meta WhatsApp Templates — Spec Reference

## Variables (Nexor convention: NAMED, not positional)

**Always use named variables in Spanish snake_case** — never `{{1}}`, `{{2}}`, etc. Nexor builds Meta-compatible templates with `parameter_format: "NAMED"` and the runtime auto-fills these names from lead/client data at send time.

Syntax: `{{nombre}}`, `{{empresa}}`, `{{fecha}}`, `{{hora}}`, ... (curly braces, snake_case identifier).

Rules:
- Each named variable appears only once per component (reuse the same name to repeat the value)
- BODY supports vars; HEADER (TEXT only) supports vars; FOOTER does NOT support vars; URL button supports exactly one var at the end of the URL only
- Every variable needs an example value supplied at create time (Meta uses these for review)
- Positional `{{1}}` syntax is legacy — never generate it; only ever read it from existing templates and translate to named when proposing replacements

### Canonical Nexor variable catalog

These names autocomplete with real lead/client data at send time. **Always pick from this catalog when applicable** instead of inventing new names. The default examples used at create time:

| Variable | Default example |
|---|---|
| `{{nombre}}` (alias `{{name}}`, `{{first_name}}`) | "Juan" |
| `{{apellido}}` (alias `{{last_name}}`) | "Pérez" |
| `{{email}}` | "cliente@ejemplo.com" |
| `{{telefono}}` (alias `{{phone}}`) | "+56912345678" |
| `{{empresa}}` (alias `{{company}}`) | "Empresa" |
| `{{fecha}}` (alias `{{date}}`) | "15 de enero" |
| `{{hora}}` (alias `{{time}}`) | "10:00 AM" |
| `{{precio}}` (alias `{{price}}`) | "$100.000" |
| `{{producto}}` (alias `{{product}}`) | "Producto" |
| `{{direccion}}` (alias `{{address}}`) | "Av. Principal 123" |
| `{{link}}` (alias `{{url}}`) | "https://ejemplo.com" |

Prefer the Spanish form (`nombre`, `empresa`, `fecha`) when the workflow language is Spanish; use the English alias (`name`, `company`, `date`) when the workflow language is English. Mixing both in the same template is rejected at builder time — pick one set per template.

### Custom variable names

If a slot is not in the catalog (ex. `{{plan}}`, `{{descuento}}`, `{{cita_id}}`), invent a snake_case name that maps to the closest field in the workflow's `lead_field_values` or client product description, AND supply an explicit example. Names should be product-meaningful (`{{plan_contratado}}` not `{{var_3}}`).

### Reference for the builder code

The platform's template builder is the source of truth: variables are extracted with the regex `/\{\{(\w+)\}\}/g`, and templates with all-numeric var names route to POSITIONAL; otherwise NAMED. Drafting agents should always emit NAMED.

## Components

A template is a list of components. Allowed types and order: HEADER (optional, max 1) → BODY (required, max 1) → FOOTER (optional, max 1) → BUTTONS (optional, max 1 group).

| Component | Subtype | Char limit | Vars allowed | Notes |
|---|---|---|---|---|
| HEADER | TEXT | 60 | yes (max 1) | One line only |
| HEADER | IMAGE / DOCUMENT / VIDEO / LOCATION | n/a | no | Needs `example.header_handle` (media URL or media ID) |
| BODY | TEXT | 1024 | yes | The main message |
| FOOTER | TEXT | 60 | NO | Static disclaimer / brand line |
| BUTTONS | QUICK_REPLY | 25 per text | no | Up to 3 if used alone |
| BUTTONS | URL | 25 text, 2000 URL | 1 (URL only, at end) | Up to 2 |
| BUTTONS | PHONE_NUMBER | 25 text, full phone | no | Up to 1 |
| BUTTONS | COPY_CODE | 15 example | no | OTP / coupon copy-to-clipboard |

Mixed buttons total max 10. QUICK_REPLY and CTA (URL/PHONE) cannot mix in the same template.

## Categories (Meta)

| Category | Use | Pricing | Special rules |
|---|---|---|---|
| MARKETING | Promos, offers, announcements | highest | needs opt-in, slowest review |
| UTILITY | Order updates, appointments, account alerts | medium | must be triggered by user action |
| AUTHENTICATION | OTP codes only | lowest | body restricted to verification copy + code, often auto-approved |

Internal taxonomy (Nexor `internal_type` — not visible to Meta): `opening`, `follow_up`, `utility`, `marketing`, `authentication`. Map operator-facing labels: opening → "primer contacto", follow_up → "seguimiento", utility → "servicio", marketing → "marketing", authentication → "autenticación".

## Naming + Language

- `name`: lowercase snake_case, max 512 chars, unique per WABA per language. Use clear semantic names (`appointment_reminder_24h`, NOT `template_v3_final_FINAL`)
- `language`: BCP-47-ish Meta locale codes — `es`, `es_AR`, `es_MX`, `en`, `en_US`, `pt_BR`. Pick the closest match to the operator's audience; fall back to `es` if unsure.

## Status flow

```
SUBMITTED  → submitted to Meta, awaiting queue
PENDING    → Meta is reviewing (minutes to hours)
APPROVED   → ready to send
REJECTED   → Meta refused; reason in `rejection_reason`
PAUSED     → quality dropped; sends throttled
DISABLED   → quality red; cannot send until improved
```

`quality_score`: `GREEN` good, `YELLOW` warning, `RED` paused. Surfaces only after the template has been used in production.

## Anti-spam rules (Meta will reject)

- All-caps body, excessive punctuation (`!!!`, `???`)
- False urgency ("act now or lose forever")
- Generic claim language without specifics
- Misleading sender impersonation
- Missing opt-out hint for MARKETING
- Click-bait URLs (use the canonical client domain, not bit.ly)
- Putting the entire body inside variables (`{{1}}` only) — Meta wants to review the static copy

## Editing — Meta does NOT allow

- Body / header / footer text changes after APPROVED
- Variable count changes after APPROVED
- Category change after APPROVED (rarely allowed by Meta on case-by-case)

If a body change is needed, the only path is: create new template with `_v2` suffix, wait for approval, swap in the workflow's `template_pool`, soft-delete the old one.

## Sync flow (Nexor)

- The Nexor backend pulls Meta Graph API → upserts `whatsapp_templates` rows by `(business_account_id, name, language)` → stamps `last_synced_at`
- After `create`, status will be `SUBMITTED` locally. Re-sync after ~30 seconds to pick up `PENDING`, again at ~5 min for `APPROVED|REJECTED`
- Stale data threshold: surface a "data from X minutes ago" hint when `last_synced_at` > 30 min

## Validation checklist (use BEFORE submitting via create)

1. Body present, ≤ 1024 chars, no all-caps phrases > 5 chars
2. Variables: all NAMED snake_case (NO positional `{{1}}`), each with example, names preferably from the canonical catalog
3. HEADER if present: type valid, char limit OK, max 1 var
4. FOOTER if present: ≤ 60 chars, no vars
5. Buttons if present: not mixing QUICK_REPLY with CTA, totals within limits, URL var only at end
6. Category coherent with body (don't mark a promo as UTILITY)
7. Language tag valid Meta locale, matches workflow language
8. Name snake_case, unique within (WABA, language)
9. No PII / specific dollar amounts in static copy when sender doesn't have data to back it
10. No mix of Spanish and English variable names in the same template
