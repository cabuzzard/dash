# single-post-canva

Fill one of a hub's fixed Canva single-post templates with the copy the worker already generated, for every pending `single post` asset under a title — copy the template, replace its three text fields, export a PNG, host it, mark the asset Published. This is the Stage-2 render step for the **`single post`** Method (Methods DB `3ca1f7d3a4bb81ffa775e5f3e0426f8a` — read its page body first for the field structure, box budgets, and the content-type definitions).

The worker (`generateTitleAssets` `/single post/i` branch) writes the copy and stamps the chosen template onto each asset; it **cannot** drive Canva. This skill is that second step.

## Trigger phrases
"run single-post-canva", "port the single posts", a direct hand-off from `buildSinglePostCanvaHandoff`, or the dashboard's **📋 Copy Canva handoff** button.

## Prerequisites
- **Canva MCP connected** — `read-design`, `copy-design`, `edit-design`, `export-design`, `get-export-formats`. If not connected, stop and ask the user to connect the Canva connector.
- **Notion connector** — all reads/writes go through it, no PIN needed.
- **Input** — a `buildSinglePostCanvaHandoff` prompt (has the assets inline), or a `titleId` to query for pending assets.

## Constants
Assets DB `e91bdb6e770b4d298e9f62166a0fd5de` · Methods DB `285ed0b668be4dad89dfd090350096bc` · Worker `https://jolly-darkness-5dcc.trailnotes2026.workers.dev`.

## Step 0 — governance
Read `.claude/skills/_content-governance.md` — the voice-fit bar every rewrite must clear (a shorter phrase that reads abstract, mechanical or third-person is not acceptable even if it fits the box).

## Step 1 — gather the batch
From the handoff prompt (assets are listed one JSON object per line) or, with just a `titleId`, query the Assets DB: `Asset Type = "single post"` AND `Content Strategy` contains the titleId AND `Post Image` is empty. For each asset read its `SINGLE POST` fenced json block from the page body — it carries `template` (`url`, `name`), `contentType`, `fields` (`Headline Primary` / `Headline Accent` / `Body`), `altText`, `accent`.

## Step 2 — inspect each distinct template once
A run **cycles through all the hub's templates in order**, so a batch usually spans several. Collect the distinct `template.url` values across the assets and `read-design` each once — cache its three text-element `locator_id`s (dark **Headline Primary**, accent **Headline Accent**, small **Body**) and box sizes. Each asset's `SINGLE POST` block names which template it belongs to.

## Step 3 — per asset
1. `copy-design` the template into a new design. **NEVER edit the original template.**
2. `update_title` the copy to the asset's `Asset Title`.
3. `edit-design` transaction: `replace_text` —
   - `fields["Headline Primary"]` → the dark headline element
   - `fields["Headline Accent"]` → the accent element (leave the accent colour as the template has it)
   - `fields["Body"]` → the body element; if `Body` is `""`, clear that element or leave it empty
4. **Fit the boxes by rewriting, not just trimming.** Budgets: Headline Primary ~25-35 chars / 2-3 lines / no word over ~9 chars; Headline Accent ~15-25 chars / ≤2 lines; Primary + Accent ≤~4 lines total; Body ≤~110 chars / 3-4 lines. If a field overflows, reword it so it still lands the same point AND sounds like the reader — then re-verify.
5. Verify every field on the page thumbnail (`read-design` / `get-design-pages`). Fix overflow or collisions before committing.
6. Commit the transaction.
7. `export-design` the copy as **PNG** (1080×1440). Download the file, base64-encode it.
8. POST to the worker:
   ```
   { "action": "saveSinglePostImage", "token": "<PIN session token>",
     "assetId": "<asset id>", "fileData": "<base64 png>",
     "designUrl": "<the copy's Canva edit url>", "altText": "<the asset's altText>" }
   ```
   This hosts the PNG on the asset's `Post Image`, sets `Design Link`, and flips `Asset Status` to `Publish`.

## Step 4 — report
Per asset: the Canva edit link + the hosted `Post Image` url + status. The caption and hashtags are already on the asset (`Post Caption` / `Notes`). Remind the operator: hand tweaks (spacing / font size) are done in Canva, then re-export and re-run `saveSinglePostImage` for that one asset — it's idempotent (the hosted URL bumps its `?v=`). Posting to Instagram is manual.

## Notes
- One batch per title. Safe to re-run — skip assets that already have a `Post Image` unless the operator asks to force a re-do.
- **Alternative:** if the operator prefers Canva's UI, produce a CSV (`page,field_name,replacement_text`, one row group per asset) for **Canva Bulk Create / Autofill** instead of the `copy-design` loop — same output, manual import. See `.claude/skills/audit-canva-template-csv.md` for the CSV shape.
- Never fabricate a template's structure — if the Canva MCP isn't available or the template URL won't open, stop and say so.
