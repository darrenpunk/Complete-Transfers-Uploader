/**
 * Production PDF health monitor.
 *
 * Runs an end-to-end PDF generation through the same `RobustPDFGenerator`
 * pipeline that customers use, on a small synthetic project, every N minutes
 * in production. On failure, persists a crash-log row and emails an alert via
 * MailerSend. Throttles alerts so a sustained outage produces ~one email per
 * cooldown window rather than one per failed check.
 *
 * Wiring:
 *   - `server/index.ts` calls `startPdfHealthMonitor()` after startup.
 *     The scheduler is gated on `NODE_ENV === 'production'` unless the env
 *     var `PDF_HEALTH_CHECK_ENABLED=1` is set (used by the admin manual
 *     trigger and for occasional dev verification).
 *   - `server/routes.ts` exposes `GET /api/admin/health/pdf` (run a check now,
 *     no email) and `GET /api/admin/health/pdf/history` (recent crashLogs
 *     events).
 *
 * Configuration env (all optional):
 *   PDF_HEALTH_CHECK_INTERVAL_MIN — default 15. Min 1.
 *   PDF_HEALTH_ALERT_TO            — default darren@serigraf.com.
 *   PDF_HEALTH_ALERT_COOLDOWN_MIN  — default 30. Don't email more than once
 *                                    per cooldown for the same failure key.
 *   PDF_HEALTH_CHECK_MAX_RSS_MB    — env-aware default: 350 in dev (small
 *                                    sandbox), 6000 in production (Reserved
 *                                    VM, 8 GiB RAM, leave ~2 GB headroom).
 *                                    Skips the check (without alerting) if
 *                                    container RSS is above this so the
 *                                    probe doesn't make a memory-pressed
 *                                    instance worse. The default must NOT
 *                                    be set so low in production that it
 *                                    skips every check — that would mask
 *                                    real outages with false-healthy
 *                                    "skip" rows.
 */

import fs from 'fs';
import path from 'path';
import { storage } from './storage';
import { sendMail } from './mailersend-client';

const DEFAULT_INTERVAL_MIN = 15;
const DEFAULT_COOLDOWN_MIN = 30;
// Env-aware default: dev sandbox has ~512MB available, prod Reserved VM has
// 8 GiB. A 350MB threshold in prod would skip almost every check and mask
// outages.
const DEFAULT_MAX_RSS_MB_DEV = 350;
const DEFAULT_MAX_RSS_MB_PROD = 6000;
const DEFAULT_ALERT_TO = 'darren@serigraf.com';

