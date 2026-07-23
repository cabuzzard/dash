# Methods → Titles → Assets: how the content pipeline actually works

This documents the modals and generation logic behind the "Methods" system,
used on both campaign microsites (`microsites/{campaign}/index.html`) and
product sites (`productsites/{product}/index.html`). It exists because the
routing logic here is non-obvious — there are several different generation
pipelines that look similar from the UI but do very different things.

## The three layers

1. **Method** (Methods DB) — a reusable content "recipe." Its own Notion page
   body is the framework Claude reads when generating from it (e.g. "SEO
   Post," "Drawing Post," "Upwork Proposal," "carousel — Growth").
2. **Title** (Content Strategy DB) — one planned deliverable, produced from a
   Method. Starts at Status "Development."
3. **Asset** (Assets DB) — the actual produced content for a Title (image
   concepts, a written post, a carousel script). Starts at "Asset Status"
   Development, except where noted below.

A Method can be attached to a **Campaign** and/or specific **Products**
within it. These are separate relations — attaching to a product does NOT
automatically make it usable the same way at the campaign level, and vice
versa. This distinction is the single most common source of "it's not
showing up" confusion.

---

## Modal 1 — "Add Methods" (the `+` next to "Methods" / "Strategy & Titles")

Worker actions: `suggestProductMethod` (on open) → `searchMethods` (as you
type) → `addProductMethod` or `createAndAttachMethod` (on commit).

**On open:** calls `suggestProductMethod`, which returns methods already in
this **product's own** `Methods` relation (not the campaign's) plus one
AI-suggested method. These populate the list at the top of the modal.

**Search box ("Add existing method"):** searches the whole Methods DB by
name (case-insensitive substring). Clicking a result **stages** it into the
same list at the top — it is NOT saved yet.

**"Or add a brand-new method by name":** stages a `kind: 'new'` entry. On
commit this calls `createAndAttachMethod`, which **always creates a new
Method page** — there is no dedupe-by-name check. Typing the name of an
existing method here creates a duplicate. Use the search box instead for
anything that might already exist.

