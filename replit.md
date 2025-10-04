# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module.

## Known Limitations
- **Pantone Swatch Preservation**: Original Pantone color swatches from imported PDFs are not fully preserved in output PDFs due to complex color management requirements. CMYK approximations are generated instead.

## Recent Changes (October 2025)
- **Large SVG Performance Fix**: Implemented automatic fallback rendering for large SVG files (>1MB) to prevent browser crashes. Complex vector files with thousands of paths now render using optimized `<img>` tags instead of inline SVG DOM manipulation, maintaining proper content-bounds positioning while preventing page unresponsiveness. Fixes critical issue where 6.8MB customer files caused browser hangs (October 4, 2025).
- **ContentBounds Property Fix**: Corrected TypeScript type definition to match database schema (`xMin/yMin/xMax/yMax` instead of `minX/minY/maxX/maxY`), fixing silent validation failures that caused content bounds to be ignored during rendering (October 4, 2025).
- **Bounds Extraction Accuracy Fix**: Corrected extraction method priority to use Ghostscript's precise bbox device first instead of faulty PDF→SVG analyzer. Previous system was calculating incorrect dimensions (e.g., extracting 29.91×11.48mm when actual was 28.221×5.468mm - height more than double). Root cause: PDF→SVG analyzer ignored transform matrices and treated bezier control points as extrema. Now uses Ghostscript `-sDEVICE=bbox` as primary method with proper fallback chain (October 3, 2025).
- **ViewBox Normalization Fix**: Resolved critical positioning bug where imported files appeared offset left/top on canvas. Root cause: tight content SVG viewBox was using original coordinate offsets (e.g., `viewBox="100 50 500 300"`) instead of normalized origin. Fixed by normalizing all viewBoxes to start at `(0, 0)` and applying proper content translation, ensuring consistent positioning for all imported files regardless of their original coordinate system (October 3, 2025).
- **Odoo Module Template Sync**: Updated Odoo 16 module to match standalone app with all 65 individual templates across Screen Printed Transfers (42) and Digital Transfers (23) categories. Fixed template loading error caused by `.mapped()` being called on Python list instead of Odoo recordset - template data now properly serialized with `json.dumps()` for frontend consumption (October 3, 2025).
- **Vector Bounds Extraction System**: Implemented comprehensive PDF and SVG vector content bounding box detection with multiple extraction methods (Ghostscript, DOM analysis, raster fallback) for precise artwork positioning and scaling.
- **Bounds Extraction API**: Added REST endpoints `/api/extract-bounds/pdf`, `/api/extract-bounds/svg`, and `/api/logos/:id/bounds` with configurable options for stroke extents, padding, and tolerance.
- **Testing Infrastructure**: Created interactive bounds extraction demo components and testing pages accessible at `/bounds-demo` and `/bounds-testing` routes.
- **Algorithm Implementation**: Ghostscript primary method for PDF vector analysis, SVG DOM-based geometric calculation, high-DPI raster fallback for complex cases.
- **SVG Tight Content Fix**: Resolved critical PDF generation issue by implementing viewBox-based content cropping instead of coordinate transforms, ensuring both canvas display and PDF output work properly without content corruption (August 20, 2025).
- **Complete Canvas-PDF Dimension Matching Resolution**: Implemented Canvas-PDF Matcher system that extracts corrected dimensions directly from tight content SVGs using 15% content ratio for oversized content. Fixed oversized content detection from 2288×2846mm to precise 173.6×174.9mm. Canvas preview now matches PDF output exactly (492.1×495.7pts = 173.6×174.9mm) with preserved CMYK colors. Added backward compatibility API endpoint for fixing existing oversized canvas elements (August 21, 2025).
- **EXACT BOUNDS Canvas-PDF Matcher Implementation**: Replaced percentage-based scaling with direct content bounds extraction from tight content SVGs. System now analyzes tight content SVGs (data-content-extracted="true") to extract precise width/height attributes representing actual content dimensions. Successfully extracts exact bounds (e.g., 246.0×194.2mm from tight content) with proper centering calculations and CMYK color preservation. Resolves dimension mismatches between canvas preview and PDF output (August 22, 2025).
- **MAJOR BREAKTHROUGH - Vector Corruption Resolution**: Fixed critical vector corruption issue by implementing aspect-ratio-preserving scaling instead of rigid dimension forcing. Replaced extreme scaling distortion (3.917x height scaling) with natural aspect ratio preservation (3.33:1 maintained). System now scales content proportionally within target bounds while preserving vector integrity. Achieved clean vector rendering with proper dimensional accuracy (August 22, 2025).
- **CMYK Preservation Logic Implementation**: Developed intelligent CMYK color detection system that checks existing PDF color space before processing. System now uses Ghostscript inkcov device to detect existing CMYK colors and applies preservation mode (-dColorConversionStrategy=/LeaveColorUnchanged) for CMYK content, or RGB-to-CMYK conversion only when needed. Eliminates unnecessary color space conversions that destroy original CMYK values (August 22, 2025).
- **Rotated Element Visual Dimensions Fix**: Updated properties panel and preflight checks to properly display and validate visual dimensions for rotated elements (90°/270°). Properties panel now shows "(↔️ visual)" and "(↕️ visual)" labels when elements are rotated, with swapped width/height values reflecting actual visual appearance. Preflight safety margin checks, alignment tools, and aspect ratio maintenance now all correctly use visual dimensions for rotated elements (August 28, 2025).

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