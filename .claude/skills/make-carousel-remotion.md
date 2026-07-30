# make-carousel-remotion

Render a finished carousel (one PNG still per slide) from a Content Strategy title's slide copy, using **one reusable Remotion composition** rendered once per slide via `remotion still` — the same rendering framework this repo already uses for Reels/video (`make-reel-video`), so Carousel/Reel/YouTube can share one React codebase and one consistent set of design components instead of three separate template systems.

## Trigger phrases
"make a carousel with remotion", "render this carousel in remotion", "run make-carousel-remotion", "use remotion for the carousel"

## ⚠️ Boundary — why this isn't a dashboard button
Remotion's renderer needs a real Node process with bundled Chromium (`@remotion/renderer`) — the exact same requirement `make-reel-video` already documents for video. The dashboard runs in the browser → Cloudflare Worker, which can't execute any of that, so this always runs in chat, not from a dashboard button. The Worker's own renderer (`generateCarouselPreview` / the 🧷 Assemble button's `renderCarouselFromManifestCore`, driven by Cloudflare's Browser Rendering REST API) remains the one-click dashboard path for when the Remotion codebase isn't specifically wanted — both write PNGs to the identical hosted path/convention, so either can pick up where the other left off, same relationship `make-carousel.md` already has with the dashboard's Canva-free quick path.

## Prerequisites
- Node.js 18+ and `ffmpeg` (not strictly needed for stills, but `remotion still` still expects a normal Remotion project setup).
- `npm install remotion @remotion/cli @remotion/renderer` in a scratch project directory (reuse an existing Remotion project already scaffolded in this workspace by a prior `make-reel-video` run if one exists — add a new `CarouselSlide` composition alongside the video composition rather than starting a separate project).
- Notion connector — no PIN needed (chat-only skill, same as every other production skill in this repo).

## Inputs
- **titleId** — the Content Strategy title's Notion page ID.
- **campaignId** — for Design Spec / deploy path resolution.

## Constants
Assets DB `e91bdb6e770b4d298e9f62166a0fd5de` · Design Specs DB `3981f7d3a4bb817c8edad15db64fa50d`.

## Workflow

### Step 0 — Read the slide copy and resolve design direction
Fetch the title page's body. It uses the same fixed block structure every other carousel tool in this repo reads/writes: `heading_3` "Slide N (N/total)" → bold paragraph (headline) → plain paragraph (body) → divider, repeated, then `Caption` and `Hashtags` headings. If no slide copy exists yet, write it first using the same prompt/format `generateCarouselPreview`'s Step 2 uses (or just call that Worker action to write it, then re-fetch) — don't duplicate a separate copywriting pass here.

Resolve visual direction in priority order:
1. The linked Assets DB record's own **Assembly Manifest** (Content Strategy relation contains this title, Asset Type "carousel"), if one has been uploaded via a ChatGPT Visual Design Card session (🧾 Manifest button) — `designTokens` (background/ink/accent/headlineFont/bodyFont) and, per slide, `style.graphicSvg` (real inline SVG — render it directly, same as-is) and `style.footerLabel`.
2. Else the campaign's Design Spec (Background/Ink/Accent/Headline Font/Body Font properties).
3. Else fall back to editorial-minimal: parchment `#F7F1E6` background, deep ink `#2B2620`, warm brown accent `#8A6D4B`, Playfair Display / EB Garamond — this repo's standing default (`DESIGN_SPEC_DEFAULTS` in `worker/worker.js`).

### Step 1 — Scaffold the Remotion project
Standard Remotion project layout (`src/index.ts` registering the root, `src/Root.tsx` declaring compositions, `src/CarouselSlide.tsx` the component). `npm install` the packages listed in Prerequisites. No audio, no captions, no timestamps needed — this is a stills-only project, much simpler than the Reel pipeline.

### Step 2 — Define the CarouselSlide composition
One component, entirely prop-driven — no per-slide hardcoding, no separate component per slide:

```tsx
// src/CarouselSlide.tsx
export const CarouselSlide: React.FC<{
  headline: string; body: string; role: string; footerLabel: string;
  slideNumber: number; total: number;
  background: string; ink: string; accent: string;
  headlineFont: string; bodyFont: string;
  graphicSvg?: string; // raw <svg>...</svg> markup, or empty
}> = (props) => { /* background, rule + graphic (graphicSvg via
  dangerouslySetInnerHTML if present, same fallback decorative mark
  otherwise), role label, headline, body, divider, footer label,
  slide number — same visual language as the Worker's own CSS
  template in renderCarouselFromManifestCore, just as JSX */ };
```

