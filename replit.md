# Logo Upload and Design Tool
A full-stack web application for designing and generating production-ready vector graphics of logos on garment templates.

## Run & Operate
- **Run Dev**: `npm run dev`
- **Build**: `npm run build`
- **Typecheck**: `npm run typecheck`
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

- **Base64-JSON Upload Fallback on ALL Entry Points** (`client/src/lib/upload-with-fallback.ts` + `server/routes.ts` `/logos/base64`, shipped 2026-06-02): customer reported "this file (and all these files) won't upload on the deployed app but work in dev." Root cause was NOT our code: in production an upstream WAF/proxy resets the socket on binary `multipart/form-data` uploads (server-side `[ERROR] 500: aborted` at Node `abortIncoming`; client-side xhr `error` event status 0). Worker was healthy (prod `crash_logs` had ZERO `memory_critical`/`suspected_crash`/`uncaught_exception` in the window) and identical files upload fine in dev. The base64-JSON fallback (decodes → temp files → internal localhost multipart replay) already rescued the MAIN dropzone path, but two OTHER client upload XHRs had NO fallback and died with a bare "Upload failed": the sidebar add-logo mutation (`tools-sidebar.tsx`) and the embroidery-canvas upload (`upload-tool.tsx handleEmbroideryFileUpload`, sends `canvasIndex=1`). Fix: extracted `uploadLogosWithFallback()` (multipart first → retry ONCE via `/logos/base64` on 403 OR connection-error, guarded by `!isFallback` + 80MB cap; supports optional `canvasIndex` + progress callbacks) and wired both unprotected paths to it; the main dropzone `sendUpload` is untouched. Server `/logos/base64` now forwards optional `canvasIndex` into the internal replay so embroidery uploads still land on canvas 1 via the fallback. Verified: pdf-regression 8/8, my files typecheck-clean (project has ~50 pre-existing baseline tsc errors unrelated to this), architect PASS. Watch deployment logs: every `[ERROR] 500: aborted` for an upload should now be followed within ~1s by `🔁 [BASE64 FALLBACK] Replaying`. If aborts appear WITHOUT a following fallback line, a new upload entry point was added with a raw multipart XHR instead of the shared helper.

- **Distributed-White-Content vs Background-Rect in Upload Bounds Verification** (`server/routes.ts:~5460-5560`, shipped 2026-06-02): customer uploaded an A3 **portrait** PDF (`ElectricReefRawRun.pdf`, MediaBox 837.769×1192.61pt = 295.5×420.7mm) of white/light text + art on a dark garment. Two symptoms: (1) detected content bounds came back as a 294×123mm landscape-shaped strip → most of the artwork cropped out, and (2) the template auto-flipped to landscape. Root cause: `gs -sDEVICE=bbox` reports the **inked-pixel** bbox only — white/light ink falls under its threshold, so it returned just the non-white strip at the bottom of the page. The existing `inkscape --query-all` verification correctly recovered full-page bounds, but the "background-rect safeguard" `shouldTrustGSOverInkscape = inkscapeIsFullPage(>0.85) && gsBboxPageCoverage(>0.20)` (built for Corel exports with an invisible page-sized `<rect>`) was too broad: it fired on ANY full-page Inkscape result and discarded the correct bounds, keeping the wrong GS strip. Fix: full-page-ness alone can't tell a background RECT from genuine distributed white content — use the LARGEST SINGLE ELEMENT. A background rect is ONE element that alone ≈ covers the page (single-element coverage ~1.0); distributed white content is MANY small glyph/path elements whose UNION is full-page but whose largest single member is a small fraction of the page (this file: ~9%). Added `maxSingleElementCoverage = inkscapeMaxElementArea / inkscapeRootArea` (both from RAW `--query-all` px — NOT page-clamped values, since clamping mixes px/pt and corrupts the dimensionless ratio) and gated the safeguard with `dominatedBySingleElement (>0.85)`: `shouldTrustGSOverInkscape = inkscapeIsFullPage && gsBboxPageCoverage>0.20 && dominatedBySingleElement`. Falls back to `true` (old behaviour) if root area couldn't be measured. The root `<svg>` (line 0 of `--query-all`) is skipped from the union bbox but its w,h IS read to compute `inkscapeRootArea`. For this file: largest element ~9% → not dominated → Inkscape trusted → correct 295×420mm portrait, no flip. Corel background-rect (~100% single element) → still trusts GS, no regression. Verified e2e (upload returns 836×1190pt portrait; browser confirms 295.1×420.0mm; no landscape flip) + pdf-regression 8/8 (incl. background-rect fixtures teddy-landscape, waterford-crest) + typecheck clean. Known accepted tradeoff: a single genuinely-huge white compound path (>85% of page) that GS misses would still be treated like a background rect (rare). Watch for new tickets where uploaded canvas dims come back portrait/larger when they should be landscape/small — would mean a correct GS strip is now being overridden.

### Stable invariants (load-bearing rules — don't break)

- **Add-to-Cart Body Size Alignment**: Client-side `pdfBase64` inline cap (190MB) is strictly below the server's `express.json` limit (200MB) to prevent 413 errors before handler execution. The `PDF_INLINE_MAX_CHARS` (40MB) dictates when PDFs are offloaded via `attach-pdf` due to Odoo's ~40MB body limit.
- **DTF Passthrough Safety Gate**: Fast passthrough (serving original PDF directly) only occurs if source dimensions, canvas element size, position, and rotation precisely match the template and source, otherwise full canvas generation is used.
- **Single Colour Reflective Templates**: These templates (e.g., `reflective-tshirt`) automatically recolor uploaded artwork to silver and use a default grey garment color, with ink panel restricted to silver options.
- **Single Colour Recolour Skip List** (`server/svg-recolor.ts`): only skip true non-paints (`none`, `transparent`, `currentColor`, `url(#…)`). White is NOT skipped — uploaded reverse-out logos (white text/shapes meant for dark backgrounds) must recolour to the chosen ink, otherwise they're invisible on the canvas/preview and the user assumes recolour failed. If a customer ever needs a literal white knock-out, they should use `fill="none"`.
- **Deployment Image Size (8 GiB Reserved-VM cap)**: Replit Reserved VM does NOT honor `.replitignore`/`.deployignore` — the workspace IS the image. Runtime-required CMYK assets (ICC profile, Vector_Service fallback PDF) live in `server/assets/`, NOT `attached_assets/`, so dev-attached samples in `attached_assets/` (PDFs, screenshots) can be pruned without breaking production. `uploads/` is customer artwork written at runtime — must be migrated to Object Storage / Dropbox to permanently solve the size problem on a long-lived deployment.
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
