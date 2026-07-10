---
name: Upload 403 = upstream content-scanner, not our code
description: How to triage a customer "403 on upload" ticket for the Odoo iframe artwork app
---

# Customer "403 when uploading <file>" tickets

**Rule:** A 403 on file upload that is NOT visible in our deployment logs is almost
always an **upstream WAF / content-scanner false-positive on the PDF's byte content**
(or the customer's own corporate proxy/DLP) — NOT a bug in our Express app. Our app
has no 403 path on the upload route (`POST /api/projects/:id/logos`); a multer reject
surfaces as a logged 500, never a 403.

**Why:** confirmed via a live ticket — the customer's JSON requests (project create,
template-sizes, customer-features) reached our server in prod logs, but the multipart
upload POST for the specific file was **completely absent** from logs, while OTHER
customers' uploads succeeded the same hour. The same file uploaded & processed fine
locally (HTTP 200, correct content bounds + CMYK). So the request was killed before
reaching Express, and only for that file's bytes.

**How to triage fast:**
1. Reproduce locally: create a project for the template, `curl -F files=@file` to
   `localhost:5000/api/projects/<id>/logos`. If 200 → our code/file are fine.
2. Grep deployment logs for the customer email. If their JSON calls appear but the
   `POST .../logos` + `[UPLOAD CTX]` / `[OP-GUARD] upload` lines do NOT → blocked upstream.
3. Note: `https://www.completetransfers.com/artwork/api/...` paths are **Odoo
   controllers** (Werkzeug type='json' errors), a different layer from our Replit app.

**Tactical unblock (give support a re-exported file):** re-encode the PDF to change its
byte/stream layout so the signature no longer matches, losslessly preserving vectors +
CMYK:
`gs -o clean.pdf -sDEVICE=pdfwrite -dCompatibilityLevel=1.6 -dColorConversionStrategy=/LeaveColorUnchanged -dPreserveAnnots=true in.pdf`
Then verify equivalence by uploading clean.pdf locally and comparing contentBounds +
svgColors cmyk values. (Do NOT add `-dColorImageFilter` — causes a gs `rangecheck`.)

**Systemic option (needs sign-off, only if recurring):** a base64-in-JSON upload
fallback reliably evades binary content scanners; the existing chunked path sends RAW
binary chunks so it does NOT help. Real fix is a WAF allowlist on the CompleteTransfers
domain — outside this codebase.

## Triage: "basket emptied + order shows no artwork" (uploads OK, cart step failed)

When a customer reports their **basket kept emptying** and an order shows **no artwork**,
it is usually NOT lost upload data on our side. Check the prod `projects` table
(database skill, `environment:"production"`) for that artwork name: if you find one or
more rows in status `draft` each with `logo_count >= 1`, the upload REACHED us and the
file is stored safely — the failure was later, at the add-to-cart / checkout / Odoo
session step. Repeated draft rows for the same artwork (e.g. 07:06, 07:08, 14:01, 14:10)
= the customer re-trying because the cart kept dropping. Cross-check `crash_logs`: if the
worker was healthy (probes OK, no `suspected_crash`/`memory_critical`) and other customers'
projects that same window have `logo_count 1`, the breakage is customer-session/network
(their proxy/DLP dropping the Odoo session cookie → Odoo starts a fresh empty cart), not
our code. **Recovery for support:** the artwork is retrievable from the stored draft
project's logo — hand it back so the order can be rebuilt; the customer does NOT need to
re-upload. Basket-emptying itself is Odoo/session-level and not fixable in our iframe
unless it starts hitting MANY customers (then it is systemic, investigate cart/session).

## SHIPPED: the base64-JSON fallback is now live — durable lessons

- **Re-entrancy:** the base64 fallback decodes JSON → writes temp files → does an internal
  localhost multipart POST to the *real* upload route to reuse the whole pipeline. The outer
  route must NOT take the upload op-guard slot — the inner localhost call already holds it, so
  guarding both self-deadlocks. **Why:** learned the hard way; any "replay into our own route"
  pattern has this trap.

- **Detect the proxy block on BOTH signatures, retry exactly once:** a blocking WAF/proxy may
  return an explicit `403` OR silently reset the connection (client sees a network error /
  status 0). The client falls back on either, guarded so it can't loop and only for payloads
  small enough to re-send as JSON. **Why:** the first cut only caught 403 and would have missed
  the connection-reset variant.

