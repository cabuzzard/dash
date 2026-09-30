"""Render a faceless long-form episode: narrated presenter character + list cards + captions.

    python render_episode.py episode.json out.mp4 [--work DIR]

episode.json (built by the worker's renderSpec, or by hand):
{
  "title": "...", "format": "ranked" | "tier" | "verdict",
  "character": "mountain-man",
  "voice": {"engine": "edge", "id": "en-US-AndrewNeural", "rate": "-6%", "pitch": "-4Hz"},
  "background": {"url": "https://..."},            # optional; else the character's default scene
  "fonts": {"display": "Fraunces", "body": "Inter"},  # Google Fonts families (campaign Fonts)
  "palette": {"accent": "#e8b234", "ink": "#f6eede", "panel": "#121a16"},   # optional
  "segments": [
    {"kind": "hook", "text": "narration"},
    {"kind": "item", "n": 1, "name": "Trail Crew Lead", "blurb": "...", "pay": "$45K-$65K / year",
     "payPct": 0.62, "score": 8.5, "tier": "A", "text": "narration"},
    {"kind": "ask", "label": "Like the video if this helps", "text": "narration"},
    {"kind": "outro", "text": "narration"}
  ]
}
Mouth movement is driven by narration loudness (jaw/beard drop + soft mouth gap), with blinks and
an idle sway; the character's own character.json says where the mouth and eyes are.
"""
import json, math, os, re, subprocess, sys, tempfile, urllib.request, io
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS, SR = 1920, 1080, 24, 24000
GAP = 0.35                                   # silence between segments (s)

def hexrgb(h, d):
    try:
        h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return d

def fetch(url, ua="Mozilla/5.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

# ── fonts: campaign Google Fonts as TTF (old UA → css2 serves truetype), with safe fallbacks ──
def google_ttf(family, weight, work):
    if not family: return None
    path = os.path.join(work, f"{re.sub(r'[^A-Za-z0-9]', '', family)}-{weight}.ttf")
    if os.path.exists(path): return path
    try:
        css = fetch(f"https://fonts.googleapis.com/css2?family={family.replace(' ', '+')}:wght@{weight}", ua="Mozilla/4.0").decode()
        m = re.search(r"url\((https://[^)]+\.ttf)\)", css)
        if not m: return None
        open(path, "wb").write(fetch(m.group(1)))
        return path
    except Exception as e:
        print("font fetch failed:", family, e); return None

FALLBACKS = ["C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
def font(path, size):
    for p in [path] + FALLBACKS:
        if p and os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except Exception: pass
    return ImageFont.load_default()

# ── narration: one TTS call per segment, stitched with gaps; sentence cues for captions ──
def tts(seg_text, voice, mp3, srt):
    cmd = [sys.executable, "-m", "edge_tts", "--voice", voice.get("id", "en-US-AndrewNeural"),
           f"--rate={voice.get('rate', '+0%')}", f"--pitch={voice.get('pitch', '+0Hz')}",
           "--text", seg_text, "--write-media", mp3, "--write-subtitles", srt]
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(mp3) and os.path.getsize(mp3) > 1000: return
    raise RuntimeError("TTS failed: " + r.stderr[-400:])

def decode(mp3):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16)

def secs(t): h, m, s = t.replace(',', '.').split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
def cues(srt):
    txt = open(srt, encoding="utf-8").read() if os.path.exists(srt) else ""
    return [(secs(a), secs(b), c.strip().replace("\n", " ")) for a, b, c in re.findall(r"(\S+) --> (\S+)\n(.+?)(?:\n\n|\Z)", txt, re.S)]

def build_audio(ep, work):
    voice = ep.get("voice") or {}
    pcm, timeline, caps, t = [], [], [], 0.0
    # Voice every segment first, 4 at a time (long segments take minutes each on edge-tts).
    from concurrent.futures import ThreadPoolExecutor
    jobs = [(i, (seg.get("text") or "").strip()) for i, seg in enumerate(ep["segments"])]
    def one(job):
        i, text = job
        if text: tts(text, voice, os.path.join(work, f"s{i}.mp3"), os.path.join(work, f"s{i}.srt"))
        return i
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i in ex.map(one, jobs): print(f"voiced {i + 1}/{len(jobs)}", flush=True)
    for i, seg in enumerate(ep["segments"]):
        text = (seg.get("text") or "").strip()
        if not text: continue
        mp3, srt = os.path.join(work, f"s{i}.mp3"), os.path.join(work, f"s{i}.srt")
        a = decode(mp3); dur = len(a) / SR
        timeline.append((t, t + dur, seg))
        caps += [(t + s, t + e, c) for s, e, c in cues(srt)]
        pcm += [a, np.zeros(int(GAP * SR), np.int16)]
        t += dur + GAP
        print(f"tts {i + 1}/{len(ep['segments'])} {dur:.1f}s", flush=True)
    audio = np.concatenate(pcm) if pcm else np.zeros(SR, np.int16)
    wav = os.path.join(work, "voice.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", wav], input=audio.tobytes(), check=True)
    return audio, timeline, caps, wav

