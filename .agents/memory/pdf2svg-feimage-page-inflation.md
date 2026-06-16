---
name: pdf2svg feImage 1.2× page inflation
description: Why some PDF uploads get detected ~20% too large (e.g. A3 297×420mm → 356×504mm) and the clamp that fixes it
---

# pdf2svg feImage filter-region inflates detected page/content size

## Symptom
An uploaded PDF is detected ~1.2× too large. Concrete case: an A3 PDF
(MediaBox 841.92×1190.64pt = 297×420mm) was stored as **356.41×504.04mm**
(1010.30×1428.77px). The client fit-to-bounds then resized the canvas element to
the inflated size and threw a spurious "content extends beyond canvas bounds"
position warning.

## Root cause
`pdf2svg` correctly sets the outer `<svg viewBox>` to the true page, BUT it also
emits `<feImage>` filter regions sized **≈1.2× the page** (with a matching ±10%
translate, e.g. ±84.192/119.064). `inkscape --query-width/height` (and
`--query-all`) on that SVG returns the **filter-region** extent (1010.3×1428.77px),
not the page — so any Inkscape-based bounds path reports the inflated size.

The Ghostscript bbox path was actually CORRECT here (294.69×416.61mm, 98% page
coverage). The bug was the existing `USING INKSCAPE BOUNDS (GS at origin, Inkscape
larger)` rule (see `inkscape-bounds-vs-gs-bbox.md`): because GS sat at the origin
and Inkscape measured "larger", it overrode the good GS value with the inflated
Inkscape one.

## Fix (load-bearing — don't regress)
Real artwork can never exceed the PDF page. In the logo-upload route
(`server/routes.ts`):
1. A hoisted `pdfPageSizeForClamp` is set from the PDF **MediaBox** (via pdf-lib)
   at the same place `pdfPageDimensions` is built.
2. A final clamp block runs **right before `storage.updateLogo`** (after ALL the
   GS/Inkscape heuristics and overrides) and clamps `displayWidth/displayHeight`
   (mm) and `contentBoundsToSave` (px; 1px==1pt at 72dpi) down to the MediaBox.
   - Orientation-aware (swaps page W/H when content orientation differs, for
     `/Rotate` PDFs).
   - ~1mm tolerance; guarded by `if (pdfPageSizeForClamp)` so native SVG/raster
     uploads are untouched.
   - Logs `📐 CLAMP TO PDF PAGE` when it fires.

**Why clamp AFTER the override instead of fixing the override:** the GS-vs-Inkscape
rule also does legitimate white-content recovery (white art on dark garment — see
`inkscape-bounds-vs-gs-bbox.md`); reworking it risks that. A post-heuristic clamp
to the MediaBox is a safe final rail that can't suppress legitimate bleed (bleed is
inside MediaBox) and never clamps to the smaller ArtBox/TrimBox.

**How to apply:** if a PDF upload is detected too large again, check for the
`<feImage>` filter regions in the pdf2svg output and confirm the clamp fired in the
upload logs. Don't "fix" it by trusting Inkscape less globally.
