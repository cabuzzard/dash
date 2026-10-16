# Land Arbitrage Scout

Replaces the land RE dashboard tool with a nationwide staged investment-discovery and underwriting workspace. The published dashboard and the local Python application share defaults, evidence gates and tested financial formulas. Browser data stays local to that browser; the local application persists data in DuckDB. Neither depends on Notion or paid APIs.

## Start

Windows: run `scout/launch.cmd` from the land-re directory, or double-click the supplied Launch-Land-Arbitrage-Scout.cmd. It starts the local application at http://127.0.0.1:8501. On first use it creates a Python 3.12 environment and installs the pinned open-source requirements. `SCOUT_PYTHON` can select another Python 3.12+ executable. The installed environment is already prepared on this computer.

Manual: `python -m pip install -r scout/requirements.txt`, then `python -m streamlit run scout/app.py --server.address 127.0.0.1 --server.port 8501 --browser.gatherUsageStats false` from land-re.

The land RE tab continues to open /dash/land-re/. Its browser workspace performs public screening, CSV comp/tract analysis, profiles, immediate underwriting, maps and exports without a local server. For DuckDB persistence and optional connectors, use the local Streamlit application. Browser and DuckDB records are separate; transfer them using CSV exports/imports (mixed backups require the kind column). Credentials never go in the published dashboard.

## Search controls

The 31 numeric sliders cover the requested 5–10-acre tract bounds; 1.5-acre lot target and ±0.5-acre tolerance; $15,000/acre asking cap; 15 completed-home comps; 24-month lookback; 25% return on total project cost; 3% annual population growth; 15-mile town proximity and 60-minute employment travel; finished-lot value/count; DOM; sales volume; minimum profit; development, financing, holding, contingency, reserve and selling assumptions; usable area, frontage, flood and slope; confidence; geographic shortlist size and per-run paid request cap. Checkbox controls apply frontage and utility requirements; state/county exclusions apply at Stage A. Save/load profiles locally or in DuckDB and export/import profile JSON.

SEARCH NATIONWIDE screens public markets and already-imported property evidence. It never executes paid calls. Changing sliders requires a new search for discovery results; the subdivision calculator recalculates immediately from the current assumptions.

## Staged discovery

A. Nationwide public screening: Census county population growth/acceleration, BLS employment, Census permit activity, Zillow home-value pace/acceleration and a wage-based relative affordability proxy. Stable county FIPS joins. Default search currently advances 30 of 75 qualifying public markets from 3,144 county geographies. This is market research, not an acquisition recommendation. Small-base growth and stale economic vintages need investigation; source dates remain visible.

B. Actual completed-home sales: single-family closed transactions, configured acreage/DOM/confidence/lookback filters, minimum samples, quartiles, house size/age/bed/bath summaries, $/building sqft, product groups and equal-period volume growth. Product trends require five observations in each half-lookback window. Unadjusted median changes are not repeat-property appreciation. No geographic/date expansion happens silently; explicitly adjust profile controls. The displayed distance is to the county internal point, not a comparable subject property, town or commute destination.

C. Actual finished residential lot sales: property_type finished_lot, finished=true and residential_use=true are required. Supported exit is the lower quartile when the minimum lot sample is met. Agricultural acreage, raw land, unclassified RentCast Land records and house prices do not establish finished-lot exits.

D. Parent discovery: actual active raw-land listings with asking price versus parcel inventory that may not be for sale. Acreage, asking $/acre and confidence are filtered. Access, frontage, utilities, travel distance, flood exposure, slope, residential suitability, geometry, legal approval and septic capacity are separate gates. Unknowns do not pass.

E. Underwriting: usable acreage caps potential yield; frontage caps lot count when no internal road is documented; approved lot count and septic capacity impose further caps. These are conservative input-based screens, not an engineered subdivision layout or independent legal determination. Setbacks, easements, drainage and road reservation are represented by usable-acreage/cost assumptions until verified plans are supplied. Shapely validates input polygon topology in the local app; no automatic FEMA overlay, slope raster, routing, zoning interpretation or dimensional lot-packing engine is claimed.

