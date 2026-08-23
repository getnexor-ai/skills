---
name: lead-communication-history
description: Read and explain the actual communication history for one Nexor lead across phone-call transcripts, email bodies and delivery events, SMS, and WhatsApp. Use when someone asks what was said, sent, received, promised, answered, or left unanswered for a specific lead, or asks for a chronological lead conversation summary grounded in Nexor MCP data.
---

# Lead communication history

## Goal

Answer lead-specific communication questions from the stored message bodies and call transcripts, with the correct channel, direction, and time. Do not substitute cross-lead search previews or meeting transcripts for the lead's communication timeline.

## Workflow

1. Resolve exactly one `lead_id`.
   - Use the current lead scope or an explicit id when available.
   - Otherwise call `list_leads` with the person's name, email, or phone.
   - If multiple plausible leads remain, present the distinguishing details and ask which lead; never merge their histories.
2. Call `get_lead_history` for the requested content.
   - For all supported communication, pass `channel: "call,whatsapp,email,sms"`.
   - For one channel, pass its exact lowercase name.
   - Use `order_by: "desc"` for newest-first questions and `order_by: "asc"` for a chronological narrative.
   - Use `limit` up to 200. When `pagination.has_more` is true and the answer requires complete history, increment `offset` and continue until it is false.
3. Read the content from the returned item type.
   - WhatsApp and SMS: `type: "message"`; read `direction`, `content`, attachments, status, and `timestamp`.
   - Email: read both `type: "email"` rows for subject/body/delivery details and `type: "message", channel: "email"` rows for conversation content. Reconcile overlapping records by direction, timestamp, provider id when present, subject, and body instead of counting the same email twice.
   - Phone calls: `type: "call"`; read `summary` and `transcript`. A `call_missed` item has no conversation transcript.
   - Treat `direction: "outbound"` as content sent by Nexor or the operator and `direction: "inbound"` as content received from the lead.
4. Use the right neighboring tool only when needed.
   - Use `search_conversations` for discovery across many leads, not as evidence for one lead: it returns bounded previews and has no `lead_id` filter.
   - Use `list_transcripts` then `get_transcript` for a scheduled meeting transcript. These tools do not retrieve phone-call transcripts.
   - Use `anchor_ts` with `before` and `after` on `get_lead_history` when the user asks for context around a known message or moment.
5. Answer from the retrieved evidence. Separate communication events from their content: state what happened, then what was actually said. Include channel, direction, and timestamp for material claims.

## Guardrails

- Do not claim the history is complete while `pagination.has_more` is true.
- Do not infer missing words from a summary, failed call, attachment, empty body, or truncated/absent transcript. State what is unavailable.
- Do not call a meeting summary a phone-call transcript, or a delivery/open event an email reply.
- Do not treat a failed or unanswered call as evidence that the phone number is invalid.
- Keep tenant and lead scope exact. Never use one lead's communication to answer about another.
- This is a read-only workflow. Do not send a reply, change a lead, or start/stop automation unless the user separately requests that action.

## Output

- Lead with the direct answer or concise chronology.
- Distinguish outbound content, inbound replies, call transcript statements, and delivery-only events.
- Name gaps that affect confidence, including missing transcripts, empty bodies, attachments not represented as text, or unread pages.
