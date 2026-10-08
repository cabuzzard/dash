// ══════════════════════ DESIGN PANEL (shared) ══════════════════════
// ONE design editor, mounted by both the care-gap microsite's Design tab and the dashboard's
// Content Hubs card, so the two are always the same. A hub IS its campaign: everything reads and
// writes the campaign's Research record.
//
// FLOW
//  1. SOURCES rewrite the four STAGED visual-direction fields (Register · Photography · Avoid · Notes).
//     Every source works from the current staged fields + the shared text override, and every pass
//     can be reverted: Generate from keywords (emulates the top-ranked sites) · Send prompt to chat
//     (copy → paste back) · Send to Grok · Generate from image · Text override ▸ Submit.
//     The direction fields save to the record with their own 💾.
//  2. PALETTE, FONTS and IMAGE SPEC are each regenerated FROM the staged direction, with their own
//     ↻ Regen from staged · 👁 Preview · ↺ Revert to saved · 💾 Save to database.
//  3. TEST ON GROK renders from the staged spec + palette. Per plate: ⟳ Direction from this (re-reads
//     the staged direction + rebuilds the staged spec from the image) · regenerate the image with a
//     note (image only) · ✓ Approve as campaign plate (saved).
//
//   DesignPanel.mount(el, { call(action, body) → Promise<json>, campaignId, slug, preview?(d), onPushed?(r) })
(function () {
  const ROLES = [['bg','Background'],['surface','Card'],['ink','Body text'],['ink-head','Headings'],['ink-soft','Muted text'],['line','Outlines'],['sea','Primary / links'],['deep','Dark band'],['deep-ink','Text on dark'],['accent','Accent / button']];
  const DIR = [['register', 'Visual register'], ['photography', 'Photography direction'], ['avoid', 'Visual avoid'], ['notes', 'Design notes']];
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const clone = o => JSON.parse(JSON.stringify(o == null ? null : o));
  const same = (a, b) => JSON.stringify(a || '') === JSON.stringify(b || '');
  const ago = ts => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + 'm ago' : s < 172800 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
  // colours fall back across the two pages' variable names (dash: --text…, care-gap: --ink…)
  const C = { ink: 'var(--text, var(--ink, #222))', ink2: 'var(--text2, var(--ink2, #555))', ink3: 'var(--text3, var(--ink3, #888))', line: 'var(--border2, var(--border, #ccc))',
    surf: 'var(--surface, #fff)', surf2: 'var(--surface2, #f4f4f4)', acc: 'var(--accent, var(--sea, #0b6e8a))', ok: 'var(--fresh, #3a9a5b)', bad: '#c0392b', warn: '#b26a00' };
  const BTN = `font-size:11px;padding:4px 10px;border:1px solid ${C.line};border-radius:6px;background:${C.surf2};color:${C.ink};cursor:pointer;`;
  const BTNP = `font-size:11px;padding:4px 10px;border:1px solid ${C.acc};border-radius:6px;background:${C.acc};color:var(--bg, #fff);font-weight:600;cursor:pointer;`;
  const TA = `width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;padding:6px 8px;border:1px solid ${C.line};border-radius:6px;background:${C.surf};color:${C.ink};`;
  const SEL = `font-size:11px;padding:2px 4px;border:1px solid ${C.line};border-radius:5px;background:${C.surf};color:${C.ink};max-width:240px;`;
  const LBL = `font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};`;

  function mount(root, cfg) {
    const S = { cid: String(cfg.campaignId || '').replace(/-/g, ''), slug: cfg.slug || '', base: null, stage: null, hist: { palettes: [], fonts: [], directions: [] },
      open: {}, edit: {}, steer: '', busy: '', msg: '', msgKind: '', spec: { text: '', saved: '', busy: false, steer: '', prev: null },
      tests: [], aspect: '3:4', gpt: { reply: '' }, plate: null, voice: null, kw: null, ranked: null, lastPass: null,
      undo: [], preview: false };
    const snap = () => { if (S.stage) { S.undo.push(clone(S.stage)); if (S.undo.length > 40) S.undo.shift(); } };
    const pushPreview = () => { if (cfg.preview) try { cfg.preview(S.preview ? { palette: S.stage && S.stage.palette, fonts: S.stage && S.stage.fonts } : null); } catch (err) {} };
    const call = async (a, b) => { const r = await cfg.call(a, Object.assign({ campaignId: S.cid }, b || {})); if (r && r.error) throw new Error(r.error); return r || {}; };
    root.__dp = S;
    const say = (m, kind) => { S.msg = m || ''; S.msgKind = kind || ''; render(); };
    const dirCur = () => { const s = S.stage; return { register: s.register, photography: s.photography, avoid: s.avoid, notes: s.notes }; };
    const dirText = () => DIR.filter(([k]) => (S.stage[k] || '').trim()).map(([k, l]) => `${l}: ${S.stage[k].trim()}`).join('\n');

    // ── load ──
    async function load() {
      S.busy = 'Loading the design…'; render();
      try {
        const r = await call('getHubDesignHistory', { slug: S.slug || S.cid });
        S.hist = { palettes: r.palettes || [], fonts: r.fonts || [], directions: r.directions || [] };
        const c = r.current || {};
        S.base = { palette: c.palette || null, fonts: (c.fonts && c.fonts.display) ? c.fonts : null, register: c.register || '', photography: c.photography || '', avoid: c.avoid || '', notes: c.notes || '' };
        S.stage = clone(S.base);
        S.spec.text = S.spec.saved = c.imageSpec || '';
      } catch (err) { S.busy = ''; return say('Could not load the design: ' + err.message, 'bad'); }
      S.busy = ''; render();
      call('getApprovedPlate').then(r => { S.plate = r.plate || null; render(); }).catch(() => {});
    }
    const dirDirty = () => S.stage && DIR.some(([k]) => !same(S.stage[k], S.base[k]));
    const palDirty = () => S.stage && !same(S.stage.palette, S.base.palette);
    const fontDirty = () => S.stage && !same(S.stage.fonts, S.base.fonts);
    const specDirty = () => (S.spec.text || '') !== (S.spec.saved || '');

    // ── 1. SOURCES — each a full pass over the four staged fields, revertible ──
    function applyPass(source, d) {
      const before = clone(S.stage); snap();
      const got = [];
      DIR.forEach(([k]) => { const v = d && d[k] != null ? String(d[k]).trim() : ''; if (v) { S.stage[k] = v; got.push(k); } });
      if (!got.length) { S.undo.pop(); throw new Error('the reply had none of register / photography / avoid / notes'); }
      S.lastPass = { source, before };
      S.hist.directions.unshift({ ts: Date.now(), register: S.stage.register, photography: S.stage.photography, avoid: S.stage.avoid, source });
      S.open.direction = true;
      return got;
    }
    async function runSource(label, busyMsg, fn) {
      S.busy = busyMsg; render();
      try { const d = await fn(); const got = applyPass(label, d); S.busy = ''; say(`${label} rewrote the staged ${got.join(', ')}. Review below — ↶ Revert this pass, or 💾 Save to database.`, 'ok'); }
      catch (err) { S.busy = ''; say(label + ' failed: ' + err.message, 'bad'); }
    }
    const steer = () => S.steer.trim() || undefined;
    const srcKeywords = () => runSource('Keywords (top-ranked sites)', 'Researching what the top-ranked sites for your keywords look like (~40s)…', async () => {
      const r = await call('designFromRankedSites', { keywords: S.kw && S.kw.text ? S.kw.text : undefined, current: dirCur(), instructions: steer() });
      S.ranked = { keywords: r.keywords || [], sites: r.sites || [] }; return r.design; });
    const srcGrok = () => runSource('Grok', 'Grok is rewriting the visual direction…', async () => (await call('designFromGrok', { current: dirCur(), instructions: steer() })).design);
    const srcOverride = () => { if (!steer()) return say('Type the override first.', 'bad');
      return runSource('Text override', 'Claude is rewriting the direction with your override…', async () => {
        const r = await call('generateResearchDesign', { slug: S.slug || undefined, stage: true, instructions: steer(), current: dirCur() }); return r.design; }); };
    const srcImage = data => runSource('Image', 'Reading the direction off the image…', async () => {
      const r = await call('generateResearchDesign', { slug: S.slug || undefined, stage: true, image: data, instructions: steer(), current: dirCur() }); return r.design; });
    const srcPlate = url => runSource('Grok plate', 'Reading the direction off that plate…', async () => {
      const r = await call('generateResearchDesign', { slug: S.slug || undefined, stage: true, imageUrl: url, instructions: steer(), current: dirCur() }); return r.design; });
    function chatPrompt() {
      const cur = dirText() || '(nothing yet)';
      return `Rewrite the visual direction for this campaign's website and every image made for it. Start from the current direction below, keep what works, and change what doesn't.${steer() ? ' Apply the request at the end.' : ''}

Write it as DIRECTION any image model could follow, not a prompt for one tool.

CURRENT DIRECTION:
${cur}
${steer() ? '\nREQUEST FOR THIS PASS: ' + steer() + '\n' : ''}
Reply with ONE fenced \`\`\`json block and nothing else:
{
  "register": "1-2 sentences — the overall look and mood, concrete to this subject",
  "photography": "3-5 sentences — the real images that belong: subjects and settings, viewpoint, light (time of day, warm/cool), colour, medium/finish; say plainly whether people belong",
  "avoid": "semicolon-separated looks, clichés and stock/AI defaults to reject",
  "notes": "1-3 sentences a designer must keep in mind"
}`;
    }
    function srcChatStage() {
      const raw = S.gpt.reply || '', f = raw.match(/```(?:json)?\s*([\s\S]*?)```/i), body = f ? f[1] : raw, a = body.indexOf('{'), b = body.lastIndexOf('}');
      let d; try { if (a < 0 || b <= a) throw new Error('no JSON object found'); d = JSON.parse(body.slice(a, b + 1).replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1')); }
      catch (err) { return say('Could not read the reply: ' + err.message + ' — paste the whole JSON block.', 'bad'); }
      if (Array.isArray(d.avoid)) d.avoid = d.avoid.join('; ');
      try { const got = applyPass('Chat', d); S.gpt.reply = ''; say(`Chat rewrote the staged ${got.join(', ')}. Review below — ↶ Revert this pass, or 💾 Save to database.`, 'ok'); }
      catch (err) { say('Chat reply: ' + err.message, 'bad'); }
    }
    function revertPass() { if (!S.lastPass) return; snap(); DIR.forEach(([k]) => { S.stage[k] = S.lastPass.before[k]; }); say('Reverted the ' + S.lastPass.source + ' pass.', 'ok'); S.lastPass = null; render(); }
    async function openKeywords() {
      S.kw = { text: 'Loading the keywords…', note: '' }; render();
      try { const r = await call('getHubKeywords', { slug: S.slug }); S.kw = { text: r.keywords || '', note: r.keywords ? 'From the ' + (r.source || 'campaign') + (r.productName ? ' — ' + r.productName : '') + '. Edit freely — the keyword pass uses these.' : 'No keywords on file — type some.' }; }
      catch (err) { S.kw = { text: '', note: 'Could not load keywords: ' + err.message }; }
      render();
    }
    function pickDirVersion(val) {
      snap(); const en = val === 'current' ? null : S.hist.directions.find(x => String(x.ts) === String(val)), b = S.base;
      ['register', 'photography', 'avoid'].forEach(k => { S.stage[k] = en ? en[k] : b[k]; }); render();
    }
    async function saveDirection() {
      S.busy = 'Saving the visual direction to the record…'; render();
      try { const s = S.stage;
        await call('saveHubBrief', { slug: S.slug, direction: { register: s.register || '', photography: s.photography || '', avoid: s.avoid || '' }, notes: s.notes || '' });
        DIR.forEach(([k]) => { S.base[k] = s[k]; }); S.busy = ''; say('Visual direction saved to the record. Regen the palette, fonts and spec from it when you’re ready.', 'ok'); }
      catch (err) { S.busy = ''; say('Save failed: ' + err.message, 'bad'); }
    }
    function revertDirection() { snap(); DIR.forEach(([k]) => { S.stage[k] = S.base[k]; }); S.lastPass = null; render(); }

    // ── 2. PALETTE / FONTS / SPEC — each from the staged direction ──
    const fromStaged = what => `Build the ${what} for THIS visual direction (it is authoritative; the research is only background):\n${dirText()}`;
    async function regenPalette() {
      snap(); S.busy = 'Building a palette from the staged direction…'; render();
      try { const r = await call('generateResearchPalette', { slug: S.slug || undefined, stage: true, instructions: fromStaged('colour palette'), current: S.stage.palette || undefined });
        S.hist.palettes.unshift({ ts: r.ts || Date.now(), palette: r.palette, rationale: r.note || '', source: 'staged direction' });
        S.stage.palette = r.palette; S.busy = ''; say('Palette regenerated from the staged direction — 👁 Preview, then 💾 Save to database.', 'ok'); }
      catch (err) { S.busy = ''; say('Palette failed: ' + err.message, 'bad'); }
    }
    async function regenFonts() {
      snap(); S.busy = 'Choosing fonts for the staged direction…'; render();
      try { const r = await call('generateResearchFonts', { slug: S.slug || undefined, stage: true, instructions: fromStaged('type pairing'), current: S.stage.fonts || undefined });
        S.hist.fonts.unshift({ ts: r.ts || Date.now(), fonts: r.fonts });
        S.stage.fonts = r.fonts; S.busy = ''; say('Fonts regenerated: ' + [r.fonts.display, r.fonts.body, r.fonts.mono].join(' · ') + ' — 👁 Preview, then 💾 Save to database.', 'ok'); }
      catch (err) { S.busy = ''; say('Fonts failed: ' + err.message, 'bad'); }
    }
    function pickVersion(kind, val) {
      snap(); const list = S.hist[kind === 'palette' ? 'palettes' : 'fonts'] || [], en = val === 'current' ? null : list.find(x => String(x.ts) === String(val));
      if (kind === 'palette') S.stage.palette = en ? en.palette : clone(S.base.palette); else S.stage.fonts = en ? en.fonts : clone(S.base.fonts); render();
    }
    async function savePart(kind) {
      S.busy = 'Saving the ' + kind + ' to the record…'; render();
      try { await call('saveHubBrief', kind === 'palette' ? { slug: S.slug, palette: S.stage.palette } : { slug: S.slug, fonts: S.stage.fonts });
        S.base[kind] = clone(S.stage[kind]); S.busy = ''; say(kind[0].toUpperCase() + kind.slice(1) + ' saved to the record. ⇪ Publish puts it on the live hub.', 'ok'); }
      catch (err) { S.busy = ''; say('Save failed: ' + err.message, 'bad'); }
    }
    function revertPart(kind) { snap(); S.stage[kind] = clone(S.base[kind]); render(); }
    async function publishLive() {
      if (!S.stage.palette) return say('No palette yet — regenerate one first.', 'bad');
      if (!confirm('Publish the staged palette + fonts to the live hub?\n\nSaves them to the record and commits them into the hub page (live in ~1 min).')) return;
      S.busy = 'Publishing palette + fonts to the live hub…'; render();
      try { const r = await call('publishHubDesign', { slug: S.slug, keepSpec: true, palette: S.stage.palette, fonts: (S.stage.fonts && S.stage.fonts.display) ? S.stage.fonts : undefined });
        S.base.palette = clone(S.stage.palette); S.base.fonts = clone(S.stage.fonts); S.busy = ''; say('Published — live in about a minute.', 'ok'); if (cfg.onPushed) cfg.onPushed(r); }
      catch (err) { S.busy = ''; say('Publish failed: ' + err.message, 'bad'); }
    }
    const stagedForSpec = () => { const s = S.stage, u = v => (v && String(v).trim()) ? v : undefined;
      return { register: u(s.register), photography: u(s.photography), avoid: u(s.avoid), notes: u(s.notes), palette: s.palette || undefined, fonts: (s.fonts && s.fonts.display) ? s.fonts : undefined }; };
    async function regenSpec() {
      S.spec.busy = true; render();
      try { const r = await call('previewImageSpec', { slug: S.slug || undefined, staged: stagedForSpec() }); S.spec.prev = S.spec.text; S.spec.text = r.text || ''; say('Image spec regenerated from the staged direction + palette — 💾 Save to database to use it for assets.', 'ok'); }
      catch (err) { say('Spec regen failed: ' + err.message, 'bad'); }
      S.spec.busy = false; render();
    }
    async function specRevise() {
      const st = (S.spec.steer || '').trim(); if (!st) return say('Type the direction to add first.', 'bad');
      if (!S.spec.text.trim()) return say('There is no spec yet — ↻ Regen from staged first.', 'bad');
      S.spec.busy = true; render();
      try { const r = await call('reviseImageSpec', { text: S.spec.text, steer: st }); S.spec.prev = S.spec.text; S.spec.text = r.text || S.spec.text; S.spec.steer = ''; say('Added to the staged spec — review, then 💾 Save to database.', 'ok'); }
      catch (err) { say('Could not add it: ' + err.message, 'bad'); }
      S.spec.busy = false; render();
    }
    async function saveSpec() {
      S.spec.busy = true; render();
      try { await call('saveImageSpec', { text: S.spec.text }); S.spec.saved = S.spec.text; say('Image spec saved — asset image generation now uses it.', 'ok'); }
      catch (err) { say('Spec save failed: ' + err.message, 'bad'); }
      S.spec.busy = false; render();
    }

    // ── 3. TEST ON GROK — staged spec + staged palette ──
    async function testGrok(guidance, prevPrompt) {
      S.busy = 'Grok is rendering from the staged spec (~20s)…'; render();
      try { const s = S.stage;
        const r = await call('renderSpecTest', { spec: (S.spec.text || '').trim().length > 80 ? S.spec.text : undefined, direction: { register: s.register, photography: s.photography, avoid: s.avoid },
          palette: s.palette || undefined, aspect: S.aspect, guidance: guidance || undefined, previousPrompt: guidance ? prevPrompt : undefined });
        S.tests.unshift({ url: r.imageUrl, prompt: r.prompt || '', aspect: r.aspect || S.aspect, label: guidance ? 'regen: ' + guidance.slice(0, 50) : 'staged spec' + (specDirty() ? ' (unsaved)' : '') });
        S.busy = ''; S.open.grok = true; say('Rendered — newest first. Hover a plate for its prompt.', 'ok'); }
      catch (err) { S.busy = ''; say('Grok test failed: ' + err.message, 'bad'); }
    }
    async function directionFromPlate(i) {
      const t = S.tests[i]; if (!t) return;
      await srcPlate(t.url);
      if (S.msgKind === 'ok') await regenSpec();
    }
    async function approve(i) { const t = S.tests[i]; if (!t) return; try { const r = await call('saveApprovedPlate', { imageUrl: t.url, prompt: t.prompt }); S.plate = r.plate || { imageUrl: t.url }; say('Approved as the campaign plate — saved. Asset-level Grok renders now match its look.', 'ok'); } catch (err) { say('Approve failed: ' + err.message, 'bad'); } }
    async function clearPlate() { try { await call('saveApprovedPlate', { clear: true }); S.plate = null; render(); } catch (err) { say('Clear failed: ' + err.message, 'bad'); } }

    // ── voice (unchanged) ──
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
    const unsaved = d => d ? `<span style="font-size:10px;color:${C.warn};">● staged, not saved</span>` : `<span style="font-size:10px;color:${C.ok};">saved</span>`;
    const partBar = (kind, dirty, extra) => {
      const dis = S.busy ? 'disabled' : '';
      return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
        <button ${dis} data-act="${kind}Regen" style="${BTNP}">↻ Regen from staged</button>
        ${cfg.preview && kind !== 'spec' ? `<button data-act="preview" title="Paint the staged palette + fonts onto the hub preview on the right" style="${S.preview ? BTNP : BTN}">👁 Preview${S.preview ? ': on' : ''}</button>` : ''}
        <button ${dirty ? '' : 'disabled'} data-act="${kind}Revert" style="${BTN}">↺ Revert to saved</button>
        <button ${dirty && !S.busy ? '' : 'disabled'} data-act="${kind}Save" style="${BTN}">💾 Save to database</button>${extra || ''}
        <span style="margin-left:auto;">${unsaved(dirty)}</span></div>`; };
    const field = k => { const s = S.stage, label = (DIR.find(x => x[0] === k) || [])[1], ch = !same(s[k], S.base[k]);
      return `<div style="margin-bottom:10px;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="${LBL}">${label}</span>${ch ? `<span style="font-size:10px;color:${C.warn};">● staged</span>` : ''}
        <button data-act="edit" data-k="${k}" style="${BTN}padding:0 6px;margin-left:auto;">${S.edit[k] ? 'done' : '✎'}</button></div>
        ${S.edit[k] ? `<textarea data-in="stage" data-k="${k}" rows="${k === 'notes' ? 6 : 4}" style="${TA}">${e(s[k])}</textarea>` : `<div style="font-size:12px;color:${C.ink};white-space:pre-wrap;line-height:1.45;">${e(s[k]) || `<span style="color:${C.ink3};">(empty)</span>`}</div>`}</div>`; };
    function render() {
      pushPreview();
      if (!S.stage) { root.innerHTML = `<div style="font-size:12px;color:${S.msgKind === 'bad' ? C.bad : C.ink3};padding:6px 0;">${e(S.msg || S.busy || 'Loading…')}</div>`; return; }
      const s = S.stage, dis = S.busy ? 'disabled' : '';
      const status = S.busy || S.msg ? `<div style="font-size:11.5px;margin:0 0 8px;color:${S.busy ? C.ink3 : S.msgKind === 'bad' ? C.bad : S.msgKind === 'ok' ? C.ok : C.ink3};">${e(S.busy || S.msg)}</div>` : '';
      const sources = () => `
        <div style="font-size:11px;color:${C.ink3};margin-bottom:8px;">Each source rewrites the four staged fields below (Register · Photography · Avoid · Notes), starting from what's staged now plus the text override. Nothing is saved until 💾 Save to database.</div>
        <div style="${LBL}">Text override</div>
        <textarea data-in="steer" rows="2" placeholder="e.g. golden-hour light · aerial views welcome · people OK · aspirational but credible" style="${TA}margin:3px 0 6px;">${e(S.steer)}</textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;"><button ${dis} data-act="srcOverride" style="${BTNP}">Submit override</button>
          <span style="font-size:10.5px;color:${C.ink3};align-self:center;">The override also rides along with every source below.</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          <button ${dis} data-act="srcKeywords" title="Claude searches the campaign keywords and emulates the imagery of the sites ranking on page one" style="${BTN}">↻ Generate from keywords</button>
          <button data-act="kwToggle" style="${BTN}padding:4px 7px;" title="See / edit the keywords this pass uses">✎ keywords</button>
          <button ${dis} data-act="srcGrok" style="${BTN}">↻ Send to Grok</button>
          <label style="${BTN}">🖼 Generate from image<input type="file" accept="image/*" data-act="srcImage" style="display:none;"></label>
          <button data-act="gptCopy" style="${BTN}">📋 Send prompt to chat</button>
        </div>
        ${S.kw ? `<div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;margin-bottom:8px;"><div style="font-size:11px;color:${C.ink3};margin-bottom:4px;">${e(S.kw.note || '')}</div><textarea data-in="kw" rows="3" style="${TA}">${e(S.kw.text)}</textarea></div>` : ''}
        <div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;">
          <div style="font-size:11px;color:${C.ink3};margin-bottom:4px;">Chat: 📋 copies a prompt (the staged direction + your override) — paste it into ChatGPT, then paste its reply here.</div>
          <textarea data-in="gptReply" rows="3" placeholder="Paste the chat's reply (the JSON block is found automatically)…" style="${TA}">${e(S.gpt.reply)}</textarea>
          <div style="margin-top:6px;"><button ${dis} data-act="srcChat" style="${BTN}">📥 Stage the chat reply</button></div>
        </div>
        ${S.lastPass ? `<div style="margin-top:8px;"><button data-act="revertPass" style="${BTN}">↶ Revert this pass (${e(S.lastPass.source)})</button></div>` : ''}`;
      const direction = () => `
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
          ${S.hist.directions.length ? `<select style="${SEL}" data-act="dirVer"><option value="current">Saved on the record</option>${S.hist.directions.slice(0, 30).map(x => `<option value="${e(x.ts)}" ${x.register === s.register && x.photography === s.photography ? 'selected' : ''}>Direction · ${e(x.source || 'research')} · ${ago(x.ts)}</option>`).join('')}</select>` : ''}
          <button ${dirDirty() ? '' : 'disabled'} data-act="dirRevert" style="${BTN}">↺ Revert to saved</button>
          <button ${dirDirty() && !S.busy ? '' : 'disabled'} data-act="dirSave" style="${BTNP}">💾 Save to database</button>
          <span style="margin-left:auto;">${unsaved(dirDirty())}</span></div>
        ${S.ranked && S.ranked.sites.length ? `<div style="font-size:11px;color:${C.ink3};border:1px dashed ${C.line};border-radius:6px;padding:6px 8px;margin-bottom:10px;"><b>Emulating what ranks for:</b> ${e(S.ranked.keywords.join(', '))}${S.ranked.sites.map(x => `<div style="margin-top:2px;">· ${e(x)}</div>`).join('')}</div>` : ''}
        ${DIR.map(([k]) => field(k)).join('')}`;
      const palette = () => { const p = s.palette;
        return partBar('pal', palDirty(), S.slug ? ` <button ${dis} data-act="publish" title="Save palette + fonts and commit them into the live hub page" style="${BTN}">⇪ Publish to live hub</button>` : '')
          + (S.hist.palettes.length ? `<div style="margin-bottom:8px;"><select style="${SEL}" data-act="palVer"><option value="current">Saved on the record</option>${S.hist.palettes.slice(0, 30).map(x => `<option value="${e(x.ts)}" ${same(x.palette, p) ? 'selected' : ''}>Palette · ${e(x.source || 'research')} · ${ago(x.ts)}</option>`).join('')}</select></div>` : '')
          + (p ? `<div style="display:flex;border-radius:5px;overflow:hidden;width:max-content;margin-bottom:6px;">${ROLES.map(([k]) => `<span title="${k} ${e(p[k] || '')}" style="width:22px;height:28px;display:inline-block;background:${e(p[k] || '#888')};"></span>`).join('')}</div>
            <div>${ROLES.map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:${C.ink2};margin:2px 10px 2px 0;"><span style="width:11px;height:11px;border-radius:3px;border:1px solid ${C.line};background:${e(p[k] || '#888')};"></span>${l} <span style="opacity:.7;">${e(p[k] || '')}</span></span>`).join('')}</div>`
          : `<div style="font-size:12px;color:${C.ink3};">No palette yet — ↻ Regen from staged.</div>`); };
      const fonts = () => { const f = s.fonts;
        return partBar('font', fontDirty())
          + (S.hist.fonts.length ? `<div style="margin-bottom:8px;"><select style="${SEL}" data-act="fontVer"><option value="current">Saved on the record</option>${S.hist.fonts.slice(0, 30).map(x => `<option value="${e(x.ts)}" ${same(x.fonts, f) ? 'selected' : ''}>Fonts · ${e([x.fonts.display, x.fonts.body].join(' / '))} · ${ago(x.ts)}</option>`).join('')}</select></div>` : '')
          + `<div style="font-size:12.5px;color:${C.ink};">${f ? e([f.display, f.body, f.mono].filter(Boolean).join(' · ')) : `<span style="color:${C.ink3};">No fonts yet — ↻ Regen from staged.</span>`}</div>`; };
      const spec = () => partBar('spec', specDirty())
        + `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">Every asset-level image generation reads the SAVED spec. Test on Grok uses what's in the box.</div>
        <div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;margin-bottom:8px;">
          <div style="${LBL}margin-bottom:3px;">Direction to add</div>
          <textarea data-in="specSteer" rows="2" placeholder="e.g. golden-hour window light, more negative space top-left" style="${TA}">${e(S.spec.steer || '')}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><button ${S.spec.busy ? 'disabled' : ''} data-act="specRevise" style="${BTN}">＋ Add to staged spec</button>
            ${S.spec.prev != null ? `<button data-act="specUndo" style="${BTN}">↶ Undo last spec change</button>` : ''}<button data-act="specCopy" style="${BTN}">📋 Copy</button></div></div>
        <textarea data-in="spec" rows="14" style="${TA}font-size:11.5px;">${e(S.spec.busy ? 'Assembling…' : S.spec.text)}</textarea>`;
      const grok = () => `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <select data-in="aspect" style="${SEL}">${['3:4', '1:1', '16:9'].map(a => `<option ${a === S.aspect ? 'selected' : ''}>${a}</option>`).join('')}</select>
          <button ${dis} data-act="grok" style="${BTNP}">✨ Test on Grok</button><span style="font-size:11px;color:${C.ink3};">from the staged spec + staged palette</span></div>
        ${S.plate && S.plate.imageUrl ? `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid ${C.ok};border-radius:6px;margin-bottom:8px;"><a href="${e(S.plate.imageUrl)}" target="_blank" rel="noopener"><img src="${e(S.plate.imageUrl)}" style="height:60px;border-radius:5px;display:block;"></a>
          <div style="flex:1;font-size:11px;color:${C.ink2};"><b>Approved campaign plate</b>${S.plate.approvedAt ? ' · ' + e(String(S.plate.approvedAt).slice(0, 10)) : ''}<br><span style="color:${C.ink3};">Saved. Every asset-level Grok render matches this look.</span></div><button data-act="plateClear" style="${BTN}">✕ clear</button></div>` : ''}
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">${S.tests.map((t, i) => `<div style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;width:180px;">
          <a href="${e(t.url)}" target="_blank" rel="noopener" title="${e(t.prompt)}"><img src="${e(t.url)}" style="height:150px;max-width:180px;object-fit:cover;border-radius:6px;border:1px solid ${C.line};display:block;"></a>
          <span style="font-size:9.5px;color:${C.ink3};">${e(t.label)} · ${e(t.aspect)}</span>
          <button ${dis} data-act="fromPlate" data-i="${i}" title="Rewrite the staged direction from this image, then rebuild the staged spec" style="${BTN}font-size:10px;padding:3px 6px;">⟳ Direction from this</button>
          <textarea data-in="guide" data-i="${i}" rows="2" placeholder="Text request for a new image…" style="${TA}font-size:10.5px;">${e(t.guide || '')}</textarea>
          <button ${dis} data-act="regenPlate" data-i="${i}" title="A new image only — the staged fields don't change" style="${BTN}font-size:10px;padding:3px 6px;">⟳ Regen image</button>
          <button data-act="approve" data-i="${i}" style="${BTNP}font-size:10px;padding:3px 6px;">✓ Approve as campaign plate</button></div>`).join('')}</div>`;
      const voice = () => { const v = S.voice; if (!v || v.loading) return `<div style="font-size:11px;color:${C.ink3};">Loading…</div>`; if (v.error) return `<div style="font-size:11px;color:${C.bad};">${e(v.error)}</div>`;
        return `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">Rules learned from your rewrites of AI copy. The single-post and Reel writers follow them.</div>
          <div style="${LBL}">Across all campaigns</div><textarea data-in="vg" rows="5" style="${TA}margin-bottom:8px;">${e(v.global)}</textarea>
          <div style="${LBL}">This campaign</div><textarea data-in="vc" rows="5" style="${TA}">${e(v.campaign)}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;"><button data-act="voiceSave" style="${BTNP}">💾 Save rules</button><button data-act="voiceReload" style="${BTN}">↻ Refresh</button></div>
          ${(v.recent || []).length ? `<div style="font-size:11px;color:${C.ink3};margin-top:8px;"><b>Recent edits here:</b>${v.recent.slice(0, 8).map(x => `<div style="margin-top:3px;">${e(x.field)}: <s>${e(x.before)}</s> → ${e(x.after)}</div>`).join('')}</div>` : ''}`; };
      const pending = [dirDirty() && 'Visual direction', palDirty() && 'Palette', fontDirty() && 'Fonts', specDirty() && 'Image spec'].filter(Boolean);
      root.innerHTML = status
        + card('sources', '1 · Sources', 'keywords · chat · Grok · image · text override → staged direction', sources)
        + card('direction', '2 · Visual direction', (dirDirty() ? '● staged' : 'saved') + ' · register · photography · avoid · notes', direction)
        + card('palette', '3 · Palette', (palDirty() ? '● staged' : 'saved') + ' · from the staged direction', palette)
        + card('fonts', '4 · Fonts', (fontDirty() ? '● staged' : 'saved') + (s.fonts ? ' · ' + e(s.fonts.display) : ''), fonts)
        + card('spec', '5 · Image spec', (specDirty() ? '● staged' : 'saved') + ' · from the staged direction + palette', spec)
        + card('grok', '6 · Test on Grok', S.plate ? 'approved plate set' : 'staged spec → plate', grok)
        + card('voice', '🗣 Your voice', 'learned from your edits', voice)
        + `<div style="position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border:1px solid ${pending.length ? C.warn : C.line};border-radius:8px;background:${C.surf2};font-size:11.5px;">
            <div style="flex:1;min-width:180px;">${pending.length ? `<b style="color:${C.warn};">Staged, not saved: ${e(pending.join(' · '))}</b>` : `<b style="color:${C.ok};">✓ Everything saved</b>`}</div>
            <button ${S.undo.length ? '' : 'disabled'} data-act="undo" title="Undo the last staged change" style="${BTN}">↶ Undo${S.undo.length ? ' (' + S.undo.length + ')' : ''}</button></div>`;
    }

    // ── events ──
    root.addEventListener('input', ev => {
      const t = ev.target, k = t.dataset.in; if (!k) return;
      if (k === 'steer') S.steer = t.value; else if (k === 'stage') S.stage[t.dataset.k] = t.value; else if (k === 'kw') S.kw.text = t.value;
      else if (k === 'gptReply') S.gpt.reply = t.value; else if (k === 'spec') S.spec.text = t.value; else if (k === 'specSteer') S.spec.steer = t.value;
      else if (k === 'guide') S.tests[+t.dataset.i].guide = t.value; else if (k === 'vg') S.voice.global = t.value; else if (k === 'vc') S.voice.campaign = t.value;
    });
    root.addEventListener('change', ev => {
      const t = ev.target, a = t.dataset.act;
      if (t.dataset.in === 'aspect') S.aspect = t.value;
      if (a === 'dirVer') pickDirVersion(t.value);
      if (a === 'palVer') pickVersion('palette', t.value);
      if (a === 'fontVer') pickVersion('fonts', t.value);
      if (a === 'srcImage') { const f = t.files && t.files[0]; t.value = ''; if (!f) return; if (f.size > 4000000) return say('Keep the image under 4 MB.', 'bad');
        const rd = new FileReader(); rd.onload = () => srcImage(rd.result); rd.readAsDataURL(f); }
    });
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const a = b.dataset.act, i = +b.dataset.i;
      if (a === 'toggle') { const k = b.dataset.k; S.open[k] = !S.open[k]; if (k === 'voice' && S.open.voice) loadVoice(); render(); }
      else if (a === 'edit') { if (!S.edit[b.dataset.k]) snap(); S.edit[b.dataset.k] = !S.edit[b.dataset.k]; render(); }
      else if (a === 'srcOverride') srcOverride();
      else if (a === 'srcKeywords') srcKeywords();
      else if (a === 'kwToggle') { if (S.kw) { S.kw = null; render(); } else openKeywords(); }
      else if (a === 'srcGrok') srcGrok();
      else if (a === 'gptCopy') { const t = chatPrompt(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say('Prompt copied — paste it into ChatGPT, then paste the reply below and 📥 Stage it.', 'ok')).catch(() => { S.gpt.reply = t; say('Clipboard blocked — the prompt is in the reply box; copy it from there.', 'bad'); }); }
      else if (a === 'srcChat') srcChatStage();
      else if (a === 'revertPass') revertPass();
      else if (a === 'dirSave') saveDirection();
      else if (a === 'dirRevert') revertDirection();
      else if (a === 'palRegen') regenPalette();
      else if (a === 'palRevert') revertPart('palette');
      else if (a === 'palSave') savePart('palette');
      else if (a === 'fontRegen') regenFonts();
      else if (a === 'fontRevert') revertPart('fonts');
      else if (a === 'fontSave') savePart('fonts');
      else if (a === 'publish') publishLive();
      else if (a === 'preview') { S.preview = !S.preview; render(); }
      else if (a === 'specRegen') regenSpec();
      else if (a === 'specRevert') { S.spec.prev = S.spec.text; S.spec.text = S.spec.saved; render(); }
      else if (a === 'specSave') saveSpec();
      else if (a === 'specRevise') specRevise();
      else if (a === 'specUndo') { if (S.spec.prev != null) { const c = S.spec.text; S.spec.text = S.spec.prev; S.spec.prev = c; render(); } }
      else if (a === 'specCopy') { (navigator.clipboard ? navigator.clipboard.writeText(S.spec.text) : Promise.reject()).then(() => say('Image spec copied.', 'ok')).catch(() => say('Clipboard blocked.', 'bad')); }
      else if (a === 'grok') testGrok();
      else if (a === 'fromPlate') directionFromPlate(i);
      else if (a === 'regenPlate') { const g = (S.tests[i].guide || '').trim(); if (!g) return say('Type a text request for the new image first.', 'bad'); testGrok(g, S.tests[i].prompt); }
      else if (a === 'approve') approve(i);
      else if (a === 'plateClear') clearPlate();
      else if (a === 'voiceSave') saveVoice();
      else if (a === 'voiceReload') { S.voice = null; loadVoice(); }
      else if (a === 'undo') { if (S.undo.length) { S.stage = S.undo.pop(); render(); } }
    });
    window.addEventListener('beforeunload', ev => { if (root.isConnected && S.stage && (dirDirty() || palDirty() || fontDirty() || specDirty())) { ev.preventDefault(); ev.returnValue = ''; } });
    render(); load();
    return { reload: load, state: S };
  }
  window.DesignPanel = { mount };
})();