Gross = lot count × supported finished-lot exit. Non-land costs include development + contingency, holding, financing, selling and risk reserve. The ROC-based maximum acquisition is gross / (1 + target ROC) − non-land costs. The minimum dollar-profit requirement may further lower it. Profit / total cost includes acquisition; this is not a profit-on-revenue margin. Outputs include maximum offer, target cushion, cost/profit, ROC, simplified annualized return, break-even lot exit, downside and a 3×3 sensitivity table. Annualized return assumes all investment at inception and all proceeds at completion, not a cash-flow IRR.

Only opportunities satisfying home, lot, active-listing, feasibility, confidence, minimum profit and ROC gates receive a composite investment score. Separate components are exposed. Missing evidence displays Insufficient Evidence. The shipped real property dataset is empty; no sample listings or sales are presented as real findings.

## CSV import

Use Data & Connectors → download the header template → select homes, lots, tracts or a mixed backup → import CSV. Imports are validated before upserting; invalid files leave existing data intact. Export a backup before editing source records.

Required in every dataset: property_id, geoid (five-digit county FIPS), lot_acres, status, source_url, observed_at (ISO date/datetime). confidence is 0–1; verification_status is verified, provider_reported or unverified. Comp analysis requires verified/provider_reported records above the confidence threshold. Missing DOM is excluded by the configured DOM gate.

Homes also require property_type=single_family, status=closed, actual sale_price, closed_date and positive sqft. Recommended: address, bedrooms, bathrooms, year_built, latitude, longitude.

Lots require property_type=finished_lot, status=closed, sale_price, closed_date, finished=true, residential_use=true. This classification must be supported by the source; the tool does not infer it from an agricultural or general land record.

Tracts: property_type=raw_land with status=active and asking_price for listings; parcel_inventory with status=inventory for parcels not known to be for sale. Qualification fields: town_miles, employment_minutes, frontage_ft, flood_fraction (0–1), slope (degrees), road_access, utilities, legal_access_verified, subdivision_verified, geometry_verified, approved_lot_count, septic_capacity, residential_use. geometry is a quoted GeoJSON Polygon/MultiPolygon; coordinates must be longitude/latitude. internal_road controls frontage capping. Travel and legal fields require independent evidence; county centroid proximity is not substituted.

Duplicate property/date observations do not inflate comp samples; contradictory sale prices for the same property/date are excluded for review. Source URL, dates and confidence are preserved. Browser storage suits modest CSV review datasets; quota failures retain previous data. DuckDB is the bulk-data path. Browser property backup CSV includes the union of all fields and can be reimported using mixed kind.

## Public sources and refresh

Initial verified ingestion: all 3,144 Census county geographies, 15,137 persistent public metric observations, Census 2020–2024 population estimates, BLS QCEW annual all-industry employment/pay 2023/2024, Census BPS permits 2023/2024, Census 2024 county internal points and Zillow county ZHVI through August 2026 where available. Zillow is a modeled housing index, not land or individual closed-sale evidence. Home value / average annual worker pay is a wage-based proxy, not household mortgage affordability.

Run `scout/.venv/Scripts/python.exe scout/public_data.py` from land-re (or `python public_data.py` from scout with the environment active). It saves dated raw downloads, UPSERTs DuckDB in a transaction and atomically replaces scout-markets.json. Optional-source failures are reported and prior market observations retained. Publish the aggregate JSON separately through the normal GitHub Pages workflow. Restart the Streamlit app or clear its cache to load a refreshed public snapshot. Vintages are deliberately pinned for reproducibility; newer demographic/economic vintages should be evaluated before real investment decisions.

Official source URLs and observation times appear in Data & Connectors. Census government data is public; Zillow Research terms/attribution apply. Source download access does not grant rights to redistribute licensed property data. Raw files, DuckDB and credentials remain local and ignored by Git.

BEA: an independent regional GDP connector and public-refresh path are implemented. A free BEA_API_KEY is required; no key was supplied, so this source is honestly unavailable. No BEA values were invented.

