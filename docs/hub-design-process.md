# Hub design process (2026-11-20)

How a hub's look is chosen, checked and shipped, and which outside tools each step uses.

## The rule

One design file per hub drives every surface. `web/hub/hubs.design.json` is that file (tokens, fonts, meta, thumbnail
rule). Pages, post thumbnails, offer images and social templates read it; nothing invents its own look. (Same idea as
the "brand brain → design system → every surface" workflow in the swipe file, bazouzii, and the DESIGN.md movement.)

## Steps

1. **Pick a starting look.** `web/hub/design-library/index.json` holds 138 looks already mapped to hub token names:
   74 brand systems (VoltAgent/awesome-design-md, e.g. Linear, Stripe, Notion; full write-ups in `brands/<id>.md`)
   and 64 palettes (taste-skill), plus 39 Google-font pairings (`fonts[]`). Each look carries `checks[]`: readability
   warnings (text below 4.5:1, accent below 3:1). Brand fonts are usually proprietary, so pair a brand look with a
   `fonts[]` entry before applying. Rebuild: `node scripts/build-design-library.mjs <awesome-design-md> <taste-skill>`.
2. **Adjust it for the hub.** Colors, fonts and the thumbnail rule only. Layout is shared by every hub and is not
   part of a hub's design.
3. **Apply.** Write the tokens/fonts into `hubs.design.json`, run `node scripts/build-hubs.mjs` (pushes tokens, fonts
   and meta into the hub page and its privacy page), `--check` must pass.
4. **Check the page.** Run the `web-design-guidelines` skill (Vercel Web Interface Guidelines, pinned copy in
   `~/.claude/skills/web-design-guidelines`) on `web/hub/<slug>/index.html`. Fixes to shared layout go into
   `hub-template.html` and every hub at once (a script, never one file by hand).
5. **Look at it.** Screenshot the live page (Cloudflare Browser Rendering, the same renderer the thumbnails use) at
   phone and desktop width before calling it done.
6. **Copy.** Hub and post copy go through the `stop-slop` skill (removes AI tells).
7. **Images follow.** Post/offer thumbnails re-render from the hub's `thumbnail` rule (Content Hubs 2 →
   🖼 Restyle thumbnails); every replaced image is kept in the asset's 🗂 Library.

## Installed tools (Claude Code, user level)

| Skill | Source | Use |
|---|---|---|
| `web-design-guidelines` | vercel-labs/agent-skills (MIT; rules pinned, SHA-256 matches upstream) | step 4 audit |
| `stop-slop` | hardikpandya/stop-slop (MIT) | step 6 copy |
| `frontend-design` | Anthropic (already present) | building or restyling UI |

**Not installed on purpose:** taste-skill v2.5 itself. It adds a Stop hook that runs 1.6 MB of its own Node scripts at
the end of every session and enforces layout rules (one section per screen, photographs everywhere) that conflict with
"a hub redesign is colors, type and images, not layout". Its palette and type library are used instead (step 1).

## First audit (2026-11-20, all 12 hubs + template)

Fixed in the shared layout: skip link; `scroll-padding-top` so anchor jumps and focused elements clear the sticky
header; `text-wrap: balance` on h1–h3; `touch-action: manipulation`; tabular numbers on dates; reduced-motion guard
on card/button hover lifts; hero image loads eagerly with `fetchpriority="high"` (was lazy); width/height on hero and
card images. Open: no `<meta name="theme-color">` (would need build-hubs to own it per hub).
