---
name: SVG zero-origin normalization translation source
description: The translate that normalizes a pdf2svg SVG to zero-origin must come from the SAME bounds source that set the viewBox size, never Inkscape's px root position.
---

# SVG zero-origin normalization — translation must match the size source

When a PDF upload is converted to SVG (pdf2svg/Inkscape path in `server/routes.ts`,
the `NORMALIZING SVG to zero-origin` block), the code sets the SVG `viewBox` to
`0 0 contentWidthPts contentHeightPts` and wraps content in
`<g transform="translate(-tx, -ty)">`. For the artwork to land exactly inside the
viewBox (no clip, properly centered), `(tx, ty)` MUST be the content origin expressed
in the SAME bounds that produced `contentWidthPts/HeightPts`.

**Rule:** the translation origin and the viewBox size must come from one source.
- If the **GS bbox** is kept (the common case — `Using Ghostscript dimensions`),
  translate by the GS/PDF content origin in SVG top-left coords:
  `(contentBoundsForNormalization.xMin, pageHeightPts - contentBoundsForNormalization.yMax)`
  (or `.xMin/.yMin` when `__fromSvgCoords`).
- If the **Inkscape-union correction** replaced the GS bounds (it reports LARGER
  bounds than GS), it also resets `svgBoundsX/svgBoundsY` to the union min — that is
  the matching origin, so translate by those instead.

**Why:** `svgBoundsX/svgBoundsY` are taken from Inkscape `--query-all` ROOT element
position and multiplied by `INK_PX_TO_PT` (72/96). That value does NOT line up with
GS pt bounds — e.g. an A3 white-on-dark file reported root px 24.08 → ×0.75 = 18.06pt,
while GS xMin was 24.1pt. Translating by (-18.06,-9.94) instead of (-24.07,-13.24)
shifted the artwork ~6pt right / ~3pt down, so it overflowed the zero-origin viewBox
and **clipped on the bottom-right of the output PDF** (single-A3 template repro).

**How to apply:** the correct-origin branch used to be gated behind `rootIsFullPage`
(only when the root sat at 0,0). It is now generalised: use
`contentBoundsForNormalization` for the translate in EVERY case except when the
Inkscape-union correction fired (tracked by `boundsWereInkscapeCorrected`). If you
touch this block, keep the invariant: translate-origin and viewBox-size share a source.
Verify with the log line `📐 Translating SVG by source content origin (matches kept size)`
and confirm the saved SVG's `translate(...)` equals the GS origin, then run
`npx tsx tests/run-pdf-regression.ts` (expect 8 pass / 0 fail / 7 skip).
