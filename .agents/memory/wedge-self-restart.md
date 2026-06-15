---
name: Wedge self-restart (liveness + health-probe)
description: Why/how the deployed app auto-restarts when wedged but not OOM, and the invariants that keep it from interrupting customer work.
---

# Wedge self-restart

A deployed-app failure mode exists that is the OPPOSITE of OOM: the process
stays at low RSS (~178MB) and trivial `GET /api/version` keeps answering in
~1ms, but every REAL endpoint goes silent for ~10min. The memory watchdog
(MEMORY_RESTART_MB=400) never fires, so before this work the only recovery was
a manual republish.

**The recovery design:** all self-restarts funnel through one shared module
(`server/self-restart.ts` → `requestGracefulRestart`). Two independent
detectors call it: the liveness/wedge watchdog (`server/index.ts`, production
block, after the memory watchdog) and health-probe escalation
(`server/health-monitor.ts`). Replit performs the actual relaunch — we only
`process.exit(1)`.

**Load-bearing invariants — don't regress:**

- **Never interrupt real customer work.** `requestGracefulRestart` defers
  (`deferred-busy`) if any non-probe OperationGuard op is genuinely
  progressing (runningSeconds < 180s = STALE_OP_TIMEOUT). It re-checks AGAIN
  after the 3s grace window and aborts the exit if a real op slipped in. Probe
  ops (label matches /probe/i) and stale (>180s, force-releasable) ops do NOT
  defer.
  **Why:** a blind restart could kill an in-flight upload/PDF job. The 180s
  ceiling mirrors OperationGuard's own stale-release, so anything older isn't
  actually progressing.

- **Wedge signal must be false-positive resistant.** Primary signal is
  /api/-only counters (static + /api/version excluded): over a rolling window
  (LIVENESS_NO_SUCCESS_MIN, default 5min) >=LIVENESS_MIN_REQUESTS (default 5)
  API requests STARTED but ZERO succeeded (success = status<500). Plus two
  consecutive positive checks (~60s) before firing. Secondary catch-alls:
  oldest in-flight API req >330s, event-loop lag >30s.
  **Why:** an idle server (no traffic), a single slow op (needs many reqs), and
  a busy-but-healthy server (small GETs always succeed) must NOT trigger it.
  The window sits above the longest legit chain (queue 120s + op 180s = 300s).

- **Restart must be traceable + must not be mislabeled.** Both
  `liveness_restart` and `health_probe_restart` are in FORENSIC_EVENT_TYPES so
  `persistCrashLog` attaches the request ring + in-flight snapshot, and they
  are EXCLUDED from the suspected-crash detector (a clean intentional exit is
  not an unclean crash). persistCrashLog is injected via
  `registerRestartPersist()` to avoid a circular import.
  Query: `SELECT details FROM crash_logs WHERE event_type IN
  ('liveness_restart','health_probe_restart') ORDER BY created_at DESC`.

- **Health-probe escalation only from the scheduler.** Manual admin
  trigger endpoints pass `sendAlertOnFailure:false` and must NEVER restart the
  server. Skips don't touch the per-probe consecutive-failure counter; a
  success resets it; escalates at HEALTH_PROBE_RESTART_THRESHOLD (default 3),
  production-only.

**Env tunables:** LIVENESS_NO_SUCCESS_MIN, LIVENESS_MIN_REQUESTS,
LIVENESS_STUCK_INFLIGHT_SEC, HEALTH_PROBE_RESTART_THRESHOLD.

The memory (OOM) watchdog and OperationGuard stale-op release were left
untouched — this is additive.
