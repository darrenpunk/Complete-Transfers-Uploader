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
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode, professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, CMYK popup color picker, template grouping, smart zoom, collapsible template interface, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer, rotated element visual dimension display, dual-canvas system for applique templates (Badge Artwork + Embroidery Artwork), shape tools (rectangle, ellipse, line, shield, star, hexagon, pentagon, triangle, diamond, banner, cross, oval, heart, octagon, arch, maltese cross, chevron, arrow, ribbon) with configurable fill/stroke colors, stroke width, corner radius, and opacity. Shape tools appear in canvas tab bar for applique templates, in top toolbar otherwise.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful JSON endpoints.
- **File Handling**: Multer for multipart uploads.
- **Error Handling**: Centralized middleware.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL (via `DATABASE_URL`), utilizing Neon Database serverless driver.
- **Migrations**: Drizzle Kit.

### System Design Choices
- **Storage Instance Management**: Single shared `DatabaseStorage` instance backed by PostgreSQL. All projects, logos, canvas elements, vectorization requests, and support tickets persist in the database. Template sizes remain in-memory (static config). The `MemStorage` class is retained in `server/storage.ts` as a reference fallback. The `dbRetry` pattern (3 attempts with backoff) is used for read operations to ensure resilience.
- **Operation Guard (Stability)**: `server/operation-guard.ts` — concurrency limiter for heavy operations (PDF generation, file uploads, SVG extraction, font outlining, Safari PNG, DTF quick upload). Max 2 concurrent heavy ops; excess requests queue (up to 10, 60s timeout). Auto-releases via Express `res.on('close')`/`res.on('finish')` so no resource leaks. Stale operation cleanup every 30s (180s max). Health endpoint (`/health`) reports active/queued ops and memory stats. Temp file cleanup in production every 5 minutes (removes stale `/tmp` files from Ghostscript, ImageMagick, Inkscape, rsvg-convert). Keep-alive self-ping every 4 minutes to prevent idle container shutdown.
- **Color Workflow Isolation**: `ColorWorkflowManager` for vector/raster color handling, ensuring CMYK preservation.
- **Mixed Content Detection**: `MixedContentDetector` for flagging mixed raster/vector content. Improved vector detection: checks for artwork paths outside `<defs>`, paths inside clip groups, and large path data (>200 chars) to distinguish real vector content from structural clipping elements. `<use>`+`<defs>`+`<path>` combos treated as vector; only `<image>` triggers raster classification.
- **Raster Upload Sizing**: Direct PNG/JPEG uploads auto-scale to fit within template usable area (template minus 3mm safety margins). PDF-sourced content preserves original MediaBox dimensions.
- **Raster Ink Recoloring**: Supports both transparent PNGs (alpha-extract + ink fill) and opaque PNGs (luminance-based: grayscale→alpha mask on solid ink color, making dark areas transparent and light areas the ink color). Ink color format validated against hex/named-color allowlist to prevent command injection. Raster-only PDFs (where the logo file is a PNG extracted during upload) with ink color overrides are routed to the ImageMagick raster recoloring path instead of the SVG recoloring path to prevent empty artwork in generated PDFs.
- **File Upload System**: Local filesystem storage. Upload size limit: 500MB; files over 100MB use chunked uploads (10MB chunks, auto-assembled on server). Chunked upload endpoints: `/api/chunked-upload/init`, `/api/chunked-upload/chunk`, `/api/chunked-upload/complete`; assembled files processed via `/api/projects/:projectId/logos/from-chunked`. Stale upload cleanup every 5 minutes (30-minute timeout). Multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) with color and vector preservation; automatic CMYK conversion for vector files; PNG thumbnail generation for large PDFs; visual indicators for CMYK/RGB. Automated detection and PNG fallback for complex vector files (>15000 paths or >15000 elements). Safari browser compatibility: detects Safari-incompatible SVG features (feImage fragment refs, compositing groups, non-normal blend modes) and uses PNG fallback for canvas display; on-demand `/api/logos/:id/safari-png` endpoint for existing files; Safari recommendation banner.
- **Landscape Template Auto-Detection**: When a landscape PDF is uploaded to a portrait template, the system detects the orientation mismatch and offers to switch the canvas to a landscape version of the same template. Landscape templates are auto-generated programmatically (with `-landscape` ID suffix, swapped width/height, same productCode) and hidden from the template picker. The project's `templateSize` is updated to the landscape variant, avoiding logo rotation issues with imposition and other tools.
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing, including multi-select, group move, resize, and rotation. Shape tools (rectangle, ellipse, line, shield, star, hexagon, pentagon, triangle, diamond, banner, cross, oval, heart, octagon, arch, maltese cross, chevron, arrow, ribbon) for adding borders and decorative elements; shapes support fill color, stroke color/width, corner radius, and opacity; rendered as SVG on canvas and as native pdf-lib primitives in PDF output. Dual-canvas mode for applique templates: Canvas 1 (Badge Artwork) and Canvas 2 (Embroidery Artwork) with tab switching, element count badges, and canvas-scoped selection. SVG element-level selection mode: click individual SVG paths/shapes to select (green highlight), shift+click to hide, undo history for hidden elements; selected sub-elements extracted to new SVG via server endpoint and placed on Canvas 2 while original stays on Canvas 1. Controlled by `canvasIndex` field on canvas_elements (0=badge, 1=embroidery). Fully sandboxed - only activates for applique template IDs.
- **Vector Bounds Extraction**: Robust two-phase content bounding box detection system. Phase 1: Ghostscript bbox (ink area) as primary, with full Inkscape all-elements verification when GS coverage < 92%. Phase 2: SVG normalization queries ALL Inkscape elements (union of bounds, clamped to MediaBox) and uses MAX(GS, Inkscape) dimensions — "never clip" principle. Background rect suppression only when GS content < 50% of page AND Inkscape > 97% (small logo on large page with background). ArtBox always takes priority when present. MediaBox fallback at < 15% GS coverage. Root element position used for SVG translate; all-elements union used for viewBox dimensions. DTF large-format fast path runs GS bbox for accurate content bounds and crops PNGs to content area.
- **Vectorization Services**: Raster file detection with photographic approval and manual professional vectorization service request form.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All" and "Center All" functions, alignment to safety margins.
- **PDF Generation**: Multi-page PDF output supporting single and multi-color garment orders. Page 1 shows transparent background for production; subsequent pages show artwork on each garment color background with color-specific footers (project name, color name, quantity). Final page: canvas screenshot (artwork-only capture via html2canvas, uploaded to `POST /api/projects/:id/canvas-screenshot`, appended by `appendCanvasScreenshotPage()` helper). CMYK PDF generation with FOGRA51 ICC profile; vector preservation via `pdf-lib` and Ghostscript; ink color recoloring; Applique Badges Embroidery Form; PDF filename generation. Multi-page PDF pass-through mode for existing garment pages in uploaded PDFs.
- **Preflight Checks**: Help guide, required project naming, CMYK color analysis, intelligent color standardization, critical font detection, accurate bounding box, enhanced typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection with "Fit to Bounds." Implementation of a Canvas-PDF Matcher for exact dimension replication and aspect-ratio-preserving scaling. CMYK preservation logic.
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" button with popup/redirect modes.
- **Support System**: Integrated contact support form in help modal that stores tickets in PostgreSQL database; includes email fallback (transferhelp@serigraf.com). Ready for Odoo Helpdesk integration.
- **Order History**: Customer-facing order history page at `/order-history` showing past artwork orders from Odoo. Paginated, shows garment colors, quantities, PDF download, and reorder button. Odoo endpoints: `/artwork/api/order-history` (auth-protected, paginated) and `/artwork/api/order-pdf/<line_id>` (secure PDF download). Node.js proxy endpoints at `/api/order-history` and `/api/order-pdf/:lineId`.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Customer Template Assignments**: Admin-managed system for assigning specific templates to specific customers (by email). Templates with assignments become exclusive — only assigned customers see them; unassigned templates remain visible to everyone. PostgreSQL-backed with in-memory fallback. Admin CRUD endpoints at `/api/admin/customer-templates` (GET/POST/DELETE) protected by admin auth. Frontend passes `partnerEmail` as `customerCode` query param to `/api/template-sizes` for filtering. Admin UI in dashboard "Customer Templates" tab.
- **Customer Features System**: Extends the customer_templates table with a virtual template ID `__dtf_quick_upload__` to flag per-customer feature access. `GET /api/customer-features?email=` returns feature flags. Admin UI "Customer Features" section in the Customer Templates tab manages which customers have each feature. Currently: **DTF 1000×550 Quick Upload Button** — shows a special card on the product selector page for enabled customers; opens `DtfQuickUploadModal` (PDF upload + quantity) which calls `POST /api/quick-upload-dtf` to bypass the canvas and add directly to Odoo cart.
- **Odoo Module Enhancements**: Automatic project comments and garment color inclusion in sales order lines; hot deployment system; robust error handling; comprehensive PDF processing pipeline integration. Integrates with Odoo for "Add to Cart" functionality and attaches production-ready PDFs to manufacturing tasks. Authentication handled at product selector level. Order line comments are set once at creation time and never overwritten by later orders that reuse the same artwork.project UUID (comment isolation fix in artwork_project.py).

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
- **Support Tickets**: PostgreSQL database storage for support tickets (ready for Odoo Helpdesk integration).
- **Odoo Module Specific**: ReportLab (for PDF generation).