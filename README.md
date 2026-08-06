# Nexor Public Skills

**Agent Skills from the [Nexor](https://getnexor.ai) team — shared, sanitized, and free to use.**

[Agent Skills](https://agentskills.io) are folders of instructions an AI agent loads on demand to do a specialized task well and repeatably. This repo collects the prompt‑engineering craft and agent‑building playbooks behind Nexor's conversational‑agent platform, with all customer data, personal data, and credentials removed.

Each skill is a self‑contained folder with a `SKILL.md`. Nothing to build, no dependencies — read one, copy one, or install the whole set.

---

## Install

### Option 1 — npm (recommended)

Install every skill into your skills directory with one command — no clone, no build:

```bash
# into ~/.claude/skills (available in every project)
npx @nexor/skills

# into ./.claude/skills (this project only)
npx @nexor/skills --project

# a single skill, or a custom location
npx @nexor/skills voice-scripting-v3
npx @nexor/skills --dir ./my-agent/skills
npx @nexor/skills --list
```

Or pin it as a dependency so installs are versioned and reproducible in CI:

```bash
npm install @nexor/skills
npx nexor-skills --project
```

**Use it programmatically** — the package is importable, so you can point your own
agent at the bundled skills or build a picker:

```js
import { skillsDir, list, read, describe } from "@nexor/skills";

list();                      // ["add-booking-provider", "voice-scripting-v3", ...]
read("voice-scripting-v3");  // the SKILL.md contents
describe();                  // [{ name, description }, ...]
skillsDir;                   // absolute path — point a Workspace/loader here
```

### Option 2 — Claude Code plugin marketplace

Prefer not to touch npm? Point Claude Code straight at this repo:

```
/plugin marketplace add DropoutCapital/nexor-public-skills
/plugin install prompt-engineering@nexor-public-skills
/plugin install agent-playbooks@nexor-public-skills
/plugin install industry-onboarding@nexor-public-skills
```

Then just mention a skill in a prompt — *"use the prompt-rewrite-checklist before we ship this."*

### Option 3 — manual

Every skill is just a folder. Copy the ones you want into your agent's skills directory:

```bash
git clone https://github.com/DropoutCapital/nexor-public-skills.git
cp -R nexor-public-skills/skills/voice-scripting-v3 ~/.claude/skills/
```

---

## The skills

### 🧠 Prompt engineering — how we write agent prompts
| Skill | What it teaches |
|---|---|
| [`claude-prompt-fundamentals`](./skills/claude-prompt-fundamentals) | Canonical prompt structure — role framing, context/motivation, positive framing, examples, output format, anti‑redundancy. |
| [`prompt-rewrite-checklist`](./skills/prompt-rewrite-checklist) | A pre‑ship checklist to run before shipping any prompt rewrite to production. |
| [`xml-tag-discipline`](./skills/xml-tag-discipline) | Editing an XML‑tagged system prompt without breaking the tags a runtime reads by name. |
| [`voice-scripting-v3`](./skills/voice-scripting-v3) | TTS / ElevenLabs‑v3 scripting rules for what a voice agent actually speaks. |
| [`nexor-prompt-style`](./skills/nexor-prompt-style) | A "rules‑light, processor‑heavy" prompt philosophy and per‑channel conventions. |

### 🛠️ Agent playbooks — building capabilities
| Skill | What it teaches |
|---|---|
| [`add-booking-provider`](./skills/add-booking-provider) | A complete contract for connecting a booking/calendar provider to an AI‑agent + MCP platform. |
| [`appointment-reminders-playbook`](./skills/appointment-reminders-playbook) | An autonomous, single‑approval flow for configuring appointment reminders. |
| [`whatsapp-template-marketer`](./skills/whatsapp-template-marketer) | Drafting WhatsApp templates by inferring everything from existing context instead of interrogating the user. |
| [`meta-whatsapp-templates-spec`](./skills/meta-whatsapp-templates-spec) | The Meta WhatsApp Business template spec, encoded so generated templates get approved. |
| [`how-to-update-all-workflow`](./skills/how-to-update-all-workflow) | Making a domain‑wide config change in lockstep across every text‑bearing surface. |
| [`how-to-manage-executives`](./skills/how-to-manage-executives) | Assigning human reps to a workflow and defining a natural‑language routing rule. |
| [`data-analysis-playbook`](./skills/data-analysis-playbook) | Querying an unfamiliar multi‑tenant database correctly the first time (text‑to‑SQL hygiene). |
| [`query-catalog`](./skills/query-catalog) | A canonical‑query catalog so an analytics agent runs one deterministic query per metric. |
| [`ideal-lead-profile`](./skills/ideal-lead-profile) | Scoring the "ideal lead" by depth of two‑way engagement rather than budget or outbound volume. |

### 📄 Sales collateral — customer-facing documents
| Skill | What it teaches |
|---|---|
| [`proposal-builder`](./skills/proposal-builder) | Generating branded, print‑ready Nexor proposal one‑pagers (HTML + PDF) personalized per prospect: master template, copy playbook, and render pipeline. |

### 🏭 Industry onboarding — vertical qualification playbooks
| Skill | What it teaches |
|---|---|
| [`real-estate`](./skills/real-estate) · [`healthcare`](./skills/healthcare) · [`saas-b2b`](./skills/saas-b2b) · [`ecommerce`](./skills/ecommerce) · [`education`](./skills/education) · [`fitness`](./skills/fitness) · [`hospitality`](./skills/hospitality) · [`generic`](./skills/generic) | Per‑vertical onboarding playbooks: what a good business answer covers, deal‑breakers, vocabulary to mirror, and objection handling. Several are written for the Chile/LATAM market (Spanish). |

---

## What's in a skill

```
skills/<name>/
└── SKILL.md   ← YAML frontmatter (name, description, when-to-use) + the instructions
```

The `description` in the frontmatter is what an agent uses to decide *when* to load the skill, so it's written as a trigger. The body is the actual know‑how.

## Scope & disclaimer

These skills describe **patterns and lessons**, not a runnable copy of Nexor's internal systems. Customer/company names, personal data, and credentials have been removed. Some skills still reference the platform's own tool and configuration vocabulary — the "how the agent is wired" content — which you should map onto your own architecture. Provided for educational purposes; test thoroughly in your own environment before relying on them for anything critical.

## Contributing

Skills here must contain **no customer names, no personal data, no production statistics, no credentials, and no internal file paths**. Keep them generic and transferable. To add one, create `skills/<name>/SKILL.md` and list it under a plugin in [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).

## License

[MIT](./LICENSE) © Nexor
