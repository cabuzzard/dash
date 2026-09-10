#!/usr/bin/env node
/**
 * Render an offer still: headline + kicker + one line, set in a hub's real
 * fonts over a wordless image plate.
 *
 * Claude fills the text props from the offer page / asset (verbatim title,
 * one research/offer line). The script only renders. It does NOT draw the
 * plate — generate that with scripts/grok-image.py (or the modal's Grok
 * option) first.
 *
 * Usage:
 *   node render-offer-still.mjs \
 *     --hub care-gap \
 *     --plate ../images/help-house-a-caregiver-ig.png   (local file OR https URL) \
 *     --eyebrow "The Care Gap" \
 *     --title "Help House a Caregiver" \
 *     --line "Every dollar you deploy keeps a skilled caregiver housed, employed, and counted." \
 *     --url stablehomefoundation.com \
 *     --shape both            (square | portrait | both; default both) \
 *     --out-dir ../images \
 *     --anchor top            (top | bottom; default top) \
 *     --attach NOTION_ASSET_ID   (optional: POST to the Worker saveOfferImage —
 *                                 square -> Thumbnail, portrait -> Instagram Background;
 *                                 needs HERMES_TOKEN in the env)
 */
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const WORKER = process.env.WORKER_URL || "https://jolly-darkness-5dcc.trailnotes2026.workers.dev";

function args(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) o[a.slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
  }
  return o;
}
const die = (m) => { console.error(m); process.exit(1); };

function hubTokens(slug) {
  const p = path.join(REPO, "web", "hub", "hubs.design.json");
  let hs;
  try { hs = (JSON.parse(fs.readFileSync(p, "utf8")).hubs || {})[slug]; }
  catch (e) { die(`--hub ${slug}: cannot read ${p}: ${e.message}`); }
  if (!hs) die(`--hub ${slug}: not in hubs.design.json`);
  const tk = hs.tokens || {}, f = hs.fonts || {};
  return {
    bg: tk.bg || "#eceef2",
    ink: tk["ink-head"] || tk.ink || "#191b1f",
    sea: tk.sea || tk.accent || "#23506e",
    accent: tk.accent || tk.sea || "#b23a2e",
    displayFont: f.display || "Newsreader",
    bodyFont: f.body || "IBM Plex Sans",
    monoFont: f.mono || "IBM Plex Mono",
  };
}

const o = args(process.argv);
if (!o.hub) die("--hub <slug> is required (pulls colours + fonts from hubs.design.json)");
if (!o.plate) die("--plate <file-or-url> is required (the wordless image plate)");
if (!o.title) die("--title <headline> is required");

const tokens = hubTokens(o.hub);
const shapes = o.shape === "square" ? ["square"] : o.shape === "portrait" ? ["portrait"] : ["square", "portrait"];
const outDir = path.resolve(o["out-dir"] || path.join(REPO, "images"));
fs.mkdirSync(outDir, { recursive: true });

// A local plate must live under public/ for staticFile(); an https plate is passed straight through.
let bgSrc = String(o.plate);
if (!/^https?:\/\//i.test(bgSrc)) {
  const abs = path.resolve(bgSrc);
  if (!fs.existsSync(abs)) die(`--plate: no such file ${abs}`);
  fs.mkdirSync(path.join(HERE, "public"), { recursive: true });
  const name = "plate" + path.extname(abs);
  fs.copyFileSync(abs, path.join(HERE, "public", name));
  bgSrc = name;
}

const baseProps = {
  eyebrow: o.eyebrow || tokensLogo(o.hub) || "",
  title: o.title,
  line: o.line || "",
  url: o.url || "",
  bgSrc,
  anchor: o.anchor === "bottom" ? "bottom" : "top",
  ...tokens,
};

function tokensLogo(slug) {
  try { return (JSON.parse(fs.readFileSync(path.join(REPO, "web", "hub", "hubs.design.json"), "utf8")).hubs || {})[slug]?.logoText || ""; }
  catch { return ""; }
}

const SLUG = String(o.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "offer";
const KIND = { square: "blog-thumbnail", portrait: "ig-background" };
const COMP = { square: "OfferStillSquare", portrait: "OfferStillPortrait" };

console.log("Bundling…");
const serveUrl = await bundle({ entryPoint: path.join(HERE, "src", "index.ts") });

for (const shape of shapes) {
  const inputProps = { ...baseProps, showLine: shape === "portrait" };
  const composition = await selectComposition({ serveUrl, id: COMP[shape], inputProps });
  const out = path.join(outDir, `${SLUG}-${shape}.png`);
  await renderStill({ composition, serveUrl, output: out, inputProps, overwrite: true });
  console.log(out);

  if (o.attach) {
    const token = (process.env.HERMES_TOKEN || "").trim();
    if (!token) die("--attach needs HERMES_TOKEN in the env (sessionStorage.hermes_token)");
    const fileData = fs.readFileSync(out).toString("base64");
    const res = await fetch(WORKER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveOfferImage", token, assetId: o.attach, kind: KIND[shape], contentType: "image/png", fileData }),
    }).then((r) => r.json());
    console.log(`  → ${KIND[shape]}:`, JSON.stringify(res).slice(0, 300));
  }
}
