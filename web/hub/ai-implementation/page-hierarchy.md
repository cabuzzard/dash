# AI Implementation landing page — hub → asset → field hierarchy

Page: aisystemimplementation.com/  (file web/hub/ai-implementation/index.html). Updated 2026-11-22.

## How we build it
- The HTML/CSS markup is hand-authored and frozen. Nothing ever rewrites markup.
- Every piece of visible copy is a **slot** (a CSS selector bound to one element's text or one attribute).
- Each slot is filled by one **field** of one **asset**. Assets are written by a writer that follows a per-asset contract (field name + length rule).
- Design (colors, fonts, spacing) is not an asset: it is CSS variables set in the Site designer.
- The Asset Flow graph is the authority for which asset types exist and how they connect.

## Level 1–3: Hub → assets → fields
```
HUB: AI Implementation  (audience: "mid income whales" — mid-sized companies, big inefficiency, ample budget)
│
├── Keyword structure (what the hub ranks for; drives products and offers)
│   ├── ★ Main: ai consulting, ai implementation, enterprise ai consulting, …
│   ├── Whale cluster → 9 topics (business process automation, ai integration, fractional cto, …)
│   └── Small business cluster → existing topics
│
├── ASSET: Hub  (parent asset = the page itself; one per hub)
│   ├── field "Hub Page Copy"  — exactly 22 lines "Slot: text", each with a max length
│   └── field "Hub Contact"    — exactly 3 lines: Phone Button, SMS, Email (copied from real contact facts, never invented)
│
├── ASSET: CTA  (kinds: Hero, Inline Slim, Flyout, Email — the page uses Hero + one for the contact band)
│   ├── Eyebrow        ≤30 chars
│   ├── Platform Title ≤60
│   ├── Body           ≤160
│   ├── CTA Label      ≤30
│   └── image          (asset image, not written)
│
├── ASSET: Offer  ×3  (one Published Offer per service card; each Offer also has its own page under /blog/)
│   ├── Card Kicker ≤18
│   ├── Card Title  ≤32
│   ├── Body        ≤160
│   └── published page URL (not written; the card link)
│
└── NO ASSET: Design tokens (Site designer) — 29 CSS variables + color combos
```

Asset Flow edges: Method → Hub (feeds) · Offer → Hub (fills) · CTA → Hub (fills).

## Level 4: page sections → slots → source field
Format: `slot ← Asset › field   (selector)`

```
PAGE
├── SECTION Header  (header)
│   ├── logo_text              ← Hub › logo (markup, readonly)   (.logo)
│   ├── nav_services           ← Hub › Hub Page Copy › Services Nav   (header nav a[href="#services"])
│   ├── nav_process            ← Hub › Hub Page Copy › Process Nav   (header nav a[href="#process"])
│   ├── nav_book               ← Hub › Hub Page Copy › Book Call Nav   (header nav a:nth-child(3))
│   ├── nav_cta                ← CTA › CTA Label   (header nav a.nav-cta)
├── SECTION Hero  (.hero)
│   ├── hero_eyebrow           ← CTA › Eyebrow   (.hero .eyebrow)
│   ├── hero_headline          ← CTA › Platform Title   (.hero h1)
│   ├── hero_sub               ← CTA › Body   (.hero p.lead)
│   ├── hero_cta_primary       ← CTA › CTA Label   (.hero-actions a:first-child)
│   ├── hero_cta_secondary     ← Hub › Hub Page Copy › Services Jump Button   (.hero-actions a.btn-ghost)
│   ├── hero_image             ← CTA › image (asset image, not the writer)  [attr src]   (.hero-visual img)
├── SECTION Services  (.services)
│   ├── services_eyebrow       ← Hub › Hub Page Copy › Services Eyebrow   (.services .section-head .eyebrow)
│   ├── services_title         ← Hub › Hub Page Copy › Services Heading   (.services .section-head h2)
│   ├── services_subtitle      ← Hub › Hub Page Copy › Services Intro   (.services .section-head p)
│   └── COLLECTION "Service cards" ×3  (.services .grid-3 > .card)  DYNAMIC — one Offer per item
│       query: Published Offers of this hub (card order not decided)
│       ├── item 1  — Offer (one Published Offer, which one: unassigned) + Hub (link label)
│       │   ├── service1_kicker        ← Offer › Card Kicker   (.services .card:nth-child(1) .kicker)
│       │   ├── service1_title         ← Offer › Card Title   (.services .card:nth-child(1) h3)
│       │   ├── service1_body          ← Offer › Body   (.services .card:nth-child(1) p)
│       │   ├── service1_link          ← Offer › published page URL (not the writer)  [attr href]   (.services .card:nth-child(1) a.more)
│       │   ├── service1_more          ← Hub › Hub Page Copy › Card Link Label   (.services .card:nth-child(1) a.more)
│       ├── item 2  — Offer (one Published Offer, which one: unassigned) + Hub (link label)
│       │   ├── service2_kicker        ← Offer › Card Kicker   (.services .card:nth-child(2) .kicker)
│       │   ├── service2_title         ← Offer › Card Title   (.services .card:nth-child(2) h3)
│       │   ├── service2_body          ← Offer › Body   (.services .card:nth-child(2) p)
│       │   ├── service2_link          ← Offer › published page URL (not the writer)  [attr href]   (.services .card:nth-child(2) a.more)
│       │   ├── service2_more          ← Hub › Hub Page Copy › Card Link Label   (.services .card:nth-child(2) a.more)
│       ├── item 3  — Offer (one Published Offer, which one: unassigned) + Hub (link label)
│       │   ├── service3_kicker        ← Offer › Card Kicker   (.services .card:nth-child(3) .kicker)
│       │   ├── service3_title         ← Offer › Card Title   (.services .card:nth-child(3) h3)
│       │   ├── service3_body          ← Offer › Body   (.services .card:nth-child(3) p)
│       │   ├── service3_link          ← Offer › published page URL (not the writer)  [attr href]   (.services .card:nth-child(3) a.more)
│       │   ├── service3_more          ← Hub › Hub Page Copy › Card Link Label   (.services .card:nth-child(3) a.more)
├── SECTION Process  (.process)
│   ├── process_eyebrow        ← Hub › Hub Page Copy › Process Eyebrow   (.process .section-head .eyebrow)
│   ├── process_title          ← Hub › Hub Page Copy › Process Heading   (.process .section-head h2)
│   ├── process_subtitle       ← Hub › Hub Page Copy › Process Intro   (.process .section-head p)
│   └── COLLECTION "Process steps" ×3  (.steps > .step)  fixed items, filled by Hub
│       ├── item 1  — Hub
│       │   ├── (fixed)                  Step number: markup, no asset   (.steps .step:nth-child(1) .step-num)
│       │   ├── step1_title            ← Hub › Hub Page Copy › Step 1 Title   (.steps .step:nth-child(1) h3)
│       │   ├── step1_body             ← Hub › Hub Page Copy › Step 1 Body   (.steps .step:nth-child(1) p)
│       ├── item 2  — Hub
│       │   ├── (fixed)                  Step number: markup, no asset   (.steps .step:nth-child(2) .step-num)
│       │   ├── step2_title            ← Hub › Hub Page Copy › Step 2 Title   (.steps .step:nth-child(2) h3)
│       │   ├── step2_body             ← Hub › Hub Page Copy › Step 2 Body   (.steps .step:nth-child(2) p)
│       ├── item 3  — Hub
│       │   ├── (fixed)                  Step number: markup, no asset   (.steps .step:nth-child(3) .step-num)
│       │   ├── step3_title            ← Hub › Hub Page Copy › Step 3 Title   (.steps .step:nth-child(3) h3)
│       │   ├── step3_body             ← Hub › Hub Page Copy › Step 3 Body   (.steps .step:nth-child(3) p)
├── SECTION Contact band  (.cta#talk)
│   ├── cta_image              ← CTA › image (asset image, not the writer)  [attr src]   (.cta-image img)
│   ├── cta_headline           ← CTA › Platform Title   (.cta h2)
│   ├── cta_body               ← CTA › Body   (.cta .wrap > p:first-of-type)
│   ├── cta_button             ← Hub › Hub Contact › Phone Button   (.cta a.btn)
│   ├── cta_sms                ← Hub › Hub Contact › SMS  [attr href]   (.cta a.btn)
│   ├── cta_email_label        ← Hub › Hub Page Copy › Email Link Label   (.cta a[href^="mailto:"])
│   ├── cta_email              ← Hub › Hub Contact › Email  [attr href]   (.cta a[href^="mailto:"])
├── SECTION Footer  (footer)
│   ├── footer_copyright       ← Hub › Hub Page Copy › Copyright   (footer .footer-inner > div:first-child)
│   ├── footer_services_label  ← Hub › Hub Page Copy › Footer Services   (footer a[href="#services"])
│   ├── footer_blog_label      ← Hub › Hub Page Copy › Blog Nav   (footer a[href="/blog/"])
│   ├── footer_book_label      ← Hub › Hub Page Copy › Footer Book Call   (footer a[href="#talk"])
└── (end)
```

## Design variables (no asset; Site designer 🎨 Design tab)
--green, --green-bright, --green-dark, --green-darker, --green-soft, --green-mid, --ink, --muted, --line, --bg, --font, --text-base, --radius-sm, --radius-md, --radius-lg, --white, --space-xs, --space-sm, --space-md, --space-lg, --space-xl, --space-2xl, --space-3xl, --space-4xl, --shadow-sm, --shadow-md, --shadow-hero, --shadow-btn, --leading

## Not built yet
- Hero and contact-band image alt text (would be a CTA field)

## Off-page links
- /blog/ — Field Notes — the hub's Published posts

## Rules for anyone writing to this page
1. Only change text/attributes in the slots above. Never add, remove or restyle markup.
2. Respect each field's length limit; copy written for a slot comes from that slot's asset field.
3. Contact details are copied from real facts, never invented.
4. New page sections need a new slot + a source field on an asset (and the asset contract updated) before copy is written.
