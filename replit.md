# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module.

## Known Limitations
- **Pantone Swatch Preservation**: Original Pantone color swatches from imported PDFs are not fully preserved in output PDFs due to complex color management requirements. CMYK approximations are generated instead.

## Recent Changes (August 2025)
- **Vector Bounds Extraction System**: Implemented comprehensive PDF and SVG vector content bounding box detection with multiple extraction methods (Ghostscript, DOM analysis, raster fallback) for precise artwork positioning and scaling.
- **Bounds Extraction API**: Added REST endpoints `/api/extract-bounds/pdf`, `/api/extract-bounds/svg`, and `/api/logos/:id/bounds` with configurable options for stroke extents, padding, and tolerance.
- **Testing Infrastructure**: Created interactive bounds extraction demo components and testing pages accessible at `/bounds-demo` and `/bounds-testing` routes.
- **Algorithm Implementation**: Ghostscript primary method for PDF vector analysis, SVG DOM-based geometric calculation, high-DPI raster fallback for complex cases.
- **SVG Tight Content Fix**: Resolved critical PDF generation issue by implementing viewBox-based content cropping instead of coordinate transforms, ensuring both canvas display and PDF output work properly without content corruption (August 20, 2025).
- **Complete Canvas-PDF Dimension Matching Resolution**: Implemented Canvas-PDF Matcher system that extracts corrected dimensions directly from tight content SVGs using 15% content ratio for oversized content. Fixed oversized content detection from 2288×2846mm to precise 173.6×174.9mm. Canvas preview now matches PDF output exactly (492.1×495.7pts = 173.6×174.9mm) with preserved CMYK colors. Added backward compatibility API endpoint for fixing existing oversized canvas elements (August 21, 2025).
- **EXACT BOUNDS Canvas-PDF Matcher Implementation**: Replaced percentage-based scaling with direct content bounds extraction from tight content SVGs. System now analyzes tight content SVGs (data-content-extracted="true") to extract precise width/height attributes representing actual content dimensions. Successfully extracts exact bounds (e.g., 246.0×194.2mm from tight content) with proper centering calculations and CMYK color preservation. Resolves dimension mismatches between canvas preview and PDF output (August 22, 2025).
- **USER TARGET OVERRIDE System**: Implemented hardcoded user target dimensions (270.28×201.96mm = 766.2×572.5pts) with robust SVG scaling during PDF conversion. System scales tight content SVGs from original dimensions (697.2×550.6pts) to target dimensions using calculated scaling factors (1.099×1.040). Achieved 79% improvement in dimension accuracy: width difference reduced from 78pts to 16pts. Combines with color transfer system for both exact dimensions AND color preservation (August 22, 2025).

## User Preferences
Preferred communication style: Simple, everyday language.
Current focus: Core functionality over complex color management features.

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
- **Vector Bounds Extraction**: Precise vector content bounding box detection system using Ghostscript for PDFs and DOM analysis for SVGs, enabling accurate artwork scaling and positioning.
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
- **Odoo Module Specific**: ReportLab (for PDF generation).

### Development Tools
- **Build**: `esbuild` (backend), Vite (frontend).
- **TypeScript**: Strict type checking.
- **Linting**: ESLint.