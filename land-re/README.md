# land RE — initial release

Integrated in dash/index.html as land RE. Open the dashboard and select that tab. Static application follows the existing GitHub Pages architecture; no separate web framework or paid service is needed. Python standard-library SQLite is used for bulk analytical storage rather than DuckDB to avoid dependency/setup requirements at this scale.

## Local launch
From the dash repository: `python -m http.server 8766 --bind 127.0.0.1` then open http://127.0.0.1:8766/land-re/. On this computer Python is available at C:/Users/flipo/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe.

## Data refresh
`python land-re/refresh.py` downloads Census county estimates vintage 2024 and the live Zillow county ZHVI CSV. It preserves dated raw files in land-re/data/raw and UPSERTs observations in land-re/data/land.sqlite3 by FIPS, metric, period, source. markets.json is the publishable aggregate snapshot. Private/local data is excluded from Git. Commit only the aggregate snapshot to update GitHub Pages. Reload published snapshot reloads the existing published JSON; it does not initiate a remote ingestion job. Errors are recorded in SQLite sources and exposed in the JSON health report; historical observations are retained. A refreshed provider series may revise prior observations in SQLite, with raw vintages preserved.

## Closed sales
Comparable Sales → Download CSV header template. Required fields: property_id, geoid (five-digit county FIPS), lot_acres, sale_price, closed_date (YYYY-MM-DD), property_type, source. Recommended: address, sqft, bedrooms, bathrooms, year_built, condition, quality, listing_price, days_on_market, verification_status. Types: single_family, finished_lot, raw_land. Provider-neutral CSV boundary accepts licensed exports; no scraping or MLS access is assumed. Invalid files leave the previous dataset intact. Imports replace browser-local sales; export a backup first. Duplicates: county + property_id + closed_date. Large datasets beyond browser storage need a future local server connector; this release handles modest review CSVs, with explicit import errors on quota failure.

Default target is 1.5 acres; ±15% widens to ±25%, then ±40% only if fewer than eight transactions. Type never mixes. Optional sqft tolerance ±20%, year ±10, exact condition and quality. County geography is coarse; distance/neighborhood/construction-type and sale-date price adjustments are not implemented. Matched sets are descriptive, not adjusted appraisals. Lot values are not inferred from house values.

## Sources and limitations
Census: https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv — 2020–2024 population and net migration, annual, national raw coverage; 254 Texas counties normalized. Public government dataset. Housing: https://www.zillow.com/research/data/ — county ZHVI monthly; Texas coverage varies and latest observation is August 2026 at initial ingestion. Cite Zillow Research; this index models typical home values, not completed transactions or land. Download availability does not establish rights to reuse unrelated Zillow property data.

Census ACS API currently returns Missing Key without a key. No ACS key, MLS, Redfin, BPS, BLS, BEA, county deed/GIS, FEMA, boundary/ETJ or listing provider is configured. Provider-specific integrations remain future work; supported fallback is licensed CSV import. No fabricated observations are supplied. Market Explorer defaults to population ≥10,000 and all four implemented indicator components, avoiding ranking tiny or sparsely covered counties ahead of comparable markets by default. Filters are adjustable.

The model uses population growth/acceleration, migration and moderated home-price growth. Weights are configurable. It does not claim land price lag, income/jobs/permits/inventory coverage, calibrated probabilities or prospective predictive performance. One/three-year population growth is available; five-year population growth requires an older comparable population series. Housing outlook scenarios are user assumptions, not estimates fitted to these signals. No point-in-time historical backtest exists; using current-vintage series for such a claim would introduce revision/look-ahead bias. The original Tyler case has unknown acquisition date/location/returns. Smith County FIPS 48423 is the reference, not Tyler County.

Valuation includes all cost categories as explicit inputs. Finance is entered as a total holding-period cost. Gross exits, profit, profit margin, return on cost, simplified annualized return, break-even exit and 3×3 sensitivity are computed. Annualized return is not staged cash-flow IRR. Default numbers are labeled illustrative, never market-supported evidence. Legally feasible lot count is supplied and must be verified; acreage checks do not establish subdivision feasibility.

Parcel screening is a manual diligence checklist with ask-versus-saved-maximum comparison. No listings, GIS checks or acquisition ranking are fabricated. Product analysis reports observed shares, house sizes, prices and DOM; longitudinal growth/appreciation and supported product recommendations are withheld pending sufficient controlled samples. Custom acreage bands, regression/repeat-sales modeling, active-inventory absorption and nationwide ingestion are not implemented.

## Notion
Connected MCP discovery succeeded. Existing dash index/deployment references were inspected, not changed. Created a private project draft: https://app.notion.com/p/3fa1f7d3a4bb81f9bc86d5ff9c96430f. It contains overview, source attribution, dated Smith County results, confidence, progress and roadmap. Stable identifier land-re-v1. Future sync should update this exact page through Notion MCP, keyed by county FIPS and observation period, rather than create duplicate project pages. Automatic sync and relational review databases are not implemented. No existing content was restructured or deleted.

## Validation
`node land-re/test-engine.cjs` — 12 tests for residual reconciliation, break-even, invalid assumptions, CSV quoting/dedup/date validation, type/date matching, adaptive tolerances, missing observations, median, acreage boundaries and scenario compounding. Tests use explicitly synthetic fixtures; the app contains no fixture sales. Browser checks cover rendered data, sections and valuation. Source ingestion: 2,540 Census plus 44,566 Zillow observations on 2026-10-15.

## Next priorities
1. Import actual licensed single-family and finished-lot sales around Tyler and surrounding counties.
2. Add permit, employment and active-inventory series with release timestamps.
3. Implement local bulk sales storage/API and idempotent summarized Notion sync.
4. Add parcel, road, utility, flood and legal-boundary evidence.
5. Backtest on frozen information vintages and negative-control markets before predictive claims.

This is a working initial research tab, not completion of every requirement in the supplied full-system brief.
