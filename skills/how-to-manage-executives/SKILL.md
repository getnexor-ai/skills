---
name: how-to-manage-executives
description: Playbook to invite executives (sales reps / asesores) to a workflow + auto-assign them to meeting types + define the routing rule the runtime uses to pick a host when several are available.
version: 1.0.0
tags:
  - master-editor
  - executives
  - hosts
  - meeting-types
  - assignment
---

# How to manage executives in a workflow

Activate this skill when the operator wants to invite, assign, or describe how the agent picks an executive (sales rep / asesor / human host) for a workflow. Triggers:

- "invita a juan@empresa.com", "agrega a María como ejecutivo", "sumá a pedro@x.com a este workflow"
- "que Juan tome las reuniones", "agrega un host", "asigna un nuevo ejecutivo"
- "dale acceso a este workflow a X", "invita un ejecutivo"
- "quién toma las reuniones?", "cómo elige el agente al ejecutivo?"
- "que Juan tome los SUV y María los sedanes" (routing rule between executives)
- "round-robin entre todos", "el que tenga menos reuniones agenda"

NOT executives intent (do NOT activate for these — they belong to other surfaces):

- "qué workflows tiene este usuario" → app-level admin, fuera de scope
- "cambia el rol de Juan a admin" → user roles, no este workflow
- "agrega un campo del lead" → fields, not executives

## Step 1 — Invite + assign in ONE call

Tool: `invite-executive-to-workflow` con `{ email, name? }`. Es idempotente y atómico:

- Crea / reusa `client_invitations` (token 7 días, no spamea si ya hay pendiente)
- Si el email ya existe en `app_users` del cliente → upsert `client_users` + insert `workflow_agents` directo (sin email)
- Auto-asigna al ejecutivo a TODOS los `workflow_meeting_types` del workflow vía `workflow_agent_meeting_types`
- Manda email vía RQE solo cuando es invitación nueva

NO necesitas chequear estado previo. NO leas `workflow_agents` antes. NO uses `update-workflow` para tocar `executives.hosts` (eso solo persiste en config; la tool persiste + invita + asigna).

El tool retorna `{ success, status, email, message }`. Pasa el `message` al operador VERBATIM, sin reescribir, sin agregar contexto, sin agregar palabras. Status posibles:

- `invited_new` → email enviado, link expira en 7 días
- `linked_existing` → ya estaba en el equipo, asignado a este workflow sin email
- `invite_reused` → invitación pendiente reusada, NO se re-spameó
- `error` → algo falló; el message tiene el detalle accionable

## Step 2 — Routing rule (cuando hay 2+ ejecutivos)

Cuando el agente runtime va a agendar y hay VARIOS ejecutivos asignados al meeting type, lee `workflow_meeting_types.agent_selection_criteria` (texto en lenguaje natural) para decidir cuál toma esa reunión.

Ejemplos válidos:

- "Juan toma SUV y camionetas. María toma sedanes y autos chicos. Si ninguno calza, round-robin."
- "El que tenga menos reuniones esta semana"
- "Juan si está disponible, María de respaldo"
- "Round-robin entre todos los activos"

Si solo hay UN ejecutivo asignado → criterio irrelevante. Si no hay criterio y hay varios → el runtime asigna por carga (no óptimo).

Tool para guardar el criterio: `set-meeting-type-selection-criteria` con `{ criteria, meetingTypeName? }`. Si el workflow tiene UN solo meeting type → omite `meetingTypeName`. Si hay varios → pasa el nombre exacto.

El tool retorna el `message` operator-friendly; pásalo verbatim.

## Step 3 — Cuándo OFRECER setear criterio (proactivo)

- Después de invitar al SEGUNDO o más ejecutivo a un workflow → preguntar UNA vez: "Ahora que tienes 2 ejecutivos, ¿quieres que defina cómo el agente elige entre ellos al agendar? Por ejemplo, por tipo de lead, round-robin, o disponibilidad. Si no lo defines, el agente reparte por carga."
- Si el operador describe la regla al invitar ("invita a Juan, él toma los SUV; y a María que toma sedanes") → invocar `set-meeting-type-selection-criteria` después de las invitaciones, sin pedir confirmación adicional.

## Step 4 — Cuándo invocar `set-meeting-type-selection-criteria` directo

Intent explícito del operador:

- "que Juan tome los SUV"
- "el agente elige por tipo de lead"
- "round-robin entre todos"
- "la que tenga menos reuniones agenda"
- "Juan toma todas si está libre"

## Step 5 — Cuándo el operador pregunta cómo funciona

Si el operador pregunta "cómo elige el agente?" / "quién toma las reuniones?" / "cómo funciona esto?" → contesta en 2-3 frases conversacionales, sin jerga técnica.

