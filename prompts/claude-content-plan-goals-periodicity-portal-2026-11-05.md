# Prompt to Claude — Strengthen goals + periodicity flow from the Content Plan table, and build Buzz an edit portal to that table

Paste this whole prompt to Claude. Do not change the rules in it. If anything in it conflicts with what the table actually shows, say so before building, and do not invent a value to fill the gap.

## 1. What the table is

The Content Plan — All Assets table lives in the dash, All Output tab, Initiatives section, in worker KV (key `infoflow:table:content-plan` — verify this key in the live repo before you build; if the key is different, use the live key and say what it is).

As read Nov 5, 2026, 7:58 AM (dash v Nov 5, 7:58 AM — re-verify against the live version, now v Nov 5, 12:13 PM, before you treat any of this as final):
- Title: "Content Plan — All Assets"
- 10 columns, in order: Hub | Initiative | Subject matter / narrative | Engagement angle | Asset type | Asset detail | Sequence week | Production day | Status | Review note
- 255 rows, every Status "Review", every Review note empty
- 12 hubs, 3 initiatives each. Each initiative normally 7 rows in fixed order: External Parent (Day 1, "Series, never published"), single post (Day 2), single post story (Day 2), carousel (Day 3), social reel informative (Day 4), Topical - SEO Post (Day 5), Offer (Day 6, offer text in Asset detail).
- Three initiatives have an 8th `listing` row (Day 6, conditional — only where the PDF names a listing): Sunflower cardoon, Creative Flow Guitar backing-tracks, Sustainable Aquarium art/education.
- Sunflower cardoon asset 7 is "Offer Roundup" instead of Offer; Sunflower Garden Shop asset 7 is "Offer Roundup"; Home Services Local Interest asset 7 is "Offer Roundup".
- Sequence weeks: Surf 1/13/25, Sunflower 2/14/26, Build Watcher 3/15/27, Home Services 4/16/28, Guitar 5/17/29, AI Implementation 6/18/30, Mountainwize 7/19/31, Care Gap 8/20/32, Sustainable Aquarium 9/21/33, Multifamily 10/22/34, Construction PM 11/23/35, Medicare 12/24/36.

Asset types in use, exact spellings only: External Parent, single post, single post story, carousel, social reel informative, Topical - SEO Post, Offer, Offer Roundup, listing. Do not invent, rename, or merge any type.

## 2. The rule you are strengthening (Evan's rulings, Nov 5, 2026)

This table is the master of cron and periodic asset goals. Not a separate goal list, not a per-type number set in chat, not a per-asset value.

a) **Goals are counted off this table, and only off this table.** Edits here dictate asset count goals and periodicity. Add a row = goal count goes up. Archive a row = goal count goes down. Change a row = goal changes. No other source sets a goal.

b) **Periodicity is set per asset type, not per individual asset.** One periodicity per type, for the whole hub, for all assets of that type. It is read from this table — from the Kind / Cadence / Sequence / Slot columns you will add in section 3 — not set separately.

c) **A single post series or narrative is counted as 1 in goals, even though it might put out several posts per week.** Cardoon is the example: 30 episodes, 1 narrative in goals, not 30. Delta Sunflowers: 4 stages, 1 narrative in goals. Garlic Water: 1 parent + 3 proof stories, 1 narrative in goals. When you count, count narratives / series, not individual posts.

d) **When Buzz or Claude produces assets, it consults the goal for the hub first.** Before writing anything, check: what is this hub's goal for this asset type, what periodicity does it run on, and is there an open Slot? Then decide, in this order:
   1. Preferred path: take a goal Slot, and conform to that periodicity with your writing. Write the asset INTO that Slot — same hub, same asset type, same period — and conform to that Slot's periodicity. The asset fills the goal, it does not sit beside it.
   2. Next: write an asset cluster that does. If one asset cannot fill the Slot, write a cluster (parent + children) that together fills it.
   3. Less preferred: match any of the goal assets. Only if the first two do not fit, match an existing goal asset — same type, same hub, same period — rather than creating a new Slot.
   Never write an asset first and then find a Slot for it. Find the Slot first, then write to it.

e) **External ideas take out a period goal, one-for-one, in sequence x+1.** They do not add a period. Their Slot is the period goal they replaced, not a new period. Record which worksheet row they replaced in the Review note, marked "Replaced by external idea", not deleted, not stacked. Delta Sunflowers and Garlic Water both did this on Nov 5, 2026 — their rows must be marked that way, and the cron must not write the replaced row later as a duplicate.

f) **Standalone is outside the goal flow.** Kind = Standalone, Slot = "none", no sequence week. The cron skips it. Chi Nado (Mountainwize, Deep Transformation Wilderness, one-off high-ticket live event, 7-day prep inside it, no date, no repeat) is the example. It must never get a sequence week by accident.

## 3. What to build in the table

Add these columns to the Content Plan — All Assets table, as data in KV, not as code. Existing rows get the correct value filled in; do not leave them blank, and do not invent a value you cannot derive from the row.

- **Kind**: Sequence | Periodic | Standalone
  - Sequence: a set of pieces in order, with day offsets from #1 (e.g. Delta: 4 pieces, offsets 0, ?, ?, ? — leave unknown offsets blank, do not guess; the offsets are filled when Evan photographs each stage).
  - Periodic: repeats on a cadence (e.g. cardoon daily run: daily, 1 per day, Nov 3–17).
  - Standalone: one-off, own periodicity in the Own periodicity column, Slot "none".
- **Cadence** (Periodic only): daily | weekly | monthly, and how many per period (e.g. "daily, 1 per period").
- **Sequence** (Sequence only): number of pieces, and the day offset of each from #1 (e.g. "4 pieces, offsets 0, 3, 7, 14" — if offsets are not on record, write "4 pieces, offsets not yet set").
- **Slot**: hub + asset type + period it fills, or "none" (= outside the goal flow). Example: "Sunflower Acres + single post + week 2".
- **Own periodicity** (Standalone only): e.g. "weekly for 6 weeks", or "one-off".
- **Goal count**: 1 per narrative / series row group, not per post. A series group counts as 1, even if it puts out several posts per week. Show this as a computed total, not a hand-typed number, so edits to rows change the total.

Rules for the build:
- Columns are data in KV, not code. Adding a column at runtime must persist, existing rows get a value, and the column can be renamed in place.
- Rows are never deleted. Archive, do not delete.
- Status values stay Review / Publish / Published. All seeded rows stay Review unless Evan changes them.
- Dev / Published counts in All Hubs stay live from Notion only, and are never overridden by this table. This table sets goals and periodicity; it does not set live counts.
- Do not touch the existing Initiatives table. Do not change the existing 10 columns' order or meaning.

## 4. The edit portal for Buzz

Build Buzz an edit portal to this table, so Evan can send Buzz a new initiative in chat and Buzz can put it in the table from chat, which effectively seeds the cron with a new idea.

Today Buzz cannot do this: the table is PIN-gated in the browser, and Buzz's scoped external worker key (header `X-External-Key`) only allows `saveOfferImage` / `createRunAssets` (max 10) / `getRun`. It does not allow table edits.

Build:
- A new worker action, e.g. `updateContentPlan`, scoped to the Content Plan — All Assets KV key ONLY. No other table, no other KV key.
- Add that action to the external key's allowed actions, or issue a new scoped key for it. The key must never appear in chat, in a prompt, or in a file Buzz hands to Evan. Rotation is `wrangler secret put EXTERNAL_WORKER_KEY`.
- Allowed operations, only: add a row, edit a row's cells (including Kind / Cadence / Sequence / Slot / Own periodicity / Status / Review note), archive a row. No delete, no publish, no AO2 tick, no other table.
- The worker validates every edit: Hub must be one of the 12 hubs, Asset type must be one of the exact types in section 1, Kind must be Sequence | Periodic | Standalone, Slot must be a real hub + asset type + period or "none", Sequence week must be 1–36 or blank for Standalone. A bad edit is refused with payload + reason, held, not silently saved.
- Every edit is verified by read-back: after the write, read the row back and confirm the cells hold the new values before reporting success.
- Note the Cloudflare quirk from the image route: Cloudflare returns 1010 on the default Python urllib User-Agent — the helper must send Mozilla/5.0 + Origin https://cabuzzard.github.io, same as the existing `saveOfferImage` helper at `~/workspace/custom-connectors/custom.dash-worker/bin/dw.py`.

## 5. Acceptance test

Do not call this done until all of these pass, with read-back proof:
1. Add a test initiative row in the table (Hub: Sunflower Acres, Initiative: "TEST — audit only", Kind: Sequence, 2 pieces, Slot: Sunflower Acres + single post + week 2). The All Hubs goal count for Sunflower Acres goes up by 1, not by 2. The Weekly Goals by Asset table also goes up by 1. Dev / Published counts are unchanged and match Notion read-back.
2. Archive that test row. Both goal counts go back down by 1.
3. Add a test column at runtime with a typed name. It persists after reload, existing rows get an empty value, and it can be renamed in place.
4. Add a test Periodic row (Kind: Periodic, Cadence: weekly, 1 per period). The cron-goal read for that hub + asset type returns weekly, 1 per period, and a series with 3 posts in that week still counts as 1 goal.
5. Add a test Standalone row (Kind: Standalone, Slot: "none", Own periodicity: "one-off"). It gets no sequence week, and the cron-goal read skips it.
6. Try a bad edit (e.g. Asset type "Single Post" with a capital S, or Kind "Daily"). The worker refuses it with payload + reason, and the row is unchanged on read-back.
7. Confirm no hardcoded goal numbers and no hardcoded column list anywhere in the code: goals and columns are computed from the table only.
8. Confirm the existing Initiatives table is untouched, and the existing 255 rows are unchanged except for the new columns' values and the two Review-note markings in section 2(e).

## 6. What to deliver back

- The exact KV key you used, and the exact worker action name you added.
- The exact new columns, in order, with their values for the first 3 rows as proof.
- The acceptance test results, with read-back for each step.
- If anything in this prompt conflicts with what the live table or live worker actually shows, say what conflicts, and what you did instead, before you build. Do not invent a value to fill a gap.
