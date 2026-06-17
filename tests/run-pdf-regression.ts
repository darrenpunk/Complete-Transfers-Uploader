#!/usr/bin/env tsx
/**
 * PDF regression test runner.
 *
 * Walks every fixture in tests/pdf-fixtures/fixtures.json (where enabled=true),
 * uploads it to the running dev server, places it on canvas, generates the
 * production PDF, and asserts the output has the expected shape. Saves every
 * generated PDF to tests/pdf-fixtures/output/<id>.pdf so you can inspect a
 * failure by eye.
 *
 * Usage:
 *   npx tsx tests/run-pdf-regression.ts                   # run all enabled
 *   npx tsx tests/run-pdf-regression.ts --only=teddy      # filter by id substring
 *   PDF_REGRESSION_BASE_URL=https://prod.example.com \
 *     npx tsx tests/run-pdf-regression.ts                 # run against another env
 *
 * Exit code: 0 if all enabled fixtures pass, 1 if any fail, 2 on infra error.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);

const MM_TO_PT = 2.834645669;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'pdf-fixtures');
const OUTPUT_DIR = join(FIXTURES_DIR, 'output');
const BASE_URL = (process.env.PDF_REGRESSION_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const PDF_GEN_TIMEOUT_MS = 120_000;
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
/**
 * Heavy fixtures (very large uploads) are skipped by default in the 384MB dev
 * sandbox to avoid OOM. Include them with PDF_REGRESSION_INCLUDE_HEAVY=1 or when
 * running against a non-localhost (production-sized) base URL.
 */
const INCLUDE_HEAVY =
  process.env.PDF_REGRESSION_INCLUDE_HEAVY === '1' || !/(localhost|127\.0\.0\.1)/.test(BASE_URL);

interface PlaceExplicit { x: number; y: number; widthMm: number; heightMm: number; }
interface PlaceObject {
  mode?: 'fit-to-content' | 'fit-to-template';
  rotation?: number;
  capToTemplate?: boolean;
  x?: number;
  y?: number;
  widthMm?: number;
  heightMm?: number;
}
type PlaceMode = 'fit-to-content' | 'fit-to-template' | PlaceExplicit | PlaceObject;

interface ContentBboxAssertion {
  minWidthMm?: number;
  minHeightMm?: number;
  maxWidthMm?: number;
  maxHeightMm?: number;
  note?: string;
}

interface Assertions {
  minPages?: number;
  maxPages?: number;
  page1WidthPt?: number;
  page1HeightPt?: number;
  tolerancePt?: number;
  contentBboxMm?: ContentBboxAssertion;
  /** Assert the uploaded artwork bounds (logo.originalWidth/Height, mm). */
  uploadBoundsMm?: { minWidthMm?: number; maxWidthMm?: number; minHeightMm?: number; maxHeightMm?: number };
  /** Assert the uploaded bounds aspect ratio (originalWidth / originalHeight). */
  boundsAspect?: { min?: number; max?: number };
  /**
   * If true, assert the canvas-fallback PNG aspect matches the upload bounds
   * aspect. Catches the "full-page fallback squished into cropped element"
   * regression. No-ops when the logo has no canvasFallbackFilename (i.e. it
   * renders via the tight-content SVG, not a PNG fallback).
   */
  checkFallbackAspect?: boolean;
  /** Relative tolerance for checkFallbackAspect (default 0.03 = 3%). */
  fallbackAspectTolerance?: number;
  note?: string;
}

