# Content Hub — live site template

A content-marketing home page for a brand: **blog posts, news, newsletter signup,
social links, product links**. One shared layout; each hub gets its own colour,
type, and logo.

```
web/hub/
├── hub-template.html          # the template (this is the sync source)
├── {slug}/index.html          # one hub per campaign/product
└── surf-vacations/index.html  # first build — seeded from the "Diving Vacations"
                               #   Research record (surf keywords + product ideas)
```

Origin URL: `https://cabuzzard.github.io/dash/web/hub/{slug}/`
(GitHub Pages, live on push — no build step.)

**Every hub is also published to Bluehost** — `.github/bluehost-sites.tsv` maps
`web/hub/{slug}` straight into the domain's own folder `/home3/evraymon/<domain>/`
(remote_path is just the domain name), rsynced on every push to `main` that
touches `web/**`. That's the folder Bluehost auto-creates at registration and
uses as the doc root once the domain is connected, so we deploy into it directly.
The GitHub Pages copy stays as the always-on origin/staging URL.

### Point a custom domain at a hub

1. Own the domain (Bluehost Domains tab → it shows up in the dashboard Domains list).
2. `.github/bluehost-sites.tsv` — confirm the `web/hub/{slug} → <domain>` line
   exists (all current hubs are listed). Push; the deploy fills `~/<domain>/`.
3. **Bluehost account → Domains → `<domain>` → Overview → "Connections" → connect
   it to the hosting plan** (or Bluehost support). A freshly-registered domain
   serves a parked page until this is done, and cPanel "Create A New Domain"
   errors on it. Connecting points the doc root at `~/<domain>/` (already filled)
   and provisions SSL — hub live immediately.
4. `worker/worker.js` → add the domain, **apex + www, https**, to `HUB_ORIGINS`,
   then deploy the worker. Without this the newsletter form and social links break
   with a CORS error when the page is served from the custom domain.
5. `index.html` → set `domain:` on the hub's `HUB_SITES` entry, and tick the
   **Domain** checklist cell in the Content Hubs tab.
6. Set the Campaign's **`live site`** property to the custom-domain URL.

## Make a new hub

A hub can be built from **a campaign Research record** or **a Product** — either
one supplies the seed content.

1. `cp hub-template.html {slug}/index.html`
2. **Design tokens** — edit the `:root` block at the top of `<style>` (marked
   `EDIT PER HUB`): `--bg / --surface / --ink / --line / --sea / --deep /
   --accent`, the three `--font-*` faces, and `--logo-*`. Update the Google
   Fonts `<link>` in `<head>` to match the fonts you chose.
3. **Content** — edit the `HUB` object in the bottom `<script>` (marked
   `EDIT PER HUB`):
   - `slug`, `campaignTag` (`campaignTag` lands on each newsletter lead for routing)
   - `brand`, `logoImg`, `nav`, `ribbon`
   - `hero` — write real copy from the Research `Statement` / `Unique Opportunity`
     / `Key Message`, or the Product's `Description` / `Transformation`
   - `journal.items` / `news.items` — leave `[]` until posts exist; the empty
     state renders and the section still shows
   - `trips.items` — seed from Research `Product Ideas` or the campaign's real
     Products (`{kicker, title, excerpt, url}`; `url:"#"` shows "Coming soon")
   - `social.items` — real profile URLs, or `"#"` placeholders
4. Push to `main`.
5. Set the Campaign's **`live site`** URL property to the hub URL — feeds the
   **LVE** column in the dashboard.

## Sections & empty states

Every section always renders. When an `items` array is empty, `HUB.<section>.empty`
(`{heading, body}`) shows instead of cards — write it as an invitation, not an
apology.

## Newsletter

The signup form posts to the existing public `submitLead` worker action
(Turnstile-gated) with `fraudType: "Other"` and
`note: "Newsletter signup — {brand} hub"`. Signups land in the **Leads** DB
tagged with `campaignTag`. CORS: allowed for `cabuzzard.github.io` plus every
origin in the worker's `HUB_ORIGINS` set — add a hub's custom domain there
before serving the hub from it (see "Point a custom domain at a hub" above).

**Upgrade path:** a dedicated `subscribeHub` worker action writing to a real
subscriber list would be cleaner — see the `TODO` in the form handler. Not built
yet.

## Updating every hub after a template change

Same discipline as the microsites: keep the two `EDIT PER HUB` blocks (the
`:root` tokens and the `HUB` object) per hub, replace everything else with the
new template. No sync script yet — do it by hand until there's more than a few.
