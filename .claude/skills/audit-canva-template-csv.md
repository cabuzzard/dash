# audit-canva-template-csv

Inspect a specific, already-designed Canva carousel template and produce a complete, CSV-ready inventory of every text field in it — exact current text, character length, style notes, and polished replacement text per field — so that exact template can be repopulated programmatically via Canva's Bulk Create / Autofill, field-for-field.

This is the render step for the **"carousel — Template CSV Export" Method** (Methods DB — read its page body first for the Growth Strategy/angle grounding and the front-cap/middle/end-cap page-role rules below, same as every other method-driven skill here).

## Trigger phrases
"audit this canva template", "make a CSV from this template", "run audit-canva-template-csv", or a direct hand-off naming this skill specifically.

## Prerequisites
- **Canva MCP connected** — `read-design` (or equivalent inspection tool) must be available to actually see the attached template's pages/elements. If not connected, stop and tell the user to connect the Canva connector rather than guessing at a template's structure from a description.
- **Notion connector** — all reads/writes here go through it, no PIN needed (chat-only skill, same as every other production skill in this repo).

## Inputs
- **The Canva template itself** — attached/shared in this chat session (a design ID or link the Canva MCP tools can open). Without it, stop and ask for it; never fabricate a template's structure.
- **titleId** (optional) — a Content Strategy title's Notion page ID to save the audit/CSV into. If invoked ad-hoc with just a template and no title, produce the two output sections directly in chat instead of writing to Notion.
- **campaignId** (optional) — for Growth Strategy grounding, if a title/campaign context exists.

## Constants
Methods DB `285ed0b668be4dad89dfd090350096bc` (this method's page: `3b81f7d3a4bb81ff95a4c8c700a85eaf`) · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Assets DB `e91bdb6e770b4d298e9f62166a0fd5de`.

## Step 0 — Classify every page's role before auditing fields
Before inventorying text fields, walk the template page-by-page and classify each one:
- **`front-cap`** — the opening/cover page. Always exactly one. Structurally fixed — every carousel built from this template keeps it as-is in position and role.
- **`end-cap`** — the closing/CTA page. Always exactly one. Also structurally fixed.
- **`middle`** — every page between the two caps. This is a **repeatable pattern, not a fixed count**. The reference template shows one example number of middle pages, but real generations can have **more or fewer** than that — driven entirely by how much content the Growth Strategy/title calls for, not by how many happen to exist in this one reference copy.

Record each field's page role alongside its Page number in the inventory (add it to Style Notes if there's no dedicated column, e.g. `[front-cap]`, `[middle]`, `[end-cap]`). For `middle` pages specifically, write the field inventory as a **reusable pattern keyed by field role**, not a hardcoded page-by-page list — downstream generation needs to know "a middle page has a Headline, a Body, and a Number Badge," not just "page 3 has these exact three fields," so it can be stamped out N times.

## Step 1 — Full text-field audit
Inspect every page in the template via the Canva MCP tools. Then, exactly as follows:

Your job is to inspect the entire template and produce a complete, CSV-ready inventory of every text field in the design, including nested or grouped text items.

IMPORTANT:
- Inspect every page in the template.
- Do not skip any text, even tiny labels, numbers, captions, footers, CTA text, or repeated UI text.
- If a visible text element is made of multiple text boxes or styled segments, break it down clearly.
- If a title has different colors, weights, or styles within the same visual item, treat it as one parent text item with child sub-boxes listed underneath.
- If the template contains repeated elements across pages, include each occurrence or clearly mark repetition.
- If any field is too long, shorten replacement text elegantly while preserving meaning.
- Do not leave any provided text field blank.
- Do not ask questions about the template's content — make your best visual interpretation. (Exception: if the template itself was never actually attached/shared, stop and ask for it — that's a missing input, not an ambiguous call.)

Your output must include two things:

1) A full text-field audit
2) CSV-ready replacement content for every field

For each text field, identify:
- Page
- Field name
- Parent group
- Nesting level
- Exact visible text
- Character length
- Style notes (include the page role from Step 0 here: `[front-cap]`, `[middle]`, or `[end-cap]`)
- Replacement text

Field naming guidance:
Use practical names such as:
- Headline
- Subheadline
- Body Copy
- CTA
- Label 1
- Label 2
- Number Badge
- Footer Note
- Navigation Text
- Side Caption
- Quote Text
- Statistic
- Section Title