interface Fixture {
  id: string;
  file: string;
  templateId: string;
  garmentColor: string;
  place: PlaceMode;
  enabled: boolean;
  /**
   * If true, after upload the runner POSTs to
   * `/api/logos/:id/outline-fonts` to convert text→paths in the SVG before
   * placing on canvas. Only meaningful when the upload was converted to SVG;
   * silently skipped otherwise (logged so failures are visible).
   */
  outlineFonts?: boolean;
  /**
   * Heavy fixtures (very large uploads) are skipped by default because the
   * 384MB dev sandbox can OOM on them. Include them with
   * PDF_REGRESSION_INCLUDE_HEAVY=1 or by pointing PDF_REGRESSION_BASE_URL at a
   * non-localhost (production-sized) instance.
   */
  heavy?: boolean;
  /** Optional imposition grid to apply to the placed element before generating. */
  imposition?: { rows: number; columns: number; horizontalSpacing?: number; verticalSpacing?: number; centerOnCanvas?: boolean };
  /**
   * Applique dual-canvas setup. When present the runner also places the logo on
   * canvasIndex 1 (embroidery) and sets project.appliqueBadgesForm so the
   * generator emits the badge + embroidery + spec-form pages.
   */
  applique?: { form: Record<string, unknown>; embroidery?: boolean };
  assertions: Assertions;
}

interface TemplateSize {
  id: string;
  name: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
}

interface Logo {
  id: string;
  originalWidth?: number | null;
  originalHeight?: number | null;
  width?: number | null;
  height?: number | null;
  /** PNG written when a PDF upload can't be rendered as a tight-content SVG. */
  canvasFallbackFilename?: string | null;
  /** Raw artwork bounds captured at upload time (pt). */
  originalPdfBounds?: {
    width?: number;
    height?: number;
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    units?: string;
  } | null;
}

interface Result {
  id: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  messages: string[];
  outputPath?: string;
}

async function loadFixtures(): Promise<Fixture[]> {
  const raw = await readFile(join(FIXTURES_DIR, 'fixtures.json'), 'utf8');
  const manifest = JSON.parse(raw) as { fixtures: Fixture[] };
  return manifest.fixtures;
}

async function getTemplate(templateId: string): Promise<TemplateSize> {
  const resp = await fetch(`${BASE_URL}/api/template-sizes`);
  if (!resp.ok) throw new Error(`GET /api/template-sizes -> ${resp.status}`);
  const list = (await resp.json()) as TemplateSize[];
  const t = list.find((x) => x.id === templateId);
  if (!t) throw new Error(`template id "${templateId}" not in /api/template-sizes`);
  return t;
}

async function createProject(name: string, templateId: string, garmentColor: string): Promise<{ id: string }> {
  const resp = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      templateSize: templateId,
      garmentColor,
      quantity: 1,
      status: 'draft',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`POST /api/projects -> ${resp.status} ${body.slice(0, 300)}`);
  }
  return (await resp.json()) as { id: string };
}

async function uploadLogo(projectId: string, filePath: string, fileName: string): Promise<Logo> {
  const fileBuffer = await readFile(filePath);
  const fd = new FormData();
  fd.append('files', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);
  const resp = await fetch(`${BASE_URL}/api/projects/${projectId}/logos`, {
    method: 'POST',
    body: fd,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`POST /api/projects/${projectId}/logos -> ${resp.status} ${body.slice(0, 500)}`);
  }
  const data = await resp.json();
  const arr: Logo[] = Array.isArray(data) ? data : data.logos || [];
  if (arr.length === 0) throw new Error('upload returned empty logo list');
  return arr[0];
}

/**
 * Trigger the manual font-outline pass on a freshly uploaded logo. Mirrors
 * the customer-facing "Outline Fonts" button. The endpoint only operates on
 * SVG mime types, so for raster/PNG-fallback uploads we surface a
 * 'not-applicable' note instead of failing.
 *
 * Returns a short status string for the test log.
 */
