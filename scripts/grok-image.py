#!/usr/bin/env python3
"""Generate an image via xAI Grok Imagine and optionally attach it to an Asset.

Claude runs this script. It does NOT draw. Write the --prompt from the asset
title (verbatim on-image words, if any) plus one research pain line. Do not
invent new headlines. Do not open Chrome.

Env:
  XAI_API_KEY   required        set once: setx XAI_API_KEY "sk-..."  (do NOT commit it)
  WORKER_URL    optional        default https://jolly-darkness-5dcc.trailnotes2026.workers.dev
  HERMES_TOKEN  optional        sessionStorage.hermes_token after PIN login (only needed with --asset-id)

Examples:
  # just a file on disk
  python scripts/grok-image.py --prompt "..." --out images/help-house-a-caregiver-thumb.png --aspect-ratio 1:1

  # pull the hub's global design spec into the prompt automatically
  python scripts/grok-image.py --hub care-gap --kind thumbnail --prompt "..." --out images/x.png

  # generate AND attach to a Notion Asset (writes Thumbnail / Instagram Background + rehosts on Pages)
  set HERMES_TOKEN=paste-token
  python scripts/grok-image.py --hub care-gap --kind ig-background --asset-id NOTION_ASSET_ID \
      --prompt "..." --out images/help-house-a-caregiver-ig.png
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.x.ai/v1/images/generations"
DEFAULT_WORKER = "https://jolly-darkness-5dcc.trailnotes2026.workers.dev"
DEFAULT_MODEL = "grok-imagine-image-2.0"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --kind -> (worker saveOfferImage kind, default aspect ratio)
KINDS = {
    "thumbnail": ("blog-thumbnail", "1:1"),
    "blog-thumbnail": ("blog-thumbnail", "1:1"),
    "ig-background": ("ig-background", "3:4"),
    "ig": ("ig-background", "3:4"),
    "instagram": ("ig-background", "3:4"),
}


def die(msg: str, code: int = 1) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def post_json(url: str, payload: dict, headers: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=180) as res:
            raw = res.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        die(f"HTTP {e.code} {url}\n{body}")
    return json.loads(raw.decode("utf-8"))


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "dash-grok-image/1"})
    with urllib.request.urlopen(req, timeout=180) as res:
        return res.read()


def hub_style_block(slug: str) -> str:
    """The site's global design spec (web/hub/hubs.design.json) as prompt text.

    web/hub/hubs.design.json is the ONE master for every hub's look. Inherit it,
    don't restyle: colour tokens, register, and the 'avoided' list.
    """
    path = os.path.join(REPO_ROOT, "web", "hub", "hubs.design.json")
    try:
        with open(path, encoding="utf-8") as f:
            hs = (json.load(f).get("hubs") or {}).get(slug)
    except (OSError, ValueError) as e:
        die(f"--hub {slug}: could not read {path}: {e}")
    if not hs:
        die(f"--hub {slug}: no such hub in hubs.design.json")
    tk, tn, dz = hs.get("tokens", {}), hs.get("tokenNotes", {}), hs.get("design", {})

    def first_sentence(s: str) -> str:
        s = str(s or "")
        for stop in ".!?":
            if stop in s:
                return s.split(stop)[0].strip() + stop
        return s.strip()

    lines = [f'INHERIT THIS SITE\'S LOOK ("{hs.get("logoText") or slug}") — match it exactly, do not invent a new palette or mood:']
    if tk.get("bg"):
        lines.append(f"- Ground tone: {tk['bg']}" + (f" — {tn['bg']}" if tn.get("bg") else ""))
    if tk.get("sea"):
        lines.append(f"- Primary colour: {tk['sea']}" + (f" — {tn['sea']}" if tn.get("sea") else ""))
    if tk.get("accent"):
        lines.append(f"- Accent {tk['accent']}" + (f" ({tn['accent']})" if tn.get("accent") else "") + " — at most once, small")
    if tk.get("ink"):
        lines.append(f"- Darkest value / ink: {tk['ink']}")
    if dz.get("subject"):
        lines.append(f"- Register: {first_sentence(dz['subject'])}")
    if dz.get("photography"):
        lines.append(f"- Photography: {dz['photography']}")
    if dz.get("risk"):
        lines.append(f"- Tone to hold: {dz['risk']}")
    if isinstance(dz.get("avoided"), list) and dz["avoided"]:
        lines.append("- DO NOT: " + "; ".join(dz["avoided"]))
    lines.append("- Any headline/body type is added afterward in the site's own fonts — leave clean, uncluttered space and put NO text in the image.")
    return "\n".join(lines)


def generate(prompt: str, model: str, n: int, extra: dict) -> list[str]:
    key = os.environ.get("XAI_API_KEY", "").strip()
    if not key:
        die("Set XAI_API_KEY  (setx XAI_API_KEY \"sk-...\", then open a new terminal)")
    body = {"model": model, "prompt": prompt, "n": n, **extra}
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
    out = post_json(API, body, headers)
    urls = [item.get("url") for item in (out.get("data") or []) if item.get("url")]
    if not urls:
        die("No image URL in response:\n" + json.dumps(out, indent=2)[:2000])
    return urls


def attach(worker: str, token: str, asset_id: str, kind: str, blob: bytes, content_type: str) -> dict:
    payload = {
        "action": "saveOfferImage",
        "token": token,
        "assetId": asset_id,
        "kind": kind,
        "contentType": content_type,
        "fileData": base64.b64encode(blob).decode("ascii"),
    }
    return post_json(worker.rstrip("/"), payload, {"Content-Type": "application/json"})


def main() -> None:
    p = argparse.ArgumentParser(description="Generate an image with xAI Grok Imagine")
    p.add_argument("--prompt", required=True)
    p.add_argument("--out", default="images/grok-image.png", help="output file path")
    p.add_argument("--hub", default="", help="hub slug — prepends that hub's design spec from hubs.design.json")
    p.add_argument("--kind", default="", choices=sorted(KINDS), help="thumbnail | ig-background — sets default aspect ratio and the Notion property when --asset-id is used")
    p.add_argument("--model", default=DEFAULT_MODEL)
    p.add_argument("--n", type=int, default=1)
    p.add_argument("--resolution", default="2k", help="1k or 2k")
    p.add_argument("--aspect-ratio", default="", help="1:1, 3:4, 16:9, 9:16, 4:3, 3:2, 2:3, 2:1 … (xAI has no 4:5)")
    p.add_argument("--asset-id", default="", help="if set, attach to this Notion Asset page after saving")
    args = p.parse_args()

    save_kind, default_aspect = KINDS.get(args.kind, ("blog-thumbnail", "1:1"))
    aspect = args.aspect_ratio or default_aspect

    prompt = args.prompt
    if args.hub:
        prompt = hub_style_block(args.hub) + "\n\n" + prompt

    extra = {"aspect_ratio": aspect}
    if args.resolution:
        extra["resolution"] = args.resolution

    urls = generate(prompt, args.model, args.n, extra)
    blob = download(urls[0])
    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(blob)
    print(out_path)

    if args.asset_id:
        token = os.environ.get("HERMES_TOKEN", "").strip()
        if not token:
            die("Set HERMES_TOKEN to attach (sessionStorage.hermes_token after PIN login)")
        worker = os.environ.get("WORKER_URL", DEFAULT_WORKER).strip()
        ct = "image/jpeg" if out_path.lower().endswith((".jpg", ".jpeg")) else "image/png"
        res = attach(worker, token, args.asset_id, save_kind, blob, ct)
        print(json.dumps(res, indent=2)[:2000])


if __name__ == "__main__":
    main()
