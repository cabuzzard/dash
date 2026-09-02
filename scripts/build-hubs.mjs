#!/usr/bin/env node
// build-hubs.mjs — push web/hub/hubs.design.json (the master design spec) into
// every web/hub/<slug>/index.html.
//
//   node scripts/build-hubs.mjs            apply the spec (writes files)
//   node scripts/build-hubs.mjs --check    verify only; exit 1 if any hub has drifted
//   node scripts/build-hubs.mjs --deck PATH  also sync a Hub Deck artifact html
//
// Only three regions of each hub are ever rewritten: the <head> meta (title +
// description + og:*), the Google Fonts <link>, and the :root DESIGN TOKENS
// block. SHARED LAYOUT and the RENDER script are never touched.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SPEC = path.join(ROOT, "web/hub/hubs.design.json");
const HUB_DIR = path.join(ROOT, "web/hub");

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const deckPath = args.includes("--deck") ? args[args.indexOf("--deck") + 1] : null;

const spec = JSON.parse(fs.readFileSync(SPEC, "utf8"));
const TOKENS = ["bg", "surface", "ink", "ink-soft", "line", "sea", "deep", "deep-ink", "accent", "paper"];

/* ---------- helpers ---------------------------------------------------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const pad = (s, n) => (s.length >= n ? s : s + " ".repeat(n - s.length));

function fontDecl(role, family) {
  const reg = spec.fontRegistry[family];
  if (!reg) throw new Error(`font "${family}" is not in fontRegistry — add it to hubs.design.json`);
  const field = pad(`  --font-${role}:`, 17);
  return `${field} "${family}", ${reg.fallback};`;
}

function rootBlock(hub, eol) {
  const L = [":root{"];
  for (const t of TOKENS) {
    const val = hub.tokens[t];
    if (!val) throw new Error(`missing token --${t}`);
    const note = hub.tokenNotes?.[t];
    L.push(`${pad(`  --${t}:`, 15)}${val};${note ? `   /* ${note} */` : ""}`);
  }
  L.push("");
  L.push(fontDecl("display", hub.fonts.display));
  L.push(fontDecl("body", hub.fonts.body));
  L.push(fontDecl("mono", hub.fonts.mono));
  L.push("");
  L.push(`${pad("  --logo-text:", 14)} "${hub.logoText}";`);
  L.push(`${pad("  --logo-img:", 14)} none;`);
  L.push("}");
  return L.join(eol);
}

function fontLink(hub) {
  const q = ["display", "body", "mono"]
    .map((r) => "family=" + spec.fontRegistry[hub.fonts[r]].query)
    .join("&");
  return `<link href="https://fonts.googleapis.com/css2?${q}&display=swap" rel="stylesheet">`;
}

// WCAG relative-luminance contrast, for the warnings pass
function contrast(a, b) {
  const lum = (hex) => {
    const h = hex.replace("#", "");
    const v = [0, 2, 4].map((i) => {
      let c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function auditContrast(slug, t) {
  const warn = [];
  const pairs = [
    ["ink", "bg", 4.5], ["ink-soft", "bg", 4.5], ["sea", "bg", 4.5],
    ["ink", "surface", 4.5], ["ink-soft", "surface", 4.5],
    ["deep-ink", "deep", 4.5], ["#ffffff", "accent", 4.4], // shared .btn white label
  ];
  for (const [fg, bg, min] of pairs) {
    const f = fg.startsWith("#") ? fg : t[fg];
    const g = bg.startsWith("#") ? bg : t[bg];
    const r = contrast(f, g);
    if (r < min) warn.push(`${fg} on ${bg} = ${r.toFixed(2)} (want ${min})`);
  }
  return warn;
}

/* ---------- apply to hubs -------------------------------------------- */
let drift = 0;
const slugs = Object.keys(spec.hubs);
for (const slug of slugs) {
  const hub = spec.hubs[slug];
  const file = path.join(HUB_DIR, slug, "index.html");
  const src = fs.readFileSync(file, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  let out = src;

  const subs = [
    [/<title>[^<]*<\/title>/, `<title>${esc(hub.meta.title)}</title>`],
    [/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(hub.meta.description)}">`],
    [/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(hub.meta.ogTitle)}">`],
    [/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(hub.meta.ogDescription)}">`],
    [/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/, fontLink(hub)],
    [/:root\{\r?\n[\s\S]*?\r?\n\}/, rootBlock(hub, eol)],
  ];
  for (const [re, rep] of subs) {
    if (!re.test(out)) throw new Error(`${slug}: could not locate ${re}`);
    out = out.replace(re, () => rep);
  }

  const w = auditContrast(slug, hub.tokens);
  if (w.length) console.warn(`  ⚠ ${slug}: ${w.join("; ")}`);

  if (out === src) {
    console.log(`  = ${slug}`);
  } else if (CHECK) {
    console.log(`  ✗ ${slug} — drifted from spec`);
    drift++;
  } else {
    fs.writeFileSync(file, out);
    console.log(`  ✎ ${slug}`);
  }
}

/* ---------- optional: sync a Hub Deck artifact ---------------------- */
if (deckPath) {
  const deckFile = path.resolve(deckPath);
  let deck = fs.readFileSync(deckFile, "utf8");
  const eol = deck.includes("\r\n") ? "\r\n" : "\n";

  for (const slug of slugs) {
    const t = spec.hubs[slug].tokens, f = spec.hubs[slug].fonts;
    const line2 =
      `    bg:"${t.bg}", surface:"${t.surface}", ink:"${t.ink}", inkSoft:"${t["ink-soft"]}", ` +
      `line:"${t.line}", sea:"${t.sea}", deep:"${t.deep}", accent:"${t.accent}",`;
    const re = new RegExp(`(\\{ slug:"${slug}",[\\s\\S]*?\\n)    bg:"[^\\n]*\\n    display:"[^"]*", mono:"[^"]*",`);
    if (!re.test(deck)) { console.warn(`  ⚠ deck: no HUBS entry for ${slug}`); continue; }
    deck = deck.replace(re, (_m, head) => `${head}${line2}${eol}    display:"${f.display}", mono:"${f.mono}",`);
  }

  // re-embed the live hub HTML so the deck previews match
  const blob = {};
  for (const slug of slugs) {
    let h = fs.readFileSync(path.join(HUB_DIR, slug, "index.html"), "utf8");
    h = h.replace(/<script src="https:\/\/challenges\.cloudflare\.com\/turnstile[^>]*><\/script>\s*/, "");
    blob[slug] = Buffer.from(h, "utf8").toString("base64");
  }
  deck = deck.replace(
    /(<script id="hub-html" type="application\/json">)[\s\S]*?(<\/script>)/,
    (_m, a, b) => a + JSON.stringify(blob) + b
  );

  if (CHECK) {
    console.log("  (--deck ignored under --check)");
  } else {
    fs.writeFileSync(deckFile, deck);
    console.log(`  ✎ deck: ${path.basename(deckFile)}`);
  }
}

if (CHECK && drift) {
  console.error(`\n${drift} hub(s) drifted from hubs.design.json — run 'node scripts/build-hubs.mjs' to resync.`);
  process.exit(1);
}
console.log(CHECK ? "\nspec ✓ in sync" : "\ndone");
