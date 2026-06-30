"""
Patch all microsites:
 1. Replace three-col SEC 5 with two two-col rows (Product Ideas+TikTok | KDP+YouTube Outliers)
 2. Add renderYouTubeOutliers() + runYouTubeOutliers() JS functions
 3. Wire loadResearch() to render youtubeOutliers field
"""

import os, re, pathlib

MICROSITES = pathlib.Path(r"C:\Users\flipo\repo\dash\microsites")

# ── HTML: old three-col block → new two two-col blocks ────────────────────────
OLD_HTML = '''\
<!-- SEC 5: three col — product ideas / tiktok shop / kdp best sellers -->
<div class="three-col">
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>Product Ideas</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="prodIdeasKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="prodIdeasBtn" onclick="runProductIdeas()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-prodideas"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>TikTok Shop</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="ttShopKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="ttShopBtn" onclick="runTikTokShop()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-ttshop"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>KDP Best Sellers</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="kdpKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="kdpBtn" onclick="runKDPBestSellers()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-kdp"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
</div>'''

NEW_HTML = '''\
<!-- SEC 5a: two col — product ideas / tiktok shop -->
<div class="two-col">
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>Product Ideas</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="prodIdeasKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="prodIdeasBtn" onclick="runProductIdeas()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-prodideas"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>TikTok Shop</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="ttShopKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="ttShopBtn" onclick="runTikTokShop()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-ttshop"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
</div>

<!-- SEC 5b: two col — kdp best sellers / youtube outliers -->
<div class="two-col">
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>KDP Best Sellers</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="kdpKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="kdpBtn" onclick="runKDPBestSellers()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-kdp"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
  <div class="col">
    <h2 style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span>YouTube Outliers</span>
      <span style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <input id="ytOutliersKwInput" type="text" placeholder="override keywords…" style="font-size:11px;padding:3px 7px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);width:100px;outline:none">
        <button id="ytOutliersBtn" onclick="runYouTubeOutliers()" style="font-size:11px;padding:3px 10px;border:1px solid var(--border,#ddd);border-radius:6px;background:var(--surface,#fff);color:var(--text,#111);cursor:pointer;white-space:nowrap">⟳ search</button>
      </span>
    </h2>
    <div class="content">
      <div id="r-ytoutliers"><div class="loading"><div class="spinner"></div>Loading…</div></div>
    </div>
  </div>
</div>'''

# ── JS: new render + run functions (inserted after renderKDPBestSellers block) ─
OLD_JS_ANCHOR = '''\
async function runProductIdeas() {'''

NEW_JS_ANCHOR = '''\
function renderYouTubeOutliers(text) {
  const el = document.getElementById('r-ytoutliers');
  if (!el) return;
  if (!text || !text.trim()) {
    el.innerHTML = '<span class="empty">No results yet — press ⟳ search to find YouTube outliers.</span>';
    return;
  }
  const lines = text.trim().split('\\n').filter(l => l.trim());
  el.innerHTML = lines.map(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return `<div class="sm-trend-row" style="cursor:pointer" onclick="openTdModal(this.dataset.prefill)" data-prefill="${line.trim().replace(/"/g,'&quot;')}"><span class="sm-trend-body">${line}</span></div>`;
    const title = line.slice(0, colonIdx).trim();
    const desc  = line.slice(colonIdx + 1).trim();
    return `<div class="sm-trend-row" style="cursor:pointer" onclick="openTdModal(this.dataset.prefill)" data-prefill="${title.replace(/"/g,'&quot;')}"><span class="sm-trend-niche">${title}</span><span class="sm-trend-body">${desc}</span></div>`;
  }).join('');
}

async function runYouTubeOutliers() {
  const btn = document.getElementById('ytOutliersBtn');
  const el  = document.getElementById('r-ytoutliers');
  const kwOverride = (document.getElementById('ytOutliersKwInput')?.value || '').trim();
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  el.innerHTML = '<div class="loading"><div class="spinner"></div>Searching YouTube…</div>';
  try {
    const data = await w('getYouTubeOutliers', { researchId: RESEARCH_ID_LIVE || RESEARCH_ID, kwOverride });
    if (data.error) { el.innerHTML = `<span class="empty" style="color:#c0392b">${data.error}</span>`; return; }
    renderYouTubeOutliers(data.text || '');
  } catch(e) {
    el.innerHTML = '<span class="empty" style="color:#c0392b">Search failed — try again.</span>';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ search'; }
  }
}

async function runProductIdeas() {'''

# ── JS: wire loadResearch() to render youtubeOutliers ─────────────────────────
OLD_LOAD_ANCHOR = '''\
    // SEC 3 — KDP Best Sellers field
    renderKDPBestSellers(r.kdpBestSellers || '');'''

NEW_LOAD_ANCHOR = '''\
    // SEC 3 — KDP Best Sellers field
    renderKDPBestSellers(r.kdpBestSellers || '');

    // SEC 5b — YouTube Outliers field
    renderYouTubeOutliers(r.youtubeOutliers || '');'''


def patch(path):
    text = path.read_text(encoding='utf-8')
    changed = False

    if OLD_HTML in text:
        text = text.replace(OLD_HTML, NEW_HTML, 1)
        changed = True

    if OLD_JS_ANCHOR in text and 'runYouTubeOutliers' not in text:
        text = text.replace(OLD_JS_ANCHOR, NEW_JS_ANCHOR, 1)
        changed = True

    if OLD_LOAD_ANCHOR in text and 'youtubeOutliers' not in text:
        text = text.replace(OLD_LOAD_ANCHOR, NEW_LOAD_ANCHOR, 1)
        changed = True

    if changed:
        path.write_text(text, encoding='utf-8')
        return True
    return False


patched = []
skipped = []
for p in sorted(MICROSITES.glob("*/index.html")):
    if patch(p):
        patched.append(p.parent.name)
    else:
        skipped.append(p.parent.name)

print(f"Patched ({len(patched)}):")
for n in patched: print(f"  ✓ {n}")
if skipped:
    print(f"\nSkipped / already up-to-date ({len(skipped)}):")
    for n in skipped: print(f"  – {n}")
