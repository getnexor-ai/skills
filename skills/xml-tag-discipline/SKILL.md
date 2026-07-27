---
name: xml-tag-discipline
description: How to edit Nexor's global_prompt without breaking its XML skeleton. Activate whenever the user asks for ANY change to global_prompt, channel_prompts, or any tagged prompt section. The tags are load-bearing — the runtime agent reads sections by tag name and breaking them silently breaks production behavior.
version: 1.0.0
tags:
  - xml
  - global-prompt
  - discipline
  - surgical-edit
---

# XML tag discipline — editing without breaking the skeleton

This is the most load-bearing rule in the edit agent's playbook. Nexor's `global_prompt` is a flat XML-tagged document, and the runtime agent reads sections **by tag name**. Rename a tag and you silently disconnect production behavior. Drop a tag and a downstream reader crashes or falls back to default. Invent a new tag and the runtime doesn't see it.

## The 6 commandments

1. **READ the current body first.** The context system message shows you the full `global_prompt` and lists every tag present. Read it before touching anything.
2. **Rewrite CONTENTS only.** Change the text INSIDE a `<tag>`. Leave the opening tag and closing tag literally untouched.
3. **Never invent new tag names.** If the user asks for something that doesn't fit any existing tag, put it in the closest match (usually `<agent_limits>` for rules or `<business_context>` for facts).
4. **Never drop an existing tag.** Even if the content becomes empty, leave the tag with a short placeholder. Downstream code checks for presence, not just content.
5. **Never rename a tag.** Even if the new name would be clearer. The runtime agent, the channel builders, and the prompt cache all key on the exact tag name.
6. **Paste back the ENTIRE global_prompt body** in your patch, with the one section modified. Never output a half-document.

## The canonical Nexor tag skeleton

These are the tags the runtime knows about. Activate `nexor-prompt-style` for the full purpose and word budgets of each:

```
<business_context>     — who the company is, what they sell, ICP
<agent_limits>         — hard NEVER rules (NUNCA prometas X)
<objection_handling>   — scripted responses to pushback
<escalation>           — when and how to hand off to a human
<conversation_examples>— 2-3 sample dialogs
<goal_push>            — final push toward the goal
<field_conversion>     — WhatsApp/Email field name mapping
```

These are system-level blocks added by channel builders at runtime — NOT part of the editable `global_prompt`:

```
<tool_usage> <voice_conversation> <voice_scripting> <security>
<lead> <client_persona>
```

If the user asks to change anything in the system-level blocks (e.g. "change the tool usage rules"), refuse — those live in application code, not in the workflow draft.

## The rewrite workflow

When the user asks for a prompt change:

1. **Identify the target tag.** Map the user's intent to one of the canonical tags above. If it doesn't fit any, ask one clarifying question.
2. **Read that tag's current content** from the context message. Quote it back mentally (or briefly to the user if helpful).
3. **Compute the surgical change.** Isolate the minimal edit that satisfies the request. Don't rewrite the whole tag if one line is enough.
4. **Rebuild the full `global_prompt` string** with every existing tag present and the target tag's contents replaced.
5. **Sanity-check the tag inventory.** Count opening and closing tags before emitting. Every `<x>` has a matching `</x>`. Same tag names as before. No new ones.
6. **Patch via `updateWorkflow`** with the `{ global_prompt: "<...>...</...>" }` field. One tool call. Done.

## What breaks when you mess up

Concrete production failures from getting this wrong:

- **Renamed `<objection_handling>` to `<objections>`** → the runtime agent no longer finds objection rules, starts making up responses on the fly → inconsistent behavior, brand voice drift.
- **Dropped `<escalation>`** → the handoff-to-human routing layer has nothing to check → leads stay in the bot forever, even for legal threats.
- **Added `<tone_rules>` as a new tag** → runtime doesn't know about it → content is silently ignored → user thinks the prompt was updated but nothing changed in production.
- **Wrote content outside any tag** → the pre-processor strips it or it goes into the default section the runtime falls back to → unpredictable.
- **Unbalanced tags** (`<business_context>...` with no `</business_context>`) → the rest of the prompt gets absorbed into `<business_context>` → everything downstream is broken.

## Common surgical edits

### "Softer tone in the opening"
Target: `<business_context>` opening sentence OR `<conversation_examples>` first example's agent line. Rewrite those only. Leave everything else identical.

### "Be firmer on pricing objections"
Target: `<objection_handling>`. Find the objection line that matches pricing ("si dice 'muy caro'", "si dice 'no tengo presupuesto'") and rewrite only that response. If no matching objection line exists, add a new entry at the end of the `<objection_handling>` block — still inside the same tag, never in a new tag.

### "Escalate if the lead mentions lawsuits"
Target: `<escalation>`. Add a new trigger condition. Don't rewrite existing triggers.

### "Never promise return on investment"
Target: `<agent_limits>`. Append one line: `NUNCA prometas rentabilidad garantizada.` Don't rewrite existing limits.

### "Change the conversation examples to sound more Chilean"
Target: `<conversation_examples>`. Rewrite the dialog lines. Keep the structure (2–3 exchanges, same tag, same `{{lead_first_name}}` placeholder).

## The one exception: multi-tag changes

If the user genuinely needs a change that touches multiple tagged sections (e.g. "rebrand the whole agent from Ana to Lucia"), make all the edits in ONE patch — but still:

- All tags that existed before still exist after.
- No new tags.
- No rename.
- Paste back the full body.

## Recovery pattern — if a prompt is already broken

Sometimes you'll encounter a workflow whose `global_prompt` has been manually edited to a broken state (missing tag, unbalanced, stray content). Recovery:

1. List every tag the runtime expects (the canonical skeleton above).
2. Check which are present and which are missing in the current body.
3. Rebuild the skeleton: for each missing tag, add an empty one with a placeholder like `<objection_handling>(to be filled)</objection_handling>`.
4. Walk the user through refilling the missing sections, one at a time, via the normal rewrite workflow.

Don't try to guess the missing content. Ask.

## The test before you emit

Before calling `updateWorkflow` with a new `global_prompt`, mentally check:

- [ ] Every tag that was there is still there.
- [ ] No new tags.
- [ ] No renamed tags.
- [ ] Every opening tag has a matching closing tag.
- [ ] The only change is inside the target tag(s).
- [ ] No content outside any tag.
- [ ] `{{lead_first_name}}` and other `{{variables}}` are still literal.

If any check fails, don't ship the patch. Rewrite.
