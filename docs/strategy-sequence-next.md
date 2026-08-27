# Strategy Sequences → "Next" → publishing automation

**Status:** design draft, not built. Supersedes the title-driven behaviour of
`getNextSlots` and `runStrategySequenceReminders`.

## Purpose and the invariant

Every published asset must have a *reasoning* and a *next step*. Nothing gets
published and then left alone. For each published asset the system can always
answer: **what is the next asset to create, on what platform, in what form,
and when** — or explicitly, "nothing, this line is complete."

The "Next" section of the Development tab is the live view of that. The
end goal is an **automation engine**: each "next" row is a job spec a content
publishing agent picks up as a cron job and executes.

## What's wrong today

`getNextSlots` (`worker.js` ~9129) and `runStrategySequenceReminders`
(`worker.js` ~3246) both start from **titles** with
`Status ∈ {Publish, Published}` and a non-empty `Strategy Slot` relation.

- Titles almost never reach Publish/Published — a title sits in Development
  for a long time while its assets roll out. So the query returns ~nothing.
- A Strategy Slot today represents a planned **title/angle**, not an asset.
  There is no asset-level sequence.
- "Latest in line" is keyed off title `last_edited_time`, not asset publish
  recency.

The title is only a **bridge**: published asset → `Content Strategy` relation
(title) → title's strategy placement. The sequence logic lives at the asset
level, not the title level.

## Target model

### Hierarchy

- **Standalone strategy** (one platform) — a single asset line.
- **Composite strategy** (multi-platform) — a parent Growth Strategy with one
  **platform sub-strategy** per platform, each its own asset line. Reuse the
  existing `Parent Strategy` relation on `GROWTH_STRATEGY_DB`; a sub-strategy
  is a child Growth Strategy record.
  - Sub-strategies **reuse** the parent's methodology by default. If a
    platform needs a genuinely independent methodology, that's a signal it
    should break off into its own standalone strategy rather than live as a
    child.

### A Slot is one planned asset

`STRATEGY_SLOTS_DB` shifts from "planned title/angle" to "planned asset":

- **One slot ↔ exactly one asset.** Hard rule. `Sequence` is the asset-level
  position within its sibling group (1..N).
- **Slots nest (parent/child).** New `Parent Slot` self-relation, mirroring
  `🗂️ Assets.Parent Asset`. Nesting means **one piece of written content
  repurposed across platforms**: parent slot = the source asset, child slots =
  the same writing re-cut for other platforms (carousel → thread → clip).
  All under **one title**. `Sequence` + next-logic run **within a sibling
  set** — the top-level slots of a line, or the children of one parent — not
  across the whole line flat.
- **Different writing per platform ≠ nesting.** When the strategy calls for
  genuinely different content per platform, that's **separate titles**, each
  with its own slot(s), siblings at the line level — no `Parent Slot` between
  them.
- `Title` relation — kept, and is the grouping key (there is no wrapper slot
  for a title). A title owns either one slot, a flat sibling run, or a
  parent + its repurposing children.
- `Platform`, `Method Name`, `Type`, `Angle` — as today.
- `Name` — convention becomes `{Platform} – {Type} #{Sequence}`
  (e.g. "Instagram – Carousel #3", "X – Thread #7"). Angle/Method stay in
  their own fields, not the name.
- **Timing** — a relative offset, not an absolute date:
  `Delay` = "how long after the previous asset in this line publishes"
  (e.g. `+1d`, `+3d`, `+1w`). The plan carries no calendar dates; due dates
  are always derived from the actual publish timestamp of the preceding asset.
- **Repetition** — per slot, not per line:
  - one-time slot — fires once, then the line advances past it.
  - repetitive slot — carries a repeat timeframe (`Repeat` = `1w`, etc.).
    After its asset publishes, the same slot re-emits, due at
    `publish + Repeat`. A repetitive slot can sit mid-sequence or be the tail.
- **Status** — `Open` → `Filled` (asset created) → `Published` (asset live).
  A repetitive slot cycles back to a due state after each publish.

### Slot ↔ Asset binding

Today a Slot links only to a Title. Add the asset-level link so "which planned
assets are done" is precise, not inferred by counting:

- On asset publish: bind the Asset to its Slot via a new **dual relation**
  `🗂️ Assets.Strategy Slot` ↔ `🎯 Strategy Slots.Asset`, advance the Slot's
  `Status` to `Published` (new option), and rely on the **existing**
  `🗂️ Assets.Publishing Date` (date) for the publish timestamp — fall back to
  `Last Edited` (last_edited_time) when it's unset.

---

## Field reference (LOCKED)

Names verified against Notion 2026-08-26. Data-source (collection) IDs:

| DB | collection id |
|---|---|
| 🎯 Strategy Slots | `e695949a-ed47-4de0-8489-27f92d7e470a` |
| 🗂️ Assets | `40a47fc9-4550-4a71-b0f7-f2afb8e45f63` |
| 🚀 Growth Strategy | `013c5e25-8ed9-4902-befc-90196ae97276` |
| 📝 Content Strategy (Titles) | `125304a0-e986-48f1-8e66-36289c72b29e` |

### 🎯 Strategy Slots — exists today

`Name` (title) · `Angle` (text) · `Grouping` (text) · `Platform` (text) ·
`Type` (text) · `Method Name` (text) · `Recurrence` (text) ·
`Sequence` (number, stored FLOAT) · `Status` (select: **`Open`, `Filled`** only) ·
`Growth Strategy` (rel → GS) · `Title` (rel → Titles) · `Title 1` (rel → Titles) ·
`Campaign` (rel) · `Product` (rel)

- `Title` **and** `Title 1` both relate to Titles. The worker only ever writes
  `Title` (`worker.js` 4111, 9480, 9668, 9780); `Title 1` is the auto-created
  dual of `📝 Content Strategy.Strategy Slot` and goes unused. Drop `Title 1`;
  keep `Title` as the single slot↔title link.
- **Reuse `Recurrence`** as the repeat-timeframe on repetitive slots (already
  text, already fed to `parseRecurrenceDays`).
- **Reuse `Sequence`** as the asset-level position (FLOAT → fractional inserts
  like `5.5` are possible without renumbering).

### 🎯 Strategy Slots — to add

| Field | DDL type | Purpose |
|---|---|---|
| `Delay` | `RICH_TEXT` | offset from the previous asset's publish to this asset's due date, e.g. `+3d`, `+1w`; parsed by `parseRecurrenceDays` |
| `Asset` | `RELATION('40a47fc9-4550-4a71-b0f7-f2afb8e45f63', DUAL 'Strategy Slot' '<id>')` | the published asset that filled this slot |
| `Parent Slot` | `RELATION('e695949a-ed47-4de0-8489-27f92d7e470a', DUAL 'Child Slots' '<id>')` | this slot's asset is derived from the parent slot's asset; mirrors `Assets.Parent Asset` |
| `Guideline` | `RICH_TEXT` | operator's free-text intent for a folded-in / recurring slot ("repeat one of these weekly"), read separately from the creative `Angle` |
| `Status` | `ALTER COLUMN "Status" SET SELECT('Open':green,'Filled':gray,'Published':green)` | add the `Published` state |

Also `DROP COLUMN "Title 1"`.

### 🗂️ Assets — exists today (relevant)

`Asset Title` (title) · `Asset Status` (select: `Publish`, `Published`,
`Delete`, `Development`) · `Publishing` (select: `Not Started`,
`Ready to Publish`, `Scheduled`, `Published`) · `Publishing Date` (date) ·
`Last Edited` (last_edited_time) · `Asset Type` (select — incl. `carousel`,
`text video`, `explainer video`, `avatar video`, `listing`, `carousel — … CSV Export`) ·
`Platform Name` (select) · `Platform` (rel) · `Content Strategy` (rel → Titles,
**the bridge**) · `Parent Asset` (self-rel)

- `Publishing Date` **already exists** — no new date field needed. Verify the
  publish paths actually set it (`worker.js` ~11067/11240/11421/11588 +
  status→Published transitions).

### 🗂️ Assets — to add

| Field | DDL type | Purpose |
|---|---|---|
| `Strategy Slot` | `RELATION('e695949a-ed47-4de0-8489-27f92d7e470a', DUAL 'Asset' '<id>')` | which planned slot this asset fills |

