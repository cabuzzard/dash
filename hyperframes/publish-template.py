"""Zip a HyperFrames template and publish it to R2 so HeyGen's cloud renderer can
fetch it by URL (worker: HF_TEMPLATES in worker.js points at the published key).

    python hyperframes/publish-template.py reel-kinetic v1

Bump the version (v2, v3...) on every change and update HF_TEMPLATES — the
public URL is cached immutably, so never overwrite a published version.
"""
import os, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKIP_DIRS = {"renders", "snapshots", "node_modules", ".git"}

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    name, version = sys.argv[1], sys.argv[2]
    src = os.path.join(HERE, name)
    if not os.path.isfile(os.path.join(src, "index.html")):
        sys.exit(f"no index.html in {src}")
    out = os.path.join(tempfile.gettempdir(), f"{name}-{version}.zip")
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f.startswith("."):
                    continue
                p = os.path.join(root, f)
                z.write(p, os.path.relpath(p, src).replace(os.sep, "/"))
    print(f"zipped {out} ({os.path.getsize(out)} bytes)")
    key = f"dash-media/hyperframes/{name}-{version}.zip"
    subprocess.run(
        f'npx wrangler r2 object put {key} --file "{out}" --content-type application/zip --remote',
        cwd=os.path.join(HERE, "..", "worker"), shell=True, check=True,
    )
    print(f"published https://pub-74b0072d4e4947dfbaf4afa7daecbfe7.r2.dev/hyperframes/{name}-{version}.zip")

if __name__ == "__main__":
    main()
