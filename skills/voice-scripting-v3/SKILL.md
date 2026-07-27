---
name: voice-scripting-v3
description: ElevenLabs v3 voice scripting rules for Retell-channel prompts and conversation examples. Activate whenever you rewrite anything the voice agent will say — global_prompt's conversation_examples, retell channel_prompts, begin_message, or any turn the user wants to tune for tone.
version: 1.0.0
tags:
  - voice
  - retell
  - elevenlabs
  - scripting
---

# Voice scripting for ElevenLabs v3

Use this skill when writing anything that will be spoken by a Retell voice agent through ElevenLabs v3. The rules here are v3-specific and differ from how you'd write a WhatsApp or email prompt. They come from ElevenLabs' own v3 prompting guide and what Nexor has learned in production.

**Important**: Anthropic has no official position on TTS prompting. Do not cite Anthropic for lowercase / period rules. These are ElevenLabs v3 behaviors + Nexor house style.

## The fundamental five

1. **Write everything in lowercase.** v3 scales tone UP on every capital letter. `"Hola. Soy Ana."` reads as three loud emphases. Write `"hola, soy ana"` instead.
2. **No periods mid-message.** Periods force terminal falls — the voice drops into "end of thought" mode, sounds machine-gun when chained. Use commas to chain ideas. Question marks and bare endings are safe.
3. **One final period is OK.** At the close of a full turn a single period is fine. The problem is only mid-turn periods.
4. **Ellipses (`...`) > punctuation for pauses.** v3 treats ellipses as natural speech pauses with weight. Much smoother than a bare period.
5. **ALL CAPS reserved for one keyword per message, max.** CAPS = shouted emphasis in v3. Use it deliberately, never for headings or categories.

### Concrete before/after

```
❌ "Hola. Soy Ana de Acme. Tengo un par de preguntas para ti."
✅ "hola, soy ana de acme, tengo un par de preguntas para ti"

❌ "Te agendamos el martes. ¿Te sirve?"
✅ "te agendamos el martes, te sirve?"

❌ "No puedo hacer eso. Necesito más información."
✅ "no puedo hacer eso, necesito más información"

❌ "INCREÍBLE, tengo GRANDES noticias para ti"  (3 caps emphases = screamy)
✅ "oye, tengo BUENAS noticias para ti"          (one keyword emphasized)
```

## Audio tags

v3 supports inline audio tags inside square brackets — `[friendly]`, `[curious]`, `[warmly]`, `[excited]`, `[reassuring]`, `[thoughtful]`, `[professional]`. They function as "stage directions for your AI voice actor."

### Rules for audio tags

1. **Always embed inside a phrase of ≥2 words.** Never standalone. `[excited]` on its own line = TTS reads "corchete excited corchete" literally.
2. **Lowercase inside the brackets.** v3 convention. `[FRIENDLY]` is not the same tag and may not trigger.
3. **One tag per phrase max.** `[excited] [curious] hola` confuses the model.
4. **Avoid experimental tags** — `[exhales]`, `[sighs]`, `[laughs]`, `[gulps]`, `[happy gasp]` sound passive-aggressive or inconsistent across voices. Stick to tone tags.
5. **Never use pause tags** — `[short pause]`, `[long pause]` read literally. Use `...` instead.

### Tags that work reliably

| Tag | Use for |
|---|---|
| `[warmly]` | greetings, goodbyes |
| `[friendly]` | default opener |
| `[excited]` | celebrating a win, confirming a booking |
| `[curious]` | important questions |
| `[reassuring]` | objections, doubts |
| `[thoughtful]` | processing complex info, "dame un segundo" |
| `[professional]` | pre-tool transitions |

### Examples

```
✅ "[friendly] hola {{lead_first_name}}, soy ana de acme, tengo un producto que te puede interesar, tienes un minuto?"

✅ "[excited] oye pero con cincuenta mil hay harto que hacer, te puedo mostrar 3 opciones"

✅ "[reassuring] entiendo la duda, mira, te explico en una frase"

❌ "[excited]"                              (standalone, read literally)
❌ "[EXCITED] vamos!"                       (caps breaks the tag)
❌ "[short pause] dime más"                 (read literally, use `...` instead)
```

## Variable preservation

Placeholders like `{{lead_first_name}}`, `{{agent_name}}`, `{{company_name}}` are filled by the runtime engine AFTER the LLM speaks. Treat them as opaque sentinels:

- **Never interpolate a literal value.** Writing `"hola Ana"` when the template should say `"hola {{lead_first_name}}"` ships a broken per-lead experience.
- **Keep the double braces literal** in anything you emit — they must survive your rewrite intact.
- **Don't punctuate the placeholder**. `{{lead_first_name}},` is correct (comma outside braces). `{{lead_first_name,}}` breaks the interpolation.

## Begin message (first thing the bot says)

This is what plays the instant the lead picks up. Constraints:

- **Starts with an audio tag** like `[friendly]` — tone cue for the first phrase.
- **Always includes `{{lead_first_name}}` literally** — runtime fills the actual name.
- **Under 180 characters total.** Voice latency starts the moment you go past.
- **No periods.** Commas chain, ends in `?` (a question for permission to continue) or bare.
- **No markdown, no emojis.**

### Examples

```
✅ "[friendly] hola {{lead_first_name}}, soy ana de acme, tengo una linea de bebidas sin azúcar que te puede interesar, tienes un minuto?"

✅ "[warmly] hola {{lead_first_name}}, te habla ana de acme, justo revisaba tu cotización, tienes un par de minutos?"

❌ "[friendly] Hola {{lead_first_name}}. Soy Ana de Acme. Tengo algo para ti. ¿Tienes un minuto?"
   (periods break pacing, caps lift tone, "algo para ti" is vague filler)
```

## Anti-patterns the team has hit

From real production:

1. **Sonnet in voice = >2s per turn, timeouts.** Voice pipelines need sub-1s. Pick Haiku 4.5 or GPT-4.1, not Sonnet. Voice model choice > prompt tuning for latency.
2. **GPT-5.1 had silent mid-sentence gaps.** No prompt fix. Model-level issue. Don't burn time retrying the prompt.
3. **Emojis leak into voice.** If the example in your prompt has 😊, the LLM mimics and the TTS reads "cara sonriente" or emits a beep. Strip emojis from voice prompts and examples.
4. **Lead name repetition sounds bot-like.** Opener + 1–2 more times MAX per conversation. Middle turns use `tu` / `te` or implied subject.

## Quick checklist before you ship a voice rewrite

- [ ] Everything in lowercase (except at most ONE keyword in CAPS)
- [ ] No periods except the very last one (or none at all)
- [ ] Commas chaining ideas, `...` for pauses
- [ ] `{{lead_first_name}}` literal, double-braced, never interpolated
- [ ] Audio tags embedded in phrases ≥2 words, lowercase inside brackets
- [ ] Under 180 chars per turn for begin_message, ≤2 sentences per mid-turn
- [ ] Zero emojis
- [ ] Zero markdown (`**`, `##`, bullets)
- [ ] No tool names, no IDs, no internal jargon

## Sources

- ElevenLabs v3 prompting guide: `elevenlabs.io/docs/best-practices/prompting/eleven-v3`
- ElevenLabs audio tags blog: `elevenlabs.io/blog/v3-audiotags`
- Nexor house voice-scripting rules (maintained internally).
