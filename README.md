<p align="center">
  <a href="#english">English</a> · <a href="#espanol">Español</a>
</p>

<a id="english"></a>

# Nexor Skills

This repository is the public distribution point for Nexor's user-facing Agent Skills. Every skill follows the publishing, safety, and quality standard documented below.

## Installation

Browse and install the available skills interactively:

```bash
npx skills add getnexor-ai/skills
```

Install a specific skill:

```bash
npx skills add getnexor-ai/skills@automation-architecture
```

Install every skill in the repository:

```bash
npx skills add getnexor-ai/skills --all
```

## Available skills

- **automation-architecture** — Map a plain-language Nexor requirement to an exact configuration (agents, statuses, fields/metadata, webhooks, functions, jobs, cadence, transfers) and build it through Nexor MCP tools.
- **whatsapp-management** — Manage a customer's WhatsApp end to end through Nexor: connect a number, check account health/risk, create/review/organize templates, run cadence pools, set the business profile, tune response timing, assign to an agent, and send messages.

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

---

<a id="espanol"></a>

# Skills de Nexor

Este repositorio es el punto de distribución público de las Agent Skills de Nexor orientadas a usuarios. Cada skill cumple con el estándar de publicación, seguridad y calidad documentado a continuación.

## Instalación

Explora e instala las skills disponibles de forma interactiva:

```bash
npx skills add getnexor-ai/skills
```

Instala una skill específica:

```bash
npx skills add getnexor-ai/skills@automation-architecture
```

Instala todas las skills del repositorio:

```bash
npx skills add getnexor-ai/skills --all
```

## Estándar

Cada skill orientada a usuarios debe ser segura para su publicación, fácil de activar por un agente y útil fuera del entorno interno de Nexor.

### Estructura de directorios

```text
skills/<nombre-de-la-skill>/
├── SKILL.md                 # Obligatorio: metadatos de activación y flujo principal
├── agents/
│   └── openai.yaml          # Recomendado: metadatos de interfaz para usuarios
├── scripts/                 # Opcional: automatización determinista o repetible
├── references/              # Opcional: información detallada cargada solo cuando se necesita
└── assets/                  # Opcional: plantillas y archivos utilizados en los resultados
```

Utiliza únicamente los directorios que la skill necesite. No añadas un README, registro de cambios, guía de instalación ni otra documentación de proceso dentro de una skill individual.

### Nombres

- Usa únicamente letras minúsculas, números y guiones en el nombre de la carpeta.
- Usa el mismo valor para el nombre de la carpeta y el campo `name` del frontmatter.
- Prefiere un nombre corto, orientado a la acción y de menos de 64 caracteres.

### Formato obligatorio de `SKILL.md`

```markdown
---
name: <nombre-de-la-skill>
description: <Qué hace la skill>. Usar cuando <solicitudes, artefactos o situaciones específicas que deben activarla>.
---

# <Título legible de la skill>

## Objetivo

<Describe el resultado en una o dos frases.>

## Flujo de trabajo

1. <Comienza con la primera acción concreta.>
2. <Describe las decisiones, verificaciones y el uso de herramientas en orden de ejecución.>
3. <Verifica el resultado antes de entregarlo.>

## Medidas de seguridad

- <Define los límites de seguridad, privacidad, aprobación o alcance.>
- <Indica cuándo el agente debe detenerse y consultar al usuario.>

## Resultado

- <Define el artefacto o la respuesta que el agente debe producir.>
- <Define la evidencia o validación que debe incluir.>

## Recursos

- Lee [references/<archivo>.md](references/<archivo>.md) cuando <condición>.
- Ejecuta `scripts/<script>` cuando <condición>.
- Reutiliza `assets/<recurso>` cuando <condición>.
```

Elimina cualquier sección que no aporte valor. Añade secciones específicas del dominio únicamente cuando hagan que el flujo de trabajo sea más claro.

### Reglas de redacción

- Incluye toda la información de activación en el campo `description` del frontmatter; el cuerpo solo se carga después de que se activa la skill.
- Usa únicamente `name` y `description` en el frontmatter de `SKILL.md`.
- Escribe las instrucciones en imperativo y en orden de ejecución.
- Asume que el agente es competente. Incluye únicamente conocimiento del dominio, restricciones y procedimientos reutilizables que no sean evidentes.
- Mantén `SKILL.md` conciso y por debajo de 500 líneas. Mueve esquemas, políticas y ejemplos detallados a `references/`.
- Enlaza cada recurso opcional directamente desde `SKILL.md` e indica exactamente cuándo debe utilizarse.
- Mantén las referencias a un solo nivel de profundidad. Añade una tabla de contenido a los archivos de referencia de más de 100 líneas.
- Coloca las operaciones deterministas, repetidas o propensas a errores en scripts y prueba esos scripts.
- Define criterios de finalización observables. No termines con instrucciones ambiguas como «asegúrate de que funcione».

### Reglas de seguridad para contenido público

Una skill orientada a usuarios no debe contener:

- Nombres de clientes o empresas privadas
- Datos personales
- Credenciales, secretos, tokens, URL privadas o valores de entorno
- Estadísticas de producción o registros copiados de producción
- Rutas de repositorios internos, identificadores propietarios o nombres de herramientas internas no documentadas
- Instrucciones que modifiquen sistemas de producción sin un paso explícito de confirmación por parte del usuario
- Material de terceros que Nexor no tenga permiso para redistribuir

Sustituye los detalles internos por marcadores genéricos y explica el patrón transferible. Si eliminar o anonimizar un detalle hace que el flujo de trabajo sea inseguro o engañoso, no publiques la skill.

### Lista de verificación para revisiones

Antes de añadir una skill al catálogo:

- [ ] El nombre de la carpeta coincide con el nombre del frontmatter.
- [ ] La descripción indica tanto la capacidad como las condiciones concretas de activación.
- [ ] El flujo de trabajo produce un resultado claro y visible para el usuario.
- [ ] Las medidas de seguridad cubren acciones destructivas, efectos externos, privacidad y aprobaciones.
- [ ] Se ha eliminado la información interna y sensible.
- [ ] Los recursos opcionales son necesarios, están enlazados y se utilizan de forma condicional.
- [ ] Cada script incluido se ha ejecutado correctamente en un caso representativo.
- [ ] La skill se ha probado con al menos una solicitud realista de un usuario.
- [ ] El resultado se entiende sin acceso a los sistemas privados de Nexor.
- [ ] La validación del repositorio y la simulación de creación del paquete finalizan correctamente.

## Añadir una skill

1. Crea `skills/<nombre-de-la-skill>/SKILL.md` con el formato anterior.
2. Añade únicamente los scripts, referencias, recursos y metadatos de interfaz que la skill necesite.
3. Añade la skill al plugin correspondiente en [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).
4. Ejecuta `npm run check`.

## Licencia

[MIT](./LICENSE) © Nexor
