---
name: prompt-rewrite-checklist
description: Operational checklist the edit agent walks before emitting ANY prompt rewrite. Activate whenever you're about to call updateWorkflow with a global_prompt, channel_prompts, or any tagged section change. Runs through 10 gates distilled from Nexor production incidents and Anthropic's 4.6 doctrine.
version: 1.0.0
tags:
  - checklist
  - prompt-engineering
  - operational
---

# Prompt rewrite checklist — 10 gates before you ship

Walk this before calling `updateWorkflow` with ANY prompt-related patch (global_prompt, channel_prompts, tone change, objection rewrite, etc). If a gate fails, fix or ask — don't ship the patch.

This is the short operational version. For the theory behind each gate, activate the matching deep-dive skill: `claude-prompt-fundamentals`, `nexor-prompt-style`, `voice-scripting-v3`, `xml-tag-discipline`.

---

## Gate 1 — Language consistency
All examples and rules MUST be in the user's language (detected from their turns, not from business context accents). If the user is writing Spanish, the prompt should be Spanish end-to-end. No code-switching inside a tag.

**Fail example**: ES conversation + English rules inside `<agent_limits>`.
**Pass example**: everything in the same language as the user's chat.

---

## Gate 2 — Zero emojis
Strip emojis from anything you emit. The only exception is an emoji the user explicitly pasted and asked to preserve verbatim.

Why: voice models read them as "corchete sonrisa" or emit beeps. WhatsApp copies them into conversation examples where they bleed into the agent's voice.

---

## Gate 3 — Voice-safe scripting (if target is Retell or conversation_examples)
If the rewrite will be spoken:
- ALL lowercase (CAPS reserved for ≤1 keyword)
- Commas chain ideas, no periods mid-message
- Audio tags embedded in ≥2 word phrases, lowercase inside brackets
- `{{lead_first_name}}` literal, double-braced
- ≤180 chars for begin_message, ≤2 sentences mid-turn
- Zero markdown

Full rules: activate `voice-scripting-v3`.

---

## Gate 4 — Conciseness budgets
Nexor production limits:

| Section | Hard limit |
|---|---|
| Business context total | ≤300 words |
| Objection response (each) | ≤200 chars |
| Conversation examples total | ≤400 words |
| Tone instructions | ≤5 lines |
| Voice turn output | ≤2 sentences |
| WhatsApp turn output | ≤3 short sentences |

Over budget = delete, collapse, or move to a processor.

---

## Gate 5 — Tool silence
No rewrite should mention tool names, tool parameters, internal IDs, error codes, or system jargon. The lead sees results, not mechanisms.

If the rewrite needs to reference tool behavior, frame it as the agent's capability ("can book meetings", "knows today's calendar") not as the tool ("calls get_available_slots").

Full enforcement runs in `banned-word-replacer.ts` after you — but don't rely on the processor. Keep the prompt clean.

---

## Gate 6 — XML discipline (if target is global_prompt)
Before emitting a `global_prompt` patch:

- [ ] Every existing tag is still present.
- [ ] No new tag names.
- [ ] No renamed tags.
- [ ] Every opening tag has a matching closing tag.
- [ ] Only the target section's CONTENTS changed.
- [ ] No content outside any tag.

Full rules: activate `xml-tag-discipline`.

---

## Gate 7 — Conditional scoping
Does the rule apply always, or only for a specific goal_type / channel / workflow state?

- **Booking rules** → only if `goal_type === 'appointment'`
- **Cancellation rules** → only if there's an active appointment
- **Escalation triggers** → always in `<escalation>`, no scoping needed
- **Objection handling** → always in `<objection_handling>`

If the rule is conditional, scope it inside the tag with an `"if X then Y"` line. Don't add it as an unconditional rule if it only applies in specific states.

---

## Gate 8 — No generic filler
Every rule must be specific to THIS business or industry. Generic platitudes are worse than nothing — they dilute the real rules.

**Delete candidates**:
- "Be respectful" → trivially obeyed already, dilutes real rules
- "Be helpful" → same
- "Build rapport" → too vague to act on
- "Use a friendly tone" → replaced by the `<business_context>` opening or by the audio tag

**Keep candidates**:
- "Di 'mudanza', no 'traslado'" → specific vocabulary
- "Si el lead menciona cobertura fuera de RM, responde que no hay servicio" → specific domain rule
- "Nunca prometas rentabilidad garantizada" → specific legal constraint

---

## Gate 9 — Positive framing (Anthropic 4.6 doctrine)
Tell the model what to DO, not what not to do.

**Fail**: "Don't mention the tool name to the lead."
**Pass**: "Speak as if you have direct knowledge of the calendar."

**Fail**: "Never use ellipses."
**Pass**: "Your response is read aloud by TTS, use commas for pacing."

Add the WHY where it's non-obvious. Claude 4.6 generalizes from the explanation.

Source: `claude-prompt-fundamentals`.

---

## Gate 10 — Redundancy check
Before emitting, scan the new prompt for:

- [ ] The same rule stated in two sections (role + rules + examples).
- [ ] Negative lists that overlap with `banned-word-replacer.ts` (delete — the processor handles it).
- [ ] Contradictions ("be concise" + "explain thoroughly" somewhere else).
- [ ] Restatements of model defaults (4.6 is already polite, precise, contextual).

Collapse 5 rules into 1 principle whenever you can. State the principle, give 1 concrete example, delete the rules.

---

## Emergency stop

If after walking all 10 gates the rewrite still doesn't feel right, STOP and ask the user ONE clarifying question. Better to re-ask than to ship a degraded prompt to production.

Common clarifying questions:
- "¿Esto aplica siempre o solo cuando el lead X?"
- "¿Es para todos los canales o solo WhatsApp/voice/email?"
- "¿Quieres reemplazar la regla actual o agregarla al final?"
