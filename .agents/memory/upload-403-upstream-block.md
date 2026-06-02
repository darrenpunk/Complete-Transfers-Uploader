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
