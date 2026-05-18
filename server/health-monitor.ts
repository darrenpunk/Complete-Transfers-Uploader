/**
 * Production PDF health monitor.
 *
 * Runs end-to-end PDF generation through the same `RobustPDFGenerator`
 * pipeline that customers use. Two scheduled probes:
 *
 *   1. Light probe — small A6 placeholder PDF, every 15 min. Catches
 *      dependency / path failures (missing binaries, Ghostscript / Inkscape
 *      errors, invalid output, generator regressions).
 *   2. Stress probe — 7.9 MB Rainbow Dog multi-color fixture on A3, every
 *      60 min. Catches scale-sensitive failures (large-input OOM, high-DPI
 *      bitmap pressure, long-running conversions) that the light probe is
 *      too small to surface.
 *
 * Both probes share the same alert path but use independent cooldown
 * channels (light = `light-*`, stress = `stress-*` failureKey prefixes), so
 * a stress-only outage doesn't squelch light alerts and vice versa.
 *
 * On failure each probe persists a crashLogs row and emails an alert via
 * MailerSend. Throttles alerts so a sustained outage produces ~one email
 * per cooldown window per failure type rather than one per failed check.
 *
 * Wiring:
 *   - `server/index.ts` calls `startPdfHealthMonitor()` after startup.
 *     The scheduler is gated on `NODE_ENV === 'production'` unless the env
 *     var `PDF_HEALTH_CHECK_ENABLED=1` is set (used by the admin manual
 *     trigger and for occasional dev verification).
 *   - `server/analytics-routes.ts` exposes:
 *       GET /api/admin/health/pdf          (run light probe now, no email)
 *       GET /api/admin/health/pdf/stress   (run stress probe now, no email)
 *       GET /api/admin/health/pdf/history  (recent pdf-health-*, pdf-stress-* logs)
 *
 * Configuration env (all optional):
 *   PDF_HEALTH_CHECK_INTERVAL_MIN   — light interval, default 15. Min 1.
 *   PDF_STRESS_CHECK_INTERVAL_MIN   — stress interval, default 60. Min 1.
 *   PDF_HEALTH_ALERT_TO             — default darren@serigraf.com.
 *   PDF_HEALTH_ALERT_COOLDOWN_MIN   — default 30. Per-failureKey cooldown.
 *   PDF_HEALTH_CHECK_MAX_RSS_MB     — env-aware default: 350 in dev (small
 *                                     sandbox), 6000 in production (Reserved
 *                                     VM, 8 GiB RAM, leave ~2 GB headroom).
 *                                     Skips the check (without alerting) if
 *                                     container RSS is above this so the
 *                                     probe doesn't make a memory-pressed
 *                                     instance worse. The default must NOT
 *                                     be set so low in production that it
 *                                     skips every check — that would mask
 *                                     real outages with false-healthy
 *                                     "skip" rows.
 */

import fs from 'fs';
import path from 'path';
import { storage } from './storage';
import { sendMail } from './mailersend-client';

const DEFAULT_LIGHT_INTERVAL_MIN = 15;
const DEFAULT_STRESS_INTERVAL_MIN = 60;
const DEFAULT_COOLDOWN_MIN = 30;
// Env-aware default: dev sandbox has ~512MB available, prod Reserved VM has
// 8 GiB. A 350MB threshold in prod would skip almost every check and mask
// outages.
const DEFAULT_MAX_RSS_MB_DEV = 350;
const DEFAULT_MAX_RSS_MB_PROD = 6000;
const DEFAULT_ALERT_TO = 'darren@serigraf.com';

