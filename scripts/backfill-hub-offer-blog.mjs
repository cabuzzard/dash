#!/usr/bin/env node
// Run after the worker deployment. The existing Dash session token is required; never printed.
// DASH_SESSION_TOKEN=... node scripts/backfill-hub-offer-blog.mjs [campaign-id]
const token = process.env.DASH_SESSION_TOKEN;
if (!token) { console.error('Set DASH_SESSION_TOKEN to an existing authenticated Dash session token.'); process.exit(1); }
const worker = process.env.DASH_WORKER_URL || 'https://jolly-darkness-5dcc.trailnotes2026.workers.dev';
const results = []; let offset = 0;
try {
  for (;;) {
    const response = await fetch(worker, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://cabuzzard.github.io' },
      body: JSON.stringify({ action: 'backfillHubOfferBlog', token, offset, limit: 1, ...(process.argv[2] ? { campaignId: process.argv[2] } : {}) }) });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || `Worker returned ${response.status}`);
    if (!Array.isArray(data.results) || typeof data.done !== 'boolean') throw new Error('Worker does not expose the deployed offer-blog backfill yet');
    results.push(...data.results);
    if (data.done) break;
    if (!(data.nextOffset > offset)) throw new Error('Backfill cursor did not advance');
    offset = data.nextOffset;
  }
  console.log(JSON.stringify({ byHub: Object.groupBy(results, row => row.hub || 'unresolved'), published: results.filter(r => r.published).length,
    skipped: results.filter(r => r.skipped).length, failed: results.filter(r => r.error).length }, null, 2));
  if (results.some(r => r.error)) process.exitCode = 1;
} catch (error) { console.error(error.message); if (results.length) console.log(JSON.stringify({ completed: results }, null, 2)); process.exitCode = 1; }
