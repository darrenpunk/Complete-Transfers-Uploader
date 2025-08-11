# Logo Upload and Design Tool

## Overview
This full-stack web application streamlines logo uploads and layout creation on garment templates, primarily for the custom apparel industry. It provides a professional design experience for positioning logos on various canvas templates and generating production-ready vector graphics. The project includes a standalone application and an integrated Odoo 16 module for seamless integration with Odoo product catalogs. The business vision is to offer an intuitive tool that simplifies the design process, enhances accuracy for printing, and supports high-volume custom apparel production, ultimately expanding market potential in the personalized garment sector.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, Wouter for routing, TanStack Query for state management.
- **UI Framework**: shadcn/ui on Radix UI, styled with Tailwind CSS.
- **UI/UX Decisions**: Workflow-based 5-step progress, dark mode with custom branding, professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, dual manufacturer integration (Gildan, Fruit of the Loom), CMYK popup color picker, template grouping, smart zoom, collapsible template interface, individual garment color assignment, project naming, PDF preview & approval, content-based bounding boxes, safety margins, "Fit to Bounds," 90° rotation, "Center Logo," eyedropper, canvas rotation, upload progress, collapsible garment brands, fixed PDF generation footer, and automatic content centering for PDF-derived SVGs.

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
- **Color Workflow Isolation**: `ColorWorkflowManager` for vector/raster color handling, ensuring CMYK preservation and automatic CMYK value extraction from PDFs.
- **Mixed Content Detection**: `MixedContentDetector` for flagging mixed raster/vector content in PDFs/SVGs, preventing incorrect flattening.
- **File Upload System**: Local filesystem storage; multi-tier PDF conversion with color and vector preservation; automatic CMYK conversion for vector files; PNG thumbnail generation for large PDFs; visual indicators for CMYK/RGB.
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing, including accurate pixel-to-millimeter conversions.
- **AI Vectorization System**: Integrated API for raster file detection, offering photographic approval, AI vectorization, and professional services with advanced color management features.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial.
- **Imposition Tool**: Grid replication system for logos.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**: Robust `RobustPDFGenerator` for dual-page PDF output (artwork on garment background, labels, CMYK values); CMYK PDF generation with FOGRA51 ICC profile; vector preservation via `pdf-lib` and Inkscape; ink color recoloring; Applique Badges Embroidery Form; PDF filename generation including quantity. Ensures original CMYK PDF files are preserved and embedded.
- **Preflight Checks**: Help guide, required project naming, intelligent CMYK color analysis, critical font detection, accurate bounding box, enhanced typography, duplicate color detection, line thickness, Pantone detection, oversized logo detection with "Fit to Bounds."
- **Embed Button Widget**: JavaScript widget for embedding "Order Transfers" button with popup/redirect modes, custom styling, and Odoo-specific versions.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.
- **Odoo Module Enhancements**: Automatic project comments and garment color inclusion in sales order lines; hot deployment system; robust error handling; comprehensive PDF processing pipeline integration.
- **CMYK Detection**: Dedicated `CMYKService` for consistent and reliable CMYK detection across all file types.

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
- **Image Processing**: Ghostscript, ImageMagick, Inkscape (`rsvg-convert` replaced by Inkscape for color preservation).
- **PDF Manipulation**: `pdf-lib`.
- **AI Vectorization**: External AI vectorization API.
- **Odoo Module Specific**: ReportLab.

### Development Tools
- **Build**: `esbuild` (backend), Vite (frontend).
- **TypeScript**: Strict type checking.
- **Linting**: ESLint.