**"Add Methods" button (commit) — this is the step that actually writes
anything to Notion.** Nothing in the list above is saved until this is
clicked. For each staged item:
- `kind: 'existing'` → `addProductMethod` (only if not already in
  `PM_ORIGINAL_IDS`, i.e. wasn't already attached when the modal opened).
- `kind: 'new'` → `createAndAttachMethod`.

**What `addProductMethod` does, in order:**
1. Writes the method into the **product's own** `Methods` relation.
2. `propagateMethodToCampaigns` — reads the product's own `Campaigns`
   relation, and for each one, adds the method to **that campaign's**
   `Methods` relation too. (Methods DB's `Campaigns` property and Campaigns
   DB's `Methods` property are a synced two-way relation, so this shows up
   as the method having a `Campaigns` value even though the code only ever
   writes the Campaign side.)
3. `researchAndWriteMethodology` (best-effort) — **auto-researches and
   completely replaces the method's page body** if it looks "thin": fewer
   than 3 top-level Phase headings (`heading_1`/`heading_2` blocks), as
   found by `parseMethodPhases`. This is a destructive rewrite — it deletes
   every existing block and writes a freshly Claude-researched framework
   instead. **If you hand-write a method's framework doc, give it at least 3
   top-level headings**, or the first time it's attached to anything, your
   content gets silently wiped and replaced.

**Practical effect:** attaching a method to a product is what makes
"Generate Titles" appear for it on that product's Strategy & Titles panel.
Attaching to a campaign (only) makes it usable from the campaign microsite,
but invisible on any product page — `getProductResearch` (which supplies the
product page's method list) reads strictly the product's own `Methods`
relation, with no fallback to campaign-level attachment.

---

## Modal 2 — "Generate Titles" (per attached method)

This is NOT one code path. The client (`genPsTitles` on product sites,
`runMethodGenerate` on campaign microsites) branches on the **method's
name**, checked in this order, before falling back to a type-based default.
Both files must be kept in sync for a method to behave the same from either
surface — that de-sync is exactly what caused SEO Post to misbehave when
run from a product page while working fine from a campaign microsite.

| Method name matches | Worker action | Model | Grounded in |
|---|---|---|---|
| `/carousel/i` | `researchAndGenerateCarouselTitles` | 10 fixed titles + descriptions, optional live Instagram benchmarking | campaign+product keywords, existing trend research |
| `/upwork/i` AND `/title\|market\|trend/i` | `researchUpworkMarketTitles` | seed keyword → real Upwork search phrases → live ad-count scrape → titles for active markets | campaign/product keywords, live Apify scrape |
| `/seo post/i` | `generateMethodTitles` → `saveMethodTitles` → per-title `generateTitleSubheads` | up to 5 titles, one seed keyword, grouped together, each gets a 3-subhead outline | campaign research (always) **+** product strategy (if selected) **+** the method's own framework page |
| *(product page only)* method has "Needs Traffic Plan" checked (**Destination**) | `generateTitlesFromProductStrategy` | ONE deliverable per Phase in the method's own framework (`parseMethodPhases`), e.g. one title per major page section | the product's **Strategy doc** (Strategy DB record for this product×method), not raw campaign research |
| *(product page only)* everything else (**flat/traffic**) | `generateTrafficMethodTitles` | 2-4 "post types," each a rollout SEQUENCE with `sequenceOrder` | the product's Strategy doc + the method's researched growth Arcs |
| *(campaign microsite only)* everything else | `generateMethodTitles` → `saveMethodTitles` | titles for every Phase/Grouping literally found in the method's framework text | campaign research + product strategy (if selected) |

**Why the destination/flat split exists (product sites only):** a
Destination method (a landing page, a booking form) is component-based — a
page has a Headline, a CTA, a Guarantee — so titles come one-per-section
from a Strategy doc. A flat/growth method (Instagram, email) is arc/sequence
based — what matters is the STRUCTURE of a rollout, not a components list —
so titles come from `generateTrafficMethodTitles`'s post-type/sequence
model instead. **SEO Post is neither of these** — it's a third shape
(keyword → N discrete titles), which is why it needs its own explicit
branch rather than falling into either default.

**`generateMethodTitles` info merge (the SEO Post / campaign-microsite-generic
path):** always includes, unconditionally: Campaign name, Campaign Research
(Keywords, Statement, Unique Opportunity, Key Message, Campaign Goal, Pain
Points), and trend research if any exists on the campaign. If a product is
selected, it ALSO adds that product's Avatar/Transformation/Offer
Structure/Price/Proof Points/Objections/Unique Angle. **This merge is not
configurable per-call** — selecting a product adds product context on top of
campaign context, it never replaces it.

**Seed keyword for SEO Post specifically** (the one deterministic override,
not left to the model): explicit `seedKeyword` param, if passed → else the
selected product's own `Keywords` field → else the campaign's shared
Research `Keywords` field. Every title from one run is force-grouped under
whichever of these resolves, and capped at 5 titles regardless of what the
model returns.

---

## Modal 3 — "Produce Assets" (🧩, per title)

Worker action: `generateTitleAssets`. Reachable from both campaign
microsites and product sites — same modal, same action, prefilled from
`getTitleDetails`.

**Default behavior (most asset types):** generates N (1-8, default 4)
**distinct visual concept options** for the operator to choose between —
image/design-oriented (Design Spec colors/fonts, Canva query if the method
is "Drawing Post"), each saved as its own Asset at "Asset Status":
**Development** (awaiting review/pick), short `Body` (2000-char cap).

**Special case: `assetType` matches `/seo post/i`** — completely different
shape, triggered before any of the generic concept-generation logic runs:
- Produces exactly **one** finished article, not N options.
- Reads the title's existing page body first; if it already has a 3-subhead
  outline (written by the SEO Post title-generation step), uses those
  headings verbatim as the article's structure. Otherwise writes 3 new ones.
- Full article body (intro + 3 sections + conclusion) is written into the
  **Asset's own page content** (blocks), not the `Body` property — the
  property just gets a short preview (the intro).
- Creates the Asset directly at **Publish** status (no Development/review
  step), and also flips the **source Title's** own Status to Publish.
- `count` is ignored for this asset type.

---

## Quick answers to "where does X come from"

- **Campaign Research** (Keywords, Statement, Unique Opportunity, Key
  Message, Campaign Goal, Pain Points, trend research): one record per
  campaign in the Research DB. Always pulled into `generateMethodTitles`.
- **Product's own fields** (Keywords, Avatar, Transformation, Offer
  Structure, Price, Proof Points, Objections, Unique Angle): properties
  directly on the Product page. Used by every product-scoped generator
  (`generateTitlesFromProductStrategy`, `generateTrafficMethodTitles`, and
  now the SEO Post seed-keyword resolution in `generateMethodTitles`).
- **Product's Strategy doc**: a separate Strategy DB record, one per
  product×method, containing the actual worked-out positioning/copy for
  that method. Only `generateTitlesFromProductStrategy` and
  `generateTrafficMethodTitles` read this — `generateMethodTitles` (the SEO
  Post path) does not, it reads the Method's framework page instead.
- **Method's own framework page**: the Notion page body of the Method
  itself. Read as free text by `generateMethodTitles` (loose,
  prompt-injected) and as strictly-parsed Phase/Grouping blocks by
  `parseMethodPhases` (used by the Destination and flat/traffic paths, and
  by the "already researched, don't auto-rewrite" check).
