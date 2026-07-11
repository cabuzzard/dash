# make-reel-script

Turn one keyword + research reference into a **ready-to-film Reel script** (15–45s, one idea, one hook), grounded in the campaign's research and audience, built on a currently-converting hook/arc, and written into a Content Strategy title so it's ready to film and later hand to `make-reel-video`.

This is the production skill for the **"Short Form Video"** Method (Notion Methods DB → "Short Form Video", id `38f1f7d3a4bb81669984e453292206e4`). That method's page body holds the framework (script structure, arc toolkit, production standards); this skill executes one keyword/reference at a time. Reels are the discovery format — their job is to get the account found by strangers, so bias hard toward the hook and rewatch.

## Trigger phrases
"make a reel script", "write a reel script", "reel script from this", "run make-reel-script", "reel scripts for <campaign>", "turn this into a reel"

## Inputs
- **keyword / topic** — the search term or topic language the audience uses (required), OR an existing Short-Form-Video title from the Content Strategy DB.
- **research reference** — the source the script is grounded in: an article, data point, personal-experience note, prior high-performer, etc. If none is supplied, pull one via WebSearch before scripting — a hook with no real substance behind it dies at the 3-second mark.
- **campaign** — name or Campaigns-DB page ID (to pull research/audience/voice). If starting from a title, read its `Campaign` relation.

## Constants
- Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Methods "Short Form Video" `38f1f7d3a4bb81669984e453292206e4`.

**Auth / data access:** the dashboard Worker gates every action behind the admin session token (needs the PIN). This skill runs in chat, so do **all** Notion reads/writes through the **Notion connector** — no PIN needed. Use WebSearch for live hook research.

## Workflow (run every step)

### Step 0 — Gather context (Notion connector)
- Resolve the campaign ID (title's `Campaign` relation, or the campaign's microsite `CAMPAIGN_ID`).
- Read **Research** (Research DB by Campaign relation): Keywords, Statement, Unique Opportunity, Key Message; and the **Campaign** page: Target Audience, Pain Points. If a product is linked: Avatar, Transformation, Objections.
- Confirm/choose the keyword and the research reference. If no reference was supplied, WebSearch for real substance on the topic (a stat, a study, a concrete detail) and use that.

### Step 1 — Research a current, high-retention hook
WebSearch what's landing right now for this topic + audience (e.g. `"<topic>" reel hook 2026`, `<niche> viral short hook`, `"<audience pain>" tiktok hook`). Extract 2–3 hook *shapes* that fit (Contrarian claim, Cold-open confession, Stat/number, Direct callout, Question, Before/after compression — see the method's Arc Toolkit). Pick the ONE that best fits this keyword + reference. Never paste a found line verbatim — take the shape, write original words in the campaign's voice.

### Step 2 — Write the script (the method's formula)
Write the hook line **first, in isolation**, then the rest:
1. **Hook (0–3s)** — pattern interrupt / contrarian claim / "after"-stated-as-fact. ≤~14 words. This is the whole gate.
2. **Reframe (3–8s)** — one sentence on why the hook is true / why it matters to *this* viewer; this is where the research reference earns its place.
3. **Payoff (8s–end)** — the real value (lesson / steps / story beat), fast, one beat per 3–5s, no throat-clearing.
4. **Close (last 2–3s)** — a specific trigger: `comment [KEYWORD] and I'll send you …`, or a "send this to someone who …" line built to be forwarded.

Also produce, per the production standards:
- **On-screen text** for every spoken line (most viewers watch muted) — near-verbatim to the VO.
- **Shot / b-roll notes** per beat (self, contractor, or stock) — vertical 9:16.
- A clean **voiceover script** = the spoken lines only (hook→reframe→payoff→close as continuous prose, no labels/timestamps/shot notes) — this is exactly what `make-reel-video` feeds to ElevenLabs.
- Total spoken length target 15–45s (~40–110 words). Cut anything that doesn't earn its second.

Show the hook line to the user first; iterate before writing the rest if they want.

### Step 3 — Save to Notion (Notion connector)
- If starting from an existing title: append the script to that title's page body; set Status → Writing/Review.
- If from a raw keyword: create a Content Strategy page — Title = the reel's working title; Status: Development; `Campaign` relation set; `method` → Short Form Video; **Format** = `Reel`; `Scheduled Date` if the user gives one (this is what feeds the dashboard's Weekly Content Output tracker). Page body, clearly sectioned:
  - **Voiceover script** (the continuous spoken prose — labeled so `make-reel-video` can grab it)
  - **On-screen text** (per line)
  - **Shot notes** (per beat)
  - **Close / CTA** and which hook arc + reference it used.

### Step 4 — Report
Give the hook line, the full script, which arc/reference it used and why it fits this audience, and where it saved in Notion. Note it's ready to hand to `make-reel-video` to render the actual video. Posting is manual.

## Notes
- One idea per reel. If it needs two, split into two scripts.
- The **Voiceover script** section must be clean spoken prose — no "[Hook]", no timestamps, no on-screen-text markup — because it goes straight to text-to-speech.
- Never reuse the same handful of openers across scripts — research a live hook shape each time.
- Grounded in a real reference, always. Generic advice = skippable.
