# Content hubs on Bluehost — parked-domain routing

The Bluehost hosting plan hit its **50-website cap**, so hub domains can't be
added as Bluehost "websites" or cPanel addon domains (`addaddondomain` fails with
"An unknown error occurred"). The workaround: add each hub domain as a **parked
domain / alias** (`cpapi2 Park park` — aliases don't count against the cap), all
sharing `evraymond.com`'s docroot, then route each one to its own hub folder with
a `HTTP_HOST` RewriteRule in `~/public_html/.htaccess`.

Everything stays on Bluehost: default nameservers, Bluehost hosting, Bluehost
email (aliases don't touch MX).

## Mapping

| hub slug | parked domain | folder (deploy target) |
|---|---|---|
| surf-vacations | outsidesessions.com | `public_html/hub-surf-vacations` |
| sunflower-acres | accessiblefarms.com | `public_html/hub-sunflower-acres` |
| care-gap | stablehomefoundation.com | `public_html/hub-care-gap` |
| owners-rep | homestructionconsulting.com | `public_html/hub-owners-rep` |
| home-services | generalservices2020.com | `public_html/hub-home-services` |
| ai-implementation | aisystemimplementation.com | `public_html/hub-ai-implementation` (addon domain — set its docroot here, or re-park it) |
| creative-flow-guitar | creativeflowguitar.com | `~/creativeflowguitar.com` (older setup, unchanged) |

## Adding a new hub domain

1. `cpapi2 Park park domain=<domain>` in the cPanel Terminal → `result: 1`.
2. Add a block to the **top** of `~/public_html/.htaccess` (above `# BEGIN WordPress`):
   ```apache
   RewriteCond %{HTTP_HOST} ^(www\.)?<domain-escaped>$ [NC]
   RewriteCond %{REQUEST_URI} !^/hub-<slug>/
   RewriteRule ^(.*)$ /hub-<slug>/$1 [L]
   ```
3. Add a line to `.github/bluehost-sites.tsv`: `web/hub/<slug>\tpublic_html/hub-<slug>`.
4. `dig <domain> +short` → must be `162.241.218.154`. If it's `66.81.203.198`
   (Bluehost parking IP), fix `@` + `www` A-records in Bluehost → Domains → DNS.
5. cPanel → SSL/TLS Status → Run AutoSSL for the domain.
6. `worker/worker.js` — the domain (apex + www, `https://`) is in `HUB_ORIGINS`
   (all six current hub domains already are), and `index.html` `HUB_SITES[].domain`.
7. Push — the `deploy-bluehost` workflow rsyncs `web/hub/<slug>/` into the folder.

## Multi-page hubs

No special handling. The RewriteRule passes the full path through, `rsync -rlvz`
syncs the whole tree, and `outsidesessions.com/blog/` serves
`hub-surf-vacations/blog/index.html`. Keep hub links **relative** (`blog/`, `../`)
so they also work at the GitHub Pages fallback URL. A hub folder can carry its own
`.htaccess` for pretty URLs — independent of the parent routing block.
