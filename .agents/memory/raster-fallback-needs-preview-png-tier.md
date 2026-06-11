---
name: Raster embed fallback must have a pre-generated-PNG tier
description: Why the PDF embed last-resort can't rely only on Ghostscript rasterizing the source PDF, and what saves a blank print page.
---

# Embed fallback: blank print page when GS chokes on a malformed customer PDF

**Symptom (production):** orders ship with artwork MISSING — main artwork page fully
blank, garment "Combined View (Fallback)" page shows only its solid colored backing
rectangle (no logo on top), while the canvas-screenshot page renders fine. Output PDF
has ZERO form XObjects (proof the vector embed path never produced anything). Seen on
"Full Colour - Cut" transfer_size templates with outlined-fonts (SVG-processed) logos.

**Root cause:** the embed recovery chain is vector embed → retry once → raster fallback.
The raster fallback historically rasterized ONLY the **source PDF** via Ghostscript.
When the customer's PDF is malformed, GS dies ("Unrecoverable error", "/undefined in
--get--") AND if the processed file is an SVG there is no source PDF to rasterize, so the
fallback returned false and the page shipped blank.

**Rule (load-bearing):** the raster fallback (`embedSourceAsRasterFallback`) must be
TIERED and must NEVER return false just because GS failed. After the GS-rasterize-source
tier, fall through to embedding an **already-generated flat PNG** of the artwork that the
upload pipeline produces — `logo.canvasFallbackFilename` / `logo.previewFilename` (plus
disk-derived names: `<filename>_preview.png`, `<filename>_canvas_fallback.png`, and the
`.svg` → `-canvas-fallback.png` convention). That PNG is the same image the browser canvas
renders, so it always exists and always decodes. Embed it via the existing
`embedRasterImage` path using a SHALLOW CLONE of the logo (never mutate the shared record —
the element loop reuses `filename`/`originalFilename` for the next placement).

**Why:** print job present-as-raster ≫ blank sheet (user pref: silent recovery over hard
failure; NO customer-facing warning — a warning tempts a re-click → duplicate order).

**How to apply:** any future change to the embed fallback must keep the pre-generated-PNG
tier as the floor. Don't "simplify" it back to GS-only. Don't cache GS failures (a
transient flake would poison every imposition tile for that source). The fallback serves
BOTH page1 `(page1,null)` and garment page `(null,page2)` callers.

**Diagnose next occurrence:** deployment logs are wiped on republish, but a blank embed is
persisted to `crash_logs` (`event_type='pdf_embed_incomplete'`) with the skipped-elements
list. Look for `EMBED SUMMARY ... embedded=0` and `RASTER FALLBACK: exhausted all tiers`.
