# make-offer-still

Set an offer's headline, kicker, one line and URL over a **wordless image
plate**, in the hub's real fonts and colours — producing a square blog
thumbnail and a 4:5 Instagram still. The plate + Remotion split: an image
model draws the picture (no text), Remotion owns every character.

## Trigger phrases
"make an offer still", "run make-offer-still", "remotion still for this offer",
"set the type over the plate", "CareGapOfferStill"

## ⚠️ Boundary
Remotion's renderer needs a real Node process with bundled Chromium — same as
`make-carousel-remotion` / `make-reel-video`. Runs in chat, not from a
dashboard button. The reusable project lives in `remotion/` (committed source,
gitignored `node_modules`/`public`/`out`).

## When to use which
- **Grok Imagine plate + this skill** — the type must be exact and on-brand
  (a funder deck, a policy brief). The default for Offer assets now.
- **Nano Banana `blog-thumbnail`** (Publish modal, `imageModel: nano`) — bakes
  the title into the pixels itself. Faster, one step, less type control.

## Inputs
- **assetId** — the Offer Asset's Notion page ID (for the title, offer card,
  hub, and the existing plate).
- Optional overrides: `eyebrow`, `line`, `url`, `anchor`.

## Prerequisites
- Node 18+. `cd remotion && npm install` once (Remotion + React).
- A **wordless plate** already made — `scripts/grok-image.py --hub <slug>
  --kind ig-background` (or the modal's Grok option). The portrait still needs
  the 3:4/4:5 plate; the square still can reuse it (center-cropped) or its own
  1:1 plate.
- `HERMES_TOKEN` in the env only if attaching back to Notion.

## Workflow

**Read `.claude/skills/_content-governance.md` first** — the voice-fit bar for
any line you write, and the Pillar-Content-as-source rule.

### Step 0 — Pull the offer + hub
Fetch the Asset page. Take:
- **title** — verbatim, this is the headline. **Never invent a new one.**
- **OFFER CARD** json (`name`, `promise`, `kicker`) + the `Body` promise.
- **hub slug** — `Content Hub` select, else resolve via `HUB_SITES` /
  the campaign. This drives `--hub` (colours + fonts from `hubs.design.json`).
- **plate** — the asset's `Instagram Background` URL if set; else make one
  first with `scripts/grok-image.py`.

`line` = one sentence from the offer page / promise (funder register, not a
GoFundMe plea). `eyebrow` defaults to the hub `logoText`. `url` = the hub's
bare domain.

### Step 1 — Render
```bash
cd remotion
node render-offer-still.mjs \
  --hub <slug> \
  --plate <Instagram Background URL or local plate> \
  --title "<asset title, verbatim>" \
  --eyebrow "<hub logoText>" \
  --line "<one sentence>" \
  --url <hub domain> \
  --shape both \
  --out-dir ../images \
  --attach <assetId>          # writes Thumbnail (square) + Instagram Background (portrait)
```

`--attach` POSTs each PNG to the Worker `saveOfferImage` (base64) — same
rehost-and-write path as the modal, so downstream everything behaves
identically. Drop `--attach` to just get the files.

### Step 2 — Report back
- The two file paths (and, with `--attach`, the hosted URLs + which property
  each landed on).
- Remind: to revise, edit the title/line and re-run — it rebuilds from
  current inputs. The plate only changes if you regenerate it separately.
- Posting is manual — no auto-posting exists in this repo.

## Notes
- **Verbatim title only.** The whole point of this split is that the type is
  trustworthy — don't paraphrase the headline to fit the box; adjust
  `--anchor` or shorten the `line` instead.
- **Wordless plates only.** If the plate already has text on it (a Nano
  `blog-thumbnail`, or a hand-made ChatGPT image), don't run this over it —
  you'll get two sets of type fighting.
- Fonts load from Google Fonts at render time by family name — any hub's
  `fonts` block works with no code change.
- Full prop table + studio instructions: `remotion/README.md`.