# ── character with jaw/mouth/blink variants ──
class Presenter:
    def __init__(self, cdir):
        self.c = json.load(open(os.path.join(cdir, "character.json"), encoding="utf-8"))
        self.base = Image.open(os.path.join(cdir, self.c["cutout"])).convert("RGBA")
        self.BA = np.array(self.base)
        m = self.c["mouth"]; self.MX, self.MY = m["x"], m["y"]
        self.yy, self.xx = np.mgrid[0:self.BA.shape[0], 0:self.BA.shape[1]]
        hx = np.clip(np.cos(np.clip((self.xx - self.MX) / float(m.get("halfWidth", 72)), -1, 1) * math.pi / 2), 0, 1) ** 0.8
        jb = m.get("jawBottom", self.MY + 60)
        vy = np.where(self.yy < self.MY, 0, np.where(self.yy < jb, 1, np.clip(1 - (self.yy - jb) / 30.0, 0, 1)))
        self.Wt = hx * vy
        self.cache = {}

    def variant(self, d, blink):
        k = (d, blink)
        if k in self.cache: return self.cache[k]
        arr = self.BA
        if d:
            sy = np.clip(np.round(self.yy - d * self.Wt).astype(int), 0, self.BA.shape[0] - 1)
            arr = self.BA[sy, self.xx]
        im = Image.fromarray(arr.astype(np.uint8), "RGBA")
        MX, MY = self.MX, self.MY
        if d >= 2:
            lay = Image.new("RGBA", im.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(lay)
            w = 11 + d * 2.1; h = d * 1.05
            ld.ellipse([MX - w, MY - 2, MX + w, MY - 2 + h], fill=(58, 20, 16, 235))
            ld.ellipse([MX - w * .7, MY - 2 + h * .45, MX + w * .7, MY - 2 + h], fill=(92, 34, 30, 200))
            if d >= 6: ld.ellipse([MX - w * .5, MY - 3, MX + w * .5, MY + 1], fill=(205, 192, 176, 110))
            im.alpha_composite(lay.filter(ImageFilter.GaussianBlur(1.3)))
        if blink:
            for ex, ey in self.c["eyes"]:
                patch = [self.base.getpixel((x, y))[:3] for x in range(ex - 12, ex + 13, 3) for y in range(ey + 10, ey + 16)]
                patch = [c for c in patch if sum(c) > 330] or patch
                skin = tuple(int(np.median([c[j] for c in patch])) for j in range(3))
                bot = ey + (3 if blink == 2 else -1); top = ey - 9
                lid = Image.new("RGBA", im.size, (0, 0, 0, 0)); lg = ImageDraw.Draw(lid)
                for y in range(top, bot + 1):
                    f = (y - top) / max(1, bot - top)
                    col = tuple(int(skin[j] * (0.80 + 0.20 * f)) for j in range(3))
                    half = 17 * math.sqrt(max(0.0, 1 - ((y - (top + bot) / 2) / ((bot - top) / 2 + 3)) ** 2))
                    lg.line([(ex - half, y), (ex + half, y)], fill=col + (255,))
                im.alpha_composite(lid.filter(ImageFilter.GaussianBlur(1.8)))
                ImageDraw.Draw(im).arc([ex - 16, bot - 7, ex + 16, bot + 3], 25, 155, fill=(58, 34, 24, 230), width=3)
        self.cache[k] = im
        return im

def ease(t): t = max(0.0, min(1.0, t)); return 1 - (1 - t) ** 3

def wrap(draw, text, fnt, width):
    words, lines, cur = str(text).split(), [], ""
    for w_ in words:
        t = (cur + " " + w_).strip()
        if draw.textlength(t, font=fnt) <= width: cur = t
        else:
            if cur: lines.append(cur)
            cur = w_
    if cur: lines.append(cur)
    return lines

def main(ep_path, out, work):
    ep = json.load(open(ep_path, encoding="utf-8"))
    os.makedirs(work, exist_ok=True)
    cdir = os.path.join(HERE, "characters", ep.get("character", "mountain-man"))
    P = Presenter(cdir)
    pal = ep.get("palette") or {}
    ACC, INK, PANEL = hexrgb(pal.get("accent", ""), (232, 178, 52)), hexrgb(pal.get("ink", ""), (246, 238, 222)), hexrgb(pal.get("panel", ""), (18, 26, 22))
    SUB = tuple(int(c * .8) for c in INK)
    fonts = ep.get("fonts") or {}
    dpath = google_ttf(fonts.get("display"), 700, work); bpath = google_ttf(fonts.get("body"), 600, work)
    F_BIG, F_TTL, F_TXT, F_SM, F_CAP = font(dpath, 118), font(dpath, 56), font(bpath, 32), font(bpath, 29), font(bpath, 40)

    audio, timeline, caps, wav = build_audio(ep, work)
    a = audio.astype(np.float32) / 32768
    spf = SR // FPS; N = int(len(a) / spf) + FPS
    rms = np.array([np.sqrt(np.mean(a[i * spf:(i + 1) * spf] ** 2)) if i * spf < len(a) else 0 for i in range(N)])
    ref = np.percentile(rms[rms > 0.01], 90) if (rms > 0.01).any() else 1
    op = np.clip((rms - 0.012) / (ref - 0.012), 0, 1)
    env, jaw = 0.0, []
    maxo = P.c["mouth"].get("maxOpen", 7)
    for v in op:
        env += (v - env) * (0.75 if v > env else 0.35); jaw.append(round(maxo * env))
    rng = np.random.default_rng(7); blink_at, f = {}, int(1.5 * FPS)
    while f < N:
        blink_at.update({f: 1, f + 1: 2, f + 2: 2, f + 3: 1}); f += int(rng.uniform(2.8, 5.5) * FPS)

    # background: the given plate or the character's default scene — softened, gentle drift
    bg = ep.get("background") or {}
    if bg.get("url"):
        sc = Image.open(io.BytesIO(fetch(bg["url"]))).convert("RGB")
    else:
        ds = P.c["defaultScene"]; sc = Image.open(os.path.join(cdir, ds["file"])).convert("RGB")
        if ds.get("crop"): sc = sc.crop(tuple(ds["crop"]))
    sw = int(W * 1.12); sc = sc.resize((sw, max(int(H * 1.12), int(sw * sc.height / sc.width))), Image.LANCZOS).filter(ImageFilter.GaussianBlur(4))
    sc = Image.blend(sc, Image.new("RGB", sc.size, (10, 18, 14)), 0.28)

    pl = P.c["place"]; chx = W - pl["figureRightEdge"] - pl["right"]
    fmt = ep.get("format", "ranked")

    def item_card(seg, k, t0, t1, t):
        card = Image.new("RGBA", (760, 600), (0, 0, 0, 0)); cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, 759, 599], 28, fill=PANEL + (228,), outline=ACC, width=3)
        y = 26
        if seg.get("n") is not None: cd.text((40, y), f"#{seg['n']}", font=F_BIG, fill=ACC); y += 140
        for ln in wrap(cd, seg.get("name", ""), F_TTL, 680)[:2]: cd.text((40, y), ln, font=F_TTL, fill=INK); y += 66
        y += 8
        for ln in wrap(cd, seg.get("blurb", ""), F_SM, 680)[:3]: cd.text((42, y), ln, font=F_SM, fill=SUB); y += 38
        p = (t - t0) / max(0.1, (t1 - t0))
        if seg.get("pay"):
            kp = ease((p - 0.28) / 0.12)
            if kp > 0:
                y += 14; cd.text((42, y), "PAY", font=F_TXT, fill=SUB)
                cd.rounded_rectangle([150, y + 6, 718, y + 38], 16, fill=(50, 60, 55))
                cd.rounded_rectangle([150, y + 6, 150 + int(568 * float(seg.get("payPct", 0.6)) * kp), y + 38], 16, fill=ACC)
                cd.text((150, y + 44), seg["pay"], font=F_TXT, fill=INK); y += 90
        ks = ease((p - 0.72) / 0.1)
        if ks > 0 and (seg.get("score") is not None or seg.get("tier")):
            y += 10
            if fmt == "tier" or (seg.get("tier") and seg.get("score") is None):
                cd.text((42, y), "TIER", font=F_TXT, fill=SUB)
                cd.rounded_rectangle([150, y - 6, 150 + 110, y + 60], 14, fill=ACC)
                cd.text((205, y + 27), str(seg.get("tier", "?")), font=F_TTL, fill=PANEL, anchor="mm")
            else:
                sc_ = float(seg["score"])
                cd.text((42, y), "SCORE", font=F_TXT, fill=SUB)
                for n_ in range(10):
                    full = n_ + 1 <= sc_ * ks
                    cd.rounded_rectangle([190 + n_ * 44, y + 2, 224 + n_ * 44, y + 34], 6, fill=ACC if full else (50, 60, 55))
                if ks >= 1: cd.text((718, y), f"{sc_:g}", font=F_TXT, fill=INK, anchor="ra")
        return card

    def frame(i):
        t = i / FPS
        dx = int(40 * math.sin(t / 23)); dy = int(18 * math.sin(t / 31))
        ox, oy = (sc.width - W) // 2 + dx, max(0, (sc.height - H) // 2 + dy)
        fr = sc.crop((ox, oy, ox + W, oy + H)).convert("RGBA")
        ch = P.variant(jaw[i] if i < len(jaw) else 0, blink_at.get(i, 0))
        fr.alpha_composite(ch, (chx, H - ch.height + pl.get("bottomOverhang", 30) + int(round(3 * math.sin(t * 2 * math.pi * 0.23)))))
        d = ImageDraw.Draw(fr)
        for t0, t1, seg in timeline:
            if not (t0 - 0.1 <= t <= t1 + 0.5): continue
            kind = seg.get("kind")
            k_in, k_out = ease((t - t0) / 0.45), ease((t - t1) / 0.4)
            x = int(-800 + (80 + 800) * k_in - 900 * k_out)
            if kind in ("item", "point"):
                fr.alpha_composite(item_card(seg, k_in, t0, t1, t), (x, 120))
            elif kind == "hook" and ep.get("title"):
                ttl = Image.new("RGBA", (900, 420), (0, 0, 0, 0)); td = ImageDraw.Draw(ttl)
                yy = 0
                for ln in wrap(td, ep["title"], F_TTL, 860)[:4]: td.text((0, yy), ln, font=F_TTL, fill=INK, stroke_width=3, stroke_fill=PANEL); yy += 70
                fr.alpha_composite(ttl, (x, 170))
            elif kind == "ask" and seg.get("label"):
                tw = d.textlength(seg["label"], font=F_TXT)
                d.rounded_rectangle([x, 150, x + tw + 60, 222], 36, fill=ACC)
                d.text((x + 30, 186), seg["label"], font=F_TXT, fill=PANEL, anchor="lm")
        cur = next((c for s_, e_, c in caps if s_ - 0.05 <= t <= e_ + 0.2), "")
        if cur:
            lines = wrap(d, cur, F_CAP, chx - 140)[:2]
            for li, ln in enumerate(lines):
                tw = d.textlength(ln, font=F_CAP); x = 80; y = 930 - (len(lines) - 1 - li) * 62
                d.rounded_rectangle([x - 20, y - 8, x + tw + 20, y + 54], 12, fill=(10, 14, 12, 190))
                d.text((x, y), ln, font=F_CAP, fill=INK)
        return fr.convert("RGB")

    n = int((len(a) / SR + 0.6) * FPS)
    print(f"rendering {n} frames ({n / FPS / 60:.1f} min)", flush=True)
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-i", wav, "-af", "apad", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-tune", "animation", "-pix_fmt", "yuv420p",
                          "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    for i in range(n):
        try:
            p.stdin.write(frame(i).tobytes())
        except BrokenPipeError:
            print(f"encoder closed at frame {i}/{n}", flush=True); break
        if i % (FPS * 30) == 0: print(f"  {i / FPS / 60:.1f}/{n / FPS / 60:.1f} min", flush=True)
    try: p.stdin.close()
    except BrokenPipeError: pass
    p.wait()
    if p.returncode: raise SystemExit("ffmpeg failed")
    print("done", out, os.path.getsize(out) // 1024, "KB")

if __name__ == "__main__":
    args = sys.argv[1:]
    work = tempfile.mkdtemp()
    if "--work" in args: i = args.index("--work"); work = args[i + 1]; del args[i:i + 2]
    main(args[0], args[1], work)
