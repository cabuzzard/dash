# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a static GitHub Pages site (`cabuzzard/dash`, hosted at `https://cabuzzard.github.io/dash/`) backed by a **Cloudflare Worker** that proxies all Notion API calls and handles auth.

```
dash/
├── index.html                          # Main Hermes dashboard (all campaigns, logins matrix)
├── microsites/
│   ├── style.css                       # Shared admin microsite styles
│   ├── microsite-index.html            # STALE — not the real sync source, see below
│   ├── hard-grind/index.html           # ACTUAL sync source (sync_microsites.py TEMPLATE)
│   ├── sync_microsites.py              # Propagates hard-grind/index.html to every {deploy-path} below
│   └── {deploy-path}/index.html        # Per-campaign admin microsite (copy of hard-grind)
├── productsites/
│   ├── operator-resilience-intensive/index.html  # ACTUAL sync source (sync_productsites.py TEMPLATE)
│   ├── sync_productsites.py            # Propagates that file to every {product}/index.html below
│   └── {product}/index.html            # Per-product admin page (copy of the template above)
├── web/
│   └── {deploy-path}/index.html        # Public-facing live campaign pages
├── docs/
│   └── methods-titles-assets.md        # How the Methods/Titles/Assets modals + generation routing work
└── worker/
    ├── worker.js                        # Cloudflare Worker (single file, all actions)
    └── wrangler.toml                    # Worker config (name: jolly-darkness-5dcc)
```

**Editing a microsite or product-site template:** always edit `hard-grind/index.html` or
`operator-resilience-intensive/index.html` respectively (the real sync sources), then run the matching
`sync_*.py` script to propagate. Editing `microsite-index.html` directly does nothing — it's disconnected
from the sync pipeline despite the name.

**Deploys are automatic**: pushing to `main` triggers `.github/workflows/deploy-worker.yml` (on
`worker/**` changes) and `.github/workflows/deploy-bluehost.yml` (on `web/**` changes, per the mapping in
`.github/bluehost-sites.tsv`). `microsites/` and `productsites/` are plain GitHub Pages content — no
separate deploy step, they're live as soon as the push lands.

