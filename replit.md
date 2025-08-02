# Logo Upload and Design Tool

## Overview
This is a full-stack web application for uploading logo files and creating layouts on garment templates. Its purpose is to provide a streamlined workflow for users to upload logos, accurately position them on various canvas templates, and generate production-ready outputs that preserve vector graphics. The application aims to offer a professional and intuitive design experience, bridging the gap between digital design and physical production, with potential for broad market adoption in the custom apparel industry.

**Current Status**: Production-ready application with enhanced PDF generation showing garment color names with CMYK values instead of hex codes. PDF preview modal updated to display grid layout matching actual PDF output with color labels.

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
- **UI/UX Decisions**: Workflow-based interface with a 5-step progress bar, dark mode with custom branding (#961E75), professional color palettes (27 garment colors, Hi-Viz, pastels, specialized inks), enhanced color tooltips, dual manufacturer integration (Gildan and Fruit of the Loom), mandatory garment color selection, CMYK popup color picker, template grouping with custom icons, smart zoom, collapsible template interface, individual garment color assignment, auto-opening garment color modal, project naming input, "Start Over" button, PDF preview & approval modal, content-based bounding boxes, safety margin guide lines, "Fit to Bounds" button, rotate by 90° function, "Center Logo" button, eyedropper color picker, canvas rotation, upload progress bar system, collapsible garment color brands (Gildan and Fruit of the Loom), and always-visible fixed PDF generation footer.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful endpoints with JSON responses.
- **File Handling**: Multer for multipart file uploads (PNG, JPEG, SVG, PDF up to 200MB).
- **Error Handling**: Centralized error middleware.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL (configured via `DATABASE_URL`).
- **Migrations**: Drizzle Kit.
- **Connection**: Neon Database serverless driver for PostgreSQL.

### System Design Choices
- **Storage Instance Management**: Single shared storage instance (`server/storage.ts`) for data persistence.
- **Color Workflow Isolation**: `ColorWorkflowManager` separates vector (SVG/PDF) from raster (PNG/JPEG) color handling. Vector files preserve CMYK and convert RGB to CMYK. Raster files are also converted to CMYK for accurate print output.
- **Mixed Content Detection**: `MixedContentDetector` flags PDFs and SVGs with mixed raster/vector content to prevent color workflow contamination.
- **File Upload System**: Local filesystem storage in `/uploads`. Multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback). Color preservation via Ghostscript. Vector preservation by retaining original PDF files and using `pdf-lib`. Automatic CMYK conversion on upload for vector files. PNG thumbnail generation for large PDFs. Visual indicators for "CMYK Preserved" and "RGB Raster".
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing.
- **AI Vectorization System**: Integrated AI-powered API with raster file detection, offering photographic approval, AI vectorization, and professional service options. Includes zoom controls, transparency checkerboard, side-by-side comparison, color preset palette, white background removal, advanced color detection, individual color deletion, color reduction, color locking, and credit protection.
- **Onboarding Tutorial System**: Comprehensive 6-step interactive tutorial accessible via header "Tutorial" button, covering complete workflow from template selection to PDF generation with professional explanations and visual progress indicators.
- **Imposition Tool**: Grid replication system for logos with customizable rows, columns, spacing, and canvas centering.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**: Dual-page PDF output with artwork on garment background. CMYK PDF generation with FOGRA51 ICC profile embedding. Enhanced vector preservation via `pdf-lib` and Ghostscript. Ink color recoloring for single-color transfers. Applique Badges Embroidery Form for custom badge templates with PDF embedding. PDF filename generation including quantity.
- **Preflight Checks**: Comprehensive help guide, required project naming, CMYK color analysis display, intelligent color standardization, critical font detection, accurate bounding box calculation, enhanced typography workflow, duplicate color detection, line thickness detection, Pantone detection, oversized logo detection with "Fit to Bounds".
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