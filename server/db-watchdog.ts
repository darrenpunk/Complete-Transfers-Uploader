/**
 * DB-connectivity watchdog — catches the "app up but every DB connect times
 * out" wedge (2026-07-24 outage: Neon websocket connects all failed for 11+
 * minutes while the process stayed healthy-looking because DB-backed endpoints
 * served fallback 200s, so the liveness watchdog never fired).
 *
 * Strategy:
 *   - Active probe: every PROBE_INTERVAL_MS run `SELECT 1` through the shared
 *     pool (races a hard timeout slightly above the pool's 10s connect
 *     timeout, so a wedged connect registers as a failure, never a hang).
 *   - Passive signal: any successful pool connect/acquire from REAL traffic
 *     also counts as a success — so if probes fail but customers are being
 *     served from the DB, we never restart.
 *   - Trigger: only when BOTH (a) MIN_CONSECUTIVE_FAILURES probe failures in a
 *     row and (b) RESTART_AFTER_MS elapsed with ZERO successes of any kind.
 *     That is ~3 minutes of provable 100% connect failure — long enough to
 *     ride out a normal Neon compute recycle (usually seconds), short enough
 *     to cut the 2026-07-24 class of outage from ~12 minutes to ~3.
 *   - Recovery action funnels through requestGracefulRestart, which de-dupes,
 *     honours the cooldown, defers while a real customer op is in flight, and
 *     persists a forensic crash_logs row (write races a 2.5s deadline, so a
 *     dead DB can't hold the exit hostage).
 */

import { pool } from './db';
import { requestGracefulRestart } from './self-restart';

const PROBE_INTERVAL_MS = 30_000;
// Pool connectionTimeoutMillis is 10s — give the probe a little headroom so
// the failure we record is the pool's own connect timeout, not ours.
const PROBE_TIMEOUT_MS = 15_000;
const RESTART_AFTER_MS = 3 * 60_000;
const MIN_CONSECUTIVE_FAILURES = 5;

let lastSuccessAt = Date.now();
let consecutiveProbeFailures = 0;
let started = false;

function noteDbSuccess(): void {
  lastSuccessAt = Date.now();
  if (consecutiveProbeFailures > 0) {
    console.log(`[DB-WATCHDOG] DB reachable again — clearing ${consecutiveProbeFailures} consecutive probe failures`);
  }
  consecutiveProbeFailures = 0;
}

async function probe(): Promise<void> {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('watchdog probe timed out')), PROBE_TIMEOUT_MS),
      ),
    ]);
    noteDbSuccess();
  } catch (err: any) {
    consecutiveProbeFailures++;
    const silentMs = Date.now() - lastSuccessAt;
    const silentSeconds = Math.round(silentMs / 1000);
    console.warn(
      `[DB-WATCHDOG] probe failed (${consecutiveProbeFailures} consecutive, ${silentSeconds}s since last DB success): ${err?.message || err}`,
    );
    if (consecutiveProbeFailures >= MIN_CONSECUTIVE_FAILURES && silentMs >= RESTART_AFTER_MS) {
      const reason =
        `All DB connections failing for ${silentSeconds}s ` +
        `(${consecutiveProbeFailures} consecutive probe failures, zero successes) — restarting to reset the connection pool`;
      const outcome = requestGracefulRestart({
        eventType: 'db_connectivity_restart',
        reason,
        details: {
          consecutiveProbeFailures,
          silentSeconds,
          lastError: String(err?.message || err).slice(0, 300),
        },
      });
      if (outcome !== 'restarting') {
        console.warn(`[DB-WATCHDOG] restart not executed (${outcome}) — will re-evaluate next probe`);
      }
    }
  }
}

export function startDbWatchdog(): void {
  if (started) return;
  started = true;
  // Boot grace: pretend we just succeeded so a slow cold start can't misfire.
  lastSuccessAt = Date.now();

  // Passive signal from real traffic: a freshly ESTABLISHED connection proves
  // the DB path works right now. Deliberately NOT listening to 'acquire' —
  // checking out an existing (possibly zombie) client proves nothing, and the
  // probe's own checkout would reset the timer before its query even ran,
  // blinding the watchdog to hung-client wedges.
  pool.on('connect', noteDbSuccess);

  const timer = setInterval(() => { probe().catch(() => {}); }, PROBE_INTERVAL_MS);
  if (timer.unref) timer.unref();
  console.log(
    `[DB-WATCHDOG] active — probe every ${PROBE_INTERVAL_MS / 1000}s; graceful restart after ` +
    `${RESTART_AFTER_MS / 60000}min of continuous connect failures (min ${MIN_CONSECUTIVE_FAILURES} probes, zero successes)`,
  );
}
