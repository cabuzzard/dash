# make-diagram-explainer

Turn one topic/keyword into a **fully animated explainer video** — no footage, no avatar, no photography. An AI agent writes an animated HTML/CSS/JS composition (via the open-source **Hyperframes** tool) that visualizes the idea directly: animated diagrams, motion graphics, data visualizations, mechanism animations, evidence-board reveals — then renders it to a real MP4.

This is the production skill for the **"Diagram Explainer"** Method (Notion Methods DB → "Diagram Explainer", id `3a71f7d3a4bb81ac8235f84691b4bc41`). That method's page body holds the Growth Strategy `[Arc]` — read it before building. Best for concepts easier to *see* than to hear: a mechanism, a comparison, a before/after, a process.

## Trigger phrases
"make a diagram explainer", "make an animated explainer video", "diagram explainer for <topic>", "make an explainer video about <topic>", "run make-diagram-explainer", "animate this as an explainer"

## ⚠️ Boundary — why this isn't a dashboard button
Hyperframes renders locally: it plays an AI-authored animated webpage in headless Chrome (Puppeteer) and records it with ffmpeg. Cloudflare Workers can't run a browser or ffmpeg, so this — like `make-reel-video` — only runs here in chat, never as a dashboard button. A webpage button could hand off the brief, but the actual build/render happens in this skill.

## Prerequisites (confirm before starting)
- **Hyperframes installed** — see the repo [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes). Quickest path: in a scratch project folder, tell Claude Code "install hyperframes" and let it run (`bun install && bun run build`, ~5-10 min first time). Needs **bun** (not npm/pnpm for workspace ops), **ffmpeg**, and headless Chrome for the render/validation step.
- Once installed, the Hyperframes skills (`/faceless-explainer`, `/motion-graphics`, `/hyperframes-cli`, etc.) are available in that project's Claude Code session.

## Inputs
- **topic / keyword** — the subject (required), OR an existing Diagram-Explainer title from the Content Strategy DB.
- **campaign** — name or Campaigns-DB page ID (required, for research/audience/Design Spec/keywords). If starting from a title, read its `Campaign` relation.
- **product** (optional) — grounds it in one product's Strategy instead of just campaign-level positioning.
- **duration** (optional) — default **20-30s** (fast to render, good save/share length for Reels/Shorts). Longer (60-90s) works for LinkedIn/YouTube but takes proportionally longer to render (a 30s video is roughly a 20-30 min render; scale accordingly).
- **style direction** (optional) — a specific visual style if the user wants one; otherwise pull from the campaign's Design Spec.

## Constants
- Research DB `557e6b7b8c434a578d45ecb0a8329f63` · Campaigns DB `087b1163b4e64975bc7a4b686ff801de` · Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Design Specs DB `3981f7d3a4bb817c8edad15db64fa50d` · SM Posts DB `collection://ec422a5d-7161-42e6-843f-39a09893737b` · Diagram Explainer method `3a71f7d3a4bb81ac8235f84691b4bc41`.

**Auth / data access:** the dashboard Worker is PIN-gated. This skill runs in chat — do **all** Notion reads/writes through the **Notion connector**, no PIN needed.

## Workflow (run every step)

### Step 0 — Ground it in real positioning (Notion connector)
Don't hand Hyperframes a bare topic — a generic explainer is forgettable. Gather:
- **Research** (Research DB by Campaign relation): Keywords, Statement, Unique Opportunity, Key Message.
- **Campaign** page: Target Audience, Pain Points.
- If a **product** is linked: read its Strategy record (Strategy DB, `Product` relation contains the product, `Method` relation empty) — Customer, Pain Points, Emotions, Benefits, Unique Opportunity.
- **Design Spec**: the campaign's attached spec (Campaign page's own `Design Spec` relation, or query Design Specs DB by Campaigns relation) — Background/Ink/Accent hex colors, Headline/Body fonts, Aesthetic Description. This is the palette/type Hyperframes should build in.

### Step 1 — Write the brief (not the full script — Hyperframes writes that)
Compose a brief for `/faceless-explainer` (or `/motion-graphics` for something shorter/simpler than a full narrative explainer) that includes:
- The topic, in the campaign's actual voice/angle (not generic advice — grounded in the Pain Points/Unique Opportunity above).
- Target duration and orientation (ask if unclear — landscape for YouTube/LinkedIn, 9:16 for Reels/Shorts/TikTok).
- The Design Spec's exact hex colors + font names — instruct it to use them, not invent its own palette.
- Campaign keywords worked into any on-screen text (SEO, same principle as carousels/text pics).
- Tone direction if the user gave one (e.g. "feel like a Netflix investigation," "warm and simple," "editorial minimal") — otherwise let Hyperframes propose one strong visual metaphor rather than a generic PowerPoint feel; explicitly ask for **one clear visual metaphor**, not several competing ones.
- "Keep it fast to render" for a first pass — no external asset/footage fetching unless the user specifically wants that.

### Step 2 — Build via Hyperframes
Invoke the `/faceless-explainer` skill with the brief. **Review the storyboard before approving the full render** — changes here are cheap; changes after a 20-minute render are not. Once approved, let it render.

### Step 3 — Review + iterate
Open the Hyperframes preview studio (`launch preview`) and play it back. If a specific visual doesn't land, say so plainly ("that metaphor is confusing, try something else for this beat") rather than accepting the first pass — this tool responds well to direct feedback, badly to silence.

### Step 4 — Save to Notion (Notion connector)
- If starting from an existing title: note the render in its body; set Status → Review.
- If from a raw topic: create a Content Strategy page — Title = the explainer's working title; Status: Development; `Campaign` relation set; `method` → Diagram Explainer; Page body: the brief used, the visual metaphor chosen, and the rendered file path.
- Optionally log to **SM Posts DB**: Post Title, Status: Draft, Platform, Page content = local MP4 path + caption/hashtags if the user wants a ready-to-post record.

### Step 5 — Report
Give: the MP4 path (offer `npm run dev`/preview to watch it), which visual metaphor it used and why, the Design Spec it built in, and where it saved in Notion. Remind the user posting is manual — no auto-publish exists in this repo yet.

## Notes
- One idea per video. If the topic needs two distinct metaphors, that's two videos.
- Render time scales with duration and complexity — an 8s test render is ~10 min; a 25-30s video is ~20-30 min. For quick iteration/testing, generate a short (8-10s) version first before committing to a longer render.
- Don't let Hyperframes invent its own color palette when a Design Spec exists — always hand it the exact hex values and font names.
- If the campaign has no Design Spec yet, either run `create-design-specs` first or proceed with a clean neutral default and say so.
- This skill and `make-carousel` both produce social content from a topic, but carousels are static Canva slides; this is real animated video. Pick based on format need, not habit.
