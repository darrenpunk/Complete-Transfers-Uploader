---
name: Production crash_logs debugging quirks
description: How to query the prod crash_logs table correctly and read its timestamps when investigating "deployed crashed" reports.
---

# Investigating production "deployed crashed" reports

The `crash_logs` table (production read-replica, via the database skill `executeSql` with `environment: "production"`) is the primary forensic source when deployment logs are gone. `fetch_deployment_logs` often returns "No deployment logs found" because Replit only keeps logs for the currently-running deployment — so crash_logs is usually all you have.

## `created_at` is stored as TEXT, not timestamp
**Why:** `pg_typeof(created_at)` returns `text` (ISO-8601 strings like `2026-06-08 12:53:09.946872+00`).
**How to apply:**
- Filter/sort with **string comparison**: `WHERE created_at > '2026-06-07'` and `ORDER BY created_at DESC` work (ISO sorts chronologically).
- DO NOT use `NOW() - INTERVAL`, `to_char(created_at, …)`, or any timestamp function on it — on the prod read-only path these silently return EMPTY output (even `count(*)`), which looks like "zero rows" and sent me chasing a phantom. Use `left(created_at,19)` to trim for display.
- `id` is a random UUID, so `ORDER BY id` is NOT chronological — always order by `created_at`.

## The prod read-replica clock == real wall clock (it is ~live, not lagging)
**Why:** `SELECT now()` on the replica matched the sandbox `new Date()` to the second; data horizon trailed by only ~3 min.
**How to apply:** Don't assume an hour of "replica lag." If a user's screenshot timestamp looks ~1h ahead of crash_logs, it's almost certainly **local time vs UTC** — completetransfers.com users are UTC+1 (Irish/UK). crash_logs are UTC.

## Event types and what they mean
- `*-ok` (`pdf-health-ok`, `upload-health-ok`, `pdf-stress-ok`) = passing probes, run roughly **every 10–15 min** (not every 2). A 5-min gap is normal cadence, not a sign of death.
- `memory_warning` = RSS crossed 350MB; row shows pre→post-GC. `memory_critical` = post-GC RSS > 400MB → graceful restart scheduled. `memory_recovered` = restart aborted because RSS fell back under warn line.
- `server_start` = a process (re)start. A `server_start` with a clean lead-up (probes OK, no memory_critical before it) is almost always a **redeploy/republish**, not a crash.
- `suspected_crash` = startup detector found the previous instance died without clean shutdown (likely OOM SIGKILL); carries the recent-request ring in `details`.
- `db_connection_reset` "terminating connection due to administrator command" = Neon recycled the compute (autosuspend/maintenance/scaling). Handled non-fatally by `pool.on('error')` in `server/db.ts` (logs, does not rethrow), so it does NOT crash the process by itself.

## Quick triage query
```sql
SELECT event_type, count(*) n, left(max(created_at),19) latest
FROM crash_logs WHERE created_at > '<YYYY-MM-DD>' GROUP BY event_type ORDER BY n DESC;
-- then the smoking gun, if any:
SELECT details FROM crash_logs WHERE event_type='suspected_crash' ORDER BY created_at DESC LIMIT 1;
```
A "deployed crashed" report with ONLY `*-ok` + `memory_warning` + one clean `server_start` and no `suspected_crash`/`memory_critical`/`uncaught_exception` = the app stayed healthy; the user likely saw a transient blank (host DB recycle or a busy/high-memory moment), not a code crash.
