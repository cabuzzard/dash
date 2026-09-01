# AI Implementation — design brief

Written 2026-09-01. The design decisions behind `web/hub/ai-implementation/index.html`
and the reasoning, so a later revision changes things on purpose.

## Subject

A field guide for a small business that **bought AI and is still waiting on the
results**. Not a vendor, not a hype site — a map of where a rollout breaks
between the impressive demo and the version that actually runs the business.

- **Audience:** SMB owner/operator mid-rollout. Skeptical, technical enough to
  know the project is stuck, often already burned by an agency that overpromised.
  Reads for the specific failure that sounds like *their* project.
- **The page's one job:** get them to request the free **stalled-pilot teardown**
  (email capture in the report band). That's the entry point; the deeper paid
  reviews start from it.

## Token system

### Color — a console at rest

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#080c14` | deep console navy — the page ground |
| `--surface` | `#0f1626` | raised panel / card |
| `--ink` | `#e7eefb` | near-white body |
| `--ink-soft` | `#93a3bd` | muted slate — secondary text |
| `--line` | `rgba(96,165,250,.16)` | faint blue hairline |
| `--sea` | `#60a5fa` | **primary** — signal blue (eyebrows, kickers, links, focus) |
| `--deep` | `#0b111d` | report band, a touch off-bg |
| `--deep-ink` | `#c6d3ea` | text on `--deep` |
| `--accent` | `#06b6d4` | **cyan — used once, loudly** (the primary CTA only) |

Signal blue does the structural work; cyan is spent in exactly one place (the
"Send me the teardown" button). Nothing glows, nothing gradients.

### Type — spec-sheet, not marketing

- **Display — Space Grotesk** (600). Geometric, slightly mechanical, reads as
  engineering rather than editorial. Carries the hero thesis at
  `clamp(2.6rem, 6.2vw, 4.8rem)`.
- **Body — Inter** (400/500/600). Neutral, dense, high legibility for long
  failure-mode descriptions.
- **Mono — JetBrains Mono** (400/700). Eyebrows, the ribbon, card kickers, nav,
  button text, dates. It's what makes the page read as a status readout — every
  label is set in code type.

### Layout

Single column, `min(1120px, 100% - 2.5rem)`. Sections stacked, hairline-ruled.
The `trips` grid is 3-up cards for the nine failure modes. The report band is the
one inverted (`--deep`) block — a deliberate stop in the scroll where the ask
lives.

## Signature

**The ribbon is an implementation status readout.** Directly under the hero,
before any prose, a strip of mono stat-chips shows the vitals of a rollout that's
actually shipping:

> Pilot → production — 4 of 5 stall · Time-to-value target — 30 days ·
> Rollback plan — required · Model change — contract-tested ·
> Owner — a named human · Adoption — measured weekly

It reads the way a customer already reads their own dashboards, and it front-loads
the standard this hub holds AI work to.

Supporting it: the **01–09 numbering** on the failure-mode cards is a real
sequence — the order a rollout tends to break in (stalled pilot → hallucination →
no adoption → integration → cost → vendors → governance → demo-to-prod → agents),
not decoration. Hero thesis states the whole argument in five words: *"Most AI
projects don't fail. They stall."*

## The one risk

Console-navy + a single bright cyan accent is **close to one of the three
AI-default looks** the frontend-design skill flags (near-black ground, one acid
accent). It's taken deliberately here: the subject *is* systems, observability,
terminals and status pages — the palette is the customer's own working
environment, not a studio default. But it's a lean on a default, and it's the
first thing a revision should question.

If revisited: push toward an **incident-report / postmortem** aesthetic —
mono-forward, an off-white "printed doc" ground, red-thread margin annotations,
timestamps. Same "we take this seriously" message, further from the cluster.

## Deliberately avoided

- The warm-cream + high-contrast serif + terracotta accent cluster.
- The broadsheet look (hairline rules everywhere, zero radius, newspaper columns).
- Any "AI" imagery — glowing brains, circuit traces, robot hands, blue particle
  fields. **Zero images on the page.** The ribbon stats are the visual.
- Marketing voice. Every label names what a person controls ("Rollback plan",
  "Owner", "Adoption"), not how the system is built.
