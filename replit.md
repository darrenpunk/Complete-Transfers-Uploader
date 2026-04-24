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
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Customer Template Assignments**: Admin-managed system for assigning exclusive templates to specific customers.
- **Customer Features System**: Extends customer_templates to flag per-customer feature access, such as the DTF 1000x550 Quick Upload Button.
- **Odoo Module Enhancements**: Automatic project comments, garment color inclusion in sales orders, hot deployment, robust error handling, and integrated PDF processing.

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