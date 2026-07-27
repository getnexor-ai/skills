---
name: generic
description: Fallback playbook when no specific industry skill matches. Universal B2C/B2B onboarding heuristics.
version: 1.0.0
tags:
  - generic
  - fallback
  - onboarding
  - playbook
---

# Generic Playbook (fallback)

Used when the customer's industry does not match any specialized skill (real-estate, healthcare, saas-b2b, education, fitness, hospitality, ecommerce). Apply universal qualification, business-depth probing, and tone mirroring.

## Region / market context

No region assumptions. Ask explicitly:
- **Moneda** en que trabajan (CLP, USD, MXN, ARS, UF, EUR).
- **Zona geográfica** de operación (país, regiones, ciudad, despacho internacional).
- **Regulación relevante** del rubro (permisos, licencias, protección al consumidor, datos personales).
- **Estacionalidad** del negocio (¿hay peaks por mes, por día, por temporada?).
- **Horarios** reales de atención.

No asumas precio, idioma ni contexto cultural. Una vez el usuario revele país/idioma, mirror su variante (Chile → pesos y UF, México → pesos mexicanos y CFDI, etc).

## What makes a GOOD business answer

Aplicable a cualquier negocio. Una respuesta completa cubre:
1. **Qué venden** en una frase concreta (no "soluciones", no "servicios de alta calidad", no "ayudamos a la gente a X").
2. **A quién** (ICP específico: tamaño, edad, profesión, vertical, geografía).
3. **Precio** o rango de ticket, moneda, y cómo se cobra (único, recurrente, por uso).
4. **Canal** de venta principal (WhatsApp, web, presencial, marketplace, llamada).
5. **Diferenciador** real frente al competidor más obvio.
6. **Quién decide la compra** (el mismo usuario, pareja, padre/madre, RR.HH., jefe, comité).
7. **Tiempo de decisión típico** (minutos, días, semanas, meses).

## Qualification patterns (universales)

Probe estos sin asumir rubro:

- **Necesidad concreta**: ¿qué problema quiere resolver ahora, no "en general"?
- **Presupuesto**: explícito si se puede, implícito si no (rango, moneda, cómo quiere pagar).
- **Timeline**: ¿cuándo necesita tener esto resuelto? ¿Hay un evento o deadline?
- **Decisión**: ¿lo decide solo, con pareja, con un tercero (padre, jefe, RR.HH., comité)?
- **Ubicación / geografía**: ¿dónde está, a dónde quiere recibir/ir/encontrarse?
- **Historial**: ¿ya compró algo parecido antes? ¿Por qué funcionó o no funcionó?
- **Criterios de "no sirve"**: ¿qué lo haría descartar la opción? (precio, tiempo, calidad, marca, ubicación).

## Typical discards / deal-breakers

- **Producto/servicio fuera del portafolio** del negocio.
- **Zona geográfica no cubierta**.
- **Timeline incompatible** (necesita ya, el negocio entrega en 3 semanas).
- **Presupuesto muy por debajo** sin margen.
- **Decisor no presente** y el que contacta no puede comprometer nada → moverlo a warm lead, no forzar cierre.
- **Menor de edad** para productos/servicios que requieren mayoría legal.
- **Requisito legal/regulatorio no cumplido** (licencia, certificado, edad mínima, documentación).
- **Expectativa irreal** (plazo imposible, resultado no lograble, promesa que el negocio no hace).

## Tone mirroring (crítico en fallback)

Al no conocer el rubro, **mirror el tono del usuario**:
- Si escribe formal ("estimados", "quisiera consultar") → responder formal, usted.
- Si escribe casual ("hola qué tal, me interesa") → responder casual, tú.
- Si usa jerga del rubro → aprender esas palabras y reusarlas exactamente.
- Si usa modismos regionales ("onda", "wea", "chido", "chévere", "bacán") → mirror sutil, sin sobreactuar.
- Si escribe en mayúsculas, con emojis, con audio → responder en la misma modalidad cuando sea posible.

Evita vocabulario genérico de ventas ("experiencia única", "soluciones integrales", "atención personalizada") — suena a bot.

