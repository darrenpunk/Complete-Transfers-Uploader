---
name: Dev-vs-prod raster/vector classification divergence
description: Why the SAME PDF imports as clean vector in dev but raster (full-page bounds + low-res warning) in prod — memory-pressure gating, not a Ghostscript difference.
---

## Symptom
A customer PDF (e.g. "Bag and tee drawing.pdf" — a 200 DPI photo embedded in an A3 page) imports in DEV as vector: content-cropped bounds (~270×252mm), no raster warning. The SAME file in PROD imports as raster-only: full A3 page bounds (297×420mm) + "Raster / low-res 200 DPI" preflight warnings. Users assume dev is "correct" and prod is broken.

## Root cause — it is NOT a Ghostscript version difference
Dev and prod both run gs 10.02.1 and the same `MixedContentDetector`. The `mixed_check` PostScript probe (`runpdfbegin`/`pdfgetpage`) is broken on gs 10.x (`/undefined in --get--`) and fails on EVERY upload in both environments — it is a no-op, not the cause.

The real cause is the **memory-pressure skip gate** in the upload path (`server/routes.ts`): both the preflight (`skipPreflight = isLargeFormatDTF || shouldSkipNonEssential()`) and the PDF content analysis (`if (mime==='application/pdf' && !isLargeFormatDTF && !shouldSkipNonEssential())`) are skipped when `shouldSkipNonEssential()` is true. When skipped, the file defaults to the VECTOR path (pdf2svg → SVG → GS-bbox crop → ~270×252mm, `isPdfWithRasterOnly=false`, no warning).

**Dev is chronically above the skip threshold** (dev baseline RSS ~470–500MB with Vite etc.), so dev ALWAYS skips content analysis → ALWAYS treats PDFs as vector. **Prod is usually low RSS at upload** (~179MB when this file came in), so prod RUNS the analysis → correctly classifies the file as raster-only (pdfimages shows one 2127×1991 JPEG @ 200 DPI + smask, and the lone pdf2svg `<path>` is just a clip path → `onlyClippingPaths` → embedded-raster verdict).

**Consequence:** classification is non-deterministic — the same customer file gets different treatment based on transient server load. Dev is NOT a reliable preview of prod raster detection.

## Which result is actually correct?
The file genuinely IS a 200 DPI raster (a photo), so prod's raster + low-res warning is technically ACCURATE and useful. The clean dev "vector 270×252, no warning" result is the anomaly (analysis was skipped). BUT the prod raster path has its own real bug: the extracted PNG is bounded to the FULL PDF page (297×420 A3) instead of cropped to actual artwork content (~270×252) — so prod bounds are wrong even though the raster classification is right.

**Why:** the memory-skip gate was added to stop pdf2svg/GS from OOM-crashing prod on big files; it was never meant to change artwork *classification*, but it does as a side effect.
**How to apply:** any fix must (1) make classification deterministic regardless of memory pressure (don't silently downgrade raster→vector under load), and (2) crop the raster-only extracted PNG to content bounds, not the full page — WITHOUT removing the OOM protection the skip gate provides. Treat "always-vector to suppress the warning" as a product decision, not an obvious fix: it would hide a legitimate low-res-for-print warning.

## Resolution rules (now in code — don't regress)
- The skip gate uses IS_PROD-aware thresholds like every other memory cap in the guard: prod values unchanged, dev values sized above the dev workspace's idle RSS. Any NEW memory threshold added to the guard must be IS_PROD-gated from day one, or dev silently diverges from prod again.
- Raster-only PDFs get their canvas display size AND their persisted print-crop bounds from ONE GS-bbox measurement of the pristine original (same sanity gate as the generator's live-bbox crop: positive, fits page ±1pt, >5% page area). On gate failure both fall back to full-page MediaBox + no stored bounds. Never let display size and print crop come from different measurements.
- GS bbox on raster-image PDFs reports the full image placement rect (not inked pixels), so the vector-path "white art returns a cropped strip" failure mode does NOT apply to the raster-only branch — no Inkscape cross-check needed there.
- `preflightData.warnings` is NOT purely forensic: the order PDF's label strip prints "Preflight Warnings: N" from it. Informational/diagnostic notes stored there must start with "Content analysis skipped" (the label counter filters that prefix) or staff-facing order labels will flag clean orders.
