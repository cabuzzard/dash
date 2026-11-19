// Hub Dash 2 entity flyout — the ONE set of rules for flyout ADDRESSES (operator 2026-11-19: "every flyout position should have an
// identifier that can be hooked into from an external"). Used by BOTH the dash flyout (shows / copies each position's address) and the
// worker's `flyout` action (find · map · set · rewrite, also open to the external key), so an outside AI writer resolves "the blurb on
// the Post tab of asset X" exactly the way the flyout shows it. Pure data, no DOM / network. Loaded as a classic <script> in the
// browser (window.FlyoutMap) and uploaded with the worker as an extra module (worker.js: import "./flyout-map.mjs" →
// globalThis.FlyoutMap; wrangler.toml rules). Keep it dependency-free.
//
// Address = <kind>:<record>[/<tab>/<key>]
//   kind    hub | cluster | topic | product | title | asset
//   record  hub/product/title/asset: the Notion page id, 32 hex, no dashes (hub = its Campaigns page)
//           topic: <campaignId>.<topicId>        cluster: <campaignId>.<cluster-name-slug>
//   tab     fields | post | images | research | keywords
//   key     fields/images/research: the slug of the field name ("Platform Title" → platform-title)
//           post: title | thumbnail | blurb      keywords: list      topic/cluster fields: name | cluster
// e.g. asset:41c1f7d3a4bb814a9b86ffe032ad1201/post/blurb · product:…/research/pain-points · topic:3f41….9a2b/keywords/list
(function (root) {
  const slug = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const nid = s => String(s || '').replace(/-/g, '').toLowerCase();
  const KINDS = ['hub', 'cluster', 'topic', 'product', 'title', 'asset'];
  const NOTION_KINDS = ['hub', 'product', 'title', 'asset'];
  // Post tab: first non-empty of each list (blurb falls back to the opening of Body, as the hub blog cards do)
  const POST = {
    title: ['Platform Title', 'SEO Title', 'Headline', 'Post Title', 'Hub Title'],
    thumbnail: ['Thumbnail', 'Post Image', 'Instagram Background', 'Hero Image', 'Image', 'Images'],
    blurb: ['Blurb', 'Description', 'Summary', 'Excerpt', 'Teaser'],
  };
  const RESEARCH = {
    product: ['Customer', 'Niche', 'Pain Points', 'Emotions', 'Solution', 'Benefits', 'Unique Opportunity', 'Transformation', 'Offer Structure', 'Proof Points', 'Objections'],
    title: ['Title Intent', 'Title Questions', 'Title Angle', 'Title Audience'],
  };
  const IMG_NAME = /(image|thumb|banner|background|hero|photo|cover|logo|icon|avatar|picture|plate|poster)/i;
  const imgLike = u => /^https?:\/\/\S+\.(png|jpe?g|webp|gif|avif|svg)(\?\S*)?$/i.test(u) || /^https?:\/\/[^\s]*(r2\.dev|notion-static|prod-files-secure|secure\.notion|images\.unsplash|\/images\/|\/backgrounds\/)/i.test(u);
  const tabsFor = kind => ['fields', ...(kind === 'product' || kind === 'title' ? ['research'] : []), ...(kind === 'cluster' || kind === 'topic' ? ['keywords'] : []), ...(NOTION_KINDS.includes(kind) ? ['post', 'images'] : [])];
  const txt = v => Array.isArray(v) ? v.join(' ') : String(v == null ? '' : v);
  // which property each Post part comes from — props = [{ name, type, value }]
  function postParts(props) {
    const by = n => (props || []).find(p => p.name === n);
    const pick = L => { for (const n of L) { const p = by(n); if (!p) continue; const v = p.type === 'files' ? (p.value || []).find(u => /^https?:/.test(u)) || '' : txt(p.value).trim(); if (v) return { field: n, value: v }; } return null; };
    const out = { title: pick(POST.title), thumbnail: pick(POST.thumbnail), blurb: pick(POST.blurb) };
    if (out.thumbnail && !/^https?:/.test(out.thumbnail.value)) out.thumbnail = null;
    if (!out.blurb) { const b = by('Body'), v = b ? txt(b.value).replace(/\s+/g, ' ').trim() : ''; if (v) out.blurb = { field: 'Body', fromBody: true, value: v.length > 300 ? v.slice(0, 300).replace(/\s+\S*$/, '') + '…' : v }; }
    return out;
  }
  const isImageField = p => p.type === 'files' ? ((p.value || []).length > 0 || IMG_NAME.test(p.name)) : p.type === 'url' && (IMG_NAME.test(p.name) || imgLike(txt(p.value)));
  function address(kind, record, tab, key) { return kind + ':' + record + (tab ? '/' + tab + (key ? '/' + key : '') : ''); }
  function parse(a) {
    const m = /^(hub|cluster|topic|product|title|asset):([a-z0-9.-]+?)(?:\/(fields|post|images|research|keywords)(?:\/([a-z0-9-]+))?)?\/?$/i.exec(String(a || '').trim());
    if (!m) return null;
    const kind = m[1].toLowerCase(), rec = m[2], out = { kind, record: rec, tab: (m[3] || '').toLowerCase(), key: (m[4] || '').toLowerCase() };
    if (NOTION_KINDS.includes(kind)) { out.pageId = nid(rec); if (!/^[0-9a-f]{32}$/.test(out.pageId)) return null; if (kind === 'hub') out.campaignId = out.pageId; }
    else { const [c, ...rest] = rec.split('.'); out.campaignId = nid(c); out.sub = rest.join('.'); if (!/^[0-9a-f]{32}$/.test(out.campaignId) || !out.sub) return null; }
    return out;
  }
  // every position of a Notion record: rec = { kind, record, props: [{ name, type, value, editable, options }], research?: { field: value } }
  function positions(rec) {
    const L = [], at = (tab, key) => address(rec.kind, rec.record, tab, key), props = rec.props || [];
    props.forEach(p => L.push({ address: at('fields', slug(p.name)), tab: 'fields', label: p.name, field: p.name, type: p.type, value: p.value, editable: !!p.editable, options: p.options || null }));
    if (RESEARCH[rec.kind]) RESEARCH[rec.kind].forEach(f => L.push({ address: at('research', slug(f)), tab: 'research', label: f, field: f, type: 'rich_text',
      value: rec.research ? (rec.research[f] || '') : ((props.find(p => p.name === f) || {}).value || ''), editable: true }));
    if (NOTION_KINDS.includes(rec.kind)) {
      const P = postParts(props);
      [['thumbnail', 'Thumbnail'], ['title', 'Title'], ['blurb', 'Blurb']].forEach(([k, label]) => { const x = P[k]; if (!x) return; const p = props.find(q => q.name === x.field) || {};
        L.push({ address: at('post', k), tab: 'post', label, field: x.field, type: p.type, value: x.fromBody ? p.value : x.value, editable: !!p.editable, ...(x.fromBody ? { note: 'from the opening of Body — writing it replaces all of Body' } : {}) }); });
      props.filter(isImageField).forEach(p => L.push({ address: at('images', slug(p.name)), tab: 'images', label: p.name, field: p.name, type: p.type, value: p.value, editable: !!p.editable && p.type !== 'files' }));
    }
    return L;
  }
  root.FlyoutMap = { slug, nid, KINDS, NOTION_KINDS, POST, RESEARCH, IMG_NAME, imgLike, tabsFor, postParts, isImageField, address, parse, positions };
})(typeof globalThis !== 'undefined' ? globalThis : window);
