# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module. Key capabilities include precise logo placement, scaling, color management, and the generation of high-quality, production-ready PDF outputs. The business vision is to offer a robust, scalable, and cost-effective solution for garment design, targeting significant market share in custom apparel.

## User Preferences
Preferred communication style: Simple, everyday language.
Current focus: Core functionality over complex color management features.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing, TanStack Query for state management.
- **UI Framework**: shadcn/ui on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode, professional color palettes, template grouping, smart zoom, collapsible template interface, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer, rotated element visual dimension display, dual-canvas system for applique templates (Badge Artwork + Embroidery Artwork), and comprehensive shape tools with configurable properties.

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
- **Storage Management**: Single shared `DatabaseStorage` instance backed by PostgreSQL for all persistent data (projects, logos, canvas elements, vectorization requests, support tickets).
- **Operation Guard**: Concurrency limiter for heavy operations (PDF generation, file uploads, SVG extraction) with queueing and memory-based rejection to prevent OOM. Uses **container-level cgroup memory monitoring** (not just Node RSS) to accurately track total memory including child processes (Ghostscript, ImageMagick). Non-essential operations (MixedContentDetector, preflight checks) are automatically skipped when container memory exceeds 350MB (dev sandbox threshold; production has more headroom). Dev workflow runs with `--max-old-space-size=384` to fit the small dev sandbox; **production deployment (Reserved VM, 8 GiB RAM) runs with `--max-old-space-size=4096`** so large/complex CMYK PDFs (e.g. 88 MB Vespa Rose) don't get pdf2svg-SIGKILL'd. `MALLOC_ARENA_MAX=2` is set in both environments to limit glibc arena fragmentation.
- **Smart DPI System**: Dynamically selects Ghostscript rendering DPI based on PDF file size and memory pressure, with bitmap allocation caps.
- **Crash Logging System**: Persistent PostgreSQL table records server lifecycle events, accessible via an admin endpoint.
- **Concurrent User Metrics**: `/api/admin/analytics/concurrent` returns time-bucketed distinct-session counts (24h @ 5min or 7d @ 60min) plus current-active count and peak-with-timestamp. Surfaced on the Admin Dashboard's Analytics tab as a "Peak (24h)" KPI tile and an area chart with a 24h/7d range toggle. Polling is gated to the active tab to limit load.
- **Color Workflow Isolation**: `ColorWorkflowManager` for robust vector/raster color handling and CMYK preservation.
- **Mixed Content Detection**: `MixedContentDetector` for identifying mixed raster/vector content in uploaded files, with improved vector detection logic.
- **Raster Upload Sizing**: Automatic scaling of direct PNG/JPEG uploads to fit template usable area.
- **Raster Ink Recoloring**: Supports transparent and opaque PNGs, applying ink fills based on alpha or luminance.
- **File Upload System**: Local filesystem storage, supports chunked uploads for large files, multi-tier PDF conversion with color/vector preservation, PNG thumbnail generation, and automated complex vector file detection with PNG fallback. Includes Safari compatibility features.
- **Landscape Template Auto-Detection**: Automatically detects landscape PDFs on portrait templates and offers to switch to a generated landscape variant.
- **Canvas System**: Interactive workspace supporting multi-select, group move, resize, rotation, and comprehensive shape tools. Dual-canvas mode for applique templates with element-level SVG selection.
- **Vector Bounds Extraction**: Two-phase content bounding box detection using Ghostscript and Inkscape for accurate and non-clipping bounds, with ArtBox priority.
- **Vectorization Services**: Detection of raster files with options for photographic approval and professional vectorization service requests.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All," "Center All," and alignment to safety margins.
- **PDF Generation**: Multi-page PDF output supporting single and multi-color garment orders, CMYK output with ICC profiles, vector preservation, ink recoloring, and applique forms.
- **Preflight Checks**: Help guides, required project naming, CMYK analysis, color standardization, font detection, bounding box accuracy, typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection, and Canvas-PDF matching.
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" functionality.
- **Support System**: Integrated contact support form storing tickets in PostgreSQL.
- **Order History**: Customer-facing page displaying past artwork orders from Odoo with PDF downloads and reorder functionality.
- **Cart-Integration Resilience**: The `/api/vectorization-requests` handler reads placeholder PDFs (`server/placeholders/*.pdf` and `attached_assets/Vector_Service_*.pdf`) for the transfer-product cart line. All placeholder reads now go through a `safeReadFile` helper that returns `null` on `EIO` (or any other I/O error), with a final in-memory blank A3 PDF fallback. This prevents disk-corruption incidents (e.g. broken Nix-store snapshots in production) from silently dropping the transfer-product POST to Odoo while still letting the vectorization-service line succeed.
- **Full-Page Match Analyzer (single source of truth)**: `server/full-page-match.ts` exports `analyzeFullPageMatch(source, template, bounds, tolerancePt?)` — the one decision used by every code path that asks "is this source PDF a full-page match for the template?". Returns a structured analysis with `dimensionalMatch` ('none' | 'direct' | 'rotated'), `isFullPageContent` (coverage > 85% AND every-side margin < 5%), `shouldEmbedFullPage`, `shouldFlipToLandscape`, and a human-readable `reasoning` string for logs. Constants `DEFAULT_DIMENSION_TOLERANCE_PT` (10pt), `FULL_PAGE_COVERAGE_THRESHOLD` (0.85), `FULL_PAGE_MARGIN_PCT_THRESHOLD` (0.05) are exported. Three call sites previously duplicated this decision with subtly different tolerances — that drift was the root cause of the teddy / Waterford / Roadstone / BEM bug family. Now consolidated:
  - `RobustPDFGenerator` orientation pre-detect (~line 390): decides whether to flip output PDF to landscape. Calls analyzer, then layers single-logo + no-element-rotation guards. Refuses to flip when content is inset on an otherwise-empty landscape sheet (teddy fix preserved).
  - `RobustPDFGenerator` per-element full-page check (~line 1216): decides whether to embed source PDF whole vs crop to content bounds. Calls analyzer, then layers the rotated-match-with-user-rotation guard.
  - Upload-time complex-file shortcut in `routes.ts` (~line 3352): kept independent (only does dimensional check at 5mm tolerance, no bounds available yet) but its synthetic full-page bounds feed back into the same analyzer downstream, so the final decision is still made in one place.
  Locked by 11 unit tests in `tests/full-page-match.test.ts` (run with `npx tsx tests/full-page-match.test.ts`) covering teddy, Waterford, MTSG full-page positive, Roadstone, BEM, square pages, missing bounds, looser tolerance. Locked by the 4 enabled fixtures in the regression suite.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Customer Template Assignments**: Admin-managed system for assigning exclusive templates to specific customers.
- **Customer Features System**: Extends customer_templates to flag per-customer feature access via magic template IDs. Current flags: `__dtf_quick_upload__` (shows DTF 1000x550 Quick Upload tile), `__vectorization_only__` (hides all product tiles except Vectorization Service for the customer). The `/api/customer-features` endpoint returns these flags by partner email; the Product Launcher modal reads partner email from prop, sessionStorage, or localStorage.
- **Odoo Module Enhancements**: Automatic project comments, garment color inclusion in sales orders, hot deployment, robust error handling, and integrated PDF processing.
- **PDF Regression Test Suite**: `tests/run-pdf-regression.ts` (TypeScript via tsx) runs every enabled fixture in `tests/pdf-fixtures/fixtures.json` end-to-end against a live server: uploads the PDF, creates a project on the configured template, places the logo on canvas (with optional rotation/aspect-preserving cap), POSTs `/api/projects/:id/generate-pdf`, then asserts page count, page dimensions in points (catches orientation flips like the teddy/Waterford bug), and content bounding box in mm via the Ghostscript `-sDEVICE=bbox` device (catches scaling regressions like Roadstone/BEM). Generated PDFs are saved to `tests/pdf-fixtures/output/<id>.pdf` (gitignored) for visual inspection. Run with `npx tsx tests/run-pdf-regression.ts`, filter via `--only=teddy`, or point at a different env via `PDF_REGRESSION_BASE_URL=https://...`. Exit code 1 on any failure for CI gating. v1 enables the four orientation/scaling fixtures (teddy, Waterford, Roadstone, BEM) which currently all pass; the remaining fixtures (multi-color, applique, DTF passthrough, font-outlining, imposition) are wired into the manifest but disabled until their setup paths are added.

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