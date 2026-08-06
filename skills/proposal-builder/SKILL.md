---
name: proposal-builder
description: Generate branded Nexor sales proposals (print-ready Letter one-pagers, HTML + PDF) for a prospective customer. Use when asked to make a proposal, one-pager, or pitch doc for a prospect. Takes the prospect's name, domain, and vertical; produces a 2 or 3 page document in the house style with bespoke copy, a simulated cross-channel conversation, and rollout plan.
version: 1.0.0
tags:
  - sales
  - proposal
  - collateral
  - design
---

# Nexor proposal builder

Produces the house-style Nexor proposal: a self-contained HTML document that
prints to 2 or 3 US Letter pages, branded Nexor, personalized to one prospect.
The style is fixed and non-negotiable; the copy is bespoke every time. The
craft is in the copy.

Files in this skill:

- `assets/template.html` — the master template. All CSS, all components, all
  page skeletons, with example copy for a fictional client and `OPTION:`
  comments marking every variant.
- `assets/nexor-logo-dark.svg`, `assets/nexor-logo-white.svg` — the wordmark.
  The template references them as `{{NEXOR_LOGO_DARK}}` / `{{NEXOR_LOGO_WHITE}}`
  tokens; the render script inlines them.
- `references/copy-bank.md` — headline formulas, the subhead skeleton, use
  case libraries per vertical, the conversation story beats, and the
  vocabulary list. **Read it before writing any copy.**
- `scripts/render.mjs` — resolves logo tokens, writes the final shareable
  HTML, prints the PDF (Playwright), and emits PNG page previews (poppler).

## Step 1 — Intake

Required (ask only if truly missing; most can be found or inferred):

| Input | How to get it if not given |
|---|---|
| Company name + domain | From the user. Non-negotiable. |
| Vertical + what they sell | Look at their site (WebFetch the homepage) |
| The money metric | Infer: orders (retail), reservations (rentals/hotels), leases, booked meetings… |
| Market (US vs LATAM) | From the domain/site. Decides iMessage vs WhatsApp |

Derive, don't ask:

- **Agent persona**: a common, trustworthy first name that fits the brand
  ("Rachel", "Marcus", "Sam"), styled `{Name} from {Company}`.
- **Average ticket / painful stat**: from their site or public knowledge. A
  real number ("at a $185 shirt every one matters") beats a generic claim.
- **Their stack** (Shopify, a CDP, a booking engine): from the site's source
  or common knowledge. Naming it on page 3 signals homework done.
- **Accent color**: from their brand (see Step 3).
- **Homepage screenshot**: if you have browser tooling available, screenshot
  their homepage and embed it as a JPEG data URI in `.shot`. Blur or avoid any
  personal data. If not, keep the styled `.shot-ph` placeholder — it renders
  fine — and tell the user how to swap a real screenshot in later.

Optional inputs that upgrade the doc: known pain points, a founder's name and
voice (unlocks the founder-promise headline), real performance numbers
(unlocks the results band), whether the doc is sent cold (unlocks the CTA
band), Spanish output for LATAM prospects (translate all visible copy; keep
structure identical).

## Step 2 — Choose the shape

- **3 pages (default)**: Hook + product (p1), memory & persistence story (p2),
  system & rollout (p3).
- **2 pages** (busy exec, warm deal): p1 as-is; merge p2 by dropping the
  diagram, keeping the stream, and closing with the chase-beats strip; drop
  p3. The enterprise-rental proposal shipped this way.
- Long-consideration business (trips, leases, B2B): the p2 story spans weeks,
  not days; drop the diagram to give the stream room; retitle the chase strip
  `Six weeks of follow up, zero effort from your team`.

## Step 3 — Branding knobs

The base system never changes: `#fafafa` paper, near-black ink, the 10-step
gray ramp, Inter body, JetBrains Mono for all labels/chips/meta, hairline
borders, 999px pill radii.

Set the four accent vars in `:root` from the prospect's brand color:

- `--brand`: their primary brand color, adjusted to sit well on white
  (roughly saturation 60–85%, lightness 40–55%; a green like `#169A5A`, a
  blue like `#1487c8`).
- `--brand-deep`: same hue, ~20% darker. Used for text-on-light and the dark
  system chip.
- `--brand-tint`: same hue at ~93–96% lightness (a wash).
- `--brand-line`: same hue at ~70–80% lightness, still clearly colored. Used
  for hairlines and the big ghost `01 02 03` numerals.

Three accent intensities (pick one):

