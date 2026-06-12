
const WORKER_URL  = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev";
const CAMPAIGN_ID = "3581f7d3a4bb80c9b25efceb41a079b4"; // taoist-wanderings
const RESEARCH_ID = "3661f7d3a4bb81adaaadc2ce80784112"; // research
const SITE_URL    = "https://cabuzzard.github.io/dash/microsites/taoist-wanderings/";
let SESSION_TOKEN = sessionStorage.getItem('hermes_token') || null;
let pin = '';

// Auto-restore session if a valid token exists from this browser session
if (SESSION_TOKEN) {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pinScreen').classList.add('hidden');
    init();
  });
}

function pinReset(msg, isErr) {
  pin = '';
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach(d => d.classList.remove('filled'));
  if (isErr) dots.forEach(d => d.classList.add('error'));
  document.getElementById('pinError').textContent = msg;
  setTimeout(() => { dots.forEach(d => d.classList.remove('error')); document.getElementById('pinError').textContent = ''; }, 900);
}
async function pp(d) {
  if (pin.length >= 4) return;
  pin += d;
  document.getElementById('d' + (pin.length-1)).classList.add('filled');
  if (pin.length === 4) {
    const attemptPin = pin;
    pin = ''; // free immediately so DEL/re-entry works during inflight request
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 6000); // 6s timeout
      const resp = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth', pin: attemptPin }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const data = await resp.json();
      if (data.token) {
        SESSION_TOKEN = data.token;
        sessionStorage.setItem('hermes_token', SESSION_TOKEN);
        document.getElementById('pinScreen').classList.add('hidden');
        init();
      } else {
        pinReset('incorrect code', true);
      }
    } catch(e) {
      pinReset(e.name === 'AbortError' ? 'timeout â€” retry' : 'connection error', true);
    }
  }
}
function pd() {
  if (!pin.length) return;
  document.getElementById('d' + (pin.length-1)).classList.remove('filled');
  pin = pin.slice(0,-1);
}
function lockApp() {
  SESSION_TOKEN = null;
  sessionStorage.removeItem('hermes_token');
  pin = '';
  document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled','error'));
  document.getElementById('pinError').textContent = '';
  document.getElementById('pinScreen').classList.remove('hidden');
}

function tick() {
  const n = new Date();
  document.getElementById('clock').textContent =
    String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0') + ':' + String(n.getSeconds()).padStart(2,'0');
}
setInterval(tick, 1000); tick();

async function w(action, extra = {}) {
  const r = await fetch(WORKER_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, token: SESSION_TOKEN, ...extra }) });
  const d = await r.json();
  if (r.status === 401) {
    SESSION_TOKEN = null;
    sessionStorage.removeItem('hermes_token');
    document.getElementById('pinScreen').classList.remove('hidden');
    throw new Error('Session expired â€” please re-enter your code');
  }
  if (d.error) throw new Error(d.error);
  return d;
}

// Escape HTML special characters
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Strip HTML tags to plain text
function stripHtml(raw) {
  return raw ? raw.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : '';
}