```tsx
// src/Root.tsx
<Composition
  id="CarouselSlide"
  component={CarouselSlide}
  width={1080}
  height={1350}
  fps={30}
  durationInFrames={1}
  defaultProps={{ headline: "", body: "", role: "", footerLabel: "", slideNumber: 1, total: 7, background: "#F7F1E6", ink: "#2B2620", accent: "#8A6D4B", headlineFont: "Playfair Display", bodyFont: "EB Garamond", graphicSvg: "" }}
/>
```

If a slide's `graphicSvg` is present, inject it as-is (it's operator-approved content from the Assembly Manifest, same trust level the Worker's own renderer already treats it with); strip any `<script>` tag as cheap defense-in-depth, same as the Worker does.

### Step 3 — Render each slide as a still PNG
Prefer the programmatic `@remotion/renderer` API (`renderStill`) in a small Node script over 7 separate `npx remotion still` CLI invocations — one bundled Chromium instance instead of a cold start per slide:

```js
// render-slides.mjs
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const bundled = await bundle('src/index.ts');
for (const slide of slides) { // slides = parsed array from Step 0
  const composition = await selectComposition({ serveUrl: bundled, id: 'CarouselSlide', inputProps: slide });
  await renderStill({ composition, serveUrl: bundled, output: `out/slide-${String(slide.slideNumber).padStart(2, '0')}.png`, inputProps: slide });
}
```

Or, if scripting a bundler call is more friction than it's worth for one run, plain CLI per slide is fine too — just script the loop rather than 7 manual commands:
```bash
npx remotion still src/index.ts CarouselSlide out/slide-01.png --props='{"headline":"...", ...}'
```

### Step 4 — Host the PNGs and upsert the Assets DB record
Mirrors exactly how `make-reel-video`'s Step 4 and the dashboard's own carousel pipeline (`publishCarouselSlides`/`renderCarouselFromManifestCore` in `worker.js`) close their own loop, so every carousel production path in this repo behaves identically downstream regardless of which one built the images.

- **Host the files.** Commit each rendered PNG to this repo (you have git access) at:
  `web/{deployPath}/carousels/{titleSlug}/slide-01.png` … `slide-07.png`
  - `deployPath` — from the campaign's `live site`/`microsite` URL property, matching `/web/{path}` or `/microsites/{path}`; fall back to a slugified campaign name if neither is set.
  - `titleSlug` — the title, lowercased, non-alphanumerics collapsed to `-`.
  - Push. Design Link: `https://cabuzzard.github.io/dash/web/{deployPath}/carousels/{titleSlug}/`.
- **Upsert the Assets DB record.** Query for an existing, non-archived record where `Content Strategy` contains this title AND `Asset Type` = `carousel`; update it if found (this is what makes a re-render non-duplicating — same asset record, new Design Link every rebuild), else create:
  - **Asset Title:** `{title} — Carousel`
  - **Asset Type:** `carousel`
  - **Content Strategy:** relation → this title
  - **Campaign:** relation → the campaign
  - **Design Link:** the hosted folder URL above
  - **Status:** `Ready`
  - **Asset Status:** `Development`
  - **Body:** the caption (from the title's `Caption` section)
  - **Notes:** the hashtags (from the title's `Hashtags` section)
  - **Platform Name:** `Instagram` (or whatever the title/method specifies)
- Set the Content Strategy title's own `Status` to `Publish`.

### Step 5 — Report back
- The hosted Design Link (and remind: the dashboard's 🧷 Assemble button will package this into a full Assembly Review page — QA checklist, publishing metadata, "Request a Change" — once run, same as any other carousel's media).
- Caption + hashtags ready to paste.
- Remind: **to revise, edit the slide text (or the Assembly Manifest's design tokens/graphicSvg) on this title/asset, then run this skill again** — it rebuilds every slide from current Notion content rather than starting over.
- Remind: posting to Instagram is manual — no auto-posting exists in this repo.

## Notes
- **Not a replacement for the Worker-native path, an alternative.** `generateCarouselPreview`/`renderCarouselFromManifestCore` stay the one-click dashboard option; reach for this skill specifically when the Remotion codebase/design-component reuse across Carousel+Reel+YouTube is what's wanted.
- **Stills only, no motion.** `durationInFrames={1}` — this composition is never meant to render as video. If per-slide motion/animation is ever wanted, that's a real, separate feature (an actual Ken-Burns-style carousel export or per-slide video), not what this skill does.
- **Run straight through**, same as `make-carousel`/`make-reel-video` — research/copy (if needed) through Notion logging, without pausing to check in.
