---
name: originalPdfBounds only describe the pristine original PDF
description: Why logo.originalPdfBounds must never be used to crop a derived (converted SVG→PDF or already-cropped) PDF in robust-pdf-generator, or the form XObject BBox clips the artwork.
---

# `logo.originalPdfBounds` belong ONLY to the pristine uploaded PDF

`logo.originalPdfBounds` (content bbox stored on the logo at upload time) are measured
in the **original uploaded PDF's coordinate space / page box**. They are valid input to
`cropPdfToContentBounds` ONLY when the file being cropped IS that exact pristine original.

**Rule:** In `embedLogoInPages`' auto-crop block, only set `boundsForCrop = originalPdfBounds`
when `logoPdfPath` is the untransformed original. For any *derived* file, ignore the stored
bounds and measure a live Ghostscript bbox on the actual file instead. A `logoPdfIsDerived`
flag tracks this — it is set true at BOTH derivation points: (1) the SVG→PDF conversion
(`convertSVGToPDF`, triggered by fonts-outlined / ink-recolor / colour-overrides), and
(2) the offset-normalising `cropPdfToContentBounds` resize of the original.

**Why:** A converted SVG→PDF (Inkscape `--export-area-page`) has a different page box and
content origin than the original; an already-cropped copy has its content shifted to the
origin. Applying the original's `xMin/yMin` translate to either re-shifts content partly
outside the crop box. `pdf-lib`'s `embedPdf` then bakes that crop box into the embedded
**form XObject BBox**, which acts as a clip — symptom: the bottom (and a thin left sliver)
of EVERY placed/imposition logo is cut off, even though the page content stream has no
explicit clip operator. Confirmed on a UV DTF A3 imposition of outlined-font logos.

**How to apply:** Any time you crop/normalise a logo PDF that may have been converted or
pre-cropped, never trust upload-time bounds — measure the file you actually hold. Verify a
fix by rasterising the generated PDF (`pdftoppm`/gs) and eyeballing whole logos; do NOT
trust ad-hoc content-stream bbox math (nested `q…cm…Q` transforms make naive single-`cm`
extent estimates wrong — they gave a false "clipped" reading here).

**Residual risk (pre-existing, not introduced by this fix):** the live-GS-bbox fallback can
under-measure white/light artwork (see `inkscape-bounds-vs-gs-bbox.md`); it keeps the >5%
page-area sanity check + skip-crop guard, so worst case is a letter-box, not a clip.
