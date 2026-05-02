/**
 * Full-page match analyzer — single source of truth for "is this source PDF a
 * full-page match for the template?"
 *
 * Three places in the codebase used to make this decision independently with
 * subtly different tolerances and conditions:
 *   - robust-pdf-generator.ts pre-detect (decides whether to flip output to landscape)
 *   - robust-pdf-generator.ts per-element check (decides whether to embed the source
 *     PDF whole vs crop to content bounds)
 *   - routes.ts upload-time complex-file check (decides whether to skip cropping
 *     during upload preprocessing)
 *
 * The duplication directly caused the teddy / Waterford / Roadstone / BEM bug
 * family: each copy disagreed about when a "dimensional" match should also be
 * treated as a "full-page" match, and small/centered artwork on otherwise-empty
 * pages was misclassified as full-page → entire source page was embedded into
 * the canvas-element coordinate frame → artwork shrank or got clipped.
 *
 * This module gives every call site one shared answer derived from two
 * orthogonal signals:
 *   1. Dimensional match:  source page dimensions vs template dimensions
 *      (direct, rotated, or none)
 *   2. Content match:      content actually fills the page (coverage + margins)
 *
 * Each call site applies its own additional guards (single-logo,
 * element rotation, etc.) on top of this analysis.
 */

export interface PageDimensions {
  /** Width in PDF points. */
  widthPt: number;
  /** Height in PDF points. */
  heightPt: number;
}

export interface ContentBounds {
  /** Inkscape/Ghostscript-derived content bounding box, in PDF points. */
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  /** Optional pre-computed width/height (xMax - xMin). */
  width?: number;
  height?: number;
}

/**
 * Default dimensional tolerance: ~3.5 mm. Allows for sub-mm rounding errors
 * between Adobe export and our mm→pt conversion, but tight enough that the
 * 5mm Roadstone-style mismatch (295×105mm source on 295×100mm template) does
 * NOT count as a dimensional match.
 */
export const DEFAULT_DIMENSION_TOLERANCE_PT = 10;

/**
 * Content coverage threshold: artwork content area must occupy at least this
 * fraction of the source page area to count as full-page.
 */
export const FULL_PAGE_COVERAGE_THRESHOLD = 0.85;

/**
 * Per-side margin threshold: every side of the source page must have less than
 * this fraction of empty space around the content. Mirrors the existing per-element
 * check (constant FULLPAGE_MARGIN_PCT in robust-pdf-generator.ts).
 */
export const FULL_PAGE_MARGIN_PCT_THRESHOLD = 0.05;

export type DimensionalMatch = 'none' | 'direct' | 'rotated';

export interface FullPageAnalysis {
  /** Dimensional relationship between source page and template. */
  dimensionalMatch: DimensionalMatch;
  /** True when the caller supplied valid content bounds. */
  hasContentBounds: boolean;
  /** content area / page area, in [0, 1]. 0 if no bounds. */
  contentCoverage: number;
  /** max(side margin / page dimension) across all four sides, in [0, 1]. 1 if no bounds. */
  maxMarginPct: number;
  /** True when content actually fills the page (coverage + margins both pass). */
  isFullPageContent: boolean;
  /** True when source.widthPt > source.heightPt. */
  isLandscapeSource: boolean;
  /**
   * Recommended action for the per-element generator:
   * embed the entire source page into the element rather than cropping to content.
   * True only when both dimensional and content checks pass.
   */
  shouldEmbedFullPage: boolean;
  /**
   * Recommended action for the orientation pre-detect:
   * flip output PDF to landscape orientation. Requires rotated dimensional match,
   * landscape source, AND content actually fills the page. Caller still applies
   * its own single-logo / no-user-rotation guards.
   */
  shouldFlipToLandscape: boolean;
  /** Human-readable reasoning for logs. */
  reasoning: string;
}

/**
 * Single source of truth: is this source PDF a full-page match for the template?
 *
 * @param source   Source PDF first-page dimensions (PDF points).
 * @param template Template dimensions (PDF points).
 * @param bounds   Optional content bounds extracted from the source PDF.
 * @param dimensionTolerancePt Optional override for dimensional match tolerance.
 *                 Defaults to {@link DEFAULT_DIMENSION_TOLERANCE_PT}. The upload-
 *                 time check in routes.ts uses a slightly looser ~14pt (5mm).
 */
export function analyzeFullPageMatch(
  source: PageDimensions,
  template: PageDimensions,
  bounds: ContentBounds | null | undefined,
  dimensionTolerancePt: number = DEFAULT_DIMENSION_TOLERANCE_PT,
): FullPageAnalysis {
  const tol = dimensionTolerancePt;
  const matchesDirect =
    Math.abs(source.widthPt - template.widthPt) < tol &&
    Math.abs(source.heightPt - template.heightPt) < tol;
  const matchesRotated =
    Math.abs(source.widthPt - template.heightPt) < tol &&
    Math.abs(source.heightPt - template.widthPt) < tol;
  // Prefer 'direct' when both match (square pages). Direct match means no rotation
  // is needed, so it's the safer choice for downstream consumers.
  const dimensionalMatch: DimensionalMatch = matchesDirect
    ? 'direct'
    : matchesRotated
      ? 'rotated'
      : 'none';

  const isLandscapeSource = source.widthPt > source.heightPt;

  let hasContentBounds = false;
  let contentCoverage = 0;
  let maxMarginPct = 1;

  if (
    bounds &&
    typeof bounds.xMin === 'number' &&
    typeof bounds.yMin === 'number' &&
    typeof bounds.xMax === 'number' &&
    typeof bounds.yMax === 'number' &&
    source.widthPt > 0 &&
    source.heightPt > 0
  ) {
    const cw = bounds.width ?? bounds.xMax - bounds.xMin;
    const ch = bounds.height ?? bounds.yMax - bounds.yMin;
    if (cw > 0 && ch > 0) {
      hasContentBounds = true;
      contentCoverage = (cw * ch) / (source.widthPt * source.heightPt);
      const marginLeft = bounds.xMin;
      const marginRight = source.widthPt - bounds.xMax;
      const marginBottom = bounds.yMin;
      const marginTop = source.heightPt - bounds.yMax;
      const maxMarginXPct = Math.max(marginLeft, marginRight) / source.widthPt;
      const maxMarginYPct = Math.max(marginTop, marginBottom) / source.heightPt;
      maxMarginPct = Math.max(maxMarginXPct, maxMarginYPct);
    }
  }

  // Conservative content-match decision: requires ALL of:
  //   - bounds available
  //   - content covers >85% of page area
  //   - every side margin is <5% of page dimension
  // Without bounds we cannot prove the content is full-page, so we say no.
  const isFullPageContent =
    hasContentBounds &&
    contentCoverage > FULL_PAGE_COVERAGE_THRESHOLD &&
    maxMarginPct < FULL_PAGE_MARGIN_PCT_THRESHOLD;

  const shouldEmbedFullPage = dimensionalMatch !== 'none' && isFullPageContent;
  const shouldFlipToLandscape =
    dimensionalMatch === 'rotated' && isLandscapeSource && isFullPageContent;

  const reasoning = buildReasoning({
    source,
    template,
    dimensionalMatch,
    hasContentBounds,
    contentCoverage,
    maxMarginPct,
    isFullPageContent,
  });

  return {
    dimensionalMatch,
    hasContentBounds,
    contentCoverage,
    maxMarginPct,
    isFullPageContent,
    isLandscapeSource,
    shouldEmbedFullPage,
    shouldFlipToLandscape,
    reasoning,
  };
}

function buildReasoning(args: {
  source: PageDimensions;
  template: PageDimensions;
  dimensionalMatch: DimensionalMatch;
  hasContentBounds: boolean;
  contentCoverage: number;
  maxMarginPct: number;
  isFullPageContent: boolean;
}): string {
  const { source, template, dimensionalMatch, hasContentBounds, contentCoverage, maxMarginPct, isFullPageContent } = args;
  const dim = `source ${source.widthPt.toFixed(1)}×${source.heightPt.toFixed(1)}pt vs template ${template.widthPt.toFixed(1)}×${template.heightPt.toFixed(1)}pt`;
  if (dimensionalMatch === 'none') {
    return `dimensional MISMATCH (${dim})`;
  }
  if (!hasContentBounds) {
    return `dimensional ${dimensionalMatch.toUpperCase()} match (${dim}) but NO content bounds — conservatively NOT treating as full-page`;
  }
  if (!isFullPageContent) {
    return `dimensional ${dimensionalMatch.toUpperCase()} match (${dim}) but content is INSET (coverage ${(contentCoverage * 100).toFixed(0)}%, max margin ${(maxMarginPct * 100).toFixed(1)}% — full-page requires >85% / <5%)`;
  }
  return `${dimensionalMatch.toUpperCase()} FULL-PAGE match (${dim}, coverage ${(contentCoverage * 100).toFixed(0)}%, max margin ${(maxMarginPct * 100).toFixed(1)}%)`;
}
