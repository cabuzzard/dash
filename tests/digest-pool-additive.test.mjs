import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const worker = fs.readFileSync(new URL('../worker/worker.js', import.meta.url), 'utf8');
const block = worker.slice(worker.indexOf('// DIGEST POOL (operator'), worker.indexOf('const DP_EVERGREEN_STYLE'));
function kv() {
  const data = new Map();
  return { data, get: async (k, t) => data.has(k) ? t === 'json' ? JSON.parse(data.get(k)) : data.get(k) : null,
    put: async (k, v) => data.set(k, v) };
}
function helpers() { const context = vm.createContext({ JSON, Date, String, Map, Set, Array, Object }); vm.runInContext(block, context); return context; }

test('successive pool merges preserve unprocessed items, dedupe repeats, and append surfaced keywords', async () => {
  const store = kv(), env = { TRADES: store }, h = helpers();
  await h.digestPoolMerge(env, 'huba', { sources: [{ claim: 'First finding', publisher: 'Source A', url: 'https://a.example' }] }, ['caregiver housing']);
  const first = await store.get('digest:pool:huba', 'json');
  assert.equal(first.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(first[0].keywords)), ['caregiver housing']);
  assert.equal(first[0].originHub, 'huba');

  await h.digestPoolMerge(env, 'huba', { sources: [
    { claim: 'First finding', publisher: 'Source A', url: 'https://a.example' },
    { claim: 'Second finding', publisher: 'Source B', url: 'https://b.example' }
  ] }, ['caregiver coordination']);
  const second = await store.get('digest:pool:huba', 'json');
  assert.equal(second.length, 2, 'the old unprocessed item remains and one new item is appended');
  assert.deepEqual(JSON.parse(JSON.stringify(second[0].keywords)), ['caregiver housing', 'caregiver coordination']);
  const priorRunItem = second.find(x => x.id === first[0].id);
  assert.ok(priorRunItem, 'an item id from the previous run is still addressable for tagging');
  await h.digestPoolUpdate(env, 'huba', priorRunItem.id, { tag: 'news', status: 'queued' });
  assert.equal((await store.get('digest:pool:huba', 'json')).find(x => x.id === first[0].id).status, 'queued');
  assert.equal((await store.get('digest:pool:huba', 'json')).length, 2, 'same run data does not duplicate records');
});

test('merge has no 200 item pruning and legacy items get origin with unknown keywords blank', async () => {
  const store = kv(), env = { TRADES: store }, h = helpers();
  await store.put('digest:pool:hubb', JSON.stringify(Array.from({ length: 201 }, (_, i) => ({ id: 'old-' + i, claim: 'Old ' + i, tag: '', status: '' }))));
  const migrated = h.digestPoolNormalize(await store.get('digest:pool:hubb', 'json'), 'hubb');
  assert.equal(migrated.changed, true);
  assert.equal(migrated.items[0].originHub, 'hubb');
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.items[0].keywords)), []);
  await h.digestPoolMerge(env, 'hubb', { sources: [{ claim: 'New finding', url: 'https://new.example' }] }, ['keyword one']);
  const pool = await store.get('digest:pool:hubb', 'json');
  assert.equal(pool.length, 202);
  assert.equal(pool[0].claim, 'Old 0');
  assert.deepEqual(JSON.parse(JSON.stringify(pool[0].keywords)), []);
  assert.equal(pool[201].originHub, 'hubb');
  assert.deepEqual(JSON.parse(JSON.stringify(pool[201].keywords)), ['keyword one']);
});

test('pool tag action resolves by stable id and old replacement 404 is gone; Digest UI loads and renders pool', () => {
  assert.match(worker, /pool\.find\(x => x\.id === body\.itemId\)/);
  assert.doesNotMatch(worker, /replaced by a newer digest run/);
  assert.match(worker, /body\.action === "getDigestPool"[\s\S]*?digestPoolNormalize/);
  const page = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(page, /call\('getDigestPool'/);
  assert.match(page, /Research pool/);
  assert.match(page, /hub2PoolTag\(slug/);
  assert.match(page, /Keywords: \$\{kws\.length \? esc\(kws\.join\(', '\)\) :/);
});
