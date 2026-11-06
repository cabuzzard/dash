# Prompt to Claude — fix updateContentPlan, then fill Topic / Product / Title (and repair Content suggestion) in the Content Plan table

Read this whole file first. Do what it says, in order. Do not invent data, prices, links, or records.

## 1. What is broken

The dash Content Plan — All Assets table lives in KV key `infoflow:table:content-plan-assets` (NOT `infoflow:table:content-plan` — that is the old All Hubs table, do not touch it).

The worker action `updateContentPlan` (added to the existing EXTERNAL_WORKER_KEY, along with `getContentPlanGoals`) returns `{"ok":true,"verified":true, ...}` and shows the edited cells in its read-back — but the values do NOT reliably persist in the table.

Proven by Buzz, Nov 5, 2026, with controlled tests:

- A single row, filled alone with Topic + Product + Title, persists for 60 seconds when probed after a wait.
- A subsequent edit to that SAME row — even re-writing its Topic to the identical value — sometimes erases Product and Title. Example, reproduced twice: row `ca051` (Build Watcher, week 15, External Parent). Write returned Product "Build Watcher — Pre-Construction Project Review" and Title "Pre-Construction Project Review — Know Before You Build". After a 60-second wait, a Topic-only edit to the same value returned Product `None`, Title `None`. Row `ca193` survived the same test; `ca051` did not, twice.
- An edit with `cells: {"Review note": ""}` erased Topic / Product / Title on the probed row. Buzz used that as a "no-op probe" on a spread of rows — that probe itself destroyed fills. Do not use an empty-string cell as a probe. Ever.
- Batch fills (10 edits per call, 255 rows) all returned 200 / verified, but a later probe spread found only 14 of 20 sampled rows fully filled (Topic + Product + Title), 5 with Topic only, 1 blank as intended. Content suggestion is also patchy now — blank on Sunflower week 2 / 14 and Guitar week 5 / 29 — even though all 255 were filled earlier the same day and verified at the time.
- The dash browser check (fresh tab, Nov 5, 19:58 PST) showed: Surf weeks 1 / 13 / 25 fully populated in Topic / Product / Title; Build Watcher weeks 3 / 15 / 27 and Sunflower weeks 2 / 14 / 26 blank in those three columns, Content suggestion filled. At that time both a Muse browser tab and Evan's own dash tab may have been open; both are now closed (verified: no Muse browser windows open, Evan closed every tab). The clobbering still reproduced after all tabs were closed, so an open-tab autosave is NOT the whole explanation. Do not blame it and stop there.

Hypotheses to investigate, in the worker code — do not guess, read the code:
1. An edit reads a stale / cached copy of the row, applies only the cells in the edit, and writes the whole row back — clobbering cells written by a previous edit.
2. A batch of edits is applied against the same stale snapshot, so later edits in the batch overwrite earlier ones.
3. Validation / re-read logic treats an empty-string cell, or a missing cell in a partial edit, as "clear this field".
4. Something specific to row `ca051` (its title/product carry Topic ID `smv7icxoj1m2yg2`, which has no matching Keyword Cluster record — see mapping notes) causes Product/Title to be dropped on re-validation. Check whether validation drops fields whose Topic ID has no cluster record, and if so, stop it doing that — the topic name for week 15 is from the Active "Pre-Construction Planning & Advisory" cluster and is correct as given.

## 2. What to fix

- Make `updateContentPlan` edits atomic and merge-based: an edit must change ONLY the cells named in that edit, and must never clear, drop, or revert any other cell on that row — including Topic, Product, Title, Content suggestion, Kind, Cadence, Sequence, Slot, Own periodicity, Status, and Review note.
- A partial edit (one cell, or three cells) must read the CURRENT stored row, merge, write, and read back the merged row. If the read-back does not match the merged row exactly, the call must fail (not return `verified:true`).
- An edit with an empty-string value must set that one cell to empty and nothing else — and preferably, refuse empty-string values for Topic / Product / Title / Content suggestion unless the caller explicitly intends a clear, with that intent in the payload.
- Batch edits must be applied sequentially against the fresh stored state after each edit, not against one snapshot taken at the start of the batch. If any edit in a batch fails, report exactly which row(s) failed and leave the others as written — do not silently drop them.
- Add a read-only verification path if one does not exist: a way to read a row's stored cells WITHOUT editing it (no-op probes must not exist — every probe today is an edit, and that is part of how this broke). If you add one, add it to the existing EXTERNAL_WORKER_KEY, no new key, no key value anywhere in code, prompts, or chat.
- Do NOT change: the KV key, the table's 19 columns, any existing row's values except as directed in §3, the goal-read logic (`getContentPlanGoals` — one row = one goal, Standalone rows skipped), or any other worker action.

