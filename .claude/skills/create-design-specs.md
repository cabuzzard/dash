# create-design-specs

Create up to 3 **researched, Canva-backed design specs** for a campaign: study the campaign's research, derive 3 distinct visual directions, generate a real sample Canva design for each, and save them as Design Spec records so they appear as choices in the campaign's Design field and in the Build Carousel modal on the dashboard.

## Trigger phrases
"create design specs", "generate design specs for <campaign>", "make canva design specs", "design specs for <campaign>", "give me design directions for <campaign>", "run the design spec skill"

## Why this is a skill (not a dashboard button)
The dashboard "▶" button (worker action `generateCampaignDesignSpecs`) can only produce the *text* side of a spec — name, colors, fonts, aesthetic notes, and a Canva template-**search** link — because the Cloudflare Worker has no Canva access. Creating a real Canva **design** requires the Canva MCP, which is only available here in chat. So this skill does the Canva half and writes the real design links back onto the spec records. Both halves land in the same Notion "🎨 Design Specs" database, so the dashboard lists them together automatically.

## Inputs
- **campaign** — campaign name or Campaigns-DB page ID (required). If only a name is given, resolve the ID (see Step 0).
- **count** — how many specs (default 3, max 3 per run to keep it fast).
- **brandKit** (optional) — if the user wants the designs on their Canva brand kit, call `list-brand-kits` and use the chosen `brand_kit_id` in `generate-design`. Default: omit it, so each design reflects the spec's own colors/fonts rather than the global brand kit.

## Constants
- Worker URL: `https://jolly-darkness-5dcc.trailnotes2026.workers.dev`
- Design Specs DB: `3981f7d3a4bb817c8edad15db64fa50d`
- All worker calls below are POST `{ action, ...args }` to the Worker URL. None of these design-spec actions are token-gated, so no PIN/session token is needed.

## Workflow (run every step)

### Step 0 — Resolve the campaign
If given a name, find the campaign's page ID. Fastest: the campaign's microsite `index.html` in `microsites/<deploy-path>/` has `const CAMPAIGN_ID = "..."`. Or query the Campaigns DB by name via the Notion MCP. Confirm the ID before continuing.

### Step 1 — Ensure 3 researched specs exist
POST `getCampaignDesignSpecs { campaignId }`. Count specs whose `canvaLink` does NOT contain `/d/` (i.e. not yet Canva-backed — a template-search link or empty counts as un-backed).
- If there are already ≥ `count` un-backed specs, hydrate those (skip to Step 2).
- Otherwise POST `generateCampaignDesignSpecs { campaignId }` once. This reads the campaign research and creates 3 fresh researched specs (distinct aesthetics, real colors/fonts/aesthetic notes). Then POST `getCampaignDesignSpecs { campaignId }` again to get their full details.

Pick the `count` specs to work on (prefer the freshest un-backed ones). Each spec object has: `id, name, bg, ink, accent, headlineFont, bodyFont, notes` (aesthetic description), `canvaLink`.

### Step 2 — Generate a real Canva design per spec
For EACH selected spec, call `generate-design` (Canva MCP):
- `design_type: "instagram_post"` (1080×1350 portrait, the carousel slide ratio).
- `brand_kit_id`: only if the user opted into a brand kit.
- `query`: a detailed prompt built from the spec — include the campaign name + who it's for (1 line of positioning), the spec **name** as the "design direction", the exact hex colors (`bg` as background, `ink` as text, `accent` used sparingly), the `headlineFont`/`bodyFont` by name, a representative sample **headline** and 1–2 line body drawn from the campaign's angle, a small slide counter "01 / 07" in the accent color, and an explicit "strictly avoid" list pulled from the spec's aesthetic notes (e.g. "no rounded corners, no pastels, no hero-pose photography"). The prompt should describe ONE representative slide that establishes the system — not a full 7-slide carousel.

`generate-design` returns a `job.id` and `job.result.generated_designs[]`, each with `candidate_id`, `url`, and `thumbnail.url`. Show the user each candidate's thumbnail and either pick the best automatically (the one that best matches the hex palette and typography) or let them choose.

### Step 3 — Save the chosen candidate as a real design
Call `create-design-from-candidate { job_id, candidate_id }`. It returns `design_summary.urls.edit_url` (and `view_url`). That `edit_url` is the real Canva design link.

### Step 4 — Write the Canva link back onto the spec
POST `updateDesignSpec` with the spec's EXISTING fields plus the new link — **you must resend every field**, because `updateDesignSpec` overwrites and any omitted field is blanked:
```
updateDesignSpec {
  id, name, bg, ink, accent, headlineFont, bodyFont, notes,   // all unchanged, resent verbatim
  canvaLink: <edit_url from Step 3>
}
```

### Step 5 — Report
For each spec, give: name, the color/font summary, and the clickable Canva edit link. Remind the user the specs now show in the campaign's **Design** field (icons — the Canva-backed ones show a ↗ and open the design) and as chips in the **Build Carousel** modal's spec picker, so they can pick one when building any development title's carousel.

## Notes
- `generate-design` creates candidates only; nothing is saved to the user's account until `create-design-from-candidate`. So generating and discarding costs nothing.
- Each spec is ONE representative sample slide (a style reference / starting point), not the finished carousel. The finished per-title carousel is a separate flow (the Build button renders slides in-browser, or the `make-carousel` skill builds the full multi-page Canva design).
- If `generate-design` errors with "Common queries will not be generated", the prompt is too generic — add more concrete detail (specific headline text, exact hex values, explicit layout).
- If any Canva call returns "Missing scopes: [...]", tell the user to disconnect and reconnect the Canva connector to mint a token with the needed scope.
- Do NOT blank a spec's other fields: always resend name/bg/ink/accent/fonts/notes in `updateDesignSpec`.
- Running the skill again creates additional specs only if there aren't already enough un-backed ones — it prefers hydrating existing specs over piling up duplicates.