// Parse Claude output: HEADING: body text pairs, one per line
function parseToHtml(text) {
  if (!text) return '<p>â€”</p>';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let html = '';
  lines.forEach(line => {
    // Match "HEADING: body text" pattern
    const match = line.match(/^([A-Z][A-Z0-9\s\/&,'-]+):\s*(.+)$/);
    if (match) {
      html += '<h3>' + match[1].trim() + '</h3><p>' + match[2].trim() + '</p>';
    } else {
      // Plain line â€” strip leading dash/bullet
      const clean = line.replace(/^[-â€¢Â·*\d+\.\s]+/, '').trim();
      if (clean) html += '<p>' + clean + '</p>';
    }
  });
  return html || '<p>â€”</p>';
}

// Call Claude via worker â€” strict HEADING: body format, 30 words max per entry
async function condense(label, raw) {
  if (!raw) return '<p>â€”</p>';
  const plain = stripHtml(raw);
  if (!plain) return '<p>â€”</p>';
  try {
    const data = await w('condense', { label, text: plain });
    return parseToHtml(data.text || '');
  } catch(e) {
    return '<p>â€”</p>';
  }
}

async function loadResearch() {
  try {
    const data = await w('getResearch', { campaignId: CAMPAIGN_ID });
    const r = data.research;
    if (!r) {
      document.getElementById('r-name').textContent = 'No research record â€” add one in Notion to populate this page.';
      ['r-problem','r-keymessage','r-products','r-actions','r-methods','r-news'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p style="color:#2a2a2a;font-style:italic;">No data yet.</p>';
      });
      const kwEl = document.getElementById('r-keywords');
      if (kwEl) kwEl.innerHTML = '<span class="empty">â€”</span>';
      return;
    }

    // SEC 1
    document.getElementById('r-name').textContent = r.name;
    const statusEl = document.getElementById('r-status');
    const sc = r.status ? r.status.toLowerCase() : 'draft';
    statusEl.innerHTML = `<span class="badge ${sc}">${r.status || 'â€”'}</span>`;
    document.getElementById('r-date').textContent = r.lastUpdated || 'â€”';
    const liveSiteEl = document.getElementById('r-livesite');
    if (liveSiteEl) {
      if (r.liveSiteUrl) {
        liveSiteEl.innerHTML = '<a href="' + r.liveSiteUrl + '" target="_blank" class="notion-link" style="font-size:12px;">â†— ' + r.liveSiteUrl.replace(/^https?:///, '') + '</a>';
      } else { liveSiteEl.innerHTML = '<span class="empty">â€”</span>'; }
    }
    const notesDisplayEl = document.getElementById('r-thoughts');
    if (notesDisplayEl) notesDisplayEl.textContent = r.thoughts || '';

    // Store raw values for editing
    RESEARCH_ID_LIVE = r.id || '';
    const pmSplitRaw = (r.platforms || '').replace(/<br\s*\/?>/gi,'\n').split(/ACTIVE METHODS:/i);
    RAW = {
      keywords:     r.keywords || '',
      productIdeas: r.productIdeas || '',
      notes:        r.notes || '',
      thoughts:     r.thoughts || '',
      keyMessage:   r.keyMessage || '',
      painPoints:   r.painPoints || '',
      rawPlatforms: pmSplitRaw[0].replace(/ACTIVE PLATFORMS:\s*/i,'').replace(/<br\s*\/?>/gi,'\n').trim(),
      rawMethods:   pmSplitRaw.length > 1 ? pmSplitRaw[1].replace(/<br\s*\/?>/gi,'\n').trim() : '',
    };

    // SEC 2 â€” keywords as pills
    const kwEl = document.getElementById('r-keywords');
    if (r.keywords) {
      kwEl.innerHTML = r.keywords.split(',').map(k => `<span class="kw">${k.trim()}</span>`).join('');
    } else {
      kwEl.innerHTML = '<span class="empty">â€”</span>';
    }
    // Condense all fields in parallel via Claude
    const loading = '<div class="loading"><div class="spinner"></div>Condensingâ€¦</div>';
    ['r-problem','r-keymessage','r-products','r-actions','r-methods','r-news'].forEach(id => {
      document.getElementById(id).innerHTML = loading;
    });

    // Split platforms & methods from the combined field
    const rawPm = stripHtml(r.platforms) || '';
    const pmSplit = rawPm.split(/ACTIVE METHODS:/i);
    const rawPlatforms = pmSplit[0].replace(/ACTIVE PLATFORMS:\s*/i, '').trim();
    const rawMethods   = pmSplit.length > 1 ? pmSplit[1].trim() : '';

    // Split notes into problem statement + recommended actions
    const rawNotes = stripHtml(r.notes) || '';
    const problemInput = (r.campaignGoal || '') + '\n' + (r.painPoints || '') + '\n' + rawNotes.split(/ROI-RANKED|RECOMMENDED|BOTTOM LINE/i)[0];
    const actionsInput = rawNotes;

    const [problem, keymessage, products, actions, methods, news] = await Promise.all([
      condense('This campaign does X for customer Y â€” state the core problem this campaign solves in one sentence then list pain points', problemInput),
      condense('Key Message', r.keyMessage),
      condense('Product Ideas', r.productIdeas),
      condense('Recommended Actions â€” prioritised by ROI, what to do next', actionsInput),
      condense('Methods', rawMethods),
      condense('News Feed', r.newsFeed),
    ]);

    document.getElementById('r-problem').innerHTML    = problem;
    document.getElementById('r-keymessage').innerHTML = keymessage;
    document.getElementById('r-products').innerHTML   = products;
    document.getElementById('r-actions').innerHTML  = actions;
    document.getElementById('r-methods').innerHTML   = methods;
    document.getElementById('r-news').innerHTML      = news;

  } catch(e) {
    document.getElementById('r-name').textContent = 'Error: ' + e.message;
  }
}

const SC = { Development:'ts-write', Writing:'ts-write', Review:'ts-review', Approved:'ts-appr', Publish:'ts-pub', Published:'ts-done', Done:'ts-done', Explode:'ts-explode' };

async function loadTitles() {
  const devEl = document.getElementById('devTitles');
  const pubEl = document.getElementById('pubTitles');
  try {
    const data = await w('getTitles', { stages: ['Development','Writing','Review','Approved','Publish','Published','Explode','Done'], campaignId: CAMPAIGN_ID });
    const titles = data.titles || [];
    const DEV_ORDER = { Explode:0, Approved:1, Review:2, Writing:3, Development:4 };
    const dev = titles
      .filter(t => ['Development','Writing','Review','Approved','Explode'].includes(t.stage))
      .sort((a, b) => (DEV_ORDER[a.stage] ?? 9) - (DEV_ORDER[b.stage] ?? 9));
    const pub = titles.filter(t => ['Publish','Published','Done'].includes(t.stage));
    function render(arr, el) {
      el.innerHTML = '';
      if (!arr.length) { el.innerHTML = '<div class="empty">None.</div>'; return; }
      arr.forEach(t => {
        const div = document.createElement('div');
        div.className = 'title-row';
        div.innerHTML = `<span class="title-stage ${SC[t.stage]||'ts-write'}">${t.stage}</span><span class="title-name">${t.title}</span><span class="title-group">${t.cohort||''}</span><button class="title-status-btn" onclick="openStatusModal('${t.id}','${t.title.replace(/'/g,"\\'")}','${t.stage}')" title="Change status">â‡„</button><a class="title-link" href="https://www.notion.so/${t.id}" target="_blank">â†—</a>`;
        el.appendChild(div);
      });
    }
    render(dev, devEl);
    render(pub, pubEl);
  } catch(e) {
    devEl.innerHTML = `<div class="empty" style="color:#ff4444">${e.message}</div>`;
    pubEl.innerHTML = '<div class="empty">â€”</div>';
  }
}

// Raw research values for editing
let RAW = {};
let RESEARCH_ID_LIVE = '';

// Modal config per field
const MODAL_CFG = {
  keywords:     { title: 'Keywords',            hint: 'Comma-separated keywords for this campaign', target: 'campaign' },
  keyMessage:   { title: 'Key Message',         hint: 'Core positioning statement for this campaign', target: 'research', field: 'keyMessage' },
  mainProblem:  { title: 'Main Problem',        hint: 'Pain points this campaign addresses', target: 'campaignField', field: 'painPoints' },
  productIdeas: { title: 'Product Ideas',        hint: 'Describe product ideas, offers, and pipeline', target: 'research', field: 'productIdeas' },
  thoughts:     { title: 'Thoughts',             hint: 'Personal notes and thoughts on this campaign', target: 'research', field: 'thoughts' },
  actions:      { title: 'Recommended Actions',  hint: 'ROI-ranked actions and next steps', target: 'research', field: 'notes' },
  platforms:    { title: 'Platforms',            hint: 'Active and planned platforms for this campaign', target: 'research', field: 'platforms', combined: true },
  methods:      { title: 'Methods',              hint: 'Active and planned methods for this campaign', target: 'research', field: 'platforms', combined: true },
};

let activeField = null;

function openModal(field) {
  const cfg = MODAL_CFG[field];
  if (!cfg) return;
  activeField = field;
  document.getElementById('modalTitle').textContent = cfg.title;
  document.getElementById('modalHint').textContent = cfg.hint;
  document.getElementById('modalStatus').textContent = '';
  document.getElementById('modalStatus').className = 'modal-status';
  document.getElementById('modalSave').disabled = false;

  // Pre-fill with raw value
  let val = '';
  if (field === 'keywords')     val = RAW.keywords || '';
  if (field === 'keyMessage')   val = RAW.keyMessage || '';
  if (field === 'mainProblem')  val = RAW.painPoints || '';
  if (field === 'productIdeas') val = RAW.productIdeas || '';
  if (field === 'actions')      val = RAW.notes || '';
  if (field === 'platforms')    val = RAW.rawPlatforms || '';
  if (field === 'methods')      val = RAW.rawMethods || '';
  if (field === 'thoughts')     val = RAW.thoughts || '';
  document.getElementById('modalTa').value = val;

  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('modalTa').focus(), 100);
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  activeField = null;
}

document.getElementById('editModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

async function saveModal() {
  const val = document.getElementById('modalTa').value.trim();
  const btn = document.getElementById('modalSave');
  const status = document.getElementById('modalStatus');
  btn.disabled = true;
  btn.textContent = 'Savingâ€¦';
  status.textContent = '';

  const cfg = MODAL_CFG[activeField];
  try {
    if (cfg.target === 'campaign') {
      await w('updateCampaignKeywords', { campaignId: CAMPAIGN_ID, value: val });
      RAW.keywords = val;
      // Re-render keywords pills
      const kwEl = document.getElementById('r-keywords');
      kwEl.innerHTML = val ? val.split(',').map(k => `<span class="kw">${k.trim()}</span>`).join('') : '<span class="empty">â€”</span>';
    } else if (cfg.target === 'campaignField') {
      await w('updateCampaignField', { campaignId: CAMPAIGN_ID, field: cfg.field, value: val });
      RAW[cfg.field] = val;
      // Re-condense display
      status.textContent = 'Saved. Updating displayâ€¦';
      const displayId = { painPoints: 'r-problem' }[cfg.field];
      const label = { painPoints: 'Main Problem' }[cfg.field];
      if (displayId) {
        document.getElementById(displayId).innerHTML = '<div class="loading"><div class="spinner"></div>Condensingâ€¦</div>';
        const html = await condense(label, val);
        document.getElementById(displayId).innerHTML = html;
      }
    } else {
      // For platforms/methods â€” need to combine back into one field
      if (activeField === 'platforms') {
        RAW.rawPlatforms = val;
        const combined = 'ACTIVE PLATFORMS: ' + val + (RAW.rawMethods ? '\nACTIVE METHODS: ' + RAW.rawMethods : '');
        await w('updateResearch', { researchId: RESEARCH_ID_LIVE, field: 'platforms', value: combined });
      } else if (activeField === 'methods') {
        RAW.rawMethods = val;
        const combined = 'ACTIVE PLATFORMS: ' + (RAW.rawPlatforms || '') + '\nACTIVE METHODS: ' + val;
        await w('updateResearch', { researchId: RESEARCH_ID_LIVE, field: 'platforms', value: combined });
      } else {
        await w('updateResearch', { researchId: RESEARCH_ID_LIVE, field: cfg.field, value: val });
        RAW[cfg.field] = val;
        // If editing the notes column directly, update its display without condensing
        if (activeField === 'thoughts') {
          const nd = document.getElementById('r-thoughts');
          if (nd) nd.textContent = val;
        }
      }
      // Re-condense the display
      status.textContent = 'Saved. Updating displayâ€¦';
      const displayId = { keyMessage:'r-keymessage', productIdeas:'r-products', actions:'r-actions', methods:'r-methods' }[activeField];
      const label = { keyMessage:'Key Message', productIdeas:'Product Ideas', actions:'Recommended Actions â€” prioritised by ROI', methods:'Methods' }[activeField];
      if (displayId) {
        document.getElementById(displayId).innerHTML = '<div class="loading"><div class="spinner"></div>Condensingâ€¦</div>';
        const html = await condense(label, val);
        document.getElementById(displayId).innerHTML = html;
      }
    }
    status.textContent = 'Saved âœ“';
    status.className = 'modal-status ok';
    setTimeout(closeModal, 900);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.className = 'modal-status err';
  }
  btn.disabled = false;
  btn.textContent = 'Save to Notion';
}

// â”€â”€ MAIN TD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let TD_ITEMS = [];

function renderTd() {
  const el = document.getElementById('td-list');
  el.innerHTML = '';
  if (!TD_ITEMS.length) { el.innerHTML = '<div class="empty">No tasks.</div>'; return; }
  TD_ITEMS.forEach(t => {
    const row = document.createElement('div');
    row.className = 'td-row';
    const nid = t.id.replace(/-/g,'');
    row.innerHTML = `<a class="td-name" href="https://www.notion.so/${nid}" target="_blank" rel="noopener">${t.name}</a><button class="td-del" onclick="deleteTodo('${t.id}', this)" title="Remove">âœ•</button>`;
    el.appendChild(row);
  });
}

async function loadTodos() {
  const el = document.getElementById('td-list');
  try {
    const data = await w('getCampaignTodos', { campaignId: CAMPAIGN_ID });
    TD_ITEMS = data.todos || [];
    renderTd();
  } catch(e) {
    el.innerHTML = `<div class="empty" style="color:#ff4444">${e.message}</div>`;
  }
}

function openTdModal() {
  document.getElementById('td-modal-input').value = '';
  document.getElementById('tdModalStatus').textContent = '';
  document.getElementById('tdModalSave').disabled = false;
  document.getElementById('tdModalSave').textContent = 'Add Task';
  document.getElementById('tdModal').classList.add('open');
  setTimeout(() => document.getElementById('td-modal-input').focus(), 100);
}

function closeTdModal() {
  document.getElementById('tdModal').classList.remove('open');
}

document.getElementById('tdModal').addEventListener('click', function(e) {
  if (e.target === this) closeTdModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement === document.getElementById('td-modal-input')) addTodoFromModal();
  if (e.key === 'Enter' && document.activeElement === document.getElementById('login-modal-input')) addLoginFromModal();
});

async function addTodoFromModal() {
  const input = document.getElementById('td-modal-input');
  const name = input.value.trim();
  if (!name) return;
  const btn = document.getElementById('tdModalSave');
  const status = document.getElementById('tdModalStatus');
  btn.disabled = true;
  btn.textContent = 'Addingâ€¦';
  try {
    const data = await w('createTodo', { name, campaignId: CAMPAIGN_ID });
    TD_ITEMS.push({ id: data.id, name });
    renderTd();
    status.textContent = 'Added âœ“';
    status.className = 'modal-status ok';
    setTimeout(closeTdModal, 700);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.className = 'modal-status err';
    btn.disabled = false;
    btn.textContent = 'Add Task';
  }
}

async function deleteTodo(id, btn) {
  btn.disabled = true;
  try {
    await w('unlinkTodoFromCampaign', { campaignId: CAMPAIGN_ID, todoId: id });
    TD_ITEMS = TD_ITEMS.filter(t => t.id !== id);
    renderTd();
  } catch(e) {
    btn.disabled = false;
    alert('Error: ' + e.message);
  }
}

// â”€â”€ PLATFORM LOGINS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let LOGIN_ITEMS  = [];
let ALL_PLATFORMS = [];

const CAT_CLASS = {
  'Personal':     'cat-personal',
  'Company Page': 'cat-company-page',
  'Client':       'cat-client',
  'Shared':       'cat-shared',
  'Affiliate':    'cat-affiliate',
};
const LS_CLASS = {
  'Active':   'ls-active',
  'Planning': 'ls-planning',
  'Paused':   'ls-paused',
  'Inactive': 'ls-inactive',
  'development': 'ls-paused',
};

function renderLogins() {
  const el = document.getElementById('login-list');
  el.innerHTML = '';
  if (!LOGIN_ITEMS.length) { el.innerHTML = '<div class="empty">No logins yet.</div>'; return; }

  // Build platform name lookup
  const platName = {};
  ALL_PLATFORMS.forEach(p => { platName[p.id] = p.name; });

  // Group by first platformId
  const grouped = {};
  const ungrouped = [];
  LOGIN_ITEMS.forEach(l => {
    const pid = (l.platformIds || [])[0];
    if (pid) {
      if (!grouped[pid]) grouped[pid] = [];
      grouped[pid].push(l);
    } else {
      ungrouped.push(l);
    }
  });

  const renderRow = (l) => {
    const div = document.createElement('div');
    div.className = 'login-row';
    div.style.cursor = 'pointer';
    const cat = l.category || '';
    const catCls = CAT_CLASS[cat] || '';
    const stCls  = LS_CLASS[l.status] || 'ls-planning';
    const sub = [l.usr, l.accountUrl].filter(Boolean).join(' Â· ');
    div.innerHTML =
      (cat ? `<span class="login-cat ${catCls}">${cat}</span>` : '<span class="login-cat" style="opacity:.3;border:1px solid #333;color:#555;">â€”</span>') +
      `<div class="login-meta">
        <div class="login-name">${l.name}</div>
        ${sub ? `<div class="login-sub">${sub}</div>` : ''}
      </div>` +
      `<span class="${stCls}">${l.status || 'Planning'}</span>` +
      `<a class="title-link" href="https://www.notion.so/${l.id}" target="_blank" onclick="event.stopPropagation()">â†—</a>`;
    // Click row â†’ open edit modal
    div.onclick = () => openLoginEditModal(l);
    return div;
  };

  // Render grouped by platform
  const sortedPlatIds = Object.keys(grouped).sort((a,b) => (platName[a]||'').localeCompare(platName[b]||''));
  sortedPlatIds.forEach(pid => {
    const grp = document.createElement('div');
    grp.className = 'login-platform-group';
    const lbl = document.createElement('div');
    lbl.className = 'login-platform-label';
    lbl.textContent = platName[pid] || 'Unknown Platform';
    grp.appendChild(lbl);
    grouped[pid].forEach(l => grp.appendChild(renderRow(l)));
    el.appendChild(grp);
  });

  // Ungrouped at bottom
  if (ungrouped.length) {
    const grp = document.createElement('div');
    grp.className = 'login-platform-group';
    const lbl = document.createElement('div');
    lbl.className = 'login-platform-label';
    lbl.textContent = 'No Platform';
    grp.appendChild(lbl);
    ungrouped.forEach(l => grp.appendChild(renderRow(l)));
    el.appendChild(grp);
  }
}

async function loadLogins() {
  const el = document.getElementById('login-list');
  try {
    const [loginData, platData] = await Promise.all([
      w('getLogins'),
      w('getPlatforms'),
    ]);
    ALL_PLATFORMS = platData.platforms || [];
    // Filter to logins whose campaign relation includes this campaign
    LOGIN_ITEMS = (loginData.logins || []).filter(l =>
      (l.campaignIds || []).includes(CAMPAIGN_ID)
    );
    renderLogins();
  } catch(e) {
    el.innerHTML = `<div class="empty" style="color:#ff4444">${e.message}</div>`;
  }
}

// â”€â”€ PLATFORM AUTOCOMPLETE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function filterLmPlatforms() {
  const query  = (document.getElementById('lm-plat-input').value || '').trim();
  const queryL = query.toLowerCase();
  const dd = document.getElementById('lm-plat-dd');
  dd.innerHTML = '';

  const matches = ALL_PLATFORMS.filter(p =>
    !query || p.name.toLowerCase().includes(queryL)
  ).slice(0, 12);

  matches.forEach(p => {
    const div = document.createElement('div');
    div.className = 'plat-dd-item';
    div.textContent = p.name;
    div.onmousedown = () => selectLmPlatform(p.id, p.name);
    dd.appendChild(div);
  });

  // "+ Create" row if typed something that doesn't exactly exist
  const exact = ALL_PLATFORMS.some(p => p.name.toLowerCase() === queryL);
  if (query && !exact) {
    const div = document.createElement('div');
    div.className = 'plat-dd-create';
    div.textContent = '+ Create "' + query + '"';
    div.onmousedown = async () => {
      div.textContent = 'Creatingâ€¦';
      const saveBtn = document.getElementById('lm-save');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Creating platformâ€¦'; }
      try {
        const res = await w('createPlatform', { title: query, status: 'Publish' });
        const newP = { id: res.id, name: query, status: 'Publish' };
        ALL_PLATFORMS.push(newP);
        selectLmPlatform(res.id, query);
      } catch(e) {
        div.textContent = 'Error: ' + e.message;
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Add Login'; }
      }
    };
    dd.appendChild(div);
  }

  dd.style.display = dd.children.length ? 'block' : 'none';
}

function selectLmPlatform(id, name) {
  document.getElementById('lm-plat-input').value = name;
  document.getElementById('lm-plat-id').value   = id;
  document.getElementById('lm-plat-dd').style.display = 'none';
}

// Close platform picker when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#lm-plat-wrap')) {
    const dd = document.getElementById('lm-plat-dd');
    if (dd) dd.style.display = 'none';
  }
  if (!e.target.closest('#le-plat-wrap')) {
    const dd = document.getElementById('le-plat-dd');
    if (dd) dd.style.display = 'none';
  }
});

