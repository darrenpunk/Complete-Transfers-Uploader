---
name: Upload bounds — GS bbox vs Inkscape full-page, distributed-white-content trap
description: Why white/light artwork on dark garments gets cropped + auto-flipped to landscape, and the rule for trusting Inkscape over Ghostscript in upload bounds verification
---

# Upload bounds: distinguishing a background RECT from distributed white content

In `server/routes.ts` upload bounds verification, two bbox sources are reconciled:
- `gs -sDEVICE=bbox` — returns the INKED-PIXEL bbox only. It under-reports white/light
  ink (white text on a dark garment, light gradients), returning just the non-white
  region. That region is often a wrong-shaped strip → causes a CROP and a wrong
  PORTRAIT↔LANDSCAPE auto-flip.
- `inkscape --query-all` — returns true geometric bounds per element, including white.

## The trap
A safeguard exists to ignore Inkscape when a Corel-exported PDF has an invisible
full-page background `<rect>` (Inkscape includes it → reports ~full page, but the real
art is tiny). That safeguard (`shouldTrustGSOverInkscape`) was too broad: it fired on
ANY full-page Inkscape result, so genuine **distributed white content** (white text/art
that really does fill the page) was misclassified as a background rect and discarded,
keeping the wrong cropped GS strip.

## The rule (the durable lesson)
Full-page-ness alone cannot tell a background rect from real full-page art. Use the
LARGEST SINGLE ELEMENT:
- A background rect = ONE element that alone ≈ covers the page (single-element coverage ~1.0).
- Distributed white content = MANY small glyph/path elements whose UNION is full-page
  but whose largest single member is a small fraction of the page (e.g. ~9%).

So only suppress Inkscape (trust GS) when `dominatedBySingleElement`
(`maxSingleElementArea / rootElementArea > 0.85`). Otherwise trust Inkscape.

**Why:** real customer file = A3 portrait white "EVENT STAFF" text on dark garment;
GS saw only a 294×123mm landscape strip → cropped + flipped to landscape. Largest
Inkscape element was ~9% of page → not dominated → trust Inkscape → correct 295×420
portrait. Corel background-rect case still has a ~100% single element → still trusts GS.

**How to apply:**
- Compute element/root areas from RAW `--query-all` px (NOT page-clamped values).
  Clamping mixes px/pt and corrupts the ratio. The ratio is dimensionless so raw px
  on both sides is correct.
- Skip line 0 of `--query-all` output (always the root `<svg>`) when accumulating the
  union bbox, but DO read its w,h to get rootElementArea. (Related gotcha: "Inkscape
  --query-all Root-Element Skip".)
- Fall back to the old behaviour (treat as dominated) if root area can't be measured.
- Known tradeoff (accepted): a single genuinely-huge white compound path (>85% of page)
  with GS missing it will still be treated like a background rect. Rare; acceptable.

**Watch for:** new tickets where uploaded canvas dimensions come back LARGER/portrait
when they should be small/landscape — would mean a previously-correct GS strip is now
being overridden by Inkscape when it shouldn't.

---

# Unit bug: `inkscape --query-*` returns CSS px (1/96in), the pipeline wants pt (1/72in)

A second, deeper cause of the same clipping class. `inkscape --query-all` /
`--query-width/height/x/y` (Inkscape 1.x, 1.3.2) report **CSS px (1/96 inch)**, but the
bounds code works in **PostScript pt (1/72 inch)** everywhere: GS bbox is pt, the
per-element clamps use `pdfPageDimensions.widthPts/heightPts`, and `pxToMm = 1/2.834645669`
is really a **pt→mm** factor. So Inkscape values were ~1.333× too large.

**Symptom:** logo with WHITE text along the BOTTOM (Kilkenny County Council crest) clipped
the bottom line; identical BLACK-text logo was fine. GS misses white-on-transparent → crops
the bottom band; the Inkscape rescue then had its px values **clamped down to the pt page
size**, chopping exactly that bottom band, and the inflated px **areas** made the
inkArea-vs-gsArea test misfire (Inkscape looked *smaller* after clamping → kept clipped GS).

**Fix:** `INK_PX_TO_PT = 72/96` (exact, document-independent). Multiply every parsed
`--query-all` coord (root + per-element x/y/w/h) at parse time in all pt-expecting parsing
blocks in the GS-primary path (the area-coverage verification block, the SVG-normalization
union block, and the GS-empty inkscape fallback). The maxElement/root RATIO is unchanged
(both sides ×0.75, scale-invariant — see "the rule" above), so the background-rect heuristic
is preserved. BLACK is untouched: content fills the page (`areaCoverage ≈ 1.0`) so the
Inkscape verification is skipped entirely.

**How to apply:** any NEW code parsing `inkscape --query-*` and feeding pt bounds math MUST
apply ×72/96 first. Do NOT trust the old "SVG user units are pt at 72 DPI" comment — wrong
for Inkscape's query output.

**Known remaining (NOT converted; lower-risk, off the GS-primary path):** the
direct-SVG-upload fallback (`if (!boundsResult)` path using `--query-x/y/width/height` with
a pervasive `svgPxToMm = 25.4/72`) still treats query px as pt. Only hit when the whole
GS-primary block yields nothing; its 25.4/72 convention threads through hundreds of
downstream lines + a separate SVG-analyzer path, so a piecemeal fix risks divergence. If
clipping reappears on direct-SVG uploads, fix that block holistically (px→pt, or switch to a
true px→mm 25.4/96 with explicit units end-to-end).
