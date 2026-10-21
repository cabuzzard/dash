# Legacy dash — frozen Oct 20, 2026

A runnable freeze of the dash tool as it stood on the evening of Oct 20, 2026,
taken from the live deployed files (cabuzzard.github.io/dash) before the
cleanup of the live tool began.

- `index.html` — the dash page, verbatim (sha256 5929ad5e…).
- `shared/` and `worker/kw-hub-ops.mjs` — the exact script files the page
  loads, verbatim, so relative paths resolve inside this folder.
- `interviews/index.html` — the interview answer-queue page, verbatim.

This copy talks to the **production worker**, same as the live tool — the
freeze is of the page, not the backend. The worker source as of this freeze
is preserved in this commit's tree at `worker/worker.js`.

Do not edit files in this folder. Cleanup and all new work happen on the
live tool; this stays as the fallback and the reference for what the tool
used to do.
