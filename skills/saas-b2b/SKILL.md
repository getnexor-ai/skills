---
name: saas-b2b
description: Domain expertise for onboarding AI sales agents for B2B SaaS companies (ICP, stage signals, sales motion, objections)
version: 1.0.0
tags:
  - saas
  - b2b
  - onboarding
  - playbook
---

# B2B SaaS Playbook

Applies to SaaS companies selling to other companies — PLG, sales-led, and hybrid. LATAM-aware but globally applicable.

## Region / market context

- **Currency**: most LATAM SaaS price in USD to avoid FX swings, invoice en moneda local si el cliente lo pide. Chile = UF sometimes for enterprise.
- **Payment terms**: LATAM enterprise typically 30–60 días net post-factura. SMB: tarjeta mensual upfront.
- **Tax**: Chile IVA 19%, México IVA 16%, Brasil complejo (NFS-e). Billing is often a deal-killer for LATAM enterprise; flag early.
- **Contract length**: SMB = monthly/annual; Mid-market = annual; Enterprise = multi-año con ramp.

**Typical deal sizes** (ACV, USD):
- SMB self-serve / PLG: $500–$5.000
- Mid-market sales-led: $10.000–$60.000
- Enterprise: $60.000–$500.000+
- Rule of thumb: sales motion cost debe ser ≤ 1/3 del ACV.

## What makes a GOOD business answer

A complete answer should cover:
1. **Product category** in one line (not "we help companies do X" — specific: "observability for Kubernetes", "CRM for real estate brokers").
2. **ICP** in vertical + size + geography (e.g., "US B2B SaaS Series A–C, 20–200 employees, product-led").
3. **Pricing model**: flat monthly, per-seat, usage-based, tiered, enterprise custom.
4. **Sales motion**: self-serve / PLG / sales-led / hybrid / outbound / inbound / channel.
5. **Decision-maker titles** (buyer, champion, end-user — they are usually different people).
6. **Typical deal cycle** (time from first touch to signed contract).
7. **Core value prop** — quantified where possible (saves X hours, reduces Y cost Z%).
8. **Main competitors** and key differentiator.

## Qualification patterns typical of this industry

**BANT** (Budget, Authority, Need, Timeline) is legacy but still useful. Modern: **MEDDIC** (Metrics, Economic buyer, Decision criteria, Decision process, Identify pain, Champion) or **MEDDPICC** (+ Paper process, Competition).

Probe for:
- **Company size** (headcount, revenue) — proxy for price tier.
- **Funding stage** — Series A (seed-validated, starting to scale), Series B (PMF confirmed, scaling GTM), Series C+ (expansion). Each stage has a different "urgent problem".
- **Current tool stack** — what they use today for this problem; displacement vs greenfield changes the sales motion.
- **Number of users / seats** relevant (maps to ACV).
- **Data volume / usage** if usage-based pricing.
- **Compliance requirements** — SOC2, HIPAA, GDPR, ISO 27001. Enterprise blockers if unmet.
- **Integration needs** — Salesforce, HubSpot, Slack, specific APIs.
- **Technical champion identified** — who will actually evaluate and push internally.
- **Decision process**: who signs? Is there a procurement/legal review?
- **Timeline / trigger event**: new funding, new exec, failed migration, audit finding.

## Typical discards / deal-breakers

