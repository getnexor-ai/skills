---
name: nexor-prompt-style
description: Nexor's internal prompt engineering conventions — what the team has actually learned from production. Activate whenever you're rewriting a Nexor workflow prompt (global_prompt, objection_handling, any tagged section). Covers the XML tag skeleton Nexor runtime expects, channel-specific patterns, and anti-patterns the team already hit.
version: 1.0.0
tags:
  - prompt-engineering
  - nexor
  - internal
  - good-practices
---

# Nexor prompt style — internal good practices

Use this skill whenever you're rewriting a Nexor-specific prompt section. These rules come from production incidents and what's already shipped in the codebase, not from generic prompt engineering theory. For the generic theory, activate `claude-prompt-fundamentals` instead.

## The North Star

Nexor's prompt engineering is **rules-light, processor-heavy**. The team moved off long instruction sets into:

- **System processors** (`banned-word-replacer.ts` — substitutes forbidden vocab silently after the LLM speaks).
- **Field-level extraction hints** (validation lives in the field schema, not the prompt).
- **Conditional injection** (load booking rules ONLY if `goal_type === 'appointment'`, cancellation rules ONLY if there's an active appointment).
- **Model selection** (voice latency > prompt tuning — pick Haiku for Retell, not Sonnet).

When you're tempted to add a rule, ask first: can a processor enforce this? Can an extraction hint validate it? Can I gate it behind a condition? If yes, do that instead.

## Nexor's global_prompt XML skeleton

These are the load-bearing tags the runtime agent reads by name. **Never rename, never drop, never invent new ones.**

| Tag | Purpose | Budget |
|---|---|---|
| `<business_context>` | Who the company is, what they sell, ICP, regional scope, vocabulary, domain facts, 4–8 business-specific conditional rules | ≤300 words |
| `<agent_limits>` | Hard NEVER rules — 3–6 prohibitions starting with "NUNCA"/"NEVER" + 1–2 conditional prohibitions + vocabulary substitutions | ≤150 words |
| `<objection_handling>` | 3–5 concrete pushback responses. Format: `si dice "X": responde "Y". si insiste: "Z"`. Each response ≤200 chars | ≤400 words |
| `<escalation>` | 2–4 trigger conditions + actions for handing off to humans. Includes "when NOT to escalate" (normal frustration) | ≤150 words |
| `<conversation_examples>` | 2–3 sample Lead/Agent dialogs, 4–6 messages each, exact voice and tone. Uses `{{lead_first_name}}` placeholder literally | ≤400 words |
| `<goal_push>` | Final instructions when all required fields are collected. Push toward appointment / sale / qualification / payment | ≤100 words |
| `<field_conversion>` | WhatsApp/Email only. Maps LLM-detected names → workflow `field_key` for the save_field tool | mapping table |

Supporting system-level blocks (channel builders add these automatically — don't put them in global_prompt):

- `<tool_usage>` — IF/THEN rules for tool orchestration
- `<voice_conversation>` — voice turn structure (one idea per turn)
- `<voice_scripting>` — ElevenLabs v3 requirements (see `voice-scripting-v3` skill)
- `<security>` — anti-hallucination rules
- `<lead>` — lead data injection (Retell compact / WhatsApp full JSON)
- `<client_persona>` — wraps the client-authored global_prompt verbatim

## Channel-specific load-bearing rules

### WhatsApp
1. **Tool silence**: *"NUNCA menciones herramientas, IDs, errores técnicos, parámetros, arrays, payloads ni acciones internas al lead"*
2. **Name discipline**: use the lead's first name ONLY in the first message and the goodbye. Elsewhere: `tu` / `te` or implied subject.
3. **No timestamps**: the WhatsApp UI already shows the time. Never write "a las 15:30".
4. **No link repetition**: if you already sent a link and the lead says "gracias"/"ok", ask about the next step. Don't resend the same link.
5. **Post-goodbye emoji-only**: after `<goal_push>` says goodbye, if the lead replies with an ack, respond with ONE emoji (🙌 😊 👋). Never re-salute.

### Retell (voice)
1. **ONE idea per turn**. Don't stack `salute + explanation + question`. Voice latency is measured in ms of silence.
2. **ElevenLabs v3 lowercase** — see `voice-scripting-v3` skill.
3. **No periods mid-message**. Commas chain ideas. Periods = abrupt tonal drops.
4. **Tool filler**: one short line ("dame un segundo"), then straight to the result. Never narrate what the tool is doing.
5. **Name sparingly** — opener + 1–2 more times max. Robotic if you overuse it.

### Email
1. **JSON output mandatory**: `{"subject": "...", "body": "..."}` — no HTML, no markdown, no text outside the JSON.
2. **No bullet lists** in the body. No `**`, `##`, `###`, `---`, `***`. Normal prose paragraphs only.
3. **Never regurgitate lead data**. The lead already knows their own info. Use it internally to decide what to offer.
4. **Discovery order**: `search_knowledge` before `search_offers` when fetching reference material.
5. **BOT WhatsApp number discipline**: if you mention a WhatsApp number, use the BOT's number, never the lead's own phone.

## BannedWordReplacer — what runs after you

The `banned-word-replacer.ts` processor silently substitutes or strips these on the way out. You don't need to list them in your prompt — the processor catches them. But knowing them helps you write cleaner prompts:

- `round-robin` / `round robin` → "rotando entre ellos"
- `single host` → "siempre la misma persona"
- `cadencias?` / `cadence` → "frecuencia" / "frequency"
- `canal` → "medio"
- `pipeline` / `funnel` → "proceso"
- `field_keys` / `schema` / `draft_config` / `session_id` / `client_id` → stripped entirely
- Any tool name pattern `(save|commit|validate|extract|hydrate|update)-[a-z]+` → stripped

## Anti-patterns the team already hit

Real production incidents — don't re-learn these:

1. **Piling rules grew ineffective.** Long banned-word lists stop working when Sonnet hits instruction fatigue. Fix: the rule moved to a post-processor.
2. **Voice latency > prompt tuning.** GPT-5.1 had silent mid-sentence gaps in Retell — rewriting the prompt did not help. Solution: switched voice model to Haiku 4.5. Rule: for voice, pick the model first, tune the prompt second.
3. **Audio tags read literally.** `[excited]` on its own line = TTS says "corchete excited corchete". Always embed inside a phrase with ≥2 words around it.
4. **Lead name repetition sounds bot-like.** Never write "Ana, entiendo. Ana, puedo ayudarte. ¿Qué necesitas, Ana?". Cap at 2–3 per conversation.
5. **Periods in voice = tonal break.** `"tengo info. es importante."` reads as machine-gun. Commas chain smoothly: `"tengo info, es importante"`.
6. **Emoji slip-through in voice.** If the LLM sees any emoji in its prompt, it mimics. Strip them from examples in voice prompts.
7. **Generic filler rules are worthless.** "Be respectful" = delete. "Di 'mudanza', no 'traslado'" = keep. Specificity wins.

## Conciseness budgets (hard numbers)

- Objection response: **≤200 chars each**
- Business context total: **≤300 words**
- Conversation examples total: **≤400 words**
- Tone instructions: **≤5 lines**
- Turn output (voice): **≤2 sentences**
- Turn output (WhatsApp): **≤3 short sentences**

Anything above these budgets is suspect. Delete, collapse, or move to a processor.

## When in doubt

- The `<tag>` already exists → rewrite its contents, never restructure.
- The user wants a "feel" change → tone lives in `<business_context>` opening or in `<conversation_examples>`, not in a new tag.
- The user wants a "rule" change → `<agent_limits>` for prohibitions, `<objection_handling>` for scripted responses, `<escalation>` for handoff triggers.
- The user mentions a channel explicitly → it's a channel_prompts override, not a global_prompt change.
