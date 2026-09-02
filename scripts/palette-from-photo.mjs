#!/usr/bin/env node
// palette-from-photo.mjs — turn a handful of reference colours (pulled from a
// photo, a mood board, a logo) into a hub's design tokens, contrast-checked,
// and write them into web/hub/hubs.design.json.
//
//   node scripts/palette-from-photo.mjs <slug> "#8a9a5b,#e8d8b0,#3a2f1e,#c96f2e"
//   node scripts/palette-from-photo.mjs care-gap "#1f3b57,#e9edf2,#b23a2e" --light --build
//
// Flags:
//   --light / --dark   force the ground (default: inferred from the colours)
//   --dry              print the tokens, don't write
//   --build            run build-hubs.mjs afterwards (pushes tokens into the HTML)
//
// The palette drives the WHOLE hub page — background, headings, body, links,
// buttons, the dark band. This is the input step; build-hubs.mjs is what makes
// it live. Rerun any time the reference (or the research) gets better.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SPEC = path.join(ROOT, "web/hub/hubs.design.json");

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [slug, list] = argv.filter((a) => !a.startsWith("--"));
if (!slug || !list) {
  console.error('usage: node scripts/palette-from-photo.mjs <slug> "#hex,#hex,..." [--light|--dark] [--dry] [--build]');
  process.exit(2);
}

