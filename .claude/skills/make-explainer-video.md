# make-explainer-video

Turn a researched topic/keyword into a **fully narrated explainer video** — no footage, no avatar, no photography. An AI agent writes a voiceover script grounded in real campaign research, then builds an animated HTML/CSS/JS composition (via the open-source **Hyperframes** tool) that invents whatever visuals the topic needs — diagrams, motion graphics, data visualizations, kinetic typography, evidence-board reveals — renders it to a real MP4, hosts it, and upserts the Assets DB record.

This is the production skill for the **"Explainer Video"** Method (Notion Methods DB → "Explainer Video", id `3ab1f7d3a4bb812288f9dfbabe1f4384`). That method's page body holds the full script-rules/structure/Growth Strategy — read it before building. It is the broader sibling of **`make-diagram-explainer`** (Method id `3a71f7d3a4bb81ac8235f84691b4bc41`): that one is scoped to a single visual metaphor/mechanism and stops at a Notion note; this one covers any researched topic and always finishes the loop — hosted MP4 + a real Assets DB record — the same way `make-avatar-reel` does for avatar Reels.

## Trigger phrases
"make an explainer video", "run make-explainer-video", "explainer video for <title>", "turn this into an explainer video", "produce the explainer video asset for <title>"

## ⚠️ Boundary — why this isn't a dashboard button
Hyperframes renders locally: it plays an AI-authored animated webpage in headless Chrome (Puppeteer) and records it with ffmpeg. Cloudflare Workers can't run a browser or ffmpeg, so — like `make-reel-video`, `make-avatar-reel`, and `make-diagram-explainer` — this only runs here in chat, never as a dashboard button.

## Prerequisites (confirm before starting)
- **Hyperframes installed** — see the repo [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes). If a project here doesn't have it yet, `npx hyperframes doctor` will say so; run `npx hyperframes browser ensure` for the headless Chrome dependency. Needs **ffmpeg** too.
- **ELEVENLABS_API_KEY** set in the environment (for narration). Hard requirement.
- Once installed, the Hyperframes skills (`/faceless-explainer`, `/motion-graphics`, `/hyperframes-cli`, etc.) are available in this session — they lazy-install on first use via `npx hyperframes skills update <workflow-name>`.

## Inputs
- **topic / keyword**, OR an existing Explainer-Video title from the Content Strategy DB (has a script already, or just a working title + research reference).
- **campaign** — name or Campaigns-DB page ID (required, for research/audience/Design Spec/keywords). If starting from a title, read its `Campaign` relation.
- **product** (optional) — grounds it in one product's Strategy instead of just campaign-level positioning.
- **duration** (optional) — default **20-90s** per the method's own script rules; ask if the user wants longer (LinkedIn/YouTube).

## Constants
- Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Design Specs DB `3981f7d3a4bb817c8edad15db64fa50d` · Assets DB `e91bdb6e770b4d298e9f62166a0fd5de` · Explainer Video method `3ab1f7d3a4bb812288f9dfbabe1f4384`.

**Auth / data access:** the dashboard Worker is PIN-gated. This skill runs in chat — do **all** Notion reads/writes through the **Notion connector**, no PIN needed.

## Workflow

### Step 0 — Ground it in real positioning (Notion connector)
Don't hand Hyperframes a bare topic — a generic explainer is forgettable, and the method's own script rules require every claim to trace back to something real. Gather:
- **Research** (Research DB by Campaign relation): Keywords, Statement, Unique Opportunity, Key Message.
- **Campaign** page: Target Audience, Pain Points.
- If a **product** is linked: read its Strategy record (Strategy DB, `Product` relation contains the product, `Method` relation empty) — Customer, Pain Points, Emotions, Benefits, Unique Opportunity.
- **Design Spec**: the campaign's attached spec — Background/Ink/Accent hex colors, Headline/Body fonts, Aesthetic Description. This is the palette/type Hyperframes should build in — never let it invent its own.
- If starting from an existing title: read its page body for whatever script/outline is already there (hook, reframe, payoff beats, close/CTA, research references) — don't re-derive from scratch if it's already written.
- Check the Asset record itself (Asset Type: explainer video) for **Design Notes** and an **Images** attachment — the operator may have attached a sample image / guidelines from the dashboard's 🎬 modal before copying this prompt. If present, these override the Design Spec/your own visual-metaphor instincts where they conflict (see Step 2).

