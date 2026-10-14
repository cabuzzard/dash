// Independent Codex Design workspace for Content Hubs.
// This intentionally does not replace or modify shared/design-panel.js.
// It reads/writes the same designSpec contract so approved work remains the campaign system of record.
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const C = { ink: 'var(--text)', ink2: 'var(--text2)', ink3: 'var(--text3)', line: 'var(--border2)', surf: 'var(--surface)', surf2: 'var(--surface2)', acc: 'var(--accent)', ok: '#4ade80', stage: '#f6ad55', bad: '#ef6b6b' };
  const btn = `font-size:11px;padding:5px 10px;border:1px solid ${C.line};border-radius:6px;background:${C.surf2};color:${C.ink};cursor:pointer;`;
  const primary = `font-size:11px;padding:5px 10px;border:1px solid ${C.acc};border-radius:6px;background:${C.acc};color:var(--bg);font-weight:700;cursor:pointer;`;
  const input = `width:100%;box-sizing:border-box;padding:7px 8px;border:1px solid ${C.line};border-radius:6px;background:${C.surf};color:${C.ink};font:12px/1.45 inherit;`;
  const GROUPS = [
    { id: 'direction', name: '1 · Site direction & guidance', note: 'Audience, positioning, page purpose, layout, components and motion.', match: s => ['intent', 'layout', 'components', 'content', 'motion'].includes(s.id) },
    { id: 'colors', name: '2 · Colors', note: 'A complete accessible palette with exact roles—not just a mood palette.', match: s => s.id === 'color' },
    { id: 'typography', name: '3 · Typography', note: 'Families, hierarchy, scale, spacing, emphasis and overlay typography.', match: s => s.id === 'type' },
    { id: 'motif', name: '4 · Visual imagery & motif', note: 'The recurring visual signature, photography/illustration rules and approved reference recipe.', match: s => ['imagery', 'reference', 'avoid'].includes(s.id) },
    { id: 'assets', name: '5 · Asset image backgrounds & layouts', note: 'Blank text zones, safe areas, aspect ratios and repeatable layouts for every social and thumbnail format.', match: s => s.id === 'overlay' || s.tier === 'asset' },
  ];
  const TOKEN_MAP = [['bg','color.bg'],['surface','color.surface'],['ink','color.ink'],['ink-head','color.ink_head'],['ink-soft','color.ink_soft'],['line','color.line'],['sea','color.primary'],['deep','color.deep'],['deep-ink','color.deep_ink'],['accent','color.accent']];
  const hex = v => ((String(v || '').match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i) || [])[0] || '').toUpperCase();
  const font = v => String(v || '').split(/[,(;·]| — | - /)[0].replace(/["']/g, '').trim();

  function mount(root, cfg) {
    const S = { schema: [], saved: {}, staged: {}, inputs: {}, mainKeywords: '', group: 'direction', note: '', reply: '', busy: '', msg: '', kind: '', edit: null, libName: '', libRole: 'brand-guide', libNotes: '', testThumb: null };
    const call = async (op, body) => { const r = await cfg.call('designSpec', Object.assign({ campaignId: cfg.campaignId, op }, body || {})); if (r && r.error) throw new Error(r.error); return r || {}; };
    const take = r => { if (r.schema) S.schema = r.schema; if ('saved' in r) S.saved = r.saved || {}; if (r.staged) S.staged = r.staged; if (r.inputs) S.inputs = r.inputs; if ('mainKeywords' in r) S.mainKeywords = r.mainKeywords || ''; };
    const group = () => GROUPS.find(g => g.id === S.group) || GROUPS[0];
    const sections = g => S.schema.filter(g.match);
    const keys = g => sections(g).flatMap(s => s.fields.map(f => f[0]));
    const changed = k => ((S.staged[k] || {}).v || '') !== ((S.saved[k] || {}).v || '');
    const changedKeys = g => keys(g).filter(changed);
    const say = (m, kind) => { S.msg = m || ''; S.kind = kind || ''; render(); };
    const palette = () => { const p = {}; for (const [role, k] of TOKEN_MAP) { const h = hex((S.staged[k] || {}).v); if (!h) return null; p[role] = h; } return p; };
    const fonts = () => { const display = font((S.staged['type.display_font'] || {}).v), body = font((S.staged['type.body_font'] || {}).v), mono = font((S.staged['type.label_font'] || {}).v); return display && body ? { display, body, mono: mono || body } : null; };

    async function load() { S.busy = 'Loading the campaign design system…'; render(); try { take(await call('get')); S.busy = ''; render(); } catch (e) { S.busy = ''; say('Could not load: ' + e.message, 'bad'); } }
    async function copyPrompt() {
      S.busy = 'Building the ChatGPT design prompt…'; render();
      try {
        const g = group(), r = await call('chatPrompt', { only: keys(g), note: `${S.note || ''}\nWork only on ${g.name}. Return every requested field in the exact JSON format. Treat uploaded/reference imagery as evidence for a reusable motif, not as an image to copy literally.`.trim() });
        await navigator.clipboard.writeText(r.prompt); S.busy = ''; say(`${g.name}: prompt copied. It already contains links and roles for every saved hub brand guide and catalog image. Paste it into ChatGPT, then paste the complete JSON return below.`, 'ok');
      } catch (e) { S.busy = ''; say('Could not copy the prompt: ' + e.message, 'bad'); }
    }
    async function stageReply() {
      if (!S.reply.trim()) return say('Paste ChatGPT’s complete JSON return first.', 'bad');
      S.busy = 'Codex is validating and staging the returned fields…'; render();
      try { const g = group(), r = await call('chatReply', { text: S.reply, only: keys(g) }); take(r); S.reply = ''; S.busy = ''; pushPreview(); say(`${(r.applied || []).length} fields validated and staged. The hub preview now shows the staged colors and typography; review every orange field before committing.`, 'ok'); }
      catch (e) { S.busy = ''; say('Nothing was staged: ' + e.message, 'bad'); }
    }
    async function saveGroup() { const g = group(), ks = changedKeys(g); if (!ks.length) return say('There are no staged changes in this section.', 'ok'); S.busy = 'Committing this section to the design database…'; render(); try { const r = await call('save', { keys: ks }); take(r); S.busy = ''; if (cfg.onSaved) cfg.onSaved(r); say(`${ks.length} approved fields committed${r.notionError ? '; database mirror warning: ' + r.notionError : ' to the campaign design system.'}`, r.notionError ? 'bad' : 'ok'); } catch (e) { S.busy = ''; say('Commit failed: ' + e.message, 'bad'); } }
    async function revertGroup() { const g = group(); try { take(await call('revert', { keys: keys(g) })); say(`${g.name} reverted to its saved values.`, 'ok'); } catch (e) { say('Revert failed: ' + e.message, 'bad'); } }
    async function edit(k, v) { try { take(await call('edit', { key: k, v })); S.edit = null; say(`${k} staged.`, 'ok'); } catch (e) { say('Edit failed: ' + e.message, 'bad'); } }
    async function uploadPhoto(file) {
      if (!file) return; S.busy = 'Uploading the reference image…'; render();
      try { const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }); take(await call('photo', { data })); S.busy = ''; say('Reference image stored. Include it when you use the copied prompt in ChatGPT.', 'ok'); }
      catch (e) { S.busy = ''; say('Image upload failed: ' + e.message, 'bad'); }
    }
    async function uploadLibrary(file) {
      if (!file) return; S.busy = 'Adding the image to the saved hub reference library…'; render();
      try { const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        take(await call('library', { data, name: S.libName || file.name.replace(/\.[^.]+$/, ''), role: S.libRole, notes: S.libNotes })); S.libName = ''; S.libNotes = ''; S.busy = ''; say('Saved to the hub library. Every future design prompt will consult it automatically.', 'ok'); }
      catch (e) { S.busy = ''; say('Library upload failed: ' + e.message, 'bad'); }
    }
    async function removeLibrary(id) { try { take(await call('library', { remove: id })); say('Removed from the saved hub reference library.', 'ok'); } catch (e) { say('Could not remove it: ' + e.message, 'bad'); } }
    function pushPreview() { const p = palette(), f = fonts(); if (cfg.preview && (p || f)) cfg.preview({ palette: p, fonts: f, css: ' ' }); return { p, f }; }
    function preview() { const x = pushPreview(); say(x.p || x.f ? 'Staged colors and typography are previewing in the hub rail. Imagery and asset-layout changes are shown as staged specifications below until assets are generated.' : 'Complete the color or typography fields before previewing them.', x.p || x.f ? 'ok' : 'bad'); }
    async function testThumbnail() {
      const lines = Object.entries(S.staged || {}).filter(([k, f]) => f && f.v && (/^(color|type|img|ref|ovl|avoid)\./.test(k) || k.startsWith('asset.youtube_thumb.') || k.startsWith('asset.blog_thumb.'))).map(([k, f]) => `${k}: ${f.v}${f.why ? ' — ' + f.why : ''}`);
      if (!lines.length) return say('Stage the imagery and thumbnail fields first.', 'bad');
      S.busy = 'Generating a 16:9 thumbnail from the staged values…'; S.thumbStarted = Date.now(); render();
      try {
        const r = await cfg.call('renderSpecTest', { campaignId: cfg.campaignId, spec: lines.join('\n'), palette: palette() || undefined, aspect: '16:9',
          guidance: `Create a wordless YouTube/blog thumbnail test for this campaign. Obey the staged visual motif and asset.youtube_thumb.* fields. Leave the specified text zone visibly clean, but do not render any words, letters, logos or numbers. This is a visual-system test, not a final published thumbnail.${S.note ? ' Current operator direction: ' + S.note : ''}` });
        if (r && r.error) throw new Error(r.error); S.testThumb = { url: r.imageUrl, prompt: r.prompt || '', at: Date.now() }; S.busy = ''; S.thumbStarted = null; say('✓ Test thumbnail generated from the staged values. Judge the warmth, motif, composition and text-safe area before committing.', 'ok');
      } catch (e) { S.busy = ''; S.thumbStarted = null; say('✕ Thumbnail test failed: ' + e.message, 'bad'); }
    }
    async function approveTestThumbnail() {
      if (!S.testThumb || !/^https:\/\//.test(S.testThumb.url || '')) return say('Generate a test thumbnail first.', 'bad');
      S.busy = 'Adding the staged thumbnail to the hub Spec Images library…'; render();
      try {
        const stamp = new Date(S.testThumb.at || Date.now()).toLocaleDateString();
        take(await call('library', { url: S.testThumb.url, name: `Approved staged thumbnail — ${stamp}`, role: 'approved-example', notes: `Approved visual-system test generated from staged ${group().name} values. Use as a look, motif, palette and finish reference; do not copy its exact scene.${S.testThumb.prompt ? ' Generation prompt: ' + S.testThumb.prompt.slice(0, 320) : ''}` }));
        S.busy = ''; say('✓ Added to this hub’s Spec Images library. Future asset-modal background generations will consult it with the committed design rules.', 'ok');
      } catch (e) { S.busy = ''; say('Could not add the thumbnail to Spec Images: ' + e.message, 'bad'); }
    }

    function fieldRow(k, label, hint) {
      const a = S.staged[k] || {}, b = S.saved[k] || {}, diff = changed(k), editing = S.edit === k;
      return `<div style="display:grid;grid-template-columns:minmax(145px,28%) 1fr;gap:10px;padding:7px 8px;border-top:1px solid ${C.line};${diff ? `border-left:4px solid ${C.stage};background:rgba(246,173,85,.07);` : ''}">
        <div style="font-size:11px;color:${C.ink2};">${esc(label)}<div style="font-size:9px;color:${C.ink3};">${esc(k)}</div></div>
        <div>${editing ? `<input data-edit-value="${esc(k)}" value="${esc(a.v || '')}" placeholder="${esc(hint || '')}" style="${input}"><div style="margin-top:4px;"><button data-act="editSave" data-k="${esc(k)}" style="${primary}">Stage</button> <button data-act="editCancel" style="${btn}">Cancel</button></div>` : `<div data-act="edit" data-k="${esc(k)}" title="Click to edit" style="font-size:12px;cursor:text;color:${a.v ? C.ink : C.ink3};">${a.v ? esc(a.v) : `<i>${esc(hint || 'empty')}</i>`}</div>`}
          ${diff ? `<div style="font-size:10px;color:${C.ink3};margin-top:3px;"><b style="color:${C.stage};">STAGED</b> · saved: ${b.v ? esc(b.v) : '<i>empty</i>'}</div>` : ''}${a.why ? `<div style="font-size:10px;color:${C.ink3};margin-top:2px;">${esc(a.why)}</div>` : ''}</div></div>`;
    }
    function render() {
      const g = group(), secs = sections(g), diffs = changedKeys(g), photo = S.inputs.photo || {}, library = S.inputs.mediaLibrary || [];
      root.innerHTML = `<div style="border:1px solid ${C.line};border-radius:10px;background:${C.surf};overflow:hidden;">
        <div style="padding:12px 14px;border-bottom:1px solid ${C.line};background:${C.surf2};"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><b style="font-size:14px;">Codex Design</b><span style="font-size:10px;padding:2px 7px;border:1px solid ${C.acc};border-radius:10px;color:${C.acc};">parallel workspace</span><button data-act="reload" style="${btn}margin-left:auto;">↻ Refresh</button></div><div style="font-size:11px;color:${C.ink3};margin-top:4px;">Existing data → prompt for ChatGPT → Codex validates the structured return → staged comparison → deliberate database commit. The original Design section is unchanged.</div></div>
        <div style="display:grid;grid-template-columns:minmax(190px,240px) 1fr;min-height:520px;">
          <div style="padding:10px;border-right:1px solid ${C.line};background:${C.surf2};">${GROUPS.map(x => { const n = changedKeys(x).length; return `<button data-act="group" data-group="${x.id}" style="display:block;width:100%;text-align:left;margin-bottom:5px;padding:8px;border:1px solid ${S.group === x.id ? C.acc : C.line};border-radius:7px;background:${S.group === x.id ? 'rgba(64,180,210,.10)' : C.surf};color:${C.ink};cursor:pointer;font-size:11px;font-weight:${S.group === x.id ? '700' : '500'};">${esc(x.name)}${n ? `<span style="float:right;color:${C.stage};">${n}</span>` : ''}</button>`; }).join('')}
            <div style="font-size:10px;color:${C.ink3};margin-top:12px;line-height:1.45;">All work is scoped to the selected section. Orange fields are staged and are not in the database until Commit.</div></div>
          <div style="padding:14px;min-width:0;"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;"><div style="flex:1;min-width:220px;"><b>${esc(g.name)}</b><div style="font-size:11px;color:${C.ink3};margin-top:2px;">${esc(g.note)}</div></div><button data-act="preview" style="${btn}">👁 Preview staged</button><button data-act="revert" ${diffs.length ? '' : 'disabled'} style="${btn}">↺ Revert</button><button data-act="save" ${diffs.length ? '' : 'disabled'} style="${diffs.length ? primary : btn}">✓ Commit ${diffs.length || ''}</button></div>
            <details style="margin:12px 0;border:1px solid ${C.line};border-radius:8px;background:${C.surf2};" ${g.id === 'motif' ? 'open' : ''}><summary style="cursor:pointer;padding:9px 10px;font-size:11px;font-weight:700;">Hub Spec Images — brand guides &amp; image catalog <span style="font-weight:400;color:${C.ink3};">${library.length} reference${library.length === 1 ? '' : 's'} · consulted by design prompts and asset generators</span></summary><div style="padding:2px 10px 10px;">
              <div style="display:grid;grid-template-columns:minmax(120px,1fr) 150px minmax(160px,2fr) auto;gap:6px;align-items:end;"><label style="font-size:10px;color:${C.ink3};">Name<input data-in="libName" value="${esc(S.libName)}" placeholder="Tropical Surf Brand Guide" style="${input}margin-top:2px;"></label><label style="font-size:10px;color:${C.ink3};">Role<select data-in="libRole" style="${input}margin-top:2px;"><option value="brand-guide" ${S.libRole === 'brand-guide' ? 'selected' : ''}>Brand guide</option><option value="site-image" ${S.libRole === 'site-image' ? 'selected' : ''}>Site image</option><option value="motif-reference" ${S.libRole === 'motif-reference' ? 'selected' : ''}>Motif reference</option><option value="approved-example" ${S.libRole === 'approved-example' ? 'selected' : ''}>Approved example</option><option value="logo" ${S.libRole === 'logo' ? 'selected' : ''}>Logo</option></select></label><label style="font-size:10px;color:${C.ink3};">How prompts should use it<input data-in="libNotes" value="${esc(S.libNotes)}" placeholder="Palette + tropical lighting authority" style="${input}margin-top:2px;"></label><label style="${primary}display:inline-block;white-space:nowrap;">＋ Upload<input data-act="library" type="file" accept="image/png,image/jpeg,image/webp" style="display:none;"></label></div>
              ${library.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px;margin-top:9px;">${library.map(x => `<div style="border:1px solid ${C.line};border-radius:7px;overflow:hidden;background:${C.surf};"><a href="${esc(x.url)}" target="_blank" rel="noopener"><img src="${esc(x.url)}" alt="" style="width:100%;height:82px;object-fit:cover;display:block;"></a><div style="padding:5px 6px;font-size:10px;"><b>${esc(x.name)}</b><div style="color:${C.acc};">${esc((x.role || 'site-image').replace(/-/g,' '))}</div>${x.notes ? `<div style="color:${C.ink3};margin-top:2px;">${esc(x.notes)}</div>` : ''}<button data-act="libRemove" data-id="${esc(x.id)}" style="border:0;background:none;color:${C.ink3};font-size:9px;padding:3px 0 0;cursor:pointer;">remove</button></div></div>`).join('')}</div>` : `<div style="font-size:10px;color:${C.ink3};margin-top:7px;">Upload a brand guide once. It will guide both future design prompts and Generate background inside asset creation.</div>`}</div></details>
            <div style="margin:12px 0;padding:10px;border:1px solid ${C.line};border-radius:8px;background:${C.surf2};">
              <div style="display:grid;grid-template-columns:26px 1fr;gap:7px 9px;align-items:start;">
                <b style="color:${C.acc};">1</b><div><b style="font-size:11px;">Send the existing direction to ChatGPT</b><div style="font-size:10px;color:${C.ink3};margin:2px 0 5px;">The generated prompt includes the current fields, campaign context, exact return format, and every saved hub brand guide and catalog image. You do not need to attach them again.</div><textarea data-in="note" rows="2" placeholder="Your direction for this round—warmer, editorial, more negative space, preserve this motif…" style="${input}">${esc(S.note)}</textarea><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px;"><button data-act="copy" style="${primary}">📋 Copy prompt for ChatGPT</button></div></div>
                <b style="color:${C.acc};">2</b><div><b style="font-size:11px;">Receive the structured return</b><div style="font-size:10px;color:${C.ink3};margin:2px 0 5px;">Paste ChatGPT's whole reply. The JSON block is found automatically; fields outside this section are ignored.</div><textarea data-in="reply" rows="5" placeholder="Paste ChatGPT's complete JSON return here…" style="${input}">${esc(S.reply)}</textarea></div>
                <b style="color:${C.acc};">3</b><div><b style="font-size:11px;">Stage and visually test</b><div style="font-size:10px;color:${C.ink3};margin:2px 0 5px;">Codex validates the field names and stages only this section. Orange rows show unsaved changes.${['motif','assets'].includes(g.id) ? ' Generate a real wordless 16:9 thumbnail from all staged imagery, palette, type and thumbnail-layout values before approving them.' : ' Colors and typography immediately update the hub preview.'}</div><button data-act="stage" style="${btn}">→ Validate and stage</button>${['motif','assets'].includes(g.id) ? ` <button data-act="testThumb" ${S.thumbStarted ? 'disabled' : ''} style="${primary}${S.thumbStarted ? 'opacity:.65;cursor:wait;' : ''}">${S.thumbStarted ? '⏳ Generating thumbnail…' : S.testThumb ? '↻ Regenerate test thumbnail' : '🖼 Generate test thumbnail'}</button>${S.thumbStarted ? `<span style="font-size:10px;color:${C.acc};margin-left:6px;">Working from the staged values—usually 20–60 seconds. Keep this tab open.</span>` : ''}` : ` <button data-act="preview" style="${btn}">👁 Preview staged</button>`}${S.testThumb && ['motif','assets'].includes(g.id) ? `<div style="margin-top:8px;display:grid;grid-template-columns:minmax(220px,480px) 1fr;gap:9px;align-items:start;"><a href="${esc(S.testThumb.url)}" target="_blank" rel="noopener"><img src="${esc(S.testThumb.url)}" alt="Staged thumbnail test" style="display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid ${C.line};border-radius:8px;"></a><div style="font-size:10px;color:${C.ink3};line-height:1.45;"><b style="color:${C.ok};">✓ Test thumbnail ready</b><br>Generated from the unsaved values. If it is wrong, change your instruction or edit the orange fields, stage again, and regenerate.<div style="margin-top:7px;"><button data-act="approveThumb" style="${primary}">✓ Add to hub Spec Images</button></div><details style="margin-top:5px;"><summary style="cursor:pointer;">generation prompt</summary><div style="white-space:pre-wrap;margin-top:3px;">${esc(S.testThumb.prompt)}</div></details></div></div>` : ''}</div>
                <b style="color:${C.acc};">4</b><div><b style="font-size:11px;">Commit approved changes</b><div style="font-size:10px;color:${C.ink3};margin:2px 0 5px;">Nothing reaches the campaign database until you approve it. Commit saves only this section's orange changes.</div><button data-act="save" ${diffs.length ? '' : 'disabled'} style="${diffs.length ? primary : btn}">✓ Commit ${diffs.length || ''} approved fields</button> <button data-act="revert" ${diffs.length ? '' : 'disabled'} style="${btn}">↺ Discard staged</button></div>
              </div></div>
            ${S.busy ? `<div style="padding:7px 9px;border-radius:6px;background:rgba(64,180,210,.10);font-size:11px;color:${C.ink2};margin-bottom:8px;">⏳ ${esc(S.busy)}</div>` : ''}${S.msg ? `<div style="padding:7px 9px;border-radius:6px;background:${S.kind === 'bad' ? 'rgba(239,107,107,.10)' : 'rgba(74,222,128,.10)'};font-size:11px;color:${S.kind === 'bad' ? C.bad : C.ok};margin-bottom:8px;">${esc(S.msg)}</div>` : ''}
            <div style="border:1px solid ${C.line};border-radius:8px;overflow:hidden;">${secs.map(sec => `<div style="padding:7px 8px;background:${C.surf2};font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:${C.ink3};font-weight:700;">${esc(sec.label)}</div>${sec.fields.map(f => fieldRow(...f)).join('')}`).join('')}</div></div>
        </div></div>`;
    }
    root.addEventListener('input', ev => { if (ev.target.dataset.in === 'note') S.note = ev.target.value; if (ev.target.dataset.in === 'reply') S.reply = ev.target.value; if (ev.target.dataset.in === 'libName') S.libName = ev.target.value; if (ev.target.dataset.in === 'libNotes') S.libNotes = ev.target.value; if (ev.target.dataset.in === 'libRole') S.libRole = ev.target.value; });
    root.addEventListener('change', ev => { if (ev.target.dataset.act === 'photo') uploadPhoto(ev.target.files && ev.target.files[0]); if (ev.target.dataset.act === 'library') uploadLibrary(ev.target.files && ev.target.files[0]); if (ev.target.dataset.in === 'libRole') S.libRole = ev.target.value; });
    root.addEventListener('click', ev => { const el = ev.target.closest('[data-act]'); if (!el || S.busy) return; const a = el.dataset.act;
      if (a === 'group') { S.group = el.dataset.group; S.edit = null; S.msg = ''; render(); }
      else if (a === 'reload') load(); else if (a === 'copy') copyPrompt(); else if (a === 'stage') stageReply(); else if (a === 'save') saveGroup(); else if (a === 'revert') revertGroup(); else if (a === 'preview') preview(); else if (a === 'testThumb') testThumbnail(); else if (a === 'approveThumb') approveTestThumbnail();
      else if (a === 'libRemove') removeLibrary(el.dataset.id);
      else if (a === 'edit') { S.edit = el.dataset.k; render(); } else if (a === 'editCancel') { S.edit = null; render(); } else if (a === 'editSave') { const x = root.querySelector(`[data-edit-value="${CSS.escape(el.dataset.k)}"]`); edit(el.dataset.k, x ? x.value.trim() : ''); }
    });
    load();
    return { reload: load, previewStaged: preview, state: S };
  }
  window.CodexDesignPanel = { mount };
})();
