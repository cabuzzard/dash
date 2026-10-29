# Digest records: rolling parent, record states, free-first sourcing (2026-10-28)

Operator-agreed spec. Pure rules: `worker/digest-records.mjs` (tests: `tests/digest-records.test.mjs`).

## Parent and issues
- **One rolling parent per digest.** Each run rewrites its body and ADDS records to `digest:items:<assetId>`. No copies.
- **Generated issues are permanent.** A done Premium/Free issue consumes its interview mapping (`premium|*` → `premium|done:<jobId>`),
  so the next generation prepares its own issue asset + interview. Retry-reuse only matches an asset created by the same job.
- Every run (including a guided regenerate) leaves the parent at **Development** — reviewed anew, nothing auto-approved or published.

## Record states
- **Unused** — offered. Carried forward for up to **3 runs** (guided regenerates count); then **Expired/dropped** (recoverable).
- **Used** — generated into a done issue/article; visible, not offered again.
- **Retired** — operator tick (`digestRecordState`). Hidden, never rolled forward or generated, stays in research memory as known
  (so it isn't re-found), keeps its source trail, restorable.
- Each record's current-period flag is **recomputed every run and at issue-write time** (records are additive). The digest
  period is the **trailing 7 days**, not the hub checklist's Saturday-start week.

## Gathering order (each run)
1. **Free core** — every Research Depth: `digestFreeSearch` on each of the title's keywords (Bing News, Google News, GDELT, Reddit).
2. **Paid pass** (Deep/Standard only) — one Gemini/Perplexity research pass. Never a second paid call.
3. Count new records + carried-forward relevant records. Under the soft target (~20) → **widen on free sources only** through the
   newsletter's **Research Focus** phrases (+ Federal Register, PubMed). Relevance is mechanical (`relevantToScope`).
4. Under **5** after widening → **thin**: records saved for curation, parent body NOT rewritten, modal says "needs regenerate".
- Research memory learns only records the digest ranked/showed — reported-but-unranked findings stay discoverable.
- Scope: the title's keywords = WHAT the digest is about; Research Focus = HOW WIDE to look. Research Focus is hub-wide (Premium
  Newsletter Product Research) and should be written as a list of signals — it is the cheapest way to widen.

## Free-source notes (measured 2026-10-28/29)
- Relevance is a phrase check (`phraseHit`): query words together, at most one word between.
- Niche service keywords get little real news in 7 days (house sitting ≈5, owner's rep ≈1); Research Focus widening is what
  brings volume (14 / 40 in tests). GDELT rate-limits shared IPs hard — it is opportunistic and backs off on the first refusal.

## Premium priority
Premium value = operator curation (ticks) + sourcing first, analysis second. The research `split` is only a suggestion; the
modal sorts offered records primary-source first and the Premium writer leads with them.

## Not built (open)
14-day window for thin titles; a model-based relevance pass; one-store findings refactor; removing `adEnsureTitle`/`adEnsureBlank`.

## One asset type: the one-shot "digest" is retired (2026-10-29)
- Every digest is a **Digest Parent**: Asset Type `Digest Parent` (`DIGEST_PARENT_TYPE`), Pillar Type `Digest` (the marker all
  parent checks use). Reads also accept the old `Digest` value (`isDigestParentType`).
- Any request for the old type — `createAsset`, `createDevAssets`, the series step, the New Asset modal preset — creates a Digest Parent.
- Generate Assets with the Digest / Digest Parent method no longer writes the both-tiers one-shot issue: it creates (or finds) the
  title's Digest Parent and queues its run.
- The hub checklist's Digest rows open the Digest section; the old ＋ Digest research modal, free-newsletter picks and news modal
  are unreachable (code left in place for now).
- The Methods record "digest" is renamed **Digest Parent**; lookups accept either name.
