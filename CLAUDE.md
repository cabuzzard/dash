# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Deep history / incident write-ups live in `docs/`** to keep this file small (it's injected every turn):
> `docs/visual-brief.md` · `docs/hub-hosting-history.md` · `docs/notion-incidents.md` · `docs/strategy-changelog.md` · `docs/methods-titles-assets.md` · `docs/strategy-sequence-next.md` · `docs/lead-sourcing.md`

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
- `ANTHROPIC_API_KEY` — Claude (all AI generation)
- `GITHUB_TOKEN` — commits to `cabuzzard/dash` (thumbnails, offer images, hub/blog pages)
- `KIE_API_KEY` — Kie.ai (Nano Banana / Flux images, Kie video)
- `XAI_API_KEY` — Grok: `grok-4.6` trending grounding **and** `grok-imagine-image-2.0` offer images (needs image access on the plan)

**PowerShell pipe caveat:** always `.trim()` secrets read from `env.*` — PowerShell pipes add a trailing newline.

**Verify `worker.js` edits with the real bundler, not just `node --check`:** `cd worker && npx wrangler@4 deploy --dry-run` (no Cloudflare creds needed). A missing-brace bug once passed `node --check` for a long stretch because an unrelated stray-bracket bug numerically cancelled it. Clean "Total Upload: … KiB" with no `[ERROR]` is the only trustworthy signal. Full story: `docs/visual-brief.md`.

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

CORS is locked to `https://cabuzzard.github.io` only (plus per-request `HUB_ORIGINS` for custom hub domains — see Content Hubs).

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
| 🔬 Product Research | `a412ac1f57f349d3bbac8cfa94737c39` |
| 📄 Strategy | `6f7a8666944746b2ae98d41db0c4e419` |
| 🚀 Growth Strategy | `437b8c2615234b6bbe4a694b31f3000f` |
| 🎯 Strategy Slots | `cc6bf6dc995e485d8c5bd13c33b7e0fa` |
| 🧲 Sourced Leads | `886f4007dd1e45caa6f3bbccbf8b71db` |

**Two Notion-DB rules that cost real debugging / data time (full write-ups: `docs/notion-incidents.md`):**
- When wiring a new `_DB` constant: use the **database id** (page-URL segment), never the `collection://` data-source id — and keep a logged `.catch(e => { console.error(...); return []; })` on any `notionQuery` a feature depends on.
- Never combine `RENAME COLUMN` with `ADD COLUMN` targeting the old name in one DDL call — rename alone first, verify it stuck, then add.

**Product Research vs. Strategy vs. Growth Strategy vs. campaign Research — four similarly-named things, easy to conflate:**
- **🔬 Product Research** (`PRODUCT_RESEARCH_DB`) — one fixed record per Product: Customer/Niche/Pain Points/Emotions/Solution/Benefits/Unique Opportunity/Transformation/Offer Structure/Proof Points/Objections (`STRATEGY_FIELDS` in worker.js). "Who are we talking to and why," true regardless of platform/method. This is the "Product Research" modal on the microsite. Every read/write site goes through `findBestProductResearchRecord(hdr, productId)`, which dedupes by most-fields-filled — Notion has no unique constraint and duplicate records for one product have actually happened (`docs/notion-incidents.md` § Split history).
- **📄 Strategy** (`STRATEGY_DB`) — Method Briefs only: many records per product, one per attached Method (`Method` relation always set), the per-Method deep-dive doc. Queried by `Product AND Method: contains {id}`, never by Product alone.
- **🚀 Growth Strategy** (`GROWTH_STRATEGY_DB`) — see its own section below; a title-planning recommendation, not a positioning doc.
- **Research** (`RESEARCH_DB`) — campaign-level (Statement/Unique Opportunity/Keywords/etc.), one per campaign, not product.

The **Leads DB** `Campaign` field is plain text — any campaign form submits to the same DB with a different `campaign` value. The `Fraud Type` field (a Notion select) accepts the values in `validFraudTypes` in `worker.js` — **keep that allowlist in sync with Notion's select options**.

### Design Specification databases

