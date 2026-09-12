"""Kinetic Text Reel caption engine — chunking, timing, and negative-space placement.

Usage: python caption_engine.py <video.mp4> <script.txt> <out.ass>
"""
import sys
import subprocess
import json
import re
from PIL import Image
import numpy as np

MIN_MS, MAX_MS, BASE_MS, PER_CHAR_MS = 500, 1100, 350, 35


def chunk_script(text, max_words=4):
    words = text.split()
    chunks, cur = [], []
    for w in words:
        cur.append(w)
        ends_clause = w.endswith((".", "!", "?"))
        if len(cur) >= max_words or (ends_clause and len(cur) >= 2):
            chunks.append(" ".join(cur))
            cur = []
    if cur:
        chunks.append(" ".join(cur))
    return chunks


def chunk_duration_ms(chunk):
    ms = BASE_MS + len(chunk) * PER_CHAR_MS
    return max(MIN_MS, min(MAX_MS, ms))


def probe(video_path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,duration", "-of", "json", video_path],
        capture_output=True, text=True, check=True,
    )
    d = json.loads(out.stdout)["streams"][0]
    return int(d["width"]), int(d["height"]), float(d["duration"])


def extract_samples(video_path, n=6):
    w, h, dur = probe(video_path)
    frames = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        p = f"{video_path}.sample_{i}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-i", video_path, "-frames:v", "1", p],
            capture_output=True, check=True,
        )
        frames.append(Image.open(p).convert("L"))
    return frames, w, h


def zone_complexity(frames, w, h, zone):
    """zone: 'top' | 'center' | 'bottom' — mean local variance (Laplacian-ish) in that third."""
    y0, y1 = {"top": (0, h // 3), "center": (h // 3, 2 * h // 3), "bottom": (2 * h // 3, h)}[zone]
    scores = []
    for im in frames:
        arr = np.asarray(im.crop((0, y0, w, y1)), dtype=np.float32)
        gy, gx = np.gradient(arr)
        scores.append(float(np.mean(gx ** 2 + gy ** 2)))
    return sum(scores) / len(scores)


def pick_caption_zone(video_path):
    frames, w, h = extract_samples(video_path)
    scores = {z: zone_complexity(frames, w, h, z) for z in ("top", "center", "bottom")}
    best = min(scores, key=scores.get)
    return best, scores


ASS_ALIGN = {"top": 8, "center": 5, "bottom": 2}
ASS_MARGIN_V = {"top": 60, "center": 0, "bottom": 60}


def ms_to_ass(ms):
    total_cs = int(ms / 10)
    h = total_cs // 360000
    m = (total_cs % 360000) // 6000
    s = (total_cs % 6000) // 100
    cs = total_cs % 100
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def write_ass(chunks, durations, zone, w, h, out_path, accent_idx=()):
    align = ASS_ALIGN[zone]
    marginv = ASS_MARGIN_V[zone]
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial Black,64,&H00FFFFFF,&H00FFFFFF,&H00181B0D,&H00000000,1,0,0,0,100,100,0,0,1,6,0,{align},60,60,{marginv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    t = 0.0
    lines = []
    for i, (chunk, dur) in enumerate(zip(chunks, durations)):
        start = t
        end = t + dur
        text = chunk.replace(",", "\\,")
        if i in accent_idx:
            text = "{\\c&H00C05F&}" + text
        lines.append(f"Dialogue: 0,{ms_to_ass(start*1000)},{ms_to_ass(end*1000)},Caption,,0,0,0,,{text}")
        t = end
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(lines) + "\n")
    return t


def main():
    video_path, script_path, out_ass = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(script_path, encoding="utf-8") as f:
        script = f.read().strip()

    chunks = chunk_script(script)
    durations = [chunk_duration_ms(c) / 1000.0 for c in chunks]

    zone, scores = pick_caption_zone(video_path)
    w, h, dur = probe(video_path)

    accent_idx = {i for i, c in enumerate(chunks) if any(k in c.lower() for k in ("causing", "audit", "session", "30-minute"))}

    total = write_ass(chunks, durations, zone, w, h, out_ass, accent_idx)

    print(json.dumps({
        "chunks": len(chunks),
        "captionsDurationSec": round(total, 2),
        "videoDurationSec": round(dur, 2),
        "zone": zone,
        "zoneScores": {k: round(v, 1) for k, v in scores.items()},
    }, indent=2))


if __name__ == "__main__":
    main()
