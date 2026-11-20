# Contact lists — one store for every list (event lists, lead lists, …)

**GoHighLevel holds every person once** (deduped by email / phone). **A list is a tag** on the contact. A person can be on many lists.
KV `contactlists:v1` is the **registry**: one row per list (name, source, hub, purpose, event, count, import history).

| tag | meaning |
|---|---|
| `list:<slug>` | the list, e.g. `list:event-austin-home-expo-2026-11`, `list:lead-multifamily-buyers` |
| `hub:<slug>` | which hub the list belongs to (optional) |
| `consent:none` / `consent:email` / `consent:sms` / `consent:email-sms` | what the person agreed to. Event contacts are `none` unless they signed up for something |
| any extra tags you send | lower-case slugs, max 10 per contact (e.g. `hot`, `wants-quote`) |

List slug naming: `event-<event>-<yyyy-mm>` for events, `lead-<vertical>` for lead lists, `<purpose>-<yyyy-mm>` otherwise.

## Calls (worker, `X-External-Key` header — Buzz's key works)

### importContacts
```json
{
  "action": "importContacts",
  "list": "event-austin-home-expo-2026-11",
  "listName": "Austin Home Expo — Nov 2026",
  "hub": "home-services",
  "source": "Live event: Austin Home Expo booth",
  "purpose": "Follow up personally about quotes",
  "event": { "name": "Austin Home Expo", "date": "2026-11-15", "location": "Austin, TX" },
  "consent": "none",
  "dryRun": true,
  "contacts": [
    { "firstName": "Maria", "lastName": "Gomez", "email": "maria@example.com", "phone": "+15125550134",
      "company": "Gomez Remodeling", "role": "Owner", "website": "gomezremodel.com", "city": "Austin", "state": "TX",
      "interest": "Review app, website", "note": "Met at booth, wants a call next week", "tags": ["hot"], "consent": "email" }
  ]
}
```
- Required: `list`, `source`, `contacts` (1–100; send more in further calls with the same `list`). Each contact needs an email or a phone.
- `name` may be sent instead of `firstName` / `lastName`. Per-contact `consent` overrides the list's.
- `hub` = a hub slug (e.g. `home-services`, `ai-implementation`, `medicare-services-consulting`) or leave it out.
- **`dryRun: true`** checks everything and returns the cleaned rows and the skipped ones — nothing is written. Always do one dry run first.
- Writing: each contact is added or updated in GHL; tags are **added** (existing tags stay); company / role / interest / note go in a contact note.
  No opportunities are created and nobody is added to a newsletter or SMS list.
- Answer: `{ ok, list, tag, created, updated, skipped:[{i, name, reason}], errors:[{i, error}], listCount }` (`i` = position in your `contacts`).

### getContactLists
`{ "action": "getContactLists" }` → every list in the registry, newest first: slug, tag, name, source, hub, purpose, event, consent, count, import history.

Every external call is logged (KV `external:log`).
