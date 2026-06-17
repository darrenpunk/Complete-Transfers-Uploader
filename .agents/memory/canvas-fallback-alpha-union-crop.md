---
name: Canvas fallback alpha-union crop + clipping safety net
description: Why the canvas fallback PNG crop must union vector bounds with the opaque-pixel bbox, plus the regression/validation/clip-detector guardrail that protects it.
---

# Canvas fallback crop must never be tighter than the opaque-pixel bbox

**Rule:** when the canvas fallback PNG is produced by rasterizing the FULL PDF page
(Ghostscript `pngalpha`) and then cropping it to the detected artwork bounds, the crop
rectangle MUST be the **union** of (a) the bounds-math rect derived from the detected
vector bounds and (b) the rendered PNG's own non-transparent (opaque-pixel) bbox.
Never crop to the vector bounds alone.

**Why:** the detected vector bounds come from `gs -sDEVICE=bbox`, which is **ink-only** and
cannot see white / light reverse-out artwork (white text/arcs meant for dark garments).
On such art the vector bbox UNDER-estimates the true extent, so a vector-bounds crop
silently SLICES real content (this was the live 2026-06 incident where ~half of customer
artworks came back clipped — e.g. the bottom arc + text of a white badge). A `pngalpha`
render makes every painted pixel opaque (white included), so the image's own alpha bbox is
the TRUE content extent. Unioning means genuine empty margins are still trimmed when the
bounds are right, but real content can NEVER be cropped away. Worst case the PNG ends a
touch larger than the element box (minor scale-down) — always preferable to a clip.

**How to apply:** any time you change the canvas fallback crop math, keep the alpha-union.
Snapshot the bounds-math rect BEFORE the union mutates it (the clip detector needs it).
The `convert … -format "%@"` trim call is required for the union anyway, so the detector
below is free — don't add a second ImageMagick pass.

## The 4-part clipping safety net (don't let any part rot)

1. **Regression fixtures** — `tests/pdf-fixtures/fixtures.json` locks every past clipping
   bug (white-on-dark, feImage page inflation, derived-vs-pristine crop, raster-fallback
   PNG tier, synthetic white-bottom-edge, applique, imposition, DTF). Each past bug has a
   fixture whose assertion goes red on regression. Run via the `pdf-regression` workflow or
   `npx tsx tests/run-pdf-regression.ts` (NOT in-shell `nohup` — background procs get
   SIGTERM'd when the tool shell exits, leaving empty logs).
2. **Heavy gate** — fixtures >~35MB OOM the 384MB dev box; they only run when
   `PDF_REGRESSION_INCLUDE_HEAVY=1` or `PDF_REGRESSION_BASE_URL` points at a prod-sized
   instance. `enabled:false` fixtures skip with a documented reason. Healthy baseline:
   **16 pass, 0 fail, 3 skip** (09 embroidery-preview + 11 DTF-passthrough disabled, 12
   heavy-gated).
3. **Validation step** — registered as validation command `pdf-regression`; treat a
   non-PASSED run as a release blocker.
4. **Production clip detector** — fires `persistCrashLog('clip_suspected', …)` (reuses the
   existing `crash_logs` jsonb `details`, NO schema change) when the opaque bbox extends
   past the detected vector bounds by > max(4px, 1% of render). Non-blocking, fire-and-
   forget. NOTE: `persistCrashLog` is NOT a top-level import in routes.ts — call it via
   `import('./index').then(({persistCrashLog}) => …).catch(…)`. Query production with:
   `SELECT details FROM crash_logs WHERE event_type='clip_suspected' ORDER BY created_at DESC`.

## Applique template id gotcha
The applique badge template id is **`applique-badge`** (100×70mm), NOT `applique-100x70`.
A wrong id makes the fixture/upload silently fail template lookup. Applique fixtures drive
the dual-canvas + `appliqueBadgesForm` path in the harness.
