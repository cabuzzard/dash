"""Render a faceless long-form episode: narrated presenter character + list cards + captions.

    python render_episode.py episode.json out.mp4 [--work DIR]

episode.json (built by the worker's renderSpec, or by hand):
{
  "title": "...", "format": "ranked" | "tier" | "verdict",
  "character": "mountain-man",
  "voice": {"engine": "edge", "id": "en-US-AndrewNeural", "rate": "-6%", "pitch": "-4Hz"},
           # or {"engine": "elevenlabs", "id": "<voice_id>", "rate": "-4%"} (needs ELEVENLABS_API_KEY)
  "voice2": {"engine": "edge", "id": "en-US-BrianNeural"},   # optional: interviewer voice for item "ask" lines
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
    if voice.get("engine") == "elevenlabs": return tts_eleven(seg_text, voice, mp3, srt)
    cmd = [sys.executable, "-m", "edge_tts", "--voice", voice.get("id", "en-US-AndrewNeural"),
           f"--rate={voice.get('rate', '+0%')}", f"--pitch={voice.get('pitch', '+0Hz')}",
           "--text", seg_text, "--write-media", mp3, "--write-subtitles", srt]
    for attempt in range(3):
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(mp3) and os.path.getsize(mp3) > 1000: return
    raise RuntimeError("TTS failed: " + r.stderr[-400:])

# ElevenLabs: character-timestamped TTS → mp3 + sentence-level SRT (same cue shape edge-tts writes).
def srt_time(s): ms = int(round(s * 1000)); return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
def tts_eleven(seg_text, voice, mp3, srt):
    import base64, time
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key: raise RuntimeError("ELEVENLABS_API_KEY is not set")
    rate = re.match(r"([+-]?\d+)%", str(voice.get("rate", "+0%")))
    speed = max(0.7, min(1.2, 1 + (int(rate.group(1)) / 100 if rate else 0)))
    body = json.dumps({"text": seg_text, "model_id": voice.get("model", "eleven_multilingual_v2"),
                       "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "speed": speed}}).encode()
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice['id']}/with-timestamps?output_format=mp3_44100_128"
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body, headers={"xi-api-key": key, "content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r: j = json.load(r)
            break
        except urllib.error.HTTPError as e:
            msg = e.read()[:300].decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503) and attempt < 4: time.sleep(5 * (attempt + 1)); continue
            raise RuntimeError(f"ElevenLabs TTS {e.code}: {msg}")
    open(mp3, "wb").write(base64.b64decode(j["audio_base64"]))
    al = j.get("normalized_alignment") or j.get("alignment") or {}
    chars, st, en = al.get("characters", []), al.get("character_start_times_seconds", []), al.get("character_end_times_seconds", [])
    cues_, buf, t0, words = [], "", None, 0
    for c, a, b in zip(chars, st, en):
        if t0 is None and not c.isspace(): t0 = a
        buf += c
        if c == " ": words += 1
        if t0 is not None and (c in ".!?" or (c == " " and words >= 14 and buf.rstrip()[-1:] in ",;:")):
            cues_.append((t0, b, buf.strip())); buf, t0, words = "", None, 0
    if buf.strip() and t0 is not None: cues_.append((t0, en[-1] if en else t0 + 1, buf.strip()))
    open(srt, "w", encoding="utf-8").write("".join(f"{k + 1}\n{srt_time(a)} --> {srt_time(b)}\n{c}\n\n" for k, (a, b, c) in enumerate(cues_)))

def decode(mp3):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3, "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.int16)

def secs(t): h, m, s = t.replace(',', '.').split(':'); return int(h) * 3600 + int(m) * 60 + float(s)
def cues(srt):
    txt = open(srt, encoding="utf-8").read() if os.path.exists(srt) else ""
    return [(secs(a), secs(b), c.strip().replace("\n", " ")) for a, b, c in re.findall(r"(\S+) --> (\S+)\n(.+?)(?:\n\n|\Z)", txt, re.S)]

ASK_GAP = 0.3                                # pause between the interviewer's question and the answer (s)
def tempo_pcm(a, cs, tempo):
    """Pitch-preserving speed change (ffmpeg atempo) for exact, non-integer steps; cue times follow."""
    if not tempo or abs(tempo - 1) < 0.001: return a, cs
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", "-filter:a", f"atempo={tempo:.4f}",
                          "-f", "s16le", "-ar", str(SR), "-ac", "1", "-"], input=a.tobytes(), capture_output=True).stdout
    return np.frombuffer(raw, np.int16), [(s / tempo, e / tempo, c) for s, e, c in cs]
def trim_silence(a, floor=0.04):
    """Cut leading/trailing near-silence (edge-tts pads every clip)."""
    if not len(a): return a
    env_ = np.abs(a.astype(np.int32)); thr = max(200, int(floor * env_.max()))
    idx = np.where(env_ > thr)[0]
    return a[max(0, idx[0] - int(0.02 * SR)):min(len(a), idx[-1] + int(0.05 * SR))] if len(idx) else a[:0]
def make_jingle(text, work, key="jingle"):
    """Channel sting: the phrase in an announcer voice, its LAST word stretched ~2.2× (pitch kept) so it
    rings out ("THE MOUNTAIN MAAAN!"), then a big multi-tap echo and a tail. Returns int16 PCM."""
    words = str(text or "").strip().split()
    if not words: return np.zeros(0, np.int16)
    head, last = " ".join(words[:-1]), words[-1]
    v = {"engine": "edge", "id": "en-US-GuyNeural", "rate": "-12%", "pitch": "-6Hz"}
    parts = []
    if head:
        tts(head, v, os.path.join(work, f"{key}_a.mp3"), os.path.join(work, f"{key}_a.srt")); parts += [trim_silence(decode(os.path.join(work, f"{key}_a.mp3"))), np.zeros(int(0.06 * SR), np.int16)]
    tts(last, v, os.path.join(work, f"{key}_b.mp3"), os.path.join(work, f"{key}_b.srt"))
    b, _ = tempo_pcm(trim_silence(decode(os.path.join(work, f"{key}_b.mp3"))), [], 0.5)           # stretch the last word 2x ("maaan"); atempo minimum is 0.5
    parts.append(b)
    dry = np.concatenate(parts + [np.zeros(int(1.3 * SR), np.int16)])               # room for the echo tail
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                          "-filter:a", "aecho=0.8:0.88:140|300|520|780:0.55|0.42|0.3|0.2,volume=1.3,alimiter=limit=0.95",
                          "-f", "s16le", "-ar", str(SR), "-ac", "1", "-"], input=dry.tobytes(), capture_output=True).stdout
    return np.frombuffer(raw, np.int16)
def para_marks(text, cs):
    """Times (s) where each paragraph of `text` ends, found by counting words through the caption cues."""
    paras = [p_ for p_ in re.split(r"\n\s*\n", text.strip()) if p_.strip()]
    if len(paras) < 2 or not cs: return []
    ends, acc = [], 0
    for p_ in paras[:-1]: acc += len(p_.split()); ends.append(acc)
    marks, run, k = [], 0, 0
    for s_, e_, c in cs:
        run += len(c.split())
        while k < len(ends) and run >= ends[k]: marks.append(e_); k += 1
    return marks
def stretch_pauses(a, cs, scale, min_sil=0.12, marks=None, mark_scale=1.0, stats=None):
    """Lengthen the real silences inside the speech by `scale` and shift the caption cues to match.
    Silences are found in the audio itself (10 ms frames below a loudness floor, at least `min_sil` long,
    not at the very start/end) — caption cues butt up against each other, so their gaps can't be used."""
    if (scale <= 1.001 and not marks) or len(a) < SR // 2: return a, cs
    fr = int(0.01 * SR); n = len(a) // fr
    rms = np.sqrt(np.mean(a[:n * fr].astype(np.float32).reshape(n, fr) ** 2, axis=1))
    thr = max(150.0, 0.06 * float(np.percentile(rms, 95)))
    quiet = rms < thr
    runs, k = [], 0
    while k < n:
        if quiet[k]:
            j = k
            while j < n and quiet[j]: j += 1
            if j - k >= int(min_sil * 100) and k > 0 and j < n: runs.append((k * fr, j * fr))
            k = j
        else: k += 1
    if not runs: return a, cs
    # each paragraph end claims the silence nearest to it (within 0.8 s) — that one gets the longer pause
    para = set()
    for m in (marks or []):
        best = min(range(len(runs)), key=lambda r: abs((runs[r][0] + runs[r][1]) / 2 / SR - m))
        if abs((runs[best][0] + runs[best][1]) / 2 / SR - m) < 0.8: para.add(best)
    out, last, ins = [], 0, []
    for r_, (s0, s1) in enumerate(runs):
        f_ = scale * (mark_scale if r_ in para else 1.0)
        mid = (s0 + s1) // 2; extra = int((s1 - s0) * (f_ - 1))
        if stats is not None and r_ not in para and (s1 - s0) >= 0.25 * SR: stats.append((s1 - s0) * f_ / SR)
        out += [a[last:mid], np.zeros(extra, np.int16)]; ins.append((mid / SR, extra / SR)); last = mid
    out.append(a[last:])
    shift = lambda t: t + sum(e for at, e in ins if at <= t)
    return np.concatenate(out), [(shift(s0), shift(e0), c) for s0, e0, c in cs]