const PROBE_TEMPLATE = {
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

const PROBE_PLACEHOLDER_PDF = path.join(process.cwd(), 'server/placeholders/A6 Placeholder.pdf');

export interface HealthCheckResult {
  ok: boolean;
  durationMs: number;
  outputBytes?: number;
  failureKey?: string;
  errorMessage?: string;
  skipped?: boolean;
  skipReason?: string;
}

const lastAlertSentAt = new Map<string, number>();
let lastSuccessAt: number | null = null;
let timer: NodeJS.Timeout | null = null;
let firstCheckTimer: NodeJS.Timeout | null = null;
// Mutex: collapse concurrent invocations onto a single in-flight probe so
// the scheduler firing while a slow check is running (or an admin manually
// poking the endpoint mid-cycle) does not double-spend memory or — more
// importantly — bypass the per-failureKey alert cooldown by racing two
// failures past the lastAlertSentAt check before either has updated it.
let inFlight: Promise<HealthCheckResult> | null = null;

/**
 * Run a single end-to-end PDF generation health check. Always persists a
 * crashLogs row (eventType `pdf-health-ok` or `pdf-health-fail`). When
 * `sendAlertOnFailure` is true (the default for the scheduler), failures also
 * trigger a throttled MailerSend email.
 */
export async function runPdfHealthCheck(opts: { sendAlertOnFailure?: boolean } = {}): Promise<HealthCheckResult> {
  // Collapse concurrent calls onto a single probe (see comment on inFlight).
  if (inFlight) return inFlight;
  inFlight = doRunPdfHealthCheck(opts).finally(() => { inFlight = null; });
  return inFlight;
}

async function doRunPdfHealthCheck(opts: { sendAlertOnFailure?: boolean }): Promise<HealthCheckResult> {
  const sendAlertOnFailure = opts.sendAlertOnFailure ?? true;
  const startedAt = Date.now();

  // Memory guard — skip rather than risk OOM on an already-stressed instance.
  const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const defaultMaxRss = process.env.NODE_ENV === 'production' ? DEFAULT_MAX_RSS_MB_PROD : DEFAULT_MAX_RSS_MB_DEV;
  const maxRss = parseInt(process.env.PDF_HEALTH_CHECK_MAX_RSS_MB || `${defaultMaxRss}`, 10);
  if (rssMb >= maxRss) {
    const skipReason = `RSS ${rssMb}MB ≥ ${maxRss}MB threshold — skipped to avoid adding load`;
    await safeLog('pdf-health-skip', skipReason, { rssMb, maxRss });
    return { ok: true, durationMs: Date.now() - startedAt, skipped: true, skipReason };
  }

  let probePdfPath: string | null = null;
  try {
    if (!fs.existsSync(PROBE_PLACEHOLDER_PDF)) {
      throw new Error(`Probe placeholder PDF missing at ${PROBE_PLACEHOLDER_PDF}`);
    }

    // Copy placeholder into uploads/ where RobustPDFGenerator expects to find
    // logo source files.
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const probeFilename = `health-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    probePdfPath = path.join(uploadsDir, probeFilename);
    fs.copyFileSync(PROBE_PLACEHOLDER_PDF, probePdfPath);

    const probeLogoId = `health-probe-logo-${Date.now()}`;
    const logo = {
      id: probeLogoId,
      filename: probeFilename,
      originalFilename: probeFilename,
      originalMimeType: 'application/pdf',
      mimeType: 'application/pdf',
      url: `/uploads/${probeFilename}`,
      // Realistic-ish dimensions for an A6 health probe (smaller than template).
      originalWidth: 100,
      originalHeight: 70,
    };
    const element = {
      id: `health-probe-element-${Date.now()}`,
      logoId: probeLogoId,
      x: 24, // mm — centred-ish on 148x105
      y: 17.5,
      width: 100,
      height: 70,
      rotation: 0,
    };

    // Run the same generator path customers use.
    const { RobustPDFGenerator } = await import('./robust-pdf-generator');
    const generator = new RobustPDFGenerator();
    const buffer = await generator.generatePDF({
      projectId: `health-probe-${Date.now()}`,
      projectName: 'Health Probe',
      templateSize: PROBE_TEMPLATE,
      canvasElements: [element],
      logos: [logo],
      garmentColor: '#ffffff',
      quantity: 1,
      useOriginalGarmentPages: false,
    });

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 1000) {
      throw new Error(`Generator returned invalid buffer (${buffer?.length ?? 0} bytes)`);
    }
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      throw new Error('Generator output is not a valid PDF (missing %PDF header)');
    }

    const durationMs = Date.now() - startedAt;
    lastSuccessAt = Date.now();
    await safeLog('pdf-health-ok', `OK in ${durationMs}ms`, { durationMs, outputBytes: buffer.length });
    return { ok: true, durationMs, outputBytes: buffer.length };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err?.message || String(err);
    const failureKey = classifyFailure(errorMessage);
    await safeLog('pdf-health-fail', errorMessage, {
      durationMs,
      failureKey,
      stack: (err?.stack || '').toString().slice(0, 4000),
    });

    if (sendAlertOnFailure) {
      await maybeSendAlert(failureKey, errorMessage, durationMs);
    }

    return { ok: false, durationMs, failureKey, errorMessage };
  } finally {
    // Best-effort cleanup of probe artifacts.
    if (probePdfPath) {
      try { fs.unlinkSync(probePdfPath); } catch { /* ignore */ }
    }
  }
}

/**
 * Start the periodic health-check scheduler. Idempotent — safe to call
 * multiple times. Returns a stop function. In dev the scheduler is a no-op
 * unless PDF_HEALTH_CHECK_ENABLED=1.
 */
export function startPdfHealthMonitor(): () => void {
  if (timer) return () => stopPdfHealthMonitor();
  const enabled = process.env.NODE_ENV === 'production' || process.env.PDF_HEALTH_CHECK_ENABLED === '1';
  if (!enabled) {
    console.log('[HEALTH] PDF health monitor disabled (NODE_ENV !== production and PDF_HEALTH_CHECK_ENABLED != 1)');
    return () => {};
  }

  const intervalMin = Math.max(1, parseInt(process.env.PDF_HEALTH_CHECK_INTERVAL_MIN || `${DEFAULT_INTERVAL_MIN}`, 10));
  const intervalMs = intervalMin * 60_000;
  const alertTo = process.env.PDF_HEALTH_ALERT_TO || DEFAULT_ALERT_TO;
  console.log(`[HEALTH] PDF health monitor starting — every ${intervalMin}min, alerts to ${alertTo}`);

  // First check after 60s (give server time to warm up).
  firstCheckTimer = setTimeout(() => {
    runPdfHealthCheck().catch((e) => console.error('[HEALTH] check threw:', e));
  }, 60_000);
  if (firstCheckTimer.unref) firstCheckTimer.unref();

  timer = setInterval(() => {
    runPdfHealthCheck().catch((e) => console.error('[HEALTH] check threw:', e));
  }, intervalMs);
  // Don't keep the event loop alive solely for this timer.
  if (timer.unref) timer.unref();

  return stopPdfHealthMonitor;
}

export function stopPdfHealthMonitor(): void {
  if (firstCheckTimer) {
    clearTimeout(firstCheckTimer);
    firstCheckTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[HEALTH] PDF health monitor stopped');
  }
}

export function getLastSuccessAt(): number | null {
  return lastSuccessAt;
}

async function maybeSendAlert(failureKey: string, errorMessage: string, durationMs: number): Promise<void> {
  const cooldownMin = Math.max(1, parseInt(process.env.PDF_HEALTH_ALERT_COOLDOWN_MIN || `${DEFAULT_COOLDOWN_MIN}`, 10));
  const now = Date.now();
  const last = lastAlertSentAt.get(failureKey) || 0;
  if (now - last < cooldownMin * 60_000) {
    console.log(`[HEALTH] alert suppressed (cooldown active for "${failureKey}", last sent ${Math.round((now - last) / 60_000)}min ago)`);
    return;
  }

  const alertTo = process.env.PDF_HEALTH_ALERT_TO || DEFAULT_ALERT_TO;
  const lastSuccessText = lastSuccessAt
    ? `${new Date(lastSuccessAt).toISOString()} (${Math.round((now - lastSuccessAt) / 60_000)} min ago)`
    : 'no recorded success since server start';

  const subject = `[completetransfers.com] PDF generation health check FAILED (${failureKey})`;
  const text = [
    `The automated PDF health check just failed.`,
    ``,
    `Failure type:   ${failureKey}`,
    `Error message:  ${errorMessage}`,
    `Check duration: ${durationMs}ms`,
    `Last success:   ${lastSuccessText}`,
    `Server time:    ${new Date(now).toISOString()}`,
    ``,
    `What this means:`,
    `The synthetic PDF probe (small A6 placeholder through the same generator customers use) returned an error or invalid output. Customers may be unable to generate PDFs right now.`,
    ``,
    `Recommended next steps:`,
    `  1. Check the deployment logs for ERROR lines around the timestamp above.`,
    `  2. Hit the manual trigger to confirm: GET /api/admin/health/pdf`,
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
