# WhatsApp reference — durable rules

Provider truth that rarely changes. Adapted from the WhatsApp Cloud API for use through
Nexor's MCP tools. When Nexor's tool behavior and this doc disagree, the tool wins.

## Templates

### Naming & structure
- Name is **lowercase_with_underscores**, ≤ 50 characters, unique per business account.
- A template has components: **BODY** (required), optional **HEADER**, **FOOTER**, and
  **BUTTONS**.
- Body uses `{{variable}}` placeholders. Rules Meta enforces:
  - A variable may **not** start or end the body text.
  - Two variables may **not** be adjacent (`{{a}} {{b}}` is rejected).
  - Every variable needs a realistic **example value** for review (Nexor sends these
    from the `variables` you provide).
- Footer text allows **no variables**.
- Prefer **named** parameters (`{{nombre}}`) over positional (`{{1}}`). Nexor
  auto-resolves its canonical names at send time: `{{nombre}}`, `{{agente}}`/
  `{{ejecutivo}}`, `{{empresa}}`, `{{producto}}`; meeting reminders also get
  `{{fecha}}`, `{{hora}}`, `{{asesor}}`, `{{link_reunion}}`. Other names still work but
  fall back to LLM resolution.

### Headers
- Formats: `TEXT`, `IMAGE`, `VIDEO`, `DOCUMENT`.
- A `TEXT` header may contain at most one variable.
- Media headers (`IMAGE`/`VIDEO`/`DOCUMENT`) need a public **https** URL as the
  example/content — you cannot upload a local file through these tools.

### Buttons
- Types: `QUICK_REPLY`, `URL`, `PHONE_NUMBER`.
- Do **not** interleave `QUICK_REPLY` with `URL`/`PHONE_NUMBER` — group them.
- A URL button's variable must be at the **end** of the URL.

### Categories
- `UTILITY` — transactional/expected messages tied to an interaction the user took
  (order updates, appointment reminders, account notices). Cheaper, approved faster,
  less risk.
- `MARKETING` — promotions, offers, re-engagement, anything persuasive. Higher scrutiny
  and cost; over-use drags the quality rating down.
- `AUTHENTICATION` — one-time passcodes only.
- Pick the **narrowest** category that honestly fits. Meta re-categorizes templates it
  disagrees with, and mis-categorized MARKETING sent as UTILITY is a common rejection
  and a quality-rating risk.

### Approval lifecycle
- Status flow is Meta-owned: `PENDING → APPROVED | REJECTED`; an approved template can
  later be `PAUSED` or `DISABLED` if quality drops.
- Approval is asynchronous (minutes to ~48h). Poll `check_whatsapp_template_approvals`.
- There is **no in-place edit**. To change a rejected (or any) template, submit a
  revision under a **new name**; delete the old one after if desired.

## Starter templates by agent goal

Adapt these to the agent you read in `get_workflow` — swap in its real product, company,
persona, and language; keep the variable names canonical so they auto-resolve. These are
starting points to propose, not fixed copy. Every `{{variable}}` needs an example.

### Appointment / booking / confirmation agents

The highest-value set. Lead with these when the agent books meetings.

- **`confirmacion_cita`** — category `UTILITY`, purpose `reminder`.
  - Body: `Hola {{nombre}}, tu cita con {{empresa}} quedó agendada para el {{fecha}} a las {{hora}}. Aquí está tu enlace: {{link_reunion}}`
  - Buttons: `QUICK_REPLY` "Confirmar", `QUICK_REPLY` "Reagendar"
  - Examples: `nombre=Juan`, `empresa=Clínica Dental Norte`, `fecha=15 de enero`, `hora=10:30`, `link_reunion=https://meet.example.com/abc`
- **`recordatorio_cita`** — category `UTILITY`, purpose `reminder`.
  - Body: `{{nombre}}, te recordamos tu cita mañana {{fecha}} a las {{hora}}. ¿Nos confirmas?`
  - Buttons: `QUICK_REPLY` "Ahí estaré", `QUICK_REPLY` "Necesito reagendar"
