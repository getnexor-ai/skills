---
name: ecommerce
description: Domain expertise for onboarding AI sales agents for ecommerce businesses (online stores, DTC brands, marketplaces)
version: 1.0.0
tags:
  - ecommerce
  - onboarding
  - playbook
---

# Ecommerce Playbook

Applies to tiendas online propias (Shopify, WooCommerce, VTEX, Jumpseller), marcas DTC (direct-to-consumer), sellers en marketplaces (Mercado Libre, Amazon, Falabella), y brands que venden por redes sociales (Instagram shopping, WhatsApp catalog).

## Region / market context

**Chile LATAM:**
- **Marketplaces dominantes**: Mercado Libre (generalist), Falabella.com, Ripley, Paris, AliExpress y Temu (importado).
- **Medios de pago**: Transbank (Webpay) para tarjetas, Khipu y MACH para transfer, Mercado Pago, Fpay (Falabella), Mach, Kueski/SumUp para cuotas, cripto marginal.
- **Cuotas sin interés (CSI)**: muy usado, hasta 12 cuotas en Chile — cargo al comercio, bandera de cierre para tickets medios.
- **Envío**: Starken, Chilexpress, Correos Chile, Blue Express. Same-day Santiago con Uber/Rappi/Pedidos Ya.
- **Devoluciones**: Ley del Consumidor — **10 días de derecho a retracto** en compras a distancia (online), salvo excepciones (perecibles, personalizados). El agente NO puede negar este derecho.
- **IVA 19%** siempre incluido en precio publicado al consumidor final.
- **Boleta electrónica SII** obligatoria por venta.

## What makes a GOOD business answer

A complete answer should cover:
1. **Categoría** del producto (ropa, electrónica, belleza, alimentos, suplementos, hogar, deportes, nicho).
2. **Modelo**: propia manufactura (DTC), reventa (dropshipping / distribución), importado, marketplace-only.
3. **Canal(es) de venta**: sitio propio, Mercado Libre, Falabella, Instagram, WhatsApp, multichannel.
4. **Ticket promedio** y rango.
5. **Stock**: propio (bodega) vs bajo pedido vs dropshipping (sin stock propio).
6. **Zona de despacho**: RM, todo Chile, internacional.
7. **Tiempos de entrega** reales por zona.
8. **Medios de pago** aceptados y cuotas ofrecidas.
9. **Política de cambios/devoluciones** específica (plazo, quién paga envío de vuelta, excepciones).
10. **Atención pre/post venta**: quién responde WhatsApp, horarios.

## Qualification patterns typical of this industry

**Pre-purchase (the AI agent converts):**
- **Producto de interés** específico (SKU, modelo, talla, color, variante).
- **Stock disponible** ahora mismo del SKU exacto.
- **Zona de entrega** (comuna / región / país) → valida si se despacha y tiempos/precio.
- **Urgencia**: ¿lo necesita para una fecha (cumpleaños, viaje, evento)? Cambia completamente el flujo de envío.
- **Presupuesto / medio de pago**: si pregunta por cuotas, valida disponibilidad en CSI.
- **Primera compra vs cliente recurrente** (para aplicar descuento primera compra o código).

**Post-purchase (the AI agent retiene):**
- **Número de orden** para buscar estado.
- **Motivo del contacto**: estado del envío, cambio, devolución, garantía, producto defectuoso.
- **Fecha de compra** (para validar plazo de retracto legal de 10 días).
- **Condición del producto** (sin usar, con etiquetas, dañado en despacho).
- **Si tiene boleta/factura** a mano.

## Typical discards / deal-breakers

**Pre-purchase:**
- **Producto sin stock** y sin ETA clara → no cerrar promesa falsa; ofrecer suscripción a aviso de stock.
- **Fuera de zona de despacho** (el país / región no está cubierto).
- **SKU discontinuado**: ofrecer similar o cerrar conversación honestamente.
- **Busca características que el producto no tiene** (talla, compatibilidad, potencia) — corregir antes de cobrar, no después.
- **Precio negociado muy por debajo**: marketplaces y DTCs suelen no negociar; el discount es predefinido.

**Post-purchase:**
- **Reclamo fuera de política** (ej: producto usado que no cabe en retracto, plazo vencido). El agente debe saber exactamente la política para no prometer lo que no puede cumplir.
- **Daño por mal uso** vs defecto de fábrica: el agente debe pedir evidencia (foto/video) antes de escalar a logística.
- **Producto personalizado / perecible**: por ley no entra en retracto → dejarlo claro desde la pre-venta.

## Industry vocabulary to mirror

