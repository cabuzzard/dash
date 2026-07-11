# make-video-copy

Model a niche's proven YouTube winners into **original** videos: take a list of seed channels, find their **outlier** videos (~10× the channel's average views), extract *why they won* (packaging + retention structure + topic), then write a fully original script + packaging in the campaign's voice — saved to a Content Strategy title, ready to produce via the Video Creation pipeline.

This is the tool for the **"Video Copy — Growth"** Method (Notion Methods DB → "Video Copy — Growth", id `39a1f7d3a4bb816892a5d3a0de9c6360`). Read that method's framework first — it holds the Outlier Method steps, the YouTube growth rules (packaging + retention), and the originality guardrail.

## ⚠️ Read first — "copy" means MODEL, never reproduce
Model the **structure, packaging, and topic**; never copy the script, footage, or audio. Every output is rewritten from scratch in the campaign voice with original examples and angle. Reuploads, light rewords, compilations, or recycled clips are rejected — in 2026 they get suppressed or terminate the channel. The seed is proof of demand and a structural template, not source material.

## Trigger phrases
"make a video copy", "model this channel", "video copy from these seeds", "run make-video-copy", "find outliers and script one", "copy this youtube niche"

## Inputs
- **seed channel list** — the user supplies it (channel URLs/handles), niche-relevant, ideally 50K–500K subs with steady growth. More seeds = more outliers.
- **campaign** — name or Campaigns-DB page ID (niche, keywords, voice). From a title, read its `Campaign` relation.
- **count** (optional) — how many videos to model this run (default 1–3).

## Constants
- Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Video Copy method `39a1f7d3a4bb816892a5d3a0de9c6360` · Video Creation (render pipeline) method `38f1f7d3a4bb81f790cec004a5d4a423`.

**Auth / data access:** do all Notion reads/writes through the **Notion connector** (the dashboard Worker is PIN-gated). 

## Workflow

### Step 0 — Campaign context (Notion connector)
Resolve the campaign; read its niche, keyword list, Target Audience, and voice/register (Research DB + Campaign page). The rewrite must land in *this* campaign's positioning — not the seed channel's.

### Step 1 — Find the outliers (per seed channel)
For each seed channel, pull its videos with view counts and flag **outliers ≈ 10× the channel's average views** (or clear recent breakouts). Tooling, in preference order:
- **Apify YouTube scraper** (Apify MCP: `search-actors` → a YouTube channel/videos scraper → `call-actor`) — returns videos + views + titles for outlier math.
- **YouTube Data API** (the dashboard worker already holds a `YOUTUBE_API_KEY`; if you can't reach the token-gated worker action from chat, use the API directly with a key, or a small Node script).
- **WebSearch / manual** — search the channel's top videos as a fallback.
Record each outlier's title, view count, view-multiple vs channel average, and URL.

### Step 2 — Extract why it won (packaging + structure)
For each chosen outlier, extract (from title, thumbnail, and transcript if obtainable via an Apify transcript actor):
- **Packaging:** title structure, thumbnail concept (layout / contrast / emotion), hook style, topic angle, and a one-line reason it broke through.
- **Retention structure:** hook length, pacing/sentence rhythm, pattern-interrupt cadence, CTA placement — the formula, not the words.

### Step 3 — Pick the angle / find the gap
Same proven topic, but the campaign's **unique angle** — ideally a topic gap (demand + this campaign's advantage + no definitive content yet). State the angle in one line before scripting.

### Step 4 — Rewrite (fully original)
Write the complete script in the campaign voice: **opening hook → credibility line → main content (with pattern interrupts for retention) → CTA.** Match the *pacing formula* from Step 2, never the sentences. Original examples, data, and POV throughout. Length/format per the seed (long-form vs Short).

### Step 5 — Package
- **Title:** an original title using the modeled structure (write 5 options).
- **Thumbnail concept:** modeled layout/contrast, original art description.
- **SEO:** 200-word description, ~15 tags, 5 hashtags, keyword-rich with the campaign's terms.

### Step 6 — Save to Notion (Notion connector)
Create a Content Strategy page — Title = the video's working title; Status: Development; `Campaign` relation set; `method` → Video Copy — Growth. Body, sectioned: **Script** · **Packaging** (title options + thumbnail concept) · **SEO package** · **"Modeled from"** (seed channel + outlier URL + view-multiple + why it won — the audit trail proving it was modeled, not copied).

### Step 7 — Report + handoff
Give the modeled angle, the script, the packaging, and the "modeled from" provenance. Hand off to the **Video Creation** method's pipeline (Claude → Gemini visuals → voiceover → thumbnail → CapCut assembly) to produce it. Publishing is manual.

## Notes
- **Optimize for retention, not just CTR.** A title/thumbnail the video doesn't deliver bounces viewers in the first 30s and gets ranked *down*. Target CTR 4–7% with real watch time behind it.
- Keep the **"Modeled from" provenance** on every output — it enforces the transformative-not-copied discipline and gives an audit trail.
- Model *packaging and structure*; the substance must be original or it's not this method — it's a reupload, which gets the channel killed.
- Batch: mine several outliers across the seed list in one pass, then rewrite the best few.
