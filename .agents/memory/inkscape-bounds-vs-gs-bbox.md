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

---

# CORRECTION: `INK_PX_TO_PT = 72/96` is NOT document-independent — the GS-empty fallback now self-calibrates

The claim above that `INK_PX_TO_PT = 72/96` is "exact, document-independent" is WRONG. The
px→pt factor depends on the **SVG header units the PDF→SVG converter emits**:
- pt-unit header (`width="595pt"`): Inkscape renders at 96dpi → query px = pt×96/72, so
  ×0.75 (=72/96) is correct.
- unitless header (`width="595.276"` with matching `viewBox`): Inkscape user-unit == px == pt
  1:1, so the correct factor is **1.0**, and ×0.75 wrongly shrinks everything to 75%.

**Symptom (real customer file, A4 29er full-bleed colored design on black A4 template):** GS
`-sDEVICE=bbox` returned EMPTY (the PDF uses radial/linear gradient patterns + compositing
groups + clip masks GS's bbox device can't measure), so bounds fell to the **GS-empty inkscape
fallback** (`inkscape --query-all … | head -1`, which returns the ROOT `<svg>` = whole page).
That block applied ×0.75 to a unitless-header SVG → full A4 595.3×841.9pt reported as
446.5×631.4pt = **157.5×222.75mm = exactly 75% of A4** → clipped on canvas.

**Fix (in the GS-empty fallback block only):** self-calibrate the factor from the document
itself. Because `head -1` is the root element, its raw px box maps exactly to the viewBox
(= MediaBox in pt), so the true factor is `pxToPtFactor = pdfPageDimensions.widthPts / rawRootW`
(rawRootW = `parseFloat(parts[3])`). Falls back to `INK_PX_TO_PT` only when page dims / root
width are unavailable. Yields ≈1.0 for unitless headers, ≈0.75 for pt-unit headers — adapts
automatically. Calibrate each axis independently (`widthPts/rawRootW`, `heightPts/rawRootH`)
so a converter emitting non-uniform scaling can't skew one axis.

**Why self-calibrate vs reading the SVG width unit:** the root-px-vs-known-page-pt ratio is
exact regardless of header quirks, requires no SVG parsing, and degrades gracefully.

**RESOLVED — the GS-primary blocks now self-calibrate too (the latent risk DID surface):** a
customer file (Jones Eng Transfers, MediaBox 779.73×549.97pt = 275×194mm, white "UP" text near
the right edge invisible to GS) hit exactly the predicted 75% shrink: GS ink bbox was only 27%
of the page, the white-content verification + the SVG-normalization union (both GS-primary
blocks) drove the SIZE, and their hardcoded 0.75 reported 583.30×410.98pt = 205.78×144.98mm =
exactly 75% → clipped ~25% of the artwork. So Inkscape CAN drive bounds size on the GS-primary
path whenever GS under-detects (white content) AND that path overrides GS.

**Fix:** compute per-axis `inkToPtX/inkToPtY` ONCE near the top of the GS-primary bounds block
by reading THIS document's SVG-header `viewBox` (`pdfPageDimensions.widthPts/vbW`,
`heightPts/vbH`) and use it in place of the hardcoded `INK_PX_TO_PT` in all three GS-primary
parsing blocks (white-content verify, pre-imposed-sheet check, all-elements union). pdf2svg
emits a unitless header whose viewBox == MediaBox-in-pt, so the factor is ~1.0 (Jones → 1.0026,
giving 274.37×193.31mm ✓). A px@96 converter gives 0.75. Falls back to the 72/96 constant only
if the viewBox is unreadable.

**Why viewBox, not the inkscape root bbox:** Inkscape's root `--query-all` line reports the
CONTENT bounding box, NOT the canvas — for a small logo on a big page that would be far smaller
than the page and calibrating `pageW/rootContentW` would massively over-inflate. The SVG-header
viewBox is the true canvas coordinate space, so it calibrates correctly at any content size.
(The GS-EMPTY fallback block still calibrates from its root line because there the content
fills the page by definition — white-on-white full designs — so root≈page holds.)

