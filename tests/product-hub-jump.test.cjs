const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('index.html', 'utf8');
const worker = fs.readFileSync('worker/worker.js', 'utf8');

const classifyCode = worker.match(/^function kwHubClassifyProducts\([\s\S]*?^}/m)?.[0];
assert.ok(classifyCode, 'shared cleanup classifier exists');
const rt = (page, key) => (page?.properties?.[key]?.rich_text || []).map(x => x.plain_text || '').join('').trim();
const sel = (page, key) => page?.properties?.[key]?.select?.name || '';
const rel = (page, key) => (page?.properties?.[key]?.relation || []).map(x => String(x.id).replace(/-/g, ''));
const c = vm.createContext({
  STRATEGY_FIELDS: ['Customer', 'Benefits'], HC_BRIDGE_TYPE: 'Topic bridge',
  hcRt: rt, hcSel: sel, hcRel: rel,
  hcIsAffiliate: p => /affiliate/i.test([rt(p, 'Product Stack'), rt(p, 'Type'), sel(p, 'Site')].join(' ')),
  kwTitleOf: p => (p.properties?.Name?.title || []).map(x => x.plain_text || '').join('').trim(),
});
vm.runInContext(classifyCode, c);
const product = (id, { status = 'Planning', type = '', archived = false, price = '', url = '' } = {}) => ({ id, properties: {
  Name: { title: [{ plain_text: id }] }, Status: { select: { name: status } }, Type: { rich_text: [{ plain_text: type }] },
  Archived: { checkbox: archived }, Price: { rich_text: [{ plain_text: price }] }, URL: { url },
} });
const classified = c.kwHubClassifyProducts([
  product('main'), product('real', { price: '$20' }), product('bridge', { type: 'Topic bridge' }), product('affiliate', { type: 'Affiliate' }),
  product('placeholder'), product('archived', { archived: true }), product('retired', { status: 'Retired' }),
], [], [], [], ['main']);
const kindById = Object.fromEntries(classified.P.map(p => [p.id, p.kind]));
assert.deepEqual(kindById, { main: 'main', real: 'real', bridge: 'bridge', affiliate: 'affiliate', placeholder: 'placeholder' });
assert.ok(!classified.live.some(p => p.id === 'archived' || p.id === 'retired'));
assert.match(worker.slice(worker.indexOf('async function kwHubCleanPlan'), worker.indexOf('async function kwHubCleanApply')), /kwHubClassifyProducts\(prods, titles, assets, research, mains\)/);
assert.match(worker.slice(worker.indexOf('if (body.action === "getProducts")'), worker.indexOf('if (body.action === "getProductSchema")')), /kwHubClassifyProducts\(hubProductRows, hubTitles, hubAssets, hubResearch, mainIds\)/);

const jumpCode = html.match(/async function dev2JumpToProduct\([\s\S]*?^}/m)?.[0];
const revertCode = html.match(/function dev2LoadSaved\([\s\S]*?^}/m)?.[0];
assert.ok(jumpCode && revertCode, 'jump and saved-view restore functions exist');
assert.match(html, /onclick="switchTab\('products'\)">Products/);
assert.match(html, /id="prodContent"/);
assert.match(html, /dev2JumpToProduct\(this\.dataset\.product,this\.dataset\.hub\)/);
assert.match(jumpCode, /DEV2_F = \[\{ col: 'product', val: String\(productName/);
assert.match(jumpCode, /\{ col: 'hub', val: String\(hubName/);
assert.match(jumpCode, /DEV2_SORT = \[\{ col: 'hub'.*\{ col: 'assetName'/s);
assert.doesNotMatch(jumpCode, /dev2SaveState|localStorage\.setItem/);

const saved = new Map([['dev2Filters', JSON.stringify([{ col: 'status', val: 'Development' }])], ['dev2Sort', JSON.stringify([{ col: 'status', asc: false }])]]);
const cls = () => ({ add() {}, remove() {} });
const panel = { classList: cls() }, filterPanel = { style: { display: 'none' } }, target = { scrollIntoView() {} };
const tab = { classList: cls() };
const ui = vm.createContext({
  document: {
    querySelector: () => tab, querySelectorAll: () => [{ classList: cls() }],
    getElementById: id => id === 'tabDev2' ? panel : id === 'dev2Panel' ? filterPanel : target,
  },
  loadTabContent() {}, DEV2_LOAD_PROMISE: null, DEV2_ROWS: [{ kind: 'product' }],
  DEV2_F: [{ col: 'status', val: 'Development' }], DEV2_SORT: [{ col: 'status', asc: false }],
  DEV2_GROUP: false, DEV2_SELECTED: new Set(), DEV2_MAX_LEVELS: 7,
  localStorage: { getItem: key => saved.get(key) || null },
  dev2DrawPanel() {}, renderDev2() {},
});
vm.runInContext(jumpCode + '\n' + revertCode, ui);
(async () => {
  await ui.dev2JumpToProduct('Shared product', 'Hub B');
  assert.equal(ui.DEV2_F[0].val, 'Shared product');
  assert.equal(ui.DEV2_F[1].val, 'Hub B');
  assert.deepEqual(JSON.parse(JSON.stringify(ui.DEV2_SORT)).map(x => x.col), ['hub', 'product', 'title', 'assetName']);
  assert.equal(ui.DEV2_GROUP, true);
  assert.equal(filterPanel.style.display, '');
  assert.equal(saved.get('dev2Filters'), JSON.stringify([{ col: 'status', val: 'Development' }]));
  assert.equal(saved.get('dev2Sort'), JSON.stringify([{ col: 'status', asc: false }]));
  ui.dev2LoadSaved();
  assert.equal(ui.DEV2_F[0].val, 'Development');
  assert.deepEqual(JSON.parse(JSON.stringify(ui.DEV2_SORT)).map(x => x.col), ['status']);
  console.log('PASS: cleanup classification is shared, jump scopes by product + hub, and revert retains saved filters/sort.');
})().catch(error => { console.error(error); process.exitCode = 1; });
