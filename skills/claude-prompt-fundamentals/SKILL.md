---
name: claude-prompt-fundamentals
description: Anthropic's official prompt engineering doctrine for Claude 4.6. Activate when rewriting ANY prompt section — gives the current canonical rules on role framing, structure, anti-redundancy, and what changed in 4.6 so you don't regress to pre-4.0 patterns.
version: 1.0.0
tags:
  - prompt-engineering
  - claude
  - anthropic
  - fundamentals
---

# Claude prompt fundamentals (Anthropic 4.6 doctrine)

Use this when you're about to write or rewrite ANY section of a prompt. The rules here come directly from Anthropic's canonical best-practices page and have been updated for Claude 4.6 / Sonnet 4.6 / Haiku 4.5. Older patterns (pre-4.0) are now actively counter-productive.

## The mental model

> "Think of Claude as a brilliant but new employee who lacks context on your norms and workflows."

Golden-rule test: show your prompt to a colleague with no prior context. If they'd be confused, Claude will be too.

## Canonical structure

Order for a system prompt, top to bottom:

1. **Role / persona** — one declarative sentence. "You are X. Your job is Y."
2. **Context and motivation** — explain the WHY. Instead of "NEVER use ellipses", write "Your response will be read aloud by a TTS engine, so never use ellipses." Anthropic: *"Claude is smart enough to generalize from the explanation."*
3. **Task + constraints, stated positively** — tell the model what to DO, not what not to do. Positive framing is the #1 output-control technique in Anthropic's guide.
4. **Examples (3–5 is the sweet spot)** — wrap each example in `<example>` or `<examples>` tags. Relevant, diverse, cover edge cases.
5. **Output format** — specify explicitly. Match the prompt's formatting to the style you want out (markdown in → markdown out).

## When to use what

| Need | Use |
|---|---|
| Mixing instructions + context + variables + examples | XML tags (`<instructions>`, `<context>`, `<input>`, `<example>`) |
| Single cohesive directive | Prose |
| Tone, structure, or edge-case handling matters | Examples — always |
| Runtime-filled values | `{{VARIABLE_NAME}}` — double braces, never resolved at prompt-authoring time |
| Reasoning help | For Claude 4.6 use adaptive thinking with `effort`. For few-shots, show `<thinking>` / `<answer>` pairs. |

**Claude 4.5/4.6 note**: The word *"think"* triggers reasoning bias in Opus 4.5. Prefer "consider", "evaluate", "reason through" when you want reasoning without invoking the thinking state.

## What changed in 4.6 — stop doing these

Anthropic's explicit 4.6 migration notes:

1. **Dial back aggressive language.** "CRITICAL: You MUST use this tool when..." now causes **overtriggering**. Write "Use this tool when..." instead.
2. **Don't over-prompt thoroughness.** "If in doubt, use [tool]" makes 4.6 over-call. Scope tool use with targeted conditions.
3. **Prefill-based refusal is deprecated.** 4.6 refuses appropriately without prefill. Delete any `<assistant>...` steering you inherited from 4.0.
4. **Trust the model's defaults** — 4.6 already uses tools precisely, keeps context, refuses inappropriate asks. Belt-and-suspenders instructions now dilute the real rules.

## Less is more — anti-redundancy

Anthropic's single highest-leverage editing move:

> "Claude is smart enough to generalize from the explanation."

**How to spot redundancy**:

- **Same rule in two sections** (role + rules + examples). Keep one, delete the others.
- **Negative lists that grow** — banned-word lists are a smell. The underlying principle ("sound human, not corporate") covers infinite variants with zero tokens.
- **Restating model defaults** — 4.6 doesn't need "always respond politely." Delete.
- **Contradictions** — "be concise" + "explain thoroughly" somewhere else. Pick one, or scope each to a condition.

**How to collapse 5 rules into 1 principle**:

1. Read the 5 rules.
2. Ask "what's the underlying constraint?" (e.g. *all 5 are about not leaking tool names → principle is "tools are invisible infrastructure"*).
3. State the principle once + 1 concrete example.
4. Delete the 5 rules.

**When to move enforcement out of the prompt entirely**: if the rule is mechanical (regex-strippable, structurally validatable), move it to a post-processor or structured output schema. Leaving it in the prompt burns tokens every turn and still leaks. Anthropic: *"If the occasional preamble slips through, strip it in post-processing."*

## Role framing that holds

- Put the role in the **system** prompt, not the user turn.
- Keep it **declarative** ("You are X, your job is Y"), not **defensive** ("do not ever break character"). Declarative wins against adversarial input because it's the model's identity, not a rule to defy.
- State capabilities positively ("you can book meetings, check availability") and scope negatively only at hard edges ("never confirm bookings you haven't executed via a tool").

## Tool use framing

Anthropic's `<default_to_action>` pattern: *"By default, implement changes rather than only suggesting them. If the user's intent is unclear, infer the most useful likely action and proceed, using tools to discover missing details instead of guessing."*

For agent-facing prompts the mirror is **tools are background infrastructure**. The user sees the result, not the mechanism. Follow Anthropic's positive-framing rule: write *"speak as if you have direct knowledge of availability"* instead of *"don't mention the get_available_slots tool."*

## Citations

- Anthropic consolidated prompt best practices: `platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices`
- All previously separate Anthropic sub-pages (use-xml-tags, system-prompts, chain-of-thought, be-clear-and-direct, multishot-prompting) redirect here as of April 2026.

**Things Anthropic does NOT declare on** (do not cite them for):
- Exact variable placeholder syntax (`{{var}}` vs `{var}`) — they use `{{VAR}}` in examples but don't declare a standard.
- "Never narrate tool names to the user" — industry best practice, not an Anthropic doctrine. Follows from positive framing.
- Lowercase voice scripting — that's ElevenLabs v3 + Nexor house style, not Anthropic. See `voice-scripting-v3` skill.
- Tag "load-bearing" architecture — Anthropic recommends consistent tags; Nexor's runtime-reads-by-tag pattern is project-specific. See `xml-tag-discipline` skill.
