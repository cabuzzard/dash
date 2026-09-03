# Content hubs on Cloudflare Pages

All hubs are served from **one Cloudflare Pages project, `dash-hubs`** (account
`Trailnotes2026@proton.me`, `9d5b533bbd24bbd32be65bb747a13d8c`). The project
publishes `web/hub/` — every hub is a subdirectory (`web/hub/<slug>/`) — and
`web/hub/_worker.js` (Pages advanced mode) routes each custom domain to its
subdirectory by `Host` header.

- Preview / any hub direct: `https://dash-hubs.pages.dev/<slug>/`
- Deploy: `.github/workflows/deploy-hub-pages.yml` on push to `web/hub/**`
  (`wrangler pages deploy web/hub --project-name dash-hubs`). Needs the
  `CLOUDFLARE_API_TOKEN` secret to have **pages:write** (the deploy-worker token
  may need re-scoping).

## Domain ↔ hub

| domain | hub slug |
|---|---|
| outsidesessions.com | surf-vacations |
| accessiblefarms.com | sunflower-acres |
| stablehomefoundation.com | care-gap |
| homestructionconsulting.com | owners-rep |
| generalservices2020.com | home-services |
| aisystemimplementation.com | ai-implementation |
| creativeflowguitar.com | creative-flow-guitar (migrated 2026-09-03; old ~/creativeflowguitar.com files left on Bluehost) |
| mountainwize.com | mountainwize (old WordPress "Mountain Wize Coaching" site left on Bluehost, domain pointed away) |

Map lives in `web/hub/_worker.js` `HUBS`.

## Why Cloudflare, not Bluehost

Bluehost hosting plan is at its 50-website cap (`addaddondomain` fails "An
unknown error occurred"); the primary domain `evraymond.com` isn't even owned
(NameBright/HugeDomains nameservers); registrar DNS and hosting DNS don't sync.
Cloudflare Pages: unlimited custom domains, free, no per-site limit, one deploy.

## EMAIL stays on Bluehost

Moving a domain to Cloudflare only changes its **nameservers** — mail is a
separate concern. When you Add a Site in Cloudflare it **scans and imports the
existing DNS**, including the `MX` records that point at Bluehost mail. Keep
those. Cloudflare hosts the DNS; Bluehost keeps delivering the mail. Nothing
about mailboxes, IMAP/SMTP, or webmail changes.

## Bringing a hub domain live (one-time, per domain)

1. **Cloudflare dash → Add a Site** → enter the domain → Free plan.
   - Cloudflare scans the current DNS. **Verify the `MX` record(s) and any
     `mail` / `autoconfig` / `autodiscover` / SPF (`TXT v=spf1`) / DKIM / DMARC
     records were imported** — they must stay pointing at Bluehost. Add any that
     didn't import (copy from Bluehost → Domains → `<domain>` → DNS).
   - Do NOT yet add `@` / `www` web records — the Pages custom-domain step adds
     them.
2. Cloudflare shows two nameservers (e.g. `xyz.ns.cloudflare.com`). At
   **Bluehost → Domains → `<domain>` → Nameservers → Change** → set those two.
3. Wait for the domain to go **Active** in Cloudflare (email keeps flowing the
   whole time — MX is unchanged).
4. **Cloudflare dash → Workers & Pages → `dash-hubs` → Custom domains → Set up a
   custom domain** → add `<domain>` and `www.<domain>`. Cloudflare creates the
   proxied `CNAME`/`A` records and issues SSL automatically.
5. Add the domain (apex + `www`, `https://`) to `worker.js` `HUB_ORIGINS` and
   `index.html` `HUB_SITES[].domain` if not already there (all six current hub
   domains already are). Confirm the `HUBS` map in `_worker.js` has the domain.

Done — `https://<domain>/` serves the hub, `https://<domain>/blog/…` etc. all
route through.

## Adding a brand-new hub

`web/hub/<slug>/` folder + one line in `_worker.js` `HUBS` + push + the 5 steps
above for its domain. No Apache, no website-count limit, no server.