- Company size way under/over the ICP (too small = can't pay, too big = sales cycle too long for current motion).
- Wrong vertical entirely.
- Geography not supported (data residency, language, currency).
- Compliance gap that cannot be closed in time.
- Already committed 12+ months ago to a direct competitor (wait for renewal, don't chase).
- Student / personal project / research use — no budget path.
- No technical champion and no executive sponsor → deal will stall.
- Feature request as a precondition that is not on the roadmap.
- "Can you do this for free?" and budget < $0 (unless PLG has a free tier that fits).

## Industry vocabulary to mirror

- **ICP** (Ideal Customer Profile), **TAM/SAM/SOM**.
- **PQL** (Product Qualified Lead), **MQL** (Marketing Qualified), **SQL** (Sales Qualified).
- **PLG** (Product-Led Growth), **sales-led**, **hybrid**.
- **ACV** (Annual Contract Value), **MRR/ARR**, **NRR** (Net Revenue Retention), **gross retention**.
- **Seat** / **per-user pricing** / **usage-based** / **consumption** / **tiered**.
- **Champion**, **economic buyer**, **end-user**, **blocker**, **detractor**.
- **Pilot** / **POC** (Proof of Concept) / **trial** / **free tier**.
- **Ramp** (gradual seat increase), **land and expand**.
- **Design partner** (early co-development customer).
- **Procurement**, **security review**, **DPA** (Data Processing Agreement), **MSA** (Master Service Agreement), **SOW** (Statement of Work).
- **Renewal**, **churn**, **expansion revenue**.
- **CS** (Customer Success), **CSM**, **AE** (Account Executive), **SDR** / **BDR**.
- **Sandbox**, **staging**, **self-serve**, **API-first**.

## Common objections in this industry

1. **"We're happy with [competitor]"** → Don't trash the incumbent. Ask what they wish it did better. Position as complementary first, then displacement. Get a champion to run a scoped POC on the gap.
2. **"Too expensive"** → Reframe vs cost of status quo (hours wasted, failed projects, lost deals). Ask what ROI benchmark would make this a no-brainer. Propose a ramp or annual prepay discount.
3. **"We need feature X"** → Clarify if X is a nice-to-have or a hard blocker. If blocker and not on roadmap, disqualify gracefully and offer to re-engage when shipped.
4. **"Send me a deck and I'll share it internally"** → Usually means no champion. Respond: "Happy to. To make it resonate, who internally will read it and what's their biggest headache right now?" — if no answer, deal is cold.
5. **"We don't have budget this quarter"** → Ask when the next budget cycle opens, who approves it, and what evidence they'd need by then. Schedule a calendar anchor, not a vague "follow up later".
6. **"Need to do a security review"** → Welcome. Send SOC2 / security packet proactively. Offer to join a call with their security team.
7. **"Legal/procurement is slow"** → Offer your own paper (MSA), DPA, and SOC2 upfront. Ask about redlines history. Propose a pilot under a simpler agreement while the full MSA negotiates.

## Follow-up questions when the user answer is vague

**If user says "vendemos SaaS a empresas" → probe:**
- ¿Qué hace exactamente el producto en una frase (no "ayudamos a X")?
- ¿ICP por vertical, tamaño y geografía? Dame un ejemplo de cliente ideal y otro de cliente a descartar.
- ¿Self-serve, sales-led o hybrid? ¿ACV promedio en USD?
- ¿Cuál es el "trigger event" que hace que un prospect priorice comprar esto ahora?

**If user says "nuestro cliente es cualquier empresa" → probe:**
- ¿Cuál de tus últimos 10 clientes cerrados fue el más rápido y por qué? ¿Qué tenían en común?
- ¿Rango de headcount mínimo y máximo donde el producto vale la pena?
- ¿Venden a técnicos (eng, data) o a negocio (RevOps, Sales, Marketing)?
- ¿Quién firma el contrato y quién lo usa día a día?

**If user skips qualification criteria → probe:**
- ¿Qué señales usan hoy para decidir que un lead NO vale agendar demo? (size, vertical, stack, compliance)
- ¿Cómo identifican al champion antes de invertir tiempo en un deal?
- ¿Qué compliance bloquea automáticamente (SOC2, HIPAA, data residency)?
- ¿Cuál es el ciclo de venta promedio y cuándo declaran un deal "stalled"?

## DO and DON'T examples

**Bad answer:** "Vendemos software de productividad a empresas."
**Good probe:** "Productividad es muy amplio — ¿para qué función específica (dev, RevOps, marketing, finance)? ¿Se integra con qué stack? Dame el título exacto del champion típico y el del economic buyer."

**Bad answer:** "Mi cliente ideal es alguien que quiere escalar."
**Good probe:** "Escalar es relativo. En headcount, ¿entre qué y qué números? ¿Series A/B/C u otro stage? ¿Qué cambia en su operación que los lleva a priorizar comprar esto (nueva ronda, nuevo VP, migración)?"

**Bad answer:** "Si pagan, los tomamos."
**Good probe:** "Aceptar un cliente fuera del ICP suele terminar en churn y mala NPS. ¿Tienen un ICP definido? Si no, construyámoslo con los últimos 5 clientes felices vs los 5 que churnearon."
