#!/usr/bin/env node
// build-design-library.mjs — builds web/hub/design-library/ (the starting looks for the hub designer) from
// two MIT-licensed open-source libraries cloned locally:
//   VoltAgent/awesome-design-md   → brands/<id>.md (84 brand DESIGN.md files) + their colors/fonts mapped to hub tokens
//   Leonxlnx/taste-skill library  → palettes.json (64 palettes) + type.json (39 font pairings)
//
//   node scripts/build-design-library.mjs <awesome-design-md dir> <taste-skill dir>
//
// Output: web/hub/design-library/{index.json, palettes.json, type.json, brands/*.md, LICENSES.md}
// index.json is what the hub designer reads: every look as { id, source, name, note, tokens, fonts }, where
// tokens use the same names as hubs.design.json (bg surface ink ink-soft line sea deep deep-ink accent paper).
// Re-run after pulling newer copies of either repo. Nothing here touches a live hub.

import fs from "node:fs";
import path from "node:path";

const [admDir, tasteDir] = process.argv.slice(2);
if (!admDir || !tasteDir) { console.error("usage: build-design-library.mjs <awesome-design-md dir> <taste-skill dir>"); process.exit(1); }
const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT = path.join(ROOT, "web/hub/design-library");
fs.mkdirSync(path.join(OUT, "brands"), { recursive: true });

const hex = v => { const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(String(v || "")); if (!m) return null; let h = m[1].toLowerCase(); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return "#" + h; };
const lum = h => { const n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };

// tiny front-matter reader: the DESIGN.md files use a fixed YAML shape (scalars, one-level maps, two-level typography)
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!m) return {};
  const out = {}; let sec = null, sub = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const ind = raw.match(/^ */)[0].length, line = raw.trim(), i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (ind === 0) { if (v) out[k] = v; else { out[k] = {}; sec = k; sub = null; } }
    else if (ind === 2 && sec) { if (v) out[sec][k] = v; else { out[sec][k] = {}; sub = k; } }
    else if (ind >= 4 && sec && sub && typeof out[sec][sub] === "object") out[sec][sub][k] = v;
  }
  return out;
}
const pick = (colors, res) => { for (const re of res) { const k = Object.keys(colors).find(n => re.test(n)); if (k && hex(colors[k])) return hex(colors[k]); } return null; };

