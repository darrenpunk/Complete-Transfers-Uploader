# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates. Its main purpose is to provide a professional, intuitive design experience for positioning logos on various canvas templates and generating production-ready vector graphics, specifically for the custom apparel industry. The project includes a standalone application and a fully integrated Odoo 16 module. Key capabilities include precise logo placement, scaling, color management, and the generation of high-quality, production-ready PDF outputs for the custom apparel industry. The business vision is to offer a robust, scalable, and cost-effective solution for garment design, targeting significant market share in custom apparel.

## User Preferences
Preferred communication style: Simple, everyday language.
Current focus: Core functionality over complex color management features.

## Recent Fixes (Oct 2025 - Nov 2025)
- **Nov 2025: Multi-Color Garment Orders**: Added multi-color selector in project naming modal allowing customers to specify same artwork on different garment colors with individual quantities (e.g., "10 Black, 4 Gold, 4 Charcoal"). System automatically generates properly formatted comments for production team. Includes visual color picker with 20 standard garment colors, quantity management, and real-time totals.
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
- **File Upload System**: Local filesystem storage; multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) with color and vector preservation; automatic CMYK conversion for vector files; PNG thumbnail generation for large PDFs; visual indicators for CMYK/RGB; Dropbox File Request integration for complex files with automated webhook processing. Automated detection and PNG fallback for complex vector files (>4000 paths or >5000 elements).
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing.
- **Vector Bounds Extraction**: Precise vector content bounding box detection system using Ghostscript for PDFs and DOM analysis for SVGs, enabling accurate artwork scaling and positioning. Corrected bounds extraction to use Ghostscript's bbox device primarily, and viewBox normalization for consistent positioning.
- **Vectorization Services**: Raster file detection with photographic approval and manual professional vectorization service request form.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**: Dual-page PDF output with artwork on garment background; CMYK PDF generation with FOGRA51 ICC profile; vector preservation via `pdf-lib` and Ghostscript; ink color recoloring; Applique Badges Embroidery Form; PDF filename generation.
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