## Optional paid connectors and economics

Copy scout/.env.example to scout/.env and configure only providers you intend to use. Each provider defaults to disabled, empty credentials, zero monthly budget and zero cost reservation. No real paid API call was executed while building/testing. Tests use synthetic mocked HTTP responses.

RentCast: documented property-record and active sale-listing endpoints, geographic radius, acreage (43,560 sqft/acre), property type, sale-date window, price cap and bounded pages. Returned last-sale date/price are provider-reported, not automatically deed-verified. Inactive listings never become sold comps. Returned county FIPS or a verified county/state crosswalk is required; radius results are not blindly assigned to the requested county. Sale prices may be unavailable in nondisclosure states, including the Tyler reference region. RentCast land records require independent finished-lot classification and may lack DOM; rejected rows are visible.

Regrid: bounded county + acreage parcel query, GeoJSON enrichment and parcel attributes. Inventory remains inventory; the connector never fabricates a listing or asking price. Geometry does not establish utilities, legal subdivision or sale availability.

Perplexity: dated citations are required; undated sources do not become qualified evidence. AI output is research, never transaction or approved-yield data. Official migration documentation says Sonar support ended September 27, 2026 and recommends Agent API for new builds; default mode is the Agent successor with fast preset, and PERPLEXITY_MODE=sonar enables the documented compatibility endpoint. Live account access has not been validated without credentials.

The local app shows the explicit request plan and conservative cost reservations before each run. Requests are deduplicated, cached for seven days, capped per run and stopped when the provider's monthly reservation budget is exhausted. Failed requests remain counted/reserved because they may be billable, and errors are visible per market. Set the cost reservation high enough for the worst-case number of returned records/tokens under your actual contract; this is an application reservation ledger, not a provider billing guarantee or a budget covering activity outside this app. One bounded page per market is requested; incomplete coverage/pagination must be reviewed rather than interpreted as no properties existing. Large nationwide downloads never run per search.

## Validation and limits

Run `python -m pytest scout/tests -q` (32 tests), `node scout/tests/test-browser.cjs` (10 browser/Python parity tests) and `python scout/tests/ui_smoke.py` (interactive Streamlit control/search/profile checks). Test transactions and time series are explicitly labeled synthetic and never loaded into production by default. Browser QA also exercised a labeled synthetic CSV through all five stages and checked immediate valuation and missing-evidence states. Real public coverage tests include Smith County/Tyler, NC, CA, OH, and both growing and shrinking populations.

A vintage-aware backtest helper excludes observations released after an evaluation date, with tests against late revisions and future dates. Actual point-in-time property/economic vintages and the original Tyler purchase dates are unavailable; prospective ranking accuracy and historical investment performance have NOT been validated. The app does not make predictive-performance claims. Live paid provider behavior remains credential-dependent; connectors are tested against documented interfaces and fixtures.

Remaining high-value work: import actual licensed home/finished-lot/parent data, verify travel and local subdivision evidence, add automatic parcel/FEMA/terrain/route overlays, evaluate newer public vintages and conduct frozen-vintage backtests. GIS input checks and human-confirmed feasibility are functioning; a fully automated engineering/legal feasibility engine is not claimed.

## Notion

The existing Notion MCP is available. Synchronization is optional and can be requested for selected saved searches, market/comp summaries, tract candidates, underwriting or notes. No new Notion structure or automatic sync is required for Scout. Existing Notion content was not replaced by this build.

## Layout

- index.html, scout.js, scout-core.js, scout.css: replacement browser application.
- controls.json, scout-markets.json: shared defaults and sourced public snapshot.
- scout/app.py: primary local Streamlit UI.
- scout/config.py, analysis.py: validated controls and staged analytics.
- scout/database.py: DuckDB persistence, cache and reservation ledger.
- scout/connectors.py, public_data.py: independent providers and public ingestion.
- scout/tests/: automated tests and explicitly synthetic fixtures.
- scout/launch.cmd, requirements.txt, .env.example: one-command launch and configuration.