interface ProbeFixture {
  /** Identifier used in log messages and event-type suffixes. */
  kind: 'light' | 'stress';
  /** Friendly label used in alert email body. */
  label: string;
  /** Absolute path on disk to the source PDF used for the probe. */
  sourcePdfPath: string;
  /** Template the synthetic project will be generated against. */
  template: TemplateLike;
  /** Logo dimensions in mm (passed to ProjectData.logos[0]). */
  logoWidthMm: number;
  logoHeightMm: number;
  /** Canvas element placement in mm (top-left origin). */
  elementXMm: number;
  elementYMm: number;
  elementWidthMm: number;
  elementHeightMm: number;
  /** Event-type suffix in crashLogs. e.g. "pdf-health-ok" / "pdf-stress-fail" */
  eventTypePrefix: 'pdf-health' | 'pdf-stress';
  /** Prefix for failureKey so cooldown channels are independent per probe. */
  alertKeyPrefix: 'light' | 'stress';
  /** Minimum acceptable output buffer size to consider the probe valid. */
  minOutputBytes: number;
}

interface TemplateLike {
  id: string;
  name: string;
  label: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  group: string;
  description: string;
  placeholderImage: string | null;
  productCode: string;
}

const TEMPLATE_A6: TemplateLike = {
  id: 'template-A6',
  name: 'A6',
  label: 'A6',
  width: 148,
  height: 105,
  pixelWidth: 420,
  pixelHeight: 298,
  group: 'Screen Printed Transfers',
  description: 'Health probe',
  placeholderImage: null,
  productCode: 'CTCCA6',
};

const TEMPLATE_A3: TemplateLike = {
  id: 'template-A3',
  name: 'A3',
  label: 'A3',
  width: 297,
  height: 420,
  pixelWidth: 842,
  pixelHeight: 1191,
  group: 'Screen Printed Transfers',
  description: 'Stress probe',
  placeholderImage: null,
  productCode: 'CTCCA3',
};

const LIGHT_FIXTURE: ProbeFixture = {
  kind: 'light',
  label: 'A6 placeholder (small, fast — catches dependency / path failures)',
  sourcePdfPath: path.join(process.cwd(), 'server/placeholders/A6 Placeholder.pdf'),
  template: TEMPLATE_A6,
  logoWidthMm: 100,
  logoHeightMm: 70,
  elementXMm: 24,
  elementYMm: 17.5,
  elementWidthMm: 100,
  elementHeightMm: 70,
  eventTypePrefix: 'pdf-health',
  alertKeyPrefix: 'light',
  minOutputBytes: 1000,
};

const STRESS_FIXTURE: ProbeFixture = {
  kind: 'stress',
  label: 'Rainbow Dog 7.9 MB on A3 (catches OOM, ghostscript timeout, large-bitmap failures)',
  sourcePdfPath: path.join(process.cwd(), 'server/placeholders/stress-probe-rainbow-dog.pdf'),
  template: TEMPLATE_A3,
  logoWidthMm: 200,
  logoHeightMm: 280,
  elementXMm: 48,
  elementYMm: 70,
  elementWidthMm: 200,
  elementHeightMm: 280,
  eventTypePrefix: 'pdf-stress',
  alertKeyPrefix: 'stress',
  minOutputBytes: 5000, // 7.9MB source → output is at minimum tens of KB
};

export interface HealthCheckResult {
  ok: boolean;
  durationMs: number;
  outputBytes?: number;
  failureKey?: string;
  errorMessage?: string;
  skipped?: boolean;
  skipReason?: string;
  probe?: 'light' | 'stress' | 'upload';
}

const DEFAULT_UPLOAD_INTERVAL_MIN = 30;

const lastAlertSentAt = new Map<string, number>();
const lastSuccessAt: Record<'light' | 'stress' | 'upload', number | null> = { light: null, stress: null, upload: null };
let lightTimer: NodeJS.Timeout | null = null;
let stressTimer: NodeJS.Timeout | null = null;
let uploadTimer: NodeJS.Timeout | null = null;
let firstLightTimer: NodeJS.Timeout | null = null;
let firstStressTimer: NodeJS.Timeout | null = null;
let firstUploadTimer: NodeJS.Timeout | null = null;
// Mutex per probe kind: collapse concurrent invocations onto a single in-flight
// run so the scheduler firing while a slow check is running (or an admin
// manually poking the endpoint mid-cycle) does not double-spend memory or —
// more importantly — bypass the per-failureKey alert cooldown by racing two
// failures past the lastAlertSentAt check before either has updated it.
// Light and stress have independent mutexes because they exercise different
// code paths and there's no benefit to serializing them with each other.
const inFlight: Record<'light' | 'stress' | 'upload', Promise<HealthCheckResult> | null> = { light: null, stress: null, upload: null };

