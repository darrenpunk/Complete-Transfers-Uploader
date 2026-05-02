#!/usr/bin/env tsx
/**
 * Unit tests for the full-page-match analyzer. Pure functions only — no server
 * required. Locks the behaviour expected by every customer-reported bug fix in
 * the orientation/scaling family (teddy / Waterford / Roadstone / BEM / MTSG).
 *
 * Run:  npx tsx tests/full-page-match.test.ts
 */

import { strict as assert } from 'node:assert';
import {
  analyzeFullPageMatch,
  DEFAULT_DIMENSION_TOLERANCE_PT,
  FULL_PAGE_COVERAGE_THRESHOLD,
  FULL_PAGE_MARGIN_PCT_THRESHOLD,
} from '../server/full-page-match';

const MM_TO_PT = 2.834645669;
const mm = (n: number) => n * MM_TO_PT;

interface Case {
  name: string;
  expect: (out: ReturnType<typeof analyzeFullPageMatch>) => void;
  run: () => ReturnType<typeof analyzeFullPageMatch>;
}

const cases: Case[] = [
  {
    name: '01 teddy: landscape A3 source on portrait A3 template, small centered crest -> NOT full-page, NOT flip',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(420), heightPt: mm(297) },
        { widthPt: mm(297), heightPt: mm(420) },
        // Crest is ~270x274mm centered in a 420x297mm landscape page
        {
          xMin: mm((420 - 270) / 2),
          yMin: mm((297 - 274) / 2),
          xMax: mm((420 + 270) / 2),
          yMax: mm((297 + 274) / 2),
        },
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'rotated', 'should be rotated dimensional match');
      assert.equal(o.isLandscapeSource, true);
      assert.equal(o.isFullPageContent, false, 'small crest must NOT count as full-page content');
      assert.equal(o.shouldFlipToLandscape, false, 'must NOT flip output to landscape (the teddy bug)');
      assert.equal(o.shouldEmbedFullPage, false);
    },
  },
  {
    name: '02 waterford: small inset crest on landscape A3 sheet -> NOT full-page',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(420), heightPt: mm(297) },
        { widthPt: mm(297), heightPt: mm(420) },
        // ~64x65mm crest centered
        {
          xMin: mm((420 - 64) / 2),
          yMin: mm((297 - 65) / 2),
          xMax: mm((420 + 64) / 2),
          yMax: mm((297 + 65) / 2),
        },
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'rotated');
      assert.ok(o.contentCoverage < 0.05, 'tiny crest = tiny coverage');
      assert.equal(o.shouldFlipToLandscape, false);
      assert.equal(o.shouldEmbedFullPage, false);
    },
  },
  {
    name: '03 mtsg-gradient: legitimate full-page landscape A3 -> SHOULD flip to landscape',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(420), heightPt: mm(297) },
        { widthPt: mm(297), heightPt: mm(420) },
        // gradient fills page edge-to-edge, basically zero margins
        { xMin: 0, yMin: 0, xMax: mm(420), yMax: mm(297) },
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'rotated');
      assert.equal(o.isFullPageContent, true);
      assert.equal(o.shouldFlipToLandscape, true, 'real full-page landscape MUST flip (counter-test for teddy fix)');
      assert.equal(o.shouldEmbedFullPage, true);
    },
  },
  {
    name: '13 roadstone: 295x105mm source on 295x100mm template (5mm taller) -> dimensional MISMATCH at default tolerance',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(295), heightPt: mm(105) },
        { widthPt: mm(295), heightPt: mm(100) },
        // 290x57mm content centered in 295x105mm page
        {
          xMin: mm((295 - 290) / 2),
          yMin: mm((105 - 57) / 2),
          xMax: mm((295 + 290) / 2),
          yMax: mm((105 + 57) / 2),
        },
      ),
    expect: (o) => {
      // 5mm = 14.17pt > default 10pt tolerance, so NOT a dimensional match
      assert.equal(o.dimensionalMatch, 'none', 'Roadstone is just outside default tolerance — must NOT be classed as full-page');
      assert.equal(o.shouldEmbedFullPage, false, 'this is the Roadstone fix: do not embed full source page');
    },
  },
  {
    name: '14 BEM: landscape A5 source (210x148) on portrait A5 template (148x210), ~204x98mm content -> dimensional rotated match but content NOT full-page',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(210), heightPt: mm(148) },
        { widthPt: mm(148), heightPt: mm(210) },
        // 204.9x98.5mm content centered
        {
          xMin: mm((210 - 204.9) / 2),
          yMin: mm((148 - 98.5) / 2),
          xMax: mm((210 + 204.9) / 2),
          yMax: mm((148 + 98.5) / 2),
        },
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'rotated', 'A5 page rotated does match A5 template');
      // 204.9*98.5 / (210*148) = ~65% coverage (below 85% threshold)
      assert.ok(o.contentCoverage < FULL_PAGE_COVERAGE_THRESHOLD, `coverage ${(o.contentCoverage*100).toFixed(0)}% must fail full-page test`);
      assert.equal(o.isFullPageContent, false);
      assert.equal(o.shouldEmbedFullPage, false, 'this is the BEM fix: do not embed full source page');
      assert.equal(o.shouldFlipToLandscape, false);
    },
  },
  {
    name: 'true full-page direct match: A3 source on A3 template, content fills page -> shouldEmbedFullPage',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(297), heightPt: mm(420) },
        { widthPt: mm(297), heightPt: mm(420) },
        { xMin: mm(2), yMin: mm(2), xMax: mm(295), yMax: mm(418) },
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'direct');
      assert.equal(o.isFullPageContent, true);
      assert.equal(o.shouldEmbedFullPage, true);
      assert.equal(o.shouldFlipToLandscape, false, 'direct match never flips orientation');
    },
  },
  {
    name: 'no content bounds available -> conservatively NOT full-page',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(297), heightPt: mm(420) },
        { widthPt: mm(297), heightPt: mm(420) },
        null,
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'direct');
      assert.equal(o.hasContentBounds, false);
      assert.equal(o.isFullPageContent, false);
      assert.equal(o.shouldEmbedFullPage, false, 'no bounds = no full-page (this is what fixed the teddy regression)');
      assert.equal(o.shouldFlipToLandscape, false);
    },
  },
  {
    name: 'looser tolerance (14pt) accepts ~3mm differences but rejects exact-5mm Roadstone (matches routes.ts behaviour)',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(295), heightPt: mm(103) }, // 3mm difference
        { widthPt: mm(295), heightPt: mm(100) },
        null,
        14, // matches the ~5mm tolerance used in routes.ts upload path
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'direct', '3mm difference (8.5pt) is within 14pt tolerance');
      assert.equal(o.shouldEmbedFullPage, false, 'no bounds = still not full-page');
    },
  },
  {
    name: 'Roadstone exact-5mm difference still fails even at 14pt tolerance (matches routes.ts < 5mm strict-less-than)',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(295), heightPt: mm(105) },
        { widthPt: mm(295), heightPt: mm(100) },
        null,
        14,
      ),
    expect: (o) => {
      // 5mm = 14.17pt > 14pt tolerance; routes.ts uses `< 5` mm strict-less-than → same answer
      assert.equal(o.dimensionalMatch, 'none', 'Roadstone 5mm difference should NOT match even at 14pt tolerance');
    },
  },
  {
    name: 'square page, square template -> prefers direct match (no flip)',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(200), heightPt: mm(200) },
        { widthPt: mm(200), heightPt: mm(200) },
        { xMin: 0, yMin: 0, xMax: mm(200), yMax: mm(200) },
      ),
    expect: (o) => {
      assert.equal(o.dimensionalMatch, 'direct', 'square should prefer direct over rotated');
      assert.equal(o.shouldFlipToLandscape, false);
    },
  },
  {
    name: 'partial coverage but tight margins on every side -> still NOT full-page (coverage gate)',
    run: () =>
      analyzeFullPageMatch(
        { widthPt: mm(297), heightPt: mm(420) },
        { widthPt: mm(297), heightPt: mm(420) },
        // 80% coverage with thin border — should fail the >85% gate
        { xMin: mm(10), yMin: mm(10), xMax: mm(287), yMax: mm(360) },
      ),
    expect: (o) => {
      assert.ok(
        o.contentCoverage < FULL_PAGE_COVERAGE_THRESHOLD,
        `coverage ${(o.contentCoverage*100).toFixed(0)}% should be below threshold`,
      );
      // margins are within 5% horizontally but the bottom margin is 60mm = 14% — fails margin test too
      assert.ok(o.maxMarginPct > FULL_PAGE_MARGIN_PCT_THRESHOLD);
      assert.equal(o.isFullPageContent, false);
    },
  },
];

let failed = 0;
let passed = 0;
console.log(`\nfull-page-match analyzer — ${cases.length} unit tests\n`);
console.log(`(default dimension tolerance: ${DEFAULT_DIMENSION_TOLERANCE_PT}pt, coverage gate: >${FULL_PAGE_COVERAGE_THRESHOLD * 100}%, margin gate: <${FULL_PAGE_MARGIN_PCT_THRESHOLD * 100}%)\n`);
for (const c of cases) {
  try {
    const out = c.run();
    c.expect(out);
    console.log(`✔ ${c.name}`);
    console.log(`    ${out.reasoning}`);
    passed++;
  } catch (err: any) {
    console.log(`✗ ${c.name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}
console.log(`\n=== ${passed} pass, ${failed} fail ===\n`);
process.exit(failed > 0 ? 1 : 0);
