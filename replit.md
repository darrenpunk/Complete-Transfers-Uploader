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
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode, professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, CMYK popup color picker, template grouping, smart zoom, collapsible template interface, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer, rotated element visual dimension display, dual-canvas system for applique templates (Badge Artwork + Embroidery Artwork), shape tools (rectangle, ellipse, line, shield, star, hexagon, pentagon, triangle, diamond, banner, cross) with configurable fill/stroke colors, stroke width, corner radius, and opacity. Shape tools appear in canvas tab bar for applique templates, in top toolbar otherwise.

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
- **File Upload System**: Local filesystem storage; multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) with color and vector preservation; automatic CMYK conversion for vector files; PNG thumbnail generation for large PDFs; visual indicators for CMYK/RGB; Dropbox File Request integration for complex files with automated webhook processing. Automated detection and PNG fallback for complex vector files (>15000 paths or >15000 elements). Safari browser compatibility: detects Safari-incompatible SVG features (feImage fragment refs, compositing groups, non-normal blend modes) and uses PNG fallback for canvas display; on-demand `/api/logos/:id/safari-png` endpoint for existing files; Safari recommendation banner.
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing, including multi-select, group move, resize, and rotation. Shape tools (rectangle, ellipse, line) for adding borders and decorative elements; shapes support fill color, stroke color/width, corner radius, and opacity; rendered as SVG on canvas and as native pdf-lib primitives in PDF output. Dual-canvas mode for applique templates: Canvas 1 (Badge Artwork) and Canvas 2 (Embroidery Artwork) with tab switching, element count badges, and canvas-scoped selection. SVG element-level selection mode: click individual SVG paths/shapes to select (green highlight), shift+click to hide, undo history for hidden elements; selected sub-elements extracted to new SVG via server endpoint and placed on Canvas 2 while original stays on Canvas 1. Controlled by `canvasIndex` field on canvas_elements (0=badge, 1=embroidery). Fully sandboxed - only activates for applique template IDs.
- **Vector Bounds Extraction**: Precise vector content bounding box detection system using Ghostscript for PDFs and DOM analysis for SVGs, enabling accurate artwork scaling and positioning. Corrected bounds extraction to use Ghostscript's bbox device primarily, and viewBox normalization for consistent positioning.
- **Vectorization Services**: Raster file detection with photographic approval and manual professional vectorization service request form.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All" and "Center All" functions, alignment to safety margins.
- **PDF Generation**: Multi-page PDF output supporting single and multi-color garment orders. Page 1 shows transparent background for production; subsequent pages show artwork on each garment color background with color-specific footers (project name, color name, quantity). CMYK PDF generation with FOGRA51 ICC profile; vector preservation via `pdf-lib` and Ghostscript; ink color recoloring; Applique Badges Embroidery Form; PDF filename generation. Multi-page PDF pass-through mode for existing garment pages in uploaded PDFs.
- **Preflight Checks**: Help guide, required project naming, CMYK color analysis, intelligent color standardization, critical font detection, accurate bounding box, enhanced typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection with "Fit to Bounds." Implementation of a Canvas-PDF Matcher for exact dimension replication and aspect-ratio-preserving scaling. CMYK preservation logic.
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" button with popup/redirect modes.
- **Support System**: Integrated contact support form in help modal that stores tickets in PostgreSQL database; includes email fallback (transferhelp@serigraf.com). Ready for Odoo Helpdesk integration.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Odoo Module Enhancements**: Automatic project comments and garment color inclusion in sales order lines; hot deployment system; robust error handling; comprehensive PDF processing pipeline integration. Integrates with Odoo for "Add to Cart" functionality and attaches production-ready PDFs to manufacturing tasks. Authentication handled at product selector level.

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
- **Odoo Module Specific**: ReportLab (for PDF generation).