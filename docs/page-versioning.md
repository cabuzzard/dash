# Page versioning — rules for any coding chat

This file is for any AI coding chat or human working on this repo (Claude, ChatGPT, Cursor, Copilot…). It doesn't
depend on any one chat's tools. It covers how a static page here shows which version you're on, how the operator gets the
newest one (often on an iPhone home-screen shortcut with no address bar), and what you have to do when you ship a change.

## Why

Pages are static files on **GitHub Pages** (`https://cabuzzard.github.io/dash/...`). GitHub Pages serves them with
`Cache-Control: max-age=600`, so a phone can keep showing the old page for up to 10 minutes after a push. Shared
scripts can be cached even longer. Without a version marker, nobody can tell whether a fix "didn't work" or just
hasn't loaded yet.

## The pattern (3 parts)

1. **Version = publish time.** The version is the page's own `Last-Modified` time (`document.lastModified`), the
   moment GitHub Pages published the file. There's no number to bump by hand and nothing to forget.
2. **Version bar in the page header:** `v <date time>` · **↻ Update** · **🔗 Link** (plus any quick links the page wants).
   - ↻ Update reloads with a cache-busting `?v=<base36 timestamp>` so the browser can't serve its cached copy.
   - 🔗 Link copies the full address and opens a prompt to edit it, for shortcuts that have no address bar.
3. **Newer-version banner.** The page sends a `HEAD` request for its own URL (`cache: 'no-store'` plus a throwaway
   query param). If the server's `Last-Modified` is newer than the page's own, it shows an orange "A newer version is
   out — tap to update" banner. The check runs 4 s after load, every 10 min, and whenever the tab becomes visible again.

Live examples: `index.html` (search `verBar`) and `microsites/care-gap-v2/index.html`.

## Drop-in snippet (plain HTML + JS, no dependencies)

Put the bar in the page header and the banner just under it:

```html
<span id="verBar" style="font-size:10px;opacity:.75;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;">
  <span id="verText" title="When this version of the page was published">v …</span>
  <button onclick="verUpdate()" title="Load the newest version (skips the cached copy)" style="font-size:10px;padding:1px 6px;border:1px solid #888;border-radius:5px;background:transparent;color:inherit;cursor:pointer;">↻ Update</button>
  <button onclick="verLink()" title="See / copy / edit this page's address" style="font-size:10px;padding:1px 6px;border:1px solid #888;border-radius:5px;background:transparent;color:inherit;cursor:pointer;">🔗 Link</button>
</span>
<div id="verNew" onclick="verUpdate()" style="display:none;margin:6px 16px 0;padding:6px 10px;border-radius:8px;background:#f6ad55;color:#1a1a1a;font-size:12px;cursor:pointer;">⬆ A newer version of this page is out — tap to update</div>
```

```html
<script>
// Version bar: version = when GitHub Pages published this file (Last-Modified). See docs/page-versioning.md.
(function () {
  const fmt = d => d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const mine = new Date(document.lastModified);
  const vt = document.getElementById('verText'); if (vt) vt.textContent = 'v ' + (isNaN(mine) ? '?' : fmt(mine));
  async function check() {
    try {
      const r = await fetch(location.pathname + '?vcheck=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
      const lm = new Date(r.headers.get('last-modified'));
      if (!isNaN(lm) && !isNaN(mine) && lm - mine > 1000) {
        const b = document.getElementById('verNew');
        if (b) { b.style.display = 'block'; b.textContent = '⬆ A newer version (' + fmt(lm) + ') is out — tap to update'; }
      }
    } catch (e) {}
  }
  setTimeout(check, 4000); setInterval(check, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
})();
function verUpdate() {
  const u = new URL(location.href); u.searchParams.set('v', Date.now().toString(36)); u.searchParams.delete('vcheck');
  location.replace(u.toString());
}
async function verLink() {
  const cur = location.href;
  try { await navigator.clipboard.writeText(cur); } catch (e) {}
  const next = prompt("This page's address (already copied). Edit it and press OK to open it:", cur);
  if (next && next.trim() && next.trim() !== cur) location.href = next.trim();
}
</script>
```

Don't add a version number constant. The publish time *is* the version.

## Rules when you ship a change

1. **Shared scripts need a manual version tag.** A page loads shared code like `<script src="shared/interview-panel.js?v=2026101101">`.
   The page's own version check only covers the HTML file, so when you edit a shared `.js` file you **must**
   bump its `?v=` in **every** page that loads it, or phones keep the old script:
   - Format: `YYYYMMDDNN` (date plus a 2-digit counter for the day).
   - Find every page: `grep -rl "interview-panel.js?v=" --include=*.html .`
   - Replace them all in one scripted pass that keeps line endings (the repo uses CRLF). Don't hand-edit 40 files.
2. **Don't remove or rename** `verBar`, `verText`, `verNew`, `verUpdate` or `verLink`. Other pages and the operator's habits depend on them.
3. **New quick links go inside `verBar`** (after 🔗 Link), styled like the existing buttons. Link out with `target="_blank" rel="noopener"`.
4. **A new standalone page the operator opens on a phone gets the version bar.** Copy the snippet above.
5. **Microsites built from the template:** add it to the sync source (`microsites/hard-grind/index.html`), then run
   `python microsites/sync_microsites.py`. `care-gap-v2` isn't covered by the sync and has to be edited by hand.

## Checking that a change is live (any chat, any shell)

After pushing to `main`, GitHub Pages usually republishes in 1–2 minutes:

```sh
# 1. Has the live file been republished? (compare with your push time)
curl -sI "https://cabuzzard.github.io/dash/index.html?vcheck=$(date +%s)" | grep -i last-modified
# 2. Does the live file contain your change? (grep for a name you added)
curl -s "https://cabuzzard.github.io/dash/index.html?cb=$(date +%s)" | grep -c "yourNewFunctionName"
```

Then tell the operator to tap **↻ Update**, or the orange banner, to load it. Don't tell them it's live until check 2 finds your change.

The **Cloudflare Worker** (`worker/worker.js`) has no version bar. A worker change is live as soon as `wrangler deploy`
finishes, and that output prints the version ID. Front-end and worker changes ship separately: a new button that calls a
new worker action needs **both** the deploy and the Pages publish.
