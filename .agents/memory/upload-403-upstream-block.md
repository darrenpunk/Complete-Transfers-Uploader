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
