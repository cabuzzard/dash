# dash Remotion stills

One reusable still composition — `OfferStill` — that sets a headline, kicker,
one sentence and a URL over a **wordless image plate**, in a hub's real fonts
and colours (`web/hub/hubs.design.json`).

This is the "plate + Remotion" split: the image model
(`scripts/grok-image.py`, or the Publish modal's Grok Imagine option) makes a
plate with **no text**; Remotion owns every character, so the type is
accurate, on-brand, and consistent — no fighting an image model's kerning.

## Setup

```bash
cd remotion
npm install          # Remotion + React; ~1 min, needs Node 18+
```

## Render

```bash
# 1. make the plate first (wordless), e.g.
python ../scripts/grok-image.py --hub care-gap --kind ig-background \
  --out ../images/help-house-a-caregiver-ig.png --prompt "<blue-hour porch plate, no text>"

# 2. set the type over it
node render-offer-still.mjs \
  --hub care-gap \
  --plate ../images/help-house-a-caregiver-ig.png \
  --title "Help House a Caregiver" \
  --eyebrow "The Care Gap" \
  --line "Every dollar you deploy keeps a skilled caregiver housed, employed, and counted." \
  --url stablehomefoundation.com \
  --shape both \
  --out-dir ../images
```

Writes `../images/<title-slug>-square.png` (1080²) and
`-portrait.png` (1080×1350).

### Attach to a Notion Asset

Add `--attach <ASSET_PAGE_ID>` with `HERMES_TOKEN` in the env. It POSTs each
PNG to the Worker's `saveOfferImage` (base64) — square → `Thumbnail`,
portrait → `Instagram Background` — which rehosts it on GitHub Pages and
writes the property, exactly like the modal path.

```bash
set HERMES_TOKEN=paste-session-token
node render-offer-still.mjs --hub care-gap --plate ../images/x.png --title "…" --attach 26a1f7d3a4bb...
```

## Props (`OfferStill`)

| prop | from |
|---|---|
| `eyebrow` | hub `logoText`, or pass `--eyebrow` |
| `title` | the offer/asset title, **verbatim** — no invented headlines |
| `line` | one sentence from the offer page |
| `url` | bare domain |
| `bgSrc` | the plate (local file copied to `public/`, or an https URL) |
| `bg` `ink` `sea` `accent` | `hubs.design.json → hubs[slug].tokens` |
| `displayFont` `bodyFont` `monoFont` | `…tokens`' sibling `fonts` block |
| `anchor` | `top` (default — plates keep the top ~40% calm) or `bottom` |
| `showLine` | portrait yes, square no (set by `--shape`) |

Fonts load from Google Fonts at render time via `delayRender` — any family
named in a hub's `fonts` block works with no code change.

## Studio

`npm run studio` opens the Remotion studio with Care Gap defaults for visual
tweaking (drop a `public/plate.png` first).
