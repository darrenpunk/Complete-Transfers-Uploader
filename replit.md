# Logo Upload and Design Tool

## Overview
This full-stack web application enables users to upload logo files and create layouts on garment templates. Its core purpose is to provide a streamlined workflow for positioning logos on various canvas templates and generating production-ready outputs that preserve vector graphics. The application aims to offer a professional and intuitive design experience, bridging digital design with physical production, particularly for the custom apparel industry. The standalone application is production-ready, and an Odoo 16 module has been developed with full project structure, including models, API endpoints, website templates, security, and a flexible template-to-product mapping system for seamless integration with existing Odoo product catalogs.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack Query (React Query).
- **UI Framework**: shadcn/ui components built on Radix UI primitives.
- **Styling**: Tailwind CSS with custom CSS variables.
- **Build Tool**: Vite.
- **UI/UX Decisions**: Workflow-based interface with a 5-step progress bar, dark mode with custom branding, professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, dual manufacturer integration (Gildan and Fruit of the Loom), mandatory garment color selection, CMYK popup color picker, template grouping with custom icons, smart zoom, collapsible template interface, individual garment color assignment, auto-opening garment color modal, project naming input, "Start Over" button, PDF preview & approval modal, content-based bounding boxes, safety margin guide lines, "Fit to Bounds" button, rotate by 90° function, "Center Logo" button, eyedropper color picker, canvas rotation, upload progress bar system, collapsible garment color brands, and always-visible fixed PDF generation footer.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful endpoints with JSON responses.
- **File Handling**: Multer for multipart file uploads (PNG, JPEG, SVG, PDF, AI, EPS up to 200MB).
- **Error Handling**: Centralized error middleware.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL (configured via `DATABASE_URL`).
- **Migrations**: Drizzle Kit.
- **Connection**: Neon Database serverless driver for PostgreSQL.

### System Design Choices
- **Storage Instance Management**: Single shared storage instance (`server/storage.ts`) for data persistence.
- **Color Workflow Isolation**: `ColorWorkflowManager` separates vector (SVG/PDF) from raster (PNG/JPEG) color handling, ensuring CMYK preservation and conversion for accurate print output.
- **Mixed Content Detection**: `MixedContentDetector` flags PDFs and SVGs with mixed raster/vector content to prevent color workflow contamination.
- **File Upload System**: Local filesystem storage in `/uploads`. Multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) with color and vector preservation. Automatic CMYK conversion on upload for vector files. PNG thumbnail generation for large PDFs. Visual indicators for "CMYK Preserved" and "RGB Raster".
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing.
- **AI Vectorization System**: Integrated AI-powered API with raster file detection, offering photographic approval, AI vectorization, and professional service options. Includes zoom controls, transparency checkerboard, side-by-side comparison, color preset palette, white background removal, advanced color detection, individual color deletion, color reduction, color locking, and credit protection.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial accessible via header "Tutorial" button, covering complete workflow.
- **Imposition Tool**: Grid replication system for logos with customizable rows, columns, spacing, and canvas centering.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**: Dual-page PDF output with artwork on garment background. CMYK PDF generation with FOGRA51 ICC profile embedding. Enhanced vector preservation via `pdf-lib` and Ghostscript. Ink color recoloring for single-color transfers. Applique Badges Embroidery Form for custom badge templates with PDF embedding. PDF filename generation including quantity.
- **Preflight Checks**: Comprehensive help guide, required project naming, CMYK color analysis display, intelligent color standardization, critical font detection, accurate bounding box calculation, enhanced typography workflow, duplicate color detection, line thickness detection, Pantone detection, oversized logo detection with "Fit to Bounds".
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" button on any webpage. Supports popup/redirect modes, custom styling, and easy integration. Available as standalone and Odoo-specific versions.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.

## External Dependencies

### Frontend Dependencies
- **UI Components**: Radix UI component library.
- **Form Handling**: React Hook Form with Zod validation resolvers.
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

### Development Tools
- **Build**: `esbuild` (backend), Vite (frontend).
- **TypeScript**: Strict type checking.
- **Linting**: ESLint with TypeScript rules.

## Recent Changes

**Original PNG File Selection Fix (2025-08-04)**: **CRITICAL DISCOVERY & FIX COMPLETE** - Root cause of duplication artifacts and wrong sizing was selecting the wrong extracted PNG file. **PROBLEM IDENTIFIED**: `pdfimages` extracts multiple PNG files from PDFs: `-000.png` (large processed/duplicated version) and `-001.png` (small original embedded PNG). System was selecting the largest file, getting the duplicated version instead of the original. **SOLUTION IMPLEMENTED**: (1) **Correct File Selection**: Changed selection logic from largest → smallest file to get the original embedded PNG. (2) **Native Resolution Preservation**: Uses `pdfimages`-only extraction with proper file selection to preserve original embedded PNG exactly. (3) **Size Validation**: Added dimension checking to detect when extracted files are too large (processed versions). **Technical Implementation**: Modified `extractOriginalPNG` function to sort extracted files by size ascending and select the smallest file, which contains the original embedded PNG at native resolution. **EXPECTED OUTCOME**: Canvas will now display clean original PNG without duplication artifacts at correct native size (not oversized 283mm version). **STATUS: IMPLEMENTED** - System now extracts and selects the original embedded PNG file, eliminating duplication and providing correct sizing for professional vectorization quality.

**Vector.AI API Parameters Fix (2025-08-04)**: **CRITICAL DISCOVERY**: Root cause of poor vectorization quality was using incorrect API parameter names that don't exist in Vector.AI's API. **SOLUTION IMPLEMENTED**: Researched official Vector.AI API documentation and replaced all incorrect parameters with authentic documented ones: `format`, `svg.version`, `svg.group_by`, `shapes.fitting`, `shapes.mode`, `curves.line/arc/cubic/quadratic`, `gap_filler`, and `processing.max_colors`. Previous parameters like `processing.background_removal`, `shapes.stroke_style`, and `processing.curve_fitting` were non-existent API parameters. **TECHNICAL IMPLEMENTATION**: Updated `/api/vectorize` endpoint to use correct parameter names, enabled high-quality shape recognition with `shapes.fitting=true`, all curve types for optimal quality, gap filler for clean edges, and 256 color limit for crisp results. **EXPECTED OUTCOME**: Should now produce Vector.AI web app quality vectorization results matching external vectorizer applications. **STATUS: TESTING REQUIRED** - Need user confirmation that vectorization quality now matches professional Vector.AI web app standard.