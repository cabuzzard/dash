const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync('index.html', 'utf8');
const code = source.slice(source.indexOf("let CARE_GAP_EDITOR_ASSET = ''"), source.indexOf('function openCareGapEditor('));
const panel = { hidden: true, innerHTML: '', querySelectorAll: () => [] }, status = { textContent: '' }, frame = { src: '' };
let state = { eligible: true, kind: 'blog', hasFinishedInterview: false, hasWriting: false }, requests = [];
const context = vm.createContext({ Set, console, WORKER_URL: 'https://example.test', SESSION_TOKEN: 'test', CARE_GAP_EDITOR_CAMPAIGN: 'hub',
  esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  careGapModalUrl: () => 'https://example.test/editor',
  document: { getElementById: id => id === 'careGapTopicalWrite' ? panel : id === 'careGapTopicalResult' ? status : frame },
  fetch: async (url, options) => { const body = JSON.parse(options.body); requests.push(body); return { ok: true, json: async () => body.action === 'getTopicalPublishState' ? state
    : { written: { ok: true, writtenWithoutInterview: true }, published: { published: false, error: 'Blog unavailable' } } }; }
});
vm.runInContext(code + "\nCARE_GAP_EDITOR_ASSET = 'asset'; CARE_GAP_EDITOR_LOAD = 1;", context);
(async () => {
  await context.careGapTopicalLoad('asset', 1);
  assert.ok(panel.innerHTML.includes('Write &amp; publish to blog — no interview'));
  state.kind = 'youtube'; await context.careGapTopicalLoad('asset', 1);
  assert.ok(panel.innerHTML.includes('Write &amp; publish — no interview'));
  state.hasFinishedInterview = true; state.writtenWithoutInterview = true; state.published = true; state.hasWriting = true;
  await context.careGapTopicalLoad('asset', 1);
  assert.ok(panel.innerHTML.includes('Published without interview — flagged for rewrite once the interview is answered.'));
  assert.ok(panel.innerHTML.includes('Rewrite &amp; publish with finished interview'));
  assert.ok(!panel.innerHTML.includes('— no interview</button>'));
  state.eligible = false; await context.careGapTopicalLoad('asset', 1); assert.equal(panel.hidden, true); assert.equal(panel.innerHTML, '');
  state.eligible = true; state.hasFinishedInterview = false;
  assert.equal(context.careGapTopicalPublishOptions().privacy, 'private');
  frame.contentDocument = { getElementById: id => ({ value: id === 'pubYtPrivacy' ? 'unlisted' : '2026-10-25T12:00:00Z' }) };
  await context.careGapTopicalWrite(true);
  assert.equal(requests.find(r => r.action === 'writePublishTopicalFromModal').source, 'publish-modal');
  assert.equal(requests.find(r => r.action === 'writePublishTopicalFromModal').skipInterview, true);
  assert.equal(requests.find(r => r.action === 'writePublishTopicalFromModal').privacy, 'unlisted');
  assert.equal(requests.find(r => r.action === 'writePublishTopicalFromModal').publishAt, '2026-10-25T12:00:00.000Z');
  assert.ok(panel.innerHTML.includes('✓ Written without interview'));
  assert.ok(panel.innerHTML.includes('✗ Publishing: Blog unavailable'));
  panel.innerHTML = 'new asset'; await context.careGapTopicalLoad('old asset', 0); assert.equal(panel.innerHTML, 'new asset');
  console.log('PASS: modal labels, finished-interview hiding, persistent rewrite message, distinct write/publish results and stale-response isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
