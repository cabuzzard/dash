# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a static GitHub Pages site (`cabuzzard/dash`, hosted at `https://cabuzzard.github.io/dash/`) backed by a **Cloudflare Worker** that proxies all Notion API calls and handles auth.

```
dash/
├── index.html                          # Main Hermes dashboard (all campaigns, logins matrix)
├── microsites/
│   ├── style.css                       # Shared admin microsite styles
│   ├── microsite-index.html            # STALE — not the real sync source, see below
│   ├── hard-grind/index.html           # ACTUAL sync source (sync_microsites.py TEMPLATE)
│   ├── sync_microsites.py              # Propagates hard-grind/index.html to every {deploy-path} below
│   └── {deploy-path}/index.html        # Per-campaign admin microsite (copy of hard-grind)
├── productsites/
│   ├── operator-resilience-intensive/index.html  # ACTUAL sync source (sync_productsites.py TEMPLATE)
│   ├── sync_productsites.py            # Propagates that file to every {product}/index.html below
│   └── {product}/index.html            # Per-product admin page (copy of the template above)
├── web/
│   └── {deploy-path}/index.html        # Public-facing live campaign pages
├── docs/
│   └── methods-titles-assets.md        # How the Methods/Titles/Assets modals + generation routing work
└── worker/
    ├── worker.js                        # Cloudflare Worker (single file, all actions)
    └── wrangler.toml                    # Worker config (name: jolly-darkness-5dcc)
```

**Editing a microsite or product-site template:** always edit `hard-grind/index.html` or
`operator-resilience-intensive/index.html` respectively (the real sync sources), then run the matching
`sync_*.py` script to propagate. Editing `microsite-index.html` directly does nothing — it's disconnected
from the sync pipeline despite the name.

**Deploys are automatic**: pushing to `main` triggers `.github/workflows/deploy-worker.yml` (on
`worker/**` changes) and `.github/workflows/deploy-bluehost.yml` (on `web/**` changes, per the mapping in
`.github/bluehost-sites.tsv`). `microsites/` and `productsites/` are plain GitHub Pages content — no
separate deploy step, they're live as soon as the push lands.

