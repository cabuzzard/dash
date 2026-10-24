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
  const reuseBadge = (iv,i) => { const source=(iv.reused||[]).find(x=>x.index===i);if(!source)return '';const id=String(source.ivId||'').replace(/-/g,'');return `<div style="font-size:11px;color:${DONE};margin:3px 0 6px;">♻ Reused from ${/^[a-f0-9]{32}$/i.test(id)?`<a href="https://www.notion.so/${id}" target="_blank" rel="noopener">an earlier interview</a>`:e(source.ivId)}. Edit this answer to replace it.</div>`; };
  const req = async (call, a, b) => { const r = await call(a, b || {}); if (r && r.error) { const x = new Error(r.error); x.server = true; throw x; } return r || {}; };   // x.server = the worker answered with an error (vs a dropped connection)
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

  // 🔎 Expert check — the answers vs the CURRENT standard of practice in their field (Opus + live web search, worker
  // ivExpertCheck / ivExpertGet / ivExpertApply). Marketable output: also flags what would cost credibility with a
  // sophisticated buyer. Each claim: verdict, what the standard actually is (sources), the smallest fix (editable) and
  // the line a top practitioner would add. Opinions stay yours. InterviewPanel.expert({call, interviewId, beforeRun?, onApplied?}) → element
  const VC = { 'current': ['#3a9a5b', 'rgba(58,154,91,.15)'], 'mostly current': ['#3a9a5b', 'rgba(58,154,91,.10)'], 'outdated': ['#c25e00', 'rgba(255,122,0,.15)'],
    'contested': ['#c25e00', 'rgba(255,122,0,.15)'], 'wrong': ['#c0392b', 'rgba(192,57,43,.15)'], 'opinion': ['#888', 'rgba(127,127,127,.12)'] };
  function expert(cfg) {
    const el = document.createElement('div'), S = { report: null, busy: '', err: '', edits: {}, pick: {} };
    el.style.cssText = `margin:14px 0 4px;border:1px solid ${C.line};border-radius:10px;padding:10px 12px;`;
    // the WHOLE answer for context: the quoted words struck through, the proposed change in orange (live as you edit it)
    const answerOf = i => String(((cfg.answers ? cfg.answers() : null) || (cfg.iv || {}).answers || [])[i] || '');
    const questionOf = i => String(((cfg.iv || {}).qs || [])[i] || '');
    function inContext(x, fixText) {
      let a = answerOf(x.q), at = a.indexOf(x.quote);
      if (at < 0) { const k = ((cfg.answers ? cfg.answers() : null) || []).findIndex(v => String(v || '').includes(x.quote)); if (k >= 0) { a = answerOf(k); at = a.indexOf(x.quote); } }
      if (at < 0) return `<div style="font-size:12px;color:${C.ink3};">(that answer has changed since this check)</div>`;
      const before = e(a.slice(0, at)), after = e(a.slice(at + x.quote.length));
      const mid = fixText == null ? `<span style="text-decoration:underline;text-decoration-color:${FLAG};text-underline-offset:3px;">${e(x.quote)}</span>`
        : `<span style="text-decoration:line-through;color:${C.ink3};">${e(x.quote)}</span> <span style="color:#ff7a00;font-weight:700;">${e(fixText)}</span>`;
      return `<div style="font-size:13px;line-height:1.5;color:${C.ink};background:${C.surf2};border-radius:8px;padding:8px 10px;margin-top:6px;">${before}${mid}${after}</div>`;
    }
    const init = () => { S.pick = {}; ((S.report || {}).items || []).forEach(x => { if (x.fix && !x.applied && /outdated|contested|wrong|mostly/.test(x.verdict)) S.pick[x.id] = true; }); };
    // a check still running on the worker (e.g. the phone dropped the long request) → keep polling until the report lands
    async function load(poll) {
      try { const r = await req(cfg.call, 'ivExpertGet', { interviewId: cfg.interviewId }); S.report = r.report || null; init();
        if (r.running) { S.busy = 'Still checking on the server — the results will appear here (about 1-2 minutes)…'; draw(); setTimeout(() => load(true), 10000); return; }
        if (poll) S.busy = ''; S.err = r.lastError || ''; } catch (err) {}
      draw(); }
    async function run() {
      if (cfg.beforeRun) { try { await cfg.beforeRun(); } catch (err) {} }
      S.busy = 'Checking every claim against the current expert standard (live search) — about 1-2 minutes…'; S.err = ''; draw();
      try { const r = await req(cfg.call, 'ivExpertCheck', { interviewId: cfg.interviewId }); S.report = r.report; S.edits = {}; init(); }
      catch (err) { if (err.server) { S.busy = ''; S.err = err.message; return draw(); }
        S.busy = 'The connection dropped — still checking on the server, the results will appear here…'; draw(); return load(true); }
      S.busy = ''; draw();
    }
    async function apply() {
      const ids = Object.keys(S.pick).filter(k => S.pick[k]); if (!ids.length) return;
      const ov = {}; ids.forEach(k => { if (S.edits[k] != null) ov[k] = S.edits[k]; });
      S.busy = 'Applying the fixes to your answers…'; draw();
      try { const r = await req(cfg.call, 'ivExpertApply', { interviewId: cfg.interviewId, ids, overrides: ov }); S.report = r.report; S.edits = {}; init(); (r.missed || []).forEach(id => { S.pick[id] = false; const it = ((S.report || {}).items || []).find(i => i.id === id); if (it) it.skipped = true; });
        S.err = '';   // operator 2026-10-24: no 'couldn't be matched' warning — a fix that can't find its words is simply skipped
        changed(); if (cfg.onApplied) cfg.onApplied(r.answers || null, r); }
      catch (err) { S.err = err.message; }
      S.busy = ''; draw();
    }
    // the quote's words appear in one of the answers (case / spacing / punctuation ignored) — same rule as the worker's matcher
    const wds = t => (String(t || '').toLowerCase().replace(/’/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}]+)?/gu) || []).join(' ');
    const inAnswers = q => { const w = wds(q); if (!w) return false; const list = (typeof cfg.answers === 'function' ? cfg.answers() : (cfg.iv || {}).answers) || []; return list.some(a => (' ' + wds(a) + ' ').includes(' ' + w + ' ')); };
    function draw() {
      const R = S.report, items = (R && R.items) || [], nPick = Object.values(S.pick).filter(Boolean).length;
      el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <b style="font-size:13px;color:${C.ink};">🔎 Expert check</b>
          ${R ? `<span style="font-size:11px;font-weight:700;padding:1px 8px;border-radius:9px;${R.status === 'Passed' ? `background:rgba(58,154,91,.15);color:${DONE};` : `background:${FLAG};color:#111;`}">Pass ${R.pass || 1} · ${e(R.status)}</span><span style="font-size:11px;color:${C.ink3};">${e(new Date(R.at).toLocaleString())}</span>` : `<span style="font-size:11px;color:${C.ink3};">your answers vs the current standard of practice in this field — and what a sophisticated buyer would trust</span>
          <button type="button" data-x="run" ${S.busy ? 'disabled' : ''} style="${BTN}margin-left:auto;">🔎 Run expert check</button>`}</div>
        ${S.busy ? `<div style="font-size:12px;color:${C.ink3};margin-top:8px;">⏳ ${e(S.busy)}</div>` : ''}
        ${S.err ? `<div style="font-size:12px;color:#c0392b;margin-top:8px;">${e(S.err)}</div>` : ''}
        ${R ? `<div style="font-size:12px;color:${C.ink2};margin:8px 0 2px;"><b>Field:</b> ${e(R.field)}</div>
          ${R.summary ? `<div style="font-size:12.5px;color:${C.ink};margin:4px 0 8px;">${e(R.summary)}</div>` : ''}
          ${items.map(x => { const v = VC[x.verdict] || ['#888', 'rgba(127,127,127,.12)'];
            return `<div style="border-top:1px solid ${C.line};padding:9px 0;">
              <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;"><span style="font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:8px;background:${v[1]};color:${v[0]};text-transform:uppercase;letter-spacing:.03em;">${e(x.verdict)}</span>
                <span style="font-size:11.5px;color:${C.ink3};flex:1;min-width:200px;">${questionOf(x.q) ? 'Q' + (x.q + 1) + ' · ' + e(questionOf(x.q)) : ''}</span></div>
              <div data-xpv="${e(x.id)}">${x.applied ? inContext({ ...x, quote: x.appliedText || x.fix }, null) : inContext(x, x.fix && x.verdict !== 'opinion' ? (S.edits[x.id] != null ? S.edits[x.id] : x.fix) : null)}</div>
              ${x.expert_view && x.verdict !== 'opinion' ? `<div style="font-size:12px;color:${C.ink2};margin-top:4px;">${e(x.expert_view)}</div>` : ''}
              ${x.market ? `<div style="font-size:12px;color:#c25e00;margin-top:4px;">⚠ Marketability: ${e(x.market)}</div>` : ''}
              ${x.level_up ? `<div style="font-size:12px;color:${C.acc};margin-top:4px;">★ A top practitioner would add: ${e(x.level_up)}</div>` : ''}
              ${(x.sources || []).length ? `<div style="font-size:11px;margin-top:4px;">${x.sources.map(sr => `<a href="${e(sr.url)}" target="_blank" rel="noopener" style="color:${C.ink3};margin-right:10px;">${e(String(sr.title || sr.url).slice(0, 70))} ↗</a>`).join('')}</div>` : ''}
              ${premAsset() ? `<div style="margin-top:5px;"><button type="button" data-x="prem" data-id="${e(x.id)}" title="Bank this argument on this asset — a Premium Take answers it later" style="${BTN}font-size:11px;${S.prem[x.id] ? 'color:#b7791f;border-color:#b7791f;' : ''}">${S.prem[x.id] ? '★ Saved for premium' : '☆ Save for premium'}</button></div>` : ''}
              ${x.applied ? `<div style="font-size:12px;color:${DONE};margin-top:5px;">✓ applied: “${e(x.appliedText || x.fix)}”</div>`
                : x.fix && (x.skipped || !inAnswers(x.quote)) ? `<div style="font-size:11.5px;color:${C.ink3};margin-top:6px;">ⓘ Skipped — its words aren't in your answer as written, so there's nothing to swap. Use it as a pointer if you want to edit your answer by hand.</div>
                  ${canHold ? `<div style="margin-top:5px;"><button type="button" data-x="holdq" data-id="${e(x.id)}" ${S.busy ? 'disabled' : ''} style="${BTN}font-size:11px;${x.heldOut ? 'color:#c0392b;border-color:#c0392b;' : ''}">${x.heldOut ? '⊘ Left out of the write-up — ↩ put it back' : '⊘ Leave this whole question out of the write-up'}</button></div>` : ''}`
                : x.fix ? `<label style="display:flex;gap:6px;align-items:flex-start;margin-top:6px;font-size:12px;color:${C.ink};"><input type="checkbox" data-xp="${e(x.id)}" ${S.pick[x.id] ? 'checked' : ''} style="margin-top:3px;">
                  <span style="flex:1;"><span style="color:${C.ink3};">Smallest fix — edit it into your own words if you like:</span>
                  <textarea data-xe="${e(x.id)}" rows="2" style="${TA}margin-top:3px;font-size:12.5px;">${e(S.edits[x.id] != null ? S.edits[x.id] : x.fix)}</textarea></span></label>` : ''}
            </div>`; }).join('')}
          ${items.some(x => x.fix && !x.applied && !x.skipped && inAnswers(x.quote)) ? `<div style="display:flex;gap:8px;align-items:center;border-top:1px solid ${C.line};padding-top:9px;">
            <span style="font-size:11.5px;color:${C.ink3};flex:1;">Applying swaps only the quoted words in your answers; your own rewrites teach 🗣 Your voice.</span>
            <button type="button" data-x="apply" ${S.busy || !nPick ? 'disabled' : ''} style="${BTN}">Apply ${nPick} fix${nPick === 1 ? '' : 'es'}</button></div>` : ''}
          ${S.done ? `<div style="font-size:12.5px;color:${DONE};margin-top:9px;">${e(S.done)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid ${C.line};padding-top:9px;margin-top:6px;">
            <span style="font-size:11.5px;color:${C.ink3};flex:1;min-width:180px;">Revised your answers? Run the next expert pass before anything is written.</span>
            <button type="button" data-x="run" ${S.busy ? 'disabled' : ''} style="${BTN}">↻ Re-run expert check (pass ${(R.pass || 1) + 1})</button>
            ${cfg.finish ? `<button type="button" data-x="finish" ${S.busy ? 'disabled' : ''} style="${BTNP}">${writeLabel()}</button>` : ''}</div>` : ''}`;
    }
    // ✓ Finish & write asset: finish the interview (host's own finish), then — for a Topical Post's interview — write the article now
    const writable = () => { const v = cfg.iv || {}; return v.scope === 'Asset' && (v.assetIds || []).length && /topical post/i.test(v.forType || ''); };
    function writeLabel() { const v = cfg.iv || {}; return writable() ? '✓ Finish & write asset' : v.scope === 'Product' ? '✓ Finish (feeds this offering)' : '✓ Finish'; }
    async function finishWrite() {
      S.busy = 'Finishing the interview…'; S.err = ''; S.done = ''; draw();
      try { await cfg.finish(); } catch (err) { S.err = err.message; S.busy = ''; return draw(); }
      const v = cfg.iv || {};
      if (writable()) {
        S.busy = 'Writing the article from your checked answers — about a minute…'; draw();
        try { const r = await req(cfg.call, 'writeTopicalPost', { assetId: v.assetIds[0] });
          S.done = r.ok ? `✓ Written — ${r.words || ''} words, the asset is at Review.` : r.needsInterview ? 'The interview isn’t finished yet — answer at least one question.' : (r.error || 'Not written'); }
        catch (err) { S.err = 'The article may still be writing on the server — check the asset in a minute. (' + err.message + ')'; }
      } else S.done = v.scope === 'Product' ? '✓ Finished — it now feeds every title and asset under this offering.' : '✓ Finished — generate the asset from its title when you’re ready.';
      S.busy = ''; changed(); draw();
    }
    // ★ premium bank (2026-10-24): the asset this interview belongs to holds the banked arguments
    S.prem = S.prem || {}; const premAsset = () => { const v = cfg.iv || {}; return v.scope === 'Asset' && (v.assetIds || [])[0] || ''; };
    if (premAsset()) req(cfg.call, 'premiumBank', { op: 'list', assetId: premAsset() }).then(r => { (r.bank || []).forEach(b => { if (b.interviewId === cfg.interviewId) S.prem[String(b.id).split(':')[0]] = true; }); draw(); }).catch(() => {});
    async function premToggle(id) { const x = ((S.report || {}).items || []).find(i => i.id === id); if (!x) return; const on = !S.prem[id]; S.prem[id] = on; draw();
      try { await req(cfg.call, 'premiumBank', on ? { op: 'add', assetId: premAsset(), interviewId: cfg.interviewId, item: { ...x, question: questionOf(x.q) } } : { op: 'remove', assetId: premAsset(), id: id + ':' + cfg.interviewId }); }
      catch (err) { S.prem[id] = !on; S.err = 'Not saved for premium: ' + err.message; draw(); } }
    // ⊘ a skipped finding's whole question can be held out of every write-up (the answer is kept) — operator 2026-10-24
    const canHold = cfg.hold !== false;   // Script Studio (client app) passes hold:false
    async function holdQ(id) { const x = ((S.report || {}).items || []).find(i => i.id === id); if (!x) return;
      S.busy = x.heldOut ? 'Putting it back…' : 'Leaving it out…'; S.err = ''; draw();
      try { const r = await req(cfg.call, 'ivExpertHoldQuestion', { interviewId: cfg.interviewId, id, on: !x.heldOut }); S.report = r.report; changed(); }
      catch (err) { S.err = err.message; }
      S.busy = ''; draw(); }
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-x]'); if (!b || S.busy) return; if (b.dataset.x === 'holdq') return holdQ(b.dataset.id); if (b.dataset.x === 'run') run(); else if (b.dataset.x === 'apply') apply(); else if (b.dataset.x === 'finish') finishWrite(); else if (b.dataset.x === 'prem') premToggle(b.dataset.id); });
    el.addEventListener('change', ev => { const t = ev.target; if (t.dataset.xp) { S.pick[t.dataset.xp] = t.checked; draw(); } });
    el.addEventListener('input', ev => { const t = ev.target; if (t.dataset.xe) { S.edits[t.dataset.xe] = t.value;
        const x = ((S.report || {}).items || []).find(i => i.id === t.dataset.xe), pv = el.querySelector(`[data-xpv="${t.dataset.xe}"]`);
        if (x && pv) pv.innerHTML = inContext(x, t.value); } ev.stopPropagation(); });
    draw(); load();
    return el;
  }

  // ── the answer modal ──
  let modal = null;
  function open(cfg) {
    if (modal) modal.remove();
    const S = { iv: null, answers: [], dirty: false, busy: 'Loading…', err: '', saved: '', timer: null, inflight: false };
    // AUTOSAVE (2026-10-24): every keystroke is kept in this browser right away (localStorage draft), and saved to Notion
    // 2 s after typing stops — without redrawing, so the cursor never jumps. A draft newer than Notion is restored on reopen.
    const dKey = () => 'ivdraft:' + (cfg.interviewId || (S.iv && S.iv.id) || '');
    const putDraft = () => { try { localStorage.setItem(dKey(), JSON.stringify({ answers: S.answers, at: Date.now() })); } catch (e) {} };
    const dropDraft = () => { try { localStorage.removeItem(dKey()); } catch (e) {} };
    const mark = t => { S.saved = t; const el = box && box.querySelector('[data-autosave]'); if (el) el.textContent = t; };
    async function autosave() {
      if (!S.iv || !S.dirty || S.busy) return; if (S.inflight) { clearTimeout(S.timer); S.timer = setTimeout(autosave, 1500); return; }
      S.inflight = true; const sent = S.answers.slice(); mark('Saving…');
      try { const r = await req(cfg.call, 'saveInterview', { interviewId: S.iv.id, answers: sent, finish: false });
        S.iv = Object.assign(S.iv, { status: r.interview.status, updatedAt: r.interview.updatedAt });
        if (JSON.stringify(sent) === JSON.stringify(S.answers)) { S.dirty = false; dropDraft(); }   // typed more meanwhile → stays dirty, saves again
        mark('✓ Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })); changed(); }
      catch (err) { mark('⚠ Not saved yet — kept in this browser (' + err.message + ')'); }
      S.inflight = false; if (S.dirty) { clearTimeout(S.timer); S.timer = setTimeout(autosave, 3000); }
    }
    const onHide = () => { if (S.dirty) { putDraft(); autosave(); } };
    window.addEventListener('beforeunload', onHide); document.addEventListener('visibilitychange', onHide);
    modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 12px;';
    document.body.appendChild(modal);
    const box = document.createElement('div');
    box.style.cssText = `width:min(760px,100%);background:var(--bg, ${'#fff'});color:${C.ink};border:1px solid ${C.line};border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);`;
    modal.appendChild(box);
    const close = async () => { clearTimeout(S.timer); if (S.dirty && S.iv) { putDraft(); await save(false).catch(() => {}); if (!S.err) dropDraft(); } if (modal) { modal.remove(); modal = null; } document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onHide); document.removeEventListener('visibilitychange', onHide); };
    const onKey = ev => { if (ev.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // a stray click outside the box used to close it — only ✕ / Esc close now, and both save first (2026-10-24)
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
            ${reuseBadge(iv,i)}<textarea data-a="${i}" rows="3" placeholder="Type it the way you'd say it…" style="${TA}">${e(S.answers[i] || '')}</textarea></div>`).join('')}
        ${iv ? '<div data-xhost></div>' : ''}
        ${iv ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid ${C.line};padding-top:10px;">
            <span style="font-size:11.5px;color:${C.ink3};flex:1;min-width:180px;">${S.busy ? '⏳ ' + e(S.busy) : `${S.answers.filter(a => (a || '').trim()).length}/${iv.qs.length} answered · skip any question that doesn't apply`} · <span data-autosave style="color:${C.ink2};">${e(S.saved || 'autosaves as you type')}</span></span>
            ${iv.url ? `<a href="${e(iv.url)}" target="_blank" rel="noopener" style="${BTN}text-decoration:none;">Notion ↗</a>` : ''}
            <button data-m="remove" style="${BTN}color:#c0392b;">🗑 Remove</button>
            ${iv.status === 'Finished' ? `<button data-m="reflag" style="${BTN}">↩ Flag again</button>` : ''}
            <button data-m="save" style="${BTN}">💾 Save draft</button>
            <button data-m="finish" style="${BTNP}">✓ ${iv.status === 'Finished' ? 'Save' : 'Finish'}</button></div>` : ''}`;
      const xh = box.querySelector('[data-xhost]');
      if (xh && iv) { S.xEl = S.xEl || expert({ call: cfg.call, interviewId: iv.id, iv, answers: () => S.answers, beforeRun: () => S.dirty ? save(false) : null,
        finish: async () => { if (!S.answers.some(a => (a || '').trim())) throw new Error('Answer at least one question first.'); await save(true); if (S.err) throw new Error(S.err); },
        onApplied: answers => { if (answers) { S.answers = answers.slice(); S.iv.answers = answers.slice(); S.dirty = false; draw(); } } }); xh.appendChild(S.xEl); }
    }
    async function save(finish, extra) {
      S.busy = finish ? 'Saving + teaching your voice…' : 'Saving…'; draw();
      try { const r = await req(cfg.call, 'saveInterview', Object.assign({ interviewId: S.iv.id, answers: S.answers, finish }, extra || {})); S.iv = r.interview; S.answers = r.interview.answers.slice(); S.dirty = false; S.err = ''; dropDraft(); S.saved = '✓ Saved'; changed(); if (cfg.onDone) cfg.onDone(r.interview); }
      catch (err) { S.err = err.message; }
      S.busy = ''; if (modal) draw();
    }
    box.addEventListener('input', ev => { const t = ev.target; if (t.dataset.a != null) { S.answers[+t.dataset.a] = t.value; S.dirty = true; putDraft(); mark('Unsaved changes…'); clearTimeout(S.timer); S.timer = setTimeout(autosave, 2000); } });
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
    // a busy moment at Notion never stops the interview from opening: retry the load a few times (2026-10-24)
    const loadIv = n => req(cfg.call, 'getInterview', { interviewId: cfg.interviewId }).catch(err => { if (n >= 3) throw err; S.busy = 'Loading… (Notion is busy, retrying)'; draw(); return new Promise(ok => setTimeout(ok, 2000 * (n + 1))).then(() => loadIv(n + 1)); });
    loadIv(0).then(r => { S.iv = r.interview; S.answers = r.interview.answers.slice(); S.busy = '';
        let d = null; try { d = JSON.parse(localStorage.getItem(dKey()) || 'null'); } catch (e) {}
        if (d && Array.isArray(d.answers) && JSON.stringify(d.answers) !== JSON.stringify(S.answers) && d.answers.some((a, i) => String(a || '').trim() && String(a || '') !== String(S.answers[i] || ''))) {
          S.answers = S.iv.qs.map((q, i) => String(d.answers[i] || '').trim() ? d.answers[i] : (S.answers[i] || '')); S.dirty = true; S.saved = '↺ Restored unsaved answers from this browser — saving…'; setTimeout(autosave, 500); }
        else if (d) dropDraft();
        draw(); })
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
  window.InterviewPanel = { list, open, request, expert, onChange: f => listeners.add(f) };
})();
