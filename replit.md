# Logo Upload and Design Tool
A full-stack web application for designing and generating production-ready vector graphics of logos on garment templates.

## Run & Operate
- **Run Dev**: `npm run dev`
- **Build**: `npm run build`
- **Typecheck**: `npx tsc --noEmit` (there is NO `typecheck` npm script)
- **Codegen**: `npm run codegen`
- **DB Push**: `npm run db:push`
- **Required Env Vars**: `DATABASE_URL`, `FRONTEND_URL`, `SESSION_SECRET`, `ODOO_URL`, `ODOO_DB`, `ODOO_UID`, `ODOO_PASSWORD`, `GHOSTSCRIPT_PATH`, `INKSCAPE_PATH`, `RSVG_CONVERT_PATH`

## Stack
- **Frontend**: React 18, TypeScript, Wouter, TanStack Query, shadcn/ui, Radix UI, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **ORM**: Drizzle ORM (PostgreSQL dialect)
- **Database**: PostgreSQL (Neon Serverless Driver)
- **Validation**: Zod
- **Build Tool**: Vite

## Where things live
- `client/`: Frontend React application.
- `server/`: Backend Express.js application.
- `server/db/schema.ts`: Database schema definition (source of truth for DB).
- `server/routes.ts`: API endpoint definitions.
- `client/src/theme/`: Frontend theme configuration.
- `tests/`: End-to-end and regression tests.
- `server/health-monitor.ts`: PDF generation health probes.
- `server/robust-pdf-generator.ts`: Core PDF generation logic.
- `server/assets/`: Runtime-required assets (ICC profile `PSO_Coated_FOGRA51.icc`, fallback `Vector_Service.pdf`). Kept here (not `attached_assets/`) so the deployment image can safely exclude `attached_assets/`.

## Architecture decisions
- **Monorepo Structure**: Shared TypeScript types between frontend and backend for consistency.
- **Robust PDF Generation**: Employs Ghostscript, ImageMagick, `rsvg-convert`, and `pdf-lib` for multi-tier PDF conversion, CMYK output, and vector preservation.
- **Dynamic Concurrency Management**: `OperationGuard` limits concurrent heavy operations (PDF generation, file uploads) using cgroup memory monitoring to prevent server overload.
- **Comprehensive Health Monitoring**: End-to-end probes (Light, Stress, Upload) with email alerts and an Admin Dashboard for real-time status.
- **Embedded-PDF Deduplication**: Caches `pdfDoc.embedPdf` results during imposition to drastically reduce output PDF size and avoid Odoo API limits.

## Product
- Logo upload, precise placement, scaling, rotation, and color management on garment templates.
- Multi-page PDF output for single and multi-color orders, CMYK, and applique forms.
- Interactive canvas with multi-select, grouping, shape tools, and dual-canvas mode.
- Preflight checks for print readiness (CMYK analysis, font detection, bounding box accuracy).
- Customer-facing order history, reorder functionality, and support ticket system.
- Integration with Odoo 16 for order management and PDF processing.

## User preferences
Preferred communication style: Simple, everyday language.
Current focus: Core functionality over complex color management features.

## Gotchas

> **Reading order:** Start with **Active**, then **Stable invariants**, then **Resolved**. Active = recently shipped, watch for regressions. Stable = rules current code depends on, don't break. Resolved = past incidents whose fix has been stable in production but the context is preserved here for future debugging.

### Active (recently shipped, monitor in production)

- **Large-PDF upload 500 (memory watchdog killed mid-upload)** (shipped 2026-07-21; detail in `.agents/memory/large-pdf-upload-oom.md`): a 75MB PDF upload crashed prod because (a) the upload path did `fs.readFileSync` + full `pdf-lib` `PDFDocument.load` just to read page boxes, spiking RSS past the 400MB watchdog line, and (b) the watchdog `process.exit(1)`'d 3s later, mid-upload → customer 500. **Two load-bearing rules now in code:** (1) ALL page-box reads on the upload path go through `getPdfBoxesLight()` in `server/routes.ts` (tier 1 `pdfinfo -box`, tier 2 GS MediaBox, tier 3 pdf-lib ONLY for files <30MB) — never add a raw `PDFDocument.load(readFileSync(...))` for box reading; (2) the memory watchdog in `server/index.ts` DEFERS its exit while OperationGuard reports active customer ops (bounded at 180s, stale-clock guard resets the window if the previous incident's trigger is >3 check-intervals old). **Watch prod logs for:** `restart DEFERRED` memory_warning rows = deferral working; a `memory_critical` exit during an active upload = regression.

