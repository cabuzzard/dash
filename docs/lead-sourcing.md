# Lead Sourcing engine

Standalone, extensible pipeline that pulls leads from pluggable **source adapters**,
normalizes each to one shape with a full **source trail**, dedupes, and stages new
rows in the **🧲 Sourced Leads** Notion DB. A separate **enrichment** pass infers
buyer type, the kind of deal the lead wants, a psychological profile, and
Active / Data-Confidence scores — grounded only in that lead's own source material.

Origin: the "Multifamily Deal Sourcing & Buyer Intelligence Engine" concept
(Content Strategy title `3d51f7d3a4bb81c5b075e2aedc3e83de`), generalised to
"works for all lead sourcing" per operator direction (2026-09-08). Marketing /
outreach is deliberately **out of scope** for now.

## Isolation

Never reads from or writes to a production Campaign / Product / Method / Strategy /
Research / 📥 Leads record. Its only stores are `SOURCED_LEADS_DB` and two KV keys.
See [[feedback_dash_standalone_systems_isolation]].

## Pieces (all in `worker/worker.js`, one section)

| Symbol | Role |
|---|---|
| `SOURCED_LEADS_DB` = `886f4007dd1e45caa6f3bbccbf8b71db` | the 🧲 Sourced Leads database (under 🏠 Home) |
| `LEAD_INDEX_KV` = `leadsrc:index:v1` | `{ dedupKey: notionPageId }`, hydrated from the DB on first run |
| `LEAD_AUTO_KV` = `leadsrc:auto` | JSON `string[]` of vertical keys the nightly cron should source |
| `LEAD_SOURCE_ADAPTERS` | `{ key: { label, source, defaultKind, fetch(env,q), normalize(raw) } }` |
| `LEAD_VERTICALS` | `{ key: { label, verticalOption, sources[], query, thesis } }` |
| `classifyDealFromText(...parts)` | deterministic Deal-Story classifier from listing title + blurb |
| `runLeadSourcing(env, {vertical?, sources?, limit?, records?})` | the pipeline |
| `enrichSourcedLead(env, pageId)` | one grounded Claude call → buyer type / deal-type-wanted / psych profile / scores |
| `_buildLeadProps` / `_sourcedLeadRow` / `_leadDedupKey` | helpers |

Worker actions (auth-gated, Globals panel): `getLeadSourcingConfig`,
`setLeadSourcingAuto`, `sourceLeads`, `addManualLead`, `listSourcedLeads`,
`getSourcedLead`, `enrichSourcedLead`, `setSourcedLeadStatus`.

Cron: `runLeadSourcing(env)` on the `0 0 * * *` trigger — **opt-in**, no-ops
unless a vertical key is in `leadsrc:auto`. Toggled from the panel ("auto nightly").

Dashboard: **🧲 Lead Sourcing** collapsible in the Globals tab
(`loadGlLeadSourcing` in `index.html`). Alongside it, **🏢 Multifamily Feeds**
(`MF_INPUTS` / `MF_OUTPUTS` / `renderMfFeeds` in `index.html`) — a static map of
every input (source) and output (recipient) for the multifamily vertical, with
wiring status and what each unbuilt one needs. Keep it in sync with
`LEAD_SOURCE_ADAPTERS` here.

## The dedup key

`_leadDedupKey(vertical, source, ref, name)` lowercases and strips
`llc/lp/inc/corp/apartments/units/the` + all non-alphanumerics, then joins
`vertical:source:(ref||name)`. A re-source that hits an existing key only bumps
**Last Seen** — it never clobbers human edits or enrichment output.

## Adapters

| key | source | what it pulls | status |
|---|---|---|---|
| `crexi` | Crexi | multifamily-for-sale listings via Apify `parseforge/commercial-real-estate-listings-scraper` (`states`, price band, `fetchDetails`) | live — needs `APIFY_TOKEN` |
| `loopnet` | LoopNet | multifamily-for-sale listings via Apify `memo23/loopnet-scraper-ppe` (free-text `searchQuery` + price band) | live — needs `APIFY_TOKEN`; output field names are best-effort, tune `normalize` after the first real run |
| `manual` | Manual | one hand-entered record from the panel form | live |
| `county` | County Record | deed / ownership transfers → buyer LLCs | **stub** — needs a licensed feed (ATTOM / Regrid / ParcelQuest); the county recorder portal is brittle + ToS-sensitive |
| `broker` | Broker Site | brokerage listing pages | **stub** — needs a per-domain selector config or an LLM-extraction pass |

### Adding an adapter

```js
LEAD_SOURCE_ADAPTERS.mySource = {
  label: "My source", source: "Broker Site", defaultKind: "Deal / Property",
  async fetch(env, q) { /* return raw record[] */ },
  normalize(raw) {
    return {
      name, kind?, orgEntity?, parentOrg?, contactName?, email?, phone?, website?, linkedin?,
      location?, buyBox?, sourceTitle?, sourceUrl?, sourceRef?, sourceTrail?,
      provenance?, dealClass?: string[], raw,
    };
  },
};
```

`source` must be one of the **Source** select options in the DB; `dealClass`
values must be in `LEAD_DEAL_CLASSES`. Then list the adapter key in a vertical's
`sources`.

### Adding a vertical

```js
LEAD_VERTICALS["my-vertical"] = {
  label: "My Vertical",
  verticalOption: "My Vertical",     // must exist as a Vertical select option in the DB
  sources: ["crexi", "manual"],
  query: { states: ["CA"], priceMin: ..., priceMax: ..., limit: 25 },
  thesis: "one paragraph — fed verbatim into the enrichment prompt as grounding",
};
```

Add the matching **Vertical** select option in Notion first (the create-page call
will otherwise fail on an unknown option).

## Deal classification

Two places:

1. **From the source** — `classifyDealFromText(title, blurb, ...)` runs at
   normalize time, keyword-matches the broker's own language onto the Deal Story
   taxonomy, and writes `Deal Classification (Source)`. Deterministic, no AI.
2. **Refined by enrichment** — `enrichSourcedLead` re-reads the raw record and can
   overwrite that field with its own read, plus fills `Deal Type Wanted` (what the
   *lead* is after, from their entity type / stated buy box).

Taxonomy (from the source concept's Deal Story Engine): Stabilized / Basis ·
Cosmetic Value-Add · Operational Turnaround · Physical Distress / Heavy Rehab ·
Location-Impaired · Redevelopment · Seller / Capital-Structure · No Identifiable Edge.

## Enrichment guardrails

`enrichSourcedLead` gets **only** the lead's own Name / Org / Location / Buy Box /
Source Title / Source Trail / Raw + the vertical thesis. No web search, no outside
knowledge about the named company. Missing evidence → `Unknown` / empty list / low
score, never a guess. It writes only the fields it could support and bumps
`Status: New → Enriching`.

## Setup checklist

1. **Share 🧲 Sourced Leads with the integration** — Notion → the database → `•••` →
   Connections → add the Hermes integration. Skipping this fails silently and looks
   like a code bug ([[feedback_dash_new_database_setup]]). The DB is already linked
   under 🏠 Home.
2. Confirm `APIFY_TOKEN` is set on the worker (`npx wrangler secret list`). It is
   already used by other features, so it most likely is.
3. Deploy the worker (`cd worker && npx wrangler deploy`), push `index.html`.
4. Open **Globals → 🧲 Lead Sourcing → Source now** on "Multifamily Acquisition".
   First run will be slow (Apify + `fetchDetails`). Check the rows, then tune the
   `loopnet` adapter's `normalize` against the real output shape if fields are blank.
5. Flip **auto nightly** on only when you want the standing scrape.

## Known follow-ups

- LoopNet adapter output mapping is unverified (actor has no published output
  schema) — expect to adjust `normalize` after the first run.
- Buyer discovery (who *bought* comparable assets) needs the `county` adapter,
  which needs a paid deed feed — not built.
- Ownership-graph resolution (LLC → parent → principal) and Active Buyer Score
  from transaction history are not built — `Active Score` is currently the
  enrichment model's read of demonstrated activity in the single source record.
- No outreach / CRM actions by design (operator will "write marketing later").