Structured, per-field counterparts to the free-text Visual Production Brief / Production Assembly Package uploads. Auto-populated by `generateVisualBriefPrompt` (`buildTextVideoSpecDraft`/`buildCarouselSpecDraft` in `worker.js`): deterministic technical fields from fixed pipeline conventions; creative fields from one Claude call grounded in the asset's *existing* copy (verbatim, never regenerated). The three format-agnostic shared systems (Color Palette / Typography / Visual Style) resolve via `resolveCampaignDesignDefaults()` — search-or-create keyed by campaign name, seeded once, never auto-patched. Grid & Spacing is per-format; Layout/Diagram Templates shared globally. Full spec: `docs/visual-brief.md`.

**Shared (asset-type-agnostic):**

| Database | ID | Scope |
|---|---|---|
| 🎨 Color Palettes | `b71036ecf4ed49d79ec55d9b97bc2510` | Reusable, one per campaign |
| 🔤 Typography Systems | `e4f778fdca944e268c43a7078613220d` | Reusable, one per campaign |
| 🖌️ Visual Style Profiles | `30864a7b721d4aaea7fa06262f9bdd94` | Reusable, one per campaign |
| 📐 Grid & Spacing Systems | `2a3764e75be24e6aaf008e1d167dc4e1` | Reusable, one per campaign |
| 🔷 Diagram Templates | `96db754fdb444e269124e5fad4ea7c57` | Reusable, one per diagram type (global library) |
| 🧩 Layout Templates | `b455ceb4395e4a8b942ab5031367a8ff` | Reusable, one per layout category (global library); has a `Supported Asset Types` field for cross-type reuse |
| 📤 Platform & Export Presets | `78e89f02e8d4401a838635fc4d505f36` | Reusable, one per platform+format |
| 🖼️ Visual Asset Library | `7c2e1cd157e9480493bc442c80583d95` | Reusable production assets; not yet auto-populated |

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

`Carousel Specifications` carries a `Content Asset` relation back to the Assets DB (dual); `Slide Specifications` relates back via `Carousel Specification`/`Slide Specifications`.

### Design promotion model (non-destructive by default)

Every asset's own resolved design (the actual Color Palette / Typography / Visual Style values it used) is stored **inline on its own spec record** (Carousel Specifications' `Resolved Color Palette`/`Resolved Typography`/`Resolved Visual Style`; Text Video Specs' `Color Palette`/`Typography System`/`Icon Style` fields), independent of what the shared campaign records currently say. Nothing auto-writes to the shared records after their first creation.

Promotion is **explicit only**: `promoteAssetDesignToGlobal` (worker action) copies one asset's resolved value for one category into the corresponding shared record, bumping its `Version` and stamping `Promoted From Asset`. The 🧬 button next to a campaign's Design field opens the **Campaign Design System** panel (`getCampaignDesignSystem`) — current shared defaults plus every carousel/text-video asset's resolved design and a "Promote to Campaign Default" button per unpromoted asset (fires three `promoteAssetDesignToGlobal` calls, one per category). `Design Promoted` (checkbox, both spec DBs) tracks whether an asset's design has been promoted.

### Growth Strategy

`🚀 Growth Strategy` (`GROWTH_STRATEGY_DB`) — one record per generation run, related to a Product and Campaign. **Distinct from** 🔬 Product Research (positioning) and Content Strategy (which is actually the Titles DB). Growth Strategy answers "given that positioning, what should we actually make" — it recommends thematic title groupings, each with title angles and a platform.

Generated via `generateGrowthStrategy` (🚀 button on a product row) — optional `platformOverride` (every grouping targets that platform) or, blank, Claude recommends per-grouping. Reads Product Research + Product fields + campaign Research. Optional `seedTitleId`: a seeding title's own Notes/keywords become the PRIMARY driver instead of Product/campaign Research (which become secondary) — how an operator gives one title its own dedicated strategy (a product can hold several at once, so this never overwrites). Writes properties + a structured page body. **Never creates titles or touches a Method** — purely a reviewable recommendation. Status Draft/Approved/Archived, browsable via the row's "plans" dropdown (`listGrowthStrategies`/`getGrowthStrategy`).

