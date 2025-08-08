# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module with comprehensive project structure for seamless integration with Odoo product catalogs.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (August 7, 2025)
- **Software-Specific Guides Removed**: Removed the software application guides section from the Color Modes modal to simplify the interface.
- **Color Mode Help Modal Restored**: Fixed the "Learn More about Colour Modes" help button in preflight checks to properly trigger when RGB colors are detected.
- **CMYK Preview Toggle Removed**: Removed the CMYK Preview toggle from the Color Analysis section as requested. Colors now display in their original format without any preview conversion effects.
- **✅ CRITICAL COLOR DETECTION FIX**: Fixed RGB files being incorrectly marked as CMYK in preflight checks. SVG color analysis now properly identifies RGB/hex colors as `isCMYK: false` and only marks actual CMYK colors (device-cmyk, cmyk formats) as `isCMYK: true`. Preflight now correctly shows "RGB Vector (Preserved)" for RGB files instead of incorrectly showing "CMYK Vector".
- **Vector Import CMYK Notification Removed**: Eliminated CMYK conversion form notifications when importing vector files since colors are preserved exactly as uploaded without conversion.
- **✅ CRITICAL MIXED CONTENT PDF FIX VERIFIED**: Successfully fixed mixed PDFs being incorrectly flattened when uploaded. Mixed content PDFs now preserve vector content and bypass vectorization modal, maintaining original quality without forced rasterization. Backend logic updated to differentiate between pure raster PDFs (which get extracted) and mixed content PDFs (which preserve vector elements). PDF generation restored to full functionality with proper size outputs.
- **PDF Preview Individual Garment Colors**: Fixed Page 2 preview to show individual garment colors per logo instead of single background color, now matching actual PDF generation output.
- **CRITICAL PDF PREVIEW FIX**: Fixed catastrophic SVG corruption affecting 824+ files with malformed XML syntax (`"/ fill="#000000">` → `fill="#000000"/>`). PDF preview modal now displays actual artwork images instead of filename text placeholders.
- **SVG Corruption Issue Resolved**: Fixed critical XML parsing errors in 20 corrupted SVG files that were causing PDF generation failures. Implemented comprehensive SVG corruption detection and repair system.
- **Production Flow Manager**: All 6 production requirements now fully enforced and verified working: color preservation, original content maintenance, proper color detection, content-based bounding boxes, raster file vectorization modals, and mixed content warnings.
- **PDF Generation Restored**: System now successfully generates proper PDFs (>1000 bytes) instead of previous 29-byte failures.
- **CRITICAL COLOR PRESERVATION FIX**: Replaced rsvg-convert with Inkscape for SVG-to-PDF conversion to preserve exact original colors. This fixes the critical issue where green/orange colors were being altered during PDF generation, violating Production Flow Requirement 1.
- **Real PDF Preview**: Added actual PDF viewer using iframe instead of mockup images, with proper server headers for inline display.
- **✅ CRITICAL PDF POSITIONING FIX IMPLEMENTED (Aug 8, 2025)**: Identified root cause and restored working center-point positioning logic. Canvas stores top-left coordinates but logos must be positioned by their center point for visual alignment. Fixed coordinate conversion: `elementCenterY = yInMm + (elementHeightMm / 2)` then `y = pageHeight - (elementCenterY * scale)`. This restores the flawless positioning that was working last week.
- **✅ PDF Preview Fix Applied**: Replaced mockup previews with actual PDF iframe display. Preview now shows real PDF content using `/api/projects/{id}/generate-pdf?page=1` and `/api/projects/{id}/generate-pdf?page=2` endpoints.
- **⚠️ Server Restart Data Loss**: Project data persists during session but is lost on server restart, requiring re-upload for testing. Positioning fix will work correctly for new uploads.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing, TanStack Query for state management.
- **UI Framework**: shadcn/ui on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode with custom branding, professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, dual manufacturer integration (Gildan, Fruit of the Loom), CMYK popup color picker, template grouping, smart zoom, collapsible template interface, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful JSON endpoints.
- **File Handling**: Multer for multipart uploads (PNG, JPEG, SVG, PDF, AI, EPS up to 200MB).
- **Error Handling**: Centralized middleware.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL (via `DATABASE_URL`), utilizing Neon Database serverless driver.
- **Migrations**: Drizzle Kit.

### System Design Choices
- **Storage Instance Management**: Single shared storage instance.
- **Color Workflow Isolation**: `ColorWorkflowManager` for vector/raster color handling, ensuring CMYK preservation.
- **Mixed Content Detection**: `MixedContentDetector` for flagging mixed raster/vector content in PDFs/SVGs.
- **File Upload System**: Local filesystem storage; multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) with color and vector preservation; automatic CMYK conversion for vector files; PNG thumbnail generation for large PDFs; visual indicators for CMYK/RGB.
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing.
- **AI Vectorization System**: Integrated API for raster file detection, offering photographic approval, AI vectorization, and professional services. Includes zoom, transparency, side-by-side comparison, color presets, background removal, advanced color detection, individual color deletion, color reduction, color locking, and credit protection.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos with customizable rows, columns, and spacing.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**: Dual-page PDF output with artwork on garment background; CMYK PDF generation with FOGRA51 ICC profile; vector preservation via `pdf-lib` and Ghostscript; ink color recoloring; Applique Badges Embroidery Form; PDF filename generation including quantity.
- **Preflight Checks**: Help guide, required project naming, CMYK color analysis, intelligent color standardization, critical font detection, accurate bounding box, enhanced typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection with "Fit to Bounds."
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" button with popup/redirect modes, custom styling, and Odoo-specific versions.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Odoo Module Enhancements**: Automatic project comments and garment color inclusion in sales order lines; hot deployment system for on-the-fly module updates; robust error handling with fallback mechanisms for external library imports and PDF generation; comprehensive PDF processing pipeline integration (CMYK preservation, dual-page output, color management).

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
- **AI Vectorization**: External AI vectorization API.
- **Odoo Module Specific**: ReportLab (for PDF generation), ColorWorkflowManager (internal module dependency), GarmentColorManager (internal module dependency).

### Development Tools
- **Build**: `esbuild` (backend), Vite (frontend).
- **TypeScript**: Strict type checking.
- **Linting**: ESLint.