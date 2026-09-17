# qa-methods

Runs the **QA – Product / QA – Sales / QA – Story** methods conversationally, from any Claude chat session (desktop, mobile/Claude phone app) instead of the dashboard's Generate Assets modal — no dashboard, no PIN, no browser needed. This is a second **entry point**, not a second implementation: it calls the exact same worker actions the dashboard modal calls, so if the worker's generation/publish logic ever changes, this skill's behavior changes with it automatically.

## Trigger phrases
"run QA story/sales/product for [product]", "interview me about [idea]", "write a testimonial/story/sales page/digital product for [product] from chat".

## Prerequisites
- Nothing beyond a normal chat session — no Canva, no video, no browser automation. QA methods are pure text + Notion writes, so the worker does all of the actual work; this skill is only the conversational front end (asking the interview questions live, one at a time, instead of a modal form).
- Worker: `https://jolly-darkness-5dcc.trailnotes2026.workers.dev` — plain POST, `Content-Type: application/json`. These specific actions need no PIN/session token.
- The operator doesn't need to name a campaign — every generate action below resolves it automatically from the product's own Campaigns relation.

## Constants
Products DB `e92fcfce75fc4f54b553df0b7672ff48` · Methods DB `285ed0b668be4dad89dfd090350096bc` (the three Methods — `QA – Product`, `QA – Sales`, `QA – Story` — already exist there, Status Live).

## Step 1 — pick the method and product
Ask which of the three methods, and which product, if not already given. Resolve the product by name:
```
{ "action": "searchProducts", "query": "<name the operator gave>" }
```
→ `{ "products": [{ "id", "name" }, ...] }`. If more than one match, list them and ask which one. For `QA – Product`, also ask which digital product type: `ebook`, `checklist`, `spreadsheet`, or `design bundle`.

## Step 2 — get the raw idea
Ask for the raw idea this is seeded from, in the operator's own words — a sentence or two is enough. Don't invent or pad it.

## Step 3 — fetch the interview questions
```
{ "action": "craftQaQuestions", "methodKey": "story"|"sales"|"product", "productId": "<id>", "idea": "<idea>", "productType": "<only for product>" }
```
→ `{ "questions": [{ "key", "question" }, ...], "productName" }`. These are grounded in the product's own 🔬 Product Research — deliberately asking only what isn't already on file there.

## Step 4 — the actual interview (this is the point of the skill)
Ask each question **one at a time, in the chat**, and wait for the operator's real reply before moving to the next one — never present the whole list at once and ask them to fill in a form, and never answer on their behalf. For `story`, at least two questions dig for the real anecdote (what specifically happened, when, the concrete detail, how it resolved) — a model cannot invent a real personal experience, only the operator can supply it. If the operator wants to skip a question, leave that answer blank rather than making something up.

## Step 5 — generate
Once every question is answered, kick off the job — it does NOT return the finished result directly, only a `jobId`:
- **Sales / Story:**
  ```
  { "action": "generateQaContent", "methodKey": "sales"|"story", "productId": "<id>", "idea": "<idea>", "answers": [{ "key", "question", "answer" }, ...] }
  ```
  → `{ "jobId" }`.
- **Product:**
  ```
  { "action": "generateQaProduct", "productId": "<id>", "idea": "<idea>", "productType": "<type>", "answers": [...] }
  ```
  → `{ "jobId" }`.

Then drive it to completion yourself by calling this in a loop, waiting a couple seconds between calls:
```
{ "action": "advanceQaJob", "jobId": "<jobId>" }
```
Each call runs exactly one step server-side (fetch research → write with Claude → create title → create asset(s) → publish) and checkpoints it — it always returns quickly, never hangs. Responses look like:
- In progress: `{ "done": false, "step": "<name>" }` — keep looping.
- Transient failure: `{ "done": false, "step": "<name>", "error": "<message>" }` — **not fatal**, nothing is lost; just call `advanceQaJob` again with the same `jobId` to retry that same step. Only give up (and tell the operator) after several consecutive errors on the same step.
- Finished: `{ "done": true, "result": {...} }` — for Sales/Story, `result` is `{ success, titleId, assetId, sectionCount, sitePublished, liveUrl, siteError }`; for Product, `{ success, titleId, parentAssetId, title, components: [{ id, label, kind }], awaitingCanva }`.

This job never silently disappears — it's checkpointed in KV after every step, so if the chat session itself gets interrupted, resuming and calling `advanceQaJob` again with the same `jobId` picks up right where it left off (no re-interview needed).

## Step 6 — report back
- **Sales / Story:** the live link (`liveUrl`, when `sitePublished` is true) and the Notion asset link `https://www.notion.so/<assetId>`.
- **Product:** the component list, flagging how many are `awaitingCanva` (`kind: "visual"`) — those are real design files (covers/templates) that need to be made separately in Canva, since a Worker can't produce one; point the operator at the parent asset `https://www.notion.so/<parentAssetId>` to see each one's design brief.

## Notes
- Safe to run repeatedly — every run creates a new title (or, for Product, a new parent asset + its sub-assets); it never overwrites a prior QA run.
- Do not build any of this method's generation/publish logic here — if something about the output seems wrong, the fix belongs in `worker.js` (`craftQaQuestions` / `generateQaContent` / `generateQaProduct`), never duplicated into this skill's own instructions.
