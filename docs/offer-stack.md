# Offer Stack — from a niche Report to a sellable offer (PROPOSAL, not built)

Operator, 2026-11-24: "so I have to create the items that are suggested in the opportunities, but then sell those using selling points of them" →
"propose an asset cluster for this" → "save that thought because I want to build these … but needs more detail".

Status: **design only.** Nothing below exists yet. Three approvals are needed before building (see § 7).
Naming: it's a **stack** (a group of asset types); "cluster" means a keyword cluster only.

---

## 1. Why

The operator sells **implementation / consulting** (AI implementation for construction-software niches, mid-sized operations, real estate),
not software. A niche **Report** already gathers the evidence (search demand, dissatisfaction searches, pains, complaints, sources, audience
questions). Two things are missing:

1. The report's **Opportunities** section is one sentence + source numbers per item, content and offer ideas mixed. It doesn't say what to
   sell, to whom, or why they'd buy.
2. There's no path from an opportunity to the assets that **sell** it.

The Offer Stack closes both: Report → offer card → ⚒ Make offer → Offer (private) + its selling children.

```
Report (private · exists)
  └─ Opportunity card  ── ⚒ Make offer ──►  Offer  (Parent · private · Development)
                                               ├─ Single Post Run · kind "selling points"   (Publish, unwritten)
                                               ├─ Direct Sales Email · kind "sequence"      (Publish, unwritten)
                                               ├─ Offer Sales Page                          (Publish, unwritten)
                                               └─ CTA × kinds                               (Publish, unwritten)
Lead List ─► Direct Sales Email   (existing edge: who the emails go to)
```

---

## 2. Part 1 — Opportunities become offer cards (inside the Report)

**Where:** `reportBuild` analysis schema, worker.js (~line 1419: today `opportunities: { type:"array", items: pt }`).
Renderer `reportHtml` is **duplicated** in `index.html` and `web/hub/ai-implementation/members/index.html` — change both together.

### 2.1 Schema (replaces `opportunities`)

```js
opportunities: { type: "array", minItems: 0, maxItems: 5, items: { type: "object", required: [...all below], properties: {
  name:        string,  // offer name, plain: "Procore Field Adoption Sprint"
  forWho:      { company: string,   // type + size: "GCs, 50-300 staff, already paying for Procore"
                 buyer: string },   // the role who signs: "COO / operations director"
  problem:     { text: string,
                 pains: int[],      // numbers of the report's Pain points it solves
                 complaints: int[], // numbers of the report's Complaints
                 searches: string[] },// exact dissatisfactionSearches it rests on
  deliverables: string[],           // 3-5 concrete things the buyer gets
  delivery:    "solo" | "solo+no-code" | "needs dev partner",
  deliveryWhy: string,              // one line: what makes it that
  evidence:    { point: string, refs: int[] }[],  // demand / proof, each cited (sources or searchDemand)
  headline:    string,              // buyer's own words, for outreach — built from a complaint/search, not invented
  firstMove:   { where: string,     // where these buyers are: user groups, associations, LinkedIn titles…
                 send: string },    // what to send first (usually: the report)
  strength:    "strong" | "medium" | "thin",
  strengthWhy: string,
  selling: {                        // the selling points — copied onto the Offer by ⚒ Make offer
    benefits:   { point, refs }[],  // outcome for the buyer
    proof:      { point, refs }[],  // cited facts / search numbers
    objections: { objection: string, answer: string, refs: int[] }[]   // from the report's Risks + complaints
  } } } }
```

Prompt rules (added to the existing ones):
- Offers only — service packages the operator can deliver (audit, rollout, migration, adoption, training, integration via partner).
  Content ideas go to `nextTitles`, never here.
- Every problem must point at ≥1 numbered pain or complaint; an opportunity with nothing behind it is dropped, not padded.
- **No prices, no client names, no outcome numbers** unless a source says them. Price is the operator's field (§ 4.1).
- Sort strongest first. `thin` is allowed and must say why (it tells the operator what to research next).
- Token budget: analysis goes from 5000 → ~7000 max tokens (one call; cost note in § 8).

### 2.2 Display (both renderers)

Section **💡 Opportunities → Offers**, one card per item, strongest first:

