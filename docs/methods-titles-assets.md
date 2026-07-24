# Keywords → Strategy → Methods → Titles → Assets: how the content pipeline works

This documents the modals and generation logic behind the content system,
used on both campaign microsites (`microsites/{campaign}/index.html`) and
product sites (`productsites/{product}/index.html`).

## The flow

```
Keywords → Research fields → Products → Product Strategy → Methods → Platforms → Titles → Assets → Logins
```

1. **Keywords** — seed terms, sometimes clustered prose (see "Clustered
   Keywords" below), living in campaign Research and optionally on each
   Product's own Keywords field.
2. **Research fields** — Statement, Unique Opportunity, Key Message,
   Campaign Goal, Pain Points, trend research — campaign-level context.
3. **Products** — created under a campaign (Name, Type, Description, own
   Keywords).
4. **Product Strategy** — one record per product (Strategy DB, `Method`
   relation empty): Customer, Pain Points, Solution, Benefits, Emotions,
   Niche, Unique Opportunity, Offer Structure. The positioning doc.
5. **Methods** — reusable content recipes (Methods DB). Suggested against
   the Product Strategy once one exists (`suggestProductMethod`), or
   attached first and reconciled against whatever context already exists.
6. **Platforms** — the real Platforms DB (LinkedIn, Instagram, Substack,
   etc.) — a dimension independent of Method, picked explicitly when
   producing an asset.
7. **Titles** — planned deliverables (Content Strategy DB), generated the
   same way for every method type (see Modal 2).
8. **Assets** — the produced content for a Title (Assets DB), packaged for
   a Platform (see Modal 3).
9. **Logins** — a specific account instance of a Platform (Logins DB) — the
   actual publish target an Asset's `Login` relation points to.

A Method can be attached to a **Campaign** and/or specific **Products**
within it — separate relations. Attaching to a product does NOT
automatically make it usable at the campaign level, and vice versa.
`getProductResearch` (which supplies a product page's method list) reads
strictly the product's own `Methods` relation, no fallback to campaign-level
attachment — this is the most common source of "it's not showing up."

---

## Two things both called "Strategy" — don't conflate them

The Strategy DB holds two different records under one schema, distinguished
by whether `Method` is set:

- **Product Strategy** (`Method` empty) — the positioning doc, one per
  product. Built field-by-field via `generateStrategyField`, read via
  `getProductStrategy`. This is what step 4 above means.
- **Method Brief** (`Method` set) — a separate, per-method planning
  document. `saveMethodStrategy`/`getMethodStrategy`/
  `generateTitlesFromStrategy` are its actions, but **none of them have any
  active UI caller anymore** — this is a legacy display-only remnant.
  Existing Briefs still render read-only in a product's Strategy & Titles
  panel "for reference/cleanup," but nothing creates new ones.

Every Strategy DB query filters `Method: is_empty: true` when it wants the
real Product Strategy — both records share the same `Product` relation, so
querying by Product alone and taking the first result can silently return a
Brief instead. (This was a real bug, fixed across six call sites.)

---

## Two execution paths: dashboard (Worker) vs. skills (chat) — don't duplicate either

Everything above lives in the same Notion databases regardless of which path
created it. But there are genuinely **two different ways content gets made**,
and which one applies is a hard capability boundary, not a preference:

- **Dashboard / Worker path** — the campaign microsite's modals, calling
  `worker.js` actions over HTTPS. This is everything a Cloudflare Worker can
  actually do: Claude text-generation calls, Notion reads/writes, Apify
  scraping. It's fast, needs only the PIN, and is what Modal 2/3 below
  describe.
- **Skill path** (`.claude/skills/*.md`, run in a Claude Code **chat**
  session, never from a webpage button) — for the things a Worker
  fundamentally cannot do: a real, editable **Canva design** (needs the Canva
  MCP connector) or a real **video render** (needs local Node/ffmpeg/Remotion
  — hundreds of MB of packages, not something that runs at Cloudflare's edge).
  These skills read/write Notion directly via the **Notion connector** (no
  PIN needed) and use the Canva MCP / WebSearch / ElevenLabs as needed.

**Current skill → Method routing** (each skill's own file documents its full
workflow — this is just the map):

| Method name matches | Skill | Produces |
|---|---|---|
| `/carousel/i` | `make-carousel` | Trend research → original copy → real multi-page Canva carousel → logged to SM Posts |
| `text pic` | `make-text-pic` | One hook-driven line → real single Canva image |
| `Short Form Video` / "reel" | `make-reel-script` → `make-reel-video` | Filmable reel script → rendered MP4 (ElevenLabs voiceover + word-by-word captions + Ken Burns, via Remotion) |
| `Avatar Video` | `make-avatar-script` | Presenter-to-camera script for an AI-avatar reel (render step not built yet) |
| `Video Copy — Growth` | `make-video-copy` | Outlier-modeled original long-form YouTube script |
| (any) design specs | `create-design-specs` | Real Canva-backed Design Spec records (not just colors/fonts text) |

**The Generate Assets modal (Modal 3) is the router**, not a second
implementation: when the selected Method matches one of the rows above, it
shows a hint box with a **"Run `<skill>` in Claude"** button that opens
`claude.ai/new` with a prefilled prompt (title ID + campaign ID) — the skill
takes it from there. The dashboard's own generic `generateTitleAssets` path
(text-concept options + the grading gate below) stays available underneath
for every method **not** covered by a skill, and as a fast/no-connector
fallback even for ones that are (e.g. quick carousel text concepts, or
rendering an already-scripted title's slides in-browser via **Build
Carousel** — that's a different, still-valid thing from `make-carousel`: it
renders a title's *existing* slide script as PNGs client-side, no research,
no new copy, no Canva).

**Do not build a third implementation of anything in this table inside
`worker.js`.** A prior session did exactly that for design specs (a flat
OpenAI-generated "demo sheet" image) before discovering `create-design-specs`
already existed and did it better (a real editable Canva file) — it was
removed. If a method needs a capability a Worker can't provide, the answer is
a skill handoff, not a workaround.

**Known separate thing, not part of this pipeline:** `worker.js` also has a
Kie.ai-backed `generateVideo`/`generateImage` (Kling/Flux-2) pair, but it's
wired into the **root Hermes dashboard's SM Posts panel** (`dash/index.html`),
not the campaign microsite or this Method/Asset flow. Remotion (via
`make-reel-video`) is the real video path for content produced here — don't
reach for Kie.ai when building anything in this pipeline without a specific
reason to.

---

## Modal 1 — "Add Methods" (the `+` next to "Methods" / "Strategy & Titles")

Worker actions: `suggestProductMethod` (on open, now also grounded in the
Product Strategy's Customer/Pain Points/Solution/Unique Opportunity/Offer
Structure if one exists) → `searchMethods` (as you type) →
`addProductMethod` or `createAndAttachMethod` (on commit).

**On open:** shows methods already in this **product's own** `Methods`
relation, plus one AI suggestion.

**Search box:** searches the whole Methods DB by name. Clicking a result
**stages** it — not saved yet.

**"Add a brand-new method by name":** always creates a new Method page, no
dedupe check. Use search for anything that might already exist.

**"Add Methods" (commit)** — the only step that writes to Notion. For each
staged item: existing → `addProductMethod`; new → `createAndAttachMethod`.

**What `addProductMethod` does:**
1. Writes the method into the product's own `Methods` relation.
2. `propagateMethodToCampaigns` — adds it to the campaign's `Methods`
   relation too (a synced two-way relation with the Method's `Campaigns`
   property, so writing one side updates both).
3. `researchAndWriteMethodology` (best-effort) — **destructively rewrites**
   the method's page body if it has fewer than 3 top-level Phase headings.
   Give a hand-written method framework at least 3 top-level headings or it
   gets silently wiped on first attach.

---

## Modal 2 — "Generate Titles" (per attached method)

**One pipeline for every method type**, `generateMethodTitles`, except two
that keep dedicated live-research actions because they need real external
data a prompt can't provide:

| Method name matches | Worker action | What it does |
|---|---|---|
| `/carousel/i` | `researchAndGenerateCarouselTitles` | 10 titles + descriptions, optional live Instagram benchmarking |
| `/upwork/i` AND `/title\|market\|trend/i` | `researchUpworkMarketTitles` | seed keyword → real Upwork search phrases → live ad-count scrape → titles for active markets |
| everything else | `generateMethodTitles` → `saveMethodTitles` → per-title follow-up (`generateTitleSlides` for carousel-flagged titles, `generateTitleSubheads` for SEO Post) | titles for every Phase/Grouping in the method's own framework text |

There is no more Destination-vs-flat/traffic split. That used to route to
`generateTitlesFromProductStrategy` (one deliverable per phase) or
`generateTrafficMethodTitles` (post-type/sequence) based on the method's
"Needs Traffic Plan" checkbox — both still exist server-side but nothing
calls them. The method's own framework text already drives phase/grouping
shape generically, so a different code path per type wasn't needed.

**What `generateMethodTitles` merges in, for every method:**
- **Campaign Research** (Keywords, Statement, Unique Opportunity, Key
  Message, Campaign Goal, Pain Points, trend research) — included in
  **Blend** mode, excluded in **Isolate**.
- **Product page fields** (Avatar, Transformation, Offer Structure, Price,
  Proof Points, Objections, Unique Angle) + **Product Strategy**
  (Customer/Pain Points/Solution/Benefits/Emotions/Niche/Unique
  Opportunity/Offer Structure) — included whenever a product is selected,
  in **both** Blend and Isolate (Isolate only excludes campaign-level data).
- **Seed keyword** (optional, picked via the UI dropdown or typed) — steers
  what the model writes about. For **SEO Post specifically**, this is also
  a deterministic override: every title's grouping is forced to match it
  exactly, capped at 5 titles — that behavior is unique to SEO Post; for
  every other method a picked keyword is grounding, not a hard rule.

**Blend/Isolate and the seed-keyword picker** show in the Generate Titles
UI for every non-bespoke method (previously SEO-Post-only).

### Clustered Keywords

Research Keywords fields aren't always a flat comma list — some campaigns'
research phase produces clustered prose (`"CLUSTER category/trend hook:
term, term. CLUSTER comparison/decision: term, term..."`). A naive
first-comma split against that text grabs the cluster label, not a real
keyword. `getSeedKeywordCandidates` asks Claude to structure whichever
Keywords text exists (product + campaign) into clean groups exactly as the
source groups them — cluster labels preserved if present, one flat group if
not — and the picker UI renders it as `<optgroup>`s. The server-side
fallback (when no explicit pick arrives) also strips a leading `CLUSTER
<label>:` before taking a term, so it degrades to a real keyword either way.

---

## Modal 3 — "Generate Assets" (🧩, the only button left on a title row)

Worker action: `generateTitleAssets`. Same modal, same action, on both
surfaces, prefilled from `getTitleDetails`. This is now the **single**
per-title action — the old separate Build Carousel (🎨), Generate More
Titles (+), and Create Product From Title (♻) buttons were removed as
redundant entry points; see "Two execution paths" above for where their
functionality lives now (skill handoffs, or the title-generation dispatch
already covered by Modal 2 / a product's own Methods panel).

**On open, the modal shows:**
- **Existing assets already generated for this title** (from
  `getTitles`, which now attaches asset summaries at *any* title stage with
  linked assets, not just Publish-stage) — so you see what's already there,
  including its grade, before generating more.
- **Method/Product prefilled** from the title. If the Method matches a row
  in the skills table above, a hint box offers the real production skill;
  a carousel method additionally offers **Build Carousel** (render an
  existing slide script in-browser).

**Default generation behavior (most asset types):** N (1-8, default 4)
**distinct visual concept options** to choose between — Design Spec
colors/fonts, Canva query if the method is Drawing Post/Carousel-flagged
(Asset Type auto-suggests `drawing post`, still editable) — each run through
the **grading gate** below before being saved.

### The grading gate — every concept is graded by skill, not by a human

The last stage of `generateTitleAssets` (not a separate review step) scores
each concept 0-10 and only lets it through at **≥ 7**:
- **Strategy Fit (0-5)** — against the product's real Strategy record
  (Customer/Pain Points/Emotions/Benefits/Unique Opportunity/etc., falling
  back to campaign Statement/Unique Opportunity/Pain Points if no product is
  attached). Virality that ignores the actual positioning is not a pass —
  that's the reason Strategy exists.
- **Viral Form (0-5)** — must clearly execute one named hook framework
  (Reverse Hook, Contrarian Claim, Specific Numbers/Receipts, Curiosity Gap,
  Pattern Interrupt, Before/After Transformation, Social Proof).
- **Mechanical hygiene** — em-dashes and a banned-filler-word list are
  checked in **code** (`gradeMechanicalCheck`), not left to the model's
  judgment, and hard-cap the score at 5 if violated.

A failing concept gets regenerated with the grader's specific fix
instructions fed back in, up to `GRADE_MAX_ATTEMPTS` (3) total attempts.
Still-failing concepts are **saved anyway, never silently dropped**, but
tagged `Status = "Needs Revision"` instead of `"Ready"` (reusing the Assets
DB's existing, previously-unused `Status` field — separate from the
publish-pipeline `Asset Status` field). Grade score/notes are stored on
`Grade Score` / `Grade Notes`. The grade badge (✓ 8/10 / ⚠ 5/10) shows
wherever assets render — under a title and in the existing-assets panel.

**`assetType` matches `/seo post/i`** — different shape entirely, skips
grading (it's a single finished article, not concept options):
- Produces exactly **one** finished article, not N options.
- Uses the title's existing 3-subhead outline verbatim if present
  (written by the SEO Post title-generation follow-up), else writes 3 new.
- Full article written into the **Asset's page content** (blocks); the
  `Body` property just gets the intro as a preview.
- Created directly at **Publish** status, and flips the source Title to
  Publish too. `count` is ignored.
- **Blend/Isolate** here defaults to **Isolate** (its original behavior —
  title/description/keywords/outline only). **Blend** is opt-in and adds
  Campaign Statement/Unique Opportunity/Pain Points + Product
  Avatar/Transformation/Offer/Proof Points/Unique Angle as grounding.
  **Never includes the Product Strategy doc** — deliberately excluded.

**Platform and Login** (both asset shapes): a Platform picker (from the
real Platforms DB via `getPlatforms`) feeds the asset-writing prompt
("write for this platform's norms") and sets both the Asset's `Platform
Name` (quick-reference select) and its real `Platform` relation. A Login
picker, auto-filtered to accounts on the chosen Platform (`getLogins`'
`platformIds`), sets the Asset's `Login` relation — since a Login is one
specific account instance of a Platform. Both are optional.

**Design Spec picker** offers: an existing campaign spec, "Campaign
default," or **"✨ Generate new spec (opens Claude)"** — which hands off to
the `create-design-specs` skill (real Canva-backed spec) rather than
reimplementing spec generation in the Worker. There is no dashboard-native
"generate a new spec" action anymore — see "Two execution paths" above for
why.

**The Generate Assets modal also links the product's Strategy doc** (via
`getProductStrategy`) for the operator to reference manually — this is
purely informational, never merged into generation.

---

## Quick reference: where each field comes from

- **Campaign Research**: one Research DB record per campaign. Pulled into
  `generateMethodTitles` in Blend mode.
- **Product page fields** (Keywords, Avatar, Transformation, Offer
  Structure, Price, Proof Points, Objections, Unique Angle): properties
  directly on the Product page.
- **Product Strategy**: Strategy DB record, `Method` empty, one per
  product. Pulled into `generateMethodTitles` whenever a product is
  selected, and into `suggestProductMethod`'s method suggestion.
- **Method Brief**: Strategy DB record, `Method` set. Legacy — display only,
  not read by any active generation path.
- **Method's own framework page**: the Notion page body of the Method
  itself, read as free text by `generateMethodTitles`.
- **Platforms/Logins**: real relations on the Asset record (`Platform`,
  `Login`), set explicitly via the Generate Assets modal — not AI-guessed.
- **Grade Score / Grade Notes / Status** (Ready / Needs Revision): written
  only by the dashboard's `generateTitleAssets` grading gate. Content
  produced via a skill (chat path) writes straight through the Notion
  connector and does **not** currently pass through this grading — a real
  gap if you want every asset graded regardless of which path made it, not
  yet built.
