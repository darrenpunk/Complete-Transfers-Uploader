---
name: Large-PDF upload OOM / watchdog mid-upload kill
description: Why big PDF uploads 500'd in prod, the lightweight box-reading rule, and the watchdog deferral contract
---

# Large-PDF upload 500 — two-part root cause and the rules that prevent it

**Symptom:** customer "Upload failed (500)" on the deployed app for a ~75MB PDF; prod `crash_logs` showed `memory_critical` (RSS >400MB post-GC) followed by watchdog `process.exit(1)` ~3s later, killing the in-flight upload.

## Root cause
1. The upload path unconditionally did `fs.readFileSync` + `pdf-lib PDFDocument.load` of the ENTIRE file just to read MediaBox/ArtBox/TrimBox. pdf-lib parses the whole document into JS objects — for a 75MB PDF that's a multi-hundred-MB transient spike.
2. The prod memory watchdog (400MB Reserved-VM line) exited unconditionally, even with a customer op in flight — converting a transient, self-resolving spike into a customer-facing 500.

## Rule 1 — box reads must be lightweight
`getPdfBoxesLight(pdfPath)` in `server/routes.ts`:
- **Tier 1:** `pdfinfo -box` (poppler) — parses `MediaBox/ArtBox/TrimBox: x1 y1 x2 y2` lines. Handles negative origins; rejects w/h <= 0. Note poppler SYNTHESIZES ArtBox/TrimBox = MediaBox when absent — the existing `wDiff>5||hDiff>5` gates at call sites naturally discard those copies (same behavior as pdf-lib's fallback), don't remove the gates.
- **Tier 2:** Ghostscript MediaBox extraction (artBox/trimBox come back null — gates skip gracefully).
- **Tier 3:** pdf-lib full load, ONLY if `statSync().size < 30MB`.

**Never add a new `PDFDocument.load(readFileSync(...))` on the upload path for box reading.** Helper failure throws inside the same try/catch that used to catch pdf-lib failure, so downstream fallbacks (PNG@300DPI dims) are unchanged. The one-measurement rule stands: in the raster branch, GS bbox still drives BOTH display size and originalPdfBounds; the helper only supplies the full-page fallback + sanity gates.

## Rule 2 — watchdog defers, never kills a live customer op immediately
`server/index.ts` memory watchdog: after the 3s window + post-GC recheck, if `getOperationStats().active > 0`, the exit is DEFERRED (logged as `restart DEFERRED` memory_warning row) and re-evaluated on the next 30s check. Bounded by `MEMORY_DEFER_MAX_MS` (180s = OperationGuard's own op cap, which also sweeps stale ops, so deferral can't be pinned forever). A genuine leak still restarts after the window.

**Stale-clock guard (architect-found edge):** `memoryCriticalSince` only fully resets below the 350MB warn line. If RSS parks in the 350–400 band after an incident, the clock survives — so a fresh spike hours later would exhaust the window instantly and kill an in-flight op. Fix: if the previous critical trigger (`lastMemoryCriticalAt`) is older than 3× the check interval, treat the spike as a NEW incident and restart the window. Don't "simplify" this by resetting below 400 instead — that would let RSS oscillating around 400 defer forever.

## Verification recipe
- Upload repro: `POST /api/projects` then `POST /api/projects/$ID/logos -F "files=@x.pdf;type=application/pdf"`. Dedup returns instantly on identical bytes — append a `% uniq` comment or re-generate the file for a fresh hash. NOTE: appending bytes can flip the classification path (raster-only vs mixed-content); the classifier is also memory-pressure-sensitive, so dev and prod can take different branches for the same file.
- Prod watch: every deferral logs `restart DEFERRED` (memory_warning row in crash_logs); a `memory_critical` exit row during an active upload = regression.
- `npm run typecheck` does NOT exist despite replit.md — use `npx tsc --noEmit`. Pre-existing errors: index.ts TS1252 (cleanTempFiles fn-in-block), routes.ts:70 TS2322 + several at 811/1082/1824/1912/2936.
