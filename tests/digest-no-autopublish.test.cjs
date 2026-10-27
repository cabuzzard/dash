const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../worker/worker.js'), 'utf8');
function section(start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert.notEqual(a, -1, `missing source marker: ${start}`);
  assert.notEqual(b, -1, `missing source marker: ${end}`);
  return src.slice(a, b);
}

test('digest generations remain Development and no longer publish from the news cron', () => {
  const news = section('async function writeHubNewsPost(', '// rewriteHubNewsPost');
  assert.match(news, /selfAction\(env, "generateTitleAssets"/);
  assert.doesNotMatch(news, /updatePublishFields|publishHubSectionAsset|backfillHubBlog/);
  assert.match(news, /status: "Development"/);
  const count = section('async function hubNewsCount(', 'async function hubNewsTopicCandidates(');
  assert.match(count, /development\|publish\|review/);

  const digest = section('async function adStep(', 'async function autoDigestRun(');
  assert.match(digest, /"Asset Status": \{ select: \{ name: "Development" \} \}/);
  assert.match(src, /properties\?\.\['Asset Status'\]\?\.select\?\.name!=='Development'/);
});

test('background render completion stores media without promoting asset status', () => {
  const hf = section('async function hfFinalize(', 'async function bufferGql(');
  assert.match(hf, /"Video URL"/);
  assert.doesNotMatch(hf, /Asset Status/);

  const longform = section('// ── Longform render job', '// ── Image proxy');
  assert.match(longform, /"Video URL"/);
  assert.doesNotMatch(longform, /props\["Asset Status"\].*=.*"Publish"/);
});

test('generateTitleAssets and generic creation default to Development; SEO generation does not push live', () => {
  const start = src.indexOf('if (body.action === "generateTitleAssets")');
  const end = src.indexOf('if (body.action === "generateOfferImage")', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const generators = src.slice(start, end);
  assert.match(generators, /"Asset Status": \{ select: \{ name: "Development" \} \}/);
  assert.doesNotMatch(generators, /publishSeoPostToLiveSite\(/);

  const create = section('if (body.action === "createAsset")', '// ──');
  assert.match(create, /"Asset Status": \{ select: \{ name: "Development" \} \}/);
});

test('interactive tool build saves a Development draft and does not deploy public files', () => {
  const build = section('async function handleInteractiveTool(', '// ════════ 📰 Free newsletter picks');
  assert.match(build, /"Asset Status": \{ select: \{ name: "Development" \} \}/);
  assert.match(build, /Standalone page draft/);
  assert.doesNotMatch(build, /putFile\(/);
});

test('explicit publish handlers remain available and unchanged', () => {
  const topical = section('async function publishTopicalAsset(', 'async function publishSeoPostToLiveSite(');
  assert.match(topical, /publishSeoPostToLiveSite\(/);
  assert.match(topical, /Published/);
  const manual = section('async function publishHubSectionSelection(', 'async function syncOfferAssetBlog(');
  assert.match(manual, /Published/);
});
