# land RE — Nationwide appreciation-cycle research

The starting workflow is now National Overview → Cycle Scanner → Market Research → Compare Markets → Research Notebook. Counties, comparable sales and land underwriting remain later drill-downs. Open the land RE tab in dash/index.html or visit /dash/land-re/.

## Real nationwide coverage
Snapshot observed October 15, 2026: 894 metros, 50 states plus DC, 3,152 county geography records and a national benchmark (4,098 records total). Census population/migration vintage 2024 is available at state/county level; metro demographics are not imputed. Some county geographies differ between source vintages; no county counts are summed to derive national demographics. National demographics use state totals. Zillow home-value series run up to August 2026 with history as far back as 2000 depending on geography. Full histories are loaded on demand from history/*.json; the scanner uses the latest 73 monthly points plus the full-series peak.

Sources:
- Census: https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv
- Zillow metro/national ZHVI: https://files.zillowstatic.com/research/public_csvs/zhvi/Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
- Zillow state ZHVI: https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
- Zillow county ZHVI: https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv
- Zillow inventory: https://files.zillowstatic.com/research/public_csvs/invt_fs/Metro_invt_fs_uc_sfrcondo_sm_month.csv
- Zillow sales: https://files.zillowstatic.com/research/public_csvs/sales_count_now/Metro_sales_count_now_uc_sfrcondo_month.csv
- Zillow days to pending: https://files.zillowstatic.com/research/public_csvs/mean_doz_pending/Metro_mean_doz_pending_uc_sfrcondo_sm_month.csv

Provider overview and methodology: https://www.zillow.com/research/data/. Retain source attribution. ZHVI is modeled home values, not land transactions or individual comps. Inventory is unique active listings during the month. Latest sales estimates are nowcasts and can revise. Days to pending are not days to close. Public Census government data is freely available; Zillow Research use remains subject to provider terms. No paid access was used.

## Finding cycles
National Overview shows the US backdrop and how regional markets distribute across observed phases. Cycle Scanner filters geography scale, state, Census region, phase, evidence coverage and market name. Sort by turning-point research score, acceleration, appreciation, sales growth or inventory contraction. Scores are compared within scale/coverage, not as a nationwide investment league table across unlike geographies. Metros use the provider's primary-state label; cross-state influence must be investigated separately. County view is optional and is no longer the starting point.

Monthly calculations align to exact calendar months. Price pace annualizes the most recent three-month change. Pace acceleration compares that pace against the preceding three-month period. Inventory and days-to-pending changes compare the same month year over year; sales demand compares the sum of the latest three months with those same months a year earlier. Missing exact-month inputs remain unavailable, including stale auxiliary observations. Drawdown uses the observed historical peak, not a guessed intrinsic value.

Descriptive rules, evaluated in order:
1. Correction: annual price decline worse than 2% and recent pace nonpositive.
2. Recovery: more than 3% below the prior observed peak, positive recent pace and positive pace acceleration.
3. Emerging upswing: 0–6% annual appreciation, positive recent pace, acceleration above 1 percentage point, and at least one firming signal (falling inventory, sales growth above 3%, or days to pending falling more than 5%).
4. Cooling: recent pace more than 2 points below annual pace, or inventory growth above 15% with falling sales.
5. Expansion: annual appreciation above 6% and positive recent pace.
6. Otherwise stabilizing/mixed. At least two-year price endpoints plus the quarterly windows are needed; gaps in required endpoint months withhold classification.

Research score weights default to acceleration 30%, sales demand 25%, inventory 25%, moderate current appreciation 20%. Components clip to 0–100: acceleration 50+3*pace_change_pp; demand 50+2*sales_growth%; supply 50-1.5*inventory_growth%; runway 75-5*abs(annual_appreciation%-3). Weights are editable and stored locally. Missing components renormalize available weights and reduce displayed input coverage. No score is a calibrated probability or return forecast. Emerging housing signals do not prove land-price lag or an attractive parcel.

## Historical research and comparison
Market Research provides full price history, annual appreciation history, inventory and sales charts, inspection of historical phase by month, 1/3/5-year cumulative price changes, reasons, risks and direct dataset citations. Historical inspection uses today's revised series with future dates excluded; it is not a point-in-time predictive backtest.

Compare Markets accepts up to six markets from the current market and watchlist. Prices are rebased to 100 at the first common calendar month, using shared observation dates. Compare 5 years, 10 years or all common history. Scores have different evidence completeness where source coverage differs.

## General research and notebook
The national theme field builds external news and official BLS/BEA/Census search links for arbitrary research questions. Market Research supplies market-specific links. These are research starting points, not automatically verified news, synthesized AI research or an ingested employment dataset.

Save a thesis, observed data, announced/completed catalyst or contradicting evidence in Research Notebook, with source URL, source date, confidence and next verification step. Notes and watchlists are browser-local and exportable as JSON. They do not automatically synchronize to Notion. The existing private Notion project remains the project repository: https://app.notion.com/p/3fa1f7d3a4bb81f9bc86d5ff9c96430f. Its latest section records this nationwide scope change; no unrelated Notion content was modified.

## Existing property analysis
Select a county from Research market before Comparable Sales or Product-Market Analysis. Import licensed closed-sales CSV using the header template: required property_id, geoid (county FIPS), lot_acres, sale_price, closed_date, property_type, source. Additional house attributes, condition, quality and verification fields support matching. Default target 1.5 acres with visible adaptive tolerances 15%, 25%, 40% and minimum eight observations. Imports replace the browser dataset only after successful validation; export backups first. Bulk sales beyond browser quota require a future local API. No property listings or individual sales are fabricated.

Residual valuation, sensitivity, manual parcel diligence and assumption-driven outlook remain available. Default underwriting numbers are illustrative. Feasible lot counts and finished-lot exits require independent evidence. Simplified annualized return is not staged cash-flow IRR. No automated parcel GIS, MLS or finished-lot feed is connected.

## Launch, refresh and validation
From the dash repository, run `python -m http.server 8766 --bind 127.0.0.1` and visit http://127.0.0.1:8766/land-re/. This computer's Python is C:/Users/flipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe.

Refresh: `python land-re/refresh.py`. It preserves dated raw CSVs, UPSERTs local SQLite observations and geographic metadata, writes the compact markets.json and full history shards, and records per-source success/failure. SQLite uses source-specific savepoints so ingestion errors do not leave partially imported providers. Prior observations may be revised by new source vintages; raw downloads preserve the originals. `--use-cache` is a development-only option for already-downloaded files; ordinary refresh should omit it. Raw files, SQLite and Python cache stay ignored; publish only aggregate JSON and app source through the normal GitHub Pages push. Reload published snapshot refreshes already-published JSON, not an ingestion job.

Tests: `node land-re/test-engine.cjs` (12 original financial/import tests), `node land-re/test-cycle.cjs` (11 nationwide cycle/data-integrity tests). Constructed test series are labeled synthetic fixtures. Browser QA covered national overview, NC metro filters, Charlotte full history/historical inspection, normalized US comparison, local note save and retained comp/valuation modules. No predictive-performance claim is made.

## Remaining limitations
This is general nationwide housing-cycle research with land underwriting drill-down. Permits, jobs, household formation, affordability, infrastructure, metro population crosswalks and actual land-price series are still needed to investigate land-specific early cycles. Future priorities: verified employment/permit connectors, source-vintage backtesting, spatial spillover analysis, cited automated research, bulk closed-sale/land data and idempotent summarized Notion sync.