**Regression:** Jones 274×193 ✓; PDF regression unchanged 8 pass / 0 fail / 7 skip. Coexists
with the prior A3 MediaBox clamp (which only caps OVERSIZED results DOWN to page) — this fix
corrects UNDER-sizing earlier in the pipeline; the two are complementary, not conflicting.

---

# Large-format DTF uses a SEPARATE raster path — the px→pt fix above does NOT cover it

The same white-bottom-text clipping (Kilkenny crest) ALSO reproduces on large-format DTF,
but through a DIFFERENT code path that never touches Inkscape. `isLargeFormatDTF` (template
width ≥1000mm OR height ≥500mm, e.g. id `dtf-large` = 1000×550) makes the upload route
**skip pdf2svg** and rasterize the PDF straight to a PNG preview, keeping the original PDF
for output. Bounds there come from `gs -sDEVICE=bbox` + an alpha-trim rescue (`convert -trim`
on the rendered PNG), NOT from the SVG bounds machinery.

**The bug:** the alpha-trim rescue only expanded the GS bbox when
`alphaArea > gsBoundsArea * 1.15`. White bottom text adds only ~9% area (ratio ~1.10 < 1.15)
so the rescue was skipped → PNG cropped to the GS strip that missed the white band. Then in
the crop-SKIP branch the stored `originalPdfBounds` was left at the (still slightly clipped)
content union, so the PNG was squished into a too-small box.

**Fix:** replace the area-ratio gate with a **per-edge** check (`tolPt = 2`): expand GS bbox
to the alpha-trim union if alpha extends beyond GS on ANY of xMin/yMin/xMax/yMax. And in the
crop-SKIP else branch set `originalPdfBounds` to the FULL PAGE (not the content union), so the
PNG region and the stored bounds describe the same rectangle (displayWidth/Height come from
`originalPdfBounds.widthMm/heightMm`; a mismatch distorts the canvas element).

**Verified:** Kilkenny white-text PDF (page 297.6×283.5pt) on `dtf-large`: was 100.2×86.2mm
(aspect 1.163, clipped); now full page 105×100mm (aspect 1.053, white text preserved). Black
-text twin unaffected (its content fills the page so GS already matches).

**How to apply / watch for:** clipping reports must be triaged by template first — large-format
DTF (`dtf-large`, sublimation 1100×1000) takes the PNG raster path; everything else takes the
pdf2svg/Inkscape path. A "fix" to one path does NOT fix the other. Also: the project's
`templateSize` field stores the template **id** (`dtf-large`), NOT the `name` (`large_dtf`) —
using the name makes `templateSizes.find` miss, silently dropping into the CMYK/SVG fallback.

**Known remaining (NOT converted; lower-risk, off the GS-primary path):** the
direct-SVG-upload fallback (`if (!boundsResult)` path using `--query-x/y/width/height` with
a pervasive `svgPxToMm = 25.4/72`) still treats query px as pt. Only hit when the whole
GS-primary block yields nothing; its 25.4/72 convention threads through hundreds of
downstream lines + a separate SVG-analyzer path, so a piecemeal fix risks divergence. If
clipping reappears on direct-SVG uploads, fix that block holistically (px→pt, or switch to a
true px→mm 25.4/96 with explicit units end-to-end).

---

# Pre-imposed full-page sheet: GS tight ink bbox clips the outer artwork → use true vector bounds

A NEW clipping class, distinct from the white-content trap above. When a customer uploads a
**pre-imposed multi-up sheet** whose PDF page dimensionally matches the chosen template
(e.g. an A3 landscape layout), the artwork fills most of the page but NOT to the paper edge
(art ≈ 400×290mm inside a 420×297 A3 page). Two wrong answers and one right one:
- **GS `-sDEVICE=bbox`** = tight INK bbox, sits a few mm INSIDE the true artwork edges →
  cropping the original PDF to it shaves the outermost art off (the reported "clipping",
  ~395×289 instead of 400×290).
- **Full PDF page (MediaBox)** = includes empty margins → oversizes the placement (420×297).
- **Right answer = the artwork's geometric extent** (~400×290) from `inkscape --query-all`
  union of the elements.