### Strategy Slots and Planning-stage titles

Growth Strategy generation also bulk-creates `🎯 Strategy Slots` (`STRATEGY_SLOTS_DB`) — one lightweight row per planned title angle, grouped under the Growth Strategy that produced them. **A Slot is a placeholder, not a real title** — visible/trackable in the microsite's **Strategies** tab with fill-progress (`getCampaignGrowthStrategies`). Filling one in (`generateTitleFromSlot`, the "+ title" button) writes ONE real Content Strategy title at **Status: Planning**, method-agnostic (no pillar content yet on purpose).

**Strategies-tab display hierarchy (fixed, matches the Information Flow contract's Stage 3): `Product Stack → Product → Strategy (name) → Platform → Arc/Group → Slot`.** A product holds several parallel Growth Strategies; each renders as one collapsible strip carrying its own action row (`stratActionBtns`: ℹ view · 🛰 re-check platforms · 🏷 assign types · ➕ new grouping · ♻️ regenerate · 🚀 launch run · 🗑 delete). **Platform is above Arc** — an "arc" (a `grouping`, i.e. an AI-generated theme) whose slots span platforms appears under each of those platform headers with its slice of slots; the arc is the cross-platform relator, `Sequence` orders the slots within it. **Every level collapses, all collapsed by default.** Frontend: `renderStrategyTree` → `renderStrategyPlatforms` → `strategyPlatformArcs` → `stratSlotRow` in the microsite. `getCampaignGrowthStrategies` returns each strategy's `productStack` + `createdTime` to drive it.

**Planning is deliberately excluded from the Development list.** A title stays in the Strategies tab (grouped under its Slot, or "General"/"Unassigned Planning Titles" if none) until its pillar gets written — the **✍️ Write Pillar** button there (`writeTitlePillar`) writes the pillar AND promotes Planning → Development in the same call. Only once a title reaches Development does it show there, grouped Stack → Product → Strategy → Title.

An unassigned Planning title (no Growth Strategy relation) can either 🔗 attach to an existing Growth Strategy for its product, or 🚀 generate a brand-new one seeded by its own content (`seedTitleId`) — titles never generate a strategy implicitly, always an explicit operator action.

`generateTitlesFromStrategy` (reads a Method's Strategy Brief, "Generate Strategy" button in the Generate Assets modal) also creates titles at Status: Planning, but these carry real drafted content — they typically just need a normal ⇄ status promotion, not the Write Pillar step. `generateMethodTitles` (per-Method "Generate Titles" modal) can optionally ground a run in a Growth Strategy (dropdown + free-text guidance), on top of the method's own framework.

**A Strategy Slot carries Platform + Post Type only — no Method.** Method is chosen exclusively at title/asset-creation time (see [[feedback_dash_methods_pull_not_add]]).

**🏷️ Post Types** (`POST_TYPES_DB`, Name + Rationale) — standalone global taxonomy of content descriptors (Pillar, Intro, Feature Benefit, CTA, Teach, Story, Q&A, …). Distinct from `Sequence` (position in a series) and `Recurrence` (how often), both orthogonal timing metadata. `generateGrowthStrategy` assigns a Post Type to **every individual title**; every strategy must include **at least one Pillar title**. **Slot naming: `"{sequence} – {Post Type name}"`** (e.g. `"3 – Feature Benefit"`), kept contiguous by `removeStrategySlot`/`insertStrategySlot`. Slots also have a `Platforms` relation (→ `PLATFORMS_DB`, distinct from the free-text `Platform`). Worker actions: `getPostTypes`, `createPostType`, `updateStrategySlot`, `removeStrategySlot`, `insertStrategySlot`. Microsite: ✏️ Edit Slot modal, 🗑️ / "+ insert" rows, 🏷️ Assign Types (`backfillStrategyPostTypes`).

**Dated feature history — full write-ups in `docs/strategy-changelog.md` (read there before touching any of these):**
- `runStrategySequenceReminders` (2026-08-24) — nightly `0 0 * * *` cron queuing one Main TD item per "line" (Growth Strategy + Grouping) for the next sequential / due recurring Slot; idempotent by re-derivation. Also `docs/strategy-sequence-next.md`.
- Live Grok grounding (`callGrokTrendingTopics`, `grok-4.6`) — `generateTitleFromSlot` pulls live X trends at fill time for X/Twitter slots. Needs `XAI_API_KEY`; silent-safe without.
- `runListingRepostReminders` → Weekly Planner (2026-09-04) — one `WEEKLY_PLANNER_DB` row per Published `listing` Asset, idempotent via `Source Asset` relation.
- Guides and Runs (`launchStrategyRun`, 2026-08-27) — any strategy is a reusable **Guide**; a **Run** is a Growth Strategy child re-creating the Guide's slots against a Product without AI. 🚀 Launch Run.
- `deleteGrowthStrategy` (2026-08-27) — 🗑️ real Notion archive, cascades to children + slots; real titles unlinked not deleted.
- Offer asset type (2026-09-01/02) — direct-sales asset; `Offer – Pillar` / `Offer – Content Hub` methods hit `generateTitleAssets`'s `/\boffers?\b/i` branch, create ONE Asset (Type "Offer", Status Publish) with a fenced `json` **OFFER CARD** block + `Product` relation + `Content Hub` select. Hub chosen at publish time.
- Hook Posts method (2026-09-10) — **retasked from `Product Cards`** (same Methods DB page id). One Title + the product's known objections → a **batch of one-page social posts, one Asset each** (`Asset Type: hook post`), grouped under the Title. `generateTitleAssets` `/\bhook post/i` branch: one Claude call writes N posts (default 6, cap 10) — each an `objection` + `snippet` (on-image words) + `caption` + `zone` + `format` (`picture`/`text`, model's choice) + `imagePrompt` (picture only, keeps `zone` calm). **Fully automated image compositing**, no Canva/Remotion: picture posts render a wordless Grok plate (`grok-imagine-image-2.0`, aspect per `HOOK_POST_FORMATS` dimension set — `ig-portrait`/`ig-square`/`ig-story`), then **every** post renders an HTML card (hub font + palette, `snippet` in `zone`) → **Cloudflare Browser Rendering `/screenshot`** → hosted → asset's `Post Image`, Status → Publish. Copy is synchronous; images render via `ctx.waitUntil`; **`renderHookPostImages {titleId}`** is the idempotent re-run (modal auto-pings it as a safety net). Needs `XAI_API_KEY` + `CF_ACCOUNT_ID`/`CF_API_TOKEN` (both already set). Full spec: `docs/methods-titles-assets.md` § "Hook Posts".
- Offer images (2026-09-10) — Publish modal **🖼️ Offer images** block for any `/\boffer\b/i` asset: two rows (📸 Instagram background 3:4, 🖼️ Blog thumbnail 1:1), **both WORDLESS plates from xAI Grok Imagine** (`grok-imagine-image-2.0`, synchronous, `XAI_API_KEY`) — headline added later in Remotion/Canva (`make-offer-still`). Nano Banana / Seedream removed. The art direction is the **image spec**: `assembleImageBrief` (worker) gathers the hub design record + campaign Research (`Statement`/`Pain Points`/`Emotions`/`Image Direction` guidance) + the **main product's 🔬 Product Research** (all `STRATEGY_FIELDS`, via `findBestProductResearchRecord`) + the asset's title; `writeImageSpec` → the full spec (one Claude call). `generateOfferImage {assetId,kind}` → assemble → spec → 2nd Claude call writes a format-tailored Grok prompt → xAI render → `{imageUrl,spec,sync:true}` → `saveOfferImage` (also takes `fileData` b64) rehosts on GitHub Pages, `?v=` cache-bust, → `Instagram Background`/`Thumbnail`. `getImageBrief {campaignId|assetId|hubSlug}` returns the spec for the Content Hubs card; `saveImageGuidance {campaignId,text}` writes Research `Image Direction`. Standalone CLI **`scripts/grok-image.py`** (`--hub`, `--kind`, `--asset-id`). Full spec: `docs/methods-titles-assets.md` § "Offer images".

## Lead Sourcing engine (Globals tab · 🧲 Sourced Leads)

Standalone, extensible lead-sourcing pipeline (2026-09-08). Pluggable source
adapters → normalize with a full source trail → dedupe (KV index) → stage in
`SOURCED_LEADS_DB`. `enrichSourcedLead` runs one grounded Claude call per lead
for buyer type / deal-type-wanted / psychological profile / Active + Data-Confidence
scores. Deal classification is parsed from the source listing title/blurb by a
deterministic keyword classifier (`classifyDealFromText`), then optionally refined
by enrichment. Nightly cron `runLeadSourcing` is **opt-in** — no-ops unless a
vertical key is in KV `leadsrc:auto` (panel toggle), so there's no standing Apify
bill. Never touches production Campaigns/Products/Methods/Strategy/Research/Leads.
Adapters: `crexi` + `loopnet` (Apify, live), `manual` (live), `county` + `broker`
(stubs). Add a vertical → `LEAD_VERTICALS`; add a source → `LEAD_SOURCE_ADAPTERS`.
**Full spec + how to extend + setup checklist: `docs/lead-sourcing.md`.**

## Cron Scripts panel (Globals tab · ⏰)

Read-only registry of everything on a schedule — the counterpart to the 🤖
Automations wishlist (which lives on the TD tab). `CRON_REGISTRY` in `index.html` is a **hand-maintained
mirror** of `worker/wrangler.toml` `[triggers] crons` + the `scheduled()`
dispatcher in `worker.js`. When a cron job is added / removed / re-timed, update
`CRON_REGISTRY` to match (and `runLeadSourcing`'s entry if its gating changes).

## Visual Brief

**Visual Brief** = a single-paste, three-stage ChatGPT handoff (🎨 button → setup modal → clipboard). Stage 1 = Visual Design Card, a single ASCII/box-drawing mockup page critiqued in-chat, never uploaded. Stage 2 = three files returned together: `VISUAL_PRODUCTION_BRIEF.md` (→ 📄 Brief → `Visual Production Brief`), `ASSEMBLY_INSTRUCTIONS.md` (→ 🧱 Package → `Production Assembly Package`), `ASSEMBLY_MANIFEST.json` (→ 🧾 Manifest → `Assembly Manifest`, validated as parseable JSON). `assembleAsset` gates on all three uploaded.

`runAssembleAsset` re-renders from the current Assembly Manifest via the **`MANIFEST_RENDERERS`** registry (keyed by Asset Type) before packaging the review page — **carousel is the only entry today**; Text Video has none (nothing in a Worker can run ffmpeg/Remotion/ElevenLabs). Add one registry entry to give a new asset type auto-render. The Assembly Review page takes change requests for any asset type: **Design Parameters** (direct field edits → `updateAssetManifestFields`, no LLM) and **Request a Change** (free text → `refineAssetManifest` → Claude). Both re-render in place if a renderer exists, else return a fresh Claude Code handoff prompt.

Every Visual Brief prints a `# Editing Authority` section with four tiers ChatGPT must respect (Immutable / Constrained / Mutable / Derived at production), and the Custom Remotion Build path carries a mandatory render sequence (never just speed up an animation to make it fit).

**Full spec + history — read before editing this system: `docs/visual-brief.md`.**

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

**To update all microsites** (after changes to the template): edit `microsites/hard-grind/index.html`, run `python microsites/sync_microsites.py`, `git add microsites/`, commit. The sync preserves only the unique header block (4 JS constants + 2 Notion links per site).

## Live (Public) Campaign Sites

Public lead-gen pages at `web/{deploy-path}/index.html`.
Live URL pattern: `https://cabuzzard.github.io/dash/web/{deploy-path}/`

- No auth — just the lead form with Cloudflare Turnstile CAPTCHA
- Turnstile site key: `0x4AAAAAADUjP18lSj4N0zt1` (production, same domain for all pages)
- Submit to worker: `{ action: 'submitLead', campaign: '{deploy-path}', email, phone, fraudType, note, tsToken }`
- `fraudType` value must be in the worker's `validFraudTypes` allowlist
- Set the `"live site"` URL property on the Campaign record in Notion — this feeds the **LVE** column in the overview

## Content Hubs

Content-marketing home pages (blog / newsletter / social / product links) at `web/hub/{slug}/index.html` — one per campaign or product, all sharing the `web/hub/hub-template.html` layout. See `web/hub/README.md` for how to build one.

**Hosting (as of 2026-09-03):** every hub lives on **Cloudflare Pages** project `dash-hubs` (account `Trailnotes2026@proton.me`, `9d5b533bbd24bbd32be65bb747a13d8c`). `web/hub/_worker.js` (Pages advanced mode) Host-routes each custom domain to its subdir (map in the `HUBS` const). Deploy: `.github/workflows/deploy-hub-pages.yml`. Preview at `https://dash-hubs.pages.dev/<slug>/`. Also on GitHub Pages at `https://cabuzzard.github.io/dash/web/hub/{slug}/`. **Email stays on Bluehost.** Full runbook: `web/hub/CLOUDFLARE-ROUTING.md`. Pre-CF-Pages Bluehost history + the WP-park blocker: `docs/hub-hosting-history.md`. `creative-flow-guitar` stays on Bluehost for now (in the `_worker.js` map for one-step migration later).

Hub pages are self-contained (relative/anchor links, Google Fonts, one absolute `WORKER_URL` fetch) so they serve from a domain root with no rewriting. Structural JS edits are hand-synced across the 8 hub files (`build-hubs.mjs` only owns `<head>` meta + fonts + tokens).

**Design is a Research field now (2026-09-10):** the visual direction is **the Design section of the Campaign Research record** — a Stage-1 Information-Flow artifact, same tier as `Palette`/`Fonts`, not a standalone brief. Fields: `Visual Register` · `Photography Direction` · `Visual Avoid` (generated by **`generateResearchDesign {campaignId}`** from campaign + main-product research) + `Design Notes` (operator's own, written by `saveImageGuidance`). Content Hubs card's **Design** section: ↻ Regenerate palette / fonts / **design direction**, shows all four. `assembleImageBrief` reads these as authoritative (richest Research record, same scoring as `getHubPalette`); `hubs.design.json` `design.subject`/`audience`/`photography`/`avoided` are **fallback only**. `writeImageSpec` grounds itself in `getInformationFlowContext(env)`. The **copyable "Image plate spec"** field (**`getImageBrief`** → `assembleImageBrief` + `writeImageSpec`) is the assembled output; **✎ Guidance** modal edits `Design Notes`. Same spec `generateOfferImage` renders the offer plates against. The **Information Flow Contract** (Stage 1) now lists these Design fields and states "the Design section is a Stage-1 artifact — everything visual downstream inherits from it"; the old Stage-6 "gpt-image handoff" open question is replaced with a model-agnostic note.

**Content-hub blog (2026-09-02):** `publishSeoPostToLiveSite` writes each published `SEO Post` / `Blog - SEO - News` asset for a hub campaign (`HUB_SITES`) to `web/hub/{slug}/blog/{post-slug}/index.html` + `blog/index.html` + `blog/posts.json`, styled from that hub's tokens/fonts in `web/hub/hubs.design.json`. Non-hub campaigns fall back to `web/{deployPath}/blog/`. The **journal** section is live-fed by `getHubBlog` (reads `blog/posts.json`). Operators create posts: **📝 make into article** on a News Feed row → `createNewsBlogTitle` → 🧩 Generate Assets. Full flow: `docs/methods-titles-assets.md` § "Blog - SEO - News".

### Point a custom domain at a hub

1. Cloudflare "Add a Site" → confirm MX imported → switch the registrar's nameservers to Cloudflare's → add the domain as a custom domain on the `dash-hubs` Pages project. (Bluehost-era steps: `docs/hub-hosting-history.md`.)
2. `web/hub/_worker.js` → add the domain → slug mapping in the `HUBS` const.
3. `worker/worker.js` → add the domain **apex + www, `https://`** to the `HUB_ORIGINS` set, then deploy. The hub's JS calls the worker; from a domain not in `HUB_ORIGINS` those calls fail CORS silently (`Access-Control-Allow-Origin` is per-request via `resolveOrigin()`; `Vary: Origin` set).
4. `index.html` → set `domain:` on the hub's `HUB_SITES` entry; tick the **Domain** cell in the Content Hubs tab (`domainlive`, non-crit).
5. Campaign's `"live site"` property → the custom-domain URL.

### Current hub → domain routing

| Hub slug | Campaign | Domain | Routing |
|---|---|---|---|
| `creative-flow-guitar` | Creative Flow Guitar — Weekly Sessions | `creativeflowguitar.com` | ✅ serving over https (Bluehost; doc root `~/creativeflowguitar.com`) |
| `ai-implementation` | Sm business software tools | `aisystemimplementation.com` | ✅ serving over https — re-verified 2026-09-04 |
| `sunflower-acres` | Sunflower Acres | `accessiblefarms.com` | ✅ serving over https — re-verified 2026-09-04 |
| `care-gap` | Fundraising Caregivers - Stable Home | `stablehomefoundation.com` | ✅ serving over https — re-verified 2026-09-04 |
| `owners-rep` (Build Watcher) | Build Watcher | `homestructionconsulting.com` | ❌ not a cPanel addon domain yet — genuinely still broken, needs to be added first |
| `home-services` | Home Services | `generalservices2020.com` | ✅ serving over https — re-verified 2026-09-04 |
| `surf-vacations` | Surfing Vacations | `outsidesessions.com` | ✅ serving over https — re-verified 2026-09-04 |
| `mountainwize` | 🏔️ Mountainwize Coaching — Purpose | — (shortlist: `mountainwize.com`) | — |

**2026-09-04 correction:** the WP-service-park entries above were stale — re-checked all five live in-browser and they load their real hub content over https. Whatever fixed the parking issue happened outside a Claude session. Don't trust a "parked" diagnosis without re-verifying live first. Only `homestructionconsulting.com` remains actually broken (never added as a cPanel addon domain at all). Dash tab has a **Routing** column (`hubRoutingCell`, `HUB_SITES[].routing` / `.routingNote`); shared diagnosis is a comment above `HUB_SITES` in `index.html`.

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
| `buzzard-designs` | ✓ | — | `3c61f7d3a4bb8187a282ed3a66bc22e2` | `3c91f7d3a4bb8156ab38e2c2be62c110` |

## ChatGPT image generation → Asset thumbnail (on-demand, browser-driven)

Per operator direction: images are built in ChatGPT (the raw image API doesn't match chat results), so this drives chatgpt.com via Claude in Chrome — **not** a Worker automation, a repeatable interactive process:

1. Navigate to `chatgpt.com` (operator's own logged-in session), type an image prompt styled to the asset (verbatim slot Angle text as on-image copy), send.
2. Wait ~15–20s, then `find` and click the real **Download** button in the image's action row/dialog (NOT the small overlay icon — it doesn't reliably download).
3. File lands in Downloads as a GUID-named `.tmp` (extension skips the `.png` rename) but bytes are valid — confirm via magic bytes (`89 50 4E 47…`), move/rename out of Downloads.
4. Base64-encode and POST to the existing `uploadAssetThumbnail` action (`{assetId, fileName, contentType, fileData}`).
5. **Stop there.** This only fills the thumbnail — it does NOT flip Status to Published (manual step in the Publish Asset modal).

**Offer assets have an automated in-modal alternative** (2026-09-09): the Publish modal's **🖼️ Offer images** block generates an Instagram text-post background and a blog thumbnail via Kie.ai (Nano Banana / Seedream 4.0), no browser. Its **Regenerate** button copies the Claude-written prompt to the clipboard so the operator can bring it into this ChatGPT flow when the auto result isn't good enough. See the Strategy section's "Offer images" bullet and `docs/methods-titles-assets.md`.

## Security Notes

- `noindex, nofollow` on all admin microsites
- `X-Frame-Options: DENY` on all pages
- HMAC tokens expire after 8 hours
- GitHub repo should be private (pending)
- Rotate Notion integration token if ever exposed (pending)