1. **Neutral** (fashion/minimal brands whose color is black): set the four
   vars to ink/gray values as noted in the template comment. Everything reads
   monochrome.
2. **Moderate (default)**: accent on the meta dot, ghost numerals, chat send
   button, diagram nodes, hbeat dots, feature/results card top borders, dark
   system chip, footer page number.
3. **Heavy** (bold-brand prospects): additionally add class `accent` to
   `.head` (2px accent bottom border), `.chat` (accent chat header + user
   bubbles), and `.uc-pts` (accent-tinted pills). Use the `<span class="gr">`
   accent word in the H1.

Typography option: add `serif-heads` to `<body>` for premium/boutique brands —
headings switch to Fraunces (keep the Fraunces family in the font link).
Otherwise Inter headings; you may then trim Fraunces from the link.

Header option: if you have the client's logo as a data URI, use the dual-logo
header (`client logo × Nexor`) from the OPTION comment — strongest
personalization signal on the page. Otherwise the Nexor wordmark alone with
`Prepared for {Company} · {domain} · {year}` in the meta.

## Step 4 — Write the copy

Read `references/copy-bank.md` and follow it. The hard rules:

1. **No hyphens, en dashes, or em dashes anywhere in visible copy.** Compound
   modifiers get rephrased ("long lead trips", "cart aware outreach").
   Separators are the middot `·`. This is house law.
2. Short declarative sentences. Confidence without adjectives. Every claim
   concrete: a size, a price, a city, a timestamp, a duration ("2 min 40 s").
3. `<b>`/`<strong>` lands only on the load-bearing fact of each sentence —
   the mechanism, the number, the guarantee. One bold per sentence, max.
4. The customer always wins: every simulated conversation ends in a paid
   order AND in restraint (`follow ups stopped`). Persistence is the product;
   restraint is the trust signal.
5. Channels in fixed order: Call, iMessage/WhatsApp, Email, Instagram.
   iMessage for US prospects, WhatsApp for LATAM.
6. Exclamation marks only inside customer bubbles, never in Nexor's voice.
7. Everything personalized: product names from their actual catalog, their
   real cities, their real free-shipping threshold if you can find it. The
   proposal should feel like the agent already works there.
8. Claims discipline: only durable true claims in the proof line; the results
   band stays commented out unless the user supplies real numbers.

## Step 5 — Assemble

1. Copy `assets/template.html` to the working directory as
   `{company-slug}-nexor.html`.
2. Set `<title>`, theme color, `:root` accent vars, body class, header
   variant.
3. Replace every visible string (it is all example copy for "Harbor Goods").
   Work page by page; keep all class names and structure.
4. Delete unused OPTION comments; uncomment optional blocks you're using
   (results band, needs strip, CTA band).
5. Leave the `{{NEXOR_LOGO_DARK}}`/`{{NEXOR_LOGO_WHITE}}` tokens alone — the
   render script inlines them. (If you can't run the script, paste
   `assets/nexor-logo-dark.svg` in their place by hand.)
6. Screenshot: swap `.shot-ph` for a real `<img class="shot">` data URI when
   available.

## Step 6 — Render and verify

```bash
node scripts/render.mjs {company-slug}-nexor.html [outdir]
```

Outputs the resolved shareable HTML, the PDF, and (if poppler is installed)
one PNG per page. No Playwright? The script still writes the resolved HTML;
print it from Chrome: Letter, margins None, Background graphics ON.

**Look at the PNGs before delivering.** Pages are hard-clipped at 11in
(`overflow: hidden`), so overflow silently disappears. Check:

- [ ] Footer visible on every page, not clipped, page numbers `01 / 03` correct
- [ ] Nothing overlapping the chat panel; stream fits without crowding
- [ ] Every page: header, content, footer — no giant empty band (if a page
      runs short, upsize the p3-style paddings rather than adding filler copy)
- [ ] Grep your copy for `-`, `–`, `—` in visible text (attribute values and
      CSS don't count)
- [ ] Company name, domain, and persona consistent across all pages, title,
      and footers
- [ ] Fonts loaded in the PDF (the script waits on `document.fonts.ready`;
      offline renders fall back to system fonts — re-render online)

Deliver both files: the HTML (single source, self-contained) and the PDF (the
thing you actually send).

## Density rules (fitting Letter pages)

The layout is tuned tight. If page 2's stream overflows: drop the diagram
first, then trim stream beats to six, then reduce `.stream` inner padding —
never shrink font sizes below the template's. If page 3 runs short: it is
designed to run airy (`p3` paddings); do not pad with copy. If you only have
two pages of substance, ship two pages.
