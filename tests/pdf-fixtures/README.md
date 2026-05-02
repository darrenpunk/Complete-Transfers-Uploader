# PDF Regression Test Fixtures

This folder contains real-world PDF uploads from the project history. Each one
represents a **specific bug class** that has caused a customer-visible
regression in the past. The automated regression test suite uploads each of
these to a staging instance, generates the production PDF, and asserts that the
output still has the correct shape (orientation, page count, content position).

If any of these tests fail in CI, **do not deploy** — that means a fix from the
past has just been undone.

You can download this whole folder and use it to manually re-test any time you
suspect a regression. Open each fixture in the app under the "Recommended
template" listed below and confirm the resulting PDF matches "Expected output".

---

## Fixture catalogue

### `01_landscape-page-portrait-content_TEDDY.pdf`
- **Source:** original customer upload, `attached_assets/teddy_1777711689843.pdf`
  (Adobe Illustrator 29.5, single A3 landscape page, 1190.55×841.89pt).
- **Bug history:** Today (May 2026). PDF page is A3 landscape, but the actual
  artwork is a small circular crest, square-ish in shape (~270×274mm) sitting
  in the middle of an otherwise empty landscape sheet. Old code detected the
  landscape *page* and flipped the entire output PDF to landscape, clipping
  the artwork because canvas elements are positioned in the portrait template
  coordinate frame.
- **Recommended template:** A3 Single Colour (297×420mm portrait)
- **Expected output:** PDF page must be portrait A3 (842×1191pt). Artwork
  centered, not clipped.

### `02_small-crest-on-landscape-page_WATERFORD.pdf`
- **Source:** `attached_assets/water_1777021093594.pdf`
- **Bug history:** Same family as #1. A small inset crest sitting on an
  otherwise empty landscape sheet caused a false "full page" detection deeper
  in the per-element path, embedding the entire landscape page into a portrait
  template slot and squashing/clipping the artwork.
- **Recommended template:** A3 or A4 portrait
- **Expected output:** Output keeps template orientation. Crest renders at its
  true content size, centered on the canvas placement.

### `03_true-fullpage-landscape_MTSG-GRADIENT.pdf`
- **Source:** `attached_assets/MTSG-A5-gradient-blue-landscape_1770383142690.pdf`
- **Bug history:** Counter-test for #1 and #2. This is a **legitimate**
  full-page landscape design — the fix for the teddy bug must not break this
  case. Content covers the entire page.
- **Recommended template:** A5 portrait (this PDF should trigger the
  "switch to landscape variant" prompt)
- **Expected output:** Output PDF correctly produced as landscape A5. Gradient
  fills the page edge-to-edge with no clipping.

### `04_landscape-A4-on-portrait-template_INTERSPORT.pdf`
- **Source:** `attached_assets/Intersport_A4_1771445718735.pdf`
- **Bug history:** Landscape A4 PDF that historically triggered orientation
  confusion when placed on a portrait template. Tests the
  "Landscape Template Auto-Detection" prompt.
- **Recommended template:** A4 portrait
- **Expected output:** App offers the landscape-variant switch on upload. If
  user accepts, output is landscape A4. If user declines, output stays portrait
  with the artwork properly placed via canvas coordinates.

### `05_outlined-fonts_ILLUSTRATION-BROWN.pdf`
- **Source:** `attached_assets/IllustrationBrown_A3_1777563733034.pdf`
- **Bug history:** When the user clicks "outline fonts" on an upload that
  contains live text, the original PDF still has the live text. Earlier
  versions silently used the original PDF anyway, undoing the user's outlining.
- **Recommended template:** A3 portrait, then click "Outline fonts" before
  generating PDF.
- **Expected output:** Generated PDF must contain only paths (no live text).
  Verify by opening in Acrobat and trying to select text — should select as
  shapes, not characters.

### `06_multi-color-order_RAINBOW-DOG-6UP.pdf`
- **Source:** `attached_assets/295_qty10_cmyk_1753703254030.pdf`
- **Bug history:** Multi-color garment orders must produce one preview page per
  garment color. Earlier regression produced only one page regardless of color
  count. Also tests CMYK preservation.
- **Recommended template:** A3 portrait, with multiple garment colors selected
  (e.g. White x5 + Navy x5).
- **Expected output:** Output PDF has 1 transparent artwork page + N garment
  color preview pages (one per selected color). CMYK colors preserved.

### `07_grid-imposition-source_RAINBOW-DOG-SOURCE.pdf`
- **Source:** `attached_assets/63277_Rainbow dog 6up A3_1753527851857.pdf`
- **Bug history:** Single small logo that the user wants to impose as a grid
  (e.g. 6-up). Tests the Imposition tool.
