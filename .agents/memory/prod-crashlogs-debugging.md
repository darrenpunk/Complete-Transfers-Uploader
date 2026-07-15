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

## Timestamp format differs BETWEEN tables — 'T' vs space silently empties range queries
**Why:** `crash_logs.created_at` strings use a SPACE (`2026-07-15 13:01:42`) but `projects`/`analytics_events` use ISO `T` (`2026-07-15T13:42:49`). In a string compare `'T' > ' '`, so an upper bound like `< '2026-07-15 14:20'` EXCLUDES every T-format row that day → query silently returns zero rows and the window looks dead when it wasn't.
**How to apply:** match the bound format to the table (`'2026-07-15T14:20'` for projects/analytics), or use `left(created_at,10)` date-only bounds. If a window query on those tables comes back empty but other evidence says there was traffic, suspect this first.

## Instant death with ZERO forensics = sub-second native memory spike (cgroup SIGKILL)
**Why:** a crash that leaves NO `memory_critical`, NO `uncaught_exception`, NO `suspected_crash` details and stops ALL events mid-stream (probes, periodic memory reports, analytics) at low last-seen RSS is a process killed from outside faster than any JS could run — classic cause: one heavy PDF-generation job allocating hundreds of MB of native memory (rasterization/embed) in under the watchdog's sampling interval → platform cgroup OOM killer SIGKILLs node instantly. The self-watchdog (RSS>400MB → graceful exit) only catches GRADUAL growth.
**How to apply:** when crash_logs go silent with no smoking gun, don't stop there — query `analytics_events` for the LAST recorded action before the silence (mind the T-format bounds). An `add_to_cart` (= triggers full production PDF generation) seconds before death, with the project stuck in `draft`, identifies both the culprit job and the customer. Check the project's logo `preflight_data.contentBounds` for absurd artwork dimensions (e.g. 2000mm+ wide raster placed many times on a gang sheet). Also note: the new instance's boot log line `[CRASH DETECTION] Previous shutdown event: <probe>` confirms a dirty death even when no suspected_crash row was written. RECURRENCE RISK: the draft project is still there — the customer re-clicking add-to-cart can kill the server again.

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
