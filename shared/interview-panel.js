// ══════════════════════ 🎤 INTERVIEWS (shared) — 2026-10-10 ══════════════════════
// Your own answers — ONE per product (main offering), flowing to every title + asset under it, plus an asset's OWN
// interview when it needs one (🎤 Request interview inside the asset). Notion 🎤 Interviews DB; worker getInterviews / getInterview /
// createInterviews / saveInterview / removeInterview). Status: Flagged (waiting for your answers) · Finished.
// A Finished interview feeds every writer for that title AND the voice engine (🗣 Your voice), so it sits next to
// the voice card in the shared Design panel. All Output rows and the ⚑ flag panels open the same modal.
//   InterviewPanel.list({ call, campaignId })   → an element listing the hub's interviews (cached per hub)
//   InterviewPanel.open({ call, interviewId, onDone? })   → the answer modal
//     + mount: an element → drawn inside it instead of as a modal (the dash writer's 🎤 Interview tab); noWrite: Finish never writes the asset
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
    // simplified (operator 2026-11-25): per finding — verdict in plain words · the exact part of the answer highlighted · why · a rewrite (or keep
    // as is) in a text box · in flow / out of flow / ★ premium (premium stays in flow and is tagged). Nothing is ever "skipped": a rewrite that
    // can't be placed leaves the answer as it is, still part of the answer.
    const init = () => { S.pick = {}; S.choice = {}; S.local = S.local || {}; ((S.report || {}).items || []).forEach(x => { S.choice[x.id] = x.fix && !x.applied && /outdated|contested|wrong|mostly/.test(x.verdict) ? 'rewrite' : 'keep'; }); };
    const LBL = { 'wrong': 'Wrong', 'outdated': 'Outdated', 'contested': 'Debated', 'mostly current': 'Mostly right', 'current': 'Right', 'opinion': 'Your opinion' };
    // where the quoted words are: word for word → the same words ignoring case / punctuation → the sentence sharing most of its words (at least half)
    function locate(x) { const list = (cfg.answers ? cfg.answers() : null) || (cfg.iv || {}).answers || [];
      const order = [x.q, ...list.map((_, i) => i).filter(i => i !== x.q)].filter(i => i != null && list[i]);
      for (const i of order) { const at = String(list[i]).indexOf(x.quote); if (x.quote && at >= 0) return { i, at, len: x.quote.length }; }
      const W = wds(x.quote).split(' ').filter(Boolean); if (!W.length) return null;
      for (const i of order) { const a = String(list[i]), re = /[^.!?\n]+[.!?]*/g; let m, best = null;
        while ((m = re.exec(a))) { const sw = new Set(wds(m[0]).split(' ')), hit = W.filter(w => sw.has(w)).length / W.length; if (hit >= 0.5 && (!best || hit > best.hit)) best = { i, at: m.index, len: m[0].length, hit }; }
        if (best) return best; }
      return null; }
    function view(x) { const L = locate(x), rw = S.edits[x.id] != null ? S.edits[x.id] : (x.fix || ''), useRw = S.choice[x.id] === 'rewrite' && rw && !x.applied && !S.local[x.id];
      if (!L) return `<div style="font-size:13px;line-height:1.5;color:${C.ink};background:${C.surf2};border-radius:8px;padding:8px 10px;margin-top:6px;">It said: “${e(x.quote)}”<div style="font-size:11.5px;color:${C.ink3};margin-top:3px;">(your answer has changed since the check — it stays as you wrote it)</div></div>`;
      const a = answerOf(L.i), part = a.slice(L.at, L.at + L.len);
      const mid = useRw ? `<span style="text-decoration:line-through;color:${C.ink3};">${e(part)}</span> <span style="color:#ff7a00;font-weight:700;">${e(rw)}</span>`
        : `<mark style="background:rgba(250,204,21,.45);color:inherit;border-radius:2px;padding:0 1px;">${e(part)}</mark>`;
      return `<div style="font-size:13px;line-height:1.5;color:${C.ink};background:${C.surf2};border-radius:8px;padding:8px 10px;margin-top:6px;">${L.i !== x.q ? `<div style="font-size:11px;color:${C.ink3};">(in your answer to Q${L.i + 1})</div>` : ''}${e(a.slice(0, L.at))}${mid}${e(a.slice(L.at + L.len))}</div>`; }
    // a check still running on the worker (e.g. the phone dropped the long request) → keep polling until the report lands
    // 💾 draft (operator 2026-11-25: "save both as draft"): your choices + edited rewrites, kept on the server without applying anything
    async function loadDraft() { try { const r = await req(cfg.call, 'ivExpertDraft', { interviewId: cfg.interviewId, op: 'get' }); const d = r.draft; const R = S.report;
        if (!d || !R || (R.at && d.at && d.at < R.at)) return; const ids = new Set((R.items || []).map(x => x.id));
        Object.entries(d.choice || {}).forEach(([k, v]) => { if (ids.has(k)) S.choice[k] = v; }); Object.entries(d.edits || {}).forEach(([k, v]) => { if (ids.has(k)) S.edits[k] = v; });
        S.draftAt = d.at; draw(); } catch (err) {} }
    async function saveDraft(quiet, skipAnswers) {
      if (cfg.saveAnswers && !skipAnswers) { try { await cfg.saveAnswers(); } catch (err) {} }
      if (!S.report) return; try { await req(cfg.call, 'ivExpertDraft', { interviewId: cfg.interviewId, op: 'save', draft: { choice: S.choice || {}, edits: S.edits || {} } });
        S.draftAt = new Date().toISOString(); if (!quiet) S.done = '💾 Draft saved — your answers and your expert-check choices (nothing applied yet).'; S.err = ''; }
      catch (err) { S.err = 'Draft not saved: ' + err.message; } draw(); }
    el.saveDraft = saveDraft;
    async function load(poll) {
      try { const r = await req(cfg.call, 'ivExpertGet', { interviewId: cfg.interviewId }); S.report = r.report || null; init(); if (S.report && !poll) loadDraft();
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
    async function applyChoices() {
      const items = (S.report || {}).items || [], todo = items.filter(x => !x.applied && !S.local[x.id] && S.choice[x.id] === 'rewrite'); if (!todo.length) return;
      const ids = todo.map(x => x.id), ov = {}; todo.forEach(x => { ov[x.id] = S.edits[x.id] != null ? S.edits[x.id] : (x.fix || ''); });
      S.busy = 'Saving your choices…'; S.err = ''; draw(); let missed = ids;
      try { const r = await req(cfg.call, 'ivExpertApply', { interviewId: cfg.interviewId, ids, overrides: ov }); S.report = r.report || S.report; missed = r.missed || []; if (cfg.onApplied) cfg.onApplied(r.answers || null, r); }
      catch (err) { if (err.server === undefined) { S.busy = ''; S.err = err.message; return draw(); } }
      let n = ids.length - missed.length, kept = 0;
      for (const id of missed) { const x = items.find(i => i.id === id); const L = x && locate(x), t = L && answerBox(L.i), text = String(ov[id] || '').trim();
        if (L && t && text) { t.value = t.value.slice(0, L.at) + text + t.value.slice(L.at + L.len); t.dispatchEvent(new Event('input', { bubbles: true })); S.local[id] = 'rewritten'; n++; }
        else { S.local[id] = 'kept'; kept++; } }
      ids.filter(id => !missed.includes(id)).forEach(id => { S.local[id] = 'rewritten'; });
      S.done = `✓ ${n} rewritten${kept ? ` · ${kept} left as is (still part of your answer)` : ''}. Re-run the check if you'd like a second look.`; S.busy = ''; changed(); draw();
    }
    async function flowSet(id, mode) { const x = ((S.report || {}).items || []).find(i => i.id === id); if (!x) return;
      if ((mode === 'out') !== !!x.heldOut) await holdQ(id);
      if (premAsset() && (mode === 'prem') !== !!S.prem[id]) await premToggle(id); }
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
          ${items.map(x => { const v = VC[x.verdict] || ['#888', 'rgba(127,127,127,.12)'], ch = S.choice[x.id] || 'keep', out = !!x.heldOut, prem = !!S.prem[x.id];
            const rw = S.edits[x.id] != null ? S.edits[x.id] : (x.fix || x.quote || ''), done = x.applied ? 'rewritten' : S.local[x.id];
            const seg = (on, xv, val, label, tip) => `<button type="button" data-x="${xv}" data-id="${e(x.id)}" data-v="${val}" title="${tip || ''}" ${S.busy ? 'disabled' : ''} style="${BTN}font-size:11.5px;${on ? 'background:' + C.ink + ';color:' + C.surf + ';border-color:' + C.ink + ';' : ''}">${label}</button>`;
            return `<div style="border-top:1px solid ${C.line};padding:11px 0;">
              <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;"><span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:${v[1]};color:${v[0]};text-transform:uppercase;letter-spacing:.03em;">${e(LBL[x.verdict] || x.verdict)}</span>
                <span style="font-size:11.5px;color:${C.ink3};flex:1;min-width:200px;">${questionOf(x.q) ? 'Q' + (x.q + 1) + ' · ' + e(questionOf(x.q)) : ''}</span></div>
              <div data-xpv="${e(x.id)}">${view(x)}</div>
              <div style="font-size:12.5px;color:${C.ink2};margin-top:6px;">${x.verdict === 'opinion' ? 'Your view — it stays yours.' : e(x.expert_view || '')}</div>
              ${x.market ? `<div style="font-size:12px;color:#c25e00;margin-top:4px;">⚠ How a buyer would read it: ${e(x.market)}</div>` : ''}
              ${x.level_up ? `<div style="font-size:12px;color:${C.acc};margin-top:4px;">★ A top practitioner would add: ${e(x.level_up)}</div>` : ''}
              ${(x.sources || []).length ? `<div style="font-size:11px;margin-top:4px;">${x.sources.map(sr => `<a href="${e(sr.url)}" target="_blank" rel="noopener" style="color:${C.ink3};margin-right:10px;">${e(String(sr.title || sr.url).slice(0, 70))} ↗</a>`).join('')}</div>` : ''}
              ${done ? `<div style="font-size:12px;color:${done === 'kept' ? C.ink3 : DONE};margin-top:6px;">${done === 'kept' ? 'Left as is — still part of your answer.' : '✓ Rewritten in your answer.'}</div>`
                : `<div style="font-size:11.5px;color:${C.ink3};margin-top:8px;">Rewrite (edit it into your own words):</div>
              <textarea data-xe="${e(x.id)}" rows="2" style="${TA}margin-top:3px;font-size:12.5px;">${e(rw)}</textarea>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:5px;">${seg(ch === 'rewrite', 'ch', 'rewrite', '✓ Use rewrite')}${seg(ch === 'keep', 'ch', 'keep', 'Keep as is')}</div>`}
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;"><span style="font-size:11px;color:${C.ink3};">Flow:</span>
                ${seg(!out && !prem, 'flow', 'in', 'In flow', 'Used when the asset is written')}${canHold ? seg(out, 'flow', 'out', 'Out of flow', 'This whole answer (Q' + (x.q + 1) + ') is kept but not used in the write-up') : ''}${premAsset() ? seg(prem && !out, 'flow', 'prem', '★ Premium', 'Stays in flow AND is tagged for a premium offer') : ''}</div>
            </div>`; }).join('')}
          ${items.some(x => !x.applied && !S.local[x.id] && S.choice[x.id] === 'rewrite') ? `<div style="display:flex;gap:8px;align-items:center;border-top:1px solid ${C.line};padding-top:9px;">
            <span style="font-size:11.5px;color:${C.ink3};flex:1;">Puts each "Use rewrite" into your answer. Anything that can't be placed stays as you wrote it.</span>
            <button type="button" data-x="apply2" ${S.busy ? 'disabled' : ''} style="${BTNP}">Save my choices</button></div>` : ''}
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;"><span style="font-size:11.5px;color:${C.ink3};flex:1;">${S.draftAt ? 'Draft saved ' + e(new Date(S.draftAt).toLocaleString()) : 'Not ready to apply? Save your answers and these choices as a draft.'}</span>
            <button type="button" data-x="draft" ${S.busy ? 'disabled' : ''} style="${BTN}">💾 Save as draft</button></div>
          ${S.done ? `<div style="font-size:12.5px;color:${DONE};margin-top:9px;">${e(S.done)}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid ${C.line};padding-top:9px;margin-top:6px;">
            <span style="font-size:11.5px;color:${C.ink3};flex:1;min-width:180px;">Revised your answers? Run the next expert pass before anything is written.</span>
            <button type="button" data-x="run" ${S.busy ? 'disabled' : ''} style="${BTN}">↻ Re-run expert check (pass ${(R.pass || 1) + 1})</button>
            ${cfg.finish ? `<button type="button" data-x="finish" ${S.busy ? 'disabled' : ''} style="${BTNP}">${writeLabel()}</button>` : ''}</div>` : ''}`;
    }
    // ✓ Finish & write asset: finish the interview (host's own finish), then — for a Topical Post's interview — write the article now
    const writable = () => { const v = cfg.iv || {}; return !cfg.noWrite && v.scope === 'Asset' && (v.assetIds || []).length && /topical post/i.test(v.forType || ''); };
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
    // the answer box for question q, in the panel this expert check sits in
    const answerBox = q => { let p = el; while (p && !(p.querySelector && p.querySelector('textarea[data-a="' + q + '"]'))) p = p.parentElement; return p ? p.querySelector('textarea[data-a="' + q + '"]') : null; };
    const editQ = (q, add) => { const t = answerBox(q); if (!t) { S.err = 'Open the answers above to edit Q' + ((+q) + 1); draw(); return; }
      if (add) { const f = String(add).trim(); if (f) { t.value = t.value.replace(/\s+$/, '') + (t.value.trim() ? '\n\n' : '') + f; t.dispatchEvent(new Event('input', { bubbles: true }));
        S.done = 'Added to Q' + ((+q) + 1) + ' — it saves on its own. Re-run the expert check when you are done.'; draw(); } }
      t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => t.focus(), 350); };
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-x]'); if (!b || S.busy) return; if (b.dataset.x === 'holdq') return holdQ(b.dataset.id);
      if (b.dataset.x === 'editq') return editQ(b.dataset.q);
      if (b.dataset.x === 'ch') { S.choice[b.dataset.id] = b.dataset.v; return draw(); }
      if (b.dataset.x === 'flow') return flowSet(b.dataset.id, b.dataset.v);
      if (b.dataset.x === 'apply2') return applyChoices();
      if (b.dataset.x === 'draft') return saveDraft();
      if (b.dataset.x === 'addq') { const x = (((S.report || {}).items) || []).find(y => y.id === b.dataset.id) || {}; return editQ(b.dataset.q, S.edits[b.dataset.id] != null ? S.edits[b.dataset.id] : x.fix); } if (b.dataset.x === 'run') run(); else if (b.dataset.x === 'apply') apply(); else if (b.dataset.x === 'finish') finishWrite(); else if (b.dataset.x === 'prem') premToggle(b.dataset.id); });
    el.addEventListener('change', ev => { const t = ev.target; if (t.dataset.xp) { S.pick[t.dataset.xp] = t.checked; draw(); } });
    el.addEventListener('input', ev => { const t = ev.target; if (t.dataset.xe) { S.edits[t.dataset.xe] = t.value; if (S.choice) S.choice[t.dataset.xe] = 'rewrite';
        const x = ((S.report || {}).items || []).find(i => i.id === t.dataset.xe), pv = el.querySelector(`[data-xpv="${t.dataset.xe}"]`);
        if (x && pv) pv.innerHTML = view(x); } ev.stopPropagation(); });
    draw(); load();
    return el;
  }

  // ── the answer modal ──
  let modal = null;
  function open(cfg) {
    const M = cfg.mount || null;   // inline: no overlay, no Esc, Finish keeps it on screen
    if (modal && !M) modal.remove();
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
    const host = document.createElement('div');
    if (M) { M.innerHTML = ''; M.appendChild(host); }
    else { modal = host; modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:30px 12px;'; document.body.appendChild(modal); }
    const box = document.createElement('div');
    box.style.cssText = `width:min(760px,100%);background:var(--bg, ${'#fff'});color:${C.ink};border:1px solid ${C.line};border-radius:12px;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.35);`;
    if (M) box.style.cssText = `background:transparent;color:${C.ink};`;
    host.appendChild(box);
    const close = async () => { clearTimeout(S.timer); if (S.dirty && S.iv) { putDraft(); await save(false).catch(() => {}); if (!S.err) dropDraft(); } if (M) host.remove(); else if (modal) { modal.remove(); modal = null; } document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onHide); document.removeEventListener('visibilitychange', onHide); };
    const onKey = ev => { if (ev.key === 'Escape') close(); };
    if (!M) document.addEventListener('keydown', onKey);
    // a stray click outside the box used to close it — only ✕ / Esc close now, and both save first (2026-10-24)
    function draw() {
      const iv = S.iv;
      box.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
          <div style="flex:1;"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.ink3};">🎤 Interview${iv ? ' · ' + e(iv.angle || '') : ''}</div>
            <div style="font-size:16px;font-weight:700;margin-top:2px;">${iv ? e(iv.title) : ''}</div>
            ${iv && iv.why ? `<div style="font-size:12px;color:${C.ink2};margin-top:3px;">${e(iv.why)}</div>` : ''}</div>
          ${iv ? pill(iv.status) : ''}${M ? '' : `<button data-m="close" style="${BTN}">✕</button>`}</div>
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
      if (xh && iv) { S.xEl = S.xEl || expert({ call: cfg.call, interviewId: iv.id, iv, answers: () => S.answers, beforeRun: () => S.dirty ? save(false) : null, saveAnswers: () => S.dirty ? save(false) : null,
        finish: async () => { if (!S.answers.some(a => (a || '').trim())) throw new Error('Answer at least one question first.'); await save(true); if (S.err) throw new Error(S.err); },
        noWrite: cfg.noWrite, onApplied: answers => { if (answers) { S.answers = answers.slice(); S.iv.answers = answers.slice(); S.dirty = false; draw(); } } }); xh.appendChild(S.xEl); }
    }
    async function save(finish, extra) {
      S.busy = finish ? 'Saving + teaching your voice…' : 'Saving…'; draw();
      try { const r = await req(cfg.call, 'saveInterview', Object.assign({ interviewId: S.iv.id, answers: S.answers, finish }, extra || {})); S.iv = r.interview; S.answers = r.interview.answers.slice(); S.dirty = false; S.err = ''; dropDraft(); S.saved = '✓ Saved'; changed(); if (cfg.onDone) cfg.onDone(r.interview); }
      catch (err) { S.err = err.message; }
      S.busy = ''; if (M || modal) draw();
    }
    box.addEventListener('input', ev => { const t = ev.target; if (t.dataset.a != null) { S.answers[+t.dataset.a] = t.value; S.dirty = true; putDraft(); mark('Unsaved changes…'); clearTimeout(S.timer); S.timer = setTimeout(autosave, 2000); } });
    box.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-m]'); if (!b || S.busy) return;
      const m = b.dataset.m;
      if (m === 'close') close();
      else if (m === 'save') { save(false); if (S.xEl && S.xEl.saveDraft) S.xEl.saveDraft(true, true); }
      else if (m === 'finish') { if (!S.answers.some(a => (a || '').trim())) { S.err = 'Answer at least one question to finish.'; draw(); return; } await save(true); if (!S.err && !M) close(); }
      else if (m === 'reflag') save(false, { reflag: true });
      else if (m === 'remove') { if (!confirm('Remove this interview?')) return; S.busy = 'Removing…'; draw();
        try { await req(cfg.call, 'removeInterview', { interviewId: S.iv.id }); S.dirty = false; changed(); if (cfg.onDone) cfg.onDone(null); close(); if (cfg.onClose) cfg.onClose(); } catch (err) { S.err = err.message; S.busy = ''; draw(); } }
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
  window.InterviewPanel = { list, open, request, expert, onChange: f => listeners.add(f), version: 2 };
})();