/**
 * Run the small / fast light probe (A6 placeholder). Always persists a
 * crashLogs row (eventType `pdf-health-ok` or `pdf-health-fail`). When
 * `sendAlertOnFailure` is true (the default for the scheduler), failures
 * also trigger a throttled MailerSend email.
 */
export async function runPdfHealthCheck(opts: { sendAlertOnFailure?: boolean } = {}): Promise<HealthCheckResult> {
  return runProbe(LIGHT_FIXTURE, opts);
}

/**
 * Run the larger / slower stress probe (Rainbow Dog 7.9 MB on A3). Same
 * persistence + alerting semantics as the light probe but with independent
 * cooldown channel and event types.
 */
export async function runPdfStressCheck(opts: { sendAlertOnFailure?: boolean } = {}): Promise<HealthCheckResult> {
  return runProbe(STRESS_FIXTURE, opts);
}

/**
 * Run the upload pipeline probe. Makes an HTTP multipart POST to the real
 * upload endpoint, exercising the full conversion pipeline:
 *   multer → file I/O → Ghostscript bbox → pdf2svg/Inkscape → rsvg-convert PNG
 * Catches binary dependency failures, filesystem permission issues, and
 * conversion regressions that the in-process PDF generation probes miss.
 */
export async function runUploadHealthCheck(opts: { sendAlertOnFailure?: boolean } = {}): Promise<HealthCheckResult> {
  const existing = inFlight.upload;
  if (existing) return existing;
  const promise = doRunUploadProbe(opts).finally(() => { inFlight.upload = null; });
  inFlight.upload = promise;
  return promise;
}

async function runProbe(fixture: ProbeFixture, opts: { sendAlertOnFailure?: boolean }): Promise<HealthCheckResult> {
  // Collapse concurrent calls onto a single probe (per kind).
  const existing = inFlight[fixture.kind];
  if (existing) return existing;
  const promise = doRunProbe(fixture, opts).finally(() => { inFlight[fixture.kind] = null; });
  inFlight[fixture.kind] = promise;
  return promise;
}