If the template already implies a role, use that. If not, infer the most practical name based on placement and function.

Nesting guidance:
- 0 = standalone text field
- 1 = child segment inside a grouped text item
- 2 = deeper nested segment if needed

If a visual title is composed of multiple styled parts, represent it like this:
- Parent field = the full logical text item
- Child fields = each styled, colored, or separately formatted segment inside it

Character length rules:
- Count all visible characters exactly, including spaces and punctuation
- Include numbers and symbols
- Be consistent
- If there are line breaks, count them consistently

Replacement content rules:
- Write polished content that fits the template's purpose, tone, and layout
- Ground replacement text in the title's actual Growth Strategy/angle (if a titleId/campaignId was given) rather than writing generic filler — this is the "preserve original flow" step of the strategy → method → template pipeline; some shape will be lost fitting a rigid template, but the content should still read as this specific title's angle, not a placeholder
- Keep replacement text within the available space
- Preserve the template's hierarchy and visual rhythm
- Keep repeated elements consistent unless the template clearly varies them
- If the template suggests a sequence, carousel, or multi-page system, make the pages feel coherent
- If a field is obviously part of a multi-part heading or stylized title, preserve that structure in the replacement content
- For `middle`-role fields specifically: write the replacement content as one representative instance of the repeatable pattern (or as many instances as the title's actual content calls for, per Step 0) — don't assume the reference template's middle-page count is the required output count

## Step 2 — Output format
Return your answer in exactly two sections.

SECTION A — TEXT FIELD INVENTORY
Provide a table with one row per text field and these columns:

Page | Field ID | Field Name | Parent Group | Nesting Level | Exact Visible Text | Character Length | Style Notes | Replacement Text

SECTION B — CSV
Then provide a clean CSV using the same row structure and this exact header:

page,field_id,field_name,parent_group,nesting_level,exact_visible_text,character_length,style_notes,replacement_text

Rules for the CSV:
- Make it clean and import-ready
- Do not add markdown explanations around the CSV
- Do not omit any fields
- Do not summarize loosely
- Do not invent text that is not supported by the template's structure
- If a field appears on multiple pages, include each occurrence
- If a field is nested, preserve the nesting in both the table and the CSV

Final quality check before responding:
- every page checked
- every text box included
- nested text separated correctly
- character counts filled in
- replacement text present for every field
- CSV complete and clean
- page role (`front-cap`/`middle`/`end-cap`) captured for every row
- no extra commentary outside the two sections

## Step 3 — Save the result to Notion
If a `titleId` was given:
- Save both Section A (as a table or formatted list) and Section B (as a code block, language `csv`) into the title page's body via the Notion connector, under headings `## Template Field Audit` and `## CSV`.
- Upsert an Assets DB record (same non-duplicating pattern as `make-carousel`'s Step 5 — check for an existing, non-archived record first): `Asset Title` = the carousel's working title, `Asset Type` = "carousel", `Content Strategy` relation → titleId, `Campaign` relation → campaignId, `Body` = the CSV content, `Status` = "Ready", `Asset Status` = "Publish".
- Set the title's own `Status` to "Publish" once the CSV is finished, same as `make-carousel`.

If no `titleId` was given (ad-hoc template audit), just return the two sections in chat — nothing to save.

## Step 4 — Report back
- Which page was classified `front-cap`/`end-cap`, and how many `middle` pages the reference template showed (making clear that count is an example, not a requirement)
- The CSV, ready to paste into Canva Bulk Create / Autofill
- The Notion title/asset link, if saved
- Remind: importing the CSV into Canva and reviewing the populated design is a manual step — nothing here auto-publishes

## Notes
- **This is the reverse-engineering path, not the generic slide-copy path.** For carousels that don't need to match one specific pre-built Canva template exactly, use the "carousel — Growth" method's tools (`make-carousel` skill or the dashboard's Generate Carousel Asset Package) instead — those are far less rigid and support 4 flexible structural styles (Triple Hook, Curated Collection, Hidden Potential, Numbered Breakdown).
- **Never fabricate template structure.** If the Canva MCP tools aren't available or the template wasn't actually shared, stop and say so rather than guessing at fields that were never inspected.
