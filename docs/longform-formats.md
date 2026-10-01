# Longform episode formats — research (2026-09-30)

Why the YouTube Longform — Question-Led methods offer the formats they do (`LF_FORMATS` in `worker/worker.js`,
mirrored as `CA_LF_FORMATS` in `microsites/care-gap-v2/index.html`).

## Method

- 17 faceless explainer/narration channels from the Faceless Channel Benchmarks artifact plus Shane Hummus
  (VTuber and animated-story channels left out): Economics Explained, Half as Interesting, Let Me Explain Studios,
  OverSimplified, Psych2Go, RealLifeLore, Sam O'Nella, Sciencephile, Sprouts, The Infographics Show,
  The Swedish Investor, WatchMojo, Wendover, Alux, Business Casual, Kurzgesagt, Shane Hummus.
- Up to 600 most recent uploads each (yt-dlp flat playlist: title, duration, views) → 5,195 videos of 5+ minutes.
- Each title classified into a format by title pattern (first match wins); ~35% stay "other" — mostly
  topic-statement explainers ("China's Geography Problem").
- Score = a video's views ÷ its own channel's median long-video views, so big channels don't dominate.
  Reported: median of that ratio per format, and the share of the format's videos in the top 10% overall.

## Results

| Format | Videos | Channels | Median × (all) | Median × (last 150/channel) | In top 10% |
|---|---|---|---|---|---|
| What if / scenario | 105 | 8 | 1.47 | 1.82 | 15% (recent 30%) |
| Book / theory breakdown | 142 | 11 | 1.22 | 1.10 | 19% |
| Story / rise & fall | 123 | 12 | 1.20 | 1.17 | 13% |
| Ranked list | 1,222 | 15 | 1.11 | 1.32 | 15% |
| Myth-busting / truth | 215 | 12 | 1.05 | 0.90 | 16% |
| Trend / news breakdown | 145 | 11 | 1.04 | 1.52 | 17% |
| Explainer (how / why) | 932 | 15 | 1.04 | 0.88 | 7% |
| Playbook / "how I'd" | 43 | 6 | 1.00 | 1.00 | 16% (recent 31%) |
| How-to / guide | 161 | 11 | 0.88 | 1.27 | 9% |
| Mistakes / avoid | 184 | 14 | 0.89 | 0.90 | 8% |
| Tier list | 17 | 2 | 1.08 | 0.80 | 12% |
| Worth it / verdict | 18 | 8 | 1.20 | 0.89 | 6% |
| Versus | 35 | 9 | 0.63 | 0.78 | 6% |

## Chosen

Offered: **ranked, explainer, whatif, theory, story, myths, playbook** — each has its own per-item beat sheet
and default item count; all render with the same item cards (#n, name, blurb; pay/score/tier only where they fit).

- Explainer kept despite a ~1.0× median: it is the most common format on every channel and the natural shape
  for "why/how" viewer questions.
- Playbook is thin in the data but strong at the top and is the format that uses the operator interview most.
- Trend/news left out for now: it needs live news grounding the pipeline doesn't do yet.
- Tier list, verdict and versus underperform → **legacy** (kept so older episodes regenerate; not offered).

Re-run: scratchpad scripts `fetch.py` (yt-dlp) + `classify.py` (patterns + scoring) — rebuild if the
benchmark list changes.