async function doRunProbe(fixture: ProbeFixture, opts: { sendAlertOnFailure?: boolean }): Promise<HealthCheckResult> {
  const sendAlertOnFailure = opts.sendAlertOnFailure ?? true;
  const startedAt = Date.now();

  // Memory guard — skip rather than risk OOM on an already-stressed instance.
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const defaultMaxRss = process.env.NODE_ENV === 'production' ? DEFAULT_MAX_RSS_MB_PROD : DEFAULT_MAX_RSS_MB_DEV;
  const maxRss = parseInt(process.env.PDF_HEALTH_CHECK_MAX_RSS_MB || `${defaultMaxRss}`, 10);
  if (rssMb >= maxRss) {
    const skipReason = `RSS ${rssMb}MB ≥ ${maxRss}MB threshold — skipped to avoid adding load`;
    await safeLog(`${fixture.eventTypePrefix}-skip`, skipReason, { rssMb, maxRss, probe: fixture.kind });
    return { ok: true, durationMs: Date.now() - startedAt, skipped: true, skipReason, probe: fixture.kind };
  }

  let probePdfPath: string | null = null;
  try {
    if (!fs.existsSync(fixture.sourcePdfPath)) {
      throw new Error(`${fixture.kind} probe source PDF missing at ${fixture.sourcePdfPath}`);
    }

    // Copy source into uploads/ where RobustPDFGenerator expects to find
    // logo source files.
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const probeFilename = `${fixture.kind}-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    probePdfPath = path.join(uploadsDir, probeFilename);
    fs.copyFileSync(fixture.sourcePdfPath, probePdfPath);

    const probeLogoId = `${fixture.kind}-probe-logo-${Date.now()}`;
    const logo = {
      id: probeLogoId,
      filename: probeFilename,
      originalFilename: probeFilename,
      originalMimeType: 'application/pdf',
      mimeType: 'application/pdf',
      url: `/uploads/${probeFilename}`,
      originalWidth: fixture.logoWidthMm,
      originalHeight: fixture.logoHeightMm,
    };
    const element = {
      id: `${fixture.kind}-probe-element-${Date.now()}`,
      logoId: probeLogoId,
      x: fixture.elementXMm,
      y: fixture.elementYMm,
      width: fixture.elementWidthMm,
      height: fixture.elementHeightMm,
      rotation: 0,
    };

    // Run the same generator path customers use.
    const { RobustPDFGenerator } = await import('./robust-pdf-generator');
    const generator = new RobustPDFGenerator();
    const buffer = await generator.generatePDF({
      projectId: `${fixture.kind}-probe-${Date.now()}`,
      projectName: `${fixture.kind === 'stress' ? 'Stress' : 'Health'} Probe`,
      templateSize: fixture.template,
      canvasElements: [element],
      logos: [logo],
      garmentColor: '#ffffff',
      quantity: 1,
      useOriginalGarmentPages: false,
    });

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < fixture.minOutputBytes) {
      throw new Error(`Generator returned invalid buffer (${buffer?.length ?? 0} bytes, min ${fixture.minOutputBytes})`);
    }
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      throw new Error('Generator output is not a valid PDF (missing %PDF header)');
    }

    const durationMs = Date.now() - startedAt;
    lastSuccessAt[fixture.kind] = Date.now();
    await safeLog(`${fixture.eventTypePrefix}-ok`, `OK in ${durationMs}ms`, {
      durationMs, outputBytes: buffer.length, probe: fixture.kind,
    });
    return { ok: true, durationMs, outputBytes: buffer.length, probe: fixture.kind };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err?.message || String(err);
    const failureKey = `${fixture.alertKeyPrefix}-${classifyFailure(errorMessage)}`;
    await safeLog(`${fixture.eventTypePrefix}-fail`, errorMessage, {
      durationMs,
      failureKey,
      probe: fixture.kind,
      stack: (err?.stack || '').toString().slice(0, 4000),
    });

    if (sendAlertOnFailure) {
      await maybeSendAlert(fixture, failureKey, errorMessage, durationMs);
    }

    return { ok: false, durationMs, failureKey, errorMessage, probe: fixture.kind };
  } finally {
    // Best-effort cleanup of probe artifacts.
    if (probePdfPath) {
      try { fs.unlinkSync(probePdfPath); } catch { /* ignore */ }
    }
  }
}

async function doRunUploadProbe(opts: { sendAlertOnFailure?: boolean }): Promise<HealthCheckResult> {
  const sendAlertOnFailure = opts.sendAlertOnFailure ?? true;
  const startedAt = Date.now();

  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const defaultMaxRss = process.env.NODE_ENV === 'production' ? DEFAULT_MAX_RSS_MB_PROD : DEFAULT_MAX_RSS_MB_DEV;
  const maxRss = parseInt(process.env.PDF_HEALTH_CHECK_MAX_RSS_MB || `${defaultMaxRss}`, 10);
  if (rssMb >= maxRss) {
    const skipReason = `RSS ${rssMb}MB ≥ ${maxRss}MB threshold — skipped to avoid adding load`;
    await safeLog('upload-health-skip', skipReason, { rssMb, maxRss, probe: 'upload' });
    return { ok: true, durationMs: Date.now() - startedAt, skipped: true, skipReason, probe: 'upload' };
  }

  // Concurrency guard — if a real customer upload is already active, OperationGuard caps
  // upload concurrency at 1, so the probe POST will queue behind it. Heavy uploads (e.g.
  // 200+ MB PDFs) can take longer than the 45 s probe timeout, producing a false-positive
  // "This operation was aborted" alert even though the pipeline is working as designed.
  // Skip rather than alert when the slot is legitimately occupied.
  try {
    const { getActiveOpsDetail } = await import('./operation-guard');
    const activeUploads = getActiveOpsDetail().filter(op => op.label.startsWith('upload:'));
    if (activeUploads.length > 0) {
      const skipReason = `Upload slot busy (${activeUploads.length} active: ${activeUploads.map(o => `${o.label}@${o.runningSeconds}s`).join(', ')}) — skipped to avoid queueing`;
      await safeLog('upload-health-skip', skipReason, { activeUploads, probe: 'upload' });
      return { ok: true, durationMs: Date.now() - startedAt, skipped: true, skipReason, probe: 'upload' };
    }
  } catch { /* if operation-guard is unavailable, fall through to the normal probe */ }

  let probeProjectId: string | null = null;
  try {
    const sourcePath = path.join(process.cwd(), 'server/placeholders/60X60 Placeholder.pdf');
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Upload probe source PDF missing at ${sourcePath}`);
    }

    const project = await storage.createProject({
      name: '__HEALTH_PROBE__Upload Pipeline Check',
      templateSize: 'single-small',
      garmentColor: '#ffffff',
    } as any);
    probeProjectId = project.id;

    const pdfBuffer = fs.readFileSync(sourcePath);
    const port = parseInt(process.env.PORT || '5000', 10);
    const url = `http://localhost:${port}/api/projects/${probeProjectId}/logos`;

    const formData = new FormData();
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('files', blob, 'upload-probe-test.pdf');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '(unreadable)');
      if (response.status === 503 || response.status === 429) {
        const skipReason = `Upload endpoint returned HTTP ${response.status} (server busy/at capacity) — skipped`;
        await safeLog('upload-health-skip', skipReason, { status: response.status, probe: 'upload' });
        return { ok: true, durationMs: Date.now() - startedAt, skipped: true, skipReason, probe: 'upload' };
      }
      throw new Error(`Upload endpoint returned HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    const logos = await response.json() as any[];
    if (!Array.isArray(logos) || logos.length === 0) {
      throw new Error('Upload endpoint returned empty or invalid logo array');
    }

    const logo = logos[0];
    if (!logo.filename) {
      throw new Error('Logo missing filename (file I/O failure)');
    }
    if (typeof logo.originalWidth !== 'number' || logo.originalWidth <= 0) {
      throw new Error(`Logo missing valid originalWidth (bbox extraction failure): got ${logo.originalWidth}`);
    }
    if (typeof logo.originalHeight !== 'number' || logo.originalHeight <= 0) {
      throw new Error(`Logo missing valid originalHeight (bbox extraction failure): got ${logo.originalHeight}`);
    }
    const hasConvertedFile = logo.filename &&
      (logo.filename.endsWith('.svg') || logo.filename.endsWith('.png') ||
       logo.previewFilename || logo.canvasFallbackFilename);
    if (!hasConvertedFile) {
      throw new Error('Logo has no converted SVG/PNG file (conversion pipeline failure)');
    }

    const durationMs = Date.now() - startedAt;
    lastSuccessAt.upload = Date.now();
    await safeLog('upload-health-ok', `OK in ${durationMs}ms`, {
      durationMs, logoId: logo.id, filename: logo.filename,
      originalWidth: logo.originalWidth, originalHeight: logo.originalHeight,
      probe: 'upload',
    });
    return { ok: true, durationMs, probe: 'upload' };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err?.message || String(err);
    const failureKey = `upload-${classifyFailure(errorMessage)}`;
    await safeLog('upload-health-fail', errorMessage, {
      durationMs, failureKey, probe: 'upload',
      stack: (err?.stack || '').toString().slice(0, 4000),
    });

    if (sendAlertOnFailure) {
      await maybeSendUploadAlert(failureKey, errorMessage, durationMs);
    }

    return { ok: false, durationMs, failureKey, errorMessage, probe: 'upload' };
  } finally {
    if (probeProjectId) {
      await cleanupProbeProject(probeProjectId);
    }
  }
}

async function cleanupProbeProject(projectId: string): Promise<void> {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const logos = await storage.getLogosByProject(projectId);
    for (const logo of logos) {
      const filesToClean = [
        logo.filename,
        logo.originalFilename,
        logo.previewFilename,
        (logo as any).canvasFallbackFilename,
      ].filter(Boolean);
      for (const f of filesToClean) {
        const filePath = path.join(uploadsDir, f!);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
      const elements = await storage.getCanvasElementsByProject(projectId);
      for (const el of elements) {
        try { await storage.deleteCanvasElement(el.id); } catch { /* ignore */ }
      }
      try { await storage.deleteLogo(logo.id); } catch { /* ignore */ }
    }
    try { await storage.deleteProject(projectId); } catch { /* ignore */ }
  } catch (e) {
    console.warn(`[HEALTH] upload probe cleanup error (project ${projectId}):`, e);
  }
}

async function maybeSendUploadAlert(failureKey: string, errorMessage: string, durationMs: number): Promise<void> {
  const cooldownMin = Math.max(1, parseInt(process.env.PDF_HEALTH_ALERT_COOLDOWN_MIN || `${DEFAULT_COOLDOWN_MIN}`, 10));
  const now = Date.now();
  const last = lastAlertSentAt.get(failureKey) || 0;
  if (now - last < cooldownMin * 60_000) {
    console.log(`[HEALTH] upload alert suppressed (cooldown active for "${failureKey}", last sent ${Math.round((now - last) / 60_000)}min ago)`);
    return;
  }

  const alertTo = process.env.PDF_HEALTH_ALERT_TO || DEFAULT_ALERT_TO;
  const lastSuccess = lastSuccessAt.upload;
  const lastSuccessText = lastSuccess
    ? `${new Date(lastSuccess).toISOString()} (${Math.round((now - lastSuccess) / 60_000)} min ago)`
    : 'no recorded success since server start';

  const subject = `[completetransfers.com] UPLOAD pipeline FAILED (${failureKey})`;
  const text = [
    `The automated upload pipeline probe just failed.`,
    ``,
    `Probe:          upload — PDF upload + conversion pipeline (Ghostscript, Inkscape, rsvg-convert)`,
    `Failure type:   ${failureKey}`,
    `Error message:  ${errorMessage}`,
    `Check duration: ${durationMs}ms`,
    `Last success:   ${lastSuccessText}`,
    `Server time:    ${new Date(now).toISOString()}`,
    ``,
    `What this means:`,
    `The upload conversion pipeline (multer → Ghostscript bbox → pdf2svg/Inkscape → PNG thumbnail)`,
    `returned an error or invalid output. Customers may be unable to upload files at all right now.`,
    `PDF generation may still work for already-uploaded files — check the light/stress probe results.`,
    ``,
    `Recommended next steps:`,
    `  1. Check the deployment logs for ERROR lines around the timestamp above.`,
    `  2. Hit the manual trigger to confirm:`,
    `       GET /api/admin/health/upload`,
    `  3. Review recent failures: GET /api/admin/health/upload/history`,
    `  4. Check binary availability: gs --version, inkscape --version, rsvg-convert --version`,
    ``,
    `Further alerts for this same failure type are suppressed for ${cooldownMin} minutes.`,
  ].join('\n');
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5">${escapeHtml(text)}</pre>`;

  const result = await sendMail({ to: alertTo, subject, text, html });
  if (result.ok) {
    lastAlertSentAt.set(failureKey, now);
    console.log(`[HEALTH] upload alert email sent to ${alertTo} (${result.durationMs}ms, msgId=${result.messageId || 'n/a'})`);
  } else {
    console.error(`[HEALTH] upload alert email FAILED: ${result.error}`);
    await safeLog('upload-health-alert-send-fail', result.error || 'unknown', { failureKey, mailerSendStatus: result.status });
  }
}