// â”€â”€ PLATFORM AUTOCOMPLETE (EDIT MODAL) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function filterLePlatforms() {
  const query  = (document.getElementById('le-plat-input').value || '').trim();
  const queryL = query.toLowerCase();
  const dd = document.getElementById('le-plat-dd');
  dd.innerHTML = '';

  const matches = ALL_PLATFORMS.filter(p =>
    !query || p.name.toLowerCase().includes(queryL)
  ).slice(0, 12);

  matches.forEach(p => {
    const div = document.createElement('div');
    div.className = 'plat-dd-item';
    div.textContent = p.name;
    div.onmousedown = () => selectLePlatform(p.id, p.name);
    dd.appendChild(div);
  });

  const exact = ALL_PLATFORMS.some(p => p.name.toLowerCase() === queryL);
  if (query && !exact) {
    const div = document.createElement('div');
    div.className = 'plat-dd-create';
    div.textContent = '+ Create "' + query + '"';
    div.onmousedown = async () => {
      div.textContent = 'Creatingâ€¦';
      const saveBtn = document.getElementById('le-save');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Creating platformâ€¦'; }
      try {
        const res = await w('createPlatform', { title: query, status: 'Publish' });
        const newP = { id: res.id, name: query, status: 'Publish' };
        ALL_PLATFORMS.push(newP);
        selectLePlatform(res.id, query);
      } catch(e) {
        div.textContent = 'Error: ' + e.message;
      } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
      }
    };
    dd.appendChild(div);
  }

  dd.style.display = dd.children.length ? 'block' : 'none';
}

function selectLePlatform(id, name) {
  document.getElementById('le-plat-input').value = name;
  document.getElementById('le-plat-id').value   = id;
  document.getElementById('le-plat-dd').style.display = 'none';
}

// â”€â”€ ADD LOGIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openLoginModal() {
  document.getElementById('lm-name').value          = '';
  document.getElementById('lm-plat-input').value    = '';
  document.getElementById('lm-plat-id').value       = '';
  document.getElementById('lm-plat-dd').style.display = 'none';
  document.getElementById('lm-category').value      = '';
  document.getElementById('lm-login-status').value  = 'Planning';
  document.getElementById('lm-usr').value           = '';
  document.getElementById('lm-url').value           = '';
  document.getElementById('lm-status-msg').textContent = '';
  document.getElementById('lm-status-msg').className   = 'modal-status';
  document.getElementById('lm-save').disabled       = false;
  document.getElementById('lm-save').textContent    = 'Add Login';
  document.getElementById('loginModal').classList.add('open');
  setTimeout(() => document.getElementById('lm-name').focus(), 100);
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('open');
}

document.getElementById('loginModal').addEventListener('click', function(e) {
  if (e.target === this) closeLoginModal();
});

async function addLoginFromModal() {
  const name = document.getElementById('lm-name').value.trim();
  if (!name) { document.getElementById('lm-name').focus(); return; }
  const btn = document.getElementById('lm-save');
  const msg = document.getElementById('lm-status-msg');
  btn.disabled = true;
  btn.textContent = 'Addingâ€¦';
  msg.textContent = '';
  try {
    const res = await w('createLoginFull', {
      name,
      campaignId: CAMPAIGN_ID,
      platformId: document.getElementById('lm-plat-id').value   || undefined,
      category:   document.getElementById('lm-category').value  || undefined,
      status:     document.getElementById('lm-login-status').value || 'Planning',
      usr:        document.getElementById('lm-usr').value.trim() || undefined,
      accountUrl: document.getElementById('lm-url').value.trim() || undefined,
    });
    LOGIN_ITEMS.push(res.login);
    renderLogins();
    msg.textContent = 'Added âœ“';
    msg.className = 'modal-status ok';
    setTimeout(closeLoginModal, 700);
  } catch(e) {
    msg.textContent = 'Error: ' + e.message;
    msg.className = 'modal-status err';
    btn.disabled = false;
    btn.textContent = 'Add Login';
  }
}

