const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const worker = fs.readFileSync('worker/worker.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('digest generation checkpoints findings without clearing checks before success', async () => {
  const start = worker.indexOf('const DIGEST_GENERATE_TTL');
  const end = worker.indexOf('// DIGEST POOL', start);
  const context = vm.createContext({ Date, JSON, Set });
  vm.runInContext(worker.slice(start, end), context);
  const values = new Map();
  const env = { TRADES: {
    get: async (key, type) => { const value = values.get(key); return value && type === 'json' ? JSON.parse(value) : value ?? null; },
    put: async (key, value) => values.set(key, value),
    delete: async key => values.delete(key),
  } };
  const S = { id: 'job-1', assetId: 'digest-1' }, step = { kind: 'news', itemId: 'finding-1', item: { id: 'finding-1' } };
  values.set('digest:items:digest-1', JSON.stringify({ items: [], checks: { 'finding-1': { news: true } }, children: { premium: [], free: [], news: [] } }));
  await context.digestGenerateDigestSave(env, S, step, 'running', { titleId: 'title-1' });
  let d = JSON.parse(values.get('digest:items:digest-1'));
  assert.equal(d.checks['finding-1'].news, true);
  assert.equal(d.children.news[0].state, 'running');
  await context.digestGenerateDigestSave(env, S, step, 'error', { error: 'temporary failure' });
  d = JSON.parse(values.get('digest:items:digest-1'));
  assert.equal(d.checks['finding-1'].news, true);
  assert.equal(d.children.news[0].error, 'temporary failure');
  await context.digestGenerateDigestSave(env, S, step, 'done', { assetId: 'asset-1' });
  d = JSON.parse(values.get('digest:items:digest-1'));
  assert.equal(d.checks['finding-1'].news, false);
  assert.equal(d.children.news.length, 1, 'repeated checkpoints update one per-job child record');
});

test('manual generation enqueues a durable job and uses titlejob runner with checkpointed retry', () => {
  const generateStart = worker.indexOf('if (body.action === "digestGenerate")');
  const retryStart = worker.indexOf('if (body.action === "retryDigestGenerate")', generateStart);
  const generate = worker.slice(generateStart, retryStart);
  assert.match(generate, /titlejob:state:/);
  assert.match(generate, /titlejob:queue/);
  assert.match(generate, /digest:generate:request:/);
  assert.match(generate, /ctx\.waitUntil\(invoke\(\{ action: "runTitleJobs" \}\)/);
  assert.doesNotMatch(generate, /await digestWriteIssue|action: "createDevAssets"|action: "generateTitleAssets"/);
  const runner = worker.slice(worker.indexOf('async function titleJobsRun'), worker.indexOf('async function kwHubAutoTick'));
  assert.match(runner, /S\.kind === "digest-generate"/);
  assert.match(runner, /S\.i\+\+/);
  assert.match(runner, /S\.status = "failed"/);
  assert.match(runner, /digestHubLease\(env, S\.cid/);
  assert.match(worker, /retryDigestGenerate/);
  assert.match(worker, /digest:news-title:/, 'news title idempotency is persisted before its pillar write');
  assert.match(worker, /developmentOnly: true/);
  assert.match(worker, /out\.digestGenerate = \{ queue: genQueue, states: genStates \}/);
  assert.match(html, /retryDigestGenerate/);
  assert.match(html, /hubJobsOpen\(\)/);
});

test('shared per-hub lease serializes weekly and manual generation; digest jobs appear in the flyout', async () => {
  const start = worker.indexOf('const DIGEST_GENERATE_TTL');
  const end = worker.indexOf('// DIGEST POOL', start);
  const context = vm.createContext({ Date, JSON, Set });
  vm.runInContext(worker.slice(start, end), context);
  const values = new Map();
  const env = { TRADES: {
    get: async (key, type) => { const value = values.get(key); return value && type === 'json' ? JSON.parse(value) : value ?? null; },
    put: async (key, value) => values.set(key, value), delete: async key => values.delete(key),
  } };
  const leaseA = await context.digestHubLease(env, 'campaign-1', 'manual:job:0');
  assert.ok(leaseA);
  assert.equal(await context.digestHubLease(env, 'campaign-1', 'auto:campaign:week'), null);
  await context.digestHubLeaseRelease(env, leaseA);
  assert.ok(await context.digestHubLease(env, 'campaign-1', 'auto:campaign:week'));
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !/src=|application\/json/.test(m[1]));
  inlineScripts.forEach(m => new vm.Script(m[2]));
  assert.match(html, /Digest generation/);
});
