---
name: Prod DB-connection wedge outage (2026-07-24)
description: How to recognize and recover the "app up but every Neon connect times out" outage, and why the existing self-heal watchdogs don't catch it.
---

# Prod DB-connection wedge — app up, DB unreachable

**Symptoms (2026-07-24 10:57–11:09 UTC):** deployed app serves static pages and
`/api/version` in ~1ms, but EVERY Neon websocket connect times out
(`DB <op> attempt N/3 failed: timeout exceeded when trying to connect`), paired
with repeated `TypeError: Cannot set property message of #<ErrorEvent>` from
`@neondatabase/serverless` (a driver bug that masks the real ws connect error —
caught by CRASH PROTECTION, does not exit). Customers hang at "Setting up your
workspace…"; admin dashboard shows all zeros; UptimeRobot may show 503 during
the recovery republish.

**Diagnosis path that worked:**
- `fetch_deployment_logs` → DB timeouts + neon TypeError, but fast /api/version.
- Dev DATABASE_URL connect test → OK (but dev is a DIFFERENT db: dev=heliumdb, prod=neondb — dev crash_logs are NOT prod's).
- `executeSql environment:"production"` → prod DB replica healthy, health probes OK until minutes before → DB fine, prod process/network path wedged.

**Key facts:**
- A republish fixed it. But note: the FRESH instance also failed its first few connects (~25s window) before recovering — so the trigger was likely a Neon endpoint recycle/network blip; the bug is that the old process's pool NEVER recovered (wedged 11+ min until manual republish).
- **Why no self-heal fired:** the liveness/wedge watchdog counts success as status<500, and DB-backed endpoints return 200 in ~31.5s with FALLBACK data (template-sizes, customer-features, heartbeat) → looks healthy. Health-probe escalation (3 consecutive failures, 10–15min cadence) would need ~30–45min. Gap: no detector for "all real DB connects failing, fallbacks masking it".
- Endpoints serving 200-with-fallback-after-31s is itself the signature: `200 in 315xxms` lines = 3×~10s connect timeouts then fallback.

**Safeguard now built (2026-07-24, `server/db-watchdog.ts`):** production-only
probe (`SELECT 1` every 30s, raced vs 15s) → `requestGracefulRestart`
(`db_connectivity_restart`, forensic event type) only when ≥5 consecutive probe
failures AND ≥3min with zero successes. Passive success = `pool.on('connect')`
ONLY — deliberately NOT `'acquire'` (probe's own checkout would reset the timer
before its query ran, blinding it to hung-client wedges). Cuts this outage
class from ~12min to ~3-4min. Accepted tradeoff: a prolonged full Neon outage
restart-loops every ~3-4min (intended).

**How to apply:** if it recurs anyway, confirm prod DB replica is healthy
first, then republish — don't wait. Expect a `db_connectivity_restart` row in
crash_logs when the watchdog fires; investigate any firing that customers
didn't notice (possible false positive).
