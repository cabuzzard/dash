// ══════════════════════ 🎤 INTERVIEWS (shared) — 2026-10-10 ══════════════════════
// Your own answers — ONE per product (main offering), flowing to every title + asset under it, plus an asset's OWN
// interview when it needs one (🎤 Request interview inside the asset). Notion 🎤 Interviews DB; worker getInterviews / getInterview /
// createInterviews / saveInterview / removeInterview). Status: Flagged (waiting for your answers) · Finished.
// A Finished interview feeds every writer for that title AND the voice engine (🗣 Your voice), so it sits next to
// the voice card in the shared Design panel. All Output rows and the ⚑ flag panels open the same modal.
//   InterviewPanel.list({ call, campaignId })   → an element listing the hub's interviews (cached per hub)
//   InterviewPanel.open({ call, interviewId, onDone? })   → the answer modal
(function () {
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const C = { ink: 'var(--text, var(--ink, #222))', ink2: 'var(--text2, var(--ink2, #555))', ink3: 'var(--text3, var(--ink3, #888))', line: 'var(--border2, var(--border, #ccc))',
    surf: 'var(--surface, #fff)', surf2: 'var(--surface2, #f4f4f4)', acc: 'var(--accent, var(--sea, #0b6e8a))' };
  const FLAG = '#ff7a00', DONE = '#3a9a5b';
  const BTN = `font-size:11px;padding:4px 10px;border:1px solid ${C.line};border-radius:6px;background:${C.surf2};color:${C.ink};cursor:pointer;`;
  const BTNP = `font-size:11px;padding:4px 10px;border:1px solid ${DONE};border-radius:6px;background:${DONE};color:#fff;font-weight:600;cursor:pointer;`;
  const TA = `width:100%;box-sizing:border-box;font-family:inherit;font-size:12.5px;line-height:1.45;padding:7px 9px;border:1px solid ${C.line};border-radius:6px;background:${C.surf};color:${C.ink};`;
  const req = async (call, a, b) => { const r = await call(a, b || {}); if (r && r.error) throw new Error(r.error); return r || {}; };
  const pill = st => `<span style="font-size:10.5px;padding:1px 8px;border-radius:9px;font-weight:700;${st === 'Finished' ? `background:rgba(58,154,91,.18);color:${DONE};` : `background:${FLAG};color:#111;`}">${st === 'Finished' ? 'Finished' : 'Flagged'}</span>`;
  const listeners = new Set();
  const changed = () => listeners.forEach(f => { try { f(); } catch (err) {} });

  // ── the hub list (Design panel card) ──
  const lists = {};
  function list(cfg) {
    const cid = String(cfg.campaignId || '').replace(/-/g, '');
    if (lists[cid]) { lists[cid].refresh(); return lists[cid].el; }
    const el = document.createElement('div'), S = { items: null, err: '', showDone: false, busy: '' };
    async function refresh() { try { S.items = (await req(cfg.call, 'getInterviews', { campaignId: cid })).interviews || []; S.err = ''; } catch (err) { S.err = err.message; S.items = S.items || []; } draw(); }
    function draw() {
      if (S.items === null) { el.innerHTML = `<div style="font-size:11px;color:${C.ink3};">Loading…</div>`; return; }
      const byTitle = {};
      S.items.forEach(x => { const k = x.scope === 'Product' ? 'p:' + x.productId : 't:' + x.titleId;
        (byTitle[k] = byTitle[k] || { title: x.title, kind: x.scope === 'Product' ? 'product' : 'title', list: [] }).list.push(x); });
      const groups = Object.entries(byTitle).map(([tid, g]) => ({ tid, ...g, flagged: g.list.filter(x => x.status !== 'Finished').length }))
        .filter(g => S.showDone || g.flagged).sort((a, b) => b.flagged - a.flagged || a.title.localeCompare(b.title));
      const nFlag = S.items.filter(x => x.status !== 'Finished').length, nDone = S.items.length - nFlag;
      el.innerHTML = `<div style="font-size:11px;color:${C.ink3};margin-bottom:8px;">One interview per main offering, in your own words — it flows to every title and asset under that offering and teaches 🗣 Your voice. An asset that needs its own gets one from 🎤 Request interview inside the asset.</div>
        ${S.err ? `<div style="font-size:11px;color:#c0392b;margin-bottom:6px;">${e(S.err)}</div>` : ''}${S.busy ? `<div style="font-size:11px;color:${C.ink3};margin-bottom:6px;">⏳ ${e(S.busy)}</div>` : ''}
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:11.5px;"><b style="color:${nFlag ? FLAG : C.ink3};">${nFlag} flagged</b><span style="color:${C.ink3};">· ${nDone} finished</span>
          <button data-iv="toggleDone" style="${BTN}margin-left:auto;font-size:10px;padding:2px 8px;">${S.showDone ? 'Hide finished' : 'Show finished'}</button><button data-iv="reload" style="${BTN}font-size:10px;padding:2px 8px;">↻</button></div>
        ${groups.length ? groups.map(g => `<div style="border:1px solid ${g.flagged ? FLAG : C.line};border-radius:8px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:6px;padding:6px 9px;border-bottom:1px solid ${C.line};font-size:12px;font-weight:600;color:${C.ink};"><span style="flex:1;">${g.kind === 'product' ? '★ ' : ''}${e(g.title || '(untitled)')}</span>
              <button data-iv="add" data-t="${e(g.tid)}" title="Write another interview for this ${g.kind}" style="${BTN}font-size:10px;padding:2px 7px;">+ Interview</button></div>
            ${g.list.filter(x => S.showDone || x.status !== 'Finished').map(x => `<div data-iv="open" data-id="${e(x.id)}" style="display:flex;align-items:center;gap:8px;padding:6px 9px;cursor:pointer;font-size:12px;border-top:1px solid ${C.line};">
              ${pill(x.status)}<span style="flex:1;color:${C.ink};">🎤 ${x.scope === 'Asset' ? `<b style="color:#8e5bd0;">own · ${e(x.forType)}</b> ` : ''}${e(x.angle || 'Interview')} <span style="color:${C.ink3};font-size:11px;">· ${x.answers.filter(a => a.trim()).length}/${x.qs.length} answered</span></span>
              <span style="font-size:11px;color:${C.acc};">${x.status === 'Finished' ? 'View' : 'Answer'} →</span></div>`).join('')}</div>`).join('')
          : `<div style="font-size:11.5px;color:${C.ink3};padding:6px 0;">${S.items.length ? 'Nothing flagged — every interview is finished.' : 'No interviews on this hub yet. New titles get them automatically (within ~30 min).'}</div>`}`;
    }
    el.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-iv]'); if (!b) return;
      const a = b.dataset.iv;
      if (a === 'reload') { S.items = null; draw(); refresh(); }
      else if (a === 'toggleDone') { S.showDone = !S.showDone; draw(); }
      else if (a === 'open') open({ call: cfg.call, interviewId: b.dataset.id });
      else if (a === 'add') {
        const direction = prompt('Optional: steer this interview (e.g. "a client story about…"). Leave blank to let it choose.', '');
        if (direction === null) return;
        S.busy = 'Writing the questions…'; draw();
        const t = b.dataset.t, arg = t.startsWith('p:') ? { productId: t.slice(2) } : { titleId: t.slice(2) };
        try { await req(cfg.call, 'createInterviews', { ...arg, direction }); } catch (err) { S.err = err.message; }
        S.busy = ''; refresh();
      }
    });
    listeners.add(refresh);
    lists[cid] = { el, refresh }; draw(); refresh();
    return el;
  }

  // ── the answer modal ──
  let modal = null;
  function open(cfg) {
    if (modal) modal.remove();
    const S = { iv: null, answers: [], dirty: false, busy: 'Loading…', err: '' };
    modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 12px;';
    document.body.appendChild(modal);
    const box = document.createElement('div');
    box.style.cssText = `width:min(760px,100%);background:var(--bg, ${'#fff'});color:${C.ink};border:1px solid ${C.line};border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);`;
    modal.appendChild(box);
    const close = async () => { if (S.dirty && S.iv) await save(false).catch(() => {}); if (modal) { modal.remove(); modal = null; } document.removeEventListener('keydown', onKey); };
    const onKey = ev => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    modal.addEventListener('click', ev => { if (ev.target === modal) close(); });
    function draw() {
      const iv = S.iv;
      box.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <div style="flex:1;"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};">🎤 Interview${iv ? ' · ' + e(iv.angle || '') : ''}</div>
            <div style="font-size:16px;font-weight:700;margin-top:2px;">${iv ? e(iv.title) : ''}</div>
            ${iv && iv.why ? `<div style="font-size:12px;color:${C.ink2};margin-top:3px;">${e(iv.why)}</div>` : ''}</div>
          ${iv ? pill(iv.status) : ''}<button data-m="close" style="${BTN}">✕</button></div>
        ${S.err ? `<div style="font-size:12px;color:#c0392b;margin-bottom:8px;">${e(S.err)}</div>` : ''}
        ${!iv ? `<div style="font-size:12px;color:${C.ink3};">${e(S.busy || '')}</div>` : iv.qs.map((q, i) => `<div style="margin-bottom:12px;">
            <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${i + 1}. ${e(q)}</div>
            <textarea data-a="${i}" rows="3" placeholder="Type it the way you'd say it…" style="${TA}">${e(S.answers[i] || '')}</textarea></div>`).join('')}
        ${iv ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid ${C.line};padding-top:10px;">
            <span style="font-size:11.5px;color:${C.ink3};flex:1;min-width:180px;">${S.busy ? '⏳ ' + e(S.busy) : `${S.answers.filter(a => (a || '').trim()).length}/${iv.qs.length} answered · skip any question that doesn't apply`}</span>
            ${iv.url ? `<a href="${e(iv.url)}" target="_blank" rel="noopener" style="${BTN}text-decoration:none;">Notion ↗</a>` : ''}
            <button data-m="remove" style="${BTN}color:#c0392b;">🗑 Remove</button>
            ${iv.status === 'Finished' ? `<button data-m="reflag" style="${BTN}">↩ Flag again</button>` : ''}
            <button data-m="save" style="${BTN}">💾 Save draft</button>
            <button data-m="finish" style="${BTNP}">✓ ${iv.status === 'Finished' ? 'Save' : 'Finish'}</button></div>` : ''}`;
    }
    async function save(finish, extra) {
      S.busy = finish ? 'Saving + teaching your voice…' : 'Saving…'; draw();
      try { const r = await req(cfg.call, 'saveInterview', Object.assign({ interviewId: S.iv.id, answers: S.answers, finish }, extra || {})); S.iv = r.interview; S.answers = r.interview.answers.slice(); S.dirty = false; S.err = ''; changed(); if (cfg.onDone) cfg.onDone(r.interview); }
      catch (err) { S.err = err.message; }
      S.busy = ''; if (modal) draw();
    }
    box.addEventListener('input', ev => { const t = ev.target; if (t.dataset.a != null) { S.answers[+t.dataset.a] = t.value; S.dirty = true; } });
    box.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-m]'); if (!b || S.busy) return;
      const m = b.dataset.m;
      if (m === 'close') close();
      else if (m === 'save') save(false);
      else if (m === 'finish') { if (!S.answers.some(a => (a || '').trim())) { S.err = 'Answer at least one question to finish.'; draw(); return; } await save(true); if (!S.err) close(); }
      else if (m === 'reflag') save(false, { reflag: true });
      else if (m === 'remove') { if (!confirm('Remove this interview?')) return; S.busy = 'Removing…'; draw();
        try { await req(cfg.call, 'removeInterview', { interviewId: S.iv.id }); S.dirty = false; changed(); if (cfg.onDone) cfg.onDone(null); close(); } catch (err) { S.err = err.message; S.busy = ''; draw(); } }
    });
    draw();
    req(cfg.call, 'getInterview', { interviewId: cfg.interviewId }).then(r => { S.iv = r.interview; S.answers = r.interview.answers.slice(); S.busy = ''; draw(); })
      .catch(err => { S.err = err.message; S.busy = ''; draw(); });
  }

  // 🎤 Request interview — from inside an asset: writes the asset's OWN interview (Scope Asset), then opens it
  async function request(cfg) {
    const direction = prompt('Request an interview for this asset.\nOptional: what should it draw out? (leave blank to let it choose)', '');
    if (direction === null) return null;
    try { const r = await req(cfg.call, 'createInterviews', { assetId: cfg.assetId, direction }); const iv = (r.interviews || [])[0];
      changed(); if (iv) open({ call: cfg.call, interviewId: iv.id, onDone: cfg.onDone }); return iv || null; }
    catch (err) { alert('Could not request the interview: ' + err.message); return null; }
  }
  window.InterviewPanel = { list, open, request, onChange: f => listeners.add(f) };
})();
