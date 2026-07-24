# make-avatar-reel

Render a finished **AI-avatar Reel** (MP4) from an avatar-script title: source or confirm the presenter's reference photo, voice it with ElevenLabs, animate it into a talking video with **HeyGen Avatar IV**, then run it through **Hyperframes** (`/talking-head-recut`) to add the synced on-screen text, callouts, and captions the script already specifies.

This is the **render step `make-avatar-script` explicitly defers to** ("ready to hand to the (future) `make-avatar-reel` render step") — it consumes exactly what that skill writes: the Voiceover script (to-camera), Presenter character note, On-screen text, Delivery cues, and Callout/B-roll notes. Run `make-avatar-script` first if the title doesn't have those sections yet.

This is the render tool for the **"Avatar Video"** Method (Notion Methods DB → "Avatar Video", id `39a1f7d3a4bb81a08840ff172021da4a`).

## Trigger phrases
"make the avatar video", "render this avatar script", "make-avatar-reel", "turn this avatar script into a video", "render the avatar reel for <title>"

## ⚠️ Boundary — why this isn't a dashboard button
Two of the three steps need things a Cloudflare Worker can't do: HeyGen/ElevenLabs calls could technically run from the Worker, but the final Hyperframes pass needs local Node/ffmpeg/headless Chrome — same constraint as `make-reel-video`. So this whole pipeline runs here in chat.

## Prerequisites (confirm before starting)
- **HEYGEN_API_KEY** set in the environment (app.heygen.com → Settings → API). Hard requirement.
- **ELEVENLABS_API_KEY** set in the environment. Hard requirement.
- **Hyperframes installed** (see `make-diagram-explainer`'s prerequisites) — needs bun, ffmpeg, headless Chrome.
- **Canva MCP connected**, only if no presenter reference image exists yet (Step 1 may need to generate one).

## Inputs
- **avatar-script title** — a Content Strategy page produced by `make-avatar-script` (has Voiceover script / Presenter character / On-screen text sections), OR the user pastes/points to one directly.
- **presenter reference image** (optional) — if the user already has one (a saved illustration/photo for this campaign's recurring avatar), point to it; otherwise Step 1 sources one.

## Workflow

### Step 0 — Get the script pieces (Notion connector)
Read the title's page body and extract, verbatim:
- **Voiceover script (to-camera)** — clean spoken prose only. This drives both ElevenLabs and HeyGen; confirm it with the user before spending render credits on either (HeyGen bills per minute of output).
- **Presenter character** note (persona description + suggested voice).
- **On-screen text**, **Delivery cues**, **Callout / B-roll notes** — these drive Hyperframes' overlay pass in Step 4, not the avatar render itself.
Also pull the campaign's **Design Spec** (colors/fonts) for the overlay styling.

### Step 1 — Source the presenter reference image
HeyGen Avatar IV animates from a **photo or illustration** — the Presenter character note is a text description, not an image, so one has to exist before you can render.
- Check whether this campaign already has a saved reference image for this persona (a prior avatar title's render notes, a campaign asset, or something the user names).
- If not: generate one via the Canva MCP (`generate-design`) matching the Presenter character description + the Design Spec's palette — a clean, front-facing, well-lit portrait or illustration works best for lip-sync quality. Export it and save the link on the title's page ("Presenter reference image: <url>") so future avatar reels for this campaign reuse the exact same image — consistency compounds, don't regenerate a new face every time.
- If the user supplies their own image, use that instead.

### Step 2 — Generate the voice track (ElevenLabs)
Call ElevenLabs' text-to-speech API with the Voiceover script and the voice noted in Presenter character (or ask the user which voice — same voice-picking logic as `make-reel-video`: match the campaign's register). Save the resulting audio file locally; note its duration.

### Step 3 — Generate the avatar video (HeyGen Avatar IV)
Check `docs.heygen.com/docs/create-avatar-iv-videos` for the current request shape before calling — the API evolves. As of this writing: upload the reference image to get an `image_key`, then POST to the Avatar IV creation endpoint with `image_key`, `video_title`, and either the ElevenLabs audio (if the API accepts direct audio input) or `script` + `voice_id` (HeyGen's own TTS) as the audio-driving fallback. Poll the job until complete, then download the resulting MP4.
- **Cost checkpoint:** ~$4/min (1080p) or ~$5/min (4K) as of the source used to build this skill — confirm current pricing with the user before a long render, and confirm the script length/duration before generating.

### Step 4 — Overlay pass (Hyperframes `/talking-head-recut`)
Feed the raw HeyGen MP4 into Hyperframes' `/talking-head-recut` skill along with:
- The **On-screen text** (per line) and **Delivery cues** — tells it what text/emphasis to overlay and when.
- The **Callout / B-roll notes** — tells it where to cut away to a graphic, stat, or supporting visual instead of the talking head.
- The Design Spec's colors/fonts, so overlays match the campaign's visual system.
- Word-level captions on by default (avatar Reels are watched muted as often as filmed ones).
Review the storyboard/pass before the full render if Hyperframes offers one; iterate on any overlay/graphic that doesn't land, same as `make-diagram-explainer`.

### Step 5 — Save to Notion (Notion connector)
Update the avatar-script title: note the final MP4 path, the presenter reference image used (for reuse), and move Status → Review. Optionally log to SM Posts DB (Draft status, Platform, caption) if ready to queue.

### Step 6 — Report
Give: the MP4 path (offer to preview), the presenter image used (and where it's saved for reuse), total render cost incurred (HeyGen + ElevenLabs), and where it saved in Notion. Posting is manual.

## Notes
- **Reuse the same presenter image and voice across a campaign's avatar Reels.** Recognition compounds — regenerating a new face/voice each time defeats the point of a recurring brand character.
- HeyGen billing is per-minute of *generated* output — a bad take costs the same as a good one. Confirm the script is final before Step 3, not after.
- If ElevenLabs audio can't be fed directly into Avatar IV (check current API support), fall back to HeyGen's own `voice_id` for lip-sync and use the ElevenLabs track only if/where the pipeline supports swapping it in post — don't silently double-generate audio.
- This skill assumes `make-avatar-script` already ran. If handed a raw topic instead of a scripted title, run that skill first — a script written specifically for to-camera avatar delivery (short clauses, minimal gestures, callout markers) renders far better than one written for a different format.
