# Nexor Public Skills

This repository is the public distribution point for Nexor's user-facing Agent Skills. The catalog is intentionally empty while the skills are rebuilt against the standard below.

## Standard

Every user-facing skill must be safe to publish, easy for an agent to trigger, and useful outside Nexor's internal environment.

### Directory layout

```text
skills/<skill-name>/
├── SKILL.md                 # Required: trigger metadata and core workflow
├── agents/
│   └── openai.yaml          # Recommended: user-facing UI metadata
├── scripts/                 # Optional: deterministic or repeatable automation
├── references/              # Optional: detailed material loaded only when needed
└── assets/                  # Optional: templates and files used in outputs
```

Use only the directories the skill needs. Do not add a README, changelog, installation guide, or other process documentation inside an individual skill.

### Naming

- Name the folder with lowercase letters, digits, and hyphens only.
- Use the same value for the folder name and frontmatter `name`.
- Prefer a short, action-oriented name under 64 characters.

### Required `SKILL.md` format

```markdown
---
name: <skill-name>
description: <What the skill does>. Use when <specific user requests, artifacts, or situations that should trigger it>.
---

# <Human-readable skill title>

## Goal

<State the outcome in one or two sentences.>

## Workflow

1. <Start with the first concrete action.>
2. <Describe decisions, checks, and tool usage in execution order.>
3. <Verify the result before handing it off.>

## Guardrails

- <State safety, privacy, approval, or scope boundaries.>
- <Say when the agent must stop and ask the user.>

## Output

- <Define the artifact or response the agent must produce.>
- <Define the evidence or validation to include.>

## Resources

- Read [references/<file>.md](references/<file>.md) when <condition>.
- Run `scripts/<script>` when <condition>.
- Reuse `assets/<asset>` when <condition>.
```

Remove any section that adds no value. Add domain-specific sections only when they make the workflow clearer.

### Writing rules

- Put all triggering information in the frontmatter `description`; the body loads only after the skill triggers.
- Use only `name` and `description` in `SKILL.md` frontmatter.
- Write instructions in imperative form and execution order.
- Assume the agent is capable. Include only non-obvious domain knowledge, constraints, and reusable procedures.
- Keep `SKILL.md` concise and under 500 lines. Move detailed schemas, policies, and examples to `references/`.
- Link every optional resource directly from `SKILL.md` and state exactly when to use it.
- Keep references one level deep. Add a table of contents to reference files longer than 100 lines.
- Put deterministic, repeated, or failure-prone operations in scripts and test those scripts.
- Define observable completion criteria. Do not end with vague instructions such as "make sure it works."

### Public-safety rules

A user-facing skill must not contain:

- Customer or private company names
- Personal data
- Credentials, secrets, tokens, private URLs, or environment values
- Production statistics or copied production records
- Internal repository paths, proprietary identifiers, or undocumented internal tool names
- Instructions that mutate production systems without an explicit user confirmation step
- Third-party material that Nexor does not have permission to redistribute

Replace internal details with generic placeholders and explain the transferable pattern. If sanitizing a detail would make the workflow unsafe or misleading, do not publish the skill.

### Review checklist

Before adding a skill to the catalog:

- [ ] The folder and frontmatter names match.
- [ ] The description states both capability and concrete trigger conditions.
- [ ] The workflow produces a clear user-visible outcome.
- [ ] Guardrails cover destructive actions, external side effects, privacy, and approvals.
- [ ] Internal and sensitive information has been removed.
- [ ] Optional resources are necessary, linked, and used conditionally.
- [ ] Every included script has been executed successfully on a representative case.
- [ ] The skill has been tested on at least one realistic user request.
- [ ] The result is understandable without access to Nexor's private systems.
- [ ] The repository validation and package dry run pass.

## Adding a skill

1. Create `skills/<skill-name>/SKILL.md` using the format above.
2. Add only the scripts, references, assets, and UI metadata the skill requires.
3. Add the skill to the appropriate plugin in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).
4. Run `npm run check`.

## License

[MIT](./LICENSE) © Nexor