## Universal objections

1. **"Está muy caro"** → Pedir referencia: "¿caro comparado con qué?" → reframear en valor por mes / valor por uso / ROI / ahorro / costo del status quo.
2. **"Lo voy a pensar"** → Aceptar + anclar próximo paso concreto con fecha y hora, no "te contacto pronto".
3. **"Mándame info por correo/WhatsApp"** → Enviar, pero preguntar antes qué es lo más importante para decidir, para personalizar el mensaje.
4. **"Estoy comparando con otros"** → Normal. Ofrecer ayuda a comparar objetivamente (tabla de features, precio, plazo). No atacar al competidor.
5. **"No es el momento"** → Validar. Pedir permiso para recontactar en X tiempo y en qué canal.
6. **"Necesito hablar con [tercero]"** → Perfecto: ¿cuándo hablan y qué información necesita ese tercero para decidir?

## Follow-up questions when the user answer is vague

**If user says "vendemos / ofrecemos [X]" without depth → probe:**
- ¿Qué es exactamente lo que entregan al cliente (producto físico, servicio presencial, entrega digital, suscripción)?
- ¿Precio/ticket promedio y cómo se cobra (una vez, mensual, por uso)?
- ¿Quién suele comprarlo y por qué motivo típico lo contactan?
- ¿Qué diferencia su oferta del competidor más obvio — precio, tiempo, calidad, ubicación, algo más?

**If user says "mi cliente es [vague profile]" → probe:**
- ¿Edad aproximada, género si es relevante, ocupación típica?
- ¿Qué problema concreto tiene cuando los contacta? ¿En qué momento del día/semana suele escribir?
- ¿Cuánto suele estar dispuesto a pagar? ¿Regatea o acepta precio lista?
- Dame un ejemplo real de un cliente ideal cerrado en los últimos 30 días.

**If user skips qualification criteria → probe:**
- ¿Cómo saben en los primeros 30 segundos si un lead vale la pena atender o descartar?
- ¿Qué preguntan siempre antes de cerrar? (presupuesto, zona, fecha, quién decide)
- ¿Qué tipo de cliente prefieren NO tomar — y por qué?
- ¿Hay horarios, fechas o zonas donde no pueden operar?

## Business depth probes (para forzar concreción)

Si el usuario responde en alto nivel, corta con preguntas específicas:

- "Dame un ejemplo real de un cliente ideal que cerraste en el último mes — qué pidió, cuánto pagó, cómo llegó."
- "Dame un ejemplo real de un cliente que NO tomaste — por qué."
- "¿Cuál es el precio más bajo que aceptarías cobrar por [X]?"
- "¿Cuál es el tiempo mínimo para entregar [X] si alguien pide urgencia hoy?"
- "Si un lead dice 'lo voy a pensar', ¿qué haces concretamente en las siguientes 48 horas?"
- "¿Qué pregunta haces tú siempre que un lead nunca hace solo?"

## DO and DON'T examples

**Bad answer:** "Vendemos productos de calidad para todo tipo de clientes."
**Good probe:** "Para no cerrar a cualquiera: dame 2 cosas. 1) Un producto concreto con su precio. 2) Un ejemplo real de cliente que compró la semana pasada y por qué. Con eso el agente entiende el patrón."

**Bad answer:** "Mi cliente ideal es alguien interesado en mejorar su vida."
**Good probe:** "Eso aplica a todo el mundo. ¿Qué tienen en común los últimos 5 clientes que cerraste? Edad, profesión, motivo de compra, canal por el que llegaron. Sin patrón el agente no sabe a quién priorizar."

**Bad answer:** "No descarto a nadie, todos son bienvenidos."
**Good probe:** "En la práctica siempre hay casos que no sirven (fuera de zona, sin presupuesto, fuera del portafolio, timeline imposible, decisor no presente). ¿Cuál es el filtro mínimo — geografía, presupuesto, urgencia, tipo de petición? El agente necesita saber a quién mover a cierre y a quién mover a follow-up/descartar."