/**
 * Start the periodic health-check schedulers (light, stress, and upload probes).
 * Idempotent — safe to call multiple times. Returns a stop function. In dev
 * the schedulers are no-ops unless PDF_HEALTH_CHECK_ENABLED=1.
 */
export function startPdfHealthMonitor(): () => void {
  if (lightTimer || stressTimer || uploadTimer) return () => stopPdfHealthMonitor();
  const enabled = process.env.NODE_ENV === 'production' || process.env.PDF_HEALTH_CHECK_ENABLED === '1';
  if (!enabled) {
    console.log('[HEALTH] PDF health monitor disabled (NODE_ENV !== production and PDF_HEALTH_CHECK_ENABLED != 1)');
    return () => {};
  }

  const lightMin = Math.max(1, parseInt(process.env.PDF_HEALTH_CHECK_INTERVAL_MIN || `${DEFAULT_LIGHT_INTERVAL_MIN}`, 10));
  const stressMin = Math.max(1, parseInt(process.env.PDF_STRESS_CHECK_INTERVAL_MIN || `${DEFAULT_STRESS_INTERVAL_MIN}`, 10));
  const uploadMin = Math.max(1, parseInt(process.env.UPLOAD_HEALTH_CHECK_INTERVAL_MIN || `${DEFAULT_UPLOAD_INTERVAL_MIN}`, 10));
  const alertTo = process.env.PDF_HEALTH_ALERT_TO || DEFAULT_ALERT_TO;
  console.log(`[HEALTH] PDF health monitor starting — light every ${lightMin}min, stress every ${stressMin}min, upload every ${uploadMin}min, alerts to ${alertTo}`);

  // First light check after 60s (give server time to warm up).
  firstLightTimer = setTimeout(() => {
    runPdfHealthCheck().catch((e) => console.error('[HEALTH] light check threw:', e));
  }, 60_000);
  if (firstLightTimer.unref) firstLightTimer.unref();

  // First stress check after 5min — staggered after the light probe so they
  // never start back-to-back on a fresh boot, and we get a light signal
  // before committing to the heavier check.
  firstStressTimer = setTimeout(() => {
    runPdfStressCheck().catch((e) => console.error('[HEALTH] stress check threw:', e));
  }, 5 * 60_000);
  if (firstStressTimer.unref) firstStressTimer.unref();

  // First upload check after 2min — staggered between light (60s) and stress (5min).
  firstUploadTimer = setTimeout(() => {
    runUploadHealthCheck().catch((e) => console.error('[HEALTH] upload check threw:', e));
  }, 2 * 60_000);
  if (firstUploadTimer.unref) firstUploadTimer.unref();

  lightTimer = setInterval(() => {
    runPdfHealthCheck().catch((e) => console.error('[HEALTH] light check threw:', e));
  }, lightMin * 60_000);
  if (lightTimer.unref) lightTimer.unref();

  stressTimer = setInterval(() => {
    runPdfStressCheck().catch((e) => console.error('[HEALTH] stress check threw:', e));
  }, stressMin * 60_000);
  if (stressTimer.unref) stressTimer.unref();

  uploadTimer = setInterval(() => {
    runUploadHealthCheck().catch((e) => console.error('[HEALTH] upload check threw:', e));
  }, uploadMin * 60_000);
  if (uploadTimer.unref) uploadTimer.unref();

  return stopPdfHealthMonitor;
}

