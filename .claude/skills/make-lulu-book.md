# make-lulu-book

Produce a book for **Lulu print-on-demand** and, unlike KDP, **publish it programmatically** via Lulu's Print API — create the print-ready project, list it to a Lulu storefront / Lulu Direct, and optionally submit it to Lulu Global Distribution (retail, incl. Amazon; that submission is still human-reviewed by the retailers).

This is the production skill for the **"lulu print"** Method (Notion Methods DB → "lulu print", id `3cc1f7d3a4bb81ad9f27ce2bb4c1b8da`). It **reuses the interior + cover assembly from `make-kdp-package`** — only the page specs, the spine math, and the publish step differ.

- Lulu account: <https://www.lulu.com/>
- Lulu Print API docs: <https://developers.lulu.com/>
- Lulu Direct (sell from your own site): <https://www.lulu.com/sell>

## Trigger phrases
"make the Lulu book", "publish to Lulu", "run make-lulu-book", "Lulu print edition for <book title>", "push <book> to Lulu"

## Inputs
- **title** — the Content Strategy book title (the pillar). Required.
- **mode** — `files` (produce the PDFs + the API payload, don't call Lulu) or `publish` (also call the Lulu API to create the project / storefront product). Default `files` until the account exists.
- **trim / interior / paper** — same options as `make-kdp-package`; defaults `8.5x11` / `bw` / white.

## Constants
- Same Notion DB IDs as `make-kdp-package`. Output folder `web/books/{slug}/` — files suffixed `-lulu` (`interior-lulu.pdf`, `cover-lulu.pdf`) so they sit beside the KDP files.
- **Auth:** Notion via the connector (no PIN). **Lulu API:** OAuth2 client-credentials — needs a **client key + secret** from the Lulu account (Account → Developer). Store as operator secrets `LULU_CLIENT_KEY` / `LULU_CLIENT_SECRET` (and `LULU_ENV` = `sandbox` | `production`). **In `publish` mode, if these are not set, stop and ask the user to add them.**

### Lulu print specs (verify against the Lulu doc / cover calculator at publish time)
- **Bleed:** 0.125 in on all outside edges. **Safety margin:** keep text/important art ≥ 0.5 in from every trim edge.
- **Interior:** for a coloring book use **standard black-and-white, 60# (90 gsm) white, perfect-bound**. Lulu's `pod_package_id` encodes trim + colour + paper + binding — pick the one matching `0850X1100BWSTDPB060UW` (8.5×11, B&W, standard, perfect-bound, 60# white) or the current equivalent from the API's package list.
- **Spine:** **do not reuse the KDP spine number** — Lulu's stock is thicker. Use Lulu's **cover-dimension calculator** or the API's cover-template endpoint with the final page count to get the exact full-wrap size + spine.
- **Cover:** one flat PDF at the calculator's dimensions, no crop marks (Lulu adds them). Same three-zone layout as the KDP cover.
- **Page count:** even, Lulu minimum 32 for perfect binding (24 for saddle-stitch, not used here).

## Workflow

Read `.claude/skills/_content-governance.md` first.

### Step 1 — Build the book content
Run **`make-kdp-package` Steps 0–1** to gather the book title, its per-page entries + line-art assets, the Research keywords, and the product fields, and to produce the page plan and final page count. Stop if any per-page art is missing.

### Step 2 — Render the Lulu interior + cover
- Interior: same `interior.html` layout as `make-kdp-package` Step 2, but with the **0.5 in safety margin** and Lulu's bleed. Render to `web/books/{slug}/interior-lulu.pdf` (`weasyprint`, or Chrome → Save as PDF).
- Cover: get the exact full-wrap width/height/spine from Lulu's cover calculator (or `GET` the API cover template for the chosen `pod_package_id` + page count). Write `cover-lulu.html` at those dimensions, render to `cover-lulu.pdf`.
- Validate against Lulu's file-spec checklist: single PDF each, fonts embedded, images ≥ 300 dpi, no crop marks, RGB or CMYK per the doc.

### Step 3 — Metadata + pricing
Write `web/books/{slug}/lulu-metadata.md`:
- Title / subtitle / author / imprint / language / category / description (Lulu allows plain text + basic HTML) / keywords.
- `pod_package_id` chosen, page count, trim, binding, paper.
- **Pricing:** Lulu shows the **print cost** for the package + page count; set the **list price** and compute revenue = list − print cost − Lulu's marketplace fee (storefront) ; for Lulu Direct off the hub, revenue = list − print cost − payment fees.
- If Global Distribution: the wholesale discount (default 30%) and the resulting retail margin.

### Step 4 — Publish (mode = `publish` only)
Using `LULU_CLIENT_KEY` / `LULU_CLIENT_SECRET`:
1. `POST /auth/realms/glasstree/protocol/openid-connect/token` (client_credentials) → bearer token.
2. Upload the interior + cover PDFs (the API takes public URLs — host the PDFs under `web/books/{slug}/` so they're on GitHub Pages, or use Lulu's file-upload endpoint).
3. `POST /print-jobs/` (or the storefront/product endpoint) with `pod_package_id`, page count, the two file URLs, quantity, and the shipping address (for a proof) — **start with a single proof copy**, not a live listing.
4. On proof approval: create the **storefront product** (title, description, price, cover thumbnail) → capture the product URL.
5. Optional: submit to **Global Distribution** (needs an ISBN — Lulu can assign a free one, Amazon-adjacent; or supply a bought ISBN). Capture the submission status.

### Step 5 — Save the asset back to Notion
Update the **Lulu asset** for this book (Assets DB, `Content Strategy` → the book title, `Channel` = `Lulu Print`, `Asset Type` = `listing`):
- `Design Link` → interior-lulu.pdf · `Final Media File` → cover-lulu.pdf · `Product Link` → the Lulu storefront URL (once published) · `Body` → the description.
- Page body: the full `lulu-metadata.md` + the `pod_package_id`, print-job/product IDs, and distribution status.
- `Status` → `Ready` in `files` mode, `Live` once the storefront product is up. `Asset Status` → `Published` when live.

### Step 6 — Report
Give: page count + Lulu spine, the file paths, the pricing/revenue math, and — in `publish` mode — the print-job ID, the proof-order status, and the storefront URL. Remind that a proof copy should be ordered and checked before the listing goes live, and that Global Distribution review takes weeks.

## Notes
- `files` mode needs no Lulu account — use it now to have the PDFs + payload ready; switch to `publish` once the account + API keys exist.
- Keep the KDP and Lulu editions in sync on content but **separate on spine and cover dimensions** — the paper stock differs.
- ISBN: one bought ISBN (Bowker) used on both editions keeps them as one work in library systems; free per-channel ISBNs are simpler but split the record. Decide before either edition is submitted to distribution.
- The t-shirt / gift-card side of LBB is a different pipeline — Printify MCP + the `t shirt` method — not this skill.
