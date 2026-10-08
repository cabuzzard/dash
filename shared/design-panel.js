// ══════════════════════ DESIGN PANEL (shared) ══════════════════════
// ONE design editor, mounted by both the care-gap microsite's Design tab and the
// dashboard's Content Hubs card, so the two are always the same. A hub IS its
// campaign: everything reads and writes the campaign's Research record.
//
// Sources build ADDITIVELY on the current design (the staged copy, seeded from
// the record): a one-off text override, Claude's research design, design from
// keywords, design from a reference image, and a ChatGPT design-spec import.
// Nothing reaches Notion until 💾 Save (→ Research record + image spec rebuilt,
// which every asset-level image generation reads) or Push to hub (→ also the
// live hub's palette + fonts).
//
//   DesignPanel.mount(el, { call(action, body) → Promise<json>, campaignId, slug })
(function () {
  const ROLES = [['bg','Background'],['surface','Card'],['ink','Body text'],['ink-head','Headings'],['ink-soft','Muted text'],['line','Outlines'],['sea','Primary / links'],['deep','Dark band'],['deep-ink','Text on dark'],['accent','Accent / button']];
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

  function mount(root, cfg) {
    const S = { cid: String(cfg.campaignId || '').replace(/-/g, ''), slug: cfg.slug || '', base: null, stage: null, hist: { palettes: [], fonts: [], directions: [] },
      open: {}, edit: {}, steer: '', img: null, busy: '', msg: '', msgKind: '', spec: { text: '', loaded: false, dirty: false, busy: false },
      tests: [], aspect: '3:4', gpt: { reply: '', prompt: '', aspect: '3:4', lastUrl: '' }, plate: null, voice: null, saving: '', saveErr: '', specOk: true, kw: null,
      undo: [], preview: false };
    // ↶ undo: every change to the staged design pushes the previous stage (session only, last 40)
    const snap = () => { if (S.stage) { S.undo.push(clone(S.stage)); if (S.undo.length > 40) S.undo.shift(); } };
    // 👁 preview: hand the staged palette + fonts to the host (the dashboard paints them onto its live hub preview)
    const pushPreview = () => { if (cfg.preview) try { cfg.preview(S.preview ? { palette: S.stage && S.stage.palette, fonts: S.stage && S.stage.fonts } : null); } catch (e) {} };
    const call = async (a, b) => { const r = await cfg.call(a, Object.assign({ campaignId: S.cid }, b || {})); if (r && r.error) throw new Error(r.error); return r || {}; };
    root.__dp = S;
    const say = (m, kind) => { S.msg = m || ''; S.msgKind = kind || ''; render(); };

    // ── load ──
    async function load() {
      S.busy = 'Loading the design…'; render();
      try {
        const r = await call('getHubDesignHistory', { slug: S.slug || S.cid });
        S.hist = { palettes: r.palettes || [], fonts: r.fonts || [], directions: r.directions || [] };
        const c = r.current || {};
        S.base = { palette: c.palette || null, fonts: (c.fonts && c.fonts.display) ? c.fonts : null, register: c.register || '', photography: c.photography || '', avoid: c.avoid || '', notes: c.notes || '' };
        S.stage = clone(S.base);
        S.spec.text = c.imageSpec || ''; S.spec.loaded = true; S.specOk = (c.imageSpec || '').length > 200;
      } catch (err) { S.busy = ''; return say('Could not load the design: ' + err.message, 'bad'); }
      S.busy = ''; render();
      call('getApprovedPlate').then(r => { S.plate = r.plate || null; render(); }).catch(() => {});
    }
    const dirtyParts = () => { if (!S.stage) return []; const b = S.base, s = S.stage, p = [];
      if (!same(s.register, b.register) || !same(s.photography, b.photography) || !same(s.avoid, b.avoid)) p.push('Visual direction');
      if (!same(s.notes, b.notes)) p.push('Design notes'); if (!same(s.palette, b.palette)) p.push('Palette'); if (!same(s.fonts, b.fonts)) p.push('Fonts'); return p; };
    function payload(full) {
      const s = S.stage, b = S.base, dir = {};
      for (const k of ['register', 'photography', 'avoid']) if ((s[k] || '') !== (b[k] || '')) dir[k] = s[k] || '';
      return { slug: S.slug, palette: ((full || !same(s.palette, b.palette)) && s.palette) ? s.palette : undefined,
        fonts: ((full || !same(s.fonts, b.fonts)) && s.fonts && s.fonts.display) ? s.fonts : undefined,
        direction: Object.keys(dir).length ? dir : undefined, notes: (s.notes || '') !== (b.notes || '') ? (s.notes || '') : undefined };
    }
    const stagedForSpec = () => { const s = S.stage, u = v => (v && String(v).trim()) ? v : undefined;
      return { register: u(s.register), photography: u(s.photography), avoid: u(s.avoid), notes: u(s.notes), palette: s.palette || undefined, fonts: (s.fonts && s.fonts.display) ? s.fonts : undefined }; };

    // ── sources (each adds onto the current stage) ──
    async function genDirection(source, extra) {
      snap();
      S.busy = source === 'image' ? 'Reading the direction off the image…' : source === 'keywords' ? 'Building the direction from those keywords…' : source === 'plate' ? 'Reading the direction off that plate…' : 'Claude is researching the visual direction…'; render();
      try {
        const s = S.stage;
        const r = await call('generateResearchDesign', Object.assign({ slug: S.slug || undefined, stage: true, instructions: S.steer.trim() || undefined,
          current: { register: s.register, photography: s.photography, avoid: s.avoid } }, extra || {}));
        S.hist.directions.unshift({ ts: r.ts || Date.now(), register: r.design.register, photography: r.design.photography, avoid: r.design.avoid, source: r.source || source });
        Object.assign(s, { register: r.design.register, photography: r.design.photography, avoid: r.design.avoid });
        S.busy = ''; S.open.direction = true; say('Direction updated (' + (r.source || source) + ') — staged. 💾 Save to keep it.', 'ok');
      } catch (err) { S.busy = ''; say('Direction failed: ' + err.message, 'bad'); }
    }
    async function genPalette() {
      snap();
      S.busy = S.img ? 'Pulling a palette from the image…' : 'Researching a palette…'; render();
      try {
        const r = await call('generateResearchPalette', { slug: S.slug || undefined, stage: true, image: S.img ? S.img.data : undefined, instructions: S.steer.trim() || undefined, current: S.stage.palette || undefined });
        S.hist.palettes.unshift({ ts: r.ts || Date.now(), palette: r.palette, rationale: r.note || '', source: S.img ? 'image' : (S.steer.trim() ? 'override' : 'research') });
        S.stage.palette = r.palette; S.busy = ''; S.open.palette = true; say((r.note || 'Palette updated') + ' — staged.', 'ok');
      } catch (err) { S.busy = ''; say('Palette failed: ' + err.message, 'bad'); }
    }
    async function genFonts() {
      snap();
      S.busy = 'Researching a type pairing…'; render();
      try {
        const r = await call('generateResearchFonts', { slug: S.slug || undefined, stage: true, instructions: S.steer.trim() || undefined, current: S.stage.fonts || undefined });
        S.hist.fonts.unshift({ ts: r.ts || Date.now(), fonts: r.fonts });
        S.stage.fonts = r.fonts; S.busy = ''; S.open.fonts = true; say('Fonts updated: ' + [r.fonts.display, r.fonts.body, r.fonts.mono].join(' · ') + ' — staged.', 'ok');
      } catch (err) { S.busy = ''; say('Fonts failed: ' + err.message, 'bad'); }
    }
    // Claude's initial design (the hub's hubs.design.json entry from creation) — added onto the stage: empty fields
    // are filled, the brief is appended to Design notes once. Nothing already there is replaced.
    async function claudeInitial() {
      snap();
      if (!S.slug) return say('This campaign has no hub, so there is no Claude initial design.', 'bad');
      S.busy = 'Reading Claude’s initial design…'; render();
      try {
        const dj = await fetch('https://raw.githubusercontent.com/cabuzzard/dash/main/web/hub/hubs.design.json?t=' + Date.now()).then(r => r.json());
        const en = (dj.hubs || {})[S.slug]; if (!en) throw new Error('no entry for this hub');
        const d = en.design || {}, s = S.stage, got = [];
        const keys = ROLES.map(([k]) => k);
        if (!s.palette && en.tokens && keys.every(k => en.tokens[k])) { s.palette = Object.fromEntries(keys.map(k => [k, en.tokens[k]])); got.push('palette'); }
        if (!(s.fonts && s.fonts.display) && en.fonts && en.fonts.display) { s.fonts = { display: en.fonts.display, body: en.fonts.body || 'Inter', mono: en.fonts.mono || 'IBM Plex Mono' }; got.push('fonts'); }
        const reg = d.register || [d.subject, d.job].filter(Boolean).join(' — ');
        if (!s.register && reg) { s.register = reg; got.push('register'); }
        if (!s.photography && d.photography) { s.photography = d.photography; got.push('photography'); }
        const av = d.avoid || (Array.isArray(d.avoided) ? d.avoided.join('; ') : '');
        if (!s.avoid && av) { s.avoid = av; got.push('avoid'); }
        const MARK = '— Initial design (Claude, hub creation) —';
        if (!(s.notes || '').includes(MARK)) {
          const brief = [d.audience && 'Audience: ' + d.audience, d.type && 'Type: ' + d.type, d.signature && 'Signature element: ' + d.signature, d.risk && 'Aesthetic risk: ' + d.risk,
            Array.isArray(d.avoided) && d.avoided.length && 'Avoided: ' + d.avoided.join('; ')].filter(Boolean).join('\n');
          if (brief) { s.notes = [s.notes, MARK + '\n' + brief].filter(Boolean).join('\n\n'); got.push('notes (brief added)'); }
        }
        S.busy = ''; S.open.direction = true;
        say(got.length ? 'Added from Claude’s initial design: ' + got.join(', ') + '. 💾 Save to keep it.' : 'Everything from Claude’s initial design is already in this design.', 'ok');
      } catch (err) { S.busy = ''; say('Could not read the initial design: ' + err.message, 'bad'); }
    }
    async function openKeywords() {
      S.kw = { text: 'Loading the keywords…', note: '', loading: true }; render();
      try { const r = await call('getHubKeywords', { slug: S.slug }); S.kw = { text: r.keywords || '', note: r.keywords ? 'From the ' + (r.source || 'campaign') + (r.productName ? ' — ' + r.productName : '') + '. Edit freely.' : 'No keywords on file — type some.' }; }
      catch (err) { S.kw = { text: '', note: 'Could not load keywords: ' + err.message }; }
      render();
    }
    function gptPrompt() {
      const roles = ROLES.map(([k, l]) => `    "${k}": "#RRGGBB"   // ${l}`).join('\n');
      return `We're moving the visual design we built in this chat into our campaign system. Report the design we actually settled on here — the final version, not a new one. Don't redesign. Where we never decided something, infer it from the images/mockups/direction in this chat and keep it consistent with them.

Write register / photography / avoid as DIRECTION any image model could follow (it becomes the campaign's source-of-truth visual direction), not as a prompt for one tool. The Grok-specific prompt goes only in grokPrompt.

Reply with ONE fenced \`\`\`json block and nothing else, exactly this shape:

{
  "register": "1-2 sentences — the overall look and mood. Concrete, specific to this subject.",
  "photography": "3-4 sentences — the real images that belong: subjects and settings (concrete nouns), the light (time of day, quality, colour cast), how the palette shows up in a photo, the medium/finish. Say plainly whether people/faces belong.",
  "avoid": "semicolon-separated list of the specific looks, clichés and AI/stock-photo defaults this design rejects",
  "notes": "anything else about this design a designer must keep (optional)",
  "palette": {
${roles}
  },
  "fonts": { "display": "<Google Font family>", "body": "<Google Font family>", "mono": "<Google Font family>" },
  "grokAspect": "3:4 | 1:1 | 16:9 — whichever is closest to the key image",
  "grokPrompt": "see below"
}

Palette roles: bg = page background; surface = raised card; ink = body text; ink-head = headings; ink-soft = muted text; line = hairlines/borders; sea = the primary colour (links, eyebrows, focus); deep = the one dark band; deep-ink = text on that dark band; accent = the CTA button (white label on it). Use real 6-digit hex values taken from the design. Keep ink >= 7:1 contrast on bg, and white >= 4.4:1 on accent — nudge a hex only if it fails.
Fonts must be Google Fonts families (closest match if the design used something else).

"grokPrompt" matters most. We render this design's imagery on xAI Grok Imagine, and your text is sent to Grok WORD FOR WORD, with nothing added. Write the prompt that makes Grok produce its closest possible facsimile of the KEY IMAGE from this chat (the hero/main visual we landed on). Grok can't see this chat, so describe everything it needs, in this order:
- subject and scene: every object, its placement in the frame (left/right/foreground/background), scale, and what's left empty;
- camera: shot type, angle, lens feel (e.g. 35mm, shallow depth of field), framing and crop;
- light: source, direction, time of day, hardness, colour temperature, shadows;
- colour: the actual palette hexes as they appear in the image, plus the grade (saturation, contrast, film/digital feel);
- medium and finish: photo vs illustration vs 3D, texture, grain, rendering style;
- mood, in 3-5 precise words.
Use 120-200 words of plain descriptive prose (no bullet points, no weights or parameters, no negative-prompt syntax). Leave out any text/typography that was ON the image. End with: "No text, no letters, no logos, no watermarks."

Strip the // comments from the JSON.`;
    }
    function stageGpt() {
      snap();
      const raw = S.gpt.reply || '', f = raw.match(/```(?:json)?\s*([\s\S]*?)```/i), body = f ? f[1] : raw, a = body.indexOf('{'), b = body.lastIndexOf('}');
      let d; try { if (a < 0 || b <= a) throw new Error('no JSON object found'); d = JSON.parse(body.slice(a, b + 1).replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1')); }
      catch (err) { return say('Could not read the reply: ' + err.message + ' — paste the whole JSON block.', 'bad'); }
      const s = S.stage, got = [];
      if (d.register || d.photography || d.avoid) {
        if (d.register) s.register = String(d.register).trim(); if (d.photography) s.photography = String(d.photography).trim();
        if (d.avoid) s.avoid = String(Array.isArray(d.avoid) ? d.avoid.join('; ') : d.avoid).trim(); got.push('direction');
        S.hist.directions.unshift({ ts: Date.now(), register: s.register, photography: s.photography, avoid: s.avoid, source: 'chatgpt' });
      }
      if (d.notes && String(d.notes).trim()) { s.notes = [s.notes, String(d.notes).trim()].filter(Boolean).join('\n\n'); got.push('notes (added)'); }
      if (d.palette && typeof d.palette === 'object') {
        const pal = Object.assign({}, s.palette || {}), bad = [];
        for (const [k] of ROLES) { const v = String(d.palette[k] || '').trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) pal[k] = v.toLowerCase(); else if (/^#[0-9a-f]{3}$/i.test(v)) pal[k] = ('#' + v.slice(1).split('').map(c => c + c).join('')).toLowerCase(); else bad.push(k); }
        if (Object.keys(pal).length) { s.palette = pal; S.hist.palettes.unshift({ ts: Date.now(), palette: pal, source: 'chatgpt' }); got.push('palette' + (bad.length ? ' (kept current for: ' + bad.join(', ') + ')' : '')); }
      }
      if (d.fonts && d.fonts.display) { s.fonts = { display: String(d.fonts.display).trim(), body: String(d.fonts.body || (s.fonts && s.fonts.body) || 'Inter').trim(), mono: String(d.fonts.mono || (s.fonts && s.fonts.mono) || 'Space Mono').trim() }; S.hist.fonts.unshift({ ts: Date.now(), fonts: s.fonts }); got.push('fonts'); }
      if (d.grokPrompt && String(d.grokPrompt).trim().length > 40) { S.gpt.prompt = String(d.grokPrompt).trim(); S.gpt.aspect = (String(d.grokAspect || '').match(/3:4|1:1|16:9/) || ['3:4'])[0]; got.push('Grok prompt'); }
      if (!got.length) return say('JSON read, but none of register / photography / avoid / palette / fonts were in it.', 'bad');
      S.open.direction = S.open.palette = S.open.fonts = true;
      say('Staged from ChatGPT: ' + got.join(', ') + '. Review, then 💾 Save.', 'ok');
    }
    function pickVersion(kind, val) {
      snap();
      const s = S.stage, b = S.base, list = S.hist[kind === 'palette' ? 'palettes' : kind === 'fonts' ? 'fonts' : 'directions'] || [];
      const en = val === 'current' ? null : list.find(x => String(x.ts) === String(val));
      if (kind === 'palette') s.palette = en ? en.palette : clone(b.palette);
      else if (kind === 'fonts') s.fonts = en ? en.fonts : clone(b.fonts);
      else { s.register = en ? en.register : b.register; s.photography = en ? en.photography : b.photography; s.avoid = en ? en.avoid : b.avoid; }
      render();
    }

    // ── save / push / spec ──
    async function rebuildSpec() {
      const r = await call('previewImageSpec', { slug: S.slug || undefined, staged: stagedForSpec() });
      await call('saveImageSpec', { text: r.text || '' });
      S.spec.text = r.text || ''; S.spec.dirty = false; S.specOk = true;
    }
    async function save() {
      if (S.saving) return;
      S.saveErr = '';
      try {
        if (dirtyParts().length) {
          S.saving = 'Saving the design to the campaign record…'; render();
          await call('saveHubBrief', payload(false));
          S.base = clone(S.stage); S.specOk = false;
        }
        S.saving = 'Rebuilding the image spec from the saved design (about a minute)…'; render();
        await rebuildSpec();
      } catch (err) { S.saveErr = err.message; }
      S.saving = ''; render();
    }
    async function push() {
      if (!S.stage.palette) return say('No palette yet — generate one first.', 'bad');
      if (!confirm('Push this design to the live hub?\n\nSaves the staged design to the campaign record, commits the palette + fonts into the hub, rebuilds the image spec, and redeploys (~1 min).')) return;
      S.saving = 'Publishing to the live hub…'; S.saveErr = ''; render();
      try { const r = await call('publishHubDesign', payload(true)); S.base = clone(S.stage); say('Published — live in about a minute. ' + (r.note || ''), 'ok'); S.saving = 'Rebuilding the image spec…'; render(); await rebuildSpec(); if (cfg.onPushed) cfg.onPushed(r); }
      catch (err) { S.saveErr = err.message; }
      S.saving = ''; render();
    }
    async function specPreview() { S.spec.busy = true; render(); try { const r = await call('previewImageSpec', { slug: S.slug || undefined, staged: stagedForSpec() }); S.spec.text = r.text || ''; S.spec.dirty = true; S.open.spec = true; } catch (err) { say('Spec preview failed: ' + err.message, 'bad'); } S.spec.busy = false; render(); }
    async function specRevise() {
      const steer = (S.spec.steer || '').trim(); if (!steer) return say('Type the direction to add first.', 'bad');
      if (!S.spec.text.trim()) return say('There is no spec yet — ↻ Rebuild from staged design first.', 'bad');
      S.spec.busy = true; render();
      try { const r = await call('reviseImageSpec', { text: S.spec.text, steer }); S.spec.prev = S.spec.text; S.spec.text = r.text || S.spec.text; S.spec.dirty = true; S.spec.steer = '';
        say('Direction added to the spec — review it, then 💾 Save spec (↶ Undo spec edit to go back).', 'ok'); }
      catch (err) { say('Could not add it: ' + err.message, 'bad'); }
      S.spec.busy = false; render();
    }
    async function specSave() { S.spec.busy = true; render(); try { await call('saveImageSpec', { text: S.spec.text }); S.spec.dirty = false; S.specOk = true; say('Image spec saved — asset image generation now uses it.', 'ok'); } catch (err) { say('Spec save failed: ' + err.message, 'bad'); } S.spec.busy = false; render(); }

    // ── Grok ──
    async function testGrok(guidance, prevPrompt) {
      S.busy = 'Grok is rendering a test plate (~20s)…'; render();
      try {
        const s = S.stage;
        const r = await call('renderSpecTest', { spec: (S.spec.text || '').trim().length > 80 ? S.spec.text : undefined, direction: { register: s.register, photography: s.photography, avoid: s.avoid }, palette: s.palette || undefined, aspect: S.aspect,
          guidance: guidance || undefined, previousPrompt: guidance ? prevPrompt : undefined });
        S.tests.unshift({ url: r.imageUrl, prompt: r.prompt || '', aspect: r.aspect || S.aspect, label: (guidance ? 'guided: ' + guidance.slice(0, 50) : 'staged design') + (S.spec.dirty ? ' · unsaved spec' : '') });
        S.busy = ''; S.open.grok = true; say('Rendered — newest first. Hover a plate for its prompt.', 'ok');
      } catch (err) { S.busy = ''; say('Grok test failed: ' + err.message, 'bad'); }
    }
    async function grokVerbatim() {
      if (S.gpt.prompt.trim().length < 40) return say('The ChatGPT Grok prompt is empty.', 'bad');
      S.busy = "Grok is rendering ChatGPT's prompt, word for word…"; render();
      try { const r = await call('renderSpecTest', { rawPrompt: S.gpt.prompt.trim(), aspect: S.gpt.aspect });
        S.gpt.lastUrl = r.imageUrl; S.tests.unshift({ url: r.imageUrl, prompt: S.gpt.prompt.trim(), aspect: S.gpt.aspect, label: 'ChatGPT prompt' }); S.busy = ''; S.open.grok = true; say('Rendered from the ChatGPT prompt.', 'ok'); }
      catch (err) { S.busy = ''; say('Grok render failed: ' + err.message, 'bad'); }
    }
    async function approve(i) { const t = S.tests[i]; if (!t) return; try { const r = await call('saveApprovedPlate', { imageUrl: t.url, prompt: t.prompt }); S.plate = r.plate || { imageUrl: t.url }; say('Approved — every asset-level Grok render now matches this plate\'s look.', 'ok'); } catch (err) { say('Approve failed: ' + err.message, 'bad'); } }
    async function clearPlate() { try { await call('saveApprovedPlate', { clear: true }); S.plate = null; render(); } catch (err) { say('Clear failed: ' + err.message, 'bad'); } }

    // ── voice ──
    async function loadVoice() { if (S.voice) return; S.voice = { loading: true }; render();
      try { const r = await call('getVoiceProfile'); S.voice = { global: (r.global && r.global.text) || '', campaign: (r.campaign && r.campaign.text) || '', recent: r.recent || [], edits: r.edits || {}, samples: r.samples || {} }; }
      catch (err) { S.voice = { error: err.message }; } render(); }
    async function saveVoice() { try { await call('saveVoiceProfile', { global: S.voice.global, campaign: S.voice.campaign }); say('Voice rules saved.', 'ok'); } catch (err) { say('Voice save failed: ' + err.message, 'bad'); } }

    // ── render ──
    const card = (key, title, sub, body, onOpen) => { const o = !!S.open[key];
      return `<div style="border:1px solid ${C.line};border-radius:8px;margin-bottom:8px;background:${C.surf};">
        <div data-act="toggle" data-k="${key}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;user-select:none;">
          <span style="font-size:10px;color:${C.ink3};width:10px;">${o ? '▼' : '▶'}</span><b style="font-size:12.5px;color:${C.ink};">${title}</b><span style="font-size:11px;color:${C.ink3};">${sub || ''}</span></div>
        ${o ? `<div style="padding:4px 12px 12px;">${body()}</div>` : ''}</div>`; };
    const verSel = (kind, list, curMatch, labelOf) => list.length ? `<select style="${SEL}" data-act="ver" data-k="${kind}"><option value="current">Saved on the record</option>${list.slice(0, 30).map(x => `<option value="${e(x.ts)}" ${curMatch(x) ? 'selected' : ''}>${e(labelOf(x))} · ${ago(x.ts)}</option>`).join('')}</select>` : '';
    const field = (k, label) => { const s = S.stage, b = S.base, ch = !same(s[k], b[k]);
      return `<div style="margin-bottom:10px;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;"><span style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};">${label}</span>${ch ? `<span style="font-size:10px;color:${C.warn};">● unsaved</span>` : ''}
        <button data-act="edit" data-k="${k}" style="${BTN}padding:0 6px;margin-left:auto;">${S.edit[k] ? 'done' : '✎'}</button></div>
        ${S.edit[k] ? `<textarea data-in="stage" data-k="${k}" rows="${k === 'notes' ? 5 : 4}" style="${TA}">${e(s[k])}</textarea>` : `<div style="font-size:12px;color:${C.ink};white-space:pre-wrap;line-height:1.45;">${e(s[k]) || `<span style="color:${C.ink3};">(empty)</span>`}</div>`}</div>`; };
    function render() {
      pushPreview();
      if (!S.stage) { root.innerHTML = `<div style="font-size:12px;color:${S.msgKind === 'bad' ? C.bad : C.ink3};padding:6px 0;">${e(S.msg || S.busy || 'Loading…')}</div>`; return; }
      const s = S.stage, dirty = dirtyParts();
      const status = S.busy || S.msg ? `<div style="font-size:11.5px;margin:0 0 8px;color:${S.busy ? C.ink3 : S.msgKind === 'bad' ? C.bad : S.msgKind === 'ok' ? C.ok : C.ink3};">${e(S.busy || S.msg)}</div>` : '';
      const dis = S.busy || S.saving ? 'disabled' : '';
      const sources = () => `
        <div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">Every source builds on the current design rather than replacing it. Results are staged until you 💾 Save.</div>
        <label style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};">Text override (this run)</label>
        <textarea data-in="steer" rows="2" placeholder="e.g. keep it dark · primary a deep teal · warmer light · no orange" style="${TA}margin:3px 0 8px;">${e(S.steer)}</textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
          <button ${dis} data-act="genDir" style="${BTNP}">↻ Claude design</button>
          ${S.slug ? `<button ${dis} data-act="claudeInit" title="Add the design Claude made when the hub was created (fills empty fields, adds its brief to Design notes)" style="${BTN}">＋ Claude initial</button>` : ''}
          <button ${dis} data-act="kwOpen" style="${BTN}">↻ From keywords…</button>
          <label style="${BTN}">🖼 ${S.img ? 'Change image' : 'Hold an image'}<input type="file" accept="image/*" data-act="img" style="display:none;"></label>
          ${S.img ? `<button ${dis} data-act="genImg" style="${BTN}">↻ Direction from image</button><button data-act="imgClear" style="${BTN}">✕ image</button>` : ''}
          <button ${dis} data-act="genPal" style="${BTN}">↻ Palette${S.img ? ' (from image)' : ''}</button>
          <button ${dis} data-act="genFonts" style="${BTN}">↻ Fonts</button>
        </div>
        ${S.img ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><img src="${S.img.data}" style="height:40px;border-radius:4px;"><span style="font-size:11px;color:${C.ink3};">Held: ${e(S.img.name)} — steers the image-based buttons.</span></div>` : ''}
        ${S.kw ? `<div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;margin-bottom:8px;"><div style="font-size:11px;color:${C.ink3};margin-bottom:4px;">Direction from keywords. ${e(S.kw.note || '')}</div>
          <textarea data-in="kw" rows="3" style="${TA}">${e(S.kw.text)}</textarea><div style="display:flex;gap:6px;margin-top:6px;"><button ${dis} data-act="genKw" style="${BTNP}">↻ Build direction from these</button><button data-act="kwClose" style="${BTN}">Cancel</button></div></div>` : ''}
        <div style="border-top:1px solid ${C.line};padding-top:8px;">
          <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};margin-bottom:4px;">ChatGPT design spec</div>
          <div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">1. Copy the prompt into the ChatGPT chat where the design was made. 2. Paste its reply here and stage it. It fills every design field plus a Grok prompt.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"><button data-act="gptCopy" style="${BTN}">📋 Copy ChatGPT prompt</button><button data-act="gptStage" style="${BTN}">📥 Stage the reply</button></div>
          <textarea data-in="gptReply" rows="3" placeholder="Paste ChatGPT's whole reply (the JSON block is found automatically)…" style="${TA}">${e(S.gpt.reply)}</textarea>
        </div>`;
      const direction = () => `<div style="margin-bottom:8px;">${verSel('direction', S.hist.directions, x => x.register === s.register && x.photography === s.photography, x => 'Direction · ' + (x.source || 'research'))}</div>
        ${field('register', 'Visual register')}${field('photography', 'Photography direction')}${field('avoid', 'Visual avoid')}${field('notes', 'Design notes (yours)')}`;
      const palette = () => { const p = s.palette;
        return `<div style="margin-bottom:8px;">${verSel('palette', S.hist.palettes, x => same(x.palette, p), x => 'Palette · ' + (x.source || 'research'))}${!same(p, S.base.palette) ? ` <span style="font-size:10px;color:${C.warn};">● unsaved</span>` : ''}</div>
          ${p ? `<div style="display:flex;border-radius:5px;overflow:hidden;width:max-content;margin-bottom:6px;">${ROLES.map(([k]) => `<span title="${k} ${e(p[k] || '')}" style="width:22px;height:28px;display:inline-block;background:${e(p[k] || '#888')};"></span>`).join('')}</div>
            <div>${ROLES.map(([k, l]) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10.5px;color:${C.ink2};margin:2px 10px 2px 0;"><span style="width:11px;height:11px;border-radius:3px;border:1px solid ${C.line};background:${e(p[k] || '#888')};"></span>${l} <span style="opacity:.7;">${e(p[k] || '')}</span></span>`).join('')}</div>`
          : `<div style="font-size:12px;color:${C.ink3};">No palette yet — ↻ Palette in Sources.</div>`}`; };
      const fonts = () => { const f = s.fonts;
        return `<div style="margin-bottom:8px;">${verSel('fonts', S.hist.fonts, x => same(x.fonts, f), x => 'Fonts · ' + [x.fonts.display, x.fonts.body].join(' / '))}${!same(f, S.base.fonts) ? ` <span style="font-size:10px;color:${C.warn};">● unsaved</span>` : ''}</div>
          <div style="font-size:12.5px;color:${C.ink};">${f ? e([f.display, f.body, f.mono].filter(Boolean).join(' · ')) : `<span style="color:${C.ink3};">No fonts yet — ↻ Fonts in Sources.</span>`}</div>`; };
      const spec = () => `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">The guidance every asset-level image generation reads (single-post backgrounds, offer plates, thumbnails). 💾 Save design rebuilds it automatically; edit by hand here if needed.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"><button ${S.spec.busy ? 'disabled' : ''} data-act="specPrev" style="${BTN}">↻ Rebuild from staged design</button><button ${S.spec.busy ? 'disabled' : ''} data-act="specSave" style="${BTN}">💾 Save spec</button><button data-act="specCopy" style="${BTN}">📋 Copy</button>
          ${S.spec.dirty ? `<span style="font-size:10.5px;color:${C.warn};align-self:center;">● not saved</span>` : ''}</div>
        <div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;margin-bottom:8px;">
          <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};margin-bottom:3px;">Direction to add</div>
          <textarea data-in="specSteer" rows="2" placeholder="e.g. golden-hour window light, older caregiver, more negative space top-left" style="${TA}">${e(S.spec.steer || '')}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><button ${S.spec.busy ? 'disabled' : ''} data-act="specRevise" style="${BTNP}">＋ Add to spec</button>
            ${S.spec.prev ? `<button data-act="specUndo" style="${BTN}">↶ Undo spec edit</button>` : ''}
            <span style="font-size:10.5px;color:${C.ink3};align-self:center;">works it into the spec below, keeps everything else</span></div></div>
        <textarea data-in="spec" rows="14" style="${TA}font-size:11.5px;">${e(S.spec.busy ? 'Assembling…' : S.spec.text)}</textarea>`;
      const grok = () => `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
          <select data-in="aspect" style="${SEL}">${['3:4', '1:1', '16:9'].map(a => `<option ${a === S.aspect ? 'selected' : ''}>${a}</option>`).join('')}</select>
          <button ${dis} data-act="grok" style="${BTNP}">✨ Test on Grok</button><span style="font-size:11px;color:${C.ink3};">renders one wordless plate from the spec in the Image spec box (saved or not) + the staged direction and palette</span></div>
        ${S.gpt.prompt ? `<div style="border:1px dashed ${C.line};border-radius:6px;padding:8px;margin-bottom:8px;"><div style="font-size:11px;color:${C.ink3};margin-bottom:4px;">ChatGPT's Grok prompt — sent word for word (${e(S.gpt.aspect)}).</div>
          <textarea data-in="gptPrompt" rows="5" style="${TA}">${e(S.gpt.prompt)}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><button ${dis} data-act="grokRaw" style="${BTN}">✨ Render on Grok</button>${S.gpt.lastUrl ? `<button ${dis} data-act="foldGpt" style="${BTN}">⟳ Direction from that render</button>` : ''}</div></div>` : ''}
        ${S.plate && S.plate.imageUrl ? `<div style="display:flex;align-items:center;gap:10px;padding:8px;border:1px solid ${C.ok};border-radius:6px;margin-bottom:8px;"><a href="${e(S.plate.imageUrl)}" target="_blank" rel="noopener"><img src="${e(S.plate.imageUrl)}" style="height:60px;border-radius:5px;display:block;"></a>
          <div style="flex:1;font-size:11px;color:${C.ink2};"><b>Approved campaign plate</b>${S.plate.approvedAt ? ' · ' + e(String(S.plate.approvedAt).slice(0, 10)) : ''}<br><span style="color:${C.ink3};">Every asset-level Grok render matches this look.</span></div><button data-act="plateClear" style="${BTN}">✕ clear</button></div>` : ''}
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">${S.tests.map((t, i) => `<div style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px;width:170px;">
          <a href="${e(t.url)}" target="_blank" rel="noopener" title="${e(t.prompt)}"><img src="${e(t.url)}" style="height:150px;max-width:170px;object-fit:cover;border-radius:6px;border:1px solid ${C.line};display:block;"></a>
          <span style="font-size:9.5px;color:${C.ink3};">${e(t.label)} · ${e(t.aspect)}</span>
          <button ${dis} data-act="fromPlate" data-i="${i}" style="${BTN}font-size:10px;padding:3px 6px;">⟳ direction from this</button>
          <button data-act="approve" data-i="${i}" style="${BTN}font-size:10px;padding:3px 6px;">✓ approve as campaign plate</button>
          <textarea data-in="guide" data-i="${i}" rows="2" placeholder="What should change?" style="${TA}font-size:10.5px;">${e(t.guide || '')}</textarea>
          <button ${dis} data-act="regenPlate" data-i="${i}" style="${BTN}font-size:10px;padding:3px 6px;">⟳ Regenerate with that</button></div>`).join('')}</div>`;
      const voice = () => { const v = S.voice; if (!v || v.loading) return `<div style="font-size:11px;color:${C.ink3};">Loading…</div>`; if (v.error) return `<div style="font-size:11px;color:${C.bad};">${e(v.error)}</div>`;
        return `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">Rules learned from your rewrites of AI copy. The single-post and Reel writers follow them.</div>
          <label style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:${C.ink3};">Across all campaigns</label><textarea data-in="vg" rows="5" style="${TA}margin-bottom:8px;">${e(v.global)}</textarea>
          <label style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:${C.ink3};">This campaign</label><textarea data-in="vc" rows="5" style="${TA}">${e(v.campaign)}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;"><button data-act="voiceSave" style="${BTNP}">💾 Save rules</button><button data-act="voiceReload" style="${BTN}">↻ Refresh</button></div>
          ${(v.recent || []).length ? `<div style="font-size:11px;color:${C.ink3};margin-top:8px;"><b>Recent edits here:</b>${v.recent.slice(0, 8).map(x => `<div style="margin-top:3px;">${e(x.field)}: <s>${e(x.before)}</s> → ${e(x.after)}</div>`).join('')}</div>` : ''}`; };
      let bar;
      if (S.saving) bar = `<b>⏳ ${e(S.saving)}</b>`;
      else if (dirty.length) bar = `<b style="color:${C.warn};">⚠ Not saved: ${e(dirty.join(' · '))}</b> <span style="color:${C.ink3};">— renders and new assets still use the saved design.</span>`;
      else if (!S.specOk) bar = `<b style="color:${C.bad};">The image spec isn't built from the saved design yet.</b>`;
      else bar = `<b style="color:${C.ok};">✓ Design saved</b> <span style="color:${C.ink3};">· image spec up to date</span>`;
      root.innerHTML = status
        + card('sources', 'Sources', 'override · Claude · Claude initial · keywords · image · ChatGPT', sources)
        + card('direction', 'Visual direction', 'register · photography · avoid · your notes', direction)
        + card('palette', 'Palette', s.palette ? '10 colours' : 'none yet', palette)
        + card('fonts', 'Fonts', s.fonts ? e(s.fonts.display) : 'none yet', fonts)
        + card('spec', 'Image spec', 'sent to asset image generation', spec)
        + card('grok', 'Test on Grok', S.plate ? 'approved plate set' : '', grok)
        + card('voice', '🗣 Your voice', 'learned from your edits', voice)
        + `<div style="position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:9px 12px;border:1px solid ${dirty.length ? C.warn : C.line};border-radius:8px;background:${C.surf2};font-size:11.5px;">
            <div style="flex:1;min-width:180px;">${bar}${S.saveErr ? `<br><span style="color:${C.bad};">Last try failed: ${e(S.saveErr)}</span>` : ''}</div>
            <button ${S.undo.length ? '' : 'disabled'} data-act="undo" title="Undo the last change to the staged design" style="${BTN}">↶ Undo${S.undo.length ? ' (' + S.undo.length + ')' : ''}</button>
            <button ${dirty.length ? '' : 'disabled'} data-act="revert" title="Throw away every staged change — back to what's saved on the record" style="${BTN}">↺ Revert to saved</button>
            ${cfg.preview ? `<button data-act="preview" title="Paint the staged palette + fonts onto the hub preview on the right (nothing is saved)" style="${S.preview ? BTNP : BTN}">👁 Preview on hub${S.preview ? ': on' : ''}</button>` : ''}
            <button ${S.saving ? 'disabled' : ''} data-act="save" style="${BTNP}">${dirty.length ? '💾 Save design' : !S.specOk ? '↻ Rebuild image spec' : '💾 Save'}</button>
            ${S.slug ? `<button ${S.saving ? 'disabled' : ''} data-act="push" title="Also commit the palette + fonts into the live hub (redeploys ~1 min)" style="${BTN}">Push to hub ↓</button>` : ''}</div>`;
    }

    // ── events (delegated; inputs write state without re-rendering) ──
    root.addEventListener('input', ev => {
      const t = ev.target, k = t.dataset.in; if (!k) return;
      if (k === 'steer') S.steer = t.value; else if (k === 'stage') S.stage[t.dataset.k] = t.value; else if (k === 'kw') S.kw.text = t.value;
      else if (k === 'gptReply') S.gpt.reply = t.value; else if (k === 'gptPrompt') S.gpt.prompt = t.value; else if (k === 'spec') { S.spec.text = t.value; S.spec.dirty = true; } else if (k === 'specSteer') S.spec.steer = t.value;
      else if (k === 'guide') S.tests[+t.dataset.i].guide = t.value; else if (k === 'vg') S.voice.global = t.value; else if (k === 'vc') S.voice.campaign = t.value;
    });
    root.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.in === 'aspect') S.aspect = t.value;
      if (t.dataset.act === 'ver') pickVersion(t.dataset.k, t.value);
      if (t.dataset.act === 'img') { const f = t.files && t.files[0]; if (!f) return; if (f.size > 4000000) return say('Keep the image under 4 MB.', 'bad');
        const rd = new FileReader(); rd.onload = () => { S.img = { name: f.name, data: rd.result }; render(); }; rd.readAsDataURL(f); }
    });
    root.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
      const a = b.dataset.act, i = +b.dataset.i;
      if (a === 'toggle') { const k = b.dataset.k; S.open[k] = !S.open[k]; if (k === 'voice' && S.open.voice) loadVoice(); render(); }
      else if (a === 'edit') { if (!S.edit[b.dataset.k]) snap(); S.edit[b.dataset.k] = !S.edit[b.dataset.k]; render(); }
      else if (a === 'genDir') genDirection('research');
      else if (a === 'claudeInit') claudeInitial();
      else if (a === 'genImg') genDirection('image', { image: S.img && S.img.data });
      else if (a === 'imgClear') { S.img = null; render(); }
      else if (a === 'genPal') genPalette();
      else if (a === 'genFonts') genFonts();
      else if (a === 'kwOpen') openKeywords();
      else if (a === 'kwClose') { S.kw = null; render(); }
      else if (a === 'genKw') { const kw = (S.kw && S.kw.text || '').trim(); if (!kw) return; S.kw = null; genDirection('keywords', { keywords: kw }); }
      else if (a === 'gptCopy') { const t = gptPrompt(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => say('ChatGPT prompt copied — paste it into the design chat.', 'ok')).catch(() => { S.gpt.reply = t; say('Clipboard blocked — the prompt is in the reply box; copy it from there.', 'bad'); }); }
      else if (a === 'gptStage') stageGpt();
      else if (a === 'specPrev') specPreview();
      else if (a === 'specSave') specSave();
      else if (a === 'specRevise') specRevise();
      else if (a === 'specUndo') { if (S.spec.prev != null) { S.spec.text = S.spec.prev; S.spec.prev = null; S.spec.dirty = true; render(); } }
      else if (a === 'specCopy') { (navigator.clipboard ? navigator.clipboard.writeText(S.spec.text) : Promise.reject()).then(() => say('Image spec copied.', 'ok')).catch(() => say('Clipboard blocked.', 'bad')); }
      else if (a === 'grok') testGrok();
      else if (a === 'grokRaw') grokVerbatim();
      else if (a === 'foldGpt') genDirection('plate', { imageUrl: S.gpt.lastUrl, instructions: 'This image is the APPROVED look, reproduced from the design chat. The prompt that produced it (use its detail on light, colour grade, camera, medium and finish, but generalise the subject into a family of scenes; write model-agnostic direction, not a prompt): ' + S.gpt.prompt.slice(0, 2500) });
      else if (a === 'fromPlate') genDirection('plate', { imageUrl: S.tests[i].url });
      else if (a === 'approve') approve(i);
      else if (a === 'regenPlate') { const g = (S.tests[i].guide || '').trim(); if (g) testGrok(g, S.tests[i].prompt); }
      else if (a === 'plateClear') clearPlate();
      else if (a === 'voiceSave') saveVoice();
      else if (a === 'voiceReload') { S.voice = null; loadVoice(); }
      else if (a === 'save') save();
      else if (a === 'undo') { if (S.undo.length) { S.stage = S.undo.pop(); render(); } }
      else if (a === 'revert') { snap(); S.stage = clone(S.base); render(); }
      else if (a === 'preview') { S.preview = !S.preview; render(); }
      else if (a === 'push') push();
    });
    window.addEventListener('beforeunload', ev => { if (root.isConnected && (S.saving || dirtyParts().length)) { ev.preventDefault(); ev.returnValue = ''; } });
    render(); load();
    return { reload: load, state: S };
  }
  window.DesignPanel = { mount };
})();
