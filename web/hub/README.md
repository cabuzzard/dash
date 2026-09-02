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

## Design spec — the master (`hubs.design.json`)

`web/hub/hubs.design.json` is the single source of truth for every hub's colour,
type, and `<head>` meta. Edit values there, then push them into the hub HTML:

```
node scripts/build-hubs.mjs           # apply the spec (rewrites the 8 hub files)
node scripts/build-hubs.mjs --check    # verify only — exit 1 if any hub drifted (use in CI / pre-commit)
node scripts/build-hubs.mjs --deck <hub-deck.html>       # also re-sync the Hub Deck artifact
node scripts/build-hubs.mjs --editor <hub-editor.html>   # also re-sync the Hub Colour Editor artifact
```

It only ever rewrites three regions of `{slug}/index.html`: the `<title>` +
`description` + `og:*` meta, the Google Fonts `<link>`, and the `:root` DESIGN
TOKENS block. `SHARED LAYOUT` and the `RENDER` script are never touched. The
build also runs a WCAG contrast check and warns (it does not block).

Per hub the spec holds: `meta` (title/description/ogTitle/ogDescription),
`fonts` (display/body/mono — family names that must exist in `fontRegistry`),
`logoText`, `tokens` (the 10 `--*` values), `tokenNotes` (the `/* … */`
comments), and a `design` block — the written brief for the hub (subject,
audience, the page's one job, the type reasoning, the signature element, the one
aesthetic risk, what was deliberately avoided, and the superseded palette). The
`design` block replaces the old per-hub `DESIGN.md` files: one spec, no drift.
The Hub Deck reads the same `tokens` so each card wears its hub's own palette.

To **iterate a design**: change the values in `hubs.design.json`, run
`build-hubs.mjs`, eyeball the diff, commit, push. It's a config change, not a
hand-edit of eight files. The **Hub Colour Editor** artifact (linked from the
Content Hubs tab) is a visual way to do the colour part — assign each role from
the palette or a picker with a live preview, then copy the `tokens` block back
into this file.

### From a photo / reference image

`scripts/palette-from-photo.mjs` turns a handful of reference colours into a
hub's full token set (contrast-checked) and writes it into `hubs.design.json`:

```
node scripts/palette-from-photo.mjs sunflower-acres "#c98b2e,#f0e6cf,#4a6d3a,#2b2016" --light --build
```

Pull 4–6 dominant colours off the photo (list them most-prominent first),
pass `--light` or `--dark` for the ground, `--build` to push straight into the
HTML. The reference colours are an *input* — the derived tokens still drive the
whole page, and you refine them in `hubs.design.json` or the editor afterward.
The palette **is** the hub's look: `--bg` is the page, `--ink-head` the
headings, `--ink` the body, `--sea` the links, `--accent` the buttons,
`--deep` the dark band.

**A hub is published to Bluehost only once its domain is connected.** Pre-domain
hubs live on GitHub Pages (`cabuzzard.github.io/dash/web/hub/{slug}/`) and that's
it. When a domain comes online, add `web/hub/{slug} → <domain>` to
`.github/bluehost-sites.tsv`; the deploy then rsyncs the hub into
`/home3/evraymon/<domain>/` (the folder Bluehost auto-creates at registration and
uses as the doc root once connected). Only `creative-flow-guitar` is in the tsv today.

### Point a custom domain at a hub

1. Own the domain (Bluehost Domains tab → it shows up in the dashboard Domains list).
2. **Bluehost account → Domains → `<domain>` → Overview → Connected Services →
   disconnect the placeholder "WordPress service"** (or Bluehost support — "point
   this domain at my cPanel hosting account"). A freshly-registered domain is
   auto-parked by that service; disconnecting resets the zone to Bluehost
   defaults (hosting + email) and lets it reach the hosting account, which uses
   `/home3/evraymon/<domain>/` as the doc root and provisions SSL.
   - If that folder has a placeholder `index.php` / `index.html`, rename it
     (`index.php` → `_index.php.bak`) so the hub's `index.html` serves.
3. `.github/bluehost-sites.tsv` — add `web/hub/{slug} → <domain>`. Push; the
   deploy fills `~/<domain>/` and the hub is live.
4. `worker/worker.js` → add the domain, **apex + www, https**, to `HUB_ORIGINS`,
   then deploy the worker. Without this the newsletter form and social links break
   with a CORS error when the page is served from the custom domain.
5. `index.html` → set `domain:` on the hub's `HUB_SITES` entry, and tick the
   **Domain** checklist cell in the Content Hubs tab.
6. Set the Campaign's **`live site`** property to the custom-domain URL.

## Make a new hub

A hub can be built from **a campaign Research record** or **a Product** — either
one supplies the seed content.

0. **Add the hub to `web/hub/hubs.design.json`** — a `hubs.<slug>` entry with
   `meta`, `fonts`, `logoText`, `tokens`, `tokenNotes`, and a `design` block
   (subject / audience / job / type / signature / risk / avoided / superseded).
   The `design` block is the brief — write it before the colours, and update it
   whenever the research gets better. It's fine to start thin and refine.
1. `cp hub-template.html {slug}/index.html`
2. **`node scripts/build-hubs.mjs`** — this writes the `<head>` meta, the fonts
   `<link>`, and the `:root` token block from the spec. Never hand-edit those in
   the HTML. For a brand-new font, add one line to `fontRegistry` first.
3. **Content** — edit the `HUB` object in the bottom `<script>` (marked
   `EDIT PER HUB`):
   - `slug`, `campaignTag` (`campaignTag` lands on each newsletter lead for routing)
   - `brand`, `logoImg`, `nav`, `ribbon`
   - `hero` — write real copy from the Research `Statement` / `Unique Opportunity`
     / `Key Message`, or the Product's `Description` / `Transformation`
   - `journal.items` — leave `[]` until posts exist; the empty state renders.
   - `news.items` — the **static fallback**. When `campaignId` is set, the news
     section is **live-fed**: the worker's `getHubNews` reads the campaign's
     Research record "News Feed" field, parses it (headlines, and a source /
     year where the item carries one — no URLs), and replaces `news.items` on
     load. Re-running research in Notion refreshes the hub. Leave `items: []`
     and write a good `empty` state for hubs whose research has no News Feed yet.
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