```
┌ Procore Field Adoption Sprint                          ● strong
│ For: GCs, 50–300 staff, already on Procore · buys: COO
│ Solves: pain 2, complaint 1 · "procore field app problems" 90/mo
│ You'd deliver: field workflow map · app setup · 2 crew trainings · 30-day usage report
│ Delivery: you + no-code — no custom code needed
│ Headline: "Paying for Procore but the field still runs on texts?"
│ First move: local AGC chapter + Procore user group — send this report
│ ▸ Selling points (benefits 3 · proof 4 · objections 2)
│ [⚒ Make offer]   (dash + superadmin only; members see the card without the button)
└
```
Pain/complaint numbers are links that jump to those items (same `rp-ref` style as source refs). Highlights/notes keep working
(the section keeps `data-sec="opportunities"`).

Old reports (plain `{point, refs}` items) still render the old list — the renderer checks the item shape.

---

## 3. Part 2 — the Offer Stack assets

All are **existing Asset Flow types** (consolidate, don't add parallel types). Each child has `Parent Asset = the Offer`, same title, campaign,
product (niche) and initiative as the report's title, so every writer gets the Offer's fields as **THE PARENT** brief.

| # | Asset (name pattern) | Type | Kind / Format | Status at creation | Public |
|---|---|---|---|---|---|
| 1 | `<Offer name> - Offer` | Offer | — | Development | no (private parent) |
| 2 | `<Offer name> - Selling Points Run` | Single Post Run | `selling points` | Publish (unwritten) | yes, when published |
| 3 | `<Offer name> - Email Sequence` | Direct Sales Email | `sequence` | Publish (unwritten) | sent, not posted |
| 4 | `<Offer name> - Sales Page` | Offer Sales Page | — | Publish (unwritten) | yes |
| 5 | `<Offer name> - CTA <kind>` × 4 | CTA | Hero / Inline Slim / Flyout / Email (Format field, existing CTA model) | Publish (unwritten) | yes |

Rule: children wait at Publish unwritten; they're written only after the Offer is written (feedback_dash_children_wait_at_publish).

### 3.1 Offer (the product — private)

Holds everything the children sell from. Fields:
- **OFFER CARD** json block (the existing mechanism the hub/offer code already reads for the CTA link) extended with:
  `forWho, problem, deliverables, delivery, timeline, price, cta`.
- **Selling Points** — new rich-text property (or a fenced `SELLING POINTS` json block in the body; pick one at build time — the property is
  easier for writers to read). Benefits / proof / objections, **each keeping its report citation** (source URL + report date).
- `Source Report` — the Report asset id + run date (`at`) the card came from, so a later report run can show "this offer was built on the
  Nov 24 run".
- **Price** — operator-filled ("Filled By Operator" spec field). Never AI-written. Children that mention price read it; blank = no price shown.
- `Writer Directions` — empty; operator's lever as usual.

Writer contract (Current Methods row "Offer — from report", proposed): offer page prose (who / problem / what you get / how it works /
timeline), tightened from the card. No new facts beyond the card + report.

### 3.2 Single Post Run · kind "selling points"

- One post **per selling point**: each pain/complaint the offer solves (problem posts), each benefit, each proof point, each objection
  answered. Typically 8–12 posts.
- Post shape (existing single-post fields): `headlinePrimary` (buyer's words, from the headline / searches), `headlineAccent`, `body`
  (2–3 sentences), caption, hashtags ≤5, alt text. Each post carries its selling-point id so it can be traced back.
- Ends with the CTA (Inline Slim or link to the Sales Page).
- Uses the existing single-post templates / background pool — no new render path.
- New: the run's ideas come from the Offer's Selling Points instead of a Series' idea list (`run` source = Offer). Needs edge
  **Offer → Single Post Run**.

### 3.3 Direct Sales Email · kind "sequence"

Direct Sales Email exists in Asset Flow but has **no writer code yet** — this is the first build of it. Sequence of 5:

| # | Day | Job | Reads |
|---|---|---|---|
| 1 | 0 | Name the pain in their words; offer the report | headline, top complaint + its search volume |
| 2 | 3 | Proof it's common / what's changing | proof points, report trends |
| 3 | 6 | The offer: what they get, how long, (price if set) | deliverables, timeline, price |
| 4 | 10 | The main objection, answered | top objection + answer |
| 5 | 14 | Last call, short | CTA |

Fields per email: subject (≤60 chars), preview (≤90), body (≤150 words), CTA line. Stored as one asset with a numbered `SEQUENCE` json block
(not 5 assets) — the sequence is one unit. Recipients come from **Lead List → Direct Sales Email** (existing edge). Sending happens outside
the writer (GHL), never automatically.

Open: a separate **welcome series** for people who ask for the report (existing type "Hub - Email Welcome Sequence") — operator to decide.

### 3.4 Offer Sales Page

Existing type (legacy key "Landing Page"; hub offer-page renderer). Sections, in order:
1. Headline = the strongest complaint / search, in the buyer's words; subhead = the outcome
2. The problem (pains the offer solves)
3. What you get (deliverables) + how it works (timeline)
4. Proof (cited points; search numbers phrased plainly)
5. FAQ = objections + answers
6. CTA (Hero kind)

Published through the existing offer/hub path when the operator sets it Published.

### 3.5 CTA × 4

Existing CTA model (one type, child of Offer, Format = Hero / Inline Slim / Flyout / Email). Destination default: book a call; alt: "get the
report" (members link). Short: label + one line.

---

## 4. ⚒ Make offer — the action

Worker action **`reportMakeOffer {assetId, at, index}`** (operator only):
1. Reads report version `at`, opportunity `index`.
2. Finds the report's title (Report asset → its Title relation). Refuses if the report has no title.
3. **Idempotent:** if an Offer with `Source Report = assetId` and the same opportunity `name` exists, returns it instead of creating a second.
4. Creates the Offer (Development) with the OFFER CARD + Selling Points + Source Report, then the children (Publish, unwritten) with
   Parent Asset = Offer. All through `createAsset` so flow guards apply. Nothing is written by a model in this step — it copies the card.
5. Returns the ids; the button turns into "Offer made → open".

Dash: button on each card in Hub Dash 2's 📊 Report tab and the 📊 Reports panel. Members page: superadmin sees the button too; members never.
A modal before creating lists exactly what will be made (names + types) and lets the operator untick children (e.g. skip the email
sequence). No `confirm()` dialogs.

---

## 5. Asset Flow changes (additive only)

- Edge **Report → Offer** (feeds)
- Edge **Offer → Single Post Run** (feeds)
- Kind **"selling points"** on Single Post Run
- Kind **"sequence"** on Direct Sales Email
- (already there: Offer → Offer Sales Page, Offer → CTA, Offer → Direct Sales Email, Lead List → Direct Sales Email, Title → Report)
- CTA node: add its 4 kinds if still missing (noted as pending in the Full Stack ladder work)

Backup the graph before editing (`af.backup-offerstack.json`).

---

## 6. Build order

1. Opportunity cards: schema + prompt + both renderers; re-run the 7 construction niche reports (Procore, ServiceTitan, Residential Builder
   Software, Fieldwire, Autodesk Construction Cloud, Data Center Construction, Data Center Project Delivery). Operator reads them, picks
   one or two offers.
2. Asset Flow edges/kinds (after approval).
3. `reportMakeOffer` + button + preview modal — creates the stack, writes nothing.
4. Writers, parents first: Offer → Sales Page → CTAs → Selling Points Run → Email Sequence (Direct Sales Email writer is new code).
5. First real offer end to end (suggested: Procore — most complaint searches), operator review, then the others.

**Done when:** from a report card, one click creates the 8 assets under the right title; writing the Offer then each child produces copy
whose every fact traces to the report; the Sales Page publishes on the AI hub; nothing ever shows a price or a claim the operator didn't
supply or the report didn't cite.

---

## 7. Needs the operator's OK

1. Asset Flow edges Report → Offer and Offer → Single Post Run.
2. New kinds: "selling points" Single Post Run, "sequence" Direct Sales Email.
3. Welcome series for report requesters: yes / no.
4. Selling Points storage: new Notion property (recommended) vs a json block in the body.
5. Default CTA destination: book a call (recommended) vs get the report.

## 8. Cost

- Report re-runs with offer cards: one Claude call each, ~7k output tokens max → ~10 reports ≈ a few dollars. ★ Premium runs add Perplexity
  per run (guarded by spendCheck).
- ⚒ Make offer: no model calls.
- Writing a full stack: ~6–8 writer calls (Offer, page, 4 CTAs, run, sequence).
