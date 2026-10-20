# Information Flow — campaign-authority digest

Source: information-flow (campaign-authority revision, Oct 20, 2026 — pending import)

Governing flow version: 1

## Forms

### Idea

ID: idea

Kind: PROCESS

Role: research

Interview rule: None

### Keyword topic

ID: keywordtopicswitch

Kind: PROCESS

Role: switch

Interview rule: None

### Match

ID: match

Kind: PROCESS

Role: decision

Interview rule: None

### Keyword research tool

ID: keywordresearchtool

Kind: PROCESS

Role: decision

Interview rule: None

### topic

ID: nb9c3752bee3a4d9baaae

Kind: FORM

Role: parent

Interview rule: Unspecified

### cluster

ID: nf04f962e2c0c466a89e7

Kind: FORM

Role: parent

Interview rule: Unspecified

### Parent Asset Sales

ID: nc0f11e52d446478d9044

Kind: ASSET CLASS (parent)

Role: parent

Interview rule: Unspecified

### title

ID: ndbd9e6b2af5e48a4baf2

Kind: FORM

Role: parent

Interview rule: Unspecified

### products

ID: n2b2ee07bb0714a5c9d94

Kind: FORM

Role: parent

Interview rule: Unspecified

### Parent Asset SEO

ID: n727bb530dc78459c93fc

Kind: ASSET CLASS (parent)

Role: parent

Interview rule: Unspecified

### Parent Asset Topic Engagement

ID: n4f23dfddc7d14f63b9a7

Kind: ASSET CLASS (parent)

Role: parent

Interview rule: Unspecified

### Interview

ID: n1232bc696b04425e922e

Kind: PROCESS

Role: interview

Interview rule: Unspecified

### Title Pillar

ID: n27b97b4d837649c4819a

Kind: FIELD (on the title)

Role: pillar

Interview rule: Unspecified

### Research

ID: nf3b85ebceda14e959df1

Kind: FIELD GROUP (on each form)

Role: research

Interview rule: Unspecified

### Direct Assets — brand & profile

ID: n104a54ef4674499bbf7b

Kind: ASSET CLASS

Role: parent

Interview rule: Unspecified

### Child Assets Sales

ID: n9c064e4981b34a4f95cf

Kind: ASSET CLASS (child)

Role: parent

Interview rule: Unspecified

### Child Assets Topical

ID: n4d27692194884c5da8be

Kind: ASSET CLASS (child)

Role: parent

Interview rule: Unspecified

### Child Assets SEO

ID: ne10574f613a84cc7abf0

Kind: ASSET CLASS (child)

Role: parent

Interview rule: Unspecified

### Voice

ID: n94c7511df36141b29ec8

Kind: DATASET

Role: research

Interview rule: None

### Internet Search

ID: n1e609d74bfbb4eaf8353

Kind: PROCESS (outside research)

Role: research

Interview rule: None

### Strategy

ID: n6bd8d0a366ed483ca8da

Kind: DATABASE (singular, governing)

Role: switch

Interview rule: None

### Unclustered topic — holding

ID: unclusteredholding

Kind: FORM (topic state)

Role: topic

Interview rule: None

### Method

ID: n60e21a9897344b75bf04

Kind: DATABASE (singular, governing)

Role: parent

Interview rule: None

### campaign

ID: campaign

Kind: FORM — THE AUTHORITY

Role: parent

Interview rule: Unspecified

## Relations

- Idea → Keyword topic (routes to) — Every idea hits the keyword-topic switch first.

- Keyword topic → Match (routes to) — The idea matches an existing keyword topic.

- Keyword topic → Keyword research tool (routes to) — No match — route to the keyword research tool.

