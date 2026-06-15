/**
 * Centralised graceful self-restart for wedge / liveness recovery.
 *
 * Both the event-loop / liveness watchdog (server/index.ts) and the
 * health-probe escalation (server/health-monitor.ts) funnel through
 * `requestGracefulRestart` so there is a single, consistent path that:
 *
 *   1. De-dupes (only one restart can be in flight at a time).
 *   2. Honours a short cooldown so an aborted attempt can't busy-loop.
 *   3. Defers if a REAL (non-probe) heavy operation is genuinely in flight
 *      and progressing — never kills a customer's upload/PDF job. A truly
 *      wedged OperationGuard slot is force-released after STALE_OP_TIMEOUT
 *      (180s), so anything still "running" beyond that is not progressing and
 *      no longer protects against restart.
 *   4. Persists a forensic crashLogs row (via the injected persist fn) BEFORE
 *      exiting, so a post-incident query can answer "why did it restart" from
 *      a single DB row — consistent with how the memory (OOM) watchdog records
 *      its restarts.
 *
 * The actual relaunch is performed by Replit: we exit the process and the
 * platform brings it back up.
 *
 * persistCrashLog lives in server/index.ts (it captures the forensic ring +
 * in-flight snapshot for FORENSIC_EVENT_TYPES). To avoid a circular import we
 * inject it via registerRestartPersist() at startup.
 */

import { getActiveOpsDetail } from './operation-guard';

type PersistFn = (eventType: string, message: string, details?: any) => Promise<void>;

let persistCrashLog: PersistFn | null = null;

export function registerRestartPersist(fn: PersistFn): void {
  persistCrashLog = fn;
}

// Beyond OperationGuard's STALE_OP_TIMEOUT_MS (180s) a "running" op is no
// longer progressing — the guard will force-release it — so it should not
// defer a restart. Mirror that number here.
const PROGRESSING_OP_MAX_SECONDS = 180;
const EXIT_GRACE_MS = 3000;
const PERSIST_DEADLINE_MS = 2500;
const RESTART_COOLDOWN_MS = 60_000;

let restartInProgress = false;
let lastAttemptAt = 0;

export type RestartOutcome =
  | 'restarting'
  | 'deferred-busy'
  | 'deferred-cooldown'
  | 'already-scheduled';

/**
 * Returns the real (non-probe) heavy operations that are genuinely in flight
 * and still progressing (running less than the OperationGuard stale ceiling).
 * Probe operations and stale/force-releasable ops are excluded — neither
 * should defer a recovery restart.
 */
function progressingRealOps(): Array<{ label: string; runningSeconds: number }> {
  try {
    return getActiveOpsDetail()
      .filter(op => !/probe/i.test(op.label) && op.runningSeconds < PROGRESSING_OP_MAX_SECONDS)
      .map(op => ({ label: op.label, runningSeconds: op.runningSeconds }));
  } catch {
    return [];
  }
}

export interface RestartRequest {
  /** crashLogs event_type, e.g. 'liveness_restart' | 'health_probe_restart'. */
  eventType: string;
  /** Human-readable trigger reason, stored as the crashLogs message. */
  reason: string;
  /** Extra structured detail merged into the crashLogs row. */
  details?: Record<string, any>;
}

/**
 * Request a graceful self-restart. Safe to call repeatedly (e.g. every
 * watchdog tick while wedged) — only the first committed call schedules the
 * exit. Returns what happened so the caller can log it.
 */
export function requestGracefulRestart(req: RestartRequest): RestartOutcome {
  if (restartInProgress) return 'already-scheduled';

  const now = Date.now();
  if (now - lastAttemptAt < RESTART_COOLDOWN_MS) return 'deferred-cooldown';

  const busy = progressingRealOps();
  if (busy.length > 0) {
    console.warn(
      `[SELF-RESTART] Deferring ${req.eventType} — real work in flight: ` +
      busy.map(o => `${o.label}@${o.runningSeconds}s`).join(', '),
    );
    return 'deferred-busy';
  }

  restartInProgress = true;
  lastAttemptAt = now;
  console.error(`[SELF-RESTART] ${req.eventType}: ${req.reason} — graceful restart in ${EXIT_GRACE_MS / 1000}s`);

  // Persist the forensic row before exiting, but never let a slow/locked DB
  // hold the process hostage — race the write against a hard deadline.
  const writePromise = persistCrashLog
    ? persistCrashLog(req.eventType, req.reason, req.details)
    : Promise.resolve();
  const writeDeadline = new Promise<void>(r => setTimeout(r, PERSIST_DEADLINE_MS));

  Promise.race([writePromise, writeDeadline]).then(() => {
    const elapsed = Date.now() - now;
    const remaining = Math.max(0, EXIT_GRACE_MS - elapsed);
    setTimeout(() => {
      // Final guard: if a real customer op slipped in during the grace window,
      // abort the restart rather than interrupt it. The watchdog will re-detect
      // on the next cycle if the wedge persists.
      const lateBusy = progressingRealOps();
      if (lateBusy.length > 0) {
        console.warn(
          `[SELF-RESTART] Aborted ${req.eventType} — real work started during grace window: ` +
          lateBusy.map(o => `${o.label}@${o.runningSeconds}s`).join(', '),
        );
        restartInProgress = false;
        return;
      }
      console.error(`[SELF-RESTART] Exiting now for ${req.eventType} relaunch`);
      process.exit(1);
    }, remaining);
  });

  return 'restarting';
}