async function outlineLogoFonts(logoId: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/logos/${logoId}/outline-fonts`, { method: 'POST' });
  const text = await resp.text().catch(() => '');
  if (resp.ok) {
    try {
      const j = JSON.parse(text);
      return `outline-fonts ok (${j.message || j.fontsOutlined ? 'outlined' : 'no text'})`;
    } catch {
      return 'outline-fonts ok';
    }
  }
  // Non-2xx: treat 'only available for SVG' as a soft skip so a PNG-fallback
  // upload doesn't fail the whole fixture.
  if (resp.status === 400 && /only available for SVG/i.test(text)) {
    return 'outline-fonts skipped (logo is not SVG — likely PNG-fallback after complex-vector detection)';
  }
  throw new Error(`POST /api/logos/${logoId}/outline-fonts -> ${resp.status} ${text.slice(0, 300)}`);
}

async function placeElement(projectId: string, logo: Logo, fixture: Fixture, template: TemplateSize, canvasIndex = 0) {
  // Resolve placement options. fixture.place can be a shorthand string,
  // an explicit {x,y,widthMm,heightMm}, or a richer {mode,rotation,...} object.
  let mode: 'fit-to-content' | 'fit-to-template' = 'fit-to-content';
  let rotation = 0;
  let capToTemplate = true;
  let explicitX: number | undefined;
  let explicitY: number | undefined;
  let explicitW: number | undefined;
  let explicitH: number | undefined;
  if (typeof fixture.place === 'string') {
    mode = fixture.place;
  } else if ('widthMm' in fixture.place && 'x' in fixture.place && fixture.place.x !== undefined) {
    explicitX = (fixture.place as PlaceExplicit).x;
    explicitY = (fixture.place as PlaceExplicit).y;
    explicitW = (fixture.place as PlaceExplicit).widthMm;
    explicitH = (fixture.place as PlaceExplicit).heightMm;
  } else {
    const p = fixture.place as PlaceObject;
    mode = p.mode ?? 'fit-to-content';
    rotation = p.rotation ?? 0;
    capToTemplate = p.capToTemplate !== false;
    explicitW = p.widthMm;
    explicitH = p.heightMm;
    explicitX = p.x;
    explicitY = p.y;
  }

  let widthMm: number;
  let heightMm: number;
  if (explicitW !== undefined && explicitH !== undefined) {
    widthMm = explicitW;
    heightMm = explicitH;
  } else if (mode === 'fit-to-template') {
    widthMm = template.width;
    heightMm = template.height;
  } else {
    widthMm = logo.originalWidth ?? template.width;
    heightMm = logo.originalHeight ?? template.height;
  }

  // For rotation, the canvas element box is in pre-rotation space — width is
  // along the artwork's own X axis. The rendered footprint is bounded by the
  // rotated bbox, so cap based on the rotated footprint.
  if (capToTemplate) {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const footprintW = widthMm * cos + heightMm * sin;
    const footprintH = widthMm * sin + heightMm * cos;
    const scaleW = footprintW > template.width ? template.width / footprintW : 1;
    const scaleH = footprintH > template.height ? template.height / footprintH : 1;
    const scale = Math.min(scaleW, scaleH);
    if (scale < 1) {
      widthMm *= scale;
      heightMm *= scale;
    }
  }

  const widthPx = widthMm * MM_TO_PT;
  const heightPx = heightMm * MM_TO_PT;
  const x = explicitX !== undefined ? explicitX : (template.pixelWidth - widthPx) / 2;
  const y = explicitY !== undefined ? explicitY : (template.pixelHeight - heightPx) / 2;
  const resp = await fetch(`${BASE_URL}/api/projects/${projectId}/canvas-elements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      logoId: logo.id,
      elementType: 'logo',
      x,
      y,
      width: widthPx,
      height: heightPx,
      rotation,
      zIndex: 0,
      isVisible: true,
      isLocked: false,
      canvasIndex,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`POST canvas-elements -> ${resp.status} ${body.slice(0, 300)}`);
  }
  const created = await resp.json().catch(() => ({} as any));
  return { elementId: created?.id as string | undefined, widthMm, heightMm, widthPx, heightPx, x, y, rotation };
}

