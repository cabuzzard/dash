# Flyout addresses — how an outside AI writer reads and rewrites one field

Every position in the Hub Dash 2 entity flyout (the record flyout opened from a row name on the **Hub Dash 2** tab) has an
**address**. Copy one with the `#` next to any field in the flyout, or next to the record's level badge for the whole record.
An outside writer uses the same address to read, set or rewrite exactly that field — the operator can say
"rewrite the blurb on the Post tab of `asset:41c1…1201`" and it resolves to the same field the flyout shows.

The rules live in **one file**, `worker/flyout-map.mjs` (`FlyoutMap`), loaded by both the dash flyout and the worker, so the flyout
and the API can never disagree about what an address means.

## Address format

```
<kind>:<record>[/<tab>/<key>]
```

| kind | record |
|---|---|
| `hub` | the hub's Campaigns page id (32 hex, no dashes) |
| `product`, `title`, `asset` | the Notion page id (32 hex, no dashes) |
| `topic` | `<campaignId>.<topicId>` |
| `cluster` | `<campaignId>.<cluster-name-slug>` |

| tab | key | what it is |
|---|---|---|
| `fields` | slug of the Notion property name (`Platform Title` → `platform-title`) | ✎ Fields — every property; topic/cluster: `name`, `cluster` |
| `post` | `title` · `thumbnail` · `blurb` | 📰 Post — the copy title, thumbnail and blurb (see the lists below) |
| `images` | slug of the image property | 🖼 Images — image fields (link fields; attached files are read-only) |
| `research` | slug of the research field (`Pain Points` → `pain-points`) | 🔬 Research — products (11 fields on 🔬 Product Research) and titles (4) |
| `keywords` | `list` (topic) · `topics` (cluster, read-only) | 🔑 Keywords |

Post tab resolution (first non-empty wins): **title** ← Platform Title · SEO Title · Headline · Post Title · Hub Title;
**thumbnail** ← Thumbnail · Post Image · Instagram Background · Hero Image · Image · Images; **blurb** ← Blurb · Description · Summary ·
Excerpt · Teaser, else the opening of **Body** (then writing `post/blurb` replaces all of Body — `op:map` says so in `note`).

Examples: `asset:41c1f7d3a4bb814a9b86ffe032ad1201/post/blurb` · `product:41c1f7d3a4bb81da9297c5ba84ddffad/research/pain-points` ·
`topic:3f41f7d3a4bb813395dfd4e95b1dfddc.smwmh2tja0p8q/keywords/list`

## The API — worker action `flyout`

POST to the worker (`https://jolly-darkness-5dcc.trailnotes2026.workers.dev`) with either the operator session `token` or the
machine key header `X-External-Key: <EXTERNAL_WORKER_KEY>` (`flyout` is on the external allow-list; every external call is logged to
KV `external:log` with its op and address).

| op | body | returns |
|---|---|---|
| `find` | `{ action:"flyout", op:"find", q:"Email 2", campaignId? }` | `results: [{ address, kind, name }]` — hubs, products, titles, assets by name; with `campaignId` also that hub's topics + clusters |
| `map` | `{ action:"flyout", op:"map", address:"asset:<id>" }` | `{ name, notionUrl, tabs, positions: [{ address, tab, label, field, type, value, editable, options?, note? }] }` |
| `rules` | `{ action:"flyout", op:"rules", address:"asset:<id>" }` | `{ trail, fields: { "<Field>": [{ rule, limits?, source }] } }` — the writing-rule trail (below) |
| `check` | `{ action:"flyout", op:"check", address:"…/post/blurb", value:"draft text" }` | `{ rules, violations }` — checks a draft against the field's contract rule; writes nothing |
| `set` | `{ action:"flyout", op:"set", address:"asset:<id>/post/blurb", value:"…" }` | `{ ok, field, before, after, rules, violations }` — writes the literal value; violations are advisory (as in the writer) |
| `rewrite` | `{ action:"flyout", op:"rewrite", address:"…", guidance:"shorter, lead with the result" }` | `{ ok, field, before, after, violations? }` — runs the dash's own writer on that one position |

`rewrite` is available where a writer exists: **asset** `fields/*` and `post/*` (the governed writer `writeAssetFields`, one contract
field, the guidance as run guidance — method rules, sources and "AI filters, never invents facts" still apply); **product research**
(queued as a background job — read it back with `map` a minute or two later); **title research** (re-runs and keeps only that field).
Anywhere else, write the text yourself and use `set`.

## Writing rules — from Asset Flow to each field

Every position in `map` carries `rules: [{ rule, limits?, source }]` and `contractField`, and `map` / `rules` return the record's **trail**:

| step | what it decides | where it lives |
|---|---|---|
| Asset Flow | the asset type, its parents and children (the authority) | KV `infoflow:table:assetflowgraph` (dash Asset Flow tab) |
| Method | the method the asset is written with | the asset's `Method` relation, else its type's method |
| Current Methods row | the **contract** — one `Field — rule` line per field the writer fills | KV `infoflow:table:currentmethods` |
| Writing Spec | the type's own field rules (+ limits) and the Base rules every type shares (committed rows only) | Notion 🧭 Writing Specs |

Each rule says its `source` (e.g. `Current Methods · Single Post · contract`, `Writing Spec · Base · Title`). The flyout shows the same trail at the top
of ✎ Fields and each field's rules under it (`● contract` marks contract fields). Only **assets** have writing rules today; other
records return a trail `note` saying so — never invent rules for them.

## Procedure for an outside writer

1. Resolve the record: `find` by name (or take the address the operator pasted).
2. `map` it — confirm the position exists, read its current `value`, `type`, `note` and **`rules`**.
3. Either `rewrite` (preferred where available — the dash's writer does the work under its rules) or write the new text **to every rule listed for that
   position**, `check` it, fix any violation, then `set` it.
4. Report before → after to the operator, with the rules you followed and any violation left.

Never edit these records directly in Notion for a flyout field: `set` / `rewrite` go through the worker's normal actions
(`entitySave`, `updateProductStrategyField`, `saveTitleResearch`, `kwHubApply`, `writeAssetFields`), which apply the Keywords-hierarchy
guard, the Review → Development rule, the Asset Type mapping and hub re-publishing. Rich text is saved as plain text.
