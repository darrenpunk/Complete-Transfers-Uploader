---
name: White-art alpha-trim bounds + output-clip regression testing
description: How invisible white-on-white/dark artwork gets wrong bounds (gs bbox + inflated inkscape root box) and the alpha-trim raster fix; plus the regression-harness pattern (skipPlace + white-aware output measurement) needed to actually catch OUTPUT clipping, not just upload bounds.
---

# White artwork: invisible-bounds bug class + how to test it

## The bug class (bounds detection)
Pure-white (or white-on-dark) artwork has NO ink that `gs -sDEVICE=bbox` can see —
it renders on gs's white page and returns `0 0 0 0` or a cropped strip. The old
fallback read the root `<svg>` box from `inkscape --query-all | head -1`, but
**pdf2svg feImage / clip-filter regions inflate AND mis-place that root box**, so
the artwork falsely "touches" the page top/right. The zero-origin normalisation
then translates the art partly out of the viewBox → **~35pt clipped off the
bottom-right, both on the canvas AND in the generated output PDF.**

**Fix (the durable approach):** for invisible/white art, render the ORIGINAL pdf
to a TRANSPARENT raster (`gs -sDEVICE=pngalpha`) and alpha-trim it to get the TRUE
visible extent — never trust the inkscape root box for white content. Real example:
landscape A4 page 841.89×595.28pt, true art ≈278.4×182.1mm, aspect ≈1.53.

**Why:** gs bbox is ink-only (blind to white); the inkscape root box is the wrong
proxy because feImage/clip regions distort it. The alpha raster is the only source
that reflects what the human actually sees.

**How to apply:** when bounds come back page-sized, origin-hugged, or aspect-wrong
for light/white art, suspect this path. Related: `inkscape-bounds-vs-gs-bbox.md`
(white-on-dark upload side), `svg-normalization-translation-source.md` (the
translate-source rule), `pdf2svg-feimage-page-inflation.md`.

## The testing lesson (why a passing fixture can still miss the bug)
Two non-obvious harness requirements to lock white-art clipping in
`tests/run-pdf-regression.ts`:

1. **`skipPlace: true` — mirror the real "upload → generate" flow.** The upload
   endpoint auto-creates ONE centered element. A fixture that ALSO manually places
   an element leaves a DUPLICATE element in the saved project, which pollutes the
   output PDF and can MASK an output-clipping regression. For an upload-centering
   bug, skip placement and let the single auto-created centered element be the
   subject. (Guarded: skipPlace throws if imposition/applique are also set.)

2. **Measure OUTPUT content white-aware, not with gs bbox.** Upload-bounds
   assertions alone do NOT prove the OUTPUT is unclipped. To check the rendered
   output, rasterize page 1 with `gs -sDEVICE=pngalpha -r100`, then
   `convert -trim` + `identify` to get the artwork's trimmed w/h/offset — because
   gs bbox can't see white ink in the output any more than at upload time. Assert
   the trimmed **aspect** (`outputContentAspect {min,max}`) and that margins are
   roughly equal (centered). A clip/squish/overflow drifts the aspect → red.

**Why:** the original Schembri fix was correct in the live app but the first
fixture was upload-bounds-only AND carried a duplicate placed element, so it could
not have caught an output clip — a green test that proved nothing about output.

**How to apply:** any "uploaded artwork is clipped/off-centre in the OUTPUT" bug,
especially white/light art, needs BOTH: skipPlace (real centering flow) and a
white-aware output-content aspect assertion. Don't rely on gs bbox or upload bounds
alone.
