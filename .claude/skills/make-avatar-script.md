# make-avatar-script

Turn one keyword + research reference into a **presenter-led Reel script** — written to be spoken **to camera** by an AI avatar animated from a still image (a photo OR a cartoon/illustration). Grounded in the campaign's research/audience/voice, built on a currently-converting hook, and written into a Content Strategy title so it's ready to hand to the (future) `make-avatar-reel` render step.

This is the script tool for the **"Avatar Video"** Method (Notion Methods DB → "Avatar Video", id `39a1f7d3a4bb81a08840ff172021da4a`). That method's page body holds the framework (presenter character, avatar-specific script rules, growth strategy, tool options) — read it, and the master [📈 Account Growth OS](https://app.notion.com/p/39a1f7d3a4bb818a8653e60a1b6cf6f7), before scripting. Avatar = faceless-but-branded: a recurring presenter that speaks every Reel becomes a recognizable brand character with a talking head's trust, no real person on camera.

## Trigger phrases
"make an avatar script", "write an avatar video script", "avatar reel script", "talking avatar script", "run make-avatar-script", "avatar script for <campaign>"

## Inputs
- **keyword / topic** — the audience's real search language (required), OR an existing Avatar-Video title from the Content Strategy DB.
- **research reference** — the source the script is grounded in. If none supplied, pull one via WebSearch before scripting.
- **campaign** — name or Campaigns-DB page ID (research/audience/voice/Design Spec + the presenter character). From a title, read its `Campaign` relation.

## Constants
- Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Avatar Video method `39a1f7d3a4bb81a08840ff172021da4a`.

**Auth / data access:** the dashboard Worker is token-gated (needs the PIN). This skill runs in chat — do **all** Notion reads/writes through the **Notion connector**. Use WebSearch for live hook research.

## Workflow (run every step)

### Step 0 — Context + presenter character (Notion connector)
- Resolve the campaign ID (title's `Campaign` relation, or the microsite `CAMPAIGN_ID`).
- Read **Research** (by Campaign relation): Keywords, Statement, Unique Opportunity, Key Message; **Campaign** page: Target Audience, Pain Points; product (if linked): Avatar, Transformation, Objections.
- **Confirm the presenter character.** Check whether the campaign already has a defined avatar presenter (a recurring cartoon/photo persona — look in the campaign Notes / a prior avatar title / the Design Spec). If yes, reuse it verbatim (consistency = brand recognition). If not, propose one — a cartoon/mascot or stylized photo persona matched to the audience + Design Spec palette, plus a suggested ElevenLabs voice — and note it so future scripts reuse the same character.
- Confirm the keyword + reference; if no reference, WebSearch for real substance (a stat, a study, a concrete detail).

### Step 1 — Research a current, high-retention hook
WebSearch what's landing now for this topic + audience (`"<topic>" reel hook 2026`, `<niche> viral short hook`, `"<pain>" tiktok hook`). Extract 2–3 hook shapes that fit (Contrarian claim, Cold-open confession, Stat/number, Direct callout, Question, Before/after compression). Pick the ONE best for this keyword + reference. Never paste a found line verbatim — take the shape, write original words in the campaign's voice.

### Step 2 — Write the script (to-camera, avatar rules)
Write the hook line **first, in isolation**, spoken straight to camera, then the rest. Follow the method's avatar-specific rules:
- **Direct address ("you"), conversational, contractions** — read it aloud; if it doesn't sound like a person talking, rewrite.
- **Short, clear sentences — one clause per line** (AI lip-sync/TTS read these far more naturally; run-ons cause stiff, out-of-sync delivery).
- **Hook (0–3s)** → **Reframe (3–8s)** → **Payoff (8s–end, one beat per 3–5s)** → **Close (last 2–3s)**.
- **Delivery cues** per beat — tone/emphasis/pace, e.g. *(slower, lower)* on the hook, *(build energy)* on the payoff.
- **Callout points** — mark where on-screen text / a stat / a B-roll cutaway overlays the presenter.
- **Minimal physical action** — no fast/intricate gestures, no big head turns (>~30°); keep the presenter front-facing (glitch avoidance). Energy comes from expression + voice.
- **15–90s** spoken (30–90s sweet spot); one idea only.
- **Close on a ranking-signal CTA** — `send this to someone who …` (sends) or `comment [KEYWORD] and I'll send you …` (DM funnel).

Show the user the hook line first; iterate before writing the rest if they want.

Also produce:
- **Voiceover script (to-camera)** = the spoken lines only, continuous prose, NO labels/timestamps/cues/on-screen-text markup — this is exactly what the render tool + ElevenLabs will speak. Keep it clean.
- **On-screen text** per line (mirrors the spoken hook + carries the campaign keywords for SEO).
- **Delivery cues** and **callout/B-roll notes** per beat.
- **Presenter-character note** (which avatar persona + voice to render with).

### Step 3 — Save to Notion (Notion connector)
- From an existing title: append the script to its body; set Status → Writing/Review.
- From a raw keyword: create a Content Strategy page — Title = the reel's working title; Status: Development; `Campaign` relation set; `method` → Avatar Video; **Format = `Reel`**; `Scheduled Date` if given (feeds the Weekly Content Output tracker). Body, clearly sectioned: **Voiceover script (to-camera)** · **On-screen text** · **Delivery cues** · **Callout / B-roll notes** · **Presenter character** · **Hook arc + reference used**.

### Step 4 — Report
Give the hook line, the full script, the arc/reference used and why it fits, the presenter character, and where it saved. Note it's ready for the `make-avatar-reel` render step (recommended tools: **HeyGen Avatar IV** or **Hedra Character-3** for the photo/cartoon presenter + **ElevenLabs** voice). Posting is manual.

## Notes
- The **Voiceover script (to-camera)** section must be clean spoken prose only — it goes straight to the avatar's TTS/lip-sync; labels or cues in it will be read aloud.
- Reuse the SAME presenter character across a campaign's avatar Reels — recognition compounds.
- One idea per reel; if it needs two, split.
- Render tool is not built yet — this skill stops at a render-ready script. When the render skill exists, it will consume the Voiceover-script section + Presenter-character note + a background/style from the Design Spec.