/**
 * Replicate a placed canvas element into a rows×columns grid via the Imposition
 * tool. Mirrors the customer-facing "Imposition" action.
 */
async function applyImposition(
  elementId: string,
  imp: NonNullable<Fixture['imposition']>,
): Promise<{ totalElements?: number; newElements?: number }> {
  const resp = await fetch(`${BASE_URL}/api/canvas-elements/${elementId}/imposition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: imp.rows,
      columns: imp.columns,
      horizontalSpacing: imp.horizontalSpacing ?? 0,
      verticalSpacing: imp.verticalSpacing ?? 0,
      centerOnCanvas: imp.centerOnCanvas ?? true,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`POST imposition -> ${resp.status} ${body.slice(0, 300)}`);
  }
  return (await resp.json().catch(() => ({}))) as { totalElements?: number; newElements?: number };
}

/** PATCH arbitrary fields onto a project (used to set appliqueBadgesForm). */
async function patchProject(projectId: string, fields: Record<string, unknown>): Promise<void> {
  const resp = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`PATCH /api/projects/${projectId} -> ${resp.status} ${body.slice(0, 300)}`);
  }
}

async function generatePdf(projectId: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PDF_GEN_TIMEOUT_MS);
  try {
    const resp = await fetch(`${BASE_URL}/api/projects/${projectId}/generate-pdf`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`GET generate-pdf -> ${resp.status} ${body.slice(0, 500)}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 100 || !buf.subarray(0, 4).toString('binary').startsWith('%PDF')) {
      throw new Error(`generate-pdf returned non-PDF response (${buf.length} bytes)`);
    }
    return buf;
  } finally {
    clearTimeout(t);
  }
}

async function getContentBboxMm(pdfPath: string): Promise<{ widthMm: number; heightMm: number } | null> {
  try {
    const { stderr } = await execFileAsync('gs', [
      '-q',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=bbox',
      '-dFirstPage=1',
      '-dLastPage=1',
      pdfPath,
    ]);
    // gs writes both "%%BoundingBox: x0 y0 x1 y1" (integer) and
    // "%%HiResBoundingBox: x0 y0 x1 y1" (decimal) to stderr. Prefer hi-res.
    const hi = stderr.match(/%%HiResBoundingBox:\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/);
    const lo = stderr.match(/%%BoundingBox:\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)/);
    const m = hi || lo;
    if (!m) return null;
    const x0 = parseFloat(m[1]);
    const y0 = parseFloat(m[2]);
    const x1 = parseFloat(m[3]);
    const y1 = parseFloat(m[4]);
    const widthPt = x1 - x0;
    const heightPt = y1 - y0;
    if (widthPt <= 0 || heightPt <= 0) return null;
    return { widthMm: widthPt / MM_TO_PT, heightMm: heightPt / MM_TO_PT };
  } catch {
    return null;
  }
}

/**
 * Aspect ratio (w/h) of an image in uploads/ via ImageMagick `identify`.
 * Used to verify the canvas-fallback PNG isn't a squished full-page render.
 * Returns null if the file is missing or identify fails (e.g. running against a
 * remote base URL where uploads/ isn't local).
 */
async function getPngAspect(fileName: string): Promise<number | null> {
  try {
    const p = join(UPLOADS_DIR, fileName);
    const { stdout } = await execFileAsync('identify', ['-format', '%w %h\n', `${p}[0]`]);
    const first = stdout.trim().split('\n')[0] || '';
    const [w, h] = first.trim().split(/\s+/).map(Number);
    if (!w || !h) return null;
    return w / h;
  } catch {
    return null;
  }
}

