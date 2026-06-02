with open('C:/Users/18318/dash/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

marker = '// ── TRADES ────────────────────────────────────────────────────────────'
end    = '</script>\n</body>\n</html>'

idx_start = content.index(marker)
idx_end   = content.index(end, idx_start)

new_js = r"""// ── TRADES ────────────────────────────────────────────────────────────
let tradesLoaded = false;
let tradesCache  = [];
let activeTrade  = null;
let tradeDir     = 'C';

function setTradeDir(d) {
  tradeDir = d;
  document.getElementById('trDirC').className = d === 'C' ? 'btn btn-primary' : 'btn btn-secondary';
  document.getElementById('trDirP').className = d === 'P' ? 'btn btn-primary' : 'btn btn-secondary';
}

function openNewTradeModal() {
  tradeDir = 'C';
  setTradeDir('C');
  ['trTicker','trStrike','trExpiry','trNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('tradeModal').classList.add('open');
  setTimeout(() => document.getElementById('trTicker').focus(), 300);
}
function closeTradeModal() { document.getElementById('tradeModal').classList.remove('open'); }

async function saveTrade() {
  const ticker = document.getElementById('trTicker').value.trim().toUpperCase();
  const strike = document.getElementById('trStrike').value.trim();
  const expiry = document.getElementById('trExpiry').value.trim();
  const notes  = document.getElementById('trNotes').value.trim();
  if (!ticker || !strike || !expiry) { showToast('Fill in ticker, strike and expiry', 'error'); return; }
  const btn = document.getElementById('tradeSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await call('saveTrade', { ticker, strike, expiry, direction: tradeDir, notes });
    closeTradeModal();
    tradesLoaded = false;
    await loadTrades();
    showToast('Trade saved — price updates within 30 min', 'success');
  } catch(e) {
    showToast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Trade';
  }
}

async function loadTrades() {
  const tbody = document.getElementById('tradesTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text3);padding:20px 10px;">Loading…</td></tr>';
  try {
    const data = await call('getTrades');
    tradesCache = data.trades || [];
    renderTradeTable();
  } catch(e) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="error-msg">' + e.message + '</td></tr>';
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) + ' ' +
         d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
}

function fmtExpiry(s) {
  if (!s || s.length < 8) return s || '';
  return s.slice(4,6) + '/' + s.slice(6,8) + '/' + s.slice(2,4);
}

function pctColor(v) {
  if (v == null) return 'var(--text3)';
  return v >= 0 ? '#00cc66' : '#ff4444';
}

function renderTradeTable() {
  const tbody = document.getElementById('tradesTableBody');
  if (!tbody) return;
  if (!tradesCache.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="color:var(--text3);font-style:italic;padding:20px 10px;">No trades yet. Tap + New Trade to log your first call.</td></tr>';
    return;
  }
  tbody.innerHTML = tradesCache.map(t => {
    const dir      = t.direction === 'C' ? 'Call' : 'Put';
    const entryP   = t.entry_price   != null ? '$' + t.entry_price   : '…';
    const curP     = t.current_price != null ? '$' + t.current_price : '…';
    const curPct   = t.current_pct   != null ? (t.current_pct >= 0 ? '+' : '') + t.current_pct.toFixed(1) + '%' : '';
    const curColor = pctColor(t.current_pct);
    const maxH     = t.max_high != null
      ? '$' + t.max_high + '<br><span style="font-size:10px;color:var(--text3);">' + fmtDate(t.max_high_time) + '</span>'
      : '…';
    const maxL     = t.max_low != null
      ? '$' + t.max_low + '<br><span style="font-size:10px;color:var(--text3);">' + fmtDate(t.max_low_time) + '</span>'
      : '…';
    let badge;
    if (t.expired)              badge = '<span class="tr-badge-exp">Expired</span>';
    else if (t.strike_reached)  badge = '<span class="tr-badge-struck">★ Hit</span>';
    else                        badge = '<span class="tr-badge-open">Open</span>';
    const rowClass = t.expired ? 'expired' : '';
    return `<tr class="${rowClass}" onclick="openTradeDetail('${t.id}')">
      <td><span class="tr-sym">${t.ticker}</span> <span style="font-size:11px;color:var(--text3);">${dir}</span></td>
      <td class="tr-mono">${entryP}</td>
      <td class="tr-mono">${t.strike}</td>
      <td class="tr-mono">${fmtExpiry(t.expiry)}</td>
      <td class="tr-up">${maxH}</td>
      <td class="tr-dn">${maxL}</td>
      <td style="color:${curColor};font-family:'DM Mono',monospace;">${curP} <span style="font-size:11px;">${curPct}</span></td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function showTradeList() {
  document.getElementById('tradesListView').style.display = 'block';
  document.getElementById('tradesDetailView').classList.remove('active');
}

function openTradeDetail(id) {
  activeTrade = tradesCache.find(t => t.id === id);
  if (!activeTrade) return;
  document.getElementById('tradesListView').style.display = 'none';
  document.getElementById('tradesDetailView').classList.add('active');
  renderTradeDetail();
}

function renderTradeDetail() {
  const t   = activeTrade;
  const el  = document.getElementById('tradesDetailContent');
  const dir = t.direction === 'C' ? 'Call' : 'Put';

  const strikeDist = t.entry_price != null
    ? ((t.strike - t.entry_price) / t.entry_price * 100).toFixed(1) : null;
  const maxHPct = (t.max_high != null && t.entry_price != null)
    ? ((t.max_high - t.entry_price) / t.entry_price * 100).toFixed(1) : null;
  const maxLPct = (t.max_low != null && t.entry_price != null)
    ? ((t.max_low - t.entry_price) / t.entry_price * 100).toFixed(1) : null;
  const curPct = t.current_pct != null
    ? (t.current_pct >= 0 ? '+' : '') + t.current_pct.toFixed(1) + '%' : '…';

  let statusBadge;
  if (t.expired)             statusBadge = `<span class="tr-badge-exp">Expired ${fmtExpiry(t.expiry)}</span>`;
  else if (t.strike_reached) statusBadge = `<span class="tr-badge-struck">★ Strike hit ${fmtDate(t.strike_reached_time)}</span>`;
  else                       statusBadge = `<span class="tr-badge-open">Open — expires ${fmtExpiry(t.expiry)}</span>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:20px;font-weight:700;">${t.ticker} $${t.strike} <span style="color:var(--text3);font-size:14px;font-weight:500;">${dir}</span></div>
      ${statusBadge}
    </div>

    <div class="tr-section-label">At Entry</div>
    <div class="tr-grid3">
      <div class="tr-stat">
        <div class="tr-stat-label">Underlying</div>
        <div class="tr-stat-val">${t.entry_price != null ? '$' + t.entry_price : '…'}</div>
        <div class="tr-stat-sub">${fmtDate(t.entry_time)}</div>
      </div>
      <div class="tr-stat">
        <div class="tr-stat-label">Strike</div>
        <div class="tr-stat-val">$${t.strike}</div>
        <div class="tr-stat-sub">${strikeDist != null ? (t.direction === 'C' ? '+' : '-') + Math.abs(strikeDist) + '% away' : ''}</div>
      </div>
      <div class="tr-stat">
        <div class="tr-stat-label">Now</div>
        <div class="tr-stat-val" style="color:${pctColor(t.current_pct)};">${t.current_price != null ? '$' + t.current_price : '…'}</div>
        <div class="tr-stat-sub">${curPct}</div>
      </div>
    </div>

    <div class="tr-section-label">Range Since Entry</div>
    <div class="tr-grid2">
      <div class="tr-stat">
        <div class="tr-stat-label">Max High</div>
        <div class="tr-stat-val tr-up">${t.max_high != null ? '$' + t.max_high : '…'}</div>
        <div class="tr-stat-sub">${maxHPct != null ? '+' + maxHPct + '% &nbsp;·&nbsp; ' : ''}${fmtDate(t.max_high_time)}</div>
      </div>
      <div class="tr-stat">
        <div class="tr-stat-label">Max Low</div>
        <div class="tr-stat-val tr-dn">${t.max_low != null ? '$' + t.max_low : '…'}</div>
        <div class="tr-stat-sub">${maxLPct != null ? maxLPct + '% &nbsp;·&nbsp; ' : ''}${fmtDate(t.max_low_time)}</div>
      </div>
    </div>

    ${t.notes ? `<div style="font-size:12px;color:var(--text3);padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:4px;">${t.notes}</div>` : ''}

    <div style="margin-top:20px;">
      <button class="btn btn-secondary" style="color:var(--danger);border-color:#2a1a1a;width:100%;height:40px;font-size:13px;"
        onclick="confirmDeleteTrade('${t.id}')">Delete Trade</button>
    </div>`;
}

async function confirmDeleteTrade(id) {
  if (!confirm('Delete this trade?')) return;
  try {
    await call('deleteTrade', { id });
    tradesCache = tradesCache.filter(t => t.id !== id);
    showTradeList();
    renderTradeTable();
    showToast('Trade deleted');
  } catch(e) {
    showToast(e.message, 'error');
  }
}
"""

new_content = content[:idx_start] + new_js + '\n' + end

with open('C:/Users/18318/dash/index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Done. Lines:', new_content.count('\n'))