- **Upstream WAF/proxy breaks customer flows on the DEPLOYED app — saga + safe-retry rules** (shipped 2026-06-02→04; full blow-by-blow in [`docs/gotchas-archive.md`](docs/gotchas-archive.md) and `.agents/memory/upload-403-upstream-block.md`): an upstream proxy/network layer (NOT our code — worker stays healthy, identical files work in dev; and confirmed NOT Odoo.sh or the completetransfers.com website — dev verified there is no WAF there, 2026-06-05) intermittently breaks uploads + add-to-cart on certain customer networks via **4 signatures**: (1) **403** edge-reject (pre-commit, request never reaches Express), (2) **socket reset** (xhr `error`, status 0), (3) **silent HANG** mid-send (no event, progress freezes), (4) **hang AFTER full send** while withholding the response. Diagnosis: prod `crash_logs` show `[ERROR] 500: aborted` at Node `abortIncoming` with ZERO `memory_critical`/`suspected_crash` rows → upstream, not OOM. **Where the interfering layer actually is:** customer upload XHRs use RELATIVE URLs, so they hit OUR app's origin directly (the iframe is served from the Replit deployment domain) and do NOT pass through Odoo.sh — so the culprit is either the app's own edge (Replit hosting / any CDN on the app's domain) or, most consistent with the customer-specific + intermittent pattern, the **customer's own corporate proxy / DLP / antivirus** (which can itself return a 403, reset the socket, or hang the upload to the browser without the request ever reaching us). The fixes below are network-agnostic — they recover regardless of which layer is responsible. **Load-bearing rules now in code — don't regress:**
  - **Every upload entry point MUST use the shared `client/src/lib/upload-with-fallback.ts` helper, never a raw multipart XHR.** It tries multipart, then replays ONCE as base64-JSON to `/logos/base64` (server decodes → temp file → internal localhost multipart replay). The 4 client paths: main dropzone, sidebar add-logo, embroidery (`canvasIndex=1`), vectorization form.
  - **A STALL watchdog is required to catch the hang signatures** — re-armed on each `xhr.upload` progress event (~30s mid-send), and DON'T clear it at 100%: RE-ARM it (~45s) because a small file hits 100% instantly and the hang can come after the bytes are sent.
  - **ORDER-creating endpoints have stricter retry rules** (a blind retry can DUPLICATE AN ORDER): the vectorization form retries ONLY on 403 (pre-commit, nothing was committed); add-to-cart retries reset/hang too but ONLY because it is made safe by a **server-side "settle exactly once" idempotency store** keyed by a client `X-Idempotency-Key` (one UUID per click) — the first request is the leader (single Odoo call), same-key retries return its cached result or coalesce as waiters, never a second call. `fetchOdoo()` has a hard 180s `AbortController` so the leader always settles (no forever-parked waiters); sweep only evicts SETTLED entries. Client does NOT auto-retry 500. Logo upload (`/logos`) may retry freely because a duplicate is at worst a deletable LOGO.
  - **Base64 endpoints need admission control BEFORE `express.json`** (`BASE64_FALLBACK_PATH` regex in `server/index.ts`) — the JSON parser buffers the whole body, so a route-level concurrency cap is too late (OOM vector).
  - **Watch deployment logs:** every upload `[ERROR] 500: aborted` should be followed within ~1s by `🔁 [BASE64 FALLBACK] Replaying`; a same-key add-to-cart retry logs `♻️/⏳ [IDEMPOTENT]`. An abort with NO following fallback = a new entry point bypassed the shared helper. **Accepted residual:** if Odoo commits but the server fetch aborts at 180s, a *manual* re-click mints a new key → possible duplicate; only fixable with Odoo-side idempotency (out of scope) — do NOT "fix" it by making the client auto-retry 500.

- **Distributed-White-Content vs Background-Rect in Upload Bounds** (`server/routes.ts` upload bounds verification, shipped 2026-06-02; full detail in archive): `gs -sDEVICE=bbox` reports only the INKED-pixel bbox, so white/light art on a dark garment returns a cropped strip and can trigger a wrong landscape auto-flip. `inkscape --query-all` recovers full-page bounds, but the old "background-rect safeguard" wrongly discarded them for ANY full-page Inkscape result. Fix: distinguish a real background RECT (ONE element ≈ covers the page) from genuine distributed white content (MANY small elements, largest single ~9%) via `maxSingleElementCoverage` from RAW px `--query-all`; only trust GS over Inkscape when `dominatedBySingleElement (>0.85)`. Watch for: uploaded canvas dims coming back portrait/larger when they should be landscape/small.

### Stable invariants (load-bearing rules — don't break)

- **Add-to-Cart Body Size Alignment**: Client-side `pdfBase64` inline cap (190MB) is strictly below the server's `express.json` limit (200MB) to prevent 413 errors before handler execution. The `PDF_INLINE_MAX_CHARS` (40MB) dictates when PDFs are offloaded via `attach-pdf` due to Odoo's ~40MB body limit.
- **DTF Passthrough Safety Gate**: Fast passthrough (serving original PDF directly) only occurs if source dimensions, canvas element size, position, and rotation precisely match the template and source, otherwise full canvas generation is used.
- **Single Colour Reflective Templates**: These templates (e.g., `reflective-tshirt`) automatically recolor uploaded artwork to silver and use a default grey garment color, with ink panel restricted to silver options.
- **Single Colour Recolour Skip List** (`server/svg-recolor.ts`): only skip true non-paints (`none`, `transparent`, `currentColor`, `url(#…)`). White is NOT skipped — uploaded reverse-out logos (white text/shapes meant for dark backgrounds) must recolour to the chosen ink, otherwise they're invisible on the canvas/preview and the user assumes recolour failed. If a customer ever needs a literal white knock-out, they should use `fill="none"`.
- **Deployment Image Size (8 GiB Reserved-VM cap)**: Replit Reserved VM does NOT honor `.replitignore`/`.deployignore` — the workspace IS the image. Runtime-required CMYK assets (ICC profile, Vector_Service fallback PDF) live in `server/assets/`, NOT `attached_assets/`, so dev-attached samples in `attached_assets/` (PDFs, screenshots) can be pruned without breaking production. **SOLVED for `uploads/`:** customer artwork is now a write-through CACHE backed by Replit Object Storage (`server/object-storage.ts`) — a background pruner keeps local `uploads/` under a 1.5 GiB budget (deleting only files confirmed in the bucket), and a lazy `ensureLocal()` restore at every read point re-downloads on a local miss. This permanently bounds the image AND restores cross-redeploy durability (prod `uploads/` is ephemeral). Full rules: [`.agents/memory/uploads-object-storage-cache.md`](.agents/memory/uploads-object-storage-cache.md) — don't break the "never delete a local file not confirmed in the bucket" invariant, the post-recolor immediate backup, or the pin/unpin prune-safety.
- **Landscape Template Variant Naming** (`server/storage.ts` template seed data): portrait/landscape template pairs use the `-landscape` suffix on the `id` (NOT the `name`). E.g. `uvdtf-A3` (id) / `uv_dtf_A3` (name) → `uvdtf-A3-landscape` (id) / `uv_dtf_A3_landscape` (name). The client auto-switch logic in `upload-tool.tsx` toggles by appending/stripping `-landscape` on the templateId. Both variants share the same `productCode` (e.g. `CTUVDTFA3`) so Odoo treats them as the same product. When adding a new template that should support orientation auto-switch, ALWAYS create both portrait and landscape variants in the seed data with this naming convention.
- **Canvas Preview Rasterizer** (`server/routes.ts:~1037` `generateCanvasPreviewPng`): `logo.filename` may be a PNG preview (PDF uploads), an SVG, or an image. Always pick the source by extension and only invoke `rsvg-convert` on `.svg`. Feeding PNG to rsvg silently fails per element (e.g. 144× on imposition), wasting ~5s and flooding logs. Also: skip preview entirely when `canvasElements.length > 40` (canvas screenshot already covers it). Per-call rasterization is cached by source path to deduplicate repeated logos in a layout.
- **Crash Forensics Ringbuffer** (`server/request-tracker.ts` + `server/index.ts:~43-72`): the OOM watchdog calls `process.exit(1)` after `RSS > MEMORY_RESTART_MB (400 MB)`, and Replit only retains deployment logs from the *currently running* deployment — so any republish after a crash wipes the evidence. A 50-slot in-memory ring of `{ts, method, path, email, bytesIn, status, durationMs, rssMbAtStart, rssMbAtEnd}` is fed by an Express middleware mounted right after `express.json` so it sees the parsed body (for email extraction). When `persistCrashLog` fires for any forensic event type (`memory_critical` | `memory_warning` | `uncaught_exception` | `unhandled_rejection` | `suspected_crash`) it attaches `{recentRequests, inFlightRequests, activeOpsDetail}` to the row's `details` JSON BEFORE the watchdog's exit timer fires, so the snapshot survives the kill. On next startup the suspected-crash detector hunts the previous instance's window for a `memory_critical` row with forensics and lifts them into the new `suspected_crash` row, so "what crashed it" is answerable from a single DB row: `SELECT details FROM crash_logs WHERE event_type='suspected_crash' ORDER BY created_at DESC LIMIT 1`. Skips chatty endpoints (`/api/version`, `/health`, `/ping`, `/api/analytics/heartbeat`) so the ring stays focused on real work. Bodies are NEVER stored — only `Content-Length` — to keep the tracker itself memory-safe under load. Email extraction order: `X-Partner-Email` header → `req.query.email`/`userEmail` → `req.body.userEmail`/`email` (re-attempted at finish in case body wasn't parsed at request-start time, e.g. multipart uploads).

### Resolved production incidents

Historical context for incidents whose fix has been stable in production is archived in [`docs/gotchas-archive.md`](docs/gotchas-archive.md). Scan it when debugging a regression that might match a past symptom (embed dedup, attach-pdf 4xx, OOM-during-gen, auto-crop top-left, etc.) before assuming a brand-new bug.

## Pointers
- **Odoo Module**: Refer to Odoo 16 documentation for integrated module details.
- **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **React Hook Form**: [https://react-hook-form.com/](https://react-hook-form.com/)
- **TanStack Query**: [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **Tailwind CSS**: [https://tailwindcss.com/](https://tailwindcss.com/)
- **PDF-LIB**: [https://pdf-lib.js.org/](https://pdf-lib.js.org/)
