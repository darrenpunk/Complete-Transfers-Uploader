---
name: Original artwork recovery — which file is the TRUE original
description: Data-model nuance for recovering a customer's as-uploaded artwork; only PDF/AI/EPS preserve a separate pristine original, native SVGs are recolored in-place.
---

# Recovering a customer's original uploaded artwork

When building any "give me back the customer's original file" / "re-process from
source" feature, the source of truth differs by upload type:

- **PDF / AI / EPS uploads**: a pristine pre-processing copy IS preserved at upload
  time and recorded on `logos.originalFilename` (+ `originalMimeType`, `originalUrl`).
  This is the true as-uploaded original and is safe to hand back verbatim.
- **Native SVG uploads**: there is **NO separate pristine original**. The upload
  pipeline can recolor/normalize the SVG **in place**, so `logos.filename` may
  already be the *modified* artwork, not the bytes the customer sent. Treat a
  fallback to `filename` as "current stored file", NOT "the original".
- **PNG / raster uploads**: usually unmodified, so `filename` is effectively the
  original — but it still isn't a guaranteed pristine copy.

**Why:** an admin recovery tool that blindly returns `filename` for every logo will
silently hand back recolored SVGs while claiming they are the customer's original,
which defeats the purpose (recovering from a bad generated output). PDFs dominate
this app's traffic, so preferring `originalFilename` covers the vast majority.

**How to apply:**
- Prefer `originalFilename` whenever present; only fall back to `filename` and label
  it honestly as the current stored artwork.
- Files live under `uploads/<rel>` and are a write-through cache to Object Storage —
  call `ensureLocal(rel)` before reading (restores on a local miss after redeploy/prune).
- Any admin endpoint that serves a DB-sourced filename from disk MUST contain the
  path to `uploads/` (reject absolute paths / `..` / NUL; resolved path must stay
  under the uploads dir) — DB values are an untrusted file-serving sink.
- `projects.uploaderEmail` is resolved lazily at upload time via an Odoo lookup, so
  email-based lookup only works once that resolution has run (regression-harness rows
  never set it, so they're invisible to email search — search them by project/logo id).