- **Recommended template:** A3 portrait. Use Imposition to create a 2×3 grid.
- **Expected output:** Output PDF page 1 contains 6 evenly-spaced copies of the
  logo, all at the same size, no clipping at edges.

### `08_applique-dual-canvas_ER-APPLIQUE.pdf`
- **Source:** `attached_assets/er_qty10_applique_1770630555209.pdf`
- **Bug history:** Applique templates use a dual-canvas system (Badge Artwork
  + Embroidery Artwork). Past bugs included the wrong canvas elements being
  embedded on the wrong page, missing form pages, etc.
- **Recommended template:** Applique Badge (any size, e.g. 100×70mm)
- **Expected output:** Output PDF has badge artwork page, embroidery page, and
  the applique specification form page. Element placement matches each canvas.

### `09_applique-with-embroidery_GRUB-APPLIQUE.pdf`
- **Source:** `attached_assets/grub_qty10_applique_(1)_1770645514384.pdf`
- **Bug history:** Variant of #8 that previously triggered an issue where the
  embroidery preview image wasn't included on the form page.
- **Recommended template:** Applique Badge with embroidery
- **Expected output:** Form page includes the embroidery preview thumbnail.

### `10_applique-100x70_BUI-TESTER.pdf`
- **Source:** `attached_assets/SO86115_-_[ABW1070]_Applique_Badge_-_100_x_70mm_bui_tester_qty_1771596166709.pdf`
- **Bug history:** Specifically a 100×70mm applique badge — past Waterford-like
  bug where small artwork on a slightly-rotated template page caused
  full-page-match misdetection and clipping.
- **Recommended template:** Applique Badge 100×70mm
- **Expected output:** No clipping. Artwork centered to canvas placement.

### `11_dtf-passthrough-SRA3_HAIR.pdf`
- **Source:** `attached_assets/SO87522_-[DTFA3]_DTF_Transfer_SRA3_320_x_450_mm_-_(HAIR)_HB157_1774420232633.pdf`
- **Bug history:** DTF passthrough mode — when a single PDF logo is placed on a
  DTF template, the original PDF is compressed with Ghostscript and served
  almost verbatim. Past regression: kandersteg DTF showed the full sheet
  background instead of just the artwork; also "wrong logo embedded" bug.
- **Recommended template:** DTF Transfer SRA3 (320×450mm)
- **Expected output:** Output is essentially the source PDF with the canvas
  screenshot appended. No full-sheet background, no wrong logo.

### `12_dtf-large-art_SEACHTAIN-GAEILGE.pdf`
- **Source:** `attached_assets/SEACHTAIN_NA_GAEILGE_2_CT_DTF_ART_1772464208599.pdf`
- **Bug history:** Large DTF artwork (~35MB). Tests memory pressure handling
  and the smart DPI system. In dev sandbox this should not OOM; in production
  (8 GiB) this should generate cleanly.
- **Recommended template:** DTF Transfer Metre or DTF SRA3
- **Expected output:** Generation succeeds without OOM. Production PDF
  contains the original artwork at full quality.

---

## Fixtures NOT included in this folder (too large)

Reference these by path in the repo when running manual tests:

- **`attached_assets/260424_-_Vespa_Rose_1777020276818.pdf`** (92 MB) — large
  CMYK PDF that historically caused `pdf2svg` SIGKILL in the dev sandbox. Tests
  the smart DPI system + production memory headroom (`--max-old-space-size=4096`).
  In dev: expect the operation guard to reject with a clear "memory pressure"
  message. In production: should complete successfully.
- **`attached_assets/SO84884_-_[DTFM1]_DTF_Transfer_Metre_(KFAC0205)_3_x_Collab_Fit_1770984456248.pdf`**
  (28 MB) — large DTF metre transfer. Tests chunked upload + DTF passthrough
  performance.

---

## How the automated test runner uses these

For each fixture above, the runner (`tests/pdf-regression.test.ts`) will:

1. POST the PDF to `/api/logos` to upload it.
2. Create a project on the recommended template via `/api/projects`.
3. Place the logo on canvas at known coordinates via `/api/canvas-elements`.
4. POST to `/api/projects/:id/generate-pdf` to render the output.
5. Use `pdf-lib` to inspect the result and assert:
   - Correct page count
   - Correct page dimensions (orientation)
   - Content bounding box near the expected position
   - For "outlined fonts" cases: no live text in any page

Failure stops the deploy with a clear "fixture X regressed" message.