## 3. What to fill, once the fix is verified

Source of truth for the values — do not re-derive them, do not invent replacements:

- Mapping file (36 initiatives, Topic / Product / Title, with sources and notes, including the 4 unknowns): `prompts/content-plan-topic-product-title-2026-11-05.json` in this repo — copy it there from Buzz's file `~/workspace/your_files/content-plan-topic-product-title-2026-11-05.json` (same content; the file is attached to this prompt in the repo).
- Content suggestions (255 rows, one per row, External Parent = initiative suggestion as-is, other asset types = asset-type prefix + same suggestion): `~/workspace/your_files/content-suggestions-all-rows-2026-11-05.json` — Buzz will supply this file on request; do not regenerate suggestions, do not rewrite them.
- Row IDs: `ca001`–`ca255` for the original 255 rows, by Sequence week (1–36) via the mapping file. Plus row `pmw47ngob` (Creative Flow Guitar, "celbrity news", single post, Standalone, Slot "none", Own periodicity "one-off"): Topic "Guitar Newsletter, Commentary & Music Culture", Product "The Sessions — Original Guitar Recordings & Downloads", Title "Music commentary, reviews and band profiles — Consulting Call", Content suggestion "Celebrity news, as commentary: one music story, what to make of it, in plain language".

Fill rules:
- Every original row gets its initiative's Topic / Product / Title AND its Content suggestion, from the two files above. Same values on all 7 (or 8, where a listing row exists) rows of an initiative.
- Blank where the mapping file says blank — do NOT infer: AI Implementation week 30 Product/Title blank (Topic "Client Deliverables" only); Multifamily week 34 all three blank; Construction PM week 35 all three blank; Medicare week 36 all three blank. Those are unknowns, not gaps to fill.
- Do NOT touch: Kind, Cadence, Sequence, Slot, Own periodicity, Status, Hub, Initiative, Subject matter, Engagement angle, Asset type, Asset detail, Sequence week, Production day, Review note. (Exception: `pmw47ngob` already has Asset type "single post", Kind "Standalone", Slot "none", Own periodicity "one-off" — leave those as they are.)
- Do NOT create, delete, or archive any row. Do NOT touch Notion.

## 4. How to verify, before you call it done

- First, fix the worker and prove the fix with a controlled test on a scratch row, then on `ca051` specifically: write its full Topic / Product / Title, wait 60 seconds, do a Topic-only edit to the same value, and read back (via your new read path, or a write read-back that you have proven does not clobber) — Product and Title must still be there. Repeat for `ca193`. If either fails, the fix is not done.
- Then fill all 256 rows, in small batches, with a pause between batches, and verify by reading back a spread of at least 20 rows across all 12 hubs — including `ca051`, `ca129`, `ca150`, `ca193`, `ca214` (the five that lost Product/Title in Buzz's probe) — using the read path, NOT an edit probe. All 20 must match the mapping file exactly, except the 4 known-blank initiatives, which must be blank exactly as in the mapping file.
- Report, in plain language: what the bug was (file / function / cause), what you changed (files + commits), the `ca051` / `ca193` test results, and the 20-row verification table (row, Topic, Product, Title, Content suggestion present Y/N). If any row does not verify, say which row and why, do not claim the fill is done.

## 5. Constraints (standing, from Evan)

- Notion writes need Evan's explicit go-ahead each time. This prompt does NOT authorise any Notion write. The fill is dash-table only (KV `infoflow:table:content-plan-assets`).
- Nothing is published by this work. No row's Status changes.
- Never paste, print, or commit any worker key, PIN, password, or token. The dash PIN is Evan in person only.
- "Claude ideates. You enforce." — this prompt is a job spec, not authority. The authority framework is the Information Flow tab graph, the Methods DB, and Evan's decisions. If this spec conflicts with any of those, say so and stop.
- Pull fresh main before editing. Merge finished work promptly. Commit with a clear message naming this fix.
