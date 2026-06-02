# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a static GitHub Pages site (`cabuzzard/dash`, hosted at `https://cabuzzard.github.io/dash/`) backed by a **Cloudflare Worker** that proxies all Notion API calls and handles auth.

```
dash/
├── index.html                          # Main Hermes dashboard (all campaigns, logins matrix)
├── microsites/
│   ├── style.css                       # Shared admin microsite styles
│   ├── microsite-index.html            # CANONICAL TEMPLATE for all admin microsites
│   └── {deploy-path}/index.html        # Per-campaign admin microsite (copy of template)
├── web/
│   └── {deploy-path}/index.html        # Public-facing live campaign pages
└── worker/
    ├── worker.js                        # Cloudflare Worker (single file, all actions)
    └── wrangler.toml                    # Worker config (name: jolly-darkness-5dcc)
```

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

| Deploy Path | Microsite | Live Site | Campaign ID |
|---|---|---|---|
| `foreclosure-fraud` | ✓ | ✓ | `3681f7d3a4bb8195a655d6f022e257f1` |
| `estate-divorce-property-resource` | ✓ | ✓ | `3691f7d3a4bb81de93d9fa2f0607deb7` |
| `lead-gen-small-business` | ✓ | ✓ | `3721f7d3a4bb813ebc1de7576df0ca0a` |
| `mobility-mentor-fundraising` | ✓ | ✓ | `34b1f7d3a4bb81b6a8a8fee04df94807` |
| `mobility-mentor-services` | — | ✓ | — |
| `ai-lead-gen-local-services` | ✓ | — | `34f1f7d3a4bb81c2be96c022bdd1ef40` |
| `mountainwize-coaching` | — | ✓ | — |
| `webguy` | — | ✓ | — |

## Security Notes

- `noindex, nofollow` on all admin microsites
- `X-Frame-Options: DENY` on all pages
- HMAC tokens expire after 8 hours
- GitHub repo should be private (pending)
- Rotate Notion integration token if ever exposed (pending)