/* ---------- colour maths ------------------------------------------------ */
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const hx = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
const toHex = (c) => "#" + hx(c.r) + hx(c.g) + hx(c.b);
function parseHex(s) {
  let h = s.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h, s, l };
}
function toRgb({ h, s, l }) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
function relLum({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const chromaOf = (c) => (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
function nudgeL(rgb, dir, target, min, cmp) {
  let out = rgb;
  for (let k = 0; k < 40 && cmp(out); k++) {
    const h = toHsl(out); h.l = clamp(h.l + dir * 0.02, 0.03, 0.97); out = toRgb(h);
  }
  return out;
}

/* ---------- derive the 10 roles from the reference colours ------------- */
const ref = list.split(",").map((s) => parseHex(s)).filter((c) => Number.isFinite(c.r));
if (!ref.length) { console.error("no valid hex colours in the list"); process.exit(2); }

const avgL = ref.reduce((s, c) => s + relLum(c), 0) / ref.length;
const dom = ref.slice().sort((a, b) => chromaOf(b) - chromaOf(a) + (relLum(b) - relLum(a)) * 0)[0] || ref[0];
const domH = toHsl(ref[0]).h;         // hue of the most prominent colour (list order = prominence)
const dh = toHsl(ref[0]);
let dark = flags.has("--dark") ? true : flags.has("--light") ? false : (avgL * 0.6 + dh.l * 0.4) < 0.44;

// vivid = most colourful reference, biased to mid lightness
let vivid = ref[0], vs = -1;
for (const c of ref) {
  const { l } = toHsl(c);
  const score = Math.min(0.5, chromaOf(c)) * (1 - Math.min(1, Math.abs(l - 0.5) / 0.42));
  if (score > vs) { vs = score; vivid = c; }
}
// a second, hue-distinct colourful reference (for headings), if there is one
const vH = toHsl(vivid).h;
const alt = ref
  .map((c) => ({ c, hsl: toHsl(c) }))
  .filter((x) => chromaOf(x.c) >= 0.1 && Math.min(Math.abs(x.hsl.h - vH), 360 - Math.abs(x.hsl.h - vH)) > 25)
  .sort((a, b) => chromaOf(b.c) - chromaOf(a.c))[0]?.c || null;

// ground + surface
const ground = toRgb({
  h: dh.h,
  s: clamp(dh.s * (dark ? 0.7 : 0.55), 0, dark ? 0.32 : 0.13),
  l: dark ? clamp(dh.l, 0.07, 0.15) : clamp(dh.l, 0.9, 0.965),
});
const surface = toRgb({ ...toHsl(ground), l: clamp(toHsl(ground).l + (dark ? 0.045 : 0.03), 0, 1) });
const mount2 = toRgb({ ...toHsl(ground), l: clamp(toHsl(ground).l + (dark ? 0.022 : 0.018), 0, 1) });

// body ink — near-black / near-white with a faint hue tint, >= 8:1 on ground
let ink = toRgb({ h: dh.h, s: 0.1, l: dark ? 0.94 : 0.09 });
ink = nudgeL(ink, dark ? 1 : -1, null, null, (o) => contrast(o, ground) < 8);

// headings — a chromatic "voice": the alt colour if distinct, else a deep/tinted take on vivid, else = ink
let head = ink;
{
  const base = alt || vivid;
  if (chromaOf(base) >= 0.09) {
    let h = toHsl(base);
    h.l = dark ? clamp(h.l, 0.6, 0.82) : clamp(h.l, 0.2, 0.4);
    let d = toRgb(h);
    d = nudgeL(d, dark ? 1 : -1, null, null, (o) => contrast(o, ground) < 4.5);
    if (contrast(d, ground) >= 4.3) head = d;
  }
}

// muted text — between ink and ground, held 3:1..5.5:1
let soft = mix(ink, ground, 0.52);
soft = nudgeL(soft, dark ? 1 : -1, null, null, (o) => contrast(o, ground) < 3.0);
soft = nudgeL(soft, dark ? -1 : 1, null, null, (o) => contrast(o, ground) > 5.6);

// hairline — a faint line hex
const line = toRgb({ ...toHsl(ink), l: dark ? 0.24 : 0.9 });

// primary (links, eyebrows) — vivid, >= 4.5:1 on ground
let sea = { ...vivid };
if (toHsl(sea).s < 0.12) sea = toRgb({ h: dh.s > 0.05 ? dh.h : 210, s: 0.4, l: dark ? 0.6 : 0.4 });
sea = nudgeL(sea, dark ? 1 : -1, null, null, (o) => contrast(o, ground) < 4.5);

// dark band — a deep version of the dominant hue
const deep = toRgb({ h: dh.h, s: clamp(dh.s, 0.14, 0.5), l: 0.1 });
let deepInk = toRgb({ h: dh.h, s: 0.09, l: 0.88 });
deepInk = nudgeL(deepInk, 1, null, null, (o) => contrast(o, deep) < 7);

// accent (buttons) — vivid, darkened until white text clears 4.4:1
let accent = { ...vivid };
for (let k = 0; k < 40 && contrast({ r: 255, g: 255, b: 255 }, accent) < 4.4; k++) {
  const h = toHsl(accent); h.l = clamp(h.l - 0.02, 0.05, 0.9); h.s = clamp(h.s + 0.01, 0, 1); accent = toRgb(h);
}

const tokens = {
  bg: toHex(ground), surface: toHex(surface), ink: toHex(ink), "ink-head": toHex(head),
  "ink-soft": toHex(soft), line: toHex(line), sea: toHex(sea), deep: toHex(deep),
  "deep-ink": toHex(deepInk), accent: toHex(accent), paper: toHex(surface),
};

/* ---------- report + write ------------------------------------------- */
const rep = (fg, bg2, label) => `${label}: ${contrast(parseHex(tokens[fg]), parseHex(tokens[bg2])).toFixed(2)}:1`;
console.log(`\n${slug}  (${dark ? "dark" : "light"} ground, from ${ref.length} reference colours)\n`);
for (const [k, v] of Object.entries(tokens)) console.log(`  ${k.padEnd(10)} ${v}`);
console.log("\n  " + [rep("ink", "bg", "body/bg"), rep("ink-head", "bg", "head/bg"), rep("sea", "bg", "primary/bg"), rep("deep-ink", "deep", "deepInk/deep")].join("   "));
console.log(`  white/accent: ${contrast({ r: 255, g: 255, b: 255 }, parseHex(tokens.accent)).toFixed(2)}:1`);

if (flags.has("--dry")) { console.log("\n--dry: not written"); process.exit(0); }

const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));
if (!spec.hubs[slug]) { console.error(`\nno hub "${slug}" in hubs.design.json`); process.exit(1); }
spec.hubs[slug].tokens = tokens;
spec.hubs[slug].tokenNotes = spec.hubs[slug].tokenNotes || {};
const stamp = new Date().toISOString().slice(0, 10);
spec.hubs[slug].tokenNotes.bg = `derived from a reference image (${stamp})`;
fs.writeFileSync(SPEC, JSON.stringify(spec, null, 2) + "\n");
console.log(`\n✎ wrote hubs.${slug}.tokens in hubs.design.json`);

if (flags.has("--build")) {
  console.log("\n→ node scripts/build-hubs.mjs\n");
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-hubs.mjs")], { stdio: "inherit" });
} else {
  console.log("   next: node scripts/build-hubs.mjs   (then commit + push)");
}
