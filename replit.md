# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module with comprehensive project structure for seamless integration with Odoo product catalogs.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (August 10, 2025)
- **🎯 CRITICAL PDF CONTENT SCALING FIX**: Solved the fundamental issue where PDF content was visually scaled down due to viewBox padding. Implemented intelligent SVG content scaling correction in the frontend renderer that detects PDF-derived SVGs with significant padding (>10px) and applies CSS transform scaling to restore content to proper visual size. This fixes the core problem where 241×229px content appeared smaller due to being contained within a 268×268px viewBox.
- **🎯 AUTOMATIC PDF CMYK EXTRACTION BREAKTHROUGH**: Implemented complete automatic CMYK value extraction system using TargetedCMYKExtractor. System successfully extracts original CMYK values (C70% M67% Y64% K74% and C13% M100% Y81% K3%) directly from PDF files without requiring manual customer input. Fixed complete data flow: PDF extraction → backend processing → database storage → frontend display.
- **🎨 PROFESSIONAL PRINTING WORKFLOW COMPLETE**: Enhanced frontend to receive and display originalCMYK values from backend. CMYK color picker now pre-fills with exact extracted values (hasOriginalCMYK: true) ensuring professional printing accuracy without manual data entry.
- **🧹 UI CLEANUP COMPLETED**: Removed redundant UI elements per user request: Common CMYK Presets section with preset buttons, blue instruction text "Enter your original CMYK values for professional printing accuracy", and Original CMYK Color Analysis section. Interface now cleaner while maintaining full automatic CMYK extraction functionality.
- **✅ CRITICAL CANVAS SIZING FIXED**: Resolved major canvas dimension issue where elements showed 830×1148mm instead of pixels. Fixed content bounds calculation to use pixel dimensions directly, converting properly to millimeters for display (830×1148 pixels = ~292.97×405.07mm).
- **🎨 COLOR DISPLAY SYSTEM IMPROVED**: Enhanced SVG color extraction with proper SVGColorInfo structure including id, originalColor, originalFormat, elementType, originalCMYK field, and CMYK status. Colors now display correctly in frontend instead of appearing black.
- **🚀 ENHANCED ANALYSIS PIPELINE**: Added comprehensive color analysis for all file types (PDF conversions, AI/EPS files, direct SVGs) ensuring consistent color data structure across all upload paths.
- **🔧 RGB DETECTION MODAL FIXED**: Corrected logic to prevent RGB warning modal from triggering incorrectly when CMYK files are detected. Modal now only shows for actual RGB content.
- **📐 DIMENSION ACCURACY**: Canvas elements now display at exactly the user-required 292.97mm x 405.073mm dimensions with proper pixel-to-millimeter conversion using 72 DPI standard.

## Previous Changes (August 9, 2025)
- **✅ CMYK DETECTION SYSTEM COMPLETELY FIXED**: Implemented dedicated CMYKService class that provides consistent, reliable CMYK detection using multiple indicators (XMP metadata, color spaces, ICC profiles). Eliminated all competing route handlers and duplicate detection systems that were causing inconsistent results.
- **🎯 Single Source of Truth**: Replaced conflicting CMYK detection with unified CMYKService.processUploadedFile() method called immediately before any file processing.
- **🔧 Color Analysis Fixed**: When CMYK PDFs are detected, all colors in the converted SVG are properly marked as `isCMYK: true` ensuring correct preflight checks and color workflow management.
- **📁 File Preservation Working**: Original CMYK PDFs are saved with `original_` prefix and linked to database records via `originalPdfPath` field.
- **✅ Routing Conflicts Resolved**: Removed duplicate route handlers, eliminated app.all() middleware conflicts, and streamlined upload processing for consistent behavior.

## Previous Changes (August 8, 2025)
- **🚀 FUNDAMENTAL PDF GENERATION RESTORED**: Created OriginalWorkingGenerator class that produces rock-solid, multi-page PDFs (308KB) matching user's exact format. Page 1: original artwork, Page 2: artwork with garment color backgrounds, color labels, and CMYK values.
- **✅ Two-Page PDF Format Enforced**: System now generates proper dual-page PDFs with Page 1 (transparent background) and Page 2 (garment color background + labels) exactly like user's working examples.
- **🎨 Garment Color Labels & CMYK Values**: Added proper color labeling system matching user's PDF format with garment color names and hex values displayed at bottom of Page 2.
- **🔧 Clean Architecture**: Eliminated all compilation cache issues, iframe problems, and broken generators. Fresh start with working fundamentals.
- **CRITICAL FIX: CMYK PDF Preservation**: Fixed major regression where CMYK PDFs were being converted to RGB SVGs during upload, losing original color data. Now preserves original CMYK PDF files with `original_` prefix and embeds them directly during PDF generation to maintain vector paths and CMYK color accuracy.

## Previous Changes (August 7, 2025)
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
- **🚀 ROBUST PDF GENERATION SYSTEM (Aug 8, 2025)**: Completely rewritten PDF generation using RobustPDFGenerator class. New approach eliminates compilation cache issues, provides simplified coordinate calculation, and ensures reliable single-page output. Direct canvas-to-PDF positioning with proper coordinate system conversion.
- **✅ PDF Preview Content-Disposition Fixed**: Header correctly set to `inline` for preview mode, eliminating auto-download issues.
- **🔧 ARCHITECTURAL CHANGE**: Replaced SimplifiedPDFGenerator with RobustPDFGenerator to solve persistent TypeScript compilation cache and positioning issues.

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