// â”€â”€ EDIT LOGIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let LE_LOGIN_ID = '';

function openLoginEditModal(login) {
  LE_LOGIN_ID = login.id;
  document.getElementById('le-modal-title').textContent = login.name || 'Edit Login';
  document.getElementById('le-name').value     = login.name     || '';
  // Populate platform field
  const platId = (login.platformIds || [])[0] || '';
  const platObj = ALL_PLATFORMS.find(p => p.id === platId);
  document.getElementById('le-plat-id').value    = platId;
  document.getElementById('le-plat-input').value = platObj ? platObj.name : '';
  document.getElementById('le-plat-dd').style.display = 'none';
  document.getElementById('le-category').value = login.category || '';
  document.getElementById('le-status').value   = login.status   || 'Planning';
  document.getElementById('le-usr').value      = login.usr      || '';
  document.getElementById('le-url').value      = login.accountUrl || '';
  document.getElementById('le-notion-link').href = 'https://www.notion.so/' + login.id;
  document.getElementById('le-status-msg').textContent = '';
  document.getElementById('le-status-msg').className   = 'modal-status';
  document.getElementById('le-save').disabled   = false;
  document.getElementById('le-save').textContent = 'Save';
  document.getElementById('loginEditModal').classList.add('open');
  setTimeout(() => document.getElementById('le-name').focus(), 100);
}

function closeLoginEditModal() {
  document.getElementById('loginEditModal').classList.remove('open');
}

document.getElementById('loginEditModal').addEventListener('click', function(e) {
  if (e.target === this) closeLoginEditModal();
});