def build_audio(ep, work):
    voice = ep.get("voice") or {}
    voice2 = ep.get("voice2")                # interview format: a second voice asks seg["ask"]
    pcm, timeline, caps, t, mute = [], [], [], 0.0, []
    # Voice every segment first, 4 at a time (long segments take minutes each on edge-tts).
    from concurrent.futures import ThreadPoolExecutor
    jobs = [(f"s{i}", (seg.get("text") or "").strip(), voice) for i, seg in enumerate(ep["segments"]) if seg.get("kind") != "jingle"]
    if voice2: jobs += [(f"q{i}", (seg.get("ask") or "").strip(), voice2) for i, seg in enumerate(ep["segments"]) if (seg.get("ask") or "").strip()]
    def one(job):
        key, text, v = job
        if text: tts(text, v, os.path.join(work, f"{key}.mp3"), os.path.join(work, f"{key}.srt"))
        return key
    with ThreadPoolExecutor(max_workers=3 if voice.get("engine") == "elevenlabs" else 4) as ex:
        for k, key in enumerate(ex.map(one, jobs)): print(f"voiced {k + 1}/{len(jobs)}", flush=True)
    # pass 1: every narration segment's audio, with sentence pauses and the longer paragraph pauses
    tempo, para_scale = float(voice.get("tempo") or 1), float(voice.get("paraScale") or 1)
    seg_audio, sent_pauses = {}, []
    for i, seg in enumerate(ep["segments"]):
        text = (seg.get("text") or "").strip()
        if not text: continue
        if seg.get("kind") == "jingle": seg_audio[i] = (make_jingle(text, work, f"jingle{i}"), []); continue
        mp3, srt = os.path.join(work, f"s{i}.mp3"), os.path.join(work, f"s{i}.srt")
        cs0 = cues(srt)
        a, cs = stretch_pauses(decode(mp3), cs0, float(voice.get("pauseScale") or 1),
                               marks=para_marks(text, cs0), mark_scale=para_scale, stats=sent_pauses)
        seg_audio[i] = tempo_pcm(a, cs, tempo)   # applied after: it scales pauses by 1/tempo too
    # between sections: a paragraph-length pause (typical sentence pause × paraScale), never shorter than GAP
    seg_gap = GAP
    if para_scale > 1.001 and sent_pauses:
        seg_gap = max(GAP, float(np.median(sent_pauses)) / tempo * para_scale)
    print(f"pauses: sentence ~{(float(np.median(sent_pauses)) / tempo if sent_pauses else 0):.2f}s, paragraph/section ~{seg_gap:.2f}s", flush=True)
    for i, seg in enumerate(ep["segments"]):
        text = (seg.get("text") or "").strip()
        if not text: continue
        t_start = t
        qmp3 = os.path.join(work, f"q{i}.mp3")
        if voice2 and os.path.exists(qmp3):
            q = decode(qmp3); dq = len(q) / SR
            caps += [(t + s, t + e, "Q: " + c) for s, e, c in cues(os.path.join(work, f"q{i}.srt"))]
            mute.append((t, t + dq))
            pcm += [q, np.zeros(int(ASK_GAP * SR), np.int16)]
            t += dq + ASK_GAP
        a, cs = seg_audio[i]
        dur = len(a) / SR
        if seg.get("kind") == "jingle": mute.append((t, t + dur))
        timeline.append((t_start, t + dur, seg))
        caps += [(t + s, t + e, c) for s, e, c in cs]
        pcm += [a, np.zeros(int(seg_gap * SR), np.int16)]
        t += dur + seg_gap
        print(f"tts {i + 1}/{len(ep['segments'])} {t - t_start:.1f}s", flush=True)
    audio = np.concatenate(pcm) if pcm else np.zeros(SR, np.int16)
    wav = os.path.join(work, "voice.wav")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-", wav], input=audio.tobytes(), check=True)
    return audio, timeline, caps, wav, mute

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
        if getattr(self, "scale", 1) != 1:
            im = im.resize((max(1, int(im.width * self.scale)), max(1, int(im.height * self.scale))), Image.LANCZOS)
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
    F_TTL2 = font(dpath, 44)
    F_NUM = font(dpath, 72)

    audio, timeline, caps, wav, mute = build_audio(ep, work)
    a = audio.astype(np.float32) / 32768
    spf = SR // FPS; N = int(len(a) / spf) + FPS
    rms = np.array([np.sqrt(np.mean(a[i * spf:(i + 1) * spf] ** 2)) if i * spf < len(a) else 0 for i in range(N)])
    for s_, e_ in mute: rms[int(s_ * FPS):int(e_ * FPS) + 1] = 0      # presenter's mouth stays shut while the interviewer talks
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
    cap_w = chx + pl.get("figureLeftEdge", 330) - 80 - 40   # captions run up to the presenter
    STAGE_LAYOUT = ep.get("layout") == "stage"                  # "Text & Images": no presenter, big centred frame
    CAP_Y = 840                                                  # baseline row of the last caption line (was 930 — too low)
    BX = (W - 760) // 2 if STAGE_LAYOUT else 80                  # where cards / titles / pills rest
    if STAGE_LAYOUT: cap_w = 1560
    BOXES = ep.get("boxes") or {}
    def hexa(h, a, d):
        rgb = hexrgb(h or "", d); return rgb + (int(max(0, min(100, float(a))) * 2.55),)
    cb, capb, pb = BOXES.get("card") or {}, BOXES.get("caption") or {}, BOXES.get("presenter") or {}
    CS = max(0.4, min(2.5, float(cb.get("s", 100)) / 100))                      # card scale (text size)
    CX = int(float(cb["x"]) * W / 100) if "x" in cb else BX
    CY = int(float(cb["y"]) * H / 100) if "y" in cb else 120
    NW = max(420, int((float(cb["w"]) * W / 100 if "w" in cb else 760 * CS) / CS))   # card width before scaling
    CARD_FILL = hexa(cb.get("color"), cb.get("opacity", 89), PANEL) if cb.get("color") else PANEL + (228,)
    CARD_MAX = int(cb.get("maxChars") or 0)
    CAPS = max(0.4, min(2.5, float(capb.get("s", 100)) / 100))
    F_CAP = font(bpath, max(12, round(40 * CAPS))); CLH = round(62 * CAPS)
    if "w" in capb: cap_w = int(float(capb["w"]) * W / 100)
    CAPX = int(float(capb["x"]) * W / 100) if "x" in capb else None
    # captions hang from the TOP of their box (operator 2026-10-01): line 1 at the top, line 2 below it
    CAP_TOP = int(float(capb["y"]) * H / 100) + 8 if "y" in capb else CAP_Y - 62 * 1
    CAP_FILL = hexa(capb.get("color"), capb.get("opacity", 75), (10, 14, 12)) if capb.get("color") else (10, 14, 12, 190)
    if pb and "h" in pb:
        P.scale = max(0.2, float(pb["h"]) * H / 100 / P.base.height)
        chx = int(float(pb.get("x", chx * 100 / W)) * W / 100)
    PY = int(float(pb["y"]) * H / 100) if pb and "y" in pb else None

    # ── scene images: shown in a framed stage on the left when their cue words are spoken ──
    STAGE = (240, 50, 1680, 860) if STAGE_LAYOUT else (80, 120, 840, 700)   # x0, y0, x1, y1
    sw_, sh_ = STAGE[2] - STAGE[0], STAGE[3] - STAGE[1]
    norm = lambda x: re.sub(r"[^a-z0-9 ]+", "", str(x).lower()).split()
    shots = []   # (start, end, PIL image sized 1.12x the stage)
    for t0, t1, seg in timeline:
        imgs = [im for im in (seg.get("images") or []) if im.get("url")]
        if not imgs: continue
        seg_caps = [(s_, c) for s_, e_, c in caps if t0 - 0.05 <= s_ <= t1]
        starts = []
        for k, im in enumerate(imgs):
            cue = norm(im.get("cue", ""))[:4]
            at = next((s_ for s_, c in seg_caps if cue and " ".join(cue) in " ".join(norm(c))), None)
            if at is None: at = t0 + (t1 - t0) * (0.25 + 0.45 * k / max(1, len(imgs)))
            starts.append((at, im))
        starts.sort(key=lambda x: x[0])
        stop = t1 - 0.25 * (t1 - t0) if seg.get("kind") in ("item", "point") else t1 - 0.2
        for k, (at, im) in enumerate(starts):
            end = min(starts[k + 1][0] if k + 1 < len(starts) else stop, stop)
            if end - at < 2.5: continue
            try:
                pic = Image.open(io.BytesIO(fetch(im["url"]))).convert("RGB")
                tw_, th_ = int(sw_ * 1.12), int(sh_ * 1.12)
                r_ = max(tw_ / pic.width, th_ / pic.height)
                pic = pic.resize((int(pic.width * r_) + 1, int(pic.height * r_) + 1), Image.LANCZOS)
                l_, t_ = (pic.width - tw_) // 2, (pic.height - th_) // 2
                shots.append((at, end, pic.crop((l_, t_, l_ + tw_, t_ + th_))))
            except Exception as e:
                print("image skipped:", str(e)[:120], flush=True)
    print(f"scene images: {len(shots)}", flush=True)
    stage_mask = Image.new("L", (sw_, sh_), 0); ImageDraw.Draw(stage_mask).rounded_rectangle([0, 0, sw_ - 1, sh_ - 1], 26, fill=255)
    def shot_at(t):
        for s_, e_, pic in shots:
            if s_ <= t <= e_ + 0.35: return s_, e_, pic
        return None

    def card_panel(layer, h):
        out = Image.new("RGBA", (NW, h), (0, 0, 0, 0))
        ImageDraw.Draw(out).rounded_rectangle([0, 0, NW - 1, h - 1], 24, fill=CARD_FILL, outline=ACC, width=3)
        out.alpha_composite(layer.crop((0, 0, NW, h)))
        if CS != 1: out = out.resize((max(1, int(NW * CS)), max(1, int(h * CS))), Image.LANCZOS)
        return out
    def clip_txt(t):
        t = str(t or ""); return (t[:CARD_MAX - 1].rstrip() + "…") if CARD_MAX and len(t) > CARD_MAX else t

    def title_card(text):
        lay = Image.new("RGBA", (NW, 600), (0, 0, 0, 0)); td = ImageDraw.Draw(lay)
        y = 22
        lines = wrap(td, text, F_TTL, NW - 80); f_, lh = F_TTL, 64
        if len(lines) > 3: lines = wrap(td, text, F_TTL2, NW - 80); f_, lh = F_TTL2, 52
        for ln in lines[:4]:
            lx = (NW - int(td.textlength(ln, font=f_))) // 2 if STAGE_LAYOUT else 40
            td.text((lx, y), ln, font=f_, fill=INK); y += lh
        return card_panel(lay, y + 20)

    def item_card(seg, k, t0, t1, t):
        card = Image.new("RGBA", (NW, 600), (0, 0, 0, 0)); cd = ImageDraw.Draw(card)
        y = 20
        if seg.get("n") is not None: cd.text((40, y), f"#{seg['n']}", font=F_NUM, fill=ACC); y += 84
        nm = wrap(cd, clip_txt(seg.get("name", "")), F_TTL, NW - 80); fnm, lh = F_TTL, 66
        if len(nm) > 2: nm = wrap(cd, clip_txt(seg.get("name", "")), F_TTL2, NW - 80); fnm, lh = F_TTL2, 52
        for ln in nm[:3]: cd.text((40, y), ln, font=fnm, fill=INK); y += lh
        y += 8
        for ln in wrap(cd, seg.get("blurb", ""), F_SM, NW - 80)[:3]: cd.text((42, y), ln, font=F_SM, fill=SUB); y += 38
        # final height is fixed up front (room for the pay bar / score that animate in) so the card never grows mid-shot
        full_h = y + (104 if seg.get("pay") else 0) + (76 if (seg.get("score") is not None or seg.get("tier")) else 0) + 18
        p = (t - t0) / max(0.1, (t1 - t0))
        if seg.get("pay"):
            kp = ease((p - 0.28) / 0.12)
            if kp > 0:
                y += 14; cd.text((42, y), "PAY", font=F_TXT, fill=SUB)
                cd.rounded_rectangle([150, y + 6, NW - 42, y + 38], 16, fill=(50, 60, 55))
                cd.rounded_rectangle([150, y + 6, 150 + int((NW - 192) * float(seg.get("payPct", 0.6)) * kp), y + 38], 16, fill=ACC)
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
                if ks >= 1: cd.text((NW - 42, y), f"{sc_:g}", font=F_TXT, fill=INK, anchor="ra")
        return card_panel(card, min(600, full_h))

    def frame(i):
        t = i / FPS
        dx = int(40 * math.sin(t / 23)); dy = int(18 * math.sin(t / 31))
        ox, oy = (sc.width - W) // 2 + dx, max(0, (sc.height - H) // 2 + dy)
        fr = sc.crop((ox, oy, ox + W, oy + H)).convert("RGBA")
        if not STAGE_LAYOUT:
            ch = P.variant(jaw[i] if i < len(jaw) else 0, blink_at.get(i, 0))
            bob = int(round(3 * math.sin(t * 2 * math.pi * 0.23)))
            fr.alpha_composite(ch, (chx, (PY if PY is not None else H - ch.height + pl.get("bottomOverhang", 30)) + bob))
        d = ImageDraw.Draw(fr)
        for t0, t1, seg in timeline:
            if not (t0 - 0.1 <= t <= t1 + 0.5): continue
            kind = seg.get("kind")
            k_in, k_out = ease((t - t0) / 0.45), ease((t - t1) / 0.4)
            x = int(-NW * CS - 40 + (CX + NW * CS + 40) * k_in - (W + 100) * k_out)
            if kind in ("item", "point"):
                if shot_at(t) is None:
                    fr.alpha_composite(item_card(seg, k_in, t0, t1, t), (x, CY))
            elif kind == "intro" and ep.get("channel"):
                fr.alpha_composite(title_card(ep["channel"]), (x, CY))
            elif kind == "topic" and ep.get("title"):
                fr.alpha_composite(title_card(ep["title"]), (x, CY))
            elif kind == "jingle" and seg.get("text"):   # same card formatting as everything else (📐 Layout card box)
                fr.alpha_composite(title_card(seg["text"]), (x, CY))
            elif kind == "hook" and ep.get("title"):
                fr.alpha_composite(title_card(ep["title"]), (x, CY))
            elif kind == "ask" and seg.get("label"):
                tw = d.textlength(seg["label"], font=F_TXT)
                d.rounded_rectangle([x, CY + 30, x + tw + 60, CY + 102], 36, fill=ACC)
                d.text((x + 30, CY + 66), seg["label"], font=F_TXT, fill=PANEL, anchor="lm")
        sh = shot_at(t)
        if sh:
            s_, e_, pic = sh
            a_in, a_out = ease((t - s_) / 0.35), 1 - ease((t - e_) / 0.35) if t > e_ else 1
            zoom = 1.0 + 0.10 * min(1, (t - s_) / max(2.5, e_ - s_))      # slow push-in across the hold
            vw, vh = int(sw_ * 1.12 / zoom), int(sh_ * 1.12 / zoom)
            l_, t_ = (pic.width - vw) // 2, (pic.height - vh) // 2
            view = pic.crop((l_, t_, l_ + vw, t_ + vh)).resize((sw_, sh_), Image.BILINEAR).convert("RGBA")
            view.putalpha(stage_mask.point(lambda v: int(v * a_in * a_out)))
            frame_bg = Image.new("RGBA", (sw_ + 12, sh_ + 12), (0, 0, 0, 0))
            ImageDraw.Draw(frame_bg).rounded_rectangle([0, 0, sw_ + 11, sh_ + 11], 30, fill=ACC + (int(255 * a_in * a_out),))
            fr.alpha_composite(frame_bg, (STAGE[0] - 6, STAGE[1] - 6))
            fr.alpha_composite(view, (STAGE[0], STAGE[1]))
        cue = next(((s_, e_, c) for s_, e_, c in caps if s_ - 0.05 <= t <= e_ + 0.2), None)
        cur = cue[2] if cue else ""
        if cur:
            lines = wrap(d, cur, F_CAP, cap_w)
            if len(lines) > 2:   # balance the pages so the last one isn't a lone word
                pages = (len(lines) + 1) // 2
                bal = wrap(d, cur, F_CAP, max(200, int(d.textlength(cur, font=F_CAP) / (pages * 2) * 1.12)))
                if len(bal) <= pages * 2: lines = bal
            if len(lines) > 2:   # long cue: show it two lines at a time, in step with the speech
                chunks = [lines[k:k + 2] for k in range(0, len(lines), 2)]
                frac = (t - cue[0]) / max(0.1, cue[1] - cue[0])
                lines = chunks[min(len(chunks) - 1, max(0, int(frac * len(chunks))))]
            for li, ln in enumerate(lines):
                tw = d.textlength(ln, font=F_CAP)
                if CAPX is None: x = (W - int(tw)) // 2 if STAGE_LAYOUT else 80
                else: x = CAPX + (cap_w - int(tw)) // 2 if STAGE_LAYOUT else CAPX
                y = CAP_TOP + li * CLH
                d.rounded_rectangle([x - 20, y - 8, x + tw + 20, y + round(54 * CAPS)], 12, fill=CAP_FILL)
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
