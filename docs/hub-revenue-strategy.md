# Revenue & Acquisition Strategy planner

Location: **Content Hubs 2 → selected hub card → Strategies**. The existing free-form Strategies table remains below the new planner. **Portfolio View** shows all existing hubs; **Individual Hub View** uses the same underlying record, filtered to the current card. Default order is ascending priority. Blank priorities appear after numbered priorities in ascending order.

The eight supplied hub plans are initial hypotheses and offer prices remain editable. Status defaults to Backlog. Additional existing hubs receive blank plans with Backlog status. No hubs, topics, clusters, products, keywords, or Notion schemas are created or changed.

## Persistence and schema

The planner uses the existing authenticated Worker `call()` transport and existing `KWDB` Cloudflare D1 binding. It creates only these dedicated tables, idempotently on first use:

- `hub_revenue_records (hub_id TEXT PRIMARY KEY, cells TEXT NOT NULL)`
- `hub_revenue_schema (id INTEGER PRIMARY KEY CHECK(id = 1), columns_json TEXT NOT NULL)`

`hub_id` is the existing Notion Campaign/Content Hub ID, normalized without dashes. The Worker validates every save against the existing hub registry (including `hub:sites:extra`) and the current column schema. This is an application-level foreign key because the hub records live in Notion, not D1.

Seed insertion uses `INSERT ... ON CONFLICT DO NOTHING`, so repeated or concurrent initialization neither duplicates rows nor overwrites user edits, including deliberately blank values. Cell updates use atomic SQLite `json_set` updates so concurrent changes to separate cells are retained. Edits to the same cell from separate sessions use last-write-wins. Schema updates use an optimistic comparison to reject concurrent column edits; use the Strategies reload button before retrying a schema conflict.

Text, number, select, and multiline editors save on change/blur. Writes are serialized in the browser. Failed saves remain visible with a Retry saves button; unloading with pending or failed writes prompts the user. There is no offline persistence. Reload the table or page to see edits from another session; updates are not pushed live.

Custom columns use stable generated IDs. Rename and reorder change metadata only. Deleting a populated column requires confirmation, checked against all records on the server. Deleted-column cell data remains hidden for recovery and IDs are never reused. Built-in columns cannot be renamed or deleted. Text is limited to 20,000 characters per cell; at most 120 total columns, 60 options per custom select, 120 characters per column name or option.

## Files

- `index.html`: planner shell and loader inside the existing Strategies section; versioned shared-script reference.
- `shared/hub-revenue.js`: typed table, portfolio/per-hub views, filters, sorting, custom column management, save queue and failure handling.
- `worker/hub-revenue.mjs`: supplied seeds, isolated D1 schema, validation and persistence.
- `worker/worker.js`: authenticated action routing.
- `worker/wrangler.toml`: include the new ES module in Worker uploads.
- `tests/hub-revenue.test.mjs`: SQLite persistence and planner rendering tests.
- `tests/hub-revenue.browser.mjs`: Edge/Playwright UI checks using the real persistence handler against an in-memory SQLite database.

## Validation

Requires Node with `node:sqlite` (tested on Node 24):

```powershell
node --test tests/hub-revenue.test.mjs
```

The browser test requires Playwright and Microsoft Edge. Playwright may be installed outside the repository:

```powershell
npm install --prefix "$env:TEMP\dash-revenue-qa" playwright --no-audit --no-fund
$env:PLAYWRIGHT_PATH="$env:TEMP\dash-revenue-qa\node_modules\playwright"
node tests/hub-revenue.browser.mjs
```

Worker build validation from `worker/`:

```powershell
npx wrangler@4 deploy --dry-run
```

Existing regression checks: `node land-re/test-engine.cjs`, `node land-re/test-cycle.cjs`, and `land-re/scout/.venv/Scripts/python.exe -m pytest land-re/scout/tests/test_scout.py -q`.

## Shipping

This change requires both the Worker deployment and GitHub Pages publication. The tables and seed rows are initialized on the first authenticated planner load after deployment. No manual Notion or keyword-database migration is required. Follow `docs/page-versioning.md` and verify the unique `hrShell` / `hub-revenue.js` marker in the published page before calling it live.