**The rule:** when `analyzeFullPageMatch` (server/full-page-match.ts, 10pt tol) returns a
`direct`/`rotated` dimensional match, query the ORIGINAL PDF's true vector bounds and adopt
them over the GS bbox — but ONLY when they are **strictly larger than GS** (width & height
≥ GS−1, at least one > GS+1) AND **coverage < 0.97** (so genuinely tight content isn't
oversized and a near-full-page background rect isn't promoted). Flag adopted bounds
`__fromSvgCoords=true` so the downstream SVG→PDF coordinate flip applies. Parse like the
white-content block: skip line 0 (root `<svg>`), clamp each element to the page, ×INK_PX_TO_PT.
Failure is caught + logged non-critical → degrades to the prior GS path. Counter-tests that
MUST stay tight/cropped: small content on a large page (teddy portrait-on-landscape, a
64×65mm crest); full-page tests (mtsg, rotated bem) stay full-page.

## The load-bearing sub-trap: Inkscape picks its import filter by FILE EXTENSION
`inkscape --query-all` returned **0 lines** on the stored original PDF and the block silently
fell through (gX0 stayed Infinity → no adoption). Reason: the stored original is a content
hash with **NO `.pdf` extension** (e.g. `uploads/74732ea0…`). Inkscape chooses its importer
by extension, so an extensionless file imports as nothing; **GS works on the same file
because GS sniffs content, not extension** — which is why GS-based paths never hit this.

**Fix / how to apply:** any code that runs `inkscape --query-*` on an uploaded original MUST
first copy it to a temp file WITH a `.pdf` extension (e.g. `os.tmpdir()/preimposed_bounds_*.pdf`),
query the temp copy, and `unlink` it in a `finally`. Never assume `originalPdfPath` ends in
`.pdf`. (Also reuse the already-computed `inkscapeVerifyBounds` from the white-content block
when available instead of re-running the heavy `--query-all`.)

---

# ArtBox = trusted graphic size; the 60% content-fill gate is for TrimBox (Corel) ONLY

A SEPARATE bounds class from clipping: artwork uploaded SMALLER than its intended size when
the design has deliberate whitespace margins. completetransfers artwork PDFs declare the
intended **graphic size** via an **ArtBox** (e.g. ArtBox = 220×130mm, matching the printed
"Graphic Size: 220mm x 130mm" label), with the actual ink (logo + text) sitting inside it at
e.g. 165×97mm (~56% of the ArtBox area).

**The bug:** the upload bounds path detected the ArtBox correctly but a safeguard required the
GS ink to fill **≥60%** of the ArtBox/TrimBox before honouring it; at 56% it discarded the
ArtBox and kept the tight 165×97 GS bbox → artwork uploaded too small.

**The rule (durable):** an **ArtBox** is an EXPLICIT Illustrator artboard = the designer's
declared graphic size → honour it regardless of ink-fill percentage (artwork routinely has
intentional margins). The 60% content-fill gate exists ONLY to defend against **Corel abusing
the TrimBox** (setting it to the whole template size while the real art is tiny inside, which
would stretch a small logo to fill the template). So gate on SOURCE: keep the ≥60% gate for
`trimbox`, bypass it for `artbox`.

**Why it's safe to honour ArtBox with no fill floor:** adoption is already bounded on both
sides — detection requires the box be meaningfully smaller than MediaBox (`wDiff>5||hDiff>5`,
>10pt) AND the adoption block requires it be larger than the GS bbox (`> gsBounds + 2`). So
the envelope is always `gsInk < ArtBox < MediaBox` — can't oversize past the page.

**How to apply:** record `artBoxSource: 'artbox'|'trimbox'` at box detection (getArtBox vs
getTrimBox fallback), carry it on `pdfPageDimensions`, and branch the fill gate on it.
**Watch for:** small logos with a genuinely-set ArtBox now coming in LARGER (intended) — that
is correct. **Known pre-existing (not changed):** the GS-empty fallback block adopts `artBoxPts`
with no source check; the 60% gate doesn't translate there (no GS content to measure), and that
path is white-on-white where the box is usually the right answer — leave it unless it surfaces.
