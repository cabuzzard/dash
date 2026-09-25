-- Keyword Research (dash "Keywords" tab) — D1 database `keyword-research`, binding KWDB.
-- Same model as the local ~/keyword-research SQLite:
--   kw_keywords        one row per unique normalized keyword (master list)
--   kw_requests        every GenerateKeywordIdeas request = cache key + audit trail
--   kw_request_seeds   request → the seed keywords it was given
--   kw_request_results request → every keyword it returned (Google's rank)
--                      ⇒ seed → discovered keyword = kw_request_seeds ⨝ kw_request_results
--   kw_metrics         latest metrics per keyword × provider × language × geo × network
--   kw_runs / kw_frontier   step-wise discovery runs: depth, parent, root, expanded/queued
--   kw_api_calls       one row per Google round-trip (quota accounting)
--   kw_lookups         cached language / geo ID resolution
-- Apply: npx wrangler d1 execute keyword-research --remote --file kw-schema.sql

CREATE TABLE IF NOT EXISTS kw_keywords (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kw_runs (
  id INTEGER PRIMARY KEY,
  name TEXT,
  params_json TEXT,
  status TEXT,               -- running | done | stopped
  keywords INTEGER,          -- running count of kw_frontier rows (maintained by kwStepRequest)
  level INTEGER DEFAULT 0,   -- depth currently being expanded
  root_done INTEGER DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  api_calls INTEGER DEFAULT 0,
  requests INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS kw_requests (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'google_ads',
  request_key TEXT NOT NULL,
  seed_type TEXT NOT NULL,
  seeds_json TEXT,
  url TEXT,
  site TEXT,
  language_id TEXT,
  geo_key TEXT,
  network TEXT,
  status TEXT NOT NULL,
  idea_count INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  error TEXT,
  run_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_kw_requests_key ON kw_requests(request_key, status, created_at);

CREATE TABLE IF NOT EXISTS kw_request_seeds (
  request_id INTEGER NOT NULL,
  keyword_id INTEGER NOT NULL,
  PRIMARY KEY (request_id, keyword_id)
);

CREATE TABLE IF NOT EXISTS kw_request_results (
  request_id INTEGER NOT NULL,
  keyword_id INTEGER NOT NULL,
  rank INTEGER,
  PRIMARY KEY (request_id, keyword_id)
);
CREATE INDEX IF NOT EXISTS ix_kw_results_kw ON kw_request_results(keyword_id);

CREATE TABLE IF NOT EXISTS kw_metrics (
  keyword_id INTEGER NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_ads',
  language_id TEXT NOT NULL DEFAULT '',
  geo_key TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT '',
  avg_monthly_searches INTEGER,
  competition TEXT,
  competition_index INTEGER,
  low_top_of_page_bid REAL,
  high_top_of_page_bid REAL,
  average_cpc REAL,
  trend_pct INTEGER,
  intent TEXT,                 -- kwIntent(): hire | buy | research | tool | learn | career | brand | general
  is_local INTEGER DEFAULT 0,
  is_brand INTEGER DEFAULT 0,
  monthly_json TEXT,
  concepts_json TEXT,
  request_id INTEGER,
  retrieved_at TEXT NOT NULL,
  PRIMARY KEY (keyword_id, provider, language_id, geo_key, network)
);
CREATE INDEX IF NOT EXISTS ix_kw_metrics_vol ON kw_metrics(avg_monthly_searches);
CREATE INDEX IF NOT EXISTS ix_kw_metrics_intent ON kw_metrics(intent);

CREATE TABLE IF NOT EXISTS kw_frontier (
  run_id INTEGER NOT NULL,
  keyword_id INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  parent_keyword_id INTEGER,
  root_seed_id INTEGER,
  queued INTEGER DEFAULT 0,
  expanded INTEGER DEFAULT 0,
  request_id INTEGER,
  PRIMARY KEY (run_id, keyword_id)
);
CREATE INDEX IF NOT EXISTS ix_kw_frontier_q ON kw_frontier(run_id, depth, queued, expanded);
CREATE INDEX IF NOT EXISTS ix_kw_frontier_kw ON kw_frontier(keyword_id, run_id);

CREATE TABLE IF NOT EXISTS kw_api_calls (
  id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  method TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  run_id INTEGER
);

CREATE TABLE IF NOT EXISTS kw_lookups (
  kind TEXT NOT NULL,
  query TEXT NOT NULL,
  ids_json TEXT,
  label TEXT,
  PRIMARY KEY (kind, query)
);