- **`reactivacion_no_show`** — category `MARKETING`, purpose `reactivation`.
  - Body: `Hola {{nombre}}, no pudimos concretar tu cita. ¿Quieres que te ayude a encontrar un nuevo horario con {{agente}}?`
  - Buttons: `QUICK_REPLY` "Sí, reagendar", `QUICK_REPLY` "Ahora no"

A confirmation is `UTILITY` because it is tied to an action the lead took (booking);
keep it transactional and it approves fast and cheap. A win-back nudge is `MARKETING`.

### Sale / qualification / information agents

- **`saludo_bienvenida`** — category `MARKETING`, purpose `greeting`.
  - Body: `Hola {{nombre}}, soy {{agente}} de {{empresa}}. Vi tu interés en {{producto}} — ¿te ayudo a resolver tus dudas?`
  - Buttons: `QUICK_REPLY` "Sí, cuéntame", `QUICK_REPLY` "Ahora no"
- **`seguimiento_1`** — category `MARKETING`, purpose `follow_up`.
  - Body: `{{nombre}}, ¿pudiste revisar lo que te envié sobre {{producto}}? Quedo atento a cualquier duda.`
  - Buttons: `QUICK_REPLY` "Sí, hablemos", `QUICK_REPLY` "No me interesa"
- **`reactivacion`** — category `MARKETING`, purpose `reactivation`.
  - Body: `Hola {{nombre}}, hace un tiempo hablamos sobre {{producto}}. ¿Retomamos?`
  - Buttons: `QUICK_REPLY` "Retomar", `URL` "Ver más" → `{{empresa}}` site URL

### Notes

- Opt-out safety: a `MARKETING`/cadence template pairs a continue-style quick reply with
  an opt-out one ("No me interesa" / "Ahora no"). Nexor flags this on review.
- Two-button quick-reply pairs are the common shape for greeting/follow-up templates.
- A `PHONE_NUMBER` button ("Llamar") is useful on confirmations for high-touch verticals;
  remember the ≤ 1 phone-button limit.

## Quality, risk & limits (reading `get_whatsapp_health`)

- **quality_rating**: `GREEN` healthy · `YELLOW` warning, tighten sends · `RED` at real
  risk of Meta restriction — pause marketing sends, review recent template content and
  targeting, lean on UTILITY.
- **messaging_health.can_send_message**: `AVAILABLE` · `LIMITED` (throttled/warm-up) ·
  `BLOCKED` (cannot send). The `entities[]` carry per-WABA / per-phone `error_code`
  plus a suggested fix — surface those verbatim.
- **messaging_limit**: `reported_tier` (TIER_50/250/1K/10K/100K/UNLIMITED) and a
  `daily_ceiling`. Tiers rise automatically with volume + good quality.
- **route_verification.status**: `valid` / `invalid` / `unknown`. `invalid` (or a
  `recommended_action` of `reconnect_or_resync`) → run `reconcile_whatsapp_number`;
  if it still fails, the number needs a fresh setup link.
- Common risk signals to call out: RED quality, `account_restricted`, an expired token,
  and a spike in delivery errors.

## The 24-hour customer-service window

- After a user messages the business, a 24-hour window opens in which you may send
  **free-form** messages (`send_message` with text).
- Outside the window (or for first contact), you must send an **approved template**
  (`send_message` with `template_id`). A template reopens the window when the user
  replies.

## Connection model

- Connecting is a **hosted setup link** from `connect_whatsapp_number`; the customer
  authorizes Meta there. There is no code/OTP step to script.
- Two connection types exist: **dedicated** (a number Nexor/Meta manages) and
  **coexistence** (the customer keeps using the WhatsApp Business app on the same
  number; human sends are mirrored into Nexor).
- Inbound webhooks and events are registered automatically on completion — no manual
  webhook step.