### 🚀 Growth Strategy — no schema change

`Parent Strategy` (self-rel) **and** `Sub-Strategies` (self-rel) duals both
already exist. A platform sub-strategy = a child GS record with
`Parent Strategy` set. `Recommended Platforms` (multi_select), `Platform Override`
(text), `Status` (`Draft`/`Approved`/`Archived`), `Titles` (rel) all present.

### 📝 Content Strategy (Titles) — no schema change

Bridge + sequence fields all present: `Growth Strategy` (rel) ·
`Strategy Slot` (rel → Slots) · `Assets` (rel → Assets) · `Grouping` (text) ·
`Type` (text) · `Sequence Order` (number) · `method` (rel → Methods) ·
`Format` (select) · `Status` (select: `Planning`, `Development`, `Review`,
`Publish`, `Published`, `Writing`, `Done`, `Approved`, `Explode`, `Pillar`) ·
`Post Type` (select: `Pillar`, **`Sequential`, `Recurring`, `One-off`**,
`sm post`).

- `Post Type` (`Sequential`/`Recurring`/`One-off`) **stays** as a title-level
  summary. Repetition is still driven per-slot by `Recurrence`/`Delay`; the
  title-level value is a human-facing label, not the engine's input.

## Next-logic

Computed fresh every run from **actually-published assets** — never assumes
the plan was followed (see "Reality" below).

For each published asset:

1. Asset → `Content Strategy` (title) → the Slot it filled → its `Sequence`
   position, its **sibling set** (same `Parent Slot`, or top-level of the same
   line), and its line (Growth Strategy / sub-strategy).
2. If the slot is **repetitive** (`Recurrence` set): emit that same slot again,
   due at `assetPublishDate + Recurrence`.
3. Else look for the slot at `Sequence + 1` **in the same sibling set**:
   - found → emit it as the next asset: `{ line, title, platform, method,
     type, angle, dueDate = assetPublishDate + nextSlot.Delay }`.
   - none → this sibling set is done. If the set was a child group, resume the
     parent's set at `parent.Sequence + 1`; if it was top-level, **line
     complete** — emit nothing.
4. De-dupe: one pending "next" per active sibling set (its frontier), rolled up
   to one row per line in the UI.

**Cold start.** A top-level sibling set with Open slots but *no published
asset yet* (a freshly planned strategy) surfaces its lowest-`Sequence` Open
slot as "start here" (`isColdStart: true`, due today). Without this, a new
30-slot strategy is invisible in NEXT until its first publish.

`runStrategySequenceReminders` writes exactly one Main TD item per active
line's frontier, idempotent by re-derivation (archive-and-replace a stale
one, leave a correct one alone) — same discipline it has now, new inputs.

### Data reality check (2026-08-26, at Phase 3 deploy)

668 titles exist; **8** have a `Growth Strategy`; **0** of those 8 has a
`Published` asset. 30 published assets trace to titles with no strategy at
all. ~10 Growth Strategies hold 130 slots (118 Open); 4 of them have slots but
no titles. So pre-fold-in, NEXT legitimately shows ~1 frontier + the
cold-start rows. Populating it for real is Phase 5 (regen at asset level) +
Phase 6 (`adoptIntoStrategy` / backfill of the 30 orphaned published assets).

## Reality: assets created outside the plan

The dominant workflow is **inspiration-driven, not plan-driven**: the operator
sees a slot in an existing strategy, it sparks an idea, they go produce content
somewhere else, and then that already-made content has to be **folded back
into** a strategy — new or existing. So the system optimises for *adopting
content that already exists*, as much as for planning ahead. Every published
asset must still end up as a slot in *some* strategy — nothing is
strategy-less.

**Next is always re-derived** from the real published-asset set, so an
out-of-order publish just moves the frontier.

### Strategy control on the Generate Asset modal

When an asset is created (or an existing/published one is being adopted), the
modal carries a **Strategy** choice (mirrors how method features attach here —
title → modal → generate → publish):

