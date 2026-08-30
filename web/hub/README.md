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

Live URL: `https://cabuzzard.github.io/dash/web/hub/{slug}/`
(GitHub Pages, live on push — no build step. Deploys to Bluehost only if the
`web/hub/{slug}` path is added to `.github/bluehost-sites.tsv`.)

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
(Turnstile-gated, CORS-allowed for `cabuzzard.github.io`) with
`fraudType: "Other"` and `note: "Newsletter signup — {brand} hub"`. Signups land
in the **Leads** DB tagged with `campaignTag`.

**Upgrade path:** a dedicated `subscribeHub` worker action writing to a real
subscriber list would be cleaner — see the `TODO` in the form handler. Not built
yet.

## Updating every hub after a template change

Same discipline as the microsites: keep the two `EDIT PER HUB` blocks (the
`:root` tokens and the `HUB` object) per hub, replace everything else with the
new template. No sync script yet — do it by hand until there's more than a few.
