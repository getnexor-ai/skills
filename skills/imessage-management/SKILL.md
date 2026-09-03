---
name: imessage-management
description: "Manage a Nexor customer's iMessage (Apple blue-bubble) channel end to end through Nexor MCP tools: read the paid add-on offer and price, buy and provision a dedicated iMessage number (via Dial), poll it to ready, assign it to an agent, set the name and profile photo leads see, and send iMessage. Use whenever a customer asks about iMessage / blue bubble, its price or cost, wants to see, buy, provision, or assign an iMessage number, wants to change the name or photo shown on their iMessage, asks whether their iMessage is set up or which agent owns it, or wants to send an iMessage. iMessage bills at a FLAT $350/month per number — currently the only Nexor channel on a flat rate (all others are usage-based). iMessage has its OWN inventory and tools — it is NOT the Phone/SMS voice line, so never read its state from list_phone_numbers."
---

# iMessage management (through Nexor)

iMessage is a **paid add-on channel** delivered through Dial: a dedicated blue-bubble
iMessage number, billed as a recurring line on the client's existing Stripe
subscription. Nexor is the single front door — the customer never touches Apple or Dial
directly. Every tool is tenant-scoped automatically from the API key; **never accept or
pass a `client_id`**.

**Pricing — flat rate.** An iMessage number runs at a **flat $350/month** per number.
Say this plainly whenever iMessage cost comes up, and note that **iMessage is currently
the only Nexor channel billed at a flat rate** — every other channel (WhatsApp, SMS,
voice, email) is usage-based, so iMessage is the one where the customer pays the same
each month regardless of volume. The **full first month is charged the day of
purchase — never prorated**; from the next billing cycle the $350 rides the client's
monthly invoice. Still confirm the exact figure and the amount charged today from
`get_imessage_offer` (it is the source of truth; in a test environment it reports
`sandbox: true` and `dueTodayUsd: 0`) before you charge.

iMessage has its **own number inventory** and binds to a workflow (agent) exactly like
WhatsApp — including **group sharing**: a number bound to one agent is used by every
agent in the same agent group (`master_workflow_id`). It is not the Phone/voice/SMS line.

## The one rule that prevents the most common mistake

**Never read iMessage state from `list_phone_numbers`.** That tool lists the voice/SMS
(Retell) inventory. A Dial iMessage number can surface there as a voice/SMS-style row
with `workflow_id: null` — that row is **not** its iMessage state and says nothing about
whether the number is a ready, assigned blue-bubble sender. Always use
`list_imessage_numbers`. If you find yourself inferring iMessage readiness from the phone
inventory, stop and call `list_imessage_numbers` instead.

## The tools, by job

| Job | Tools |
|-----|-------|
| See iMessage numbers + status + which agent owns each | `list_imessage_numbers` |
| Read the add-on offer (price, due-today, eligibility, card) | `get_imessage_offer` |
| Buy + provision a new iMessage number (**charges money**) | `provision_imessage_number` |
| Assign / unassign a number to an agent | `assign_imessage_to_workflow` |
| Read one number's live details (status, agent, name, photo) | `get_imessage_number` |
| Set the first/last name leads see on the blue bubble | `set_imessage_display_name` |
| Set the profile photo leads see | `set_imessage_profile_photo` |
| Send an iMessage to a lead | `send_message` (channel `imessage`) |

## Capability model — "ready" is not enough, it must be assigned

An iMessage number can send to a lead only when **both** are true:

1. `setupStatus` is `"ready"` (Dial finished provisioning — not `provisioning` or `failed`), and
2. it is **assigned to the target workflow or to a sibling in the same agent group**
   (bound via `assign_imessage_to_workflow`; siblings inherit it through
   `master_workflow_id`, exactly like WhatsApp).

An unassigned number is **dormant**: still owned and billed, but detached — it sends
nothing, and the agent shows no iMessage capability. This is the #1 gotcha: a perfectly
"ready" number that was never assigned silently contacts no one. When a customer says
"my iMessage isn't working," check `list_imessage_numbers` for both `setupStatus: ready`
**and** a non-null bound workflow before looking anywhere else.

`list_imessage_numbers` / `get_imessage_number` expose the sharing directly:
`imessageWorkflowId` is the single owner, `owner` adds its name and agent group
(`masterWorkflowId`, `masterName`), and `sharedWith` lists every sibling agent that
already sends and receives through the number. **An agent in `sharedWith` is connected**
— do not "fix" it with another assign call; that only moves the owner around.

## Buy + provision a number (ordered, consent-gated — it charges money)

Follow this order every time; never skip the offer or the confirmation.

1. **`get_imessage_offer`** — the recurring monthly price (USD), the amount charged today
   (`dueTodayUsd`, the full first month), `canPurchase` and, if not, why (`no_subscription` / `trial_not_allowed` /
   `no_payment_method` / `external_billing` / `purchase_disabled`), the card on file
   (brand + last4), how many iMessage numbers they already own, and a `state` of
   `active | purchasable | unavailable`. If `state` is `"unavailable"`, the add-on is
   **not enabled for this client (pilot rollout)** — do not attempt to provision; say so.