1. **Fold into an existing strategy** *(default)* — as either:
   - a **new slot** appended/inserted in the title's Growth Strategy (child
     slot for a repurposing, or fractional `Sequence` in the sibling set), or
   - a **replacement** of a named open slot ("replace slot X in strategy X
     with something of this type") — the existing slot's `Type`/`Platform`/
     `Angle` are overwritten and the adopted asset fills it.
2. **New strategy for it** — a fresh Growth Strategy (parallel rollout, or a
   loose collector). It's defined by the **guidelines the operator writes into
   it**, not a fixed template — e.g. "repeat one of these types each week"
   becomes a recurring slot (`Recurrence` + `Type` set, `Angle` carrying the
   free-text intent).

Both paths write the operator's stated intent into the slot's `Guideline`
field so the automation engine and a future run can read *why* the slot exists
and how it should recur.

**The modal is a text box, not a form.** What "replace slot X" actually does
— keep vs. overwrite `Sequence`/`Delay`/`Parent Slot`/`Type`/`Platform`, same
slot page or archive-and-reinsert — is dictated by what the operator types
("replace slot 4 with an X thread, keep the timing"), interpreted at fold-in
time (a Claude call in the worker, same pattern as `refineAssetManifest`).
No fixed merge rule.

Backing action: `adoptIntoStrategy` — takes a title or an existing asset (any
status, including already-published) plus the operator's free-text
instruction, and resolves it to one of {new slot, edit/replace an existing
slot, new strategy} with `Guideline` + `Recurrence` set. Also covers legacy
backfill (extends `backfillLegacyStrategy` from title/method level down to
asset-level slots).

## Changes required

| Area | Change | Schema? |
|---|---|---|
| 🎯 Strategy Slots | add `Delay` (text), `Asset` (dual rel → Assets), `Parent Slot` (self dual rel), `Guideline` (text), `Status` option `Published`; drop stray `Title 1` rel; reuse `Recurrence` + `Sequence`; `Name` → `{Platform} – {Type} #{Sequence}` (code only) | 6 DDL stmts |
| 🗂️ Assets | add `Strategy Slot` (dual rel → Slots); `Publishing Date` already exists | 1 DDL stmt |
| 🚀 Growth Strategy | none — `Parent Strategy`/`Sub-Strategies` duals already exist | — |
| 📝 Content Strategy | none — `Growth Strategy`, `Strategy Slot`, `Grouping`, `Type`, `Assets`, `Sequence Order`, `Post Type` all exist | — |
| `generateGrowthStrategy` | emit an **asset-level** slot sequence per line (each slot: `Platform`/`Type`/`Method Name`/`Delay`/`Recurrence`), slots mapped to their title's sibling run; support nested child slots | code |
| asset↔slot binding | `reconcileAssetSlots` helper, run from `getNextSlots` + the cron (not per publish-path) — binds `Published` assets to open slots, sets `Publishing Date` | code |
| Generate Asset modal (template sources + root `index.html`) | add **Strategy** text control (fold-in / replace slot X / new strategy) → `adoptIntoStrategy` | code |
| `getNextSlots` (`worker.js` ~9129) | rebuild: iterate `Asset Status ∈ {Publish, Published}` assets, walk `Content Strategy`→title→`Strategy Slot`→next slot in sibling set | code |
| `runStrategySequenceReminders` (`worker.js` ~3246) | same rebuild; keep idempotent Main TD reconciliation | code |
| new action `adoptIntoStrategy` | adopt a title or existing/published asset → new slot / replace slot X / new strategy, + optional guideline & `Recurrence`; backs the modal control + legacy backfill | code |
| Development tab "Next" UI (`index.html` ~10507) | group Stack → Product → Strategy → Sub-strategy (platform) → frontier row | code |

## Automation endgame

Once "Next" is a reliable per-line frontier with a real due date and a full
job spec (platform, method, type, angle, title, login target), a publishing
agent consumes those rows as cron jobs:

- due today and `Open` → generate the asset, package for the platform,
  publish, mark the slot `Published`, stamp the date.
- the next run re-derives the frontier and the line advances on its own.

This doc stops at "the frontier is trustworthy and machine-readable." The
agent/cron that acts on it is a separate build.

## Open decisions

**Resolved while locking names:**

- Slot ↔ Asset — a **dual relation** `🗂️ Assets.Strategy Slot` ↔
  `🎯 Strategy Slots.Asset`; it exists on both sides regardless, naming locked.
- `Delay` / repeat format — **plain text** (`+3d`, `1w`), parsed by the
  existing `parseRecurrenceDays`. Repeat reuses the existing `Recurrence`
  field; `Delay` is the new field.
- Ad-hoc insertion — **fractional `Sequence`** (`5.5`); `Sequence` is already
  FLOAT, so no renumber cascade. A later normalise pass can renumber.

**Resolved with operator (2026-08-26):**

- One slot ↔ exactly one asset.
- **Nesting = same writing, repurposed across platforms** — parent slot is the
  source asset, children are the re-cuts, all under one title. Different
  writing per platform = separate titles, not nesting. No wrapper slot for a
  title.
- `generateGrowthStrategy` maps titles to slot runs **up front**; later assets
  append/insert/replace slots via the Generate Asset modal's Strategy control.
- Fold-in is **guideline-driven**, not a fixed bucket template: the operator
  writes intent ("repeat one of these weekly", "replace slot X with this
  type") onto the slot/strategy; new strategies created this way are shaped by
  those guidelines.
- Workflow is inspiration-driven — `adoptIntoStrategy` must adopt
  already-produced / already-published content, not just plan forward.
- `Post Type` on Titles stays as a human-facing summary label.
- Drop `Title 1` from Strategy Slots; keep `Title`.
- Add a dedicated `Guideline` text field on Strategy Slots (not overloading
  `Angle`).
- Fold-in / "replace slot X" is driven by free text the operator types in the
  modal, interpreted by a worker Claude call at fold-in time — no fixed
  field-merge rule.

**Still open:** nothing blocking.

---

## Implementation plan

Ordered so each phase is independently verifiable and nothing half-works.
`node --check` is **not** trusted for `worker.js` — every worker phase ends
with `cd worker && npx wrangler@4 deploy --dry-run` (clean "Total Upload" line,
no `[ERROR]`), per CLAUDE.md.

### Phase 1 — Notion schema (DDL, one-time)

Data source ids: Slots `e695949a-ed47-4de0-8489-27f92d7e470a`,
Assets `40a47fc9-4550-4a71-b0f7-f2afb8e45f63`.

1. ~~Pre-check + drop `Title 1`~~ — **deferred.** `Title 1` mirrors `Title` on
   8 live rows and its dual pairing isn't cleanly understood; the drop is
   cosmetic. Leave it; the rebuild reads title→`Strategy Slot`, never the
   slot's `Title 1`.
2. Slots (additive, done 2026-08-26): `ADD COLUMN "Delay" RICH_TEXT`,
   `ADD COLUMN "Guideline" RICH_TEXT`,
   `ADD COLUMN "Asset" RELATION('40a47fc9-4550-4a71-b0f7-f2afb8e45f63', DUAL 'Strategy Slot' 'strategy_slot')`,
   `ADD COLUMN "Parent Slot" RELATION('e695949a-ed47-4de0-8489-27f92d7e470a', DUAL 'Child Slots' 'child_slots')`,
   `ALTER COLUMN "Status" SET SELECT('Open':green,'Filled':gray,'Published':blue)`.
3. Verify with a fresh `fetch` of the Slots data source; confirm
   `Assets.Strategy Slot` auto-appeared on the Assets side.

### Phase 2 — asset↔slot binding by reconciliation — DONE (folded into `getNextSlots`)

`Asset Status` is written in ~20 scattered places and assets are *born* as
`Publish`, so per-path instrumentation is fragile and the "born published"
default would wrongly count unmade assets. Instead bind during the same
re-derivation `getNextSlots` / the cron already do:

- Helper `reconcileAssetSlots({ campaignId? }, env)` — for every asset with
  `Asset Status = Published` whose title has a `Growth Strategy`: if the asset
  has no `Strategy Slot`, attach it to the best-matching open slot in the
  title's sibling set (match on `Platform`/`Type`, else lowest open
  `Sequence`); set that slot `Status = Published` and its `Asset`; set the
  asset's `Publishing Date` if empty.
- **`Published` (not `Publish`) is the trigger** — `Publish` just means "ready
  in the queue", `Published` means live. Next-logic keys off `Published` +
  `Publishing Date`.
- Called at the top of `getNextSlots` and `runStrategySequenceReminders`, and
  standalone by `adoptIntoStrategy`.
- Dry-run. No behaviour change to the UI yet.

### Phase 3 — worker.js: `getNextSlots` rebuild — DONE (needs dry-run + deploy)

Implemented at `worker.js` ~9130. `node --check` passes; **wrangler dry-run
not runnable in this env** — run `cd worker && npx wrangler@4 deploy
--dry-run` before `npx wrangler deploy`. Added `parseDelayDays` helper next to
`parseRecurrenceDays`. Reconcile capped at 25 writes/call.

- New algorithm from **Next-logic** above: start from `ASSETS_DB` where
  `Asset Status = Published`, walk `Content Strategy` → title →
  `Strategy Slot` → sibling set → next slot / recurrence / parent-resume /
  line-complete. Due date = asset `Publishing Date` (fallback `Last Edited`)
  `+ nextSlot.Delay`.
- Keep the response shape (`{ success, next: [...] }`) and the existing
  Product/GS/Campaign resolution + grouping fields so the current UI keeps
  rendering; add `subStrategyId`/`subStrategyName` for the new grouping level.
- Dry-run, then hit it against live data and eyeball the frontier.

### Phase 4 — worker.js: `runStrategySequenceReminders` rebuild

- Same asset-driven derivation; one Main TD per active sibling-set frontier;
  keep the idempotent archive-and-replace reconciliation.
- Dry-run.

### Phase 5 — worker.js: `generateGrowthStrategy` → asset-level sequence

- Extend the Claude response schema: each grouping returns an ordered
  `assets: [{ platform, type, method, angle, delay, recurrence, parentIndex }]`
  instead of a bare `titles: []`. `parentIndex` (nullable) = "same writing as
  asset N, repurposed" → becomes `Parent Slot`.
- `createSlotsFor` writes one slot per asset entry, `Sequence` in order,
  `Name = {Platform} – {Type} #{Sequence}`, `Parent Slot` from `parentIndex`,
  `Delay`/`Recurrence`/`Guideline` set. Title→slot: create/attach one title
  per distinct writing, relate all its repurposing slots to it.
- Keep `titles: []` accepted as a fallback (old prompt shape) for one release.
- Dry-run.

### Phase 6 — worker.js: `adoptIntoStrategy` action

- Input: `{ titleId? , assetId? , instruction, campaignId, productId }`.
- One Claude call turns `instruction` + current strategy/slot context into a
  resolved op: `new_slot` | `edit_slot` | `new_strategy` with concrete field
  values + `Guideline` + `Recurrence`.
- Applies it (fractional `Sequence` for inserts; same slot page for
  edit/replace unless the instruction says otherwise), binds the asset if one
  was passed, returns what it did.
- Also the backfill entry point for legacy published assets with no slot.
- Dry-run.

### Phase 7 — Generate Asset modal: Strategy control

- Template source files only: `microsites/hard-grind/index.html` and
  `productsites/operator-resilience-intensive/index.html` (per CLAUDE.md), then
  run `sync_microsites.py` / `sync_productsites.py`. Root `index.html`'s
  `openNewAssetModal` (Publishing tab) gets the same control.
- A text box + mode select (fold-in / replace slot / new strategy) → calls
  `adoptIntoStrategy` on submit.

### Phase 8 — Development "Next" UI — partly done

- DONE: NEXT gained a Campaign grouping level (above Stack), START/RECUR
  badges, guideline tooltips. Sub-strategy grouping comes free from the
  existing parent→child strategy resolution.
- DONE: "Last 30 Published" reworked from a flat sortable table into a
  nested default-collapsed tree — Campaign → Product Stack → Product →
  Strategy → rows by publish date desc. `getPublishedAssets` enriched with
  `productName`/`productStack`/`strategyName`/`publishedDate` (resolved via
  each asset's Content Strategy title → product + Growth Strategy).

### Rollout

Phases 1–4 are shippable together and immediately fix the "one row" bug.
5–8 layer on the planning/fold-in side. Each worker deploy:
`cd worker && npx wrangler deploy`.