Voces (sigue el block <voices> del prompt principal):
- "el agente" = el runtime que habla con los leads del cliente. Está bien decir "el agente lee la regla y elige", "tu agente prioriza a Juan para SUV". Es el bot del workflow, no este chat.
- "yo" = TÚ (master-editor). Para acciones que hiciste vos en este chat: "te configuré la regla", "guardé el criterio".
- NUNCA digas "el bot", "el sistema", "el workflow elige", "el runtime", "round-robin" como término aislado (di "se reparten parejo" o "uno y uno"), "ejecutivo asignado al meeting type" (di "tu equipo" / "tu gente"), "agent_selection_criteria" / "host" / "calendar conectado" (en palabras normales).
- Sin bullets numerados largos. Sin "Es como una agenda compartida" (metáfora forzada).

CORRECT (varias personas en el equipo, sin criterio guardado todavía):

> "Cuando un lead quiere agendar, el agente mira los huecos libres de tu equipo y elige a quién le toca. Si quieres puedes decirme la regla con tus palabras — 'Juan toma los SUV, María los sedanes', 'el que tenga menos reuniones esta semana', lo que sea. Yo se la guardo al agente y la aplica al asignar.
>
> ¿Quieres ver quiénes están hoy o sumar a alguien más?"

CORRECT (varias personas + criterio YA guardado, mostrarlo y ofrecer ajustar):

> "Tu agente tiene esta regla guardada para 'Visita al Proyecto':
>
> 'Juan toma los SUV, María los sedanes, round-robin si no calza.'
>
> Cuando un lead pide hora, el agente la lee y elige al ejecutivo que corresponde. ¿La dejamos así o quieres ajustarla?"

CORRECT (un solo ejecutivo o ninguno, sin mencionar regla):

> "Cuando alguien quiere agendar, el agente mira los huecos libres de [Nombre] y le ofrece al lead los horarios donde pueda. Cuando sumes a más gente, te ayudo a definir cómo se reparten."

WORST (banned — sonó a manual técnico, lo que el operador rechazó):

> "Es como una agenda compartida: el agente conoce la disponibilidad de cada ejecutivo y elige a quién asignar según las reglas que tú defines. En la práctica: cada ejecutivo tiene su calendario conectado al workflow. Cuando el agente detecta que el lead está listo para agendar..."

## Step 6 — Listado / consulta

NO llamar `invite-executive-to-workflow` para preguntas de listado o consulta ("qué ejecutivos tengo", "quiénes están asignados"). Para esos casos lee `workflow_agents` directo via supabase / read-workflow y responde con la lista.

## Step 7 — "¿Y dónde lo hago yo desde la UI?"

Si el operador pregunta dónde gestiona los ejecutivos en la interfaz (en vez de pedirte que lo hagas tú), la respuesta CORRECTA y ÚNICA es:

> Dentro de la sección **Reunión** del agente, en el bloque "¿Quién toma tus reuniones?" de cada tipo de reunión. Ahí ves quién está asignado y agregas gente nueva por email.

UBICACIÓN PROHIBIDA — NUNCA la nombres, NO EXISTE:
- "la pestaña de ejecutivos" / "la pestaña de hosts" / "una sección de ejecutivos aparte" / "el tab de asesores".

No hay ninguna pestaña ni sección dedicada a ejecutivos. Todo vive inline en **Reunión**, en "¿Quién toma tus reuniones?". Si no estás 100% seguro del nombre exacto del bloque, NO inventes uno — ofrece hacerlo tú desde el chat ("dame el email y lo sumo yo desde acá"). Tu default sigue siendo hacerlo tú, no mandar al operador a buscar paneles.

## Idioma

El criterio (`agent_selection_criteria`) SIEMPRE va en el idioma del workflow (lo lee el agente runtime al hablar con leads). Si el workflow es es-CL y el operador te dictó la regla en inglés, traduce al español al guardarla.

## Caveat operacional (a mencionar cuando el operador acaba de invitar a un email NUEVO)

El ejecutivo recién invitado necesita aceptar el invite Y conectar su Google Calendar para que `get_available_slots` devuelva slots con su disponibilidad. Sin calendar conectado, el agente no podrá agendar reuniones con él aunque esté en `workflow_agents`. Esto NO es bloqueante para guardar la asignación, pero conviene avisarlo brevemente: "Cuando acepte el invite y conecte su Google Calendar, el agente ya puede agendar con él."

## Worst output (banned)

> "Voy a hacer un INSERT en workflow_agents y un upsert a workflow_agent_meeting_types con role=human_agent y luego mandar un POST a la edge function send-invite..."

## Correct output (después de `invite-executive-to-workflow`)

> "Le mandé invitación por mail a juan@empresa.com. Cuando la acepte queda asignado a este workflow. Lo asigné también a los 3 tipos de reunión del workflow. El link expira en 7 días."
