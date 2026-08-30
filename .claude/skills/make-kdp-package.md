# make-kdp-package

Assemble a **print-ready Amazon KDP paperback** from a book title: the interior PDF, the full-wrap cover PDF (with a computed spine), and the KDP metadata sheet. **Amazon KDP has no publishing API** — this skill produces every file and field for a ~10-minute manual upload; it does not upload, and browser-automation of the KDP dashboard is against Amazon's ToS (account bans), so don't.

This is the production skill for the **"kdp package"** Method (Notion Methods DB → "kdp package", id `3cc1f7d3a4bb81bebd7dc40f9734be58`). Sibling: **make-lulu-book** / the "lulu print" method — the same book for Lulu, whose Print API *can* publish programmatically.

## Trigger phrases
"make the KDP package", "assemble the KDP files", "build the KDP paperback", "run make-kdp-package", "KDP package for <book title>"

## Inputs
- **title** — a Content Strategy book title (the pillar), e.g. `LBB — Little Brown Birds`. Required.
- **campaign** — resolved from the title's `Campaign` relation (for Research keywords + imprint).
- **trim** (optional) — trim size in inches. Default `8.5x11` for a coloring book; `6x9` for text.
- **interior** (optional) — `bw` (default, cheapest — line art + a black-and-white colour key) or `color`.
- **paper** (optional) — `white` (default for bw) / `cream` (text) / `color`.

## Constants
- Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Assets DB `e91bdb6e770b4d298e9f62166a0fd5de` · Products DB `e92fcfce75fc4f54b553df0b7672ff48`.
- Output folder: `web/books/{slug}/` (`slug` = kebab-case of the book title).
- **Auth:** chat-run skill — do **all** Notion reads/writes through the **Notion connector**, no PIN.