**Content generation system** (Methods → Titles → Assets, the "Add Methods"/"Generate Titles"/"Produce
Assets" modals, and why there are several different generation code paths depending on method type): see
`docs/methods-titles-assets.md`.

## Cloudflare Worker

**URL:** `https://jolly-darkness-5dcc.trailnotes2026.workers.dev`
**Account:** trailnotes2026@proton.me
**Deploy:** `cd worker && npx wrangler deploy` (Wrangler 4.84.1)

All secrets are set via `wrangler secret put` and never hardcoded:
- `NOTION_TOKEN` — Notion integration token
- `PIN` — 4-digit admin access code
- `HMAC_SECRET` — signs/verifies session tokens
- `TURNSTILE_SECRET` — Cloudflare Turnstile verification key

**PowerShell pipe caveat:** always `.trim()` secrets read from `env.*` — PowerShell pipes add a trailing newline.

### Auth Flow
1. Admin pages POST `{ action: 'auth', pin }` → worker returns `{ token }` (HMAC-SHA256, 8hr expiry)
2. Token stored in `sessionStorage` as `hermes_token`
3. All subsequent calls include `token` in body; worker verifies via `verifyToken()`
4. Public lead forms use Cloudflare Turnstile (`tsToken`) — no session token needed

### Worker Actions (key ones)
- `auth` — verify PIN, return HMAC token
- `submitLead` — write lead to Leads DB (validates `fraudType` against allowlist)
- `getResearch` — fetch Research record linked to a campaign
- `getTitles` — Content Strategy titles by stage/campaign
- `getCampaignTodos` / `createTodo` / `unlinkTodoFromCampaign` — Main TD tasks
- `getLogins` / `getPlatforms` / `createLoginFull` / `updateLoginFull` — Logins × Platforms
- `createCampaign` — add a new campaign page in Campaigns DB
- `updateResearch` / `updateCampaignKeywords` / `updateCampaignField` — Notion writes
- `updateTitleStage` — move a content title to a new stage
- `condense` — call Claude (Haiku) to summarize research fields for display

CORS is locked to `https://cabuzzard.github.io` only.

## Notion Databases

All core databases live directly under 🏠 Home (`3431f7d3a4bb80378e64ce26578d007f`):

| Database | ID |
|---|---|
| Campaigns | `087b1163b4e64975bc7a4b686ff801de` |
| Content Strategy | `9fa5f42f010b47e7a82032607e07d6a1` |
| Products | `e92fcfce75fc4f54b553df0b7672ff48` |
| Main TD | `3471f7d3a4bb80de87c1d9e850f4a426` |
| Methods | `285ed0b668be4dad89dfd090350096bc` |
| Logins | `72d262278a4c4786b375959432fdd82a` |
| Platforms | `8248b700ebb7428aa28d8b5246509898` |
| Assets | `e91bdb6e770b4d298e9f62166a0fd5de` |
| Research | `557e6b7b8c434a578d45ecb0a8329f63` |
| Leads | `e4518a459f004eb0b9646e48d8718705` |
| Emails | `6252e9917027488fb628436aabb89947` |

The **Leads DB** `Campaign` field is plain text — any campaign form submits to the same DB with a different `campaign` value. The `Fraud Type` field (a Notion select) accepts the values in `validFraudTypes` in `worker.js` — **keep that allowlist in sync with Notion's select options**.

### Design Specification databases

Structured, per-field counterparts to the free-text Visual Production Brief/Production Assembly Package uploads. All live under 🏠 Home alongside the core databases above.

**Shared (asset-type-agnostic)** — reusable across any asset type, not just carousel:

| Database | ID | Scope |
|---|---|---|
| 🎨 Color Palettes | `b71036ecf4ed49d79ec55d9b97bc2510` | Reusable, one per campaign |
| 🔤 Typography Systems | `e4f778fdca944e268c43a7078613220d` | Reusable, one per campaign |
| 🖌️ Visual Style Profiles | `30864a7b721d4aaea7fa06262f9bdd94` | Reusable, one per campaign |
| 📐 Grid & Spacing Systems | `2a3764e75be24e6aaf008e1d167dc4e1` | Reusable, one per campaign |
| 🔷 Diagram Templates | `96db754fdb444e269124e5fad4ea7c57` | Reusable, one per diagram type (global library) |
| 🧩 Layout Templates | `b455ceb4395e4a8b942ab5031367a8ff` | Reusable, one per layout category (global library); has a `Supported Asset Types` field for cross-type reuse |
| 📤 Platform & Export Presets | `78e89f02e8d4401a838635fc4d505f36` | Reusable, one per platform+format |
| 🖼️ Visual Asset Library | `7c2e1cd157e9480493bc442c80583d95` | Reusable production assets; not yet auto-populated (no images exist at draft time) |

**Text Video specific:**

| Database | ID |
|---|---|
| 🎬 Text Video Specs | `3ce83fc9ef8b4dc185219598761abb7f` |
| 🎞️ Text Video Scenes | `afa52f6d81b7416d97696517bed8d9c2` |

**Carousel specific:**

| Database | ID |
|---|---|
| 🎠 Carousel Design Systems | `7195e832480d48909017a9cc3193212c` |
| 🎠 Carousel Specifications | `ff84f1d161504a778e9ed29dfd4e02a6` |
| 🃏 Slide Specifications | `69f9b4be4b9143568d4baacc920fb657` |
| ✅ Carousel QA Runs | `bdefa812e111424194bba11953b32854` |

`generateVisualBriefPrompt` (🎨 Visual Brief button) auto-populates these for both text-video and carousel assets — `buildTextVideoSpecDraft`/`buildCarouselSpecDraft` in `worker.js`. Pattern for both: deterministic technical fields (dimensions, safe areas, renderer/export conventions) come from fixed pipeline conventions; creative/per-slide-or-scene fields come from one Claude call grounded in the asset's *existing* written copy (headline/body or narration/on-screen text, copied verbatim, never regenerated) plus research/title/method context. The draft is folded into the clipboard prompt as a "# Design Specification (Draft)" section, so ChatGPT reviews/refines concrete field values instead of starting blank.

Both Carousel and Text Video resolve the three format-agnostic shared systems (Color Palette/Typography/Visual Style) via one shared helper, `resolveCampaignDesignDefaults()` — **search-or-create, keyed by campaign name, and never auto-patched after first creation.** The first Visual Brief generated for a campaign seeds `{campaign} Color Palette`/`{campaign} Typography System`/`{campaign} Visual Style`; every generation after that — for either asset type — just relates to the existing records unchanged. Grid & Spacing is format-specific (carousel's 4:5 vs. text video's 9:16, different safe areas) so it gets its own per-format record (`{campaign} Grid & Spacing (Carousel)` / `(Text Video)`), same resolver. Carousel's Platform Preset and Layout/Diagram Templates stay carousel-specific search-or-create logic (Layout/Diagram Templates are keyed by category/type name and shared **globally**, not per campaign — "Cover Hero Left" means the same thing everywhere). `Carousel Specifications` carries a `Content Asset` relation back to the Assets DB (dual); `Slide Specifications` relates back via `Carousel Specification`/`Slide Specifications`. Several fields from the original pasted carousel spec that were typed as Notion rollups were simplified to plain fields set directly by the draft builder; a few relations to non-existent concepts in this system (Brand, Series, Character) became the existing Campaign relation or free text.

### Design promotion model (non-destructive by default)

Every asset's own resolved design — the actual Color Palette/Typography/Visual Style values it used — is stored **inline on its own spec record** (Carousel Specifications' `Resolved Color Palette`/`Resolved Typography`/`Resolved Visual Style`; Text Video Specs' pre-existing `Color Palette`/`Typography System`/`Icon Style`/etc. fields), independent of whatever the shared campaign records currently say. Nothing auto-writes to the shared Color Palette/Typography/Visual Style/Carousel Design System records after their first creation — an asset that resolves a different palette just keeps it attached to itself.

Promotion is **explicit only**: `promoteAssetDesignToGlobal` (worker action) copies one asset's resolved value for one category into the corresponding shared record, bumping its `Version` and stamping `Promoted From Asset`. The 🧬 button next to a campaign's Design field opens the **Campaign Design System** panel (`getCampaignDesignSystem` action) — shows the current shared defaults plus every carousel/text-video asset's resolved design and a "Promote to Campaign Default" button per unpromoted asset (fires three `promoteAssetDesignToGlobal` calls, one per category — the worker action itself stays a generic single-record primitive so a future asset type gets the same promotion mechanism for free). `Design Promoted` (checkbox, both spec DBs) tracks whether an asset's design has been promoted.

**Not yet done:** wiring any of this into `assembleAsset` (which just requires both uploaded documents present, no per-field gating); syncing ChatGPT's revisions back into the structured databases (the operator applies them to the Notion rows by hand); the Layer 2 "Content Intent" object and extending the Campaign Design System to drive site/product creation, both proposed but out of scope for now.

### Growth Strategy

`🚀 Growth Strategy` (`437b8c2615234b6bbe4a694b31f3000f`) — one record per generation run, related to a Product and Campaign. **Distinct from two other same-sounding things**: the existing positioning Strategy DB (`STRATEGY_DB`, 11 fields — Customer/Niche/Pain Points/Emotions/Solution/Benefits/Unique Opportunity/Transformation/Offer Structure/Proof Points/Objections, "who are we talking to and why") and Content Strategy (`CONTENT_STRATEGY_DB`, which is actually the Titles DB, confusingly). Growth Strategy answers "given that positioning, what should we actually make" — it recommends thematic title groupings, each with specific title angles, a Method (grounded in the product's actual linked Methods, never invented), and a platform.

Generated via `generateGrowthStrategy` (🚀 button on a product row) — takes an optional `platformOverride` (every grouping targets that platform) or, left blank, lets Claude recommend per-grouping. Reads the positioning Strategy + Product fields + campaign Research comprehensively. Writes properties (Strategy Name/Product/Campaign/Platform Override/Recommended Platforms/Status/Summary/Grouping Count) plus a structured page body (heading + rationale + title bullets + method/platform per grouping). **Never creates titles or touches a Method** — purely a reviewable recommendation; a product can have several over time (Status Draft/Approved/Archived), browsable via the row's "plans" dropdown (`listGrowthStrategies`/`getGrowthStrategy`, opens a read-only view modal).

The existing per-Method "Generate Titles" modal (`generateMethodTitles`) can optionally ground a run in one of these — a "Growth Strategy" dropdown (only shown when a real product is selected, not the Campaign option) plus a free-text "guidance" field that overrides/refines how it's applied. When set, the selected strategy's full body becomes primary grounding in the title-generation prompt (favor titles from whichever grouping was written for the method being run), on top of — not instead of — the method's own framework.

`generateMethodTitles`'s Strategy-fed context also got a small fix alongside this: `Transformation`/`Proof Points`/`Objections` are fetched from the positioning Strategy record but were never actually read into the prompt (only the plainer Product-page versions were) — now included.

### Editing Authority model (Visual Brief)

Every Visual Brief prints a "# Editing Authority" section near the top defining four tiers ChatGPT must respect, and the Design Specification (Draft) section tags every field against them:

- **Immutable** — strategic/content layer (narration, on-screen text, CTA, platform, aspect ratio, scene order, required facts). ChatGPT may flag a problem, never silently rewrite.
- **Constrained** — ceilings (object/label/animation-event budgets, motion density, min read duration, safe areas, template libraries, voice provider/ID). Simplify below freely, never exceed silently.
- **Mutable** — the actual design solution (color palette, typography, illustration/icon/diagram style, composition, animation choreography), each printed with a `[default, override permitted]` tag. The *intended impression* is fixed (see Brand Intent); the specific value achieving it is ChatGPT's call — must be returned as a resolved value with a stated reason, never "use your judgment."
- **Derived at production** — exact timing (frame numbers, resolved scene duration) doesn't exist until narration is actually rendered; tagged `[ESTIMATED, pre-audio]`/`[DERIVED AT PRODUCTION]` so ChatGPT choreographs in relative terms (reveal → hold → exit) rather than to an exact pre-audio guess.

This exists because the first custom-built Text Video shipped with animations that didn't finish before their scene cut — planned duration and real narration duration were never reconciled. The fix is a **mandatory render sequence**, printed into the Custom Remotion Build path's Production Method instructions (so ChatGPT is required to include it in the Production Assembly Package it writes back): render one continuous voice track with scene markers (not per-scene calls) → lock each scene's *resolved* duration from real alignment data (spoken + entry padding + minimum read time + transition allowance, keeping the *estimated* value too, never overwriting it) → when a scene's planned visual doesn't fit, simplify in order (remove decorative animation → reduce simultaneous motion → reduce labels/objects → combine diagram nodes → simplify the diagram → reallocate time from a lower-weight scene → extend total duration only if the platform allows) — never just speed up the animation. This is a render-time discipline, not a dashboard gate — `assembleAsset` still only checks that both documents are uploaded, because only a local Claude Code session doing the actual render has access to real audio.

## Admin Microsite System

Each campaign gets its own admin microsite at `microsites/{deploy-path}/index.html`.

**To deploy a new microsite:**
1. Copy `microsites/microsite-index.html` to `microsites/{deploy-path}/index.html`
2. Change exactly 4 JS constants (lines ~351–354) and 2 Notion links (line ~94):

```javascript
// JS constants — unique per microsite:
const WORKER_URL  = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"; // same for all
const CAMPAIGN_ID = "{notion-campaign-page-id}";   // Campaigns DB page ID
const RESEARCH_ID = "{notion-research-page-id}";   // Research DB page ID (for Notion link only)
const SITE_URL    = "https://cabuzzard.github.io/dash/microsites/{deploy-path}/";
```

```html
<!-- Notion links in SEC 1 (~line 94): -->
<a href="https://www.notion.so/{campaign-id}" ...>↗ Campaign</a>
<a href="https://www.notion.so/{research-id}" ...>↗ Research</a>
```

3. Push to GitHub (`git add`, `git commit`, `git push`)
4. Set the `"microsite"` URL property on the Campaign record in Notion to `https://cabuzzard.github.io/dash/microsites/{deploy-path}/` — this feeds the **STE** column in the overview
5. Set `Web Page URL` on the Research record to the microsite URL

**To update all microsites** (after changes to `microsite-index.html`):
- Preserve only the unique header block (4 JS constants + 2 Notion links per site)
- Replace everything else with the updated template content

## Live (Public) Campaign Sites

Public lead-gen pages at `web/{deploy-path}/index.html`.
Live URL pattern: `https://cabuzzard.github.io/dash/web/{deploy-path}/`

- No auth — just the lead form with Cloudflare Turnstile CAPTCHA
- Turnstile site key: `0x4AAAAAADUjP18lSj4N0zt1` (production, same domain for all pages)
- Submit to worker: `{ action: 'submitLead', campaign: '{deploy-path}', email, phone, fraudType, note, tsToken }`
- `fraudType` value must be in the worker's `validFraudTypes` allowlist
- Set the `"live site"` URL property on the Campaign record in Notion — this feeds the **LVE** column in the overview

## Admin Microsites

Admin-only pages at `microsites/{deploy-path}/index.html`.
Live URL pattern: `https://cabuzzard.github.io/dash/microsites/{deploy-path}/`

- Set the `"microsite"` URL property on the Campaign record in Notion — this feeds the **STE** column in the overview

## Deployed Campaigns

| Deploy Path | Microsite | Live Site | Campaign ID | Research ID |
|---|---|---|---|---|
| `foreclosure-fraud` | ✓ | ✓ | `3681f7d3a4bb8195a655d6f022e257f1` | `3681f7d3a4bb81e29542e24d178a3ad1` |
| `estate-divorce-property-resource` | ✓ | ✓ | `3691f7d3a4bb81de93d9fa2f0607deb7` | `3691f7d3a4bb8150b543f42f77c7ce3a` |
| `lead-gen-small-business` | ✓ | ✓ | `3721f7d3a4bb813ebc1de7576df0ca0a` | `3721f7d3a4bb8101a3cce42f55bfbec1` |
| `mobility-mentor-fundraising` | ✓ | ✓ | `34b1f7d3a4bb81b6a8a8fee04df94807` | `3661f7d3a4bb81adaaadc2ce80784112` |
| `mobility-mentor-services` | — | ✓ | — | — |
| `ai-lead-gen-local-services` | ✓ | — | `34f1f7d3a4bb81c2be96c022bdd1ef40` | `36d1f7d3a4bb81ab8dbbcfdfff7428e3` |
| `small-business-adu-ca` | ✓ | — | `3591f7d3a4bb811a907aeea020352484` | `3731f7d3a4bb814598eed9735cf331d3` |
| `small-business-re-agent-ca` | ✓ | — | `3731f7d3a4bb816f9d9cd5bffda0549d` | `3731f7d3a4bb8117b12ddfb70d5a5ced` |
| `mountainwize-coaching` | — | ✓ | — | — |
| `webguy` | — | ✓ | — | — |
| `garden-planning-calendar-workbook` | ✓ | ✓ | `3981f7d3a4bb81a69924cdc633e96828` | `3981f7d3a4bb815c90c4ef64e4324572` |

## Security Notes

- `noindex, nofollow` on all admin microsites
- `X-Frame-Options: DENY` on all pages
- HMAC tokens expire after 8 hours
- GitHub repo should be private (pending)
- Rotate Notion integration token if ever exposed (pending)