async function saveLoginEdit() {
  const btn = document.getElementById('le-save');
  const msg = document.getElementById('le-status-msg');
  btn.disabled = true;
  btn.textContent = 'Savingâ€¦';
  msg.textContent = '';
  try {
    const platId = document.getElementById('le-plat-id').value || undefined;
    const updated = {
      name:       document.getElementById('le-name').value.trim(),
      platformId: platId,
      category:   document.getElementById('le-category').value || undefined,
      status:     document.getElementById('le-status').value   || undefined,
      usr:        document.getElementById('le-usr').value.trim() || undefined,
      accountUrl: document.getElementById('le-url').value.trim() || undefined,
    };
    await w('updateLoginFull', { loginId: LE_LOGIN_ID, ...updated });
    // Update local cache
    const idx = LOGIN_ITEMS.findIndex(l => l.id === LE_LOGIN_ID);
    if (idx !== -1) LOGIN_ITEMS[idx] = { ...LOGIN_ITEMS[idx], ...updated, platformIds: platId ? [platId] : [] };
    renderLogins();
    msg.textContent = 'Saved âœ“';
    msg.className = 'modal-status ok';
    setTimeout(closeLoginEditModal, 700);
  } catch(e) {
    msg.textContent = 'Error: ' + e.message;
    msg.className = 'modal-status err';
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

// Login status changes are now handled via the edit modal (openLoginEditModal)

// â”€â”€ STATUS CHANGE MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ALL_STAGES = ['Development','Writing','Review','Approved','Publish','Published','Explode','Done'];
let statusModalTitleId = null;

function openStatusModal(id, title, currentStage) {
  statusModalTitleId = id;
  document.getElementById('statusModalTitle').textContent = 'Change Status';
  document.getElementById('statusModalHint').textContent = title;
  document.getElementById('statusModalStatus').textContent = '';
  document.getElementById('statusModalStatus').className = 'modal-status';
  const grid = document.getElementById('statusOptions');
  grid.innerHTML = '';
  ALL_STAGES.forEach(stage => {
    const btn = document.createElement('button');
    btn.className = 'status-opt-btn' + (stage === currentStage ? ' active' : '');
    btn.innerHTML = `<span class="title-stage ${SC[stage]||'ts-write'}" style="pointer-events:none">${stage}</span>`;
    if (stage !== currentStage) btn.onclick = () => applyStatusChange(id, stage);
    else btn.disabled = true;
    grid.appendChild(btn);
  });
  document.getElementById('statusModal').classList.add('open');
}

function closeStatusModal() {
  document.getElementById('statusModal').classList.remove('open');
  statusModalTitleId = null;
}

document.getElementById('statusModal').addEventListener('click', function(e) {
  if (e.target === this) closeStatusModal();
});

async function applyStatusChange(titleId, newStage) {
  const status = document.getElementById('statusModalStatus');
  document.querySelectorAll('.status-opt-btn').forEach(b => b.disabled = true);
  status.textContent = 'Updatingâ€¦';
  status.className = 'modal-status';
  try {
    await w('updateTitleStage', { titleId, stage: newStage });
    status.textContent = 'Updated âœ“';
    status.className = 'modal-status ok';
    setTimeout(async () => { closeStatusModal(); await loadTitles(); }, 700);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.className = 'modal-status err';
    document.querySelectorAll('.status-opt-btn').forEach(b => b.disabled = false);
  }
}

function init() {
  const micrositeEl = document.getElementById('r-microsite');
  if (micrositeEl) {
    if (typeof SITE_URL !== 'undefined' && SITE_URL) {
      const display = SITE_URL.replace('https://cabuzzard.github.io/dash/','').replace(/\/$/,'');
      micrositeEl.innerHTML = '<a href="' + SITE_URL + '" target="_blank" class="notion-link" style="font-size:12px;">â†— ' + display + '</a>';
    } else { micrositeEl.innerHTML = '<span class="empty">â€”</span>'; }
  }
  loadResearch();
  loadTitles();
  loadTodos();
  loadLogins();
  loadSmPosts();
}

// â”€â”€ SM POSTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SMP_DATA = {}; // id â†’ { title, script }

async function loadSmPosts() {
  const box = document.getElementById('smPostsBox');
  if (!box) return;
  box.innerHTML = '<div class="loading"><div class="spinner"></div>Loadingâ€¦</div>';
  try {
    const data    = await w('getSmPosts', { campaignId: CAMPAIGN_ID });
    const posts   = data.posts || [];
    const pending  = posts.filter(p => ['Draft','Review'].includes(p.status));
    const approved = posts.filter(p => ['Publish','Published'].includes(p.status));

    if (!pending.length && !approved.length) {
      box.innerHTML = '<div class="empty">No posts yet â€” click â–¶ to run research.</div>';
      return;
    }

    let html = '';
    if (pending.length) {
      html += '<div class="smp-section-label">Pending Approval</div>';
      pending.forEach(p => {
        const badges = (p.platforms || []).map(pl => `<span class="smp-badge">${esc(pl)}</span>`).join('');
        const preview = p.copy.length > 100 ? p.copy.slice(0, 100) + 'â€¦' : p.copy;
        const topVidLinks = (p.topVideos || '').split('\n').filter(u => u.startsWith('http')).slice(0, 3)
          .map((u, i) => `<a class="smp-topvid" href="${esc(u)}" target="_blank" rel="noopener">â–¶ Vid ${i+1}</a>`).join('');
        html += `<div class="smp-row" id="smp-${p.id}">
          <div class="smp-info">
            <div class="smp-title">${esc(p.title)}</div>
            ${preview ? `<div class="smp-copy">${esc(preview)}</div>` : ''}
            ${badges ? `<div class="smp-plats">${badges}</div>` : ''}
            ${topVidLinks ? `<div class="smp-topvids">${topVidLinks}</div>` : ''}
          </div>
          <div class="smp-actions">
            <button class="smp-approve" onclick="approveSmPost('${p.id}')" title="Approve">âœ“</button>
            <button class="smp-delete"  onclick="deleteSmPost('${p.id}')"  title="Delete">âœ•</button>
          </div>
        </div>`;
      });
    }

    if (approved.length) {
      html += `<div class="smp-section-label" style="margin-top:${pending.length?'12px':'0'};">Approved</div>`;
      approved.forEach(p => {
        SMP_DATA[p.id] = { title: p.title, script: p.script || '', voiceId: p.voiceId || '', captionStyle: p.captionStyle || '', backgroundImage: p.backgroundImage || '', voiceSettings: p.voiceSettings || '', imageStyleDna: p.imageStyleDna || '' };
        const badges = (p.platforms || []).map(pl => `<span class="smp-badge">${esc(pl)}</span>`).join('');
        const hasScript = !!p.script;
        html += `<div class="smp-row smp-approved" id="smp-${p.id}">
          <div class="smp-info">
            <div class="smp-title">${esc(p.title)}</div>
            ${badges ? `<div class="smp-plats">${badges}</div>` : ''}
            ${p.backgroundImage ? `<div class="smp-bgpath">ðŸ–¼ ${esc(p.backgroundImage)}</div>` : ''}
            ${p.videoUrl ? `<div class="smp-localpath"><a href="${esc(p.videoUrl)}" target="_blank" style="color:#6ec6a0;font-size:11px;text-decoration:none;">â–¶ ${esc(p.videoUrl)}</a></div>` : ''}
          </div>
          <div class="smp-actions">
            <button class="smp-image"  onclick="openImageModal('${p.id}')"  title="Background image">â¬›</button>
            <button class="smp-edit"   onclick="openScriptModal('${p.id}')" title="Edit script">âœŽ</button>
            ${hasScript ? `<button class="smp-render" onclick="openRenderModal('${p.id}')" title="Render video">â–¶</button>` : ''}
            <a href="#" onclick="openChatGPT('${esc(p.title)}');return false;" class="smp-link" title="Open ChatGPT with style prompt">AI</a>
            <a href="https://www.notion.so/${p.id}" target="_blank" class="smp-link" title="Open in Notion">â†—</a>
            <button class="smp-delete" onclick="deleteSmPost('${p.id}')" title="Delete">âœ•</button>
          </div>
        </div>`;
      });
    }

    box.innerHTML = html;
  } catch(e) {
    box.innerHTML = `<div class="empty" style="color:#ff4444">${esc(e.message)}</div>`;
  }
}

async function approveSmPost(id) {
  const row = document.getElementById('smp-' + id);
  if (row) {
    row.style.opacity = '0.4';
    row.style.pointerEvents = 'none';
    const actionsEl = row.querySelector('.smp-actions');
    if (actionsEl) actionsEl.innerHTML = '<span style="font-size:11px;color:#888;">Writing scriptâ€¦</span>';
  }
  try {
    await w('approveSmPost', { id, campaignId: CAMPAIGN_ID });
    await loadSmPosts();
  } catch(e) {
    if (row) { row.style.opacity = ''; row.style.pointerEvents = ''; }
    alert('Error: ' + e.message);
  }
}

async function deleteSmPost(id) {
  const row = document.getElementById('smp-' + id);
  if (row) { row.style.opacity = '0.4'; row.style.pointerEvents = 'none'; }
  try {
    await w('deleteSmPost', { id });
    if (row) row.remove();
    if (!document.querySelector('#smPostsBox .smp-row')) await loadSmPosts();
  } catch(e) {
    if (row) { row.style.opacity = ''; row.style.pointerEvents = ''; }
    alert('Error: ' + e.message);
  }
}

// â”€â”€ SM POSTS MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SM_PROMPT_TEMPLATE = `Use Apify to research short-form script ideas for these keywords: [KEYWORDS]. For each keyword, run the TikTok Scraper and YouTube Shorts Scraper. Return the top 10 videos per platform per keyword, sorted by views. For each video include: title/caption, view count, and any hashtags. Then summarize the top 3 recurring themes or angles across all results â€” these are my script ideas.

When done, write your full output to Notion: update the "TikTok Trends" property on Research page [RESEARCH_ID] with the complete text. Use the Notion MCP notion-update-page tool, command update_properties, property name "TikTok Trends". Do not abbreviate.`;

function openSmPromptModal() {
  const saved = localStorage.getItem('smResearchPrompt_' + CAMPAIGN_ID);
  document.getElementById('smResearchKws').value = saved || SM_PROMPT_TEMPLATE;
  document.getElementById('smPromptStatus').textContent = '';
  document.getElementById('smPromptStatus').style.color = '#888';
  const btn = document.getElementById('smPromptSendBtn');
  btn.disabled = false;
  btn.textContent = 'Run Research';
  document.getElementById('smPromptModal').classList.add('open');
}

function closeSmPromptModal() {
  document.getElementById('smPromptModal').classList.remove('open');
}

document.getElementById('smPromptModal').addEventListener('click', function(e) {
  if (e.target === this) closeSmPromptModal();
});

async function runSmResearch() {
  const kwsRaw = document.getElementById('smResearchKws').value.trim();
  if (!kwsRaw) return;
  // Extract keywords: look for "these keywords: X, Y, Z" pattern first, fallback to splitting whole text
  const kwMatch = kwsRaw.match(/(?:these keywords?:)\s*([^\n.]+)/i);
  const kwStr   = kwMatch ? kwMatch[1] : kwsRaw;
  const kws     = kwStr.split(/[,]+/).map(s => s.trim()).filter(Boolean);
  localStorage.setItem('smResearchPrompt_' + CAMPAIGN_ID, kwsRaw);
  const btn    = document.getElementById('smPromptSendBtn');
  const status = document.getElementById('smPromptStatus');

  btn.disabled    = true;
  btn.textContent = 'Runningâ€¦';
  status.textContent = 'Scraping TikTok + YouTube, then generating ideas with Claudeâ€¦';
  status.style.color = '#888';

  try {
    const res = await w('runSmResearch', { campaignId: CAMPAIGN_ID, keywords: kws });
    if (res.error) throw new Error(res.error);
    const n = res.count || 0;
    status.textContent = `âœ“ ${n} idea${n !== 1 ? 's' : ''} created. Refreshingâ€¦`;
    status.style.color = '#5ec95e';
    setTimeout(async () => {
      closeSmPromptModal();
      await loadSmPosts();
    }, 1200);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.style.color = '#ff6b6b';
    btn.disabled    = false;
    btn.textContent = 'Run Research';
  }
}

// â”€â”€ CHATGPT STYLE PROMPT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function openChatGPT(title) {
  const prompt = `I'm building short-form vertical videos (1080Ã—1920, TikTok/Reels format) rendered in Remotion (a React video renderer). The caption system shows a rolling window of words synced to audio, with the active spoken word highlighted in a different colour. I control exactly 4 parameters:

- highlightColor â€” hex colour of the active (currently spoken) word
- fontSize â€” pixel size at full 1080px canvas width (68px = standard)
- captionBottom â€” pixels from the bottom of the frame (180 = above phone nav bar)
- windowSize â€” how many words visible at once (1 = karaoke, 4 = standard, 6 = more context)

Font is always Montserrat Black (900 weight), white base, heavy black text shadow. Canvas renders at 720Ã—1280.

Current presets:
- Standard: #FFD700, 68px, 180px, 4 words
- Karaoke: #FFD700, 88px, 140px, 1 word
- Cinematic: #FFFFFF, 58px, 220px, 6 words
- Energy: #FF4500, 76px, 160px, 3 words

Suggest a caption style for a video titled: "${title}"

Return exactly 4 values: highlightColor, fontSize, captionBottom, windowSize. Then briefly explain the vibe.`;
  window.open('https://chatgpt.com/?q=' + encodeURIComponent(prompt), '_blank');
}

// â”€â”€ BACKGROUND IMAGE MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let IMAGE_POST_ID   = '';
let IMAGE_SAVE_PATH = '';

function openImageModal(id) {
  const d = SMP_DATA[id] || {};
  IMAGE_POST_ID   = id;
  IMAGE_SAVE_PATH = 'C:\\Users\\18318\\dash\\images\\' + slugify(d.title || id) + '.jpg';

  const titleShort = (d.title || '').length > 42 ? (d.title || '').slice(0, 42) + 'â€¦' : (d.title || 'Post');
  document.getElementById('imageModalTitle').textContent = 'Background â€” ' + titleShort;

  // Use masterPrompt from Image Style DNA if available, otherwise auto-generate
  let prompt = '';
  if (d.imageStyleDna) {
    try {
      const dna = JSON.parse(d.imageStyleDna);
      if (dna.masterPrompt) {
        prompt = dna.masterPrompt + (d.title ? `\n\nSubject/theme: ${d.title}` : '');
      }
    } catch(e) {}
  }
  if (!prompt) {
    const scriptSnippet = (d.script || '').split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').slice(0, 200);
    prompt = `A cinematic vertical (9:16 portrait) background image for a short-form social media video titled "${d.title || ''}".${scriptSnippet ? '\n\nThe video is about: ' + scriptSnippet : ''}\n\nStyle: photographic, atmospheric, dramatic lighting, no text, no people, high visual contrast, suitable as a dark moody background with white text overlay. TikTok/Instagram Reels format. Ultra high quality.`;
  }

  document.getElementById('imagePromptTa').value = prompt;
  document.getElementById('imageSavePath').value  = IMAGE_SAVE_PATH;
  document.getElementById('imageActualPath').value = d.backgroundImage || IMAGE_SAVE_PATH;
  document.getElementById('imageStyleDna').value   = d.imageStyleDna || '';
  document.getElementById('imageModalStatus').textContent = '';
  document.getElementById('imageModalStatus').className   = 'modal-status';
  document.getElementById('imageModalSave').disabled = false;
  document.getElementById('imageModalSave').textContent = 'Save to Notion';
  document.getElementById('imageModal').classList.add('open');
}

function closeImageModal() {
  document.getElementById('imageModal').classList.remove('open');
}

document.getElementById('imageModal').addEventListener('click', function(e) {
  if (e.target === this) closeImageModal();
});

async function copyImagePromptAndOpen() {
  const prompt = document.getElementById('imagePromptTa').value.trim();
  try {
    await navigator.clipboard.writeText(prompt);
  } catch(e) { /* silent â€” still open the tab */ }
  window.open('https://chatgpt.com', '_blank');
}

async function copyImageSavePath() {
  const path = document.getElementById('imageSavePath').value;
  try {
    await navigator.clipboard.writeText(path);
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = 'Copied âœ“';
    setTimeout(() => { btn.textContent = orig; }, 1200);
  } catch(e) {}
}

async function saveImagePath() {
  const path         = document.getElementById('imageActualPath').value.trim();
  const imageStyleDna = document.getElementById('imageStyleDna').value.trim();
  const btn          = document.getElementById('imageModalSave');
  const status       = document.getElementById('imageModalStatus');
  if (!path) { status.textContent = 'Enter the path where you saved the image.'; return; }
  btn.disabled = true;
  btn.textContent = 'Savingâ€¦';
  try {
    await w('updateSmPostSettings', { id: IMAGE_POST_ID, backgroundImage: path, imageStyleDna });
    if (SMP_DATA[IMAGE_POST_ID]) {
      SMP_DATA[IMAGE_POST_ID].backgroundImage = path;
      SMP_DATA[IMAGE_POST_ID].imageStyleDna   = imageStyleDna;
    }
    // Update the display in the approved list
    const row = document.getElementById('smp-' + IMAGE_POST_ID);
    if (row) {
      let bgEl = row.querySelector('.smp-bgpath');
      if (!bgEl) {
        bgEl = document.createElement('div');
        bgEl.className = 'smp-bgpath';
        row.querySelector('.smp-info').appendChild(bgEl);
      }
      bgEl.textContent = 'ðŸ–¼ ' + path;
    }
    status.textContent = 'Saved âœ“';
    status.className = 'modal-status ok';
    setTimeout(closeImageModal, 700);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.className = 'modal-status err';
    btn.disabled = false;
    btn.textContent = 'Save to Notion';
  }
}

// â”€â”€ SCRIPT EDIT MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let SCRIPT_EDIT_ID = '';

function openScriptModal(id) {
  const d = SMP_DATA[id] || {};
  SCRIPT_EDIT_ID = id;
  const titleShort = (d.title || '').length > 42 ? (d.title || '').slice(0, 42) + 'â€¦' : (d.title || 'Post');
  document.getElementById('scriptModalTitle').textContent = 'Script â€” ' + titleShort;
  document.getElementById('scriptModalTa').value = d.script || '';
  document.getElementById('scriptModalStatus').textContent = '';
  document.getElementById('scriptModalStatus').className = 'modal-status';
  document.getElementById('scriptModalSave').disabled = false;
  document.getElementById('scriptModalSave').textContent = 'Save to Notion';
  document.getElementById('scriptModal').classList.add('open');
  setTimeout(() => document.getElementById('scriptModalTa').focus(), 100);
}

function closeScriptModal() {
  document.getElementById('scriptModal').classList.remove('open');
}

document.getElementById('scriptModal').addEventListener('click', function(e) {
  if (e.target === this) closeScriptModal();
});

async function saveScript() {
  const script = document.getElementById('scriptModalTa').value.trim();
  const btn    = document.getElementById('scriptModalSave');
  const status = document.getElementById('scriptModalStatus');
  btn.disabled = true;
  btn.textContent = 'Savingâ€¦';
  try {
    await w('updateSmPostScript', { id: SCRIPT_EDIT_ID, script });
    // Update in-memory store so render modal picks up the change immediately
    if (SMP_DATA[SCRIPT_EDIT_ID]) {
      SMP_DATA[SCRIPT_EDIT_ID].script = script;
      // Also show/hide the render button without a full reload
      const row = document.getElementById('smp-' + SCRIPT_EDIT_ID);
      if (row) {
        const renderBtn = row.querySelector('.smp-render');
        const editBtn   = row.querySelector('.smp-edit');
        if (script && !renderBtn && editBtn) {
          const btn2 = document.createElement('button');
          btn2.className = 'smp-render';
          btn2.title = 'Render video';
          btn2.textContent = 'â–¶';
          btn2.onclick = () => openRenderModal(SCRIPT_EDIT_ID);
          editBtn.insertAdjacentElement('afterend', btn2);
        }
      }
    }
    status.textContent = 'Saved âœ“';
    status.className = 'modal-status ok';
    setTimeout(closeScriptModal, 700);
  } catch(e) {
    status.textContent = 'Error: ' + e.message;
    status.className = 'modal-status err';
    btn.disabled = false;
    btn.textContent = 'Save to Notion';
  }
}

// â”€â”€ RENDER VIDEO MODAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let RENDER_POST_ID = '';
let RENDER_SLUG    = '';

function slugify(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

async function openRenderModal(id) {
  const d = SMP_DATA[id] || {};
  RENDER_POST_ID = id;
  RENDER_SLUG    = slugify(d.title || '');
  const titleShort = (d.title || '').length > 40 ? (d.title || '').slice(0, 40) + 'â€¦' : (d.title || '');
  document.getElementById('renderModalTitle').textContent = 'Render â€” ' + titleShort;
  // Populate immediately from cached SMP_DATA for fast UX
  document.getElementById('renderScriptTa').value      = d.script || '';
  document.getElementById('renderVoiceId').value        = d.voiceId || '';
  document.getElementById('renderVoiceSettings').value  = d.voiceSettings || '';
  document.getElementById('renderCaptionStyle').value   = d.captionStyle || '';
  document.getElementById('renderCmdStatus').textContent = '';
  document.getElementById('renderCmdStatus').style.color = '#888';
  document.getElementById('renderModal').classList.add('open');
  setTimeout(() => document.getElementById('renderScriptTa').focus(), 100);

  // Fetch fresh data from Notion to get latest values (avoids stale SMP_DATA cache)
  try {
    const fresh = await w('getSmPost', { id });
    if (fresh && !fresh.error) {
      document.getElementById('renderScriptTa').value      = fresh.script || '';
      document.getElementById('renderVoiceId').value        = fresh.voiceId || '';
      document.getElementById('renderVoiceSettings').value  = fresh.voiceSettings || '';
      document.getElementById('renderCaptionStyle').value   = fresh.captionStyle || '';
      // Update local cache
      if (SMP_DATA[id]) Object.assign(SMP_DATA[id], {
        script: fresh.script, voiceId: fresh.voiceId,
        voiceSettings: fresh.voiceSettings, captionStyle: fresh.captionStyle
      });
    }
  } catch(e) { /* silent â€” modal shows cached data if fetch fails */ }
}

function closeRenderModal() {
  document.getElementById('renderModal').classList.remove('open');
}

document.getElementById('renderModal').addEventListener('click', function(e) {
  if (e.target === this) closeRenderModal();
});

async function saveRenderSettings() {
  const voiceId       = document.getElementById('renderVoiceId').value.trim();
  const captionStyle  = document.getElementById('renderCaptionStyle').value.trim();
  const voiceSettings = document.getElementById('renderVoiceSettings').value.trim();
  const statusEl      = document.getElementById('renderCmdStatus');
  if (!RENDER_POST_ID) { statusEl.textContent = 'No post selected.'; return; }

  // Validate JSON fields independently â€” bad JSON is skipped, not a blocker for saving voiceId
  const warnings = [];
  let saveCaptionStyle  = captionStyle  || undefined;
  let saveVoiceSettings = voiceSettings || undefined;
  if (captionStyle)  { try { JSON.parse(captionStyle);  } catch(e) { saveCaptionStyle  = undefined; warnings.push('Caption Style skipped (invalid JSON)'); } }
  if (voiceSettings) { try { JSON.parse(voiceSettings); } catch(e) { saveVoiceSettings = undefined; warnings.push('Voice Settings skipped (invalid JSON)'); } }

  statusEl.style.color = '#888';
  statusEl.textContent = 'Savingâ€¦';
  try {
    const payload = { id: RENDER_POST_ID, voiceId };
    if (saveCaptionStyle  !== undefined) payload.captionStyle  = saveCaptionStyle;
    if (saveVoiceSettings !== undefined) payload.voiceSettings = saveVoiceSettings;
    await w('updateSmPostSettings', payload);
    if (SMP_DATA[RENDER_POST_ID]) Object.assign(SMP_DATA[RENDER_POST_ID], { voiceId, captionStyle, voiceSettings });
    const note = warnings.length ? ' (' + warnings.join('; ') + ')' : '';
    statusEl.style.color = warnings.length ? '#f0a500' : '#5ec95e';
    statusEl.textContent = `âœ“ Saved â€” Voice: ${voiceId || 'none'}${note}`;
  } catch(e) {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = 'Save failed â€” ' + (e.message || 'unknown error');
  }
}

async function copyRenderCommand() {
  const script        = document.getElementById('renderScriptTa').value.trim();
  const voiceId       = document.getElementById('renderVoiceId').value.trim();
  const captionStyle  = document.getElementById('renderCaptionStyle').value.trim();
  const voiceSettings = document.getElementById('renderVoiceSettings').value.trim();
  const statusEl      = document.getElementById('renderCmdStatus');

  if (!RENDER_POST_ID || !RENDER_SLUG) { statusEl.textContent = 'No post selected.'; return; }

  // Validate JSON independently â€” skip invalid fields but don't block save
  let saveCaptionStyle  = captionStyle  || undefined;
  let saveVoiceSettings = voiceSettings || undefined;
  if (captionStyle)  { try { JSON.parse(captionStyle);  } catch(e) { saveCaptionStyle  = undefined; } }
  if (voiceSettings) { try { JSON.parse(voiceSettings); } catch(e) { saveVoiceSettings = undefined; } }

  // Save everything to Notion FIRST (script + settings)
  statusEl.style.color = '#888';
  statusEl.textContent = 'Savingâ€¦';
  try {
    const payload = { id: RENDER_POST_ID, voiceId };
    if (script)               payload.script        = script;
    if (saveCaptionStyle  !== undefined) payload.captionStyle  = saveCaptionStyle;
    if (saveVoiceSettings !== undefined) payload.voiceSettings = saveVoiceSettings;
    await w('updateSmPostSettings', payload);
    if (SMP_DATA[RENDER_POST_ID]) Object.assign(SMP_DATA[RENDER_POST_ID], { voiceId, captionStyle, voiceSettings, script });
  } catch(e) {
    statusEl.style.color = '#ff6b6b';
    statusEl.textContent = 'Save failed â€” ' + (e.message || 'unknown error');
    return;
  }

  // Simple command â€” script + settings all come from Notion automatically
  const cmd = `Set-ExecutionPolicy Bypass -Scope Process -Force; & 'C:\\Users\\18318\\dash\\render-video.ps1' -PostId '${RENDER_POST_ID}' -Slug '${RENDER_SLUG}' -Token '${SESSION_TOKEN || ''}'`;
  try {
    await navigator.clipboard.writeText(cmd);
    statusEl.style.color = '#5ec95e';
    statusEl.textContent = `âœ“ Saved & copied â€” paste into PowerShell`;
  } catch(e) {
    statusEl.style.color = '#f0a500';
    statusEl.textContent = 'âœ“ Saved to Notion â€” clipboard blocked, command in console.';
    console.log('Render command:', cmd);
  }
}

