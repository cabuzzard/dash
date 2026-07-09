# make-text-pic

Turn one idea into a **text pic**: a single-slide, ≤~25-word narrative built on a proven, currently-converting hook/story arc, grounded in the campaign's research and audience, and produced as a real Canva image (text over a background in the campaign's design system).

This is the production skill for the **"text pic"** Method (Notion Methods DB → "text pic", id `3981f7d3a4bb81eba7bafea33ab41d51`). That method's page body holds the framework (pillars + arc toolkit); this skill executes one title/idea at a time.

## Trigger phrases
"make a text pic", "text pic from this idea", "produce a text pic", "turn this into a text pic", "run make-text-pic", "text pic for <campaign>"

## Inputs
- **idea** — the raw idea/topic, OR a text-pic title from the Content Strategy DB (required).
- **campaign** — campaign name or Campaigns-DB page ID (required, to pull research/audience/design spec). If the idea came from a Content Strategy title, read its `Campaign` relation.
- **designSpecId** (optional) — which campaign Design Spec to render in. Default: the campaign's attached/first Canva-backed spec.

## Constants
- Worker URL: `https://jolly-darkness-5dcc.trailnotes2026.workers.dev` (POST `{action,...}`; design-spec actions below are NOT token-gated).
- Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1`.

## Workflow (run every step)

### Step 0 — Gather context
- Resolve the campaign ID (from the title's `Campaign` relation via the Notion connector, or from the campaign's microsite `CAMPAIGN_ID`).
- Read, via the Notion connector (avoids the dashboard's expiring session token):
  - **Research** (query Research DB by `Campaign` relation): Statement, Unique Opportunity, Key Message, Keywords, and any TikTok Trends / Trend Intelligence.
  - **Campaign** page: Target Audience, Pain Points, Key Message.
  - If a **product** is linked to the idea/title: its Avatar, Transformation, Objections, Unique Angle.
- Read the campaign's **Design Spec**: POST worker `getCampaignDesignSpecs { campaignId }`. The response's `attachedId` is the **campaign default spec, which applies to every method unless overridden**. Use `designSpecId` if the caller named one at this (publish) stage; otherwise use the campaign default (`attachedId`); if none is set, fall back to the first spec, then a clean built-in default. Keep the chosen spec's `bg / ink / accent / headlineFont / bodyFont / notes`.

### Step 1 — Research a current, converting hook/arc
Use WebSearch to find what's landing *right now* for this topic/angle and audience — e.g. `"<topic>" viral hook 2026`, `"<audience pain>" short form hook that converts`, `<niche> contrarian hook examples`. Note 2–3 hook shapes or story-arc angles that fit the idea (Contrarian Claim, Before-After-Bridge, Problem-Agitate, Open Loop, Struggle→Success, Identity Statement — see the method's Arc Toolkit). Pick the ONE that best fits this idea + audience. Do not copy any found line verbatim — extract the *shape*, then write original copy.

### Step 2 — Write the text pic
Write **one** text pic:
- **Hook line first** (≤~14 words, lands in the first read-second), then at most 1–2 short supporting lines. **≤~25 words total.**
- Built on the chosen arc, in the **campaign's voice**, using the avatar's real language and a real pain/transformation from the research. Specific, not generic motivation.
- Worth screenshotting (save/share intent). End on an open loop or an identity the reader wants to claim.
- Also produce: a 2–4 word **kicker/label** (optional, for a corner), and a one-line **background mood** description that fits the aesthetic.
Show the line(s) to the user before producing the image; iterate if asked.

### Step 3 — Produce the text pic in Canva
Call Canva `generate-design`:
- `design_type: "instagram_post"` (1080×1350 portrait).
- `query`: describe ONE slide — the exact text pic copy overlaid on a background matching the "background mood", in the design spec's aesthetic: background `bg` (or a fitting photographic/textured background with a dark scrim for legibility), text color `ink`, `accent` for the kicker/one small element, `headlineFont` for the hook line, `bodyFont` for supporting text. Include the kicker placement and demand high text/background contrast. Pull "strictly avoid" cues from the spec's `notes`.
- Optionally pass `brand_kit_id` if the user wants it on-brand-kit (ask first; default off so the design spec drives the look).

Review the returned candidates' thumbnails, pick the best legible on-aesthetic one (or let the user choose), then `create-design-from-candidate { job_id, candidate_id }` → capture `design_summary.urls.edit_url`.

### Step 4 — Save back to Notion
- If the idea was an existing **Content Strategy title**: append the final text-pic copy + the Canva edit link to that title's page body (Notion connector), and move its Status to Writing/Review as appropriate.
- If it was a **raw idea**: create a Content Strategy page (Title = a short version of the line or the idea), Status: Development, `Campaign` relation set, `method` → the text pic method, body = the copy + Canva link.
- Optionally also log an SM Posts draft (Platform: Instagram, Status: Draft) with the copy.

### Step 5 — Report
Give: the final text-pic copy, which arc/hook it used and *why it fits this audience*, the Canva edit link, and where it was saved in Notion. Remind that posting is manual.

## Notes
- One idea per text pic. If the idea needs two beats, it's a carousel — hand it to `make-carousel` instead.
- Legibility is non-negotiable: if the background is busy, insist on a scrim/overlay so the hook line reads instantly.
- `generate-design` only makes candidates; nothing saves to the account until `create-design-from-candidate`.
- If Canva returns "Missing scopes", ask the user to disconnect/reconnect the Canva connector.
- Never lift a found hook line verbatim — the research gives you the *shape* and what's resonating, not the words.