2. **Tell the user the flat monthly rate (the $350/month per number, confirmed against
   the offer) and that the full first month is charged today, and get explicit
   confirmation.** Frame
   it as a flat rate — the same every month regardless of how many iMessages they send —
   and, if useful, that it is the only Nexor channel priced this way. Never charge
   without explicit confirmation.
3. **`provision_imessage_number` with `accept_charge: true`** — charges the card
   immediately and starts provisioning. Fails with `imessage_consent_required` if
   `accept_charge` is not true, or an eligibility code (`imessage_no_subscription`,
   `imessage_no_payment_method`, `imessage_purchase_disabled`) when the client can't be
   charged. The charge is idempotent per call — retrying the same tool call is safe;
   deliberately calling it again buys a **second** number.
4. **Poll `list_imessage_numbers`** until the new number's `setupStatus` is `"ready"`
   (provisioning is asynchronous — do not tight-loop; a few polls spaced out).
5. **`assign_imessage_to_workflow`** — bind it to the agent that should own it (see below).

## Assign / unassign

`assign_imessage_to_workflow` binds an iMessage number to a workflow (agent): this is
what makes inbound iMessages reach that agent, and the number's display name follows the
agent's persona. Omit `workflow_id` to **unbind** (the number stays owned and billed,
just detached). An agent group (or a standalone agent) keeps **at most one** iMessage
number — binding a number to an agent whose group already has one replaces it, releasing
the sibling's number to dormant. Bind **once per group**: every sibling under the same
`master_workflow_id` sends through the owner's number automatically, new inbound leads on
that number land on the owner agent, and existing leads follow whichever sibling holds
their active run. To pick the agent, list options with `list_workflows`; to confirm the
target belongs to this client it must appear there.

## Display identity — the name and photo leads see

Every iMessage number carries a **display identity**: first name, last name and a profile
photo shown beside its messages in the lead's Messages app. This is the same surface as
the dashboard's "Edit iMessage number" dialog, and it is the ONLY thing editable on a
number — call-specific Dial settings (inbound call instruction, language, voice, call
duration) and the internal nickname are not editable anywhere, by decision.

- **Read first** with `get_imessage_number({ number_id })` — it returns the live
  `firstName`, `lastName`, `avatarUrl` from Dial along with status and the bound agent.
- **Name**: `set_imessage_display_name({ number_id, first_name?, last_name? })` — at
  least one of the two; each ≤ 30 characters; an empty string clears that part.
- **Photo**: `set_imessage_profile_photo({ number_id, image_url })` — a public http(s)
  image URL (jpeg/png/gif/webp, ≤ 5 MB). Photos can be **replaced but never removed**;
  do not promise to delete one. This tool does not upload files: the image must already
  be hosted.
- **Precedence**: by default the name follows the agent's persona and is re-synced on
  assignment. Once you set a name by hand it becomes **authoritative** — it stops
  following the agent, including on re-assignment. Say this when an operator asks why
  the name did or did not change.
- Changes reach recipients' devices within a few minutes; a `422
  imessage_number_invalid_fields` reply carries `fieldErrors` naming the rejected field.
- **Read back** with `get_imessage_number` and report the resulting identity.

## Sending

`send_message` with channel `imessage` sends plain text to a lead — **no templates, no
approval, no 24-hour window** (unlike WhatsApp). Delivery has no receipt: silence maps to
"sent" and a read receipt is the only upgrade signal, so do not report a send as failed
just because there is no delivery confirmation. Sends are rate-gated (a per-day
new-conversation cap and an Apple "unreplied" cap); a denied send is a normal outcome to
surface, not an error to retry.

## "The iMessage lookup came back unavailable"

If `list_imessage_numbers` / `get_imessage_offer` return unavailable, or the iMessage
tools are not present at all, the API key is **missing the `imessage:read` / `imessage:write`
scope** (older keys were minted before iMessage existed). Say that plainly and have the
operator re-grant the key's scopes — do **not** fall back to guessing iMessage state from
`list_phone_numbers`.

## Guardrails

- Never pass `client_id` — the tenant is derived from the key.
- Provisioning **spends money** (a recurring monthly line). Always show the price from
  `get_imessage_offer` and get explicit confirmation before `provision_imessage_number`.
- Assignment is what makes a ready number actually live — always finish with
  `assign_imessage_to_workflow` and read back which agent owns which number and which
  siblings share it (`owner` + `sharedWith`). One number per agent group; never re-assign
  a shared number to a sibling that already appears in `sharedWith`.
- Identity edits are name + photo only; never attempt call settings or the nickname.
- Read iMessage state only from `list_imessage_numbers`, never from `list_phone_numbers`.

## Related skills

- `automation-architecture` — wiring the agent's workflow, statuses, cadence, and
  channel mix that iMessage plugs into (iMessage participates in the initial-contact
  cascade and per-block cadence like any other channel).
- `whatsapp-management` — the parallel messaging channel; same "assign a number to an
  agent, the whole agent group shares it" shape, but WhatsApp uses templates and a
  24-hour window that iMessage does not.
