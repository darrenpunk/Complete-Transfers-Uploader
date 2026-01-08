# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module. Key capabilities include precise logo placement, scaling, color management, and the generation of high-quality, production-ready PDF outputs for the custom apparel industry. The business vision is to offer a robust, scalable, and cost-effective solution for garment design, targeting significant market share in custom apparel.

## User Preferences
Preferred communication style: Simple, everyday language.
Current focus: Core functionality over complex color management features.

## Recent Fixes (Oct 2025 - Jan 2026)
- **Jan 2026: SVG Bounds Extraction Overhaul**: Fixed critical bounding box issues causing clipping and off-center logos. Two key problems solved:
  1. **Centering Fix**: Inkscape rebases PDF coordinates during PDF→SVG conversion, so PDF bounds (e.g., xMin=68) don't match SVG content coordinates (which start near 0). Now query actual SVG bounds with `inkscape --query-all` after conversion and use those for translate normalization.
  2. **Clipping Fix**: Ghostscript's bbox can miss masked strokes/effects that Inkscape's renderer correctly measures. Now compare Ghostscript and Inkscape dimensions, and use the larger values to prevent clipping. Example: Heineken logo where Ghostscript reported 46.7mm but actual content was 47.8mm.
- **Dec 2025: CMYK Slider Fix**: Fixed issue where dragging CMYK color sliders in the garment color modal would trigger the upload guidance modal. Root cause was the useEffect in upload-tool.tsx that monitors garment color changes - it was triggering on every color change instead of only on the first color selection. Fixed by adding proper initialization logic with `null` sentinel value and `uploadGuidanceTriggered` flag to ensure the modal only shows once when first selecting a color. Also added `noDragEventsBubbling: true` to react-dropzone.
- **Dec 2025: PDF Pass-Through Mode**: Added support for multi-page PDFs that already contain garment color information. When uploading a PDF with 2+ pages, system detects page count using pdf-lib and shows modal asking if customer wants to use their original garment pages. If enabled, page 1 is used for canvas editing, and pages 2+ are appended directly to the final PDF output (preserving CMYK colors and vectors via pdf-lib copyPages). Includes fallback to generate standard garment page if pass-through fails. Schema: `pageCount`/`hasGarmentPages` on logos, `useOriginalGarmentPages` on projects.
- **Dec 2025: Group Resize & Rotation**: Added ability to resize and rotate multiple selected elements together as a group. Group resize scales all elements proportionally while maintaining relative positions using immutable initial state with offset-based calculations. Group rotation orbits elements around the group center while also rotating each element individually. Implementation uses refs for synchronous transform operations and immutable initial state to prevent compounding errors.
- **Dec 2025: Persistent Group Functionality**: Added ability to permanently group elements together. Features include: Group button (groups 2+ selected elements), Ungroup button (splits grouped elements), clicking one grouped element automatically selects all elements in the group, grouped elements move together when dragged. Groups persist in database via `groupId` field on canvas_elements. Optimistic UI updates ensure immediate feedback.
- **Dec 2025: Multi-Select & Group Movement**: Added ability to select multiple elements on canvas and move them together. Features include: Shift+click for multi-select, "Select All" button in toolbar, group dragging that maintains relative positions. Fixed production server crash caused by error handler re-throwing errors.
- **Dec 2025: PDF Dimension & CMYK Preservation Fix**: Fixed critical issue where output PDF dimensions didn't match canvas. Original A4 PDFs with content offset (e.g., bounds starting at 56.3, 16.7pts) caused scaling issues when embedded. Solution: Use Ghostscript with `-dFIXEDMEDIA`, `-dDEVICEWIDTHPOINTS`, `-dDEVICEHEIGHTPOINTS` to physically resize PDF page to content bounds, plus `BeginPage` translate to shift content to origin. This preserves exact CMYK colors (`-dColorConversionStrategy=/LeaveColorUnchanged`) while ensuring output PDF matches canvas dimensions exactly. Stores `originalPdfBounds` in database for proper cropping during PDF generation.
- **Nov 2025: Add to Cart Backend Proxy**: Fixed "Add to Cart & Create Another" not adding items to Odoo cart. Created Replit backend endpoint `/api/projects/:id/add-to-cart` that proxies requests to Odoo, avoiding CORS issues. Added `comments` field to projects schema for storing user special instructions. Frontend now calls Replit backend which proxies to Odoo's `/artwork/api/projects/{uuid}/add-to-cart`. Also clears project state when starting new project for fresh canvas.
- **Nov 2025: PDF Attachment to Manufacturing Tasks**: Fixed critical production workflow issue - PDFs are now automatically attached to `project.task.artwork_image` field when orders are created. Implemented dual attachment strategy: PDFs stored on both `sale.order.line.artwork_pdf_file` (order management) AND `project.task.artwork_image` (production access). Added fallback mechanism in `sale.order.line.write()` to sync PDFs to tasks even if task is created after add-to-cart. Production team can now access PDFs via standard manufacturing task workflow.
- **Nov 2025: Multi-Color PDF Generation**: Enhanced PDF generation to create one page per garment color for multi-color orders. Page 1 shows transparent background (production), pages 2+ show artwork on each garment color background with footer displaying project name, color name, and quantity. Fully backward compatible with single-color orders (2-page PDFs). Supports all rotation cases (90°, 180°, 270°) across all garment color pages.
- **Nov 2025: Multi-Color Garment Orders**: Added multi-color selector in project naming modal allowing customers to specify same artwork on different garment colors with individual quantities (e.g., "10 Black, 4 Gold, 4 Charcoal"). **Only available for Full-Colour, HD, and Metallic templates** - automatically hidden for Single Colour, Zero, DTF, and other template types. System automatically generates properly formatted comments for production team, stores garmentColors in PostgreSQL, and calculates total quantities. Includes visual color picker with 20 standard garment colors, quantity management, and real-time totals.
- **Nov 2025: Odoo Cart Integration**: Added "Add to Cart" button with modal workflow that integrates Replit app with Odoo e-commerce system via API calls to `/artwork/api/projects/<uuid>/add-to-cart`. Features project naming modal, add-to-cart confirmation modal with "Start New Project" or "View Cart" options, iframe detection, and parent window redirection.
- Fixed HTTP 413 "Payload Too Large" errors on published app when fetching projects with many logos
- Optimized GET /api/projects/:id/logos endpoint to exclude heavy JSONB fields (svgColors, contentBounds, etc.) for projects with >10 logos
- Fixed critical security vulnerability: removed unsafe innerHTML usage in image error handlers
- Enhanced error logging for image load failures (URL, HTTP status, browser info)
- Improved 413 error handling with user-friendly messages suggesting Dropbox File Request for large files
- DTF templates now default to gray (#929292) background color
- Fixed Dropbox placeholder system: replaced SVG with PDF placeholder for proper bounds extraction and centering
- Dropbox placeholders now use A4 dimensions (210mm x 297mm) with correct contentBounds for proper centering
- Fixed alignment buttons to align elements to red boundaries (3mm safety margins) instead of canvas edges

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing, TanStack Query for state management.
- **UI Framework**: shadcn/ui on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode, professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, dual manufacturer integration, CMYK popup color picker, template grouping, smart zoom, collapsible template interface, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer, rotated element visual dimension display.

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
- **Storage Instance Management**: Single shared storage instance.
- **Color Workflow Isolation**: `ColorWorkflowManager` for vector/raster color handling, ensuring CMYK preservation.
- **Mixed Content Detection**: `MixedContentDetector` for flagging mixed raster/vector content.
- **File Upload System**: Local filesystem storage; multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) with color and vector preservation; automatic CMYK conversion for vector files; PNG thumbnail generation for large PDFs; visual indicators for CMYK/RGB; Dropbox File Request integration for complex files with automated webhook processing. Automated detection and PNG fallback for complex vector files (>5000 paths or >5000 elements).
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing.
- **Vector Bounds Extraction**: Precise vector content bounding box detection system using Ghostscript for PDFs and DOM analysis for SVGs, enabling accurate artwork scaling and positioning. Corrected bounds extraction to use Ghostscript's bbox device primarily, and viewBox normalization for consistent positioning.
- **Vectorization Services**: Raster file detection with photographic approval and manual professional vectorization service request form.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**: Multi-page PDF output supporting single and multi-color garment orders. Page 1 shows transparent background for production; subsequent pages show artwork on each garment color background with color-specific footers (project name, color name, quantity). CMYK PDF generation with FOGRA51 ICC profile; vector preservation via `pdf-lib` and Ghostscript; ink color recoloring; Applique Badges Embroidery Form; PDF filename generation. Fully backward compatible - single-color orders produce 2-page PDFs.
- **Preflight Checks**: Help guide, required project naming, CMYK color analysis, intelligent color standardization, critical font detection, accurate bounding box, enhanced typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection with "Fit to Bounds." Implementation of a Canvas-PDF Matcher for exact dimension replication and aspect-ratio-preserving scaling. CMYK preservation logic.
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" button with popup/redirect modes.
- **Support System**: Integrated contact support form in help modal that stores tickets in PostgreSQL database; includes email fallback (transferhelp@serigraf.com). Ready for Odoo Helpdesk integration.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Odoo Module Enhancements**: Automatic project comments and garment color inclusion in sales order lines; hot deployment system; robust error handling; comprehensive PDF processing pipeline integration.

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
- **Cloud Storage**: Dropbox SDK via Replit connector.
- **Support Tickets**: PostgreSQL database storage for support tickets (ready for Odoo Helpdesk integration).
- **AI Vectorization**: External AI vectorization API (manual vectorization service only).
- **Odoo Module Specific**: ReportLab (for PDF generation).