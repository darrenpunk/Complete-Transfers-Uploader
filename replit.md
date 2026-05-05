# Logo Upload and Design Tool

## Overview
This full-stack web application provides a professional and intuitive design experience for positioning logos on various garment templates and generating production-ready vector graphics, primarily for the custom apparel industry. It streamlines logo uploads, layout creation, precise logo placement, scaling, and color management. The project includes a standalone application and an integrated Odoo 16 module. The business vision is to offer a robust, scalable, and cost-effective solution for garment design, aiming for a significant market share in custom apparel.

## User Preferences
Preferred communication style: Simple, everyday language.
Current focus: Core functionality over complex color management features.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing, and TanStack Query for state management.
- **UI Framework**: shadcn/ui on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode, professional color palettes, template grouping, smart zoom, collapsible interfaces, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer, rotated element visual dimension display, dual-canvas system for applique templates, and comprehensive shape tools.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful JSON endpoints.
- **File Handling**: Multer for multipart uploads.
- **Error Handling**: Centralized middleware.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL (via `DATABASE_URL`) with Neon Database serverless driver.
- **Migrations**: Drizzle Kit.

### System Design Choices
- **Storage Management**: Single `DatabaseStorage` instance backed by PostgreSQL for all persistent data.
- **Operation Guard**: Concurrency limiter with queueing and memory-based rejection for heavy operations (PDF generation, file uploads, SVG extraction), using container-level cgroup memory monitoring.
- **Smart DPI System**: Dynamically selects Ghostscript rendering DPI based on PDF file size and memory pressure.
- **Crash Logging System**: Persistent PostgreSQL table records server lifecycle events.
- **PDF Health Monitor**: `server/health-monitor.ts` runs end-to-end probes with email alerts for failures. Three probe types: light (A6 placeholder every 15min), stress (Rainbow Dog 7.9MB on A3 every 60min), and upload pipeline (HTTP multipart POST every 30min testing multer → Ghostscript bbox → pdf2svg/Inkscape → PNG thumbnail). Upload probe creates a real project, uploads a test PDF via the actual HTTP endpoint, verifies the conversion pipeline produced valid SVG/PNG with correct dimensions, then cleans up all artifacts.
- **Concurrent User Metrics**: `/api/admin/analytics/concurrent` provides time-bucketed distinct-session counts and current/peak active users for the Admin Dashboard.
- **Upload Health Endpoints**: `GET /api/admin/health/upload` (manual trigger, no alert email) and `GET /api/admin/health/upload/history` (recent upload-health-* logs). Configured via `UPLOAD_HEALTH_CHECK_INTERVAL_MIN` env var (default 30).
- **Health Probes Dashboard**: Admin dashboard "Health Probes" tab showing status cards for all three probe types (Light, Stress, Upload) with last result, duration, schedule, memory usage, and "Run Now" buttons. Combined probe history table with type/status/message/duration columns.
- **PDF Regression Validation**: `npx tsx tests/run-pdf-regression.ts` registered as a `pdf-regression` validation command for CI-style repeatable checks.
- **Color Workflow Isolation**: `ColorWorkflowManager` for robust vector/raster color handling and CMYK preservation.
- **Single Colour Reflective Templates**: Reflective templates (id prefix `reflective-`, labels suffixed "Reflective") behave identically to Single Colour and Zero templates — default grey garment colour (#929292), ink panel visible with silver-only options (Silver Reflective filtered via `templateId.includes('reflective')` in `ink-color-modal.tsx`), and uploaded artwork auto-recoloured to silver. Single-colour classification is checked across 11 sites in `server/storage.ts`, `server/routes.ts`, `server/enhanced-cmyk-generator.ts`, `client/src/pages/upload-tool.tsx`, `client/src/components/canvas-workspace.tsx`, `client/src/components/pdf-preview-modal.tsx`, `client/src/components/tools-sidebar.tsx`, and `client/src/components/color-picker-panel.tsx`, all using the pattern `template.group === "Screen Printed Transfers" && (label.includes("Single Colour") || label.includes("Zero") || label.includes("Reflective"))`.
- **Mixed Content Detection**: `MixedContentDetector` identifies mixed raster/vector content in uploaded files.
- **Raster Upload Sizing**: Automatic scaling of direct PNG/JPEG uploads.
- **Raster Ink Recoloring**: Supports transparent and opaque PNGs with ink fills.
- **File Upload System**: Local filesystem storage, chunked uploads, multi-tier PDF conversion, PNG thumbnail generation, and automated complex vector file detection with PNG fallback.
- **Landscape Template Auto-Detection**: Automatically detects landscape PDFs on portrait templates and suggests switching.
- **Canvas System**: Interactive workspace with multi-select, group move, resize, rotation, comprehensive shape tools, and dual-canvas mode.
- **Vector Bounds Extraction**: Two-phase content bounding box detection using Ghostscript and Inkscape.
- **Vectorization Services**: Detection of raster files with options for photographic approval and professional vectorization service requests.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All," "Center All," and alignment to safety margins.
- **PDF Generation**: Multi-page PDF output supporting single and multi-color garment orders, CMYK output with ICC profiles, vector preservation, ink recoloring, and applique forms.
- **Preflight Checks**: Help guides, required project naming, CMYK analysis, color standardization, font detection, bounding box accuracy, typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection, and Canvas-PDF matching.
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" functionality.
- **Support System**: Integrated contact support form storing tickets in PostgreSQL.
- **Order History**: Customer-facing page displaying past artwork orders with PDF downloads and reorder functionality.
- **Cart-Integration Resilience**: `safeReadFile` helper and in-memory blank A3 PDF fallback for placeholder PDFs prevent data loss during I/O errors.
- **Full-Page Match Analyzer**: `server/full-page-match.ts` provides a consolidated decision-making function for determining if a source PDF is a full-page match for a template, resolving previous bug families.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Customer Template Assignments**: Admin-managed system for assigning exclusive templates to specific customers. The `/api/template-sizes` filter (`server/routes.ts:6588`) treats an `-landscape` id as unlocked when the customer has either the variant id or its base portrait id assigned, so a single assignment surfaces both auto-generated orientation flips. Applies to both `customerExclusive` templates (e.g. Next-Day DTF) and ordinary restricted assignments. Currently surfaces auto-generated landscape flips for `dtf-SRA3-next-day` (320×450 → `dtf-SRA3-next-day-landscape` 450×320, label "SRA3 Next DAY Landscape") and `dtf-large-next-day` (1000×550 → `dtf-large-next-day-landscape` 550×1000, label "1000x550mm Next Day Portrait" — naming inherited from the existing `dtf-large-landscape` auto-flip behaviour).
- **Customer Features System**: Extends customer_templates to flag per-customer feature access via magic template IDs.
- **Odoo Module Enhancements**: Automatic project comments, garment color inclusion in sales orders, hot deployment, robust error handling, and integrated PDF processing.
- **PDF Regression Test Suite**: `tests/run-pdf-regression.ts` runs end-to-end tests against a live server for critical PDF generation paths. Drives 15 fixtures in `tests/pdf-fixtures/fixtures.json`; **8 currently enabled** covering the orientation guards (teddy/waterford), narrow-template scaling (roadstone), rotated full-page-match (BEM), legitimate full-page landscape with gradients (MTSG, counter-test for the teddy fix), the manual Outline Fonts button (illustration-brown — runner POSTs `/api/logos/:id/outline-fonts` between upload and placement, controlled by `outlineFonts: true` flag in the fixture JSON; gracefully no-ops on PNG-fallback uploads via the 400 'only available for SVG' soft skip), a 7.9 MB complex multi-color file (rainbow-dog — single-colour smoke test that exercises the full HTTP path independent of the in-process stress probe), and the **DTF passthrough scale-up guard** (fixture 15: A4 source uploaded to `dtf-large` 1000×550mm template, canvas element scaled to 778.8×548mm; output page must be template-sized not A4). The remaining 7 fixtures are disabled with explicit notes documenting what runner extension each needs (UI variant-switch simulation, imposition route, applique form data, dedicated DTF-passthrough-natural-size assertions, or 35MB upload that's intentionally too slow for dev sandbox). Run via `npx tsx tests/run-pdf-regression.ts` (all enabled) or `--only=<id-substring>` for targeted runs; set `PDF_REGRESSION_BASE_URL` to point at staging/production.
- **DTF Passthrough Safety Gate**: `server/routes.ts:1378` only takes the fast passthrough path (serve original PDF directly, append canvas screenshot) when ALL of: source page dimensions match the template within ±3% (orientation-locked, no W↔H swap), canvas element matches source's natural size within ±3%, element is at the canonical origin (x,y≈0) within ±3% of template, and rotation is exactly 0°. Otherwise falls through to the full canvas-based generator so user scaling/positioning/rotation is honored. Passthrough emits source bytes verbatim and cannot apply any transform, so the gate is intentionally conservative. Fixes the bug where any single-element DTF layout was treated as production-ready, shipping the source as-is regardless of canvas scale.

## External Dependencies

### Frontend Dependencies
- **UI Components**: Radix UI.
- **Form Handling**: React Hook Form with Zod validation.
- **File Upload**: React Dropzone.
- **Utilities**: `date-fns`, `clsx`.

### Backend Dependencies
- **Database**: `@neondatabase/serverless` (PostgreSQL connections).
- **ORM**: `drizzle-orm` with `drizzle-zod`.
- **File Upload**: `multer`.
- **Session Management**: `connect-pg-simple` (PostgreSQL session storage).
- **Image Processing**: Ghostscript, ImageMagick, `rsvg-convert`.
- **PDF Manipulation**: `pdf-lib`.
- **Support Tickets**: PostgreSQL database.
- **Odoo Module Specific**: ReportLab (for PDF generation).