async function runFixture(f: Fixture): Promise<Result> {
  const start = Date.now();
  const messages: string[] = [];
  if (!f.enabled) {
    return { id: f.id, status: 'skip', durationMs: 0, messages: ['disabled in fixtures.json'] };
  }
  if (f.heavy && !INCLUDE_HEAVY) {
    return {
      id: f.id,
      status: 'skip',
      durationMs: 0,
      messages: ['heavy fixture — set PDF_REGRESSION_INCLUDE_HEAVY=1 or point PDF_REGRESSION_BASE_URL at a production-sized instance'],
    };
  }
  try {
    const fixturePath = join(FIXTURES_DIR, f.file);
    await readFile(fixturePath);

    const template = await getTemplate(f.templateId);
    messages.push(`template: ${template.name} (${template.width}x${template.height}mm, ${template.pixelWidth}x${template.pixelHeight}pt)`);

    const project = await createProject(`regression-${f.id}-${Date.now()}`, f.templateId, f.garmentColor);
    messages.push(`project: ${project.id}`);

    const logo = await uploadLogo(project.id, fixturePath, f.file);
    messages.push(`logo: ${logo.id} (originalWxH=${logo.originalWidth ?? '?'}x${logo.originalHeight ?? '?'}mm, normalised=${logo.width ?? '?'}x${logo.height ?? '?'}mm)`);

    if (f.outlineFonts) {
      const outlineStatus = await outlineLogoFonts(logo.id);
      messages.push(outlineStatus);
    }

    const placement = await placeElement(project.id, logo, f, template);
    messages.push(`placed: ${placement.widthMm.toFixed(1)}x${placement.heightMm.toFixed(1)}mm at canvas (${placement.x.toFixed(0)}, ${placement.y.toFixed(0)})pt rotation=${placement.rotation}°`);

    // Imposition: replicate the placed element into a grid before generating.
    if (f.imposition) {
      if (!placement.elementId) throw new Error('imposition requested but canvas-elements POST returned no element id');
      const imp = await applyImposition(placement.elementId, f.imposition);
      messages.push(`imposition: ${f.imposition.rows}x${f.imposition.columns} grid → ${imp.totalElements ?? '?'} total element(s)`);
    }

    // Applique: mark the project as applique by attaching the badges spec form,
    // which makes generate-pdf append the applique specification page on top of
    // the badge artwork pages. Only the "with embroidery" variant additionally
    // mirrors the logo onto the embroidery canvas (index 1).
    if (f.applique) {
      await patchProject(project.id, { appliqueBadgesForm: f.applique.form });
      if (f.applique.embroidery) {
        await placeElement(project.id, logo, f, template, 1);
        messages.push('applique: set appliqueBadgesForm + mirrored logo onto embroidery canvas (index 1)');
      } else {
        messages.push('applique: set appliqueBadgesForm (badge-only)');
      }
    }

    const pdfBuf = await generatePdf(project.id);
    const outputPath = join(OUTPUT_DIR, `${f.id}.pdf`);
    await writeFile(outputPath, pdfBuf);
    messages.push(`output: ${outputPath} (${(pdfBuf.length / 1024).toFixed(0)}kb)`);

    const pdf = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
    const pages = pdf.getPages();
    const page1 = pages[0];
    const { width: w, height: h } = page1.getSize();
    messages.push(`page1: ${w.toFixed(1)}x${h.toFixed(1)}pt, ${pages.length} page(s)`);

    const a = f.assertions;
    const tol = a.tolerancePt ?? 4;
    const failures: string[] = [];

    if (typeof a.minPages === 'number' && pages.length < a.minPages) {
      failures.push(`pages ${pages.length} < min ${a.minPages}`);
    }
    if (typeof a.maxPages === 'number' && pages.length > a.maxPages) {
      failures.push(`pages ${pages.length} > max ${a.maxPages} — extra page regression (full-sheet bg / duplicate)?`);
    }
    if (typeof a.page1WidthPt === 'number' && Math.abs(w - a.page1WidthPt) > tol) {
      failures.push(`page1 width ${w.toFixed(1)}pt != expected ${a.page1WidthPt}pt (tolerance ${tol}pt) — orientation regression?`);
    }
    if (typeof a.page1HeightPt === 'number' && Math.abs(h - a.page1HeightPt) > tol) {
      failures.push(`page1 height ${h.toFixed(1)}pt != expected ${a.page1HeightPt}pt (tolerance ${tol}pt) — orientation regression?`);
    }
    if (a.contentBboxMm) {
      const bbox = await getContentBboxMm(outputPath);
      if (!bbox) {
        failures.push('content bbox extraction failed (ghostscript bbox device)');
      } else {
        messages.push(`content bbox: ${bbox.widthMm.toFixed(1)}x${bbox.heightMm.toFixed(1)}mm`);
        const c = a.contentBboxMm;
        if (typeof c.minWidthMm === 'number' && bbox.widthMm < c.minWidthMm) {
          failures.push(`content width ${bbox.widthMm.toFixed(1)}mm < min ${c.minWidthMm}mm — artwork scaled down regression?`);
        }
        if (typeof c.minHeightMm === 'number' && bbox.heightMm < c.minHeightMm) {
          failures.push(`content height ${bbox.heightMm.toFixed(1)}mm < min ${c.minHeightMm}mm — artwork scaled down regression?`);
        }
        if (typeof c.maxWidthMm === 'number' && bbox.widthMm > c.maxWidthMm) {
          failures.push(`content width ${bbox.widthMm.toFixed(1)}mm > max ${c.maxWidthMm}mm`);
        }
        if (typeof c.maxHeightMm === 'number' && bbox.heightMm > c.maxHeightMm) {
          failures.push(`content height ${bbox.heightMm.toFixed(1)}mm > max ${c.maxHeightMm}mm`);
        }
      }
    }

    // --- Upload-time assertions (artwork bounds + canvas-fallback aspect) ---
    const bw = typeof logo.originalWidth === 'number' ? logo.originalWidth : null;
    const bh = typeof logo.originalHeight === 'number' ? logo.originalHeight : null;
    if (a.uploadBoundsMm) {
      const ub = a.uploadBoundsMm;
      if (bw == null || bh == null) {
        failures.push('uploadBoundsMm asserted but logo has no originalWidth/Height');
      } else {
        if (typeof ub.minWidthMm === 'number' && bw < ub.minWidthMm) failures.push(`upload bounds width ${bw.toFixed(1)}mm < min ${ub.minWidthMm}mm`);
        if (typeof ub.maxWidthMm === 'number' && bw > ub.maxWidthMm) failures.push(`upload bounds width ${bw.toFixed(1)}mm > max ${ub.maxWidthMm}mm`);
        if (typeof ub.minHeightMm === 'number' && bh < ub.minHeightMm) failures.push(`upload bounds height ${bh.toFixed(1)}mm < min ${ub.minHeightMm}mm`);
        if (typeof ub.maxHeightMm === 'number' && bh > ub.maxHeightMm) failures.push(`upload bounds height ${bh.toFixed(1)}mm > max ${ub.maxHeightMm}mm`);
      }
    }
    if (a.boundsAspect) {
      if (bw == null || bh == null || bh === 0) {
        failures.push('boundsAspect asserted but logo has no usable originalWidth/Height');
      } else {
        const asp = bw / bh;
        messages.push(`bounds aspect: ${asp.toFixed(3)}`);
        if (typeof a.boundsAspect.min === 'number' && asp < a.boundsAspect.min) failures.push(`bounds aspect ${asp.toFixed(3)} < min ${a.boundsAspect.min}`);
        if (typeof a.boundsAspect.max === 'number' && asp > a.boundsAspect.max) failures.push(`bounds aspect ${asp.toFixed(3)} > max ${a.boundsAspect.max}`);
      }
    }
    if (a.checkFallbackAspect) {
      if (!logo.canvasFallbackFilename) {
        messages.push('checkFallbackAspect: logo has no canvasFallbackFilename (renders via SVG) — skipped');
      } else if (bw == null || bh == null || bh === 0) {
        failures.push('checkFallbackAspect asserted but no usable bounds aspect to compare against');
      } else {
        const fa = await getPngAspect(logo.canvasFallbackFilename);
        if (fa == null) {
          messages.push(`checkFallbackAspect: could not read fallback PNG ${logo.canvasFallbackFilename} (remote base URL?) — skipped`);
        } else {
          const boundsAsp = bw / bh;
          const tolRel = a.fallbackAspectTolerance ?? 0.03;
          const rel = Math.abs(fa - boundsAsp) / boundsAsp;
          messages.push(`fallback aspect: ${fa.toFixed(3)} vs bounds ${boundsAsp.toFixed(3)} (rel ${(rel * 100).toFixed(1)}%, tol ${(tolRel * 100).toFixed(0)}%)`);
          if (rel > tolRel) {
            failures.push(`canvas-fallback PNG aspect ${fa.toFixed(3)} != bounds aspect ${boundsAsp.toFixed(3)} (off ${(rel * 100).toFixed(1)}% > ${(tolRel * 100).toFixed(0)}%) — full-page-fallback squish regression?`);
          }
        }
      }
    }

    const durationMs = Date.now() - start;
    if (failures.length) {
      return {
        id: f.id,
        status: 'fail',
        durationMs,
        messages: [...messages, ...failures.map((x) => `FAIL: ${x}`)],
        outputPath,
      };
    }
    return { id: f.id, status: 'pass', durationMs, messages, outputPath };
  } catch (err: any) {
    return {
      id: f.id,
      status: 'fail',
      durationMs: Date.now() - start,
      messages: [...messages, `ERROR: ${err?.message || err}`],
    };
  }
}

