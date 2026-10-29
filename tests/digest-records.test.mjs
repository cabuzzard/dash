import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as R from '../worker/digest-records.mjs';
import * as nl from '../worker/newsletter-methodology.mjs';
const source = fs.readFileSync('worker/worker.js', 'utf8');
const fn = name => { const start = source.search(new RegExp('(?:async )?function ' + name + '\\(')); assert.ok(start >= 0, name); return source.slice(start, source.indexOf('\n}', start) + 2); };
const kv = () => { const data = new Map(); return { data, get: async (k, t) => data.has(k) ? (t === 'json' ? JSON.parse(data.get(k)) : data.get(k)) : null, put: async (k, v) => data.set(k, v) }; };

test('digest period is the trailing 7 days, not the Saturday-start checklist week', () => {
  const p = R.digestPeriod(Date.parse('2026-10-25T23:00:00Z'));   // a Sunday-night run
  assert.deepEqual(p, { periodStart: '2026-10-19', periodEnd: '2026-10-25' });
});
test('#1 current-period flags are recomputed every run; old records are relabelled, never removed', () => {
  const items = [{ id: 'a', date: '2026-10-20', inPeriod: true }, { id: 'b', date: '2026-10-01', inPeriod: true }, { id: 'c', date: '' }];
  const out = R.refreshPeriodFlags(items, R.digestPeriod(Date.parse('2026-10-25T12:00:00Z')));
  assert.deepEqual(out.map(x => x.inPeriod), [true, false, false]); assert.equal(out.length, 3);
});
test('record states and the 3-run carry-forward (idempotent per run; used/retired/new records untouched)', () => {
  let d = { items: [{ id: 'u' }, { id: 'used' }, { id: 'r', retired: true }, { id: 'n' }], children: { premium: [{ state: 'done', items: ['used'] }], free: [], news: [] } };
  d = R.advanceCarry(d, 'run1', new Set(['n']));
  assert.equal(d.items.find(x => x.id === 'u').carriedRuns, 1);
  assert.equal(d.items.find(x => x.id === 'used').carriedRuns, undefined);
  assert.equal(d.items.find(x => x.id === 'r').carriedRuns, undefined);
  assert.equal(d.items.find(x => x.id === 'n').carriedRuns, undefined);
  d = R.advanceCarry(d, 'run1'); assert.equal(d.items.find(x => x.id === 'u').carriedRuns, 1, 'same run twice does not double-count');
  d = R.advanceCarry(R.advanceCarry(d, 'run2'), 'regen3');   // a guided regenerate counts as a run
  assert.equal(R.recordState(d.items.find(x => x.id === 'u'), R.usedIds(d.children)), 'unused');
  d = R.advanceCarry(d, 'run4'); const u = d.items.find(x => x.id === 'u');
  assert.equal(u.expired, true); assert.equal(R.recordState(u, R.usedIds(d.children)), 'expired');
  assert.equal(R.recordState(d.items.find(x => x.id === 'r'), R.usedIds(d.children)), 'retired');
  assert.equal(R.recordState(d.items.find(x => x.id === 'used'), R.usedIds(d.children)), 'used');
});
test('a built child (done / waiting / write-failed) marks its records used; running / error do not', () => {
  assert.equal(R.usedIds({ premium: [{ state: 'running', items: ['x'] }], news: [{ state: 'error', itemId: 'y' }] }).size, 0);
  const u = R.usedIds({ premium: [{ state: 'waiting', items: ['a'] }], free: [{ state: 'write-failed', items: ['b'] }], news: [{ state: 'done', itemId: 'c' }] });
  assert.deepEqual([...u].sort(), ['a', 'b', 'c']);
});
test('Disseminate builds every asset first; interviews and write failures never stop the run', () => {
  assert.doesNotMatch(source, /Premium generation is waiting for the required interview/);
  assert.doesNotMatch(source, /Article generation is waiting for the required interview/);
  const step = source.slice(source.indexOf('async function digestGenerateJobStep('), source.indexOf('// Flag the interview a digest child needs'));
  assert.match(step, /digestChildWrite\(env, invoke, step\.assetId\)\.catch\(/);
  assert.match(step, /out\?\.waiting \? "waiting" : out\?\.error \? "write-failed" : "done"/);
  assert.match(source, /const dc = await digestChildWrite\(env, invokeW, body\.assetId\)/);
});
test('mechanical relevance: one title-anchor word, or two Research Focus words', () => {
  const anchor = R.scopeTokens('Medicare advisors near me'), focus = R.scopeTokens('Weekly signals: CMS rule changes, Part D premiums, enrollment deadlines');
  assert.ok(R.relevantToScope({ claim: 'Medicare Advantage rates rise' }, anchor, focus));
  assert.ok(R.relevantToScope({ claim: 'New Part D premiums announced', summary: 'enrollment window' }, anchor, focus));
  assert.ok(!R.relevantToScope({ claim: 'Celebrity buys yacht' }, anchor, focus));
});
test('core queries search every keyword separately; focus queries come only from the operator text', () => {
  assert.deepEqual(R.coreQueries(['independent medicare advisors near me', 'medicare part d plans', 'medicare']), ['medicare', 'medicare part d plans']);
  const q = R.focusQueries(['Weekly signals: CMS rule changes; Part D premiums\nSource preferences: regulators, trade press'], ['medicare']);
  assert.ok(q.includes('cms rule changes')); assert.ok(q.includes('part d premiums')); assert.ok(q.includes('regulators'));
  assert.ok(!q.some(x => /weekly signals|source preferences/.test(x)));
  assert.deepEqual(R.focusQueries([''], []), []);
});
test('curation order: primary sources first', () => {
  const sorted = R.byTier([{ id: 'n', tier: 'free-news' }, { id: 'p', sourceMethod: 'federal-register' }, { id: 't', tier: '2' }]);
  assert.deepEqual(sorted.map(x => x.id), ['p', 't', 'n']);
});
test('digestItemsSave: additive run refreshes flags and carries existing unused records forward', async () => {
  const store = kv(), env = { TRADES: store };
  await store.put('digest:items:asset', JSON.stringify({ items: [{ id: 'old', claim: 'Old', date: '2020-01-01', inPeriod: true }], checks: {}, children: { premium: [], free: [], news: [] } }));
  const c = vm.createContext({ ...R, Date, Array, String, JSON, Promise, Set, dpId: x => x, newsletterVerifyUrl: async () => ({ verified: true }) });
  vm.runInContext(fn('digestItemsSave'), c);
  await c.digestItemsSave(env, 'asset', [{ claim: 'New', url: 'https://x.example', date: new Date().toISOString().slice(0, 10), summary: 'sum', sourceMethod: 'gdelt' }], { additive: true, runId: 'r1' });
  const d = await store.get('digest:items:asset', 'json');
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].inPeriod, false); assert.equal(d.items[0].carriedRuns, 1);
  assert.equal(d.items[1].inPeriod, true); assert.equal(d.items[1].carriedRuns, undefined); assert.equal(d.items[1].summary, 'sum'); assert.equal(d.items[1].addedRun, 'r1');
});
test('#5 a generated Premium issue consumes its interview mapping so the next generation is a new asset', async () => {
  const start = source.indexOf('const DIGEST_GENERATE_TTL'), end = source.indexOf('// DIGEST POOL', start);
  const c = vm.createContext({ Date, JSON, Set, DIGEST_MADE_STATES: R.DIGEST_MADE_STATES }); vm.runInContext(source.slice(start, end), c);
  const store = kv(); await store.put('digest:items:dg', JSON.stringify({ items: [{ id: 'i1' }], checks: { i1: { premium: true } }, children: { premium: [], free: [], news: [] },
    interviewAssets: [{ key: 'premium|*', assetId: 'issue1', interviewId: 'iv1' }, { key: 'article|i1', assetId: 'art1' }] }));
  const S = { id: 'job1', assetId: 'dg' }, step = { kind: 'premium', items: [{ id: 'i1' }] };
  await c.digestGenerateDigestSave({ TRADES: store }, S, step, 'done', { assetId: 'issue1' });
  const d = await store.get('digest:items:dg', 'json');
  assert.equal(d.interviewAssets.find(x => x.assetId === 'issue1').key, 'premium|done:job1');
  assert.ok(!d.interviewAssets.some(x => x.key === 'premium|*'));
  assert.equal(d.interviewAssets.find(x => x.assetId === 'art1').key, 'article|i1');
  assert.match(source, /Date\.parse\(p\.created_time\) >= \(S\.createdAt \|\| 0\)/);
});
test('run flow: free core first, Research Focus widening on free sources only, memory learns only shown records', () => {
  const step = source.slice(source.indexOf('async function adStep('), source.indexOf('async function autoDigestRun('));
  assert.match(step, /S\.step === "free-core"/);
  assert.doesNotMatch(step, /digestFloorPerplexity|digestFloorRelatedQueries|expand-paid"; return|digestFloorAppendBody/);
  assert.doesNotMatch(step, /memoryFindings/);
  assert.match(step, /digestMemoryCommit\(env,cid,runId,w\.sources\|\|\[\]\)/);
  assert.match(step, /Research Focus defines HOW WIDE to look/);
  assert.doesNotMatch(step, /using only the title's placed topic keyword flow/);
  assert.match(step, /DIGEST_THIN/);
  assert.doesNotMatch(source, /async function digestFloorPerplexity|async function digestFloorRelatedQueries/);
});
test('guided regenerate rides the existing queued run path; retire is a soft state', () => {
  assert.match(source, /guidance: \(typeof manualEntry === "object" && manualEntry\.guidance\) \|\| ""/);
  assert.match(source, /body\.action === "digestRecordState"/);
  assert.match(source, /const picked = t => \(d\.items \|\| \[\]\)\.filter\(x => !x\.retired/);
});
test('free-search relevance needs the query words together, not scattered', () => {
  assert.ok(!R.phraseHit('house sitting', 'Alberta premier, back in house for legislature sitting'));
  assert.ok(!R.phraseHit('live-in caretaker', 'LIVE : Inconclusive election leaves Netanyahu as caretaker PM'));
  assert.ok(R.phraseHit('pet sitting', 'Pet sitting rates climb as travel rebounds'));
  assert.ok(R.phraseHit('short-term rental rules', 'Commission approves new rules for short-term rentals'.replace('rules for ', '') + ' rules'));
  assert.ok(R.phraseHit('medicare', 'CMS leaders offer advice on Medicare changes'));
});
test('model picker: a per-digest pick overrides the hub Research Depth in the run and the research job', () => {
  assert.match(source, /async function digestDepthPick\(env, assetId\)/);
  assert.match(source, /fields: pick \? \{ \.\.\.context\.fields, "Research Depth": pick \} : context\.fields/);
  assert.match(source, /\.\.\.\(S\.depthPick\?\{depth:S\.depthPick\}:\{\}\)/);
  assert.match(source, /if\(job\.depthOverride\)current\.fields=/);
  assert.match(source, /job\.gemini = depth==='Deep'\?await drGeminiStart/);   // only Deep ever starts Gemini
});
test('one digest asset type: the retired one-shot "digest" always becomes a Digest Parent', () => {
  assert.match(source, /const DIGEST_PARENT_TYPE = "Digest Parent";/);
  assert.match(source, /const isDigestParentType = v => \/\^digest\(\?: parent\)\?\$\/i/);
  assert.doesNotMatch(source, /"digest" method: ONE weekly hub-digest issue/);           // the both-tiers one-shot writer is gone
  assert.match(source, /Retired one-shot "digest"[\s\S]{0,4000}action: "digestRunNow"/);   // Generate Assets now queues the parent run
  assert.match(source, /Object\.assign\(body, \{ assetType: DIGEST_PARENT_TYPE, assetClass: "Pillar", pillarType: "Digest"/);
  assert.match(source, /"Asset Type": \{ select: \{ name: digestParent \? DIGEST_PARENT_TYPE/);
  assert.match(source, /done: listed\.some\(r => r\.properties\?\.\["Pillar Type"\]\?\.select\?\.name === "Digest"\)/);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /return hub2OpenDigestParents\(slug, m\)/);
  assert.doesNotMatch(html, /return hub2DigestModal\(slug\)|return hub2NewsModal\(slug\)|return hub2FreeNlModal\(slug\)/);
});
test('a parent made before the rename is retyped to Digest Parent on its next run', () => {
  const step = source.slice(source.indexOf('async function adStep('), source.indexOf('async function autoDigestRun('));
  assert.match(step, /kwNotionPatch\(env, S\.assetId, \{ "Asset Type": \{ select: \{ name: DIGEST_PARENT_TYPE \} \} \}\)/);
});
test('Disseminate run: every asset is built even when interviews are missing and a write fails', async () => {
  const start = source.indexOf('const DIGEST_GENERATE_TTL'), end = source.indexOf('// DIGEST POOL', start);
  const store = kv(), created = [], flagged = [];
  const c = vm.createContext({ Date, JSON, Set, Error, console, DIGEST_MADE_STATES: R.DIGEST_MADE_STATES, hubAssetId: x => String(x || '').replace(/-/g, ''), kwDashId: x => x,
    hubRichText: () => '', ASSETS_DB: 'assets', notionQuery: async () => [], hubMainList: async () => ['prod'], ivForTitle: async () => [], ivCreateForAsset: async (env, o) => { flagged.push(o.digestLevel); return {}; } });
  vm.runInContext(source.slice(start, end), c);
  c.digestChildWrite = async (env, inv, id) => id === 'aPremium' || id === 'aNews' ? { waiting: true, interviews: [] } : (() => { throw new Error('model timeout'); })();
  await store.put('digest:items:dg', JSON.stringify({ items: [{ id: 'i1', claim: 'Rates cut' }], checks: { i1: { premium: true, free: true, news: true } }, children: { premium: [], free: [], news: [] } }));
  const invoke = async b => { if (b.action === 'createDevAssets') { const id = b.types[0].label === 'Premium issue' ? 'aPremium' : b.types[0].label === 'Free issue' ? 'aFree' : 'aNews'; created.push(id); return { created: [{ id }] }; }
    if (b.action === 'createNewsBlogTitle') return { success: true, titleId: 'tNews', pillarWritten: false, pillarError: 'no pillar' }; return {}; };
  const S = { id: 'job', assetId: 'dg', cid: 'cid', titleId: 'tDigest', digestName: 'Digest', createdAt: 0 }, env = { TRADES: store };
  for (const step of [{ action: 'digestIssue', kind: 'premium', items: [{ id: 'i1' }] }, { action: 'digestIssue', kind: 'free', items: [{ id: 'i1' }] }, { action: 'digestNews', kind: 'news', itemId: 'i1', item: { id: 'i1', claim: 'Rates cut' } }])
    await c.digestGenerateJobStep(env, invoke, 'job', S, step);   // must not throw
  assert.deepEqual(created, ['aPremium', 'aFree', 'aNews']);
  assert.deepEqual(flagged.sort(), ['article', 'premium']);
  const d = await store.get('digest:items:dg', 'json');
  assert.equal(d.children.premium[0].state, 'waiting'); assert.equal(d.children.free[0].state, 'write-failed'); assert.equal(d.children.free[0].error, 'model timeout');
  assert.equal(d.children.news[0].state, 'waiting'); assert.match(d.children.news[0].note, /pillar not written/);
  assert.deepEqual(d.checks.i1, { premium: false, free: false, news: false });   // built → ticks cleared, record used
});
