// ══════════════════════ DESIGN PANEL (shared) ══════════════════════
// ONE design editor, mounted by both the care-gap microsite's Design tab and the dashboard's
// Content Hubs card, so the two are always the same. A hub IS its campaign.
//
// THE DESIGN SPEC (2026-10-09) — the campaign's whole visual system as ~175 FIELD → VALUE rows in three tiers:
//   1 · Web & content layout   (intent, color, type, layout, components, content, motion)
//   2 · Image specifications   (every image: medium, line, people, light, text-on-image, never-list)
//   3 · Asset image specs      (hero, signup, single post, carousel slide, story, blog + YouTube thumbs, offer)
// Each field = { v: the value as data, why: one plain line, src: which input set it }.
// Worker: action designSpec (handleDesignSpec in worker.js) — staged + saved spec and the inputs live in KV.
//
// INPUTS, in order (later wins, except the additive ones):
//   ① keywords (+ a live search of the page-one sites) → ② seed photo → ✨ Build (Claude fills every field)
//   ③ ChatGPT (📋 prompt out, 📥 reply back — additive) → ④ text override (authoritative) → ⑤ Grok search (additive)
// Additive sources only fill empty fields; elsewhere their value shows as a suggestion to ✓ use.
// 💾 Save: spec → KV, rendered "field: value — why" lines → Research "Image Spec" (every image engine reads it),
// and the colors / fonts / imagery → the legacy Palette, Fonts, Visual Register, Photography Direction,
// Visual Avoid and Design Notes fields. ⇪ Publish puts the spec's palette + fonts on the live hub.
//
//   DesignPanel.mount(el, { call(action, body) → Promise<json>, campaignId, slug, preview?(d), onPushed?(r) })
(function () {
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const C = { ink: 'var(--text, var(--ink, #222))', ink2: 'var(--text2, var(--ink2, #555))', ink3: 'var(--text3, var(--ink3, #888))', line: 'var(--border2, var(--border, #ccc))',
    surf: 'var(--surface, #fff)', surf2: 'var(--surface2, #f4f4f4)', acc: 'var(--accent, var(--sea, #0b6e8a))', ok: 'var(--fresh, #3a9a5b)', bad: '#c0392b', warn: '#b26a00' };
  const BTN = `font-size:11px;padding:4px 10px;border:1px solid ${C.line};border-radius:6px;background:${C.surf2};color:${C.ink};cursor:pointer;`;
  const BTNP = `font-size:11px;padding:4px 10px;border:1px solid ${C.acc};border-radius:6px;background:${C.acc};color:var(--bg, #fff);font-weight:600;cursor:pointer;`;
  const TA = `width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;padding:6px 8px;border:1px solid ${C.line};border-radius:6px;background:${C.surf};color:${C.ink};`;
  const SEL = `font-size:11px;padding:2px 4px;border:1px solid ${C.line};border-radius:5px;background:${C.surf};color:${C.ink};`;
  const LBL = `font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};`;
  const SRC = { keywords: ['kw', '#2f6fb0'], photo: ['photo', '#7a4fb5'], text: ['text', '#b26a00'], chatgpt: ['chatgpt', '#2a8a6a'], grok: ['grok', '#555'], claude: ['claude', '#b5651d'], manual: ['you', '#c0392b'] };
  // spec → hub tokens / fonts (the hub's 10 roles) and the legacy direction fields
  const TOKEN_MAP = [['bg', 'color.bg'], ['surface', 'color.surface'], ['ink', 'color.ink'], ['ink-head', 'color.ink_head'], ['ink-soft', 'color.ink_soft'], ['line', 'color.line'],
    ['sea', 'color.primary'], ['deep', 'color.deep'], ['deep-ink', 'color.deep_ink'], ['accent', 'color.accent']];
  const hexOf = v => { const m = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(String(v || '')); return m ? m[0].toUpperCase() : null; };
  const famOf = v => String(v || '').split(/[,(;·]| — | - /)[0].replace(/["']/g, '').trim();

  function mount(root, cfg) {
    const S = { cid: String(cfg.campaignId || '').replace(/-/g, ''), slug: cfg.slug || '', schema: [], tiers: [], saved: null, savedAt: null, staged: {}, inputs: {}, job: null,
      open: {}, edit: null, busy: '', msg: '', msgKind: '', kw: null, override: null, gptReply: '', preview: false,
      tests: [], aspect: '3:4', plate: null, voice: null, myPrompt: '', renders: {} };
    const call = async (a, b) => { const r = await cfg.call(a, Object.assign({ campaignId: S.cid }, b || {})); if (r && r.error) throw new Error(r.error); return r || {}; };
    const ds = (op, b) => call('designSpec', Object.assign({ op }, b || {}));
    root.__dp = S;
    const say = (m, kind) => { S.msg = m || ''; S.msgKind = kind || ''; render(); };
    const take = r => { if (r.schema) S.schema = r.schema; if (r.tiers) S.tiers = r.tiers; if ('saved' in r) S.saved = r.saved; if ('savedAt' in r) S.savedAt = r.savedAt;
      if (r.staged) S.staged = r.staged; if (r.inputs) S.inputs = r.inputs; if ('job' in r) S.job = r.job; };
    const fv = k => (S.staged[k] || {}).v || '';
    const palette = spec => { const p = {}; for (const [t, k] of TOKEN_MAP) { const h = hexOf((spec[k] || {}).v); if (!h) return null; p[t] = h; } return p; };
    const fonts = spec => { const d = famOf((spec['type.display_font'] || {}).v), b = famOf((spec['type.body_font'] || {}).v), m = famOf((spec['type.label_font'] || {}).v);
      return d && b ? { display: d, body: b, mono: m || b } : null; };
    const pushPreview = () => { if (cfg.preview) try { cfg.preview(S.preview ? { palette: palette(S.staged), fonts: fonts(S.staged) } : null); } catch (err) {} };
    const diffKeys = () => { const a = S.staged || {}, b = S.saved || {}; const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
      return [...ks].filter(k => ((a[k] || {}).v || '') !== ((b[k] || {}).v || '')); };

    // ── load ──
    async function load() {
      S.busy = 'Loading the design spec…'; render();
      try { take(await ds('get')); } catch (err) { S.busy = ''; return say('Could not load the design spec: ' + err.message, 'bad'); }
      S.kw = S.inputs.keywords || ''; S.override = S.inputs.override || ''; S.renders = Object.assign({}, S.inputs.renders || {});
      if (!S.kw && S.slug) call('getHubKeywords', { slug: S.slug }).then(r => { if (!S.kw && r.keywords) { S.kw = r.keywords; render(); } }).catch(() => {});
      S.busy = ''; render();
      if (S.job && S.job.status === 'running') poll();
      call('getApprovedPlate').then(r => { S.plate = r.plate || null; render(); }).catch(() => {});
    }

    // ── engines (run inside the request, 1-3 min; a pass started in another tab is polled) ──
    const LABEL = { build: 'Build from keywords + seed photo', text: 'Text override', grok: 'Grok search' };
    function report(j, secs) {
      j = j || {};
      if (j.status === 'error') return say(`${LABEL[j.op] || j.op} failed: ${j.error}`, 'bad');
      S.open.spec_web = S.open.spec_image = S.open.spec_asset = true;
      say(`${LABEL[j.op] || j.op}${secs ? ` (${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')})` : ''}: ${(j.applied || []).length} fields set${(j.suggested || []).length ? `, ${j.suggested.length} suggestions to review (✓ use / ✕)` : ''}. Review, then 💾 Save spec.`, 'ok');
    }
    async function poll() {
      S.busy = (LABEL[S.job.op] || S.job.op) + ' is running (started elsewhere) — waiting for it…'; render();
      for (let i = 0; i < 75; i++) {
        await new Promise(r => setTimeout(r, 4000));
        let r; try { r = await ds('get'); } catch (err) { continue; }
        take(r);
        if (!S.job || S.job.status !== 'running') break;
      }
      S.busy = '';
      if (S.job && S.job.status === 'running') return say('That pass looks stuck — run it again.', 'bad');
      report(S.job);
    }
    // working state: the pressed button turns into "⏳ m:ss working…" (ticking without a re-render, so typing isn't lost)
    const ACT = { build: 'build', text: 'override', grok: 'grok' };
    function startWork(act, busy) {
      S.work = { act, start: Date.now() }; S.busy = busy; render();
      clearInterval(S.workTick);
      S.workTick = setInterval(() => { if (!S.work) return clearInterval(S.workTick); const s = Math.round((Date.now() - S.work.start) / 1000);
        root.querySelectorAll('[data-timer]').forEach(n => { n.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }); }, 1000);
    }
    function endWork() { const s = S.work ? Math.round((Date.now() - S.work.start) / 1000) : 0; S.work = null; clearInterval(S.workTick); S.busy = ''; return s; }
    async function run(op, extra) {
      startWork(ACT[op] || op, (LABEL[op] || op) + ' — filling the fields (1-5 min, keep this tab open)…');
      try { const r = await ds(op, extra); take(r); const s = endWork(); report(Object.assign({ op, status: 'done', applied: r.applied, suggested: r.suggested }, r.job || {}), s); }
      catch (err) { endWork(); say(err.message, 'bad'); }
    }
    // ── asset images: rendered on Grok from the staged spec's asset.<id>.* fields + the every-image fields ──
    const ASPECTS = ['3:4', '1:1', '16:9'];
    const nearest = v => { const m = /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(String(v || '')); if (!m) return '3:4'; const r = m[1] / m[2];
      return ASPECTS.slice().sort((a, b) => Math.abs(a.split(':')[0] / a.split(':')[1] - r) - Math.abs(b.split(':')[0] / b.split(':')[1] - r))[0]; };
    const assetSecs = () => S.schema.filter(s => s.tier === 'asset');
    async function renderAsset(id) {
      const sp = S.staged, v = k => (sp[k] || {}).v || '', sec = assetSecs().find(s => s.id === 'asset.' + id), label = sec ? sec.label.split(' — ')[0] : id;
      const asset = Object.keys(sp).filter(k => k.startsWith(`asset.${id}.`) && v(k)).map(k => `${k}: ${v(k)}`).join('\n');
      if (!asset) throw new Error(`the ${label} fields are empty — ✨ Build first`);
      const base = Object.keys(sp).filter(k => /^(img|ovl|avoid|color)\./.test(k) && v(k)).map(k => `${k}: ${v(k)}`).join('\n');
      const r = await call('renderSpecTest', { spec: `${asset}\n\n${base}`, palette: palette(sp) || undefined, aspect: nearest(v(`asset.${id}.aspect`)),
        steer: `This is the ${label}. Follow every asset.${id}.* line exactly (subject, composition, background, safe area). No text, letters or numbers in the image.` });
      S.renders[id] = { url: r.imageUrl, prompt: r.prompt || '', aspect: r.aspect, at: Date.now(), sig: imgSig(id) };
      return r;
    }
    // the fields an image is rendered from — a render is current while these are unchanged
    const imgSig = id => sig(Object.fromEntries(Object.entries(S.staged || {}).filter(([k]) => k.startsWith(`asset.${id}.`) || /^(img|ovl|avoid|color)\./.test(k))));
    const imgCurrent = id => { const rr = S.renders[id]; return !!(rr && rr.url && rr.sig && rr.sig === imgSig(id)); };
    async function renderAssets(ids, after) {
      for (const id of ids) {
        startWork('render_' + id, `Rendering the ${id.replace(/_/g, ' ')} image on Grok (~20s)…`); render();
        try { await renderAsset(id); endWork(); }
        catch (err) { endWork(); return say(`${after ? after + ' — but the ' : ''}${id.replace(/_/g, ' ')} image failed: ${err.message}`, 'bad'); }
      }
      await persistRenders();
      say(`${after ? after + ' ' : ''}Rendered: ${ids.map(x => x.replace(/_/g, ' ')).join(' + ')} — see 🖼 Asset images.${S.slug ? ' ✓ Set on hub puts one live.' : ''}`, 'ok');
    }
    async function setOnHub(id) {
      const rr = S.renders[id]; if (!rr) return;
      if (!confirm(`Put this ${id} image on the live hub page? (live in ~1 min)`)) return;
      startWork('set_' + id, 'Setting the image on the hub…');
      try { await call('hubImage', { slug: S.slug, kind: id === 'signup' ? 'signup' : 'hero', op: 'url', url: rr.url }); endWork(); rr.live = true; persistRenders(); say(`The ${id} image is set on the hub — live in about a minute.`, 'ok'); }
      catch (err) { endWork(); say('Could not set it: ' + err.message, 'bad'); }
    }
    async function saveInputs() { try { take(await ds('inputs', { keywords: S.kw, override: S.override })); } catch (err) { say('Could not save the inputs: ' + err.message, 'bad'); } }
    // ✨ Build = the whole first pass off the inputs: research fields → every spec field → saved to the Research
    // record → hero + signup images → the whole page. Each step shows ⏳ / ✅ / ❌; a failure stops the run.
    const PIPE = [['research', 'Research fields → Research + Campaign records'], ['spec', 'All spec fields'], ['save', 'Save the spec → Image Spec, Palette, Fonts, direction'],
      ['images', 'Hero + signup images'], ['page', 'The whole page (preview)']];
    const sig = sp => { const s = Object.keys(sp || {}).sort().filter(k => sp[k] && sp[k].v).map(k => k + '=' + sp[k].v).join('\n'); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
    const stale = () => { const pg = (S.inputs || {}).page; return !!(pg && pg.sig && pg.sig !== sig(S.staged)); };
    const iterBar = () => (S.inputs || {}).page ? `<div style="margin:0 0 12px 13px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${wb('visuals', stale() ? BTNP : BTN, '🔁 Update visuals')}${wb('reread', BTN, '↻ Re-read inputs into the spec')}
        <span style="font-size:10.5px;color:${stale() ? C.warn : C.ink3};">${stale() ? '● the spec changed since the visuals were made' : 'visuals match the spec'} · iterating keeps your edits</span></div>` : '';
    const imageUrls = () => Object.fromEntries(Object.entries(S.renders).map(([k, r]) => [k, r.url]));
    async function persistRenders() { try { take(await ds('inputs', { renders: S.renders })); } catch (err) {} }
    async function build() {
      if (!String(S.kw || '').trim()) return say('Add the keywords first.', 'bad');
      const pre = cfg.beforeBuild ? cfg.beforeBuild() : ''; if (pre && !confirm(pre)) return;
      if (!confirm('Build everything from these inputs?\n\nRewrites every design-spec field (reading — not changing — the campaign research), the saved Image Spec / Palette / Fonts on the Research record, and renders the images + a full page preview. Fields you edited by hand are kept. The live hub page only changes when you press ⇪ Publish or ✓ Set on hub.')) return;
      return runPipe('build', PIPE.map(x => x[0]).filter(k => k !== 'research'), 'Building everything from the inputs (6-9 min, keep this tab open)…', 'First pass done');
    }
    // iterate: the spec has changed (edits, override, ChatGPT, Grok) → save it and redo the images + the page from it
    const updateVisuals = () => runPipe('visuals', ['save', 'images', 'page'], 'Updating the visuals from the current spec (2-3 min)…', 'Visuals updated');
    // iterate: new photo / keywords → refresh the spec from the inputs (manual edits kept), nothing else
    const reread = async () => { await saveInputs(); return runPipe('reread', ['spec'], 'Re-reading the inputs into the spec (3-5 min)…', 'Spec refreshed from the inputs'); };
    async function runPipe(act, keys, busyMsg, doneMsg) {
      S.pipe = {}; PIPE.filter(([k]) => keys.includes(k)).forEach(([k]) => { S.pipe[k] = { s: '' }; });
      startWork(act, busyMsg);
      await saveInputs();
      const step = (k, s, d) => { S.pipe[k] = { s, d: d || '' }; S.busy = s === 'run' ? `${PIPE.find(x => x[0] === k)[1]}…` : S.busy; render(); };
      for (const [k] of PIPE.filter(([x]) => keys.includes(x))) {
        step(k, 'run');
        try {
          if (k === 'research') { const r = await ds('research', { keywords: S.kw }); take(r); step(k, 'ok', `${(r.wrote || []).join(' + ')} written${(r.errors || []).length ? ' — ' + r.errors.join('; ') : ''}`); }
          else if (k === 'spec') { const r = await ds('build'); take(r); const j = r.job || {}; step(k, 'ok', `${(j.applied || []).length} fields set${(j.suggested || []).length ? `, ${j.suggested.length} suggestions` : ''}`); }
          else if (k === 'save') { const r = await ds('save'); take(r); if (r.notionError) throw new Error(r.notionError); step(k, 'ok', `${Object.keys(r.saved || {}).length} fields saved; ${(r.wrote || []).length} Research fields written`); }
          else if (k === 'images') { for (const id of ['hero', 'signup']) { step(k, 'run', `rendering the ${id}…`); await renderAsset(id); } await persistRenders(); step(k, 'ok', 'hero + signup rendered — see 🖼 Asset images'); }
          else if (k === 'page') { const r = await ds('page', { images: imageUrls() }); take(r); step(k, 'ok', 'built — see 📄 Page preview'); }
        } catch (err) {
          step(k, 'err', err.message); PIPE.slice(PIPE.findIndex(x => x[0] === k) + 1).filter(([x]) => keys.includes(x)).forEach(([x]) => { S.pipe[x] = { s: 'skip' }; });
          const s = endWork(); return say(`Build stopped at "${PIPE.find(x => x[0] === k)[1]}" after ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}: ${err.message}`, 'bad');
        }
      }
      const s = endWork();
      if (cfg.onBuilt && (S.inputs || {}).page) { try { cfg.onBuilt(S.inputs.page.url); } catch (err) {} }
      say(`${doneMsg} in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${act === 'build' ? ' Now refine: edit fields, 📋 ChatGPT, text override, Grok — then 🔁 Update visuals.' : act === 'reread' ? ' 🔁 Update visuals to see it.' : ''}`, 'ok');
    }
    async function rebuildPage() {
      startWork('page', 'Building the whole page from the staged spec (~1-2 min)…');
      try { const r = await ds('page', { images: imageUrls() }); take(r); endWork(); say('Page rebuilt — see 📄 Page preview.', 'ok'); if (cfg.onBuilt && (S.inputs || {}).page) { try { cfg.onBuilt(S.inputs.page.url); } catch (err) {} } }
      catch (err) { endWork(); say('Page build failed: ' + err.message, 'bad'); }
    }
    function pipeList() {
      if (!S.pipe) return '';
      const icon = s => ({ run: '⏳', ok: '✅', err: '❌', skip: '⏭' })[s] || '·';
      return `<div style="margin-top:6px;border:1px solid ${C.line};border-radius:6px;padding:4px 8px;">${PIPE.filter(([k]) => S.pipe[k]).map(([k, label]) => { const st = S.pipe[k] || {};
        return `<div style="font-size:11px;padding:2px 0;color:${st.s === 'err' ? C.bad : C.ink};">${icon(st.s)} ${e(label)}${st.d ? ` <span style="color:${st.s === 'err' ? C.bad : C.ink3};">— ${e(st.d)}</span>` : ''}</div>`; }).join('')}</div>`;
    }
    async function applyOverride() { if (!(S.override || '').trim()) return say('Type the override first.', 'bad'); await saveInputs(); run('text', { override: S.override }); }
    async function grok() { await saveInputs(); run('grok'); }
    async function uploadPhoto(file) {
      if (!file) return; startWork('photo', 'Uploading the seed photo…');
      try {
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const sc = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        take(await ds('photo', { data: cv.toDataURL('image/jpeg', 0.9) }));
        endWork(); say((S.inputs || {}).page ? 'Seed photo replaced — ↻ Re-read inputs to refresh the photo-led fields, then 🔁 Update visuals.' : 'Seed photo stored. Now ✨ Build everything from inputs.', 'ok');
      } catch (err) { endWork(); say('Photo upload failed: ' + err.message, 'bad'); }
    }
    async function copyChat() {
      startWork('chatCopy', 'Writing the ChatGPT prompt…');
      try { const r = await ds('chatPrompt', { only: revKeys(), note: S.revNote }); endWork();
        await navigator.clipboard.writeText(r.prompt);
        say(`Prompt copied — the sources + ${revKeys() ? revKeys().length + ' picked fields (the rest as context)' : 'every field'} + the image links. Paste it into ChatGPT or Grok, drag in the thumbnails, then paste the reply and 📥 Paste back.`, 'ok'); }
      catch (err) { endWork(); say('Could not copy the prompt: ' + err.message, 'bad'); }
    }
    async function mergeChat() {
      if (!S.gptReply.trim()) return say('Paste ChatGPT\'s reply first.', 'bad');
      startWork('chatMerge', 'Staging the reviewed fields…');
      try { const r = await ds('chatReply', { text: S.gptReply, only: revKeys() }); take(r); S.gptReply = ''; endWork();
        const n = (r.applied || []).length; say(`${n} field${n === 1 ? '' : 's'} changed and staged — building the preview…`, 'ok');
        if (n) await previewStaged(true).catch(() => {});
        say(`${n} field${n === 1 ? '' : 's'} changed by the review and staged${n ? ' — preview on the right' : ''}. Keep with 💾 Save, or ↺ Revert (per section or all).`, 'ok'); }
      catch (err) { endWork(); say('Paste back failed: ' + err.message, 'bad'); }
    }

    // ── field edits ──
    async function editField(k, v) { try { take(await ds('edit', { key: k, v })); S.edit = null; render(); } catch (err) { say('Edit failed: ' + err.message, 'bad'); } }
    async function alt(k, accept) { try { take(await ds(accept ? 'accept' : 'dismiss', { key: k })); render(); } catch (err) { say(err.message, 'bad'); } }
    async function revert() { if (!confirm('Throw away every staged change and go back to the saved spec?')) return; try { take(await ds('revert')); say('Back to the saved spec.', 'ok'); } catch (err) { say(err.message, 'bad'); } }

    // ── save: KV + Image Spec text + the legacy design fields ──
    async function save() {
      if (!diffKeys().length) return say('Nothing to save — every field already matches the saved spec. Edit a field (or run a pass) first.', 'ok');
      startWork('save', 'Saving the spec…');
      try {
        // the worker writes Image Spec + Palette / Fonts / direction fields onto the Research record itself
        const r = await ds('save'); take(r); if (cfg.onSaved) { try { cfg.onSaved(); } catch (err) {} }
        endWork();
        if (r.notionError) return say(`Saved the spec, but the Research record write failed: ${r.notionError}`, 'bad');
        say(`Saved — ${Object.keys(S.saved || {}).length} fields. Image Spec, palette, fonts and direction updated on the record. ⇪ Publish puts the palette + fonts on the live hub.`, 'ok');
      } catch (err) { endWork(); say('Save failed: ' + err.message, 'bad'); }
    }
    async function publish() {
      const p = palette(S.saved || {}), f = fonts(S.saved || {});
      if (!p) return say('The saved spec needs all ten color fields as hex before it can publish.', 'bad');
      if (!confirm('Publish the saved spec\'s palette + fonts to the live hub page? (live in ~1 min)')) return;
      S.busy = 'Publishing to the live hub…'; render();
      try { const r = await call('publishHubDesign', { slug: S.slug, keepSpec: true, palette: p, fonts: f || undefined }); S.busy = ''; say('Published — live in about a minute.', 'ok'); if (cfg.onPushed) cfg.onPushed(r); }
      catch (err) { S.busy = ''; say('Publish failed: ' + err.message, 'bad'); }
    }

    // ── Test on Grok (reads the SAVED Image Spec on the record; 🧪 staged sends the staged fields) ──
    const specText = spec => S.schema.map(s => s.fields.filter(([k]) => spec[k] && spec[k].v).map(([k]) => `${k}: ${spec[k].v}${spec[k].why ? ' — ' + spec[k].why : ''}`).join('\n')).filter(Boolean).join('\n');
    async function testGrok(guidance, prevPrompt, mode) {
      const staged = mode === 'staged';
      S.busy = staged ? 'Grok is rendering from the staged spec (~20s)…' : 'Grok is rendering from the saved spec (~20s)…'; render();
      try { const body = staged ? { spec: specText(S.staged), palette: palette(S.staged) || undefined } : { palette: palette(S.saved || {}) || undefined };
        const r = await call('renderSpecTest', Object.assign(body, { aspect: S.aspect, guidance: guidance || undefined, previousPrompt: guidance ? prevPrompt : undefined }));
        S.tests.unshift({ url: r.imageUrl, prompt: r.prompt || '', aspect: r.aspect || S.aspect, mode: staged ? 'staged' : 'saved', label: (guidance ? 'regen: ' + guidance.slice(0, 40) : staged ? 'staged spec' : 'saved spec') });
        S.busy = ''; S.open.grok = true; say('Rendered — newest first.', 'ok'); }
      catch (err) { S.busy = ''; say('Grok test failed: ' + err.message, 'bad'); }
    }
    async function grokMine() {
      const p = (S.myPrompt || '').trim(); if (p.length < 10) return say('Type your prompt first.', 'bad');
      S.busy = 'Grok is rendering your prompt, word for word…'; render();
      try { const r = await call('renderSpecTest', { rawPrompt: p, aspect: S.aspect }); S.tests.unshift({ url: r.imageUrl, prompt: p, aspect: r.aspect || S.aspect, label: 'my prompt' }); S.busy = ''; S.open.grok = true; say('Rendered from your prompt.', 'ok'); }
      catch (err) { S.busy = ''; say('Grok render failed: ' + err.message, 'bad'); }
    }
    async function approve(i) { const t = S.tests[i]; if (!t) return; try { const r = await call('saveApprovedPlate', { imageUrl: t.url, prompt: t.prompt }); S.plate = r.plate || { imageUrl: t.url }; say('Approved as the campaign plate.', 'ok'); } catch (err) { say('Approve failed: ' + err.message, 'bad'); } }
    async function clearPlate() { try { await call('saveApprovedPlate', { clear: true }); S.plate = null; render(); } catch (err) { say('Clear failed: ' + err.message, 'bad'); } }

    // ── voice ──
    async function loadVoice() { if (S.voice) return; S.voice = { loading: true }; render();
      try { const r = await call('getVoiceProfile'); S.voice = { global: (r.global && r.global.text) || '', campaign: (r.campaign && r.campaign.text) || '', recent: r.recent || [] }; }
      catch (err) { S.voice = { error: err.message }; } render(); }
    async function saveVoice() { try { await call('saveVoiceProfile', { global: S.voice.global, campaign: S.voice.campaign }); say('Voice rules saved.', 'ok'); } catch (err) { say('Voice save failed: ' + err.message, 'bad'); } }

    // ── render ──
    const card = (key, title, sub, body) => { const o = !!S.open[key];
      return `<div style="border:1px solid ${C.line};border-radius:8px;margin-bottom:8px;background:${C.surf};">
        <div data-act="toggle" data-k="${key}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none;">
          <span style="font-size:10px;color:${C.ink3};width:10px;">${o ? '▼' : '▶'}</span><b style="font-size:12.5px;color:${C.ink};">${title}</b><span style="font-size:11px;color:${C.ink3};flex:1;">${sub || ''}</span></div>
        ${o ? `<div style="padding:4px 12px 12px;">${body()}</div>` : ''}</div>`; };
    const badge = src => { const b = SRC[src] || [src || '?', '#888']; return `<span title="set by ${e(b[0])}" style="font-size:9px;padding:0 5px;border-radius:8px;border:1px solid ${b[1]};color:${b[1]};white-space:nowrap;">${e(b[0])}</span>`; };
    const swatch = v => { const h = hexOf(v); return h ? `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid ${C.line};background:${h};vertical-align:-2px;margin-right:5px;"></span>` : ''; };
    const step = (n, title, body) => `<div style="border-left:3px solid ${C.line};padding:2px 0 2px 10px;margin-bottom:12px;"><div style="${LBL}margin-bottom:4px;">${n} · ${title}</div>${body}</div>`;
    const elapsed = () => { const s = S.work ? Math.round((Date.now() - S.work.start) / 1000) : 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    // a run button: while its own job runs it reads "⏳ m:ss working…"; every other button is disabled meanwhile
    const wb = (act, style, label) => S.work && S.work.act === act
      ? `<button disabled data-act="${act}" style="${style}opacity:.9;cursor:wait;">⏳ <span data-timer>${elapsed()}</span> working…</button>`
      : `<button ${S.busy ? 'disabled' : ''} data-act="${act}" style="${style}">${label}</button>`;
    // which inputs are on file right now — what ✨ Build will read
    function loadedInputs() {
      const inp = S.inputs || {}, rk = inp.ranked || {}, d = x => x ? ' · ' + String(x).slice(0, 10) : '';
      const nKw = String(S.kw || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).length;
      const chip = (ok, text, title) => `<span title="${e(title || '')}" style="display:inline-block;font-size:10.5px;padding:2px 8px;margin:2px 4px 2px 0;border-radius:10px;border:1px solid ${ok ? C.ok : C.line};color:${ok ? C.ok : C.ink3};">${ok ? '✓' : '○'} ${e(text)}</span>`;
      return `<div style="margin-top:6px;"><span style="${LBL}margin-right:4px;">Loaded inputs</span>`
        + chip(nKw > 0, nKw ? `${nKw} keyword${nKw > 1 ? 's' : ''}` : 'no keywords — required', S.kw)
        + chip(!!rk.look, rk.look ? `ranked-site look · ${(rk.sites || []).length} sites${d(rk.at)}` : 'ranked sites — searched during the build', rk.look)
        + chip(!!(inp.photo && inp.photo.url), inp.photo && inp.photo.url ? `seed photo${inp.photo.read ? ' (read)' : ''}${d(inp.photo.at)}` : 'no seed photo — look comes from the keywords')
        + chip(!!String(S.override || '').trim(), String(S.override || '').trim() ? 'text override (Build follows it)' : 'no text override', S.override)
        + chip(!!inp.chatgpt, inp.chatgpt ? `ChatGPT merged${d(inp.chatgpt.at)}` : 'ChatGPT not merged')
        + chip(!!(inp.grok && inp.grok.notes), inp.grok && inp.grok.notes ? `Grok notes${d(inp.grok.at)}` : 'no Grok notes', inp.grok && inp.grok.notes)
        + `</div>`;
    }
    // Inputs in order ① → ⑤, each marked green once it's loaded; ONE build/rebuild button after all of them;
    // then a separate, explained "after you edit fields" block (Update visuals / Re-read).
    // ── Send for review: Claude / ChatGPT / Grok work off the CURRENT fields (+ the sources) and rewrite them to their
    // opinion → staged → preview. Not sources: what you save is simply in the next send. Pick fields to limit a round.
    S.revOnly = S.revOnly || new Set(); S.revOpen = S.revOpen || new Set(); S.revNote = S.revNote || '';
    const revKeys = () => S.revOnly.size ? [...S.revOnly] : null;
    function reviewBox() {
      const inp = S.inputs || {}, ph = inp.photo || {}, rv = inp.review || {}, n = S.revOnly.size;
      const ims = [ph.url ? ['seed photo', ph.url] : null, ...Object.entries(S.renders || {}).filter(([k, r]) => r && r.url).map(([k, r]) => [k.replace(/_/g, ' '), r.url])].filter(Boolean);
      const secs = dpSections().map(sec => { const ks = secKeys(sec), on = ks.filter(k => S.revOnly.has(k)).length;
        return `<details data-revsec="${e(sec.id)}" ${S.revOpen.has(sec.id) ? 'open' : ''} style="margin:2px 0;"><summary style="font-size:11px;cursor:pointer;"><label onclick="event.stopPropagation()"><input type="checkbox" data-act="revSec" data-sec="${e(sec.id)}" ${on === ks.length ? 'checked' : ''}> ${e(sec.label)}</label> <span style="color:${C.ink3};font-size:10px;">${on ? on + '/' + ks.length + ' picked' : ''}</span></summary>
          <div style="padding:2px 0 4px 18px;columns:2;font-size:10.5px;">${sec.fields.map(([k, l]) => `<label style="display:block;"><input type="checkbox" data-act="revKey" data-k="${e(k)}" ${S.revOnly.has(k) ? 'checked' : ''}> ${e(l)}</label>`).join('')}</div></details>`; }).join('');
      return `<div style="margin:4px 0 12px;padding:10px;border:1px solid ${C.line};border-radius:8px;">
        <div style="${LBL}margin-bottom:4px;">Send for review — Claude · ChatGPT · Grok rewrite the fields → staged → preview</div>
        <div style="font-size:10.5px;color:${C.ink3};margin-bottom:6px;">They get the sources (keywords, keyword research, campaign + main products, images) and the CURRENT fields, and give their own value for each — rewriting anything they'd do differently. Their values replace the staged ones; 💾 Save keeps them (and they're in the next send), ↺ Revert brings back the saved ones.</div>
        <div style="font-size:11px;margin-bottom:4px;"><b>Fields:</b> ${n ? `${n} picked <button data-act="revAll" style="${BTN}font-size:10px;padding:1px 7px;">✕ clear → all fields</button>` : 'all fields (tick sections or fields below to send only those)'}</div>
        <div style="max-height:220px;overflow:auto;border:1px solid ${C.line};border-radius:6px;padding:4px 8px;margin-bottom:6px;">${secs}</div>
        <textarea data-in="revNote" rows="2" placeholder="Optional ask for this round — e.g. make it warmer · bolder headlines · don't touch the colors" style="${TA}margin-bottom:6px;">${e(S.revNote)}</textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">${wb('revClaude', BTNP, '🤖 Claude review (in-app)')}${wb('revGrok', BTN, '⚡ Grok review (in-app, web + X)')}</div>
        <div style="${LBL}margin-bottom:4px;">or by hand in ChatGPT / Grok</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">${wb('chatCopy', BTN, '📋 Copy prompt')}<span style="font-size:10.5px;color:${C.ink3};align-self:center;">paste it in, drag in the images below, then paste the reply here</span></div>
        ${ims.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">${ims.map(([l, u]) => `<a href="${e(u)}" target="_blank" rel="noopener" title="drag into ChatGPT / Grok" style="text-align:center;font-size:9.5px;color:${C.ink3};text-decoration:none;"><img src="${e(u)}" draggable="true" style="height:56px;border-radius:5px;border:1px solid ${C.line};display:block;">${e(l)}</a>`).join('')}</div>` : ''}
        <textarea data-in="gpt" rows="3" placeholder="Paste the ChatGPT or Grok reply (the JSON block is found automatically)…" style="${TA}">${e(S.gptReply)}</textarea>
        <div style="margin-top:6px;">${wb('chatMerge', BTN, '📥 Paste back → stage + preview')}</div>
        ${rv.at ? `<div style="font-size:11px;color:${C.ink2};margin-top:6px;white-space:pre-wrap;"><b>Last ${e(rv.who || '')} review</b> ${e(String(rv.at).slice(0, 16).replace('T', ' '))} · ${rv.n || 0} fields changed${rv.notes ? '\n' + e(rv.notes) : ''}</div>` : ''}</div>`;
    }
    async function reviewRun(who, only) {
      const keys = only || revKeys();
      startWork(who === 'grok' ? 'revGrok' : 'revClaude', `${who === 'grok' ? 'Grok' : 'Claude'} is reviewing ${keys ? keys.length + ' fields' : 'every field'} (1-4 min, keep this tab open)…`);
      try { await saveInputs(); const r = await ds('review', { reviewer: who, only: keys, note: S.revNote }); take(r); endWork();
        const n = (r.applied || []).length; say(`${who === 'grok' ? 'Grok' : 'Claude'} changed ${n} field${n === 1 ? '' : 's'} — staged${n ? ', building the preview…' : '.'}`, 'ok');
        if (n) { await previewStaged(true).catch(() => {}); say(`${who === 'grok' ? 'Grok' : 'Claude'} changed ${n} field${n === 1 ? '' : 's'} — preview on the right. 💾 Save keeps them, ↺ Revert brings back the saved ones.`, 'ok'); } }
      catch (err) { endWork(); say('Review failed: ' + err.message, 'bad'); }
    }
    function inputsBody() {
      const inp = S.inputs || {}, ph = inp.photo || {}, rk = inp.ranked || {}, built = !!inp.page;
      const nKw = String(S.kw || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).length;
      const ok = { kw: nKw > 0, photo: !!ph.url, gpt: !!inp.chatgpt, ovr: !!String(S.override || '').trim(), grok: !!(inp.grok && inp.grok.notes) };
      const mark = (on, yes, no) => `<span style="font-size:10.5px;font-weight:600;margin-left:6px;padding:1px 8px;border-radius:10px;border:1px solid ${on ? C.ok : C.line};color:${on ? C.ok : C.ink3};">${on ? '✓ ' + yes : no}</span>`;
      const row = (n, title, on, yes, no, body) => `<div style="border-left:3px solid ${on ? C.ok : C.line};padding:2px 0 2px 10px;margin-bottom:12px;">
        <div style="${LBL}margin-bottom:4px;">${n} · ${title}${mark(on, yes, no)}</div>${body}</div>`;
      return `<div style="font-size:11px;color:${C.ink3};margin-bottom:10px;">Fill the inputs in order (only ① is required), then press the build button at the bottom. A green border = loaded. Later inputs win where they conflict. Then send the fields for review (below the build button) — Claude, ChatGPT or Grok rewrite them to their opinion.</div>`
        + row('①', 'Keywords — what the audience searches (Claude also reads the sites ranking for them)', ok.kw, `${nKw} keyword${nKw === 1 ? '' : 's'}`, 'required',
          `<textarea data-in="kw" rows="2" placeholder="medicare services consulting, medicare advisor near me…" style="${TA}">${e(S.kw || '')}</textarea>`
          + (rk.look ? `<div style="font-size:11px;color:${C.ink2};margin-top:4px;"><b>Page one looks like:</b> ${e(rk.look)}${(rk.sites || []).map(x => `<div>· ${e(x)}</div>`).join('')}</div>` : ''))
        + row('②', 'Seed photo — the style seed', ok.photo, 'photo loaded', 'optional',
          `<div style="display:flex;gap:10px;align-items:flex-start;">${ph.url ? `<a href="${e(ph.url)}" target="_blank" rel="noopener"><img src="${e(ph.url)}" style="height:70px;border-radius:6px;border:1px solid ${C.line};display:block;"></a>` : ''}
            <div style="flex:1;"><label style="${BTN}display:inline-block;">${S.work && S.work.act === 'photo' ? '⏳ uploading…' : ph.url ? '⟳ Replace photo' : '⬆ Upload seed photo'}<input type="file" accept="image/*" data-act="photo" style="display:none;"></label>
            ${ph.read ? `<div style="font-size:11px;color:${C.ink2};margin-top:4px;white-space:pre-wrap;">${e(ph.read)}</div>` : ''}</div></div>`)
        + row('③', 'Text override — your words win', ok.ovr, 'override saved', 'optional',
          `<textarea data-in="override" rows="2" placeholder="e.g. headlines heavier · buttons sage green · no gradients anywhere" style="${TA}">${e(S.override || '')}</textarea>
          <div style="margin-top:6px;">${wb('override', BTN, 'Apply override to the fields now')}</div>`)
        // ── the ONE build button, after every input ──
        + `<div style="margin:4px 0 12px;padding:10px;border:1px solid ${C.ok};border-radius:8px;background:${C.surf2};">
            <div style="${LBL}margin-bottom:6px;">${built ? 'Rebuild' : 'Build'} from the inputs above</div>
            ${wb('build', BTNP, built ? '↻ Rebuild everything from these inputs' : '✨ Build everything from these inputs')}
            <div style="font-size:10.5px;color:${C.ink3};margin-top:5px;">Reads the campaign research, writes every design field (saved), renders the hero + signup images and builds the whole page — 6-9 min.${built ? ' A rebuild starts the spec over from the inputs: hand edits below are replaced.' : ''}</div>
            ${pipeList()}${loadedInputs()}</div>`
        + reviewBox()
        // ── after a build: iterate without starting over ──
        + (built ? `<div style="margin:0 0 4px;padding:10px;border:1px dashed ${C.line};border-radius:8px;">
            <div style="${LBL}margin-bottom:6px;">After you edit fields below</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${wb('visuals', stale() ? BTNP : BTN, '🔁 Update visuals')}
              <span style="font-size:10.5px;color:${C.ink3};">saves the current spec, then re-renders the hero + signup images and the page from it — keeps your edits. ${stale() ? `<b style="color:${C.warn};">The spec changed since the visuals were made.</b>` : 'Visuals match the spec.'}</span></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;">${wb('reread', BTN, '↻ Re-read inputs into the spec')}
              <span style="font-size:10.5px;color:${C.ink3};">after changing the keywords or the photo: refreshes the spec fields from the inputs (keeps hand edits), no images.</span></div></div>` : '');
    }
    function fieldRow([k, label, hint]) {
      const f = S.staged[k] || {}, sv = (S.saved || {})[k] || {}, changed = (f.v || '') !== (sv.v || ''), ed = S.edit === k;
      return `<div style="display:grid;grid-template-columns:minmax(120px,30%) 1fr;gap:8px;padding:5px 0;border-top:1px solid ${C.surf2};align-items:start;">
        <div style="font-size:11px;color:${C.ink2};">${e(label)}<div style="font-size:9.5px;color:${C.ink3};">${e(k)}</div></div>
        <div>${ed ? `<input data-in="fedit" data-k="${e(k)}" value="${e(f.v || '')}" placeholder="${e(hint)}" style="${TA}padding:3px 6px;"><div style="margin-top:3px;"><button data-act="fsave" data-k="${e(k)}" style="${BTNP}font-size:10px;padding:2px 8px;">save</button> <button data-act="fcancel" style="${BTN}font-size:10px;padding:2px 8px;">cancel</button></div>`
          : `<div data-act="fedit" data-k="${e(k)}" title="click to edit" style="cursor:text;font-size:12px;color:${f.v ? C.ink : C.ink3};">${f.v ? swatch(f.v) + e(f.v) : '<i>' + e(hint) + '</i>'} ${f.v ? badge(f.src) : ''}${changed ? ` <span style="font-size:9px;color:${C.warn};">● staged</span> <button data-act="gRevert" data-keys="${e(k)}" title="Revert this field to the saved value" style="${BTN}font-size:9.5px;padding:0 5px;">↺</button> <button data-act="gSave" data-keys="${e(k)}" title="Save just this field" style="${BTN}font-size:9.5px;padding:0 5px;">💾</button>` : ''}</div>
            ${f.why ? `<div style="font-size:10.5px;color:${C.ink3};margin-top:1px;">${e(f.why)}</div>` : ''}`}
          ${f.alt ? `<div style="margin-top:3px;font-size:11px;padding:4px 6px;border:1px dashed ${C.line};border-radius:5px;">${badge(f.alt.src)} suggests: ${swatch(f.alt.v)}<b>${e(f.alt.v)}</b>${f.alt.why ? ` <span style="color:${C.ink3};">— ${e(f.alt.why)}</span>` : ''}
            <button data-act="altUse" data-k="${e(k)}" style="${BTN}font-size:10px;padding:1px 6px;">✓ use</button> <button data-act="altNo" data-k="${e(k)}" style="${BTN}font-size:10px;padding:1px 6px;">✕</button></div>` : ''}</div></div>`;
    }
    // Every group (section) has the SAME toolbar: ✎ Edit fields · ⟳ From source → staged · ↺ Revert to saved · 💾 Save.
    // Staged changes show per field (↺ / 💾 per field too); 👁 Preview staged (sticky bar) renders images + mockup from staged.
    const secKeys = sec => sec.fields.map(([k]) => k);
    const secDiff = sec => { const d = new Set(diffKeys()); return secKeys(sec).filter(k => d.has(k)).length; };
    function groupBar(sec) {
      const keys = e(secKeys(sec).join(',')), nd = secDiff(sec), dis = S.busy ? 'disabled' : '';
      const B = `${BTN}font-size:10px;padding:2px 7px;`;
      return `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin:2px 0 6px 12px;">
        <button ${dis} data-act="gEdit" data-sec="${e(sec.id)}" style="${B}">✎ Edit fields</button>
        <select ${dis} data-act="gSource" data-sec="${e(sec.id)}" style="${B}"><option value="">⟳ From source → staged…</option><option value="build">rebuild from the inputs (keywords + photo)</option><option value="claude">🤖 Claude review</option><option value="grok">⚡ Grok review (web + X)</option><option value="chat">ChatGPT / Grok reply (paste)</option><option value="text">text override</option></select>
        <button ${nd && !S.busy ? '' : 'disabled'} data-act="gRevert" data-keys="${keys}" style="${B}">↺ Revert${nd ? ' ' + nd : ''}</button>
        <button ${nd && !S.busy ? '' : 'disabled'} data-act="gSave" data-keys="${keys}" style="${nd ? BTNP : BTN}font-size:10px;padding:2px 7px;">💾 Save${nd ? ' ' + nd : ''}</button>
        ${nd ? `<span style="font-size:10px;color:${C.warn};">● ${nd} staged, not saved</span>` : `<span style="font-size:10px;color:${C.ok};">saved</span>`}</div>`;
    }
    function tierBody(tier) {
      return S.schema.filter(s => s.tier === tier).map(s => { const n = s.fields.filter(([k]) => fv(k)).length, key = 'sec_' + s.id, o = !!S.open[key], nd = secDiff(s);
        return `<div style="margin-bottom:6px;border-bottom:1px solid ${C.surf2};padding-bottom:4px;"><div data-act="toggle" data-k="${key}" style="cursor:pointer;user-select:none;font-size:12px;padding:4px 0;color:${C.ink};">
          <span style="font-size:9px;color:${C.ink3};">${o ? '▼' : '▶'}</span> <b>${e(s.label)}</b> <span style="font-size:10.5px;color:${n === s.fields.length ? C.ok : C.ink3};">${n}/${s.fields.length}</span>${nd ? ` <span style="font-size:10px;color:${C.warn};">● ${nd} staged</span>` : ''}</div>
          ${groupBar(s)}
          ${o ? `<div style="padding-left:12px;">${s.fields.map(fieldRow).join('')}</div>` : ''}</div>`; }).join('');
    }
    // ── group actions ──
    function gModal(title, html, okLabel, onOk) {
      let m = document.getElementById('dpGModal'); if (m) m.remove();
      m = document.createElement('div'); m.id = 'dpGModal';
      m.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;';
      m.innerHTML = `<div style="background:${C.surf2};color:${C.ink};border:1px solid ${C.line};border-radius:10px;padding:16px;max-width:640px;width:100%;">
        <div style="font-weight:700;margin-bottom:10px;">${title}</div>${html}
        <div style="display:flex;gap:8px;margin-top:12px;"><button data-g="ok" style="${BTNP}">${okLabel}</button><button data-g="cancel" style="${BTN}">Cancel</button><span data-g="msg" style="font-size:11px;color:${C.ink3};align-self:center;"></span></div></div>`;
      document.body.appendChild(m);
      m.addEventListener('click', async ev => { const g = ev.target.dataset && ev.target.dataset.g;
        if (ev.target === m || g === 'cancel') return m.remove();
        if (g === 'ok') { ev.target.disabled = true; ev.target.textContent = '⏳ Working…'; try { await onOk(m); m.remove(); } catch (err) { m.querySelector('[data-g="msg"]').textContent = err.message; ev.target.disabled = false; ev.target.textContent = okLabel; } } });
    }
    // Sections (2026-10-09): clear numbered sections, each built from spec groups; every section has the same toolbar
    // and its ✎ Edit fields modal shows ALL its fields under sub-headings. Unknown/new groups land in "Other".
    const DP_SECTIONS = [
      ['direction', '1 · Site direction & audience', g => g.id === 'intent', 'reads the campaign research — research itself is edited in the Research tab'],
      ['colors', '2 · Colors', g => g.id === 'color'],
      ['type', '3 · Typography', g => g.id === 'type'],
      ['layout', '4 · Web & content layout', g => ['layout', 'components', 'content', 'motion'].includes(g.id)],
      ['imagery', '5 · Visual plate & imagery', g => ['imagery', 'avoid'].includes(g.id)],
      ['overlay', '6 · Text on images', g => g.id === 'overlay'],
      ['assets', '7 · Asset image specs (per format)', g => g.tier === 'asset'],
    ];
    const dpSections = () => {
      const used = new Set(), out = DP_SECTIONS.map(([id, label, f, note]) => { const secs = S.schema.filter(g => f(g)); secs.forEach(g => used.add(g.id));
        return { id: 'S_' + id, label, note: note || '', secs, fields: secs.flatMap(g => g.fields) }; });
      const rest = S.schema.filter(g => !used.has(g.id)); if (rest.length) out.push({ id: 'S_other', label: '8 · Other', note: '', secs: rest, fields: rest.flatMap(g => g.fields) });
      return out.filter(x => x.fields.length);
    };
    const secById = id => dpSections().find(x => x.id === id) || S.schema.find(x => x.id === id);
    function sectionBody(sec) {
      return (sec.note ? `<div style="font-size:10.5px;color:${C.ink3};margin:0 0 6px;">${e(sec.note)}</div>` : '') + groupBar(sec)
        + sec.secs.map(g => `${sec.secs.length > 1 ? `<div style="${LBL}margin:8px 0 2px;">${e(g.label)}</div>` : ''}${g.fields.map(fieldRow).join('')}`).join('');
    }
    function gEdit(id) {
      const sec = secById(id); if (!sec) return;
      gModal(`✎ Edit fields — ${e(sec.label)}`, `<div style="font-size:11px;color:${C.ink3};margin-bottom:8px;">Your values override any source. They go to STAGED — preview, then 💾 Save or ↺ Revert.</div>`
        + (sec.secs || [sec]).map(g => `${(sec.secs || []).length > 1 ? `<div style="${LBL}margin:12px 0 4px;border-top:1px solid ${C.line};padding-top:8px;">${e(g.label)}</div>` : ''}`
          + g.fields.map(([k, label, hint]) => `<label style="display:block;margin-bottom:7px;font-size:11px;color:${C.ink2};">${e(label)} <span style="color:${C.ink3};font-size:9.5px;">${e(k)}</span>
          <input data-gk="${e(k)}" value="${e(fv(k) || '')}" placeholder="${e(hint || '')}" style="${TA}padding:4px 7px;margin-top:2px;"></label>`).join('')).join(''),
        'Stage changes', async m => {
          const ch = [...m.querySelectorAll('[data-gk]')].filter(x => x.value.trim() !== (fv(x.dataset.gk) || ''));
          for (const x of ch) take(await ds('edit', { key: x.dataset.gk, v: x.value.trim() }));
          say(ch.length ? `${ch.length} field${ch.length === 1 ? '' : 's'} staged in ${sec.label} — 👁 Preview staged, then 💾 Save or ↺ Revert.` : 'No changes.', 'ok');
        });
    }
    async function gSource(id, src) {
      const sec = secById(id); if (!sec) return; const keys = secKeys(sec), label = sec.label;
      const after = r => { take(r); S.open[id] = true; if (src === 'chat' && (r.applied || []).length) previewStaged(true).catch(() => {}); say(`${label}: ${(r.applied || (r.job || {}).applied || []).length} fields staged from ${src}${((r.suggested || (r.job || {}).suggested) || []).length ? `, ${(r.suggested || r.job.suggested).length} suggestions` : ''} — 👁 Preview staged, then 💾 Save or ↺ Revert.`, 'ok'); };
      if (src === 'text') return gModal(`Text override → ${e(label)}`, `<textarea data-gt rows="4" placeholder="e.g. headlines heavier · sage green buttons · no gradients" style="${TA}">${e(S.override || '')}</textarea>`, 'Apply to staged', async m => {
        const t = m.querySelector('[data-gt]').value.trim(); if (!t) throw new Error('Type the override first.');
        startWork('gsrc', `Applying the override to ${label}…`); try { after(await ds('text', { override: t, keys })); } finally { endWork(); render(); } });
      if (src === 'chat') return gModal(`ChatGPT reply → ${e(label)}`, `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">Use 📋 Copy prompt in Send for review (tick this section's fields to send only them), paste it into ChatGPT or Grok, then paste the reply — only this section's fields are taken, they replace the staged values, and the preview rebuilds.</div><textarea data-gt rows="6" placeholder="Paste the ChatGPT or Grok reply…" style="${TA}"></textarea>`, 'Merge into staged', async m => {
        const t = m.querySelector('[data-gt]').value.trim(); if (!t) throw new Error('Paste the reply first.');
        after(await ds('chatReply', { text: t, keys })); });
      if (src === 'claude' || src === 'grok') return reviewRun(src, keys);
      startWork('gsrc', `Reading the keywords + photo for ${label} (1-3 min)…`);
      try { await saveInputs(); after(await ds(src, { keys })); } catch (err) { say(`${label} from ${src} failed: ${err.message}`, 'bad'); } finally { endWork(); render(); }
    }
    async function gRevert(keys) { try { take(await ds('revert', { keys })); say(`Reverted ${keys.length} field${keys.length === 1 ? '' : 's'} to the saved values.`, 'ok'); } catch (err) { say(err.message, 'bad'); } }
    async function gSave(keys) {
      startWork('gsave', `Saving ${keys.length} field${keys.length === 1 ? '' : 's'}…`);
      try { const r = await ds('save', { keys }); take(r); endWork(); if (cfg.onSaved) { try { cfg.onSaved(); } catch (err) {} } say(`Saved ${keys.length} field${keys.length === 1 ? '' : 's'}${r.notionError ? ` — but the Research record write failed: ${r.notionError}` : ' — the Research record is updated.'}`, r.notionError ? 'bad' : 'ok'); }
      catch (err) { endWork(); say('Save failed: ' + err.message, 'bad'); }
    }
    // 👁 Preview staged: hero + signup images and the mockup page from the STAGED spec — nothing saved
    // change-aware: re-renders only the images whose fields changed; the worker swaps / patches / rebuilds the page as needed
    async function previewStaged(quiet) {
      const todo = ['hero', 'signup'].filter(id => !imgCurrent(id));
      startWork('pstaged', `Previewing the staged spec: ${todo.length ? `re-rendering ${todo.join(' + ')} (fields changed), then ` : 'images unchanged — '}updating the page…`);
      try {
        for (const id of todo) { S.busy = `Rendering the ${id} image on Grok (~20s)…`; render(); await renderAsset(id); }
        if (todo.length) await persistRenders();
        S.busy = 'Updating the page — only what changed…'; render();
        const r = await ds('page', { images: imageUrls() }); take(r); const s = endWork(), pg = r.page || {};
        const how = r.unchanged ? 'nothing changed — same page' : pg.mode === 'images' ? 'new images swapped in' : pg.mode === 'patched' ? `patched ${(pg.changed || []).length} changed field${(pg.changed || []).length === 1 ? '' : 's'}` : 'full page build';
        if (!quiet) say(`Preview ready in ${s}s (${todo.length ? todo.join(' + ') + ' re-rendered, ' : ''}${how}) — on the right. Keep it with 💾 Save, or ↺ Revert.`, 'ok');
        if (cfg.onBuilt && (S.inputs || {}).page) { try { cfg.onBuilt(S.inputs.page.url); } catch (err) {} }
      } catch (err) { endWork(); say('Preview failed: ' + err.message, 'bad'); throw err; }
    }
    function assetsBody() {
      const ids = assetSecs().map(s => s.id.slice(6));
      return `<div style="font-size:11px;color:${C.ink3};margin-bottom:8px;">Each image is rendered on Grok from that format's asset fields (tier 3) plus the every-image fields (tier 2), from the STAGED spec. ✨ Build renders the hero + signup automatically.</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">${ids.map(id => { const rr = S.renders[id], sec = assetSecs().find(s => s.id === 'asset.' + id), label = sec ? sec.label.split(' — ')[0] : id;
          return `<div style="width:170px;display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:11px;color:${C.ink};font-weight:600;">${e(label)}</div>
            ${rr ? `<a href="${e(rr.url)}" target="_blank" rel="noopener" title="${e(rr.prompt)}"><img src="${e(rr.url)}" style="width:170px;height:150px;object-fit:contain;background:${C.surf2};border-radius:6px;border:1px solid ${C.line};display:block;"></a>`
              : `<div style="width:170px;height:150px;border:1px dashed ${C.line};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10.5px;color:${C.ink3};">not rendered</div>`}
            ${wb('render_' + id, BTN + 'font-size:10.5px;padding:3px 6px;', rr ? '⟳ Re-render' : '🖼 Render')}
            ${rr && S.slug && (id === 'hero' || id === 'signup') ? wb('set_' + id, BTNP + 'font-size:10.5px;padding:3px 6px;', rr.live ? '✓ On the hub' : '✓ Set on hub') : ''}</div>`; }).join('')}</div>`;
    }
    function pageBody() {
      const pg = (S.inputs || {}).page;
      return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">${wb('page', BTN, pg ? '↻ Rebuild page from the staged spec' : '📄 Build the page')}
          ${pg ? `<a href="${e(pg.url)}" target="_blank" rel="noopener" style="font-size:11px;color:${C.acc};">open full page ↗</a><span style="font-size:10.5px;color:${C.ink3};">built ${e(String(pg.at || '').slice(0, 16).replace('T', ' '))} · a preview, not the live hub</span>` : `<span style="font-size:10.5px;color:${C.ink3};">Claude writes the whole home page from the spec, the hub copy and the rendered images.</span>`}</div>
        ${pg ? `<iframe src="${e(pg.url)}" title="Page preview" style="width:100%;height:760px;border:1px solid ${C.line};border-radius:8px;background:#fff;"></iframe>` : ''}`;
    }
    function grokBody() {
      const dis = S.busy ? 'disabled' : '';
      return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <select data-in="aspect" style="${SEL}">${['3:4', '1:1', '4:5', '9:16', '16:9'].map(a => `<option ${a === S.aspect ? 'selected' : ''}>${a}</option>`).join('')}</select>
          <button ${dis} data-act="grokTest" style="${BTNP}">✨ Test on Grok</button>${diffKeys().length ? `<button ${dis} data-act="grokStaged" style="${BTN}">🧪 Test staged</button>` : ''}
          <span style="font-size:11px;color:${C.ink3};">from the SAVED spec (Research "Image Spec")</span></div>
        <div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;margin-bottom:8px;"><div style="${LBL}margin-bottom:3px;">✎ My prompt — sent to Grok word for word</div>
          <textarea data-in="myPrompt" rows="2" style="${TA}">${e(S.myPrompt)}</textarea><div style="margin-top:6px;"><button ${dis} data-act="grokMine" style="${BTN}">✨ Render my prompt</button></div></div>
        ${S.plate && S.plate.imageUrl ? `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid ${C.ok};border-radius:6px;margin-bottom:8px;"><img src="${e(S.plate.imageUrl)}" style="height:60px;border-radius:5px;"><div style="flex:1;font-size:11px;color:${C.ink2};"><b>Approved campaign plate</b></div><button data-act="plateClear" style="${BTN}">✕ clear</button></div>` : ''}
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">${S.tests.map((t, i) => `<div style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;width:180px;">
          <a href="${e(t.url)}" target="_blank" rel="noopener" title="${e(t.prompt)}"><img src="${e(t.url)}" style="height:150px;max-width:180px;object-fit:cover;border-radius:6px;border:1px solid ${C.line};display:block;"></a>
          <span style="font-size:9.5px;color:${C.ink3};">${e(t.label)} · ${e(t.aspect)}</span>
          <textarea data-in="guide" data-i="${i}" rows="2" placeholder="Text request for a new image…" style="${TA}font-size:10.5px;">${e(t.guide || '')}</textarea>
          <button ${dis} data-act="regenPlate" data-i="${i}" style="${BTN}font-size:10px;padding:3px 6px;">⟳ Regen image</button>
          <button data-act="approve" data-i="${i}" style="${BTNP}font-size:10px;padding:3px 6px;">✓ Approve as campaign plate</button></div>`).join('')}</div>`;
    }
    function voiceBody() { const v = S.voice; if (!v || v.loading) return `<div style="font-size:11px;color:${C.ink3};">Loading…</div>`; if (v.error) return `<div style="font-size:11px;color:${C.bad};">${e(v.error)}</div>`;
      return `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">Rules learned from your rewrites of AI copy.</div>
        <div style="${LBL}">Across all campaigns</div><textarea data-in="vg" rows="5" style="${TA}margin-bottom:8px;">${e(v.global)}</textarea>
        <div style="${LBL}">This campaign</div><textarea data-in="vc" rows="5" style="${TA}">${e(v.campaign)}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;"><button data-act="voiceSave" style="${BTNP}">💾 Save rules</button><button data-act="voiceReload" style="${BTN}">↻ Refresh</button></div>`; }
    function render() {
      pushPreview();
      if (!S.schema.length) { root.innerHTML = `<div style="font-size:12px;color:${S.msgKind === 'bad' ? C.bad : C.ink3};padding:6px 0;">${e(S.msg || S.busy || 'Loading…')}</div>`; return; }
      const total = S.schema.reduce((n, s) => n + s.fields.length, 0), filled = Object.keys(S.staged).filter(k => (S.staged[k] || {}).v).length, diff = diffKeys(), dis = S.busy ? 'disabled' : '';
      const sugg = Object.values(S.staged).filter(f => f && f.alt).length;
      const status = S.busy || S.msg ? `<div style="font-size:11.5px;margin:0 0 8px;color:${S.busy ? C.ink3 : S.msgKind === 'bad' ? C.bad : S.msgKind === 'ok' ? C.ok : C.ink3};">${S.busy ? '⏳ ' : ''}${e(S.busy || S.msg)}</div>` : '';
      const tierCount = t => { const fs = S.schema.filter(s => s.tier === t).flatMap(s => s.fields); return `${fs.filter(([k]) => fv(k)).length}/${fs.length} filled`; };
      root.innerHTML = status
        + card('inputs', 'Inputs', 'keywords → seed photo → ChatGPT → text override → Grok', inputsBody)
        + dpSections().map(sec => { const n = sec.fields.filter(([k]) => fv(k)).length, nd = secDiff(sec);
            return card(sec.id, e(sec.label), `${n}/${sec.fields.length} filled${nd ? ` · <span style="color:${C.warn};">● ${nd} staged</span>` : ''}`, () => sectionBody(sec)); }).join('')
        + card('page', '📄 Page preview', (S.inputs || {}).page ? 'built ' + e(String(S.inputs.page.at || '').slice(0, 10)) : 'the whole page, from the spec', pageBody)
        + card('assets', '🖼 Asset images', Object.keys(S.renders).length ? Object.keys(S.renders).length + ' rendered' : 'hero · signup · posts · thumbnails — from the spec', assetsBody)
        + card('grok', '✨ Test on Grok', S.plate ? 'approved plate set' : 'saved spec → plate', grokBody)
        + card('voice', '🗣 Your voice', 'learned from your edits', voiceBody)
        + `<div style="position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border:1px solid ${diff.length ? C.warn : C.line};border-radius:8px;background:${C.surf2};font-size:11.5px;">
            ${S.busy || S.msg ? `<div style="flex-basis:100%;font-size:11.5px;color:${S.busy ? C.ink2 : S.msgKind === 'bad' ? C.bad : S.msgKind === 'ok' ? C.ok : C.ink3};">${S.busy ? '⏳ <span data-timer>' + (S.work ? '' : '') + '</span> ' : ''}${e(S.busy || S.msg)}${S.pipe && S.work ? pipeList() : ''}</div>` : ''}
            <div style="flex:1;min-width:180px;"><b>${filled}/${total} fields</b> · ${diff.length ? `<b style="color:${C.warn};">${diff.length} staged, not saved</b>` : `<span style="color:${C.ok};">saved${S.savedAt ? ' ' + e(String(S.savedAt).slice(0, 10)) : ''}</span>`}${sugg ? ` · <span style="color:${C.warn};">${sugg} suggestions</span>` : ''}${stale() ? ` · <span style="color:${C.warn};">visuals out of date</span>` : ''}</div>
            ${stale() ? wb('visuals', BTN, '🔁 Update visuals') : ''}
            ${cfg.preview ? `<button data-act="preview" style="${S.preview ? BTNP : BTN}">👁 Preview${S.preview ? ': on' : ''}</button>` : ''}
            ${wb('pstaged', BTN, '👁 Preview staged')}
            <button ${diff.length ? '' : 'disabled'} data-act="revert" style="${BTN}">↺ Revert all</button>
            ${S.work && S.work.act === 'save' ? `<button disabled style="${BTNP}opacity:.9;cursor:wait;">⏳ <span data-timer>0:00</span> saving…</button>` : `<button ${S.busy ? 'disabled' : ''} data-act="save" style="${BTNP}">💾 Save all</button>`}
            ${S.slug ? `<button ${dis} data-act="publish" title="Put the SAVED spec's palette + fonts on the live hub" style="${BTN}">⇪ Publish to hub</button>` : ''}</div>`;
    }

    // ── events ──
    root.addEventListener('input', ev => {
      const t = ev.target, k = t.dataset.in; if (!k) return;
      if (k === 'kw') S.kw = t.value; else if (k === 'override') S.override = t.value; else if (k === 'gpt') S.gptReply = t.value; else if (k === 'revNote') S.revNote = t.value; else if (k === 'myPrompt') S.myPrompt = t.value;
      else if (k === 'fedit') S.editVal = t.value; else if (k === 'guide') S.tests[+t.dataset.i].guide = t.value;
      else if (k === 'vg') S.voice.global = t.value; else if (k === 'vc') S.voice.campaign = t.value;
    });
    root.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.in === 'aspect') S.aspect = t.value;
      if (t.dataset.act === 'revKey') { if (t.checked) S.revOnly.add(t.dataset.k); else S.revOnly.delete(t.dataset.k); render(); return; }
      if (t.dataset.act === 'revSec') { const sec = secById(t.dataset.sec); if (sec) secKeys(sec).forEach(k => t.checked ? S.revOnly.add(k) : S.revOnly.delete(k)); render(); return; }
      if (t.dataset.act === 'photo') { const f = t.files && t.files[0]; t.value = ''; uploadPhoto(f); }
      if (t.dataset.act === 'gSource' && t.value) { const v = t.value; t.value = ''; gSource(t.dataset.sec, v); }
      if (t.dataset.in === 'kw' || t.dataset.in === 'override') saveInputs();
    });
    root.addEventListener('toggle', ev => { const d = ev.target; if (d && d.dataset && d.dataset.revsec) { if (d.open) S.revOpen.add(d.dataset.revsec); else S.revOpen.delete(d.dataset.revsec); } }, true);
    root.addEventListener('keydown', ev => { const t = ev.target; if (t.dataset && t.dataset.in === 'fedit') { if (ev.key === 'Enter') editField(t.dataset.k, t.value); if (ev.key === 'Escape') { S.edit = null; render(); } } });
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const a = b.dataset.act, i = +b.dataset.i, k = b.dataset.k;
      if (a === 'toggle') { S.open[k] = !S.open[k]; if (k === 'voice' && S.open.voice) loadVoice(); render(); }
      else if (a === 'build') build();
      else if (a.startsWith('render_')) renderAssets([a.slice(7)]);
      else if (a === 'page') rebuildPage();
      else if (a === 'visuals') updateVisuals();
      else if (a === 'reread') reread();
      else if (a.startsWith('set_')) setOnHub(a.slice(4));
      else if (a === 'chatCopy') copyChat();
      else if (a === 'chatMerge') mergeChat();
      else if (a === 'override') applyOverride();
      else if (a === 'grok') grok();
      else if (a === 'revClaude') reviewRun('claude');
      else if (a === 'revGrok') reviewRun('grok');
      else if (a === 'revAll') { S.revOnly.clear(); render(); }
      else if (a === 'fedit') { S.edit = k; S.editVal = fv(k); render(); const inp = root.querySelector('input[data-in="fedit"]'); if (inp) inp.focus(); }
      else if (a === 'fsave') editField(k, S.editVal != null ? S.editVal : fv(k));
      else if (a === 'fcancel') { S.edit = null; render(); }
      else if (a === 'altUse') alt(k, true);
      else if (a === 'altNo') alt(k, false);
      else if (a === 'save') save();
      else if (a === 'gEdit') gEdit(b.dataset.sec);
      else if (a === 'gRevert') gRevert(b.dataset.keys.split(','));
      else if (a === 'gSave') gSave(b.dataset.keys.split(','));
      else if (a === 'pstaged') previewStaged().catch(() => {});
      else if (a === 'revert') revert();
      else if (a === 'publish') publish();
      else if (a === 'preview') { S.preview = !S.preview; render(); }
      else if (a === 'grokTest') testGrok();
      else if (a === 'grokStaged') testGrok(null, null, 'staged');
      else if (a === 'grokMine') grokMine();
      else if (a === 'regenPlate') { const g = (S.tests[i].guide || '').trim(); if (!g) return say('Type a text request for the new image first.', 'bad'); testGrok(g, S.tests[i].prompt, S.tests[i].mode); }
      else if (a === 'approve') approve(i);
      else if (a === 'plateClear') clearPlate();
      else if (a === 'voiceSave') saveVoice();
      else if (a === 'voiceReload') { S.voice = null; loadVoice(); }
    });
    window.addEventListener('beforeunload', ev => { if (root.isConnected && S.schema.length && diffKeys().length) { ev.preventDefault(); ev.returnValue = ''; } });
    render(); load();
    // the host's "Preview staged" switch: page url if it matches the staged spec, else rebuild the page from staged first
    async function stagedPageUrl() {
      const pg = (S.inputs || {}).page;
      if (pg && pg.url && !stale() && ['hero', 'signup'].every(imgCurrent)) return pg.url;
      await previewStaged();
      const p2 = (S.inputs || {}).page; if (!p2 || !p2.url) throw new Error('the page build failed — see the Design panel');
      return p2.url;
    }
    return { reload: load, state: S, stagedPageUrl };
  }
  window.DesignPanel = { mount };
})();
