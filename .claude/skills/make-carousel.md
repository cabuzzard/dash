# make-carousel

Research what's trending, write original slide copy, save that copy into the Content Strategy title's own Notion page (so it's readable and editable there), build a real multi-slide **Canva** design from it, merge it into one design, and log the Canva link back to Notion. Re-running this on a title that already has slide copy rebuilds the Canva design from whatever's currently in Notion — edit the slides in Notion, run this again, get an updated Canva design.

**⚠️ This is no longer the dashboard's default carousel path.** The Generate Assets modal's carousel button now calls the Worker action `generateCarouselPreview` directly — it writes the same slide-script format to the title, but renders real PNGs via Cloudflare's Browser Rendering REST API and hosts a preview page on GitHub Pages, entirely inside the Worker, no chat tab needed. That's the one-click path for "give me something to look at and approve." Reach for **this** skill instead when a real, further-editable **Canva file** is specifically wanted (manual touch-ups, brand-kit application, exporting in a format the Worker's PNG renderer doesn't support) — both write the identical slide-script block format to the title page, so either one can pick up where the other left off.

This is the render step for the **"carousel" Method** (Methods DB — read its page body for the campaign's Growth Strategy / arc before writing copy, same as every other method-driven skill here).

## Trigger phrases
"make a carousel in canva", "build this carousel in canva", "make a real canva carousel", "run make-carousel", or a direct hand-off naming this skill specifically (the dashboard's default carousel button no longer routes here — see the boundary note above).

## ⚠️ Boundary — why this isn't a dashboard button
The Worker has no Canva access — Canva's own public API can't create styled designs without a Canva Enterprise subscription (confirmed against Canva's docs: the Autofill API, the only way to programmatically populate a template with real text/fonts/colors, requires it; the non-Enterprise "Create design" endpoint only makes blank designs). The Canva MCP tools available in a live Claude chat aren't bound by that same restriction. So a *real Canva file* specifically still requires this chat-only skill — but a rendered preview for approval doesn't, which is why that path moved to the Worker.

## Prerequisites
- **Canva MCP connected** — `generate-design`, `create-design-from-candidate`, `merge-designs` must be available. If not, stop and tell the user to connect the Canva connector rather than improvising a substitute (no local-render fallback — that's the point of retiring the old quick-build path).
- **Notion connector** — all reads/writes here go through it, no PIN needed (chat-only skill, same as every other production skill in this repo).

## Inputs
- **titleId** — the Content Strategy title's Notion page ID (from the dashboard hand-off, or resolved by name/search if invoked ad-hoc from chat).
- **campaignId** — for Research DB / Design Spec grounding.
- If invoked with a bare topic and no title exists yet, create the Content Strategy title first (Status: Development, Method: carousel) before proceeding — everything else here assumes a title page to read/write against.

## Constants
Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Design Specs DB `3981f7d3a4bb817c8edad15db64fa50d` · Assets DB `e91bdb6e770b4d298e9f62166a0fd5de` · Methods DB `285ed0b668be4dad89dfd090350096bc` (carousel method page: `3981f7d3a4bb81528824c30b891ef157`).

## Workflow

### Step 0 — Check for existing slide copy on the title (this decides fresh vs. regenerate)
Fetch the title page's body via the Notion connector. It uses a fixed block structure — a `heading_3` "Slide N (N/total)" followed by a bold paragraph (headline) and a plain paragraph (body), repeated per slide, then a `Caption` heading and a `Hashtags` heading. This is the exact structure the dashboard's own carousel tooling reads and writes, so staying compatible with it means slide copy is always editable from Notion regardless of which path (this skill, or the dashboard) touched it last.

- **If slide content already exists:** default to **regenerate mode** — treat the current Notion text as final and skip straight to Step 3 (Canva build). This is the "I tweaked it in Notion, rebuild Canva" loop — don't re-research or rewrite unasked. Ask exactly one clarifying question only if it's genuinely ambiguous whether the user wants a fresh angle instead ("Rebuild Canva from the current slide text on this title, or do a fresh research + rewrite pass first?"); otherwise just proceed with what's there.
- **If no slide content exists:** this is a **fresh build** — continue to Step 1.

### Step 1 — Research trending content (fresh build only)
- Read the campaign's Research DB record (Campaign relation) for a "TikTok Trends" / "Trend Intelligence" field first. If present and recent, use it as primary source and skip live search.
- Otherwise, WebSearch what's currently resonating on the topic — queries like `"<topic>" tiktok trending`, `"<topic>" instagram carousel viral`, `"<topic>" reels hook`.
- Pull 5-8 real top-performing posts. Note **hook style, angle, structure only** — never verbatim wording, this is inspiration not source material.
- Pick the single most resonant angle given what's trending right now, and given the campaign's own Pain Points / Key Message / Unique Opportunity (Research DB / Campaign page).

### Step 2 — Write the slide script and save it to Notion (fresh build only)
Read the "carousel" method's page body for the Growth Strategy arc, and the campaign's Design Spec (colors/fonts) if one exists — ground the copy in both rather than writing generic content.

Write, all original (rewritten from the researched angles, never lifted):
- **Slide 1 (hook):** short punchy headline + one-line subtext
- **Slides 2-6 (insights):** 5 slides, each a short headline + 2-3 sentence body — real substance, not placeholders
- **Slide 7 (CTA):** quote/summary headline + save/follow/next-step prompt as body
- **Caption:** 150-200 words, campaign keywords worked in naturally for SEO
- **Hashtags:** 8-10, no `#` needed in the stored text

Save this into the title page's body using the Notion connector, in the exact block structure described in Step 0 (`heading_3` "Slide N (N/7)" → bold-paragraph headline → plain-paragraph body → divider, repeated, then `Caption` and `Hashtags` headings). Replace any existing body content on this title with this — it's a fresh build, so old content (if any) has already been ruled out in Step 0.

### Step 3 — Generate slides in Canva
Using whichever slide text is now current (either just written in Step 2, or the pre-existing Notion content in regenerate mode) and the campaign's Design Spec (fall back to editorial-minimal — warm cream background, thin serif font, delicate botanical accent, no photography/faces/loud color — only if no spec exists):
- Call `generate-design` (design_type: instagram_post) for all 7 slides — these calls are independent of each other and can run in parallel.
- Pick the best candidate from each (match the design spec / editorial-minimal aesthetic).
- Call `create-design-from-candidate` to save all 7 as real editable Canva designs.

### Step 4 — Merge into one design (always)
The Canva merge API only accepts **one operation per call** — don't try to batch multiple `insert_pages` into a single request, it will be rejected. Run these sequentially:
- `merge-designs` type: `create_new_design`, one `insert_pages` operation for slide 1.
- `merge-designs` type: `modify_existing_design`, one call per remaining slide (2 through 7), each `insert_pages` with `after_page_number` set to the current last page.
- Result: one multi-page Canva design ready to open and publish. Save the merged design's `edit_url`.
- If the final page count isn't 7, warn the user — a source slide likely had multiple pages.
- **This tool requires explicit user confirmation before every call, by the tool's own built-in policy** — not a choice this skill makes, and not something a prompt instruction can bypass. Everything else in this workflow (research, writing, generating slides, logging to Notion) runs straight through without stopping; this is the one unavoidable checkpoint. Ask once, covering the whole merge sequence ("about to merge these 7 slides into one design — proceed?"), not once per call.

### Step 5 — Log the result to Notion (upsert, don't duplicate — and set BOTH records to Publish)
Check the Assets DB for an existing record linked to this title (`Content Strategy` relation contains titleId, `Asset Type` = "carousel"). **Before reusing a match, confirm it isn't archived/deleted** (a `fetch` on a deleted page returns it flagged `deleted` in the result) — an archived record can't be edited ("Can't edit block that is archived" is the error if you try). If the existing record is archived, or none exists, create a fresh one instead of erroring out. Update it if found and live (this is what makes regenerate-mode non-duplicating — same asset record, new Design Link every rebuild):
- **Asset Title:** the carousel's working title
- **Asset Type:** "carousel"
- **Content Strategy:** relation → titleId
- **Campaign:** relation → campaignId
- **Design Link:** the merged Canva `edit_url`
- **Status:** "Ready" — the Assets DB `Status` select has no "Publish" option (only Draft/Ready/Live/Needs Revision); "Ready" is the correct value for "finished, waiting to post."
- **Asset Status:** "Publish" — this select DOES have "Publish" (ready to post — not auto-published, see Notes).
- **Body:** the caption
- **Notes:** the hashtags
- **Platform Name:** "Instagram" (or whatever the title/method specifies)
- If Grade Score/Grade Notes are already set on the record from a prior failed text-concept attempt, clear them — they describe a draft that no longer exists, and leaving them makes a finished, published-status asset look like it's still failing QA.

**Also update the Content Strategy title itself** (not just the Asset) — set its `Status` property to `"Publish"` too. A finished carousel should read as done at both the title level and the asset level; don't leave the title sitting in `Development` once a real design exists for it.

### Step 6 — Report back
- Which trending posts/angles inspired this carousel (fresh build) or that this was rebuilt from existing Notion content (regenerate)
- The merged Canva design link — ready to open and publish
- The Notion asset link
- Caption + hashtags ready to paste
- Remind: **to revise, edit the slide text on this title in Notion and run make-carousel again** — it rebuilds Canva from those edits rather than starting over
- Remind: posting to Instagram is manual — no auto-posting exists in this repo. Asset Status is "Publish" (ready), not "Published".

## Notes
- **No competing carousel path.** The dashboard's Generate Assets modal used to offer three different things for a carousel method (a text-only concept, a local canvas-render-and-download tool, and this skill) — that's been retired down to just this skill being the one recommended action, specifically because doing three different half-measures was more confusing than doing one thing completely.
- **Regenerate is the default once slide copy exists.** Don't re-research or rewrite copy that's already there unless explicitly asked to — the entire point is that editing in Notion and re-running should be cheap and predictable.
- **Run straight through.** Once triggered, this should complete end-to-end — research through Notion logging — without pausing to check in, except the one Canva-enforced merge confirmation in Step 4. That's the whole point of this being "the one carousel path" instead of a back-and-forth.