### Step 1 — Write or confirm the script (per the method's Script Rules)
If the title doesn't have a script yet, write one following the Explainer Video method's structure: **Hook (0-3s) → Reframe (3-8s) → Payoff (8s-end, one visual metaphor, beat-marked) → Close/CTA (last 2-3s)**. Every claim traces back to the Research reference gathered in Step 0 — no unsupported stats. Confirm the script with the user before spending render time.

### Step 2 — Write the brief for Hyperframes
Compose a brief for `/faceless-explainer` (or `/motion-graphics` for something shorter/simpler) that includes:
- The script from Step 1, with its visual-beat markers.
- Target duration and orientation (ask if unclear — 9:16 for Reels/Shorts/TikTok is the method's default; landscape for YouTube/LinkedIn).
- The Design Spec's exact hex colors + font names — unless Step 0 found Design Notes, which take precedence over the spec for anything they explicitly address.
- If Step 0 found an Images attachment, pass it to Hyperframes as a required visual reference (style board, mood, or literal element to incorporate) — don't invent a competing look.
- Campaign keywords worked into on-screen text (SEO, same principle as carousels/text pics/avatar Reels).
- One clear visual metaphor — not several competing ones.
- "Keep it fast to render" for a first pass.

### Step 3 — Build via Hyperframes
Invoke `/faceless-explainer` with the brief. **Review the storyboard before approving the full render** — changes here are cheap; changes after a long render are not. Once approved, let it render to a local MP4.

### Step 4 — Review + iterate
Open the Hyperframes preview and play it back. If a specific visual doesn't land, say so plainly and iterate rather than accepting the first pass.

### Step 5 — Host the MP4 and upsert the Assets DB record
This is what takes the title from Development/Review to a real **explainer video** Asset in **Publish** — mirrors exactly how `make-avatar-reel` and the carousel pipeline close their own loop.

- **Host the file.** Commit the rendered MP4 to this repo at:
  `web/{deployPath}/mp4/{titleSlug}.mp4`
  - `deployPath` — from the campaign's `live site` or `microsite` URL property, matching `/web/{path}` or `/microsites/{path}`; fall back to a slugified campaign name if neither is set.
  - `titleSlug` — the title, lowercased, non-alphanumerics collapsed to `-`.
  - Push. Live URL: `https://cabuzzard.github.io/dash/web/{deployPath}/mp4/{titleSlug}.mp4`.
- **Upsert the Assets DB record** (`e91bdb6e770b4d298e9f62166a0fd5de`). Query for an existing, non-archived record where `Content Strategy` contains this title AND `Asset Type` = `explainer video`; update it if found (re-render non-duplicating), else create new:
  - **Asset Title:** `{title} — Explainer Video`
  - **Asset Type:** `explainer video`
  - **Content Strategy:** relation → this title
  - **Campaign:** relation → the campaign
  - **Design Link:** the hosted MP4 URL above
  - **Status:** `Ready`
  - **Asset Status:** `Publish`
  - **Platform Name:** ask if not already implied (YouTube, Instagram Reels, TikTok, etc.)
  - **Notes:** the visual metaphor used + Design Spec reference (for consistency on this campaign's next explainer)
- **Set the title's own `Status` → `Publish`.**
- Optionally log to SM Posts DB (Draft status, Platform, caption) if ready to queue for posting.

### Step 6 — Report
Give: the hosted MP4 URL, which visual metaphor it used and why, the Design Spec it built in, and the Notion Asset link. Posting is manual.

## Notes
- One idea per video. If the topic needs two distinct metaphors, that's two videos.
- Render time scales with duration and complexity — a short (8-10s) test render is ~10 min; a 25-30s video is ~20-30 min. For quick iteration, render a short version first before committing to a longer one.
- Don't let Hyperframes invent its own color palette when a Design Spec exists — always hand it the exact hex values and font names.
- If the campaign has no Design Spec yet, either run `create-design-specs` first or proceed with a clean neutral default and say so.
- **Not `make-diagram-explainer`:** that skill is for a single visual-metaphor explainer that stops at a Notion note — no hosting, no Assets DB record. Use it directly (bypassing the Method/Asset pipeline) only when the user explicitly wants a quick one-off with no asset-tracking overhead. Otherwise this skill is the one that plugs into the Method → Title → Asset pipeline like every other production skill in this repo.
- This skill and `make-avatar-reel` both produce narrated video from a script; the difference is presenter (avatar reads it to camera) vs. no presenter (invented visuals carry it). Pick based on whether the campaign wants a recurring on-screen character.