- **Admission control must run BEFORE `express.json()`:** any endpoint accepting a large JSON
  body is a memory-DoS vector — the global `express.json({limit})` buffers and parses the WHOLE
  body before any route handler runs, so a route-level concurrency cap is too late. body-parser
  rejects an oversized *single* request via Content-Length but does NOT bound *concurrency*; N
  concurrent large parses OOM the worker (watchdog exits at RSS>400MB). Fix: a tiny path-scoped
  middleware mounted right before the JSON parser that 413s on oversized Content-Length and holds
  a small in-flight semaphore (release on res `finish`+`close`). **Why:** architect failed the
  first cut precisely because the cap sat after the parser. **How to apply:** reuse this pattern
  for ANY new large-body JSON endpoint, not just uploads.

- **An ORDER-CREATING upload entry point may ONLY auto-retry on a 403 — not on reset/hang.**
  The Vectorization Service form is a 4th upload path, but it POSTs multipart to
  `/api/vectorization-requests`, which (unlike `/logos`) creates a DB row AND adds a line to the
  Odoo cart in the same handler. It had no fallback, so a customer hit a bare "HTTP error!
  status: 403". The fix mirrors `/logos/base64` (server `/api/vectorization-requests/base64`
  decodes → temp file → internal localhost replay into the real multipart route; client retries
  via FileReader→base64 JSON) AND extends the pre-`express.json` admission gate regex in
  `server/index.ts` to cover the new path. **CRITICAL difference from the `/logos` paths:** the
  client retries ONLY on a `403`, never on a connection reset or a hang/timeout. **Why:** a 403 is
  the WAF rejecting at the edge → the request never reached Express → nothing committed → a replay
  can't duplicate the order. A reset/hang can occur AFTER the handler already created the request +
  added to cart (only the response was lost) → retrying would DUPLICATE the cart line. The
  reset/hang recovery used on `/logos` is safe there only because a duplicate is at worst a
  deletable LOGO, never an order. **How to apply:** before routing ANY order-/cart-creating submit
  through a base64 fallback, either keep it 403-only or add a server-side idempotency key first.

- **The fallback must cover EVERY upload entry point, not just the main dropzone.** There are
  3 client multipart upload XHR paths to `POST /logos`: the main dropzone, the sidebar
  "add logo" mutation, and the embroidery-canvas upload. Only the dropzone originally had the
  base64 fallback, so a customer uploading via the sidebar/embroidery hit the same WAF socket-
  abort and got a bare "Upload failed" with NO retry — looking like "the file won't upload"
  even though the dropzone path recovered fine. **Why:** prod deployment logs showed many
  `[ERROR] 500: aborted` rows WITH a following `🔁 [BASE64 FALLBACK]` (dropzone, recovered) but
  also several aborts with NO fallback (the unprotected paths). **How to apply:** all three now
  share `client/src/lib/upload-with-fallback.ts` (`uploadLogosWithFallback`). Any NEW upload
  entry point must use this helper, never a raw multipart XHR. The helper supports optional
  `canvasIndex`; the server `/logos/base64` route forwards it into the internal replay so
  embroidery uploads still land on canvas 1 through the fallback.

- **Diagnosing "uploads work in dev but not deployed":** the smoking gun is `[ERROR] 500:
  aborted` at Node `abortIncoming`/`socketOnClose` (peer closed the socket mid-upload) — that's
  upstream, NOT the worker dying. Confirm the worker is healthy by querying prod `crash_logs`
  (database skill, `environment:"production"`): if there are NO `memory_critical`/
  `suspected_crash`/`uncaught_exception` rows in the window, it is definitively an upstream
  WAF/proxy reset, not OOM.

