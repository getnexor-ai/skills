---
name: how-to-update-all-workflow
description: Playbook for full domain/business changes — pipeline-impact pre-check + 8 text-bearing surfaces to rewrite in lockstep so the workflow stays consistent.
version: 1.0.0
tags:
  - master-editor
  - domain-change
  - rewrite
  - pipeline-impact
---

# How to update an entire workflow (domain change)

Activate this skill when the operator asks for a domain / business / vertical change — they want the agent to start representing a different business or product than today. Triggers:

- "el negocio cambió", "ahora vendemos X en vez de Y"
- "cambia todo a [nuevo rubro]", "ajusta todo el workflow para [otro vertical]"
- After confirming the rubro is wrong (e.g. "el agente piensa que vendemos camiones pero vendemos autos")

NOT a domain change (do NOT activate for these — they are single-section rewrites):
- "Mejora el manejo de objeciones" → global_prompt only
- "Cambia el tono del whatsapp" → channel_prompts only
- "Agrega el campo edad" → fields only
- "El nombre del agente es Valentina" → identity only

## Step 1 — pipeline-impact pre-check (MANDATORY)

Before any rewrite, call `pipeline-impact`. Domain change is destructive in spirit — leads that entered the workflow expecting one thing ("cotización de camión") will start reading the other ("auto") in mid-conversation. The agent's references shift, templates already sent are now incoherent, captured field values labeled "tipo de camión" map awkwardly to the new domain.

If `active > 0`, you MUST surface the numbers BEFORE proceeding and ask the operator to choose between three paths:

1. "Aplico el cambio igual" — rewrite proceeds, in-flight leads see the new copy on their next message. Acceptable when the change is cosmetic or the leads are early-stage (just contacted, no qualification yet).
2. "Espero a que estos N leads cierren o se enfríen, y después aplico" — operator delays the rewrite. Lower risk but slower.
3. "Mejor un workflow nuevo y migro leads cuando estén listos" — clone the current workflow, apply the domain change to the clone, leave the old one running until the in-flight leads conclude. Cleanest for high-value changes.

Reply template (with real numbers from pipeline-impact):

> Antes de hacer el cambio: tienes N leads activos en este workflow (X en Engaged, Y en Meeting Scheduled, Z en Qualified). Si reescribo todo a [nuevo rubro] ahora, esos leads van a empezar a leer mensajes del nuevo rubro en su próxima respuesta. Tres opciones:
>
> • aplicar igual (recomendado solo si los leads están early-stage)
> • esperar a que cierren los activos y aplicar después
> • armar un workflow nuevo para [nuevo rubro] y dejar este corriendo hasta que los leads existentes terminen
>
> ¿Cuál prefieres?

If `active === 0` — only early-stage or settled leads exist. The change is low-risk. Still confirm once: "Voy a reescribir todo el workflow a [nuevo rubro]. ¿Confirmas?". Wait for yes.

## Step 2 — 8 surfaces the prompt engineer MUST cover

Once confirmed, delegate to `agent-workflowPromptEngineer` with the explicit list of surfaces below. Pass the list verbatim so the sub-agent does not stop after `global_prompt` — that is the most common failure mode.

1. **identity** → `agent_name`, `agent_role`, `company_name`
2. **ai_config.begin_message** → the opening line on calls
3. **channel_prompts** → whatsapp / retell / email / sms overlays
4. **global_prompt** → the XML body (`business_context`, `objection_handling`, `conversation_examples`, `closing`, etc.)
5. **statuses[].entry_hint** → many entry hints reference the domain ("entra cuando el lead pidió cotización de camión")
6. **fields[].description** → operator-facing labels ("Tipo de camión buscado")
7. **fields[].extraction_hints** → guidance to the runtime AI ("detectá si menciona modelo de camión, año, capacidad")
8. **meeting_types[].description**, `.event_title_template`, `.event_description_template` → calendar copy

## Step 3 — Delegate input phrasing

Use this exact phrasing in your delegate input so the sub-agent inherits the multi-surface scope:

> Cambio de dominio: de [vieja] a [nueva]. Reescribir TODAS las text-bearing surfaces que mencionen la vieja: identity (name/role/company), begin_message, channel_prompts, global_prompt, statuses.entry_hint, fields.description, fields.extraction_hints, meeting_types.description y templates. No omitir ninguna. Hacer un read-workflow section='all' primero para ver qué menciona la vieja, y reescribir surface por surface.

## Step 4 — Recovery if surfaces missed

If the operator says "te faltó X" (e.g. "te faltaron las variables") after the rewrite, it means the multi-surface delegation was incomplete. Re-delegate with the missed surface listed explicitly. Mea culpa silently in your prose ("Listo, ajusté las variables también") — never blame the sub-agent.