export function stopPdfHealthMonitor(): void {
  for (const t of [firstLightTimer, firstStressTimer, firstUploadTimer]) {
    if (t) clearTimeout(t);
  }
  firstLightTimer = null;
  firstStressTimer = null;
  firstUploadTimer = null;
  for (const t of [lightTimer, stressTimer, uploadTimer]) {
    if (t) clearInterval(t);
  }
  lightTimer = null;
  stressTimer = null;
  uploadTimer = null;
  console.log('[HEALTH] PDF health monitor stopped');
}

export function getLastSuccessAt(probe: 'light' | 'stress' | 'upload' = 'light'): number | null {
  return lastSuccessAt[probe];
}

async function maybeSendAlert(fixture: ProbeFixture, failureKey: string, errorMessage: string, durationMs: number): Promise<void> {
  const cooldownMin = Math.max(1, parseInt(process.env.PDF_HEALTH_ALERT_COOLDOWN_MIN || `${DEFAULT_COOLDOWN_MIN}`, 10));
  const now = Date.now();
  const last = lastAlertSentAt.get(failureKey) || 0;
  if (now - last < cooldownMin * 60_000) {
    console.log(`[HEALTH] alert suppressed (cooldown active for "${failureKey}", last sent ${Math.round((now - last) / 60_000)}min ago)`);
    return;
  }

  const alertTo = process.env.PDF_HEALTH_ALERT_TO || DEFAULT_ALERT_TO;
  const lastSuccess = lastSuccessAt[fixture.kind];
  const lastSuccessText = lastSuccess
    ? `${new Date(lastSuccess).toISOString()} (${Math.round((now - lastSuccess) / 60_000)} min ago)`
    : 'no recorded success since server start';

  const probeName = fixture.kind === 'stress' ? 'STRESS PROBE' : 'health check';
  const subject = `[completetransfers.com] PDF ${probeName} FAILED (${failureKey})`;
  const text = [
    `The automated PDF ${probeName} just failed.`,
    ``,
    `Probe:          ${fixture.kind} — ${fixture.label}`,
    `Failure type:   ${failureKey}`,
    `Error message:  ${errorMessage}`,
    `Check duration: ${durationMs}ms`,
    `Last success:   ${lastSuccessText} (this probe)`,
    `Server time:    ${new Date(now).toISOString()}`,
    ``,
    `What this means:`,
    fixture.kind === 'stress'
      ? 'The stress probe (large multi-color PDF) failed. This usually indicates memory pressure, Ghostscript timeouts, or large-bitmap issues. Customers may be unable to generate PDFs from large or complex source files. Simple small files may still work — check the light probe results to confirm.'
      : 'The synthetic PDF probe (small A6 placeholder through the same generator customers use) returned an error or invalid output. Customers may be unable to generate PDFs at all right now.',
    ``,
    `Recommended next steps:`,
    `  1. Check the deployment logs for ERROR lines around the timestamp above.`,
    `  2. Hit the manual triggers to confirm:`,
    `       GET /api/admin/health/pdf         (light probe)`,
    `       GET /api/admin/health/pdf/stress  (stress probe)`,
    `  3. Review recent failures: GET /api/admin/health/pdf/history`,
    ``,
    `Further alerts for this same failure type are suppressed for ${cooldownMin} minutes.`,
  ].join('\n');
  const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5">${escapeHtml(text)}</pre>`;

  const result = await sendMail({ to: alertTo, subject, text, html });
  if (result.ok) {
    lastAlertSentAt.set(failureKey, now);
    console.log(`[HEALTH] alert email sent to ${alertTo} (${result.durationMs}ms, msgId=${result.messageId || 'n/a'})`);
  } else {
    console.error(`[HEALTH] alert email FAILED: ${result.error}`);
    await safeLog('pdf-health-alert-send-fail', result.error || 'unknown', { failureKey, mailerSendStatus: result.status });
  }
}

function classifyFailure(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('sigkill')) return 'process-killed-oom';
  if (m.includes('timeout') || m.includes('timed out')) return 'timeout';
  if (m.includes('enoent') || m.includes('no such file')) return 'missing-file';
  if (m.includes('ghostscript') || m.includes('gs ')) return 'ghostscript-error';
  if (m.includes('inkscape')) return 'inkscape-error';
  if (m.includes('memory') || m.includes('heap')) return 'memory-error';
  if (m.includes('not a valid pdf') || m.includes('invalid buffer')) return 'invalid-output';
  return 'generation-error';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function safeLog(eventType: string, message: string, details: Record<string, any>): Promise<void> {
  try {
    const mem = process.memoryUsage();
    await storage.createCrashLog({
      eventType,
      message: message.slice(0, 4000),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapMb: Math.round(mem.heapUsed / 1024 / 1024),
      uptimeSeconds: Math.round(process.uptime()),
      activeOps: null,
      queuedOps: null,
      details,
    });
  } catch (e) {
    // Don't let log persistence failures break the monitor.
    console.warn('[HEALTH] failed to persist crashLogs row:', e);
  }
}
