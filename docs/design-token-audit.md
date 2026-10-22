# Design token audit - Oct 22, 2026

Preserve f40ba9d7: no images in prompt-writing or rendering requests. Images may be analyzed only to build the spec; their observations must become tier/field evidence before rendering. Preserve the lean contract packet: conditional design input, title/product facts, contract currentFields only.

Identified costs: the image brief can include 16,000 characters of general Research plus keyword/design facts; every render currently compiles all asset formats; the disabled-reference Grok transport still reads Notion/KV library data before selecting zero images. These are targeted in committed-only routing. No whole-record expansion is added to writers.

Guidance implementation adds bounded prose only in its proper scope. Format instructions allow up to 6,000 characters; field guidance up to 3,000. Hub compile persists full text, while per-format render projection will omit unrelated formats and layout/content fields. No generation writes spec/guidance. Readback is mandatory for explicit Notion guidance writes.

Budgets before bulk: one normal image = one Claude prompt-writing call then one Grok render; spec-less requests later hold before rendering and may draft once; research refresh budgets its search and proposal calls separately. Start with one campaign/item, inspect results and sizes, then decide whether a bulk run is appropriate. Anthropic monthly cap was reported by the operator; do not repeatedly retry blocked model calls or silently switch models.

The watcher adds zero model calls. designModelAudit also adds zero model calls and exposes characters per component plus an approximate characters/4 estimate; it does not claim provider-token precision. Live before/after evidence is stored outside the repo with the build verification.
