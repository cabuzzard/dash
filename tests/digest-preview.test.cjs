const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const worker = fs.readFileSync('worker/worker.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const publish = worker.match(/^async function publishSeoPostToLiveSite\([\s\S]*?^}/m)?.[0];
assert.ok(publish, 'published SEO page renderer is available for preview');

let writes = 0;
const reads = [];
const ctx = vm.createContext({
  hubSiteTarget: async () => ({
    getFile: async path => { reads.push(path); return { text: path.endsWith('/posts.json') ? '[]' : null }; },
    putFile: async () => { writes++; }, basePath: 'web/hub/test/blog', campName: 'Test Hub',
    s: { bg: '#fff', ink: '#111', accent: '#777', headlineFont: 'Georgia', bodyFont: 'Georgia' }, hub: { slug: 'test' },
  }),
  console, Date, TextEncoder, URLSearchParams,
});
vm.runInContext(publish, ctx);

(async () => {
  const preview = await ctx.publishSeoPostToLiveSite({
    env: {}, hdr: {}, dash: id => id, campaignId: 'test-campaign', spec: null,
    seoTitle: 'Distinctive subject preview', workingTitle: 'Working title',
    intro: 'A concrete opening.', sections: [{ heading: 'Details', body: 'Actual article copy.' }],
    conclusion: 'The ending.', sources: [], assetId: 'asset-1', previewOnly: true,
  });
  assert.match(preview.previewHtml, /Distinctive subject preview/);
  assert.match(preview.previewHtml, /Actual article copy\./);
  assert.ok(reads.includes('web/hub/test/blog/posts.json'));
  assert.equal(writes, 0, 'preview renderer must not write any live page or manifest');
  assert.doesNotMatch(worker.slice(worker.indexOf('if (body.action === "digestPreview")'), worker.indexOf('if (body.action === "getDigests")')), /env\.TRADES\.put|notionUpdate\(|fetch\([^\n]*method:\s*["'](?:POST|PATCH|PUT)/i);
  assert.match(html, /Made from this digest:/);
  assert.match(html, /hub2DigestPreviewClose\(\)/);
  assert.match(html, /Flag for interview/);
  assert.match(html, /openCareGapEditor\(data\.campaignId, data\.assetId/);
  console.log('PASS: preview uses the published page renderer, reads only, and exposes the existing publish/interview actions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
