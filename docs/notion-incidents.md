# Notion incidents & gotchas

Moved out of `CLAUDE.md` (2026-09-07 cleanup). Both of these cost real debugging / data
time. `CLAUDE.md`'s Notion Databases section keeps the two one-line rules; the full
write-ups are here.

---

## Product Research — Split history

Product Research used to live inside `STRATEGY_DB` itself, disambiguated only by whether `Method` was empty (positioning) or set (a Brief) — one table doing double duty for a 1:1 and a 1:N concept. Split out because that shared-table design had already caused a real bug: several near-simultaneous writes to the same product's positioning record each independently found "no record yet" and created their own duplicate (confirmed in production — one product had accumulated 4 duplicate positioning records before the split). `findBestProductResearchRecord` (né `findBestStrategyRecord`) is the dedupe-safe read path every site now uses instead of trusting `results[0]`.

(Also stated inline in the Product Research bullet in `CLAUDE.md`: "Every read/write site goes through `findBestProductResearchRecord(hdr, productId)`, which dedupes by most-fields-filled — Notion has no unique constraint and duplicate records for one product have actually happened.")

---

## Gotcha that cost real debugging time (2026-08-27): database ID vs data-source (collection) ID

A Notion database has TWO different IDs — the database (page) ID and its data source (collection) ID — and `notionQuery`'s `/v1/databases/{id}/query` endpoint wants the DATABASE one, never the collection one.

After building the whole Post Type system, every slot's Post Type silently stayed empty — `generateGrowthStrategy`'s AI output was correct (`postType: "Pillar"` etc., verified via a direct authenticated call + `wrangler tail`), but `resolvePostTypeId` always returned null because `notionQuery(POST_TYPES_DB, {})` was returning `[]`. The `.catch(() => [])` was swallowing the real error: `"Could not find database with ID: ea01e137-... Make sure the relevant pages and databases are shared with your integration 'hermbuzz'."` That message's suggested cause (sharing) was a red herring here — hermbuzz genuinely was already connected to the page (confirmed directly in the Notion UI). The actual bug: `POST_TYPES_DB` had been set to the **data-source/collection ID** (`ea01e137-...`, from the `<data-source url="collection://...">` tag `notion-create-database` returns) instead of the **database ID** (`79b18da189d642d69e48e5e198371003`, the page URL segment) — every other `_DB` constant in this file correctly uses the database ID; this one didn't. Fixed by swapping in the correct ID.

**When wiring a `_DB` constant for a database just created via `notion-create-database`/`notion-create-pages`: use the ID from the `database url="..."` line, never the `collection://` one** — and keep a logged catch (`.catch(e => { console.error(...); return []; })`) rather than a silent one on any `notionQuery` a new feature depends on, so this class of failure surfaces in `wrangler tail` immediately instead of requiring a live-request debugging session.

---

## Known data-loss incident (2026-08-27): RENAME COLUMN + ADD COLUMN in one DDL call

While adding the `Post Type` relation above, a `RENAME COLUMN ... ; ADD COLUMN "Post Type" ...` DDL run in one call against Content Strategy's *pre-existing* `Post Type` select property (111 populated rows: Pillar 31, Sequential 67, One-off 12, Recurring 1) did not preserve the rename — the select data was lost from the live schema instead of being renamed out of the way. The values are NOT gone — Notion's per-page Version History still has them (confirmed) — but recovering them requires opening each of the DB's 668 rows' Version History individually (no API access to page history), since the live signal that would identify which 111 had a value is exactly what was destroyed.

**Lesson: never combine a `RENAME COLUMN` with an `ADD COLUMN` targeting the old name in one DDL call — run the rename alone first, verify it stuck, then add.**