### KDP print specs (verify against KDP's current tables at publish time)
- **Bleed:** 0.125 in on the three outside edges (top, bottom, outer). Full-bleed pages must extend art to 0.125 in past trim.
- **Inside margin (gutter):** < 151 pages → 0.375 in · 151–300 → 0.5 in · 301–500 → 0.625 in · 501–700 → 0.75 in · 701–828 → 0.875 in.
- **Outside / top / bottom margin (no bleed):** ≥ 0.25 in; use 0.375–0.5 in for comfort. With bleed, the *safe* text area still keeps 0.375 in from trim.
- **Spine width = page count × per-page thickness:** white 0.002252 in · cream 0.0025 in · black-ink on white 0.002252 in · standard/premium colour 0.002347 in. Spine text allowed only at ≥ 100 pages; keep it 0.0625 in inside each spine fold.
- **Cover = one flat PDF:** width = (2 × (trim width + 0.125 bleed)) + spine ; height = trim height + 0.25 (bleed top+bottom).
- **Page count must be even**, minimum 24. Front matter counts.
- **Print cost (paperback, US, approximate — read KDP's printing-cost calculator for the live number):** B&W ≤ 108 pages ≈ flat $2.30 ; B&W ≥ 110 pages ≈ $0.85 + $0.012 × pages. Large trim (8.5×11) sits at the higher end. Colour is far more — another reason a coloring book interior stays B&W.
- **Royalty (paperback):** 60% × list price − print cost, per marketplace, on 35%/70%… no — paperback is 60% only. Compute list so this clears a target margin.

## Workflow (run every step)

Read `.claude/skills/_content-governance.md` first (Research dedup rule + voice bar for the description copy).

### Step 0 — Gather the book
- Read the **book title** page: its `### Pillar Content`, `Grouping`, `product` relation, `Campaign`.
- Query the Content Strategy DB for every title sharing this book's `Grouping` — these are the per-page entries (e.g. the 24 LBB birds). For each: its page body (pose / feature / palette / timing / fact) and its **line-art asset** (Assets DB, `Content Strategy` relation → that title, `Asset Type` a drawing/t-shirt type; use the `Design Link` / `Images` / final art file).
- Read the **campaign Research**: Keywords, Statement, Unique Opportunity — source for the description and the 7 keywords.
- Read the **product** (the book product): Description, Unique Angle, Transformation, Offer Structure — source for the back-cover blurb and price.
- **Stop if any per-page art is missing.** List which pages have no final art; the interior can't be built without them. (A greyscale placeholder box per missing page is acceptable only for a proof.)

### Step 1 — Lay out the page plan
- Front matter (recto starts): half-title · title page (title, subtitle, imprint) · copyright page (© year, imprint, "no part…", ISBN placeholder, "Printed by Amazon") · how to use this book · contents.
- Body: for each per-page entry, a **spread** — verso = the colour key (numbered call-outs on a greyscale thumbnail + a named swatch strip + the "when the colour shows" line + the fact) ; recto = the full line-art page (full-bleed art, page number, a light footer).
- Back matter: about the imprint · other titles in the series · one or two blank "field notes" pages so the **total is even**.
- Record the final **page count** — everything downstream (gutter, spine, price) depends on it.

### Step 2 — Render the interior
Write `web/books/{slug}/interior.html`:
- `@page { size: {trimW+0.25}in {trimH+0.25}in; margin: 0 }` (page includes bleed; content is positioned inside).
- A `.page` block per page at exactly trim + bleed, with an inner `.safe` box inset by the computed margins (gutter alternates left/right on verso/recto — use `@page :left` / `:right` or a `.verso`/`.recto` class).
- Line-art pages: the asset image `object-fit: contain`, centred, bleeding to the page edge where the art allows.
- Colour-key pages: the greyscale thumbnail + an ordered list of call-outs + the swatch strip + the timing line + the fact, all inside `.safe`.
- Embed fonts; `-webkit-print-color-adjust: exact`.
- **Render to PDF:** `weasyprint web/books/{slug}/interior.html web/books/{slug}/interior.pdf` if available; otherwise open in Chrome → Print → Save as PDF, "Margins: None", "Background graphics: on", paper size = the custom trim+bleed. Verify: page count matches Step 1, no content inside the 0.375 in safe inset, art bleeds cleanly.

### Step 3 — Render the cover
Compute: spine = pageCount × perPageThickness ; coverW = 2×(trimW + 0.125) + spine ; coverH = trimH + 0.25.
Write `web/books/{slug}/cover.html` — one `.cover` at `coverW × coverH`, three zones: back (blurb from the product + a short bio + a barcode-safe clear area bottom-right ~2×1.2 in), spine (title + imprint, only if ≥ 100 pp, 0.0625 in inside the folds), front (title, subtitle, a representative line drawing or a pattern of several, imprint). Use the campaign / imprint design tokens. Render to PDF the same way. One flat PDF, no crop marks (KDP adds them).

### Step 4 — Write the metadata sheet
Write `web/books/{slug}/kdp-metadata.md`:
- **Book title / Subtitle / Series + number / Edition / Author / Imprint / Language.**
- **Description** — ≤ 4000 chars. KDP allows only `<br> <p> <b> <i> <u> <ul> <ol> <li> <h4> <h5> <h6>`. Lead with the hook, then what's inside, then who it's for, then a line about the imprint. Voice per the governance file.
- **7 keywords** — search phrases a buyer types, drawn from the campaign Research keywords + the book's niche; no words already in the title/subtitle (wasted), no competitor brand names, no "book"/"kindle".
- **2 categories** — BISAC paths (e.g. `Games & Activities > Coloring Books`, `Nature > Birdwatching Guides`). Name 2–3 more as alternates to request via KDP support later.
- **Age range / grade** — only if a children's book.
- **Pricing** — for each of US / UK / DE / etc.: chosen list price, KDP's current print cost for this trim+pages+ink, and `0.60 × list − printCost` = royalty. Show the margin. Recommend a list price that clears the target.
- **A+ content** (optional) — 3–5 module copy blocks (a "what's inside" spread, a sample page, the series).
- **Upload checklist** — the exact click-path: KDP → Create → Paperback → the 3 tabs (Details / Content / Pricing), which file goes where, "Print ISBN: Free KDP ISBN" unless a bought ISBN is on file.

### Step 5 — Save the asset back to Notion
Update (or create, via the Notion connector) the **KDP asset** for this book (Assets DB, `Content Strategy` → the book title, `Channel` = `KDP`, `Asset Type` = `listing`):
- `Design Link` → the interior PDF ; `Final Media File` → the cover PDF ; `Body` → the description ; `Etsy Tags` field is fine to reuse for the 7 keywords, or put them in `Notes` ; `Description` → the one-line pitch.
- Paste the full metadata sheet into the asset's page body.
- `Status` → `Ready` (files done, awaiting manual upload). Leave `Asset Status` `Development` until it's live on Amazon, then `Published`.

### Step 6 — Report
Give: the final page count and spine, the 3 file paths, the description, the 7 keywords, the 2 categories, the pricing/royalty table, and the KDP upload click-path. Remind that the upload is manual and KDP review takes ~72 h.

## Notes
- Coloring-book interior = **black ink only** even though the *subject* is colour — the line-art pages and the B&W colour key both print in the cheapest tier. Never set the interior to "colour" for this.
- Keep the page count **even** and ≥ 24. If odd, add or drop a blank back-matter page.
- Re-run after new/updated bird art: the skill overwrites the 3 files; bump the KDP asset and re-upload.
- If `weasyprint` / a headless renderer isn't available, the Chrome "Save as PDF" path is fine — just verify the custom paper size took (some Chrome builds clamp to Letter).
- The ISBN: KDP's free ISBN ties the book to Amazon-only distribution for that ISBN. If the Lulu edition needs wide distribution, buy an ISBN (Bowker) and use the *same* one on both, or use separate free ISBNs per channel.
