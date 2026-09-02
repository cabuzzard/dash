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

### Color — daylight, not a dev console

*(Revised 2026-09-02. The original console-navy palette is at the bottom of this
file under "Superseded".)*

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#f7f9f8` | clean daylight white, a hair of green — the page ground |
| `--surface` | `#ffffff` | raised card |
| `--ink` | `#182a24` | deep pine, near-black body |
| `--ink-soft` | `#566a62` | calm grey-green — secondary text |
| `--line` | `#e2e9e5` | soft hairline |
| `--sea` | `#0f7d64` | **primary** — a "this is working" green (eyebrows, kickers, links, focus) |
| `--deep` | `#0d2a22` | deep-pine report band — the one inverted block |
| `--deep-ink` | `#d6e7df` | text on `--deep` |
| `--accent` | `#cc4e1e` | **deep persimmon — used once, loudly** (the primary CTA only; darkened so the shared white button label clears 4.5:1) |

The audience was burned by a vendor whose product *looked* like console-navy and
glowing cyan. Wearing that same palette works against the "we're not another hype
tool" message. Daylight white + a calm working green reads as plain, finished,
trustworthy — the opposite of the demo that impressed everyone and then stalled.
Green does the structural work; persimmon is spent in exactly one place (the
"Send me the teardown" button).

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

Daylight white + a green primary + a mono label set is closer to the "well-made
SaaS onboarding" look than to anything with a strong point of view. The
mono-forward status-readout treatment (the ribbon, the 01–09 card numbering, the
code-type labels) is what keeps it from being generic — it still reads as a
status page, just a calm one on paper rather than a dark one. If it drifts toward
bland, push the postmortem idea further: red-thread margin annotations,
timestamps, a visible "reviewed / open / fixed" state on each failure mode.

## Superseded — the original console palette (2026-09-01 → 2026-09-02)

`--bg #080c14` deep console navy · `--surface #0f1626` · `--ink #e7eefb` ·
`--ink-soft #93a3bd` · `--sea #60a5fa` signal blue · `--deep #0b111d` ·
`--accent #06b6d4` cyan. Space Grotesk / Inter / JetBrains Mono (type kept).
Dropped because navy + cyan is the exact palette of the vendors this audience
already distrusts, and it leaned on the near-black-plus-acid-accent AI default.

## Deliberately avoided

- The warm-cream + high-contrast serif + terracotta accent cluster.
- The broadsheet look (hairline rules everywhere, zero radius, newspaper columns).
- Any "AI" imagery — glowing brains, circuit traces, robot hands, blue particle
  fields. **Zero images on the page.** The ribbon stats are the visual.
- Marketing voice. Every label names what a person controls ("Rollback plan",
  "Owner", "Adoption"), not how the system is built.
