# Weekly accumulative newsletter research

Worksheet sync: 2026-10-23. Current Methods is the method authority; this document describes implementation. The Information Flow graph and Contract are unchanged.

Every hub reads its Premium Newsletter Product Research depth each tick. Free/empty values migrate once to Standard, preserving Deep, Standard and Off. Subscriber count never alters depth. The existing six cron schedules are unchanged. Weekly starts are staggered over Sunday 20:00–Monday 06:00 Pacific; unfinished work resumes on later ticks. A manual run uses the same pipeline.

`digest:weekly:activation` must contain `{enabled:true,...}` before weekly work runs. It stays disabled until one manual Care Gap pilot completes and actual provider usage/cost plus a 12-hub projection are reported. This hold applies to old unfinished weekly work too. It does not prevent an explicitly queued manual pilot.

## Knowledge memory

`digest:memory:<cid>` retains the complete finding index and per-run new/confirmed/changed counts. Originals also live in immutable `digest:memory:finding:<cid>:<sha256>` records. `digest:memory:run:<cid>:<runId>` records confirmations and changes/contradictions. None expire. Earlier `digest:sources:<titleId>` and saved digest findings seed the first bank without a model call. The prior date is retained.

Canonical URL plus normalized claim deduplicates a finding. A distinct claim on the same page can be a separate finding. A change/contradiction requires an explicit reference to an existing finding; the previous claim remains. Reconfirmation advances metadata, never rewrites the original claim. Retrying the same run is idempotent. Digest findings contain new items; older facts may appear only as labelled necessary context. A run with no new findings says so.

To bound token growth, researcher context includes the latest 80 claims and latest 300 distinct URLs. Full history remains available to mechanical deduplication. `digestMemoryTest` is read-only and returns the complete next-run exclusions and stored run statistics. Provider prompt character counts and returned usage are logged; costs reported by providers are separated from estimates. Successful Perplexity responses are checkpointed before downstream writes, and synthesis is retained in `digest:pending:<cid>:<runId>` so a Notion save retry does not pay again.

## Product Market Notes

The Worker integration creates or reuses **Product Market Notes** directly under Home, providing the Home link and inheriting integration access. Its database ID is registered at `product:marketnotes:database`. Hub and Topic contain stable IDs. Each note is a topic/form pair with the requested form, tier, marketplace, price, saturation, white space, review pain points, keywords, listing sources and dates. A Current note is excluded until expiry (21 days Rising; otherwise 45), or contradiction. Existing row versions are retained in KV before refresh; failed writes are held with payload and reason. Every write is read back.

The existing weekly run performs free Bing web-search RSS queries and public Etsy/Amazon page fetches only for missing/stale forms. It adds no research schedule or paid model pass. Extraction is part of the existing Perplexity synthesis. Missing or blocked marketplace evidence leaves a visible gap; it is not invented. Current notes become read-only PRODUCT ANGLES for the relevant issue findings.

`productNotesTest` reads topic coverage, stale counts and gaps without writing or calling models. `createProductFromMarketNote` is an explicit, authenticated, model-free action: it validates a Current note and placed topic, deduplicates by source-note provenance, creates a hub Product at Idea with Campaigns, Topic ID, Storefront Etsy and verbatim review requirements, and reads it back. It neither publishes nor automatically creates products during a scan. Etsy keeps `publishListingToEtsy`; KDP ends at print-ready PDF plus listing copy for operator upload.

## Calls and verification

Standard retains two Perplexity calls per successful weekly run (research and synthesis). Deep adds one Gemini background research job; its polls are not counted as new jobs. Off makes no research calls. Issue writing remains one call per issue only on operator Disseminate. No image is sent to any model. No new status, newsletter entity or screen is introduced.

Tests cover accumulation, reconfirmation, explicit changes, idempotency, prior-run seeding, unchanged Current-note exclusions, freshness dates, staggered starts and zero-call provider-response replay. Live pilot evidence, measured usage, depth migration and activation are recorded in the build's external backup report.