function brandTokens(colors) {
  const all = Object.values(colors).map(hex).filter(Boolean);
  const bg = pick(colors, [/^canvas$/, /^background$/, /^bg$/, /^(page|base)(-bg)?$/, /canvas/, /background/]) || all.sort((a, b) => lum(b) - lum(a))[0];
  let ink = pick(colors, [/^ink$/, /^text$/, /^foreground$/, /^on-(canvas|background)$/, /^(text|ink)-primary$/, /^ink/, /^text/]) || (lum(bg) > .5 ? "#111111" : "#f5f5f5");
  if (contrast(ink, bg) < 4.5) ink = [...new Set(all)].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0] || ink;
  let primary = pick(colors, [/^primary$/, /^brand$/, /^accent$/, /^brand-primary$/, /primary/, /brand/, /accent/]) || ink;
  if (contrast(primary, bg) < 3) {   // the accent must show against the page — else the most colorful palette color that does, else ink
    const sat = h => { const n = parseInt(h.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b); };
    primary = [...new Set(all)].filter(c => contrast(c, bg) >= 3).sort((a, b) => sat(b) - sat(a))[0] || ink;
  }
  const surface = pick(colors, [/^surface-1$/, /^surface$/, /^card$/, /^surface-(soft|subtle|raised)$/, /surface/, /card/]) || bg;
  let soft = pick(colors, [/^ink-(muted|subtle|secondary)$/, /^text-(muted|secondary|subtle)$/, /muted/, /secondary/, /subtle/]) || ink;
  if (contrast(soft, bg) < 4.5) {   // secondary text must stay readable (WCAG AA) — else the palette color closest to 6:1, else ink
    const sat = h => { const n = parseInt(h.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
    const ok = [...new Set(all)].filter(c => { const r = contrast(c, bg); return r >= 4.5 && r <= 12 && sat(c) < .25; }).sort((a, b) => Math.abs(contrast(a, bg) - 6) - Math.abs(contrast(b, bg) - 6));
    soft = ok[0] || ink;   // a neutral (low-saturation) gray, never a brand color
  }
  const line = pick(colors, [/^hairline$/, /^border$/, /^divider$/, /hairline/, /border/, /divider/]) || surface;
  const sorted = [...new Set(all)].sort((a, b) => lum(a) - lum(b));
  const darkest = sorted[0] || "#111111", lightest = sorted[sorted.length - 1] || "#ffffff";
  const accentInk = contrast(primary, "#ffffff") >= 4.5 ? "#ffffff" : "#111111";
  return { bg, surface, ink, "ink-head": ink, "ink-soft": soft, line, sea: primary, deep: lum(bg) < .2 ? surface : darkest, "deep-ink": lum(bg) < .2 ? ink : lightest, accent: primary, paper: surface, _accentInk: accentInk };
}

const looks = [];
// 1 · brands
const bdir = path.join(admDir, "design-md");
for (const id of fs.readdirSync(bdir).sort()) {
  const f = path.join(bdir, id, "DESIGN.md"); if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, "utf8"); fs.writeFileSync(path.join(OUT, "brands", id + ".md"), text);
  const fm = frontMatter(text), colors = fm.colors && typeof fm.colors === "object" ? fm.colors : {};
  if (!Object.keys(colors).length) continue;
  const fams = [...new Set(Object.values(fm.typography || {}).map(t => t && t.fontFamily).filter(Boolean))];
  looks.push({ id: "brand:" + id, source: "awesome-design-md", name: (fm.name || id).replace(/-design-analysis$/i, ""), note: (fm.description || "").slice(0, 400),
    tokens: brandTokens(colors), fonts: { display: fams[0] || null, body: fams[1] || fams[0] || null, all: fams }, file: "brands/" + id + ".md" });
}
// 2 · taste-skill palettes + type pairings
const lib = path.join(tasteDir, "skills/taste-skill/library");
const palettes = JSON.parse(fs.readFileSync(path.join(lib, "palettes.json"), "utf8"));
const types = JSON.parse(fs.readFileSync(path.join(lib, "type.json"), "utf8"));
fs.writeFileSync(path.join(OUT, "palettes.json"), JSON.stringify(palettes, null, 1));
fs.writeFileSync(path.join(OUT, "type.json"), JSON.stringify(types, null, 1));
for (const p of palettes) {
  const field = (p.fields && p.fields[0]) || {};
  looks.push({ id: "palette:" + p.id, source: "taste-skill", name: p.name, note: (p.note || "").slice(0, 400), tags: p.tags || [], trades: p.trades || [],
    tokens: { bg: p.bg, surface: p.surface, ink: p.ink, "ink-head": p.ink, "ink-soft": p.muted, line: p.surface, sea: p.accent, deep: field.bg || p.ink, "deep-ink": field.ink || p.bg, accent: p.accent, paper: p.surface, _accentInk: p.accentInk || "#ffffff" }, fonts: null });
}
const fonts = types.map(t => ({ id: "type:" + t.id, source: "taste-skill", class: t.class, moods: t.moods || [], suits: t.suits || "",
  display: t.display && t.display.family, body: t.text && t.text.family, mono: t.mono && t.mono.family }));

for (const l of looks) { const t = l.tokens, w = [];   // readability warnings the hub designer shows before applying a look
  if (contrast(t.ink, t.bg) < 4.5) w.push("body text below 4.5:1"); if (contrast(t["ink-soft"], t.bg) < 4.5) w.push("secondary text below 4.5:1");
  if (contrast(t.sea, t.bg) < 3) w.push("accent below 3:1 on the page (use it as a fill, not for text or links)"); if (contrast(t["deep-ink"], t.deep) < 4.5) w.push("dark band text below 4.5:1");
  l.checks = w; }
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({ built: new Date().toISOString().slice(0, 10),
  note: "Starting looks for the hub designer. tokens use hubs.design.json names; _accentInk = readable text on the accent. Brand fonts are often proprietary: pair them with a fonts[] entry (Google-served) before applying.",
  counts: { brands: looks.filter(l => l.source === "awesome-design-md").length, palettes: palettes.length, fonts: fonts.length }, looks, fonts }, null, 1));
fs.writeFileSync(path.join(OUT, "LICENSES.md"), "# Design library sources\n\nBoth are MIT-licensed; copies of the licenses follow.\n\n"
  + "## VoltAgent/awesome-design-md (brands/*.md)\n\n```\n" + fs.readFileSync(path.join(admDir, "LICENSE"), "utf8").trim() + "\n```\n\n"
  + "## Leonxlnx/taste-skill (palettes.json, type.json)\n\n```\n" + fs.readFileSync(path.join(tasteDir, "LICENSE"), "utf8").trim() + "\n```\n");
console.log("design library:", looks.length, "looks,", fonts.length, "font pairings →", path.relative(ROOT, OUT));
