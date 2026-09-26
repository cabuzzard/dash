# HyperFrames video templates (dash "HyperFrames Reel" method)

Each folder is one HyperFrames composition used as a **template**: the worker renders it on
HeyGen's hosted cloud with per-asset `--variables` (copy + hub palette/fonts + background plate).

- `reel-kinetic/` — 9:16, 20s kinetic-text Reel: hook (0-5s) → 3 beats (4s each) → CTA (17-20s).
  Variables: hook, beat1-3, cta, brand, bgImage (https URL), bg/ink/accent (hex),
  displayFont/bodyFont (enum of the hub fonts, bundled in assets/fonts — no network at render).

Local test: `cd reel-kinetic && npx hyperframes check --snapshots`
then `npx hyperframes render --quality draft --variables-file vars.json --output renders/test.mp4`.