**Content generation system** (Methods → Titles → Assets, the "Add Methods"/"Generate Titles"/"Produce
Assets" modals, and why there are several different generation code paths depending on method type): see
`docs/methods-titles-assets.md`.

## Cloudflare Worker

**URL:** `https://jolly-darkness-5dcc.trailnotes2026.workers.dev`
**Account:** trailnotes2026@proton.me
**Deploy:** `cd worker && npx wrangler deploy` (Wrangler 4.84.1)

All secrets are set via `wrangler secret put` and never hardcoded:
- `NOTION_TOKEN` — Notion integration token
- `PIN` — 4-digit admin access code
- `HMAC_SECRET` — signs/verifies session tokens
- `TURNSTILE_SECRET` — Cloudflare Turnstile verification key

**PowerShell pipe caveat:** always `.trim()` secrets read from `env.*` — PowerShell pipes add a trailing newline.

### Auth Flow
1. Admin pages POST `{ action: 'auth', pin }` → worker returns `{ token }` (HMAC-SHA256, 8hr expiry)
2. Token stored in `sessionStorage` as `hermes_token`
3. All subsequent calls include `token` in body; worker verifies via `verifyToken()`
4. Public lead forms use Cloudflare Turnstile (`tsToken`) — no session token needed

### Worker Actions (key ones)
- `auth` — verify PIN, return HMAC token
- `submitLead` — write lead to Leads DB (validates `fraudType` against allowlist)
- `getResearch` — fetch Research record linked to a campaign
- `getTitles` — Content Strategy titles by stage/campaign
- `getCampaignTodos` / `createTodo` / `unlinkTodoFromCampaign` — Main TD tasks
- `getLogins` / `getPlatforms` / `createLoginFull` / `updateLoginFull` — Logins × Platforms
- `createCampaign` — add a new campaign page in Campaigns DB
- `updateResearch` / `updateCampaignKeywords` / `updateCampaignField` — Notion writes
- `updateTitleStage` — move a content title to a new stage
- `condense` — call Claude (Haiku) to summarize research fields for display

CORS is locked to `https://cabuzzard.github.io` only.

## Notion Databases

All 10 databases live directly under 🏠 Home:

| Database | ID |
|---|---|
| Campaigns | `087b1163b4e64975bc7a4b686ff801de` |
| Content Strategy | `9fa5f42f010b47e7a82032607e07d6a1` |
| Products | `e92fcfce75fc4f54b553df0b7672ff48` |
| Main TD | `3471f7d3a4bb80de87c1d9e850f4a426` |
| Methods | `285ed0b668be4dad89dfd090350096bc` |
| Logins | `72d262278a4c4786b375959432fdd82a` |
| Platforms | `8248b700ebb7428aa28d8b5246509898` |
| Assets | `e91bdb6e770b4d298e9f62166a0fd5de` |
| Research | `557e6b7b8c434a578d45ecb0a8329f63` |
| Leads | `e4518a459f004eb0b9646e48d8718705` |
| Emails | `6252e9917027488fb628436aabb89947` |

The **Leads DB** `Campaign` field is plain text — any campaign form submits to the same DB with a different `campaign` value. The `Fraud Type` field (a Notion select) accepts the values in `validFraudTypes` in `worker.js` — **keep that allowlist in sync with Notion's select options**.

## Admin Microsite System

Each campaign gets its own admin microsite at `microsites/{deploy-path}/index.html`.

**To deploy a new microsite:**
1. Copy `microsites/microsite-index.html` to `microsites/{deploy-path}/index.html`
2. Change exactly 4 JS constants (lines ~351–354) and 2 Notion links (line ~94):

```javascript
// JS constants — unique per microsite:
const WORKER_URL  = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"; // same for all
const CAMPAIGN_ID = "{notion-campaign-page-id}";   // Campaigns DB page ID
const RESEARCH_ID = "{notion-research-page-id}";   // Research DB page ID (for Notion link only)
const SITE_URL    = "https://cabuzzard.github.io/dash/microsites/{deploy-path}/";
```

```html
<!-- Notion links in SEC 1 (~line 94): -->
<a href="https://www.notion.so/{campaign-id}" ...>↗ Campaign</a>
<a href="https://www.notion.so/{research-id}" ...>↗ Research</a>
```

3. Push to GitHub (`git add`, `git commit`, `git push`)
4. Set the `"microsite"` URL property on the Campaign record in Notion to `https://cabuzzard.github.io/dash/microsites/{deploy-path}/` — this feeds the **STE** column in the overview
5. Set `Web Page URL` on the Research record to the microsite URL

**To update all microsites** (after changes to `microsite-index.html`):
- Preserve only the unique header block (4 JS constants + 2 Notion links per site)
- Replace everything else with the updated template content

## Live (Public) Campaign Sites

Public lead-gen pages at `web/{deploy-path}/index.html`.
Live URL pattern: `https://cabuzzard.github.io/dash/web/{deploy-path}/`

- No auth — just the lead form with Cloudflare Turnstile CAPTCHA
- Turnstile site key: `0x4AAAAAADUjP18lSj4N0zt1` (production, same domain for all pages)
- Submit to worker: `{ action: 'submitLead', campaign: '{deploy-path}', email, phone, fraudType, note, tsToken }`
- `fraudType` value must be in the worker's `validFraudTypes` allowlist
- Set the `"live site"` URL property on the Campaign record in Notion — this feeds the **LVE** column in the overview

## Admin Microsites

Admin-only pages at `microsites/{deploy-path}/index.html`.
Live URL pattern: `https://cabuzzard.github.io/dash/microsites/{deploy-path}/`

- Set the `"microsite"` URL property on the Campaign record in Notion — this feeds the **STE** column in the overview

## Deployed Campaigns

| Deploy Path | Microsite | Live Site | Campaign ID | Research ID |
|---|---|---|---|---|
| `foreclosure-fraud` | ✓ | ✓ | `3681f7d3a4bb8195a655d6f022e257f1` | `3681f7d3a4bb81e29542e24d178a3ad1` |
| `estate-divorce-property-resource` | ✓ | ✓ | `3691f7d3a4bb81de93d9fa2f0607deb7` | `3691f7d3a4bb8150b543f42f77c7ce3a` |
| `lead-gen-small-business` | ✓ | ✓ | `3721f7d3a4bb813ebc1de7576df0ca0a` | `3721f7d3a4bb8101a3cce42f55bfbec1` |
| `mobility-mentor-fundraising` | ✓ | ✓ | `34b1f7d3a4bb81b6a8a8fee04df94807` | `3661f7d3a4bb81adaaadc2ce80784112` |
| `mobility-mentor-services` | — | ✓ | — | — |
| `ai-lead-gen-local-services` | ✓ | — | `34f1f7d3a4bb81c2be96c022bdd1ef40` | `36d1f7d3a4bb81ab8dbbcfdfff7428e3` |
| `small-business-adu-ca` | ✓ | — | `3591f7d3a4bb811a907aeea020352484` | `3731f7d3a4bb814598eed9735cf331d3` |
| `small-business-re-agent-ca` | ✓ | — | `3731f7d3a4bb816f9d9cd5bffda0549d` | `3731f7d3a4bb8117b12ddfb70d5a5ced` |
| `mountainwize-coaching` | — | ✓ | — | — |
| `webguy` | — | ✓ | — | — |
| `garden-planning-calendar-workbook` | ✓ | ✓ | `3981f7d3a4bb81a69924cdc633e96828` | `3981f7d3a4bb815c90c4ef64e4324572` |

## Security Notes

- `noindex, nofollow` on all admin microsites
- `X-Frame-Options: DENY` on all pages
- HMAC tokens expire after 8 hours
- GitHub repo should be private (pending)
- Rotate Notion integration token if ever exposed (pending)
