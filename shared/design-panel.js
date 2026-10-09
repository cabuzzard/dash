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
  const SRC = { keywords: ['kw', '#2f6fb0'], photo: ['photo', '#7a4fb5'], text: ['text', '#b26a00'], chatgpt: ['chatgpt', '#2a8a6a'], grok: ['grok', '#555'], manual: ['you', '#c0392b'] };
  // spec → hub tokens / fonts (the hub's 10 roles) and the legacy direction fields
  const TOKEN_MAP = [['bg', 'color.bg'], ['surface', 'color.surface'], ['ink', 'color.ink'], ['ink-head', 'color.ink_head'], ['ink-soft', 'color.ink_soft'], ['line', 'color.line'],
    ['sea', 'color.primary'], ['deep', 'color.deep'], ['deep-ink', 'color.deep_ink'], ['accent', 'color.accent']];
  const hexOf = v => { const m = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i.exec(String(v || '')); return m ? m[0].toUpperCase() : null; };
  const famOf = v => String(v || '').split(/[,(;·]| — | - /)[0].replace(/["']/g, '').trim();

  function mount(root, cfg) {
    const S = { cid: String(cfg.campaignId || '').replace(/-/g, ''), slug: cfg.slug || '', schema: [], tiers: [], saved: null, savedAt: null, staged: {}, inputs: {}, job: null,
      open: { inputs: true }, edit: null, busy: '', msg: '', msgKind: '', kw: null, override: null, gptReply: '', preview: false,
      tests: [], aspect: '3:4', plate: null, voice: null, myPrompt: '' };
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
      S.kw = S.inputs.keywords || ''; S.override = S.inputs.override || '';
      if (!S.kw && S.slug) call('getHubKeywords', { slug: S.slug }).then(r => { if (!S.kw && r.keywords) { S.kw = r.keywords; render(); } }).catch(() => {});
      S.busy = ''; render();
      if (S.job && S.job.status === 'running') poll();
      call('getApprovedPlate').then(r => { S.plate = r.plate || null; render(); }).catch(() => {});
    }

    // ── engines (run inside the request, 1-3 min; a pass started in another tab is polled) ──
    const LABEL = { build: 'Build from keywords + seed photo', text: 'Text override', grok: 'Grok search' };
    function report(j) {
      j = j || {};
      if (j.status === 'error') return say(`${LABEL[j.op] || j.op} failed: ${j.error}`, 'bad');
      S.open.spec_web = S.open.spec_image = S.open.spec_asset = true;
      say(`${LABEL[j.op] || j.op}: ${(j.applied || []).length} fields set${(j.suggested || []).length ? `, ${j.suggested.length} suggestions to review (✓ use / ✕)` : ''}. Review, then 💾 Save spec.`, 'ok');
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
    async function run(op, extra) {
      S.busy = (LABEL[op] || op) + ' — filling the fields (1-3 min, keep this tab open)…'; render();
      try { const r = await ds(op, extra); take(r); S.busy = ''; report(r.job || { op, status: 'done', applied: r.applied, suggested: r.suggested }); }
      catch (err) { S.busy = ''; say(err.message, 'bad'); }
    }
    async function saveInputs() { try { take(await ds('inputs', { keywords: S.kw, override: S.override })); } catch (err) { say('Could not save the inputs: ' + err.message, 'bad'); } }
    async function build() { await saveInputs(); run('build'); }
    async function applyOverride() { if (!(S.override || '').trim()) return say('Type the override first.', 'bad'); await saveInputs(); run('text', { override: S.override }); }
    async function grok() { await saveInputs(); run('grok'); }
    async function uploadPhoto(file) {
      if (!file) return; S.busy = 'Uploading the seed photo…'; render();
      try {
        const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const sc = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        take(await ds('photo', { data: cv.toDataURL('image/jpeg', 0.9) }));
        S.busy = ''; say('Seed photo stored. Now ✨ Build fields from inputs.', 'ok');
      } catch (err) { S.busy = ''; say('Photo upload failed: ' + err.message, 'bad'); }
    }
    async function copyChat() {
      S.busy = 'Writing the ChatGPT prompt…'; render();
      try { const r = await ds('chatPrompt'); S.busy = '';
        await navigator.clipboard.writeText(r.prompt);
        say('ChatGPT prompt copied. In ChatGPT: attach the seed photo, paste, then paste its JSON reply below and 📥 Merge.', 'ok'); }
      catch (err) { S.busy = ''; say('Could not copy the prompt: ' + err.message, 'bad'); }
    }
    async function mergeChat() {
      if (!S.gptReply.trim()) return say('Paste ChatGPT\'s reply first.', 'bad');
      S.busy = 'Merging ChatGPT\'s fields…'; render();
      try { const r = await ds('chatReply', { text: S.gptReply }); take(r); S.gptReply = ''; S.busy = ''; S.open.spec_web = S.open.spec_image = S.open.spec_asset = true;
        say(`ChatGPT: ${(r.applied || []).length} empty fields filled${(r.suggested || []).length ? `, ${r.suggested.length} suggestions to review` : ''}.`, 'ok'); }
      catch (err) { S.busy = ''; say('Merge failed: ' + err.message, 'bad'); }
    }

    // ── field edits ──
    async function editField(k, v) { try { take(await ds('edit', { key: k, v })); S.edit = null; render(); } catch (err) { say('Edit failed: ' + err.message, 'bad'); } }
    async function alt(k, accept) { try { take(await ds(accept ? 'accept' : 'dismiss', { key: k })); render(); } catch (err) { say(err.message, 'bad'); } }
    async function revert() { if (!confirm('Throw away every staged change and go back to the saved spec?')) return; try { take(await ds('revert')); say('Back to the saved spec.', 'ok'); } catch (err) { say(err.message, 'bad'); } }

    // ── save: KV + Image Spec text + the legacy design fields ──
    async function save() {
      S.busy = 'Saving the spec…'; render();
      try {
        // the worker writes Image Spec + Palette / Fonts / direction fields onto the Research record itself
        const r = await ds('save'); take(r);
        S.busy = '';
        if (r.notionError) return say(`Saved the spec, but the Research record write failed: ${r.notionError}`, 'bad');
        say(`Saved — ${Object.keys(S.saved || {}).length} fields. Image Spec, palette, fonts and direction updated on the record. ⇪ Publish puts the palette + fonts on the live hub.`, 'ok');
      } catch (err) { S.busy = ''; say('Save failed: ' + err.message, 'bad'); }
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
    function inputsBody() {
      const dis = S.busy ? 'disabled' : '', inp = S.inputs || {}, ph = inp.photo || {}, rk = inp.ranked || {};
      return `<div style="font-size:11px;color:${C.ink3};margin-bottom:10px;">Every engine reads these in order — a later input wins where they conflict, except ChatGPT and Grok, which only add (their changes to filled fields show as suggestions).</div>`
        + step('①', 'Keywords — what the audience searches (Claude also searches the sites ranking for them)',
          `<textarea data-in="kw" rows="2" placeholder="medicare services consulting, medicare advisor near me…" style="${TA}">${e(S.kw || '')}</textarea>`
          + (rk.look ? `<div style="font-size:11px;color:${C.ink2};margin-top:4px;"><b>Page one looks like:</b> ${e(rk.look)}${(rk.sites || []).map(x => `<div>· ${e(x)}</div>`).join('')}</div>` : ''))
        + step('②', 'Seed photo — the style seed',
          `<div style="display:flex;gap:10px;align-items:flex-start;">${ph.url ? `<a href="${e(ph.url)}" target="_blank" rel="noopener"><img src="${e(ph.url)}" style="height:70px;border-radius:6px;border:1px solid ${C.line};display:block;"></a>` : ''}
            <div style="flex:1;"><label style="${BTN}display:inline-block;">${ph.url ? '⟳ Replace photo' : '⬆ Upload seed photo'}<input type="file" accept="image/*" data-act="photo" style="display:none;"></label>
            ${ph.read ? `<div style="font-size:11px;color:${C.ink2};margin-top:4px;white-space:pre-wrap;">${e(ph.read)}</div>` : ''}</div></div>`)
        + `<div style="margin:0 0 12px 13px;"><button ${dis} data-act="build" style="${BTNP}">✨ Build fields from inputs</button> <span style="font-size:10.5px;color:${C.ink3};">Claude: keywords + live search of the ranked sites + the seed photo → every field (1-3 min)</span></div>`
        + step('③', 'ChatGPT — additive',
          `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"><button ${dis} data-act="chatCopy" style="${BTN}">📋 Copy ChatGPT prompt</button><span style="font-size:10.5px;color:${C.ink3};align-self:center;">attach the seed photo in ChatGPT, paste, then paste its reply here</span></div>
          <textarea data-in="gpt" rows="3" placeholder="Paste ChatGPT's reply (the JSON block is found automatically)…" style="${TA}">${e(S.gptReply)}</textarea>
          <div style="margin-top:6px;"><button ${dis} data-act="chatMerge" style="${BTN}">📥 Merge ChatGPT's fields</button>${inp.chatgpt ? ` <span style="font-size:10.5px;color:${C.ink3};">last merged ${e(String(inp.chatgpt.at || '').slice(0, 10))}</span>` : ''}</div>`)
        + step('④', 'Text override — your words win',
          `<textarea data-in="override" rows="2" placeholder="e.g. headlines heavier · buttons sage green · no gradients anywhere" style="${TA}">${e(S.override || '')}</textarea>
          <div style="margin-top:6px;"><button ${dis} data-act="override" style="${BTN}">Apply override</button></div>`)
        + step('⑤', 'Grok search — additive (web + X)',
          `<button ${dis} data-act="grok" style="${BTN}">⚡ Grok search</button>${inp.grok && inp.grok.notes ? `<div style="font-size:11px;color:${C.ink2};margin-top:4px;white-space:pre-wrap;">${e(inp.grok.notes)}</div>` : ''}`);
    }
    function fieldRow([k, label, hint]) {
      const f = S.staged[k] || {}, sv = (S.saved || {})[k] || {}, changed = (f.v || '') !== (sv.v || ''), ed = S.edit === k;
      return `<div style="display:grid;grid-template-columns:minmax(120px,30%) 1fr;gap:8px;padding:5px 0;border-top:1px solid ${C.surf2};align-items:start;">
        <div style="font-size:11px;color:${C.ink2};">${e(label)}<div style="font-size:9.5px;color:${C.ink3};">${e(k)}</div></div>
        <div>${ed ? `<input data-in="fedit" data-k="${e(k)}" value="${e(f.v || '')}" placeholder="${e(hint)}" style="${TA}padding:3px 6px;"><div style="margin-top:3px;"><button data-act="fsave" data-k="${e(k)}" style="${BTNP}font-size:10px;padding:2px 8px;">save</button> <button data-act="fcancel" style="${BTN}font-size:10px;padding:2px 8px;">cancel</button></div>`
          : `<div data-act="fedit" data-k="${e(k)}" title="click to edit" style="cursor:text;font-size:12px;color:${f.v ? C.ink : C.ink3};">${f.v ? swatch(f.v) + e(f.v) : '<i>' + e(hint) + '</i>'} ${f.v ? badge(f.src) : ''}${changed ? ` <span style="font-size:9px;color:${C.warn};">● staged</span>` : ''}</div>
            ${f.why ? `<div style="font-size:10.5px;color:${C.ink3};margin-top:1px;">${e(f.why)}</div>` : ''}`}
          ${f.alt ? `<div style="margin-top:3px;font-size:11px;padding:4px 6px;border:1px dashed ${C.line};border-radius:5px;">${badge(f.alt.src)} suggests: ${swatch(f.alt.v)}<b>${e(f.alt.v)}</b>${f.alt.why ? ` <span style="color:${C.ink3};">— ${e(f.alt.why)}</span>` : ''}
            <button data-act="altUse" data-k="${e(k)}" style="${BTN}font-size:10px;padding:1px 6px;">✓ use</button> <button data-act="altNo" data-k="${e(k)}" style="${BTN}font-size:10px;padding:1px 6px;">✕</button></div>` : ''}</div></div>`;
    }
    function tierBody(tier) {
      return S.schema.filter(s => s.tier === tier).map(s => { const n = s.fields.filter(([k]) => fv(k)).length, key = 'sec_' + s.id, o = !!S.open[key];
        return `<div style="margin-bottom:4px;"><div data-act="toggle" data-k="${key}" style="cursor:pointer;user-select:none;font-size:12px;padding:4px 0;color:${C.ink};">
          <span style="font-size:9px;color:${C.ink3};">${o ? '▼' : '▶'}</span> <b>${e(s.label)}</b> <span style="font-size:10.5px;color:${n === s.fields.length ? C.ok : C.ink3};">${n}/${s.fields.length}</span></div>
          ${o ? `<div style="padding-left:12px;">${s.fields.map(fieldRow).join('')}</div>` : ''}</div>`; }).join('');
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
        + (S.tiers || []).map(([t, tl]) => card('spec_' + t, tl, tierCount(t), () => tierBody(t))).join('')
        + card('grok', '✨ Test on Grok', S.plate ? 'approved plate set' : 'saved spec → plate', grokBody)
        + card('voice', '🗣 Your voice', 'learned from your edits', voiceBody)
        + `<div style="position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border:1px solid ${diff.length ? C.warn : C.line};border-radius:8px;background:${C.surf2};font-size:11.5px;">
            <div style="flex:1;min-width:180px;"><b>${filled}/${total} fields</b> · ${diff.length ? `<b style="color:${C.warn};">${diff.length} staged, not saved</b>` : `<span style="color:${C.ok};">saved${S.savedAt ? ' ' + e(String(S.savedAt).slice(0, 10)) : ''}</span>`}${sugg ? ` · <span style="color:${C.warn};">${sugg} suggestions</span>` : ''}</div>
            ${cfg.preview ? `<button data-act="preview" style="${S.preview ? BTNP : BTN}">👁 Preview${S.preview ? ': on' : ''}</button>` : ''}
            <button ${diff.length ? '' : 'disabled'} data-act="revert" style="${BTN}">↺ Revert</button>
            <button ${diff.length && !S.busy ? '' : 'disabled'} data-act="save" style="${BTNP}">💾 Save spec</button>
            ${S.slug ? `<button ${dis} data-act="publish" title="Put the SAVED spec's palette + fonts on the live hub" style="${BTN}">⇪ Publish to hub</button>` : ''}</div>`;
    }

    // ── events ──
    root.addEventListener('input', ev => {
      const t = ev.target, k = t.dataset.in; if (!k) return;
      if (k === 'kw') S.kw = t.value; else if (k === 'override') S.override = t.value; else if (k === 'gpt') S.gptReply = t.value; else if (k === 'myPrompt') S.myPrompt = t.value;
      else if (k === 'fedit') S.editVal = t.value; else if (k === 'guide') S.tests[+t.dataset.i].guide = t.value;
      else if (k === 'vg') S.voice.global = t.value; else if (k === 'vc') S.voice.campaign = t.value;
    });
    root.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.in === 'aspect') S.aspect = t.value;
      if (t.dataset.act === 'photo') { const f = t.files && t.files[0]; t.value = ''; uploadPhoto(f); }
      if (t.dataset.in === 'kw' || t.dataset.in === 'override') saveInputs();
    });
    root.addEventListener('keydown', ev => { const t = ev.target; if (t.dataset && t.dataset.in === 'fedit') { if (ev.key === 'Enter') editField(t.dataset.k, t.value); if (ev.key === 'Escape') { S.edit = null; render(); } } });
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const a = b.dataset.act, i = +b.dataset.i, k = b.dataset.k;
      if (a === 'toggle') { S.open[k] = !S.open[k]; if (k === 'voice' && S.open.voice) loadVoice(); render(); }
      else if (a === 'build') build();
      else if (a === 'chatCopy') copyChat();
      else if (a === 'chatMerge') mergeChat();
      else if (a === 'override') applyOverride();
      else if (a === 'grok') grok();
      else if (a === 'fedit') { S.edit = k; S.editVal = fv(k); render(); const inp = root.querySelector('input[data-in="fedit"]'); if (inp) inp.focus(); }
      else if (a === 'fsave') editField(k, S.editVal != null ? S.editVal : fv(k));
      else if (a === 'fcancel') { S.edit = null; render(); }
      else if (a === 'altUse') alt(k, true);
      else if (a === 'altNo') alt(k, false);
      else if (a === 'save') save();
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
    return { reload: load, state: S };
  }
  window.DesignPanel = { mount };
})();
