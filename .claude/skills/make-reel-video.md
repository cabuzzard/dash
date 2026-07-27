# make-reel-video

Render a finished vertical Reel (MP4) from a reel-script title: pull its voiceover script from Notion, pick a voice + background image, and drive the **`video-voiceover`** skill (ElevenLabs voiceover + word-by-word captions + Ken Burns motion, rendered locally via Remotion).

This is the "press play on a script" step that follows [make-reel-script]. It runs **in chat**, not from the dashboard — see the boundary note below.

## Trigger phrases
"make a reel video", "make a video from this script", "render this reel", "turn this reel script into a video", "run make-reel-video", "make the video for <title>"

## ⚠️ Boundary — why this isn't a dashboard button
The render is a local Node/Remotion/ffmpeg pipeline that needs the ElevenLabs API and hundreds of MB of npm packages. The dashboard runs in the browser → Cloudflare Worker, which can't execute any of that. So a webpage "Make Video" button can only *hand off* a script; the actual render happens here in chat via this skill. (A truly one-click webpage button would require a separate always-on render server or a cloud render API — a much larger build.)

## Prerequisites (confirm before starting)
- **ELEVENLABS_API_KEY** set in the environment (elevenlabs.io → Profile → API Key). Hard requirement — nothing renders without it.
- **Node.js 18+** (`node --version`) and **ffmpeg** (`ffmpeg -version`; Windows: `winget install ffmpeg`).
- **A background image** (JPG/PNG, vertical works best) — see Step 2 for how to source one.

## Inputs
- **reel-script title** — a Content Strategy page produced by [make-reel-script] (has a "Voiceover script" section in its body), OR a raw script pasted by the user.
- **voice** (optional) — default: pick an ElevenLabs voice matching the campaign's register (e.g. deep male "George" JBFqnCBsd6RMkjVDRZzb for a hard/operator brand; calm female "Rachel" 21m00Tcm4TlvDq8ikWAM for a softer one). The user can override ("use the Rachel voice").
- **background** (optional) — a specific image path/URL, or let Step 2 source one.

## Workflow

### Step 0 — Get the voiceover script (Notion connector)
Read the reel-script title's page body and extract the **"Voiceover script"** section only — the clean spoken prose. Do NOT include on-screen-text markup, shot notes, timestamps, or `[Hook]`-style labels; those break text-to-speech. If the user pasted a raw script, use that. Confirm the exact spoken text with the user before spending an ElevenLabs render.

### Step 1 — Pick the voice
Choose an ElevenLabs voice ID that matches the campaign voice/avatar (read the campaign's register from its Research/Notes if unsure), or use the user's override.

### Step 2 — Get a background image
In priority order: (a) an image the user provides; (b) if the reel's campaign/spec has a usable visual, export a still from its Canva design via the Canva MCP `export-design` and use that; (c) generate one with the Canva MCP `generate-design` (a mood-appropriate vertical background in the campaign's design-spec palette, minimal so captions stay legible) and export it; (d) otherwise ask the user for one. Save it as the background the render step expects.

### Step 3 — Render via the video-voiceover skill
Hand the pieces to the **`video-voiceover`** skill and follow its steps exactly (it owns the Remotion mechanics):
- scaffold the Remotion project, `npm install` + `npm install elevenlabs`, drop the background into `public/background.jpg`;
- run its `generate-voiceover.mjs` with the Step-0 script and the Step-1 `VOICE_ID` to produce `voiceover.mp3` + `timestamps.json` + duration;
- set `AUDIO_DURATION_SECONDS` and keep **portrait 1080×1920** (9:16, the Reel format) in `Root.tsx`;
- render: `npx remotion render VoiceoverVideo out/video.mp4` (add `--concurrency=1` on Windows if it hangs).
Apply any caption/voice/motion tweaks the user asks for using that skill's Customization table.

### Step 4 — Host the MP4 and upsert the Assets DB record
This is what takes the title from Development/Publish (script-only) to a real **text video** Asset with a working Design Link — mirrors exactly how `make-avatar-reel`'s Step 5 and the carousel pipeline (`publishCarouselSlides` in `worker.js`) close their own loop, so all three asset types behave consistently in the dashboard.

- **Host the file.** Commit the rendered MP4 to this repo (you have git access — this whole skill already runs in chat) at:
  `web/{deployPath}/mp4/{titleSlug}.mp4`
  - `deployPath` — from the campaign's `live site` or `microsite` URL property, matching `/web/{path}` or `/microsites/{path}`; fall back to a slugified campaign name if neither is set.
  - `titleSlug` — the title, lowercased, non-alphanumerics collapsed to `-`.
  - Push. Live URL: `https://cabuzzard.github.io/dash/web/{deployPath}/mp4/{titleSlug}.mp4`.
- **Upsert the Assets DB record** (Assets DB `e91bdb6e770b4d298e9f62166a0fd5de`). Query for an existing, non-archived record where `Content Strategy` contains this title AND `Asset Type` = `text video`; update it if found (this is what makes a re-render non-duplicating), else create a new one:
  - **Asset Title:** `{title} — Text Video`
  - **Asset Type:** `text video`
  - **Content Strategy:** relation → this title
  - **Campaign:** relation → the campaign
  - **Design Link:** the hosted MP4 URL above
  - **Status:** `Ready`
  - **Asset Status:** `Publish`
  - **Platform Name:** ask if not already implied by the title/method (Instagram Reels, TikTok, YouTube Shorts, etc.)
  - Leave **Body**/**Notes** as whatever `generateTextVideoScript` already wrote (voiceover script / hashtags) — don't overwrite them here.
- Confirm the title's `Status` is already `Publish` (set when the script was generated) — no change needed unless it was somehow reset.

## Notes
- Confirm the exact spoken text before rendering — ElevenLabs credits are spent per generation.
- Reels are 9:16 vertical; keep it portrait unless the user explicitly wants landscape.
- Keep the background simple/low-contrast behind the caption band so the word captions read instantly.
- If ElevenLabs returns a scopes/auth error, the key is missing or invalid — set `ELEVENLABS_API_KEY` and retry.