- **The blocking proxy has THREE signatures, not two — the third is a silent HANG.** A WAF/proxy
  can (1) return 403, (2) RESET the socket (xhr `error`, status 0), OR (3) just **hang** the
  multipart upload mid-stream: progress freezes (customer saw it stuck at 60%), NO `error` and NO
  `load` event ever fires, and only the 2-min `xhr.timeout` eventually fires → a bare "Timeout"
  toast with no retry. The 403+reset fallbacks do nothing for a hang. **Why:** a customer
  uploading an A4 PDF they'd uploaded fine before — froze at 60% then errored after 2 min. **How to apply:** every XHR upload path needs a STALL
  watchdog: a ~30s timer re-armed on each `xhr.upload` progress event while percent<100, cleared
  at 100% (server-processing phase — NO more upload progress is expected, do NOT treat that wait
  as a stall), and armed once right after `xhr.send()` (covers a hang before the first progress
  event). On stall → abort + base64 fallback. Also make the `timeout` handler fall back. Guard
  ALL terminal paths (load/error/timeout/stall) with one `handled` boolean so exactly one fires.

- **Don't clear the stall watchdog at 100% — RE-ARM it (the hang can come AFTER the bytes are
  sent).** First attempt gated the timeout fallback on `!reachedFullUpload` (idea: once all bytes
  are sent a timeout = slow server, re-submitting would duplicate). That guard BROKE small uploads:
  a tiny file (~387KB) reaches 100% instantly → `reachedFullUpload` true + stall timer cleared →
  the proxy then HANGS while withholding the server response → no error, no stall, and the gated
  timeout never retries → bare "Timeout", no recovery (a customer with a small ~387KB file, repeated
  `[ERROR] 500: aborted` ~2 min apart with NO base64 replay in prod logs). **Fix:** at 100% don't
  clear the watchdog — re-arm it with a longer post-upload window (~45s) so a hang-after-send falls
  back; make the 2-min timeout retry unconditionally too (backstop). **Why the duplicate fear was
  overblown HERE:** this XHR posts ONLY to `/logos` (logo upload); add-to-cart is a SEPARATE
  mutation (`addToCartMutation` → `/add-to-cart`), so a retry can at worst make a duplicate LOGO
  (visible/deletable), never a duplicate ORDER. And a normal `/logos` POST finishes in ~3s in
  prod, so a 45s post-send silence is unambiguously a hung proxy, not slow processing. User prefers
  silent recovery over a hard failure, so the rare duplicate-logo tradeoff is accepted. **How to
  apply:** make `armStallTimer(ms = STALL_MS)` take a duration; call `armStallTimer(45000)` at 100%
  instead of clearing. If you ever route an ORDER-creating submit through this helper, restore an
  idempotency guard (server-side key) — the duplicate tradeoff is only safe for logo uploads.

- **The order-creating path (add-to-cart) is now safe to retry through the WAF — via server-side
  idempotency, not client cleverness.** This closes the loop on the repeated "restore an idempotency
  guard before retrying order-creating submits" warnings above. The durable pattern: have the CLIENT
  mint ONE idempotency key per click (UUID) and reuse it across that click's network retries; the
  SERVER keeps a "settle exactly once" store keyed by it — the first request is the *leader* (runs the
  single Odoo call), same-key retries either return the cached outcome or COALESCE as waiters onto the
  leader and get its exact result, so a same-key retry can NEVER start a second Odoo call. **The two
  load-bearing invariants that make it correct:** (1) every terminal exit (success AND all failures)
  must call the single `settle(status, body)` (once-guarded) or a coalesced waiter parks forever; (2)
  the upstream call MUST be time-bounded (an `AbortController` timeout — the add-to-cart Odoo fetch had
  NONE) so the leader is guaranteed to settle, otherwise a hung upstream pins the entry and parks every
  waiter forever (the architect failed the first cut on exactly this). Sweep only evicts SETTLED entries
  so an in-flight leader is never deleted out from under its waiters. **Why client auto-retry alone is
  NOT enough and is dangerous here:** a reset/hang can happen AFTER Odoo committed (only the response
  lost), so a blind client retry duplicates the ORDER — the server key is what makes the retry a no-op.
  Correspondingly the client must NOT auto-retry a 500 (only 403/502/503/504 + conn-errors/timeout), so
  a leader that settles 500 (e.g. the 180s upstream abort) is a hard failure, not a duplicate trigger.
  **Accepted residual:** if Odoo commits but the server aborts before reading the response, the key
  settles 500 and a user *manually* re-clicking mints a NEW key → possible duplicate. Truly fixing that
  needs idempotency at Odoo itself (key→order_line map) or a post-timeout reconciliation lookup — out of
  scope until duplicate-order tickets actually appear.
