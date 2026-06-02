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
