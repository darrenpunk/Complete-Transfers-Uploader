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

**Ghostscript Direct Rendering Fix (2025-08-04)**: **FINAL SOLUTION - DIRECT PDF PAGE RENDERING** - Implementing direct Ghostscript PDF-to-PNG rendering that completely eliminates extraction artifacts by copying PDF content exactly as designed. **PROBLEM IDENTIFIED**: All extraction methods (`pdfimages`, PDF.js-extract, pdf2pic) either failed or caused duplication artifacts. **SOLUTION IMPLEMENTED**: (1) **Direct Ghostscript Rendering**: Uses `gs` command to render PDF page directly as PNG without any extraction processing. (2) **Zero Artifacts**: Bypasses all extraction tools completely - renders page layout exactly as-is. (3) **Optimal Quality**: 150 DPI with text and graphics anti-aliasing (300 DPI caused vectorization distortion). **Technical Implementation**: Replaced all extraction logic with Ghostscript direct rendering command: `gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 -dTextAlphaBits=4 -dGraphicsAlphaBits=4` to render PDF page as PNG at optimal 150 DPI (300 DPI caused text distortion in vectorization). **EXPECTED OUTCOME**: Perfect PDF page rendering without duplication, maintaining exact original design for optimal vectorization. **STATUS: IMPLEMENTED** - Direct page rendering eliminates all extraction-based issues.

**Vector.AI Parameters Restoration (2025-08-04)**: **WORKING CONFIGURATION RESTORED** - Restored the complete Vector.AI parameter configuration from backup that was working "perfectly earlier this week." **PROBLEM IDENTIFIED**: Current minimal parameter setup was not producing the high-quality vectorization results that were working previously. **SOLUTION IMPLEMENTED**: (1) **Adobe Compatibility**: Enabled `svg_adobe_compatibility_mode` for proper Illustrator support. (2) **Quality Parameters**: Restored all working parameters including shape stacking, curve fitting, gap filler, stroke styles, and 300 DPI processing. (3) **Production Mode Logic**: Restored proper preview vs production mode handling from backup. (4) **Complete Parameter Set**: All 15+ Vector.AI parameters from working backup now active. **EXPECTED OUTCOME**: Vectorization should now match the "perfect" quality that was working earlier this week with sharp text, clean edges, and professional-grade vector output. **STATUS: IMPLEMENTED** - Complete working Vector.AI configuration restored from backup.

**Product Selector Organization (2025-08-04)**: **FINAL GRID LAYOUT STRUCTURE** - Completed product selector modal with individual product cards in 4x3 grid layout. **IMPLEMENTATION**: (1) **Individual Product Cards**: Shows 12 distinct product types (Full Colour, Metallic, HD, Single Colour, DTF, UV DTF, Custom Badges, Applique Badges, Reflective, ZERO, Sublimation, Zero Silicone). (2) **Grid Layout**: 4 columns by 3 rows with dark theme matching user specifications. (3) **Product Grouping**: Screen Printed Transfers and Digital Transfers maintain logical organization. (4) **Enhanced Selection**: Direct product type selection with individual icons and descriptions. **STATUS: IMPLEMENTED** - Grid layout product selector matching user requirements.

**Odoo Sales Order Integration (2025-08-04)**: **COMMENTS AND GARMENT COLORS IN SALES ORDER LINES** - Enhanced Odoo module to automatically include project comments and garment color information in sales order line descriptions. **IMPLEMENTATION**: (1) **New Fields**: Added `project_comments` and `garment_colors_json` fields to artwork.project model. (2) **Automatic Comments**: Sales order lines automatically include project comments, garment colors, ink colors, and template information. (3) **Multiple Colors Support**: Handles multiple garment colors stored as JSON array. (4) **Real-time Updates**: Comments update automatically when project details change. (5) **API Enhancement**: Updated project creation and update endpoints to handle comments and multiple colors. **TECHNICAL**: Uses sale order line `name` field to store comprehensive project details for production reference. **STATUS: IMPLEMENTED** - Complete comments and garment color integration for Odoo sales workflow.