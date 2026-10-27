const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const worker = fs.readFileSync('worker/worker.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function locationHelpers(stubs = {}) {
  const start = worker.indexOf('const digestCronKey =');
  const end = worker.indexOf('// Perplexity writes the digest', start);
  const context = vm.createContext({ Date, JSON, String, Object, Array, Map, ...stubs });
  vm.runInContext(worker.slice(start, end), context);
  return context;
}

function kv() {
  const values = new Map();
  return { values, get: async (key, type) => {
    const value = values.get(key);
    return type === 'json' && typeof value === 'string' ? JSON.parse(value) : value ?? null;
  }, put: async (key, value) => values.set(key, value) };
}

test('S5 migrates only the existing canonical digest on and keeps new digests off by default', async () => {
  const store = kv(), h = locationHelpers();
  const d1 = 'a'.repeat(32), d2 = 'b'.repeat(32);
  await store.put('digest:asset:campaign1', d1);
  await h.digestMigrateCronFlags({ TRADES: store }, 'campaign1', [{ id: d1 }, { id: d2 }]);
  assert.equal(await h.digestWeeklyFlag({ TRADES: store }, d1), true);
  assert.equal(await h.digestWeeklyFlag({ TRADES: store }, d2), false);
  const h2 = locationHelpers({ hubAssetId: id => String(id).replace(/-/g, ''), kwDashId: id => id,
    newsletterNotion: async () => ({ properties: { 'Pillar Type': { select: { name: 'Digest' } } } }) });
  await h2.digestSetWeekly({ TRADES: store }, d2, true);
  assert.equal(await h2.digestWeeklyFlag({ TRADES: store }, d2), true);
  await h2.digestSetWeekly({ TRADES: store }, d2, false);
  assert.equal(await h2.digestWeeklyFlag({ TRADES: store }, d2), false);
});

test('digest move updates title, product, and campaign relations; same-product move is a no-op', async () => {
  const digestId = 'a'.repeat(32), titleId = 'b'.repeat(32), oldProductId = 'c'.repeat(32), newProductId = 'd'.repeat(32), newCampaignId = 'e'.repeat(32);
  const pages = {
    [digestId]: { properties: { 'Pillar Type': { select: { name: 'Digest' } }, Product: { relation: [{ id: oldProductId }] } } },
    [titleId]: { parent: { database_id: 'contentdb' }, properties: { product: { relation: [{ id: newProductId }] }, Campaign: { relation: [{ id: newCampaignId }] } } },
  };
  const calls = [];
  const h = locationHelpers({ CONTENT_STRATEGY_DB: 'contentdb', hubAssetId: id => String(id).replace(/-/g, ''), kwDashId: id => id,
    ivRid: (p, k) => (p?.[k]?.relation || [])[0]?.id?.replace(/-/g, '') || '',
    newsletterNotion: async (_env, path, options) => {
      if (options?.method === 'PATCH') { calls.push(JSON.parse(options.body).properties); Object.assign(pages[digestId].properties, JSON.parse(options.body).properties); return { id: digestId }; }
      return pages[path.endsWith(digestId) ? digestId : titleId];
    } });
  const moved = await h.digestMove({}, digestId, titleId);
  assert.equal(moved.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['Campaign', 'Content Strategy', 'Product']);
  assert.equal(calls[0].Campaign.relation[0].id, newCampaignId);
  assert.equal(calls[0].Product.relation[0].id, newProductId);

  pages[digestId].properties.Product = { relation: [{ id: newProductId }] };
  const noop = await h.digestMove({}, digestId, titleId);
  assert.equal(noop.noOp, true);
  assert.equal(calls.length, 1);
});

test('scheduled work is asset-keyed, staggered across flagged digests, and follows each title topic flow', () => {
  const start = worker.indexOf('async function autoDigestRun');
  const end = worker.indexOf('\nasync function kwHubAutoTick', start);
  const runner = worker.slice(start, end);
  assert.match(runner, /digest:auto:state:" \+ assetId/);
  assert.match(runner, /weeklySlot\(per, wi, work\.length\)/);
  assert.match(runner, /digestWeeklyFlag\(env, assetId\)/);
  const stepStart = worker.indexOf('async function adStep');
  const stepEnd = worker.indexOf('\nasync function autoDigestRun', stepStart);
  const step = worker.slice(stepStart, stepEnd);
  assert.match(step, /titleTopicKeywords\(env, hdr, title\.properties/);
  assert.doesNotMatch(step, /hubMainList/);
  assert.match(html, /Runs weekly/);
  assert.match(html, /hub2DigestMoveOpen/);
  assert.match(html, /hub2DigestRunNowOne/);
});