async function ping(): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/api/template-sizes`);
    return resp.ok;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const onlyArg = process.argv.slice(2).find((a) => a.startsWith('--only='));
  const onlyId = onlyArg ? onlyArg.slice('--only='.length) : null;

  console.log(`\nPDF regression suite`);
  console.log(`  base URL: ${BASE_URL}`);
  if (onlyId) console.log(`  filter:   --only=${onlyId}`);

  // Wait for the server to come up rather than exiting immediately. When this
  // suite runs as its own workflow it can start before `Start application` is
  // ready, which previously surfaced as a spurious "failed" run.
  const waitRetries = Number(process.env.PDF_REGRESSION_WAIT_RETRIES ?? 30);
  let alive = false;
  for (let i = 0; i < waitRetries; i++) {
    alive = await ping();
    if (alive) break;
    if (i === 0) console.log(`  waiting for server at ${BASE_URL} (up to ${waitRetries * 2}s) ...`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!alive) {
    console.error(`\nSERVER NOT REACHABLE at ${BASE_URL} after ${waitRetries * 2}s. Start the dev workflow or set PDF_REGRESSION_BASE_URL.\n`);
    process.exit(2);
  }

  const fixtures = await loadFixtures();
  const filtered = onlyId ? fixtures.filter((f) => f.id.includes(onlyId)) : fixtures;
  if (filtered.length === 0) {
    console.error(`\nNo fixtures matched filter "${onlyId}".\n`);
    process.exit(2);
  }

  const results: Result[] = [];
  for (const f of filtered) {
    process.stdout.write(`\n▶ ${f.id} ... `);
    const r = await runFixture(f);
    console.log(`${r.status.toUpperCase()} (${(r.durationMs / 1000).toFixed(1)}s)`);
    for (const m of r.messages) console.log('    ' + m);
    results.push(r);
  }

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  console.log(`\n=== ${pass} pass, ${fail} fail, ${skip} skip ===\n`);
  if (fail > 0) {
    console.log('Failed fixtures:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`  - ${r.id}${r.outputPath ? ` (output: ${r.outputPath})` : ''}`);
    }
    console.log();
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Runner crashed:', e);
  process.exit(2);
});
