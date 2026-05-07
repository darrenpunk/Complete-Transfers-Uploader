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
- **Embedded-PDF Dedup for Imposition** (`server/robust-pdf-generator.ts:~1531`): pdf-lib's `embedPdf` does NOT deduplicate — calling it once per canvas element creates N independent XObjects. With the imposition tool replicating a logo 20-40 times this used to bloat the output PDF past Odoo's nginx ~40 MB limit (silent ECONNRESET on `/artwork/api/attach-pdf` → order with no artwork, e.g. SO89283 / gemma@portwest.ie / CBRE Front Logo). Cache key = `(pdfDoc × sha1(logoPdfBytes))` via a `__embeddedPdfCache` Map stashed on the pdfDoc. Identical sources are embedded once and reused for every placement.
- **Attach-PDF Resilience Ladder** (`server/routes.ts:~8324`): never warns the customer (which would tempt re-adding and duplicate the order). Pre-shrink: if the offloaded payload already exceeds `PDF_INLINE_MAX_CHARS` (~40 MB base64) we compress with `/ebook` (and `/screen` if still too big) BEFORE attempt-1 — observed in production (SO89393 / MMC DTF, 122 MB source / 164 MB base64) that two nginx-killed attempts (ECONNRESET on body-too-large) silently invalidated the Odoo session, so subsequent re-compressed 0.5 MB attempts then returned HTTP 404 from `/artwork/api/attach-pdf` and the order was created with no artwork. Then 4-attempt escalation: original payload → 1.5 s wait + retry → re-compress with Ghostscript `/ebook` (raster downsampling) → re-compress with `/screen` (most aggressive). `compressPdfBuffer(buf, mode)` accepts `'prepress'|'ebook'|'screen'`. Last-ditch failure logs `❌❌❌ ATTACH-PDF EXHAUSTED` for monitoring only.
- **Add-to-Cart Body Size Alignment**: Client-side `pdfBase64` inline cap (190MB) is strictly below the server's `express.json` limit (200MB) to prevent 413 errors before handler execution. The `PDF_INLINE_MAX_CHARS` (40MB) dictates when PDFs are offloaded via `attach-pdf` due to Odoo's ~40MB body limit.
- **DTF Passthrough Safety Gate**: Fast passthrough (serving original PDF directly) only occurs if source dimensions, canvas element size, position, and rotation precisely match the template and source, otherwise full canvas generation is used.
- **Single Colour Reflective Templates**: These templates (e.g., `reflective-tshirt`) automatically recolor uploaded artwork to silver and use a default grey garment color, with ink panel restricted to silver options.
- **Single Colour Recolour Skip List** (`server/svg-recolor.ts`): only skip true non-paints (`none`, `transparent`, `currentColor`, `url(#…)`). White is NOT skipped — uploaded reverse-out logos (white text/shapes meant for dark backgrounds) must recolour to the chosen ink, otherwise they're invisible on the canvas/preview and the user assumes recolour failed. If a customer ever needs a literal white knock-out, they should use `fill="none"`.
- **Deployment Image Size (8 GiB Reserved-VM cap)**: Replit Reserved VM does NOT honor `.replitignore`/`.deployignore` — the workspace IS the image. Runtime-required CMYK assets (ICC profile, Vector_Service fallback PDF) live in `server/assets/`, NOT `attached_assets/`, so dev-attached samples in `attached_assets/` (PDFs, screenshots) can be pruned without breaking production. `uploads/` is customer artwork written at runtime — must be migrated to Object Storage / Dropbox to permanently solve the size problem on a long-lived deployment.
- **Canvas Preview Rasterizer** (`server/routes.ts:~1037` `generateCanvasPreviewPng`): `logo.filename` may be a PNG preview (PDF uploads), an SVG, or an image. Always pick the source by extension and only invoke `rsvg-convert` on `.svg`. Feeding PNG to rsvg silently fails per element (e.g. 144× on imposition), wasting ~5s and flooding logs. Also: skip preview entirely when `canvasElements.length > 40` (canvas screenshot already covers it). Per-call rasterization is cached by source path to deduplicate repeated logos in a layout.

## Pointers
- **Odoo Module**: Refer to Odoo 16 documentation for integrated module details.
- **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **React Hook Form**: [https://react-hook-form.com/](https://react-hook-form.com/)
- **TanStack Query**: [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
- **Tailwind CSS**: [https://tailwindcss.com/](https://tailwindcss.com/)
- **PDF-LIB**: [https://pdf-lib.js.org/](https://pdf-lib.js.org/)