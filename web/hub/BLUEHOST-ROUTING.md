# Content hubs on Bluehost — parked-domain routing

The Bluehost hosting plan hit its **50-website cap**, so hub domains can't be
added as Bluehost "websites" or cPanel addon domains (`addaddondomain` fails with
"An unknown error occurred"). The workaround: add each hub domain as a **parked
domain / alias** (`cpapi2 Park park` — aliases don't count against the cap), all
sharing `evraymond.com`'s docroot, then one **generic** `HTTP_HOST` RewriteRule
in `~/public_html/.htaccess` routes any host whose `hub-<host>/` folder exists to
that folder.

Everything stays on Bluehost: default nameservers, Bluehost hosting, Bluehost
email (aliases don't touch MX).

## The one `.htaccess` rule (write once, never edit per hub)

Add to the **top** of `~/public_html/.htaccess`, above `# BEGIN WordPress`:

```apache
# BEGIN Content Hub routing — generic, never edit per hub.
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteCond %{HTTP_HOST} ^(?:www\.)?(.+)$ [NC]
RewriteCond %{DOCUMENT_ROOT}/hub-%1 -d
RewriteCond %{REQUEST_URI} !^/hub-%1/
RewriteRule ^(.*)$ /hub-%1/$1 [L]
</IfModule>
# END Content Hub routing
```

`evraymond.com` has no `hub-evraymond.com` folder → the `-d` test fails → the
rule is skipped and WordPress serves normally. Only parked hub domains (which
have a matching folder) get rewritten.

## Deploy targets — folders named by DOMAIN

`.github/bluehost-sites.tsv` deploys `web/hub/<slug>/` → `public_html/hub-<domain>/`.

| hub slug | parked domain | folder |
|---|---|---|
| surf-vacations | outsidesessions.com | `public_html/hub-outsidesessions.com` |
| sunflower-acres | accessiblefarms.com | `public_html/hub-accessiblefarms.com` |
| care-gap | stablehomefoundation.com | `public_html/hub-stablehomefoundation.com` |
| owners-rep | homestructionconsulting.com | `public_html/hub-homestructionconsulting.com` |
| home-services | generalservices2020.com | `public_html/hub-generalservices2020.com` |
| ai-implementation | aisystemimplementation.com | `public_html/hub-aisystemimplementation.com` |
| creative-flow-guitar | creativeflowguitar.com | `~/creativeflowguitar.com` (older setup — NOT on this rule) |
| mountainwize | — (no domain yet) | GitHub Pages only |

## Launching a new hub domain (no Apache edit)

1. `cpapi2 Park park domain=<domain>` in the cPanel Terminal → `result: 1`.
2. Add one line to `.github/bluehost-sites.tsv`:
   `web/hub/<slug>` + TAB + `public_html/hub-<domain>`.
3. `worker/worker.js` — add the domain (apex + www, `https://`) to `HUB_ORIGINS`;
   `index.html` — set `HUB_SITES[].domain`.
4. Push. The `deploy-bluehost` workflow rsyncs the folder into place.
5. `dig <domain> +short` → must be `162.241.218.154`. If it shows `66.81.203.198`
   (Bluehost parking IP), fix `@` + `www` A-records in Bluehost → Domains → DNS.
6. cPanel → SSL/TLS Status → Run AutoSSL for the domain.

## Multi-page hubs

No special handling. The RewriteRule passes the full path through, `rsync -rlvz`
syncs the whole tree, and `<domain>/blog/` serves `hub-<domain>/blog/index.html`.
Keep hub links **relative** (`blog/`, `../`) so they also work at the GitHub
Pages fallback URL. A hub folder can carry its own `.htaccess` for pretty URLs —
independent of the generic rule.

## First-time setup (2026-09-02, in progress)

- Parked: `outsidesessions.com`, `accessiblefarms.com`.
- To do (operator — Claude Code's classifier blocks repeated cPanel API mutations):
  - Park `stablehomefoundation.com`, `homestructionconsulting.com`,
    `generalservices2020.com`.
  - Convert `aisystemimplementation.com` from addon → parked
    (`cpapi2 AddonDomain deladdondomain domain=aisystemimplementation.com subdomain=aisystemimplementation_evraymond.com`
    then `cpapi2 Park park domain=aisystemimplementation.com`).
  - Add the generic `.htaccess` rule above.
  - `dig` check + fix DNS A-records where needed + Run AutoSSL.
