# Initiatives — read access for outside editors

Outside editors (Buzz and other tools holding the external key) can read the **new** initiatives and every record in them, to sort
through records by initiative. Read only: nothing is changed by this call.

## Call

`POST` the worker with header `X-External-Key: <EXTERNAL_WORKER_KEY>` (or `externalKey` in the body):

```json
{ "action": "getInitiatives" }
```

| body field | default | meaning |
|---|---|---|
| `scope` | `"new"` | `"new"` = initiatives created from **2026-11-19** on (the ones the operator now builds with). `"all"` adds the older ones (`"new": false`). |
| `name` | — | only this initiative (any case) |
| `titles` | `true` | `false` skips looking up title names (faster) |

## Answer

```json
{ "ok": true, "scope": "new", "newSince": "2026-11-19", "count": 2, "initiatives": [
  { "name": "Micro Apps", "new": true, "createdAt": "2026-11-19T21:40:02.000Z",
    "note": "the initiative's notes (📝 in the dash)", "noteAt": "2026-11-19T22:10:00.000Z",
    "assetCount": 7,
    "assets": [ { "assetId": "41d1…", "name": "…", "type": "Single Post", "status": "Development", "deadline": "2026-11-28",
                  "run": "", "subInitiative": "", "titleId": "41d1…", "title": "free review app for small businesses",
                  "productId": "4081…", "campaignId": "3b51…", "hub": { "slug": "ai-implementation", "name": "AI Implementation" },
                  "address": "asset:41d1…", "url": "https://www.notion.so/…" } ],
    "products": [ { "productId": "…", "product": "…", "sub": "", "campaignId": "…", "hub": { … }, "address": "product:…" } ] } ] }
```

- **assets** = every live asset whose own **Initiative** field is that name (archived / trashed left out).
- **products** = products the product map gives that initiative. In the Hub Dash 2 table an asset with no Initiative of its own shows its
  product's initiative, so these products' assets belong to the initiative there too.
- **address** works with the `flyout` action (see `docs/flyout-addresses.md`) to read or rewrite a field of that record.
- Initiatives come newest first. An initiative with no assets yet is still listed.

Every external call is logged (KV `external:log`).
