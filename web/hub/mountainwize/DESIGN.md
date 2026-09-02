# Mountainwize — design brief

Written 2026-09-02. Behind `web/hub/mountainwize/index.html`, for the
"🏔️ Mountainwize Coaching — Purpose" campaign.

## Subject

Purpose coaching for **men over 40** who did everything right — the career, the
family, the money — and still feel the gap where a reason should be. The coach is
Evan, "the mountain man." His credibility isn't a certification or a framework;
it's **lived, consequence-earned experience** — real mountaineering, real money
made and lost, an actual rebuild. He has been where the reader is.

- **Audience:** men 38–60 who've tried therapy, journaling, meditation and found
  them insufficient. Skeptical of the coaching industry. Not looking to *read*
  more — ready to buy a structured path.
- **The page's one job:** get them to take the free **assessment** (email
  capture), which sorts what they're actually dealing with and points them to the
  right route.
- **The positioning the design must hold:** *against* the wellness/"midlife
  women"/"mindset" cluster that every visible competitor uses, and *against* the
  biohacking/optimization cluster. This hub is for the man those two both miss.

## Token system

### Color — a topo map, not a spa

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#edf0f0` | cold high-altitude morning light, blue-grey — *(2026-09-02: was `#f3f0e8` warm topo paper; pulled cold per "the one risk" below)* |
| `--surface` | `#f9fbfb` | raised card |
| `--ink` | `#191d21` | cold graphite |
| `--ink-soft` | `#555c63` | stone grey |
| `--line` | `rgba(25,29,33,.13)` | hairline |
| `--sea` (primary) | `#2f5266` | deep alpine slate-blue — altitude, shadow, depth. Eyebrows, links, kickers, focus ring |
| `--deep` | `#13171a` | granite — the one dark band (where the assessment sits); deepened for more separation from the colder ground |
| `--deep-ink` | `#d5dadd` | text on `--deep` |
| `--accent` | `#b0402f` | **the route line** — brick red, used once, on the primary CTA |

The field is deliberately **cool**: graphite ink, slate-blue primary. The single
warm hit (`--accent`) is the CTA — "the red line on the map, the way through,"
which is literally the campaign's promise (*"actually knows the way through"*).

### Type

- **Display — Bitter** (500/600/700). A slab serif with weight and spine — reads
  as a field guide / an expedition report written by someone who did it, not
  wellness-soft, not tech-geometric.
- **Body — Inter** (400/500/600). Neutral, gets out of the way for sharp copy.
- **Mono — Space Mono** (400/700). Route data — session length, price, weeks,
  the terms. Utilitarian with a bit of grit.

### Layout

The template's single column. Sections read as an ascent: the hero states the
whole climb, `trips` is **the routes**, the dark band is the assessment.

## Signature

**The route.** The page is structured like a climb and named like one — the
ribbon is *route beta* (the conditions strip: "For men over 40 · Structured, not
open-ended · Lived, not theoretical · The descent is the hard part"), and the
offer section is **four routes**, graded by where you are (Recon · free → 4-week
Reset → the flagship climb → the group rope team), not sorted by price. Hero
thesis is the campaign's own sharpest line: *"Therapy got you functional. This is
the part after."*

## The one risk

Slab serif + weathered paper + a brick-red accent can drift toward the generic
**"rugged outdoors brand"** template (REI-adjacent). Mitigation: it stays
precise and quiet — **zero images**, no mountain silhouettes, no textures, no
adventure stock photography. The route *language* does the work, and the
men-over-40-consequence copy keeps it sharp rather than aspirational. If
revisited: consider dropping the warm accent for a high-altitude ice-blue and
leaning harder on the topo/elevation-profile motif as an actual drawn element.

## Deliberately avoided

- The wellness cluster: soft sans, sage/blush, gradient blobs, lowercase,
  "journey" language. This is the exact aesthetic the campaign positions against.
- The biohacking/tech-dark cluster: near-black ground, neon accent, data UI.
- The three AI defaults (cream + serif + terracotta / near-black + acid accent /
  broadsheet hairlines).
- Any photograph of a mountain, a man looking pensively at a view, or a summit.