- Match → campaign (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Match → cluster (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Match → topic (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Match → products (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Keyword research tool → campaign (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Keyword research tool → cluster (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Keyword research tool → topic (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Keyword research tool → products (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Match → title (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- Keyword research tool → title (feeds) — Evaluates against this form — insertion lands at the single best position only, non-destructively.

- campaign → cluster (feeds) —

- cluster → topic (feeds) —

- topic → products (feeds) —

- products → title (feeds) —

- topic → title (feeds) — Pillar written to title is a complete keyword flow all the way from the main hub keywords through cluster, topic and product if product is attached.  product is optional to title attachement is specified in title creation and title edit.

- products → Research (syncs with) — bi directional relationship

- title → Research (syncs with) —

- title → Interview (feeds) —

- Interview → Title Pillar (feeds) —

- Title Pillar → Parent Asset SEO (feeds) —

- Title Pillar → Parent Asset Topic Engagement (feeds) —

- Title Pillar → Parent Asset Sales (feeds) —

- Interview → Voice (feeds) — voice learns from my responses how I talk and how I write and also how I interpet.  voice feeds back into the writing engine without skewing the overall voice away from audience and product fit.

- Voice → Research (feeds) —

- campaign → Research (feeds) —

- cluster → Research (feeds) —

- topic → Research (feeds) —

- Research → Internet Search (syncs with) —

- Strategy → Direct Assets — brand & profile (feeds) — Routes to Direct Assets — the output of the direct (pillar) lane.

- Match → Unclustered topic — holding (fallback) — Not inserted — held, unclustered.

- Keyword research tool → Unclustered topic — holding (fallback) — Not inserted — held, unclustered.

- Title Pillar → Method (feeds) — The direct lane: the pillar routes through the single Method database, with no parent asset.

- Method → Strategy (feeds) — Method -> Strategy. Both are singular governing databases.

- Parent Asset SEO → Method (feeds) — SEO parent routes through the single Method database. Routing stays distinct by parent type.

- Parent Asset Topic Engagement → Method (feeds) — Topic Engagement parent routes through the single Method database. Routing stays distinct by parent type.

- Parent Asset Sales → Method (feeds) — Sales parent routes through the single Method database. Routing stays distinct by parent type.

- Strategy → Child Assets SEO (feeds) — Routes to the SEO child class — the output of SEO parents.

- Strategy → Child Assets Topical (feeds) — Routes to the Topic Engagement child class — the output of Topic Engagement parents.

- Strategy → Child Assets Sales (feeds) — Routes to the Sales child class — the output of Sales parents.

## Rules

### insertion

The AI evaluates an idea against all forms and inserts it non-destructively at the single best position. Manual rearrangement happens via the campaign's keyword sections, as recorded in the registry.

### holding

An idea that is not inserted becomes an unclustered topic inside a campaign, or a title with 'idea' status unattached to any campaign. Held items are isolated from publication and SEO strategy.

### new-campaign

Creating a new campaign (a new silo) is a human call today. Target rule: compulsion approx CPC value + total search volume, compared against existing clusters. Hubs are separate entities tracked in their own registry; they are never authorities in the flow.

### research-dependency

Research pulls all upstream keywords plus the input at its level and matches them to market and customer queries. Any insertion at a research-tied form triggers a research update for that insertion.

### semi-dominance

The keyword flow is semi-dominant: insertions and research updates are non-destructive and never negate the upstream SEO strategy.

### internet-search

Individual titles and products are also market-researched directly from the internet, independently of keywords, then reconciled with SEO.

### pillar

One pillar per title, written to the title, long and verbose enough to inform all downstream assets. Pillars are never published or deployed. 'Pillar' appears nowhere in asset creation; assets draw from the pillar in the title only.

### interview

An interview is optional and never blocks a pillar. A pillar written without an interview is flagged 'for interview' on the title. The interview humanizes the content and teaches Voice.

### voice

Voice is learned from the operator's interview responses. Voice decides HOW content is written; research decides WHAT it says.

### method

Method is a singular governing database. A method organizes upstream information into a platform- and intent-specific form; that form is the asset type. A method is descriptive and instructive and stores no asset fields; the asset record stores the fields.

### strategy

Strategy is a singular governing table, downstream of Method. It sets periodicity, repetition, schedule, iterations, and topical arcs, and routes productions to the asset class matching their parent type. It is informed by parents through Method; it never informs parents.

### parents-children

Parent assets are never published and carry intent (SEO, topical engagement, direct sales). Child assets are publishable instances tied to a parent, inheriting its intent and universal datasets. Direct assets come off the pillar with no parent asset and serve brand/profile growth, not product sales.

### model-agnostic-enforcement

Enforcement lives in the tool, not in any model. The flow binds every input regardless of which AI (Claude, ChatGPT, Grok, any other) or human produced it, because every write passes the worker's validation. Models produce drafts and proposals; they never hold unvalidated write access.

### refusal-and-repair

A write the worker refuses is never destroyed: it is routed to holding with its full payload and the refusal reason recorded. Repair = fix the data or the modal that produced it, then replay the held write. Nothing is dropped silently.

### keyword-strategy-registry

The campaign is the authority and the top form of the flow; each campaign is recorded in the Hub Registry (buzz/hub-registry.json). Hubs are separate entities from campaigns, tracked in their own registry, and are not part of the asset flow; hubs hold no keywords. A campaign's keyword strategy IS its main keywords on the campaign record plus the recorded organization of clusters and topics, as captured in the registry. Arranging, adding, or removing clusters or topics constitutes a change to the campaign's recorded keyword strategy; the registry must be re-recorded to match, and any model or tool must surface such rearrangements as strategy changes for the operator's decision, never as silent reorganizations.

### campaign-seo-strategy

Campaign research is re-run off the campaign's main keywords and records an SEO strategy for the campaign. The recorded SEO strategy is part of the campaign's recorded strategy, alongside its keyword strategy, and governs downstream cluster, topic, product, and title work.

### filter-doctrine

AI (Claude, Buzz) is a FILTER, not a source. It may present opinions as options to edit the source; it never originates changes to the source. Sources: this flow, the campaigns and their hub cards, research, the operator's decisions. Outputs: Notion and the publishing platforms.
