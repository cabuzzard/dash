# Content Hub hosting — pre-Cloudflare-Pages history & the WP-park blocker

Moved out of `CLAUDE.md` (2026-09-07 cleanup). `CLAUDE.md`'s "Content Hubs" section
keeps the current state (Cloudflare Pages `dash-hubs` + `_worker.js` Host-routing, the
routing table, "Point a custom domain at a hub"). This file is the Bluehost saga that
led there.

---

## Bluehost deploy mechanics (pre-2026-09-03)

**From the pre-2026-09-01 publishing policy:**
- **Bluehost** — a hub gets a line in `.github/bluehost-sites.tsv` (`web/hub/{slug}  <domain>`, remote_path is just the domain name → `/home3/evraymon/<domain>/`) **only once its domain is actually connected to this hosting account and serving.** `/home3/evraymon/<domain>/` is the folder Bluehost auto-creates for a domain at registration and uses as the doc root once connected — deploy into it directly, not a hand-made `public_html/hub-*` dir (the SSH user can't create dirs under `public_html` anyway; home-dir folders it can). rsync, no `--delete`.

## 2026-09-03 — hubs moved OFF Bluehost to CLOUDFLARE PAGES

Bluehost was a dead end: hosting plan at its 50-website cap (`addaddondomain` → "An unknown error occurred"), the primary domain `evraymond.com` isn't even owned (NameBright/HugeDomains nameservers — the cPanel account is just *named* after it), and Bluehost's registrar DNS doesn't sync with its hosting DNS. One Cloudflare Pages project **`dash-hubs`** (account `Trailnotes2026@proton.me`, `9d5b533bbd24bbd32be65bb747a13d8c`) now publishes `web/hub/` — every hub is a subdir — and **`web/hub/_worker.js`** (Pages advanced mode) routes each custom domain to its subdir by `Host` header (map in the `HUBS` const). Deploy: `.github/workflows/deploy-hub-pages.yml` (`wrangler pages deploy web/hub`). Preview any hub at `https://dash-hubs.pages.dev/<slug>/`. **Email stays on Bluehost** — moving a domain to Cloudflare only changes nameservers; Cloudflare's "Add a Site" imports the existing MX records. Full runbook (per-domain steps, email checklist): **`web/hub/CLOUDFLARE-ROUTING.md`**. `creative-flow-guitar`/`creativeflowguitar.com` stays on Bluehost for now (it works — in the `_worker.js` map so it's a one-step migration later).

Also 2026-09-02: ~29 dead cPanel domains/subdomains removed for hygiene, and `outsidesessions.com` + `accessiblefarms.com` briefly parked as aliases (a now-abandoned Bluehost approach — harmless leftovers, remove if tidying).

The hub pages are self-contained (relative/anchor links, Google Fonts, one absolute `WORKER_URL` fetch) so they serve correctly from a domain root — no per-host path rewriting needed.

## The blocker — Bluehost's auto-"WordPress service" park (diagnosed 2026-09-01)

Registering a domain on Bluehost silently connects it to a placeholder "WordPress service" (Domains → `<domain>` → Overview → Connected Services) and **parks** it — the root `@` A record points at `204.11.56.246` (a parking IP), not the hosting server `162.241.218.154` (the domain's own `autoconfig` / `autodiscover` records use the real hosting IP; only `@` is mis-set). While that service is attached: cPanel "Create A New Domain" errors ("An unknown error occurred"), cPanel doc-root edits succeed but the domain still parks, and the account DNS editor rejects an `@` A-record edit ("contained duplicates…"). Bluehost also creates an empty `/home3/evraymon/<domain>/` folder at registration — the deploy fills that for every hub regardless.

**Fix per domain (operator / Bluehost support — potentially destructive, don't do unilaterally):** disconnect the placeholder WordPress service (Domains → `<domain>` → Overview → Connected Services → Manage → disconnect), or ask Bluehost support to point the domain at the cPanel hosting account. Then the already-deployed hub at `/home3/evraymon/<domain>/` serves. `creativeflowguitar.com` works because it was connected the old way, before this auto-WP behavior existed.

**2026-09-04 correction:** the ⚠️ WP-service-park entries in the routing table were stale. Re-checked all five live in-browser (not just cPanel's addon-domain list) — `aisystemimplementation.com`, `accessiblefarms.com`, `stablehomefoundation.com`, `generalservices2020.com`, and `outsidesessions.com` all now load their real hub content correctly over https. Whatever fixed the parking issue happened outside a Claude session (no code/DNS change made here caused it) — don't trust the "parked" diagnosis without re-verifying live first. Only `homestructionconsulting.com` remains actually broken, and for a different reason (never added as a cPanel addon domain at all — confirmed via both the Email Accounts domain picker and the Forwarders domain list, neither shows it).

## Point a custom domain at a hub (Bluehost-era steps, pre-Cloudflare)

1. **Bluehost account → Domains → `<domain>` → Overview → Connected Services → disconnect the placeholder "WordPress service"** (or Bluehost support — "point this domain at my cPanel hosting account"). A newly-registered domain is auto-parked by that service; disconnecting it resets the zone to Bluehost defaults (hosting A record + MX/email + everything) and lets the domain reach the hosting account, which uses `/home3/evraymon/<domain>/` as the doc root and provisions SSL. (`creativeflowguitar.com` predates this and was connected the old way.)
   - If `/home3/evraymon/<domain>/` ends up with a placeholder `index.php` / `index.html` (a WP stub), **rename it** (`index.php` → `_index.php.bak`) so the deployed hub's `index.html` serves. Apache's DirectoryIndex usually prefers `index.html` first anyway, so this is belt-and-braces. As of 2026-09-01 all six pre-domain folders were empty.
2. `.github/bluehost-sites.tsv` — add `web/hub/{slug}` → `<domain>`. Next push deploys the hub to `/home3/evraymon/<domain>/`.
3. `worker/worker.js` → add the domain **apex + www, `https://`** to the `HUB_ORIGINS` set, then deploy the worker. The hub's JS calls the worker (`getHubSocials` on load, `submitLead` on newsletter signup); served from a domain not in `HUB_ORIGINS` those calls fail CORS silently. `CORS`'s `Access-Control-Allow-Origin` is now set per-request via `resolveOrigin()` (reflects the request Origin if allow-listed, else `cabuzzard.github.io`), mutated in `fetch()` right after `NOTION_TOKEN` — same per-request-module-mutable convention. `Vary: Origin` is set so caches don't cross-contaminate.
4. `index.html` → set `domain:` on the hub's `HUB_SITES` entry; tick the **Domain** checklist cell in the Content Hubs tab (`domainlive` key, non-crit).
5. Campaign's `"live site"` property → the custom-domain URL.

## Domain registration details

The domains were chosen via the Content Hubs tab's Domain dropdown (which only saves to browser localStorage) and are now persisted in `HUB_SITES`. The dash tab has a **Routing** column next to Domain showing this status (`hubRoutingCell`, `HUB_SITES[].routing` / `.routingNote`).

`aisystemimplementation.com` + `.online` (free) and `accessiblefarms.com` were registered 2026-09-01; `stablehomefoundation.com`, `outsidesessions.com`, `homestructionconsulting.com` are older. All on Bluehost acct `54027470` (owner contact `renewableartistry.com`), hosting cPanel user `evraymon` / `box5572`.