- **SKU**, **variante**, **stock**, **bajo pedido**, **preventa**, **backorder**.
- **Despacho** / **envío** / **courier**, **tracking**, **guía de despacho**, **nº de seguimiento**.
- **Retiro en tienda**, **click & collect**, **same-day**, **express**, **24h**, **48h**.
- **Cuotas sin interés (CSI)**, **Webpay**, **Khipu**, **MACH**, **Mercado Pago**, **Fpay**.
- **Boleta** / **factura** / **SII**.
- **Cambio** vs **devolución** vs **reembolso** vs **garantía**.
- **Retracto** (10 días legal, Ley Consumidor).
- **Nota de crédito**, **reversa**.
- **Catálogo**, **landing**, **checkout**, **carrito abandonado**.
- **DTC**, **marketplace**, **dropshipping**, **multichannel**.
- **BLACK**, **Cyber Day**, **Cyber Monday**, **Black Friday**, **Navidad** (peaks Chile).

## Common objections in this industry

1. **"¿Tienen stock de [variante]?"** → Responder exacto, no "creo que sí". Si no hay, ofrecer alternativa real o suscripción a restock.
2. **"¿Cuánto demora el envío a [comuna]?"** → Rango concreto (2–4 días hábiles), no "dentro de la semana". Incluir si es express o normal y costo.
3. **"¿Cuánto cuesta el envío?"** → Dar cifra. Si hay envío gratis sobre $X, mencionarlo como incentivo de up-sell ("agrega $5.000 y tu envío es gratis").
4. **"¿Aceptan cuotas sin interés?"** → Sí / no, y en qué medios (tarjetas específicas, hasta cuántas cuotas, si aplica a todo el monto o desde X).
5. **"¿Puedo devolverlo si no me gusta?"** → Explicar ley (10 días retracto), quién paga el envío de vuelta, producto en qué condición, tiempo de reembolso.
6. **"No llegó mi pedido / demoró mucho"** → Pedir nº orden, buscar tracking, si hay demora real ofrecer compensación (cupón descuento, despacho gratis siguiente compra). No disculpas genéricas.
7. **"Llegó defectuoso / dañado"** → Pedir foto/video, validar si fue daño en transporte vs fábrica, abrir caso con logística o proveedor, responder con SLA claro ("en 48h te doy respuesta").
8. **"Más barato en Temu / AliExpress"** → Anclar en: garantía local, despacho rápido, servicio post-venta en español, retracto legal, boleta para reclamo SERNAC.

## Follow-up questions when the user answer is vague

**If user says "vendemos por internet" → probe:**
- ¿Categoría principal y 1–2 productos estrella (SKUs)?
- ¿Canal propio (Shopify, VTEX), marketplace (Mercado Libre, Falabella), social (Instagram, WhatsApp), o multichannel?
- ¿Manejan stock propio, bajo pedido, o dropshipping?
- ¿Ticket promedio y rango (mínimo–máximo)?

**If user says "mi cliente quiere buena calidad a buen precio" → probe:**
- ¿Qué queja recurrente tienen en reseñas o reclamos? (define el pain real)
- ¿Compra primera vez o es recurrente? ¿Cuál es la tasa de recompra a 90 días?
- ¿Qué zona geográfica es el 80% de las ventas?
- ¿Qué medio de pago usa la mayoría (tarjeta, Khipu, transfer, cuotas)?

**If user skips qualification criteria → probe:**
- ¿Qué preguntas obligatorias antes de cerrar una venta online (stock, talla, zona, urgencia)?
- ¿Política de cambio/devolución exacta — plazo, quién paga envío, excepciones?
- ¿Qué hacen cuando alguien pregunta por algo sin stock — pierden venta o capturan email?
- ¿Tienen SLAs para responder post-venta? ¿El agente puede resolver solo o escala?

## DO and DON'T examples

**Bad answer:** "Sí, tenemos stock."
**Good probe:** "Stock del SKU específico (modelo + talla + color) debe validarse contra inventario en vivo. ¿El agente va a consultar el stock en tiempo real vía API/webhook, o trabajará con un snapshot manual? Cualquiera distinto genera ventas a productos sin stock y PR negativa."

**Bad answer:** "Hacemos envíos a todo Chile."
**Good probe:** "¿Todo Chile con los mismos tiempos y costos, o zona RM es express y regiones es 3–7 días con costo variable? ¿Hay comunas excluidas (Isla de Pascua, Juan Fernández, zonas extremas con costo alto)?"

**Bad answer:** "Aceptamos devoluciones si no les gusta."
**Good probe:** "La ley da 10 días de retracto en compras online pero ustedes pueden ir más allá. Especifiquemos: plazo real, quién paga envío de vuelta, reembolso en qué plazo, productos excluidos (personalizados, perecibles, íntimos). El agente NO puede improvisar esto."
