// ══════════════════════ HUB RE-RUN (shared) ══════════════════════
// "⟲ Re-run from keywords" — rebuild a hub from scratch off its keywords, step by step, in one modal.
// Steps (each optional, run in order, stops on the first failure with "resume from here"):
//   1 research  — designSpec op:research: Statement / Unique Opportunity / Key Message / Characters / Content
//                 Topics / Marketing Intelligence + campaign Audience / Pain Points / Goal / CTA from the keywords
//   2 design    — designSpec reset → build (keywords + ranked-site search + seed photo) → text override
//   3 publish   — designSpec save (Research Image Spec + palette / fonts / direction) → publishHubDesign
//   4 copy      — generateHubContent (follows the spec's voice + content rules) → content.json
//   5 images    — hero + signup rendered on Grok from the spec's asset fields → hubImage
//   6 dummies   — hubDummies force (clears the hub sections, recreates the dummy titles + assets) — off by default
//   HubRerun.open({ call(action, body) → Promise<json>, slug, campaignId, name, onDone?() })
(function () {
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const C = { ink: 'var(--text, var(--ink, #222))', ink3: 'var(--text3, var(--ink3, #888))', line: 'var(--border2, var(--border, #ccc))', surf: 'var(--surface, #fff)',
    surf2: 'var(--surface2, #f4f4f4)', acc: 'var(--accent, var(--sea, #0b6e8a))', ok: 'var(--fresh, #3a9a5b)', bad: '#c0392b', warn: '#b26a00' };
  const BTN = `font-size:12px;padding:6px 12px;border:1px solid ${C.line};border-radius:6px;background:${C.surf2};color:${C.ink};cursor:pointer;`;
  const BTNP = `font-size:12px;padding:6px 14px;border:1px solid ${C.acc};border-radius:6px;background:${C.acc};color:#fff;font-weight:600;cursor:pointer;`;
  const TA = `width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;padding:6px 8px;border:1px solid ${C.line};border-radius:6px;background:${C.surf};color:${C.ink};`;
  const STEPS = [
    ['research', 'Research from keywords', '~1-2 min', 'Rewrites Statement, Unique Opportunity, Key Message, Characters, Content Topics, Marketing Intelligence + the campaign\'s Audience, Pain Points, Goal, CTA.', true],
    ['design', 'Design spec from scratch', '~4-5 min', 'Clears the staged spec; Claude fills every field from the keywords, a live search of the ranked sites and the seed photo, then applies your override.', true],
    ['publish', 'Save + publish the design', '~20 s', 'Saves the spec to the Research record and puts its palette + fonts on the live hub page.', true],
    ['copy', 'Hub page copy', '~1 min', 'Rewrites every hub section\'s copy (content.json), following the spec\'s voice + content rules.', true],
    ['images', 'Hero + signup images', '~1 min', 'Renders both on Grok from the spec\'s asset fields and sets them on the hub.', true],
    ['dummies', 'Section dummies (clear + recreate)', '~1 min', 'Takes every asset out of the hub sections and recreates the dummy titles + assets. Destructive.', false],
  ];
  const ASPECTS = ['3:4', '1:1', '16:9'];
  const nearest = v => { const m = /(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/.exec(String(v || '')); if (!m) return '3:4'; const r = m[1] / m[2];
    return ASPECTS.slice().sort((a, b) => Math.abs(a.split(':')[0] / a.split(':')[1] - r) - Math.abs(b.split(':')[0] / b.split(':')[1] - r))[0]; };

  function open(cfg) {
    const S = { kw: '', override: '', photo: null, on: Object.fromEntries(STEPS.map(s => [s[0], s[4]])), st: {}, running: false, note: '' };
    const call = async (a, b) => { const r = await cfg.call(a, Object.assign({ campaignId: cfg.campaignId }, b || {})); if (r && r.error) throw new Error(r.error); return r || {}; };
    const ds = (op, b) => call('designSpec', Object.assign({ op }, b || {}));
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 12px;';
    document.body.appendChild(ov);
    const close = () => { if (S.running && !confirm('A step is still running. Close anyway? (it keeps running on the server)')) return; ov.remove(); if (cfg.onDone) cfg.onDone(); };
    ov.addEventListener('click', ev => { if (ev.target === ov) close(); });

    function render() {
      const dis = S.running ? 'disabled' : '';
      const icon = k => ({ run: '⏳', ok: '✅', err: '❌', skip: '⏭' })[(S.st[k] || {}).s] || '·';
      ov.innerHTML = `<div style="width:min(680px,100%);background:${C.surf};color:${C.ink};border:1px solid ${C.line};border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);">
        <div style="display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid ${C.line};"><b style="font-size:14px;flex:1;">⟲ Re-run ${e(cfg.name || cfg.slug)} from keywords</b>
          <button data-a="close" style="${BTN}padding:2px 9px;">✕</button></div>
        <div style="padding:14px 16px;">
          <div style="font-size:11px;color:${C.ink3};margin-bottom:10px;">Rebuilds the hub from scratch off its keywords. Each ticked step runs in order; the run stops at the first failure and can resume from there.</div>
          <div style="font-size:11px;font-weight:600;margin-bottom:3px;">Keywords</div>
          <textarea data-in="kw" rows="3" ${dis} placeholder="main keyword, then the related searches…" style="${TA}">${e(S.kw)}</textarea>
          <div style="display:flex;gap:12px;align-items:flex-start;margin:10px 0;">
            <div style="flex:1;"><div style="font-size:11px;font-weight:600;margin-bottom:3px;">Seed photo <span style="font-weight:400;color:${C.ink3};">— the style seed (optional)</span></div>
              <label style="${BTN}display:inline-block;">${S.photo ? '⟳ Replace' : '⬆ Upload'}<input type="file" accept="image/*" data-a="photo" ${dis} style="display:none;"></label>
              ${S.photoNote ? `<span style="font-size:11px;color:${C.ink3};margin-left:6px;">${e(S.photoNote)}</span>` : ''}</div>
            ${S.photo ? `<img src="${e(S.photo)}" style="height:64px;border-radius:6px;border:1px solid ${C.line};">` : ''}</div>
          <div style="font-size:11px;font-weight:600;margin-bottom:3px;">Text override <span style="font-weight:400;color:${C.ink3};">— your words win (optional)</span></div>
          <textarea data-in="override" rows="2" ${dis} placeholder="e.g. warm and plain-spoken · illustration not photos · sage buttons" style="${TA}">${e(S.override)}</textarea>
          <div style="margin-top:12px;border:1px solid ${C.line};border-radius:8px;">${STEPS.map(([k, label, eta, desc], i) => `
            <div style="display:flex;gap:10px;padding:8px 10px;${i ? `border-top:1px solid ${C.line};` : ''}align-items:flex-start;">
              <input type="checkbox" data-a="step" data-k="${k}" ${S.on[k] ? 'checked' : ''} ${dis} style="margin-top:3px;">
              <div style="flex:1;"><div style="font-size:12.5px;"><b>${i + 1} · ${e(label)}</b> <span style="font-size:10.5px;color:${C.ink3};">${eta}</span>${k === 'dummies' ? ` <span style="font-size:10px;color:${C.warn};">destructive</span>` : ''}</div>
                <div style="font-size:11px;color:${C.ink3};">${e(desc)}</div>
                ${S.st[k] && S.st[k].d ? `<div style="font-size:11px;margin-top:3px;color:${S.st[k].s === 'err' ? C.bad : C.ink};">${e(S.st[k].d)}</div>` : ''}</div>
              <span style="font-size:14px;">${icon(k)}</span></div>`).join('')}</div>
          ${S.note ? `<div style="font-size:12px;margin-top:10px;color:${S.noteKind === 'bad' ? C.bad : S.noteKind === 'ok' ? C.ok : C.ink3};">${e(S.note)}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-top:1px solid ${C.line};">
          ${S.failed ? `<button data-a="resume" ${dis} style="${BTN}">↻ Resume from step ${STEPS.findIndex(s => s[0] === S.failed) + 1}</button>` : ''}
          <button data-a="close" style="${BTN}">${S.running ? 'Hide' : 'Close'}</button>
          <button data-a="run" ${dis} style="${BTNP}">${S.running ? '⏳ Running…' : '⟲ Run ticked steps'}</button></div></div>`;
    }
    const set = (k, s, d) => { S.st[k] = { s, d: d || '' }; render(); };

    async function runFrom(startKey) {
      const kw = S.kw.trim(); if (!kw) { S.note = 'Add the keywords first.'; S.noteKind = 'bad'; return render(); }
      const todo = STEPS.filter(s => S.on[s[0]]).map(s => s[0]), from = startKey ? todo.indexOf(startKey) : 0, steps = todo.slice(Math.max(0, from));
      if (!steps.length) { S.note = 'Tick at least one step.'; S.noteKind = 'bad'; return render(); }
      if (!startKey && !confirm(`Re-run ${cfg.name || cfg.slug} from these keywords?\n\nThis overwrites: ${steps.map(k => STEPS.find(s => s[0] === k)[1]).join(' · ')}.`)) return;
      S.running = true; S.failed = null; S.note = ''; steps.forEach(k => { S.st[k] = { s: '', d: '' }; }); render();
      let pub = null;
      for (const k of steps) {
        set(k, 'run', 'running…');
        try {
          if (k === 'research') {
            const r = await ds('research', { keywords: kw });
            set(k, 'ok', `Wrote ${(r.wrote || []).join(' + ')}${(r.errors || []).length ? ' — ' + r.errors.join('; ') : ''}. Key message: ${(r.research || {}).keyMessage || ''}`);
          } else if (k === 'design') {
            await ds('reset', { keywords: kw, override: S.override });
            const b = await ds('build');
            let d = `${(b.job || {}).applied ? b.job.applied.length : Object.keys(b.staged || {}).length} fields built`;
            if (S.override.trim()) { set(k, 'run', d + ' — applying your override…'); const t = await ds('text', { override: S.override }); d += `, override changed ${((t.job || {}).applied || []).length}`; }
            set(k, 'ok', d + '.');
          } else if (k === 'publish') {
            const r = await ds('save'); pub = r;
            if (r.notionError) throw new Error('Research write failed: ' + r.notionError);
            if (r.palette && cfg.slug) { await call('publishHubDesign', { slug: cfg.slug, keepSpec: true, palette: r.palette, fonts: r.fonts || undefined }); set(k, 'ok', `Saved ${Object.keys(r.saved || {}).length} fields; palette + fonts published (${r.fonts ? r.fonts.display + ' / ' + r.fonts.body : 'fonts unchanged'}).`); }
            else set(k, 'ok', `Saved ${Object.keys(r.saved || {}).length} fields. ${r.palette ? '' : 'Not published — a color field is missing a hex.'}`);
          } else if (k === 'copy') {
            const r = await call('generateHubContent', { slug: cfg.slug });
            set(k, 'ok', `Copy written — "${((r.content || {}).hero || {}).headline || 'hero updated'}"`);
          } else if (k === 'images') {
            const g = pub || await ds('get'), sp = g.saved || g.staged || {}, v = key => (sp[key] || {}).v || '';
            const base = Object.keys(sp).filter(x => /^(img|ovl|avoid|color)\./.test(x)).map(x => `${x}: ${v(x)}`).join('\n');
            const out = [];
            for (const [id, kind, label] of [['hero', 'hero', 'hub hero image'], ['signup', 'signup', 'signup-section image']]) {
              set(k, 'run', `rendering the ${label}…`);
              const asset = Object.keys(sp).filter(x => x.startsWith(`asset.${id}.`)).map(x => `${x}: ${v(x)}`).join('\n');
              const r = await call('renderSpecTest', { spec: `${asset}\n\n${base}`, aspect: nearest(v(`asset.${id}.aspect`)),
                steer: `This is the ${label}. Follow every asset.${id}.* line exactly (subject, composition, background, safe area). No text or letters in the image.` });
              await call('hubImage', { slug: cfg.slug, kind, op: 'url', url: r.imageUrl });
              out.push(label);
            }
            set(k, 'ok', `Set the ${out.join(' + ')} on the hub.`);
          } else if (k === 'dummies') {
            const r = await call('hubDummies', { slug: cfg.slug, force: true });
            set(k, 'ok', `${r.created || 0} dummies created${r.cleared ? `, ${r.cleared.assets || 0} assets taken out of the sections` : ''}.`);
          }
        } catch (err) {
          set(k, 'err', err.message); S.failed = k; S.running = false;
          steps.slice(steps.indexOf(k) + 1).forEach(x => { S.st[x] = { s: 'skip', d: '' }; });
          S.note = 'Stopped. Fix the problem (or untick the step) and resume.'; S.noteKind = 'bad'; return render();
        }
      }
      S.running = false; S.note = 'Done — the live hub redeploys in about a minute.'; S.noteKind = 'ok'; render();
    }

    ov.addEventListener('input', ev => { const t = ev.target; if (t.dataset.in === 'kw') S.kw = t.value; if (t.dataset.in === 'override') S.override = t.value; });
    ov.addEventListener('change', async ev => {
      const t = ev.target;
      if (t.dataset.a === 'step') { S.on[t.dataset.k] = t.checked; if (t.dataset.k === 'dummies' && t.checked && !confirm('Section dummies clears every asset out of this hub\'s sections. Keep it ticked?')) S.on.dummies = false; render(); }
      if (t.dataset.a === 'photo') {
        const f = t.files && t.files[0]; if (!f) return; S.photoNote = 'uploading…'; render();
        try {
          const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(f); });
          const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
          const sc = Math.min(1, 1600 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const r = await ds('photo', { data: cv.toDataURL('image/jpeg', 0.9) }); S.photo = (r.inputs.photo || {}).url; S.photoNote = 'stored';
        } catch (err) { S.photoNote = 'upload failed: ' + err.message; }
        render();
      }
    });
    ov.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b || b.tagName === 'INPUT') return;
      if (b.dataset.a === 'close') close(); else if (b.dataset.a === 'run') runFrom(null); else if (b.dataset.a === 'resume') runFrom(S.failed); });

    render();
    // prefill: the hub's stored inputs (keywords / photo / override), else its keywords on file
    ds('get').then(r => { const i = r.inputs || {}; if (!S.kw) S.kw = i.keywords || ''; if (!S.override) S.override = i.override || ''; S.photo = (i.photo || {}).url || null; render();
      if (!S.kw && cfg.slug) call('getHubKeywords', { slug: cfg.slug }).then(k => { if (!S.kw && k.keywords) { S.kw = k.keywords; render(); } }).catch(() => {}); })
      .catch(err => { S.note = 'Could not load the hub\'s inputs: ' + err.message; S.noteKind = 'bad'; render(); });
  }
  window.HubRerun = { open };
})();
