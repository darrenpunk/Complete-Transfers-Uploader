# Logo Upload and Design Tool

## Overview
This is a full-stack web application designed for uploading logo files and creating layouts on garment templates. Its primary purpose is to provide a streamlined workflow for users to upload logos, accurately position them on various canvas templates, and generate production-ready outputs that preserve vector graphics. The application aims to offer a professional and intuitive design experience, bridging the gap between digital design and physical production, with potential for broad market adoption in the custom apparel industry.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter for client-side navigation.
- **State Management**: TanStack Query (React Query) for server state.
- **UI Framework**: shadcn/ui components built on Radix UI primitives.
- **Styling**: Tailwind CSS with custom CSS variables for theming.
- **Build Tool**: Vite with React plugin.
- **UI/UX Decisions**:
    - Workflow-based interface with a 5-step progress bar (Upload → Design → Pre-flight → Generate → Attach).
    - Dark mode interface with custom branding (#961E75 primary color).
    - Professional color palettes including 27 garment colors, Hi-Viz, pastels, and specialized inks.
    - Enhanced color tooltips showing names, HEX, RGB, CMYK, and ink types.
    - Dual manufacturer integration (Gildan and Fruit of the Loom color databases) with collapsible accordion groups.
    - Mandatory garment color selection with validation.
    - CMYK popup color picker with full sliders and numeric inputs.
    - Template grouping with custom icons for various transfer types (DTF, UV DTF, etc.).
    - Smart zoom for large templates and auto-fitting templates to workspace.
    - Collapsible template interface with accordion functionality.
    - Individual garment color assignment per logo.
    - Auto-opening garment color modal for Full Colour Transfer templates.
    - Project naming input with validation.
    - "Start Over" button to reset project state.
    - PDF preview & approval modal with design and copyright checkboxes.
    - Content-based bounding boxes for accurate logo sizing.
    - Safety margin guide lines for A3 templates.
    - "Fit to Bounds" button for scaling content within safety margins.
    - Rotate by 90° function for selected elements.
    - "Center Logo" button for selected elements.
    - Eyedropper color picker tool in vectorizer modal.
    - Canvas rotation feature to rotate entire workspace view.
    - Upload progress bar system.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful endpoints with JSON responses.
- **File Handling**: Multer for multipart file uploads, supporting PNG, JPEG, SVG, PDF up to 200MB.
- **Error Handling**: Centralized error middleware.
- **Development**: Hot reload with `tsx`.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Database**: PostgreSQL (configured via `DATABASE_URL`).
- **Migrations**: Drizzle Kit for schema management.
- **Connection**: Neon Database serverless driver for PostgreSQL.

### System Design Choices
- **Storage Instance Management**: Critical design pattern enforcing a single shared storage instance (`server/storage.ts`) to ensure data persistence and avoid inconsistencies.
- **Color Workflow Isolation**: Implemented `ColorWorkflowManager` to separate vector file (SVG/PDF) color handling from raster files (PNG/JPEG). Vector files preserve CMYK colors and convert RGB to CMYK using Adobe-matching algorithm. Raster files maintain RGB without automatic conversion.
- **File Upload System**:
    - Local filesystem storage in `/uploads`.
    - Multi-tier PDF conversion: Ghostscript primary (color accuracy), ImageMagick fallback, original PDF storage for vector output.
    - Color preservation via Ghostscript with `pngalpha` and CSS filters for transparency.
    - Vector preservation by retaining original PDF files and using `pdf-lib` for true vector embedding.
    - Automatic CMYK conversion on upload for vector files only, using Adobe Illustrator-matching algorithm.
    - PNG thumbnail generation for large PDFs for canvas display.
    - Visual indicators show "CMYK Preserved" for vector files and "RGB Raster" for raster files.
- **Canvas System**: Interactive workspace for logo manipulation with real-time property editing.
- **AI Vectorization System**: Integrated AI-powered API with raster file detection, offering photographic approval, AI vectorization, and professional service options.
    - Features: Zoom controls, transparency checkerboard, side-by-side comparison, color preset palette, white background removal, advanced color detection and individual color deletion, color reduction, color locking, and credit protection.
- **Imposition Tool**: Grid replication system for logos with customizable rows, columns, spacing, and canvas centering.
- **Alignment Tools**: "Select All" and "Center All" functions.
- **PDF Generation**:
    - Dual-page PDF output with artwork on garment background.
    - CMYK PDF generation with FOGRA51 ICC profile embedding for professional print.
    - Enhanced vector preservation via `pdf-lib` and Ghostscript.
    - Ink color recoloring system for single-color transfers.
    - Applique Badges Embroidery Form for custom badge templates with PDF embedding.
    - PDF filename generation including quantity.
- **Preflight Checks**:
    - Comprehensive help guide system.
    - Required project naming with validation.
    - CMYK color analysis display showing actual CMYK values.
    - Intelligent color standardization system.
    - Critical font detection for live vs. outlined text.
    - Accurate bounding box calculation using actual logo content dimensions.
    - Enhanced typography workflow.
    - Duplicate color detection cleanup.
    - Line thickness detection for print quality validation.
    - Pantone detection system for embedded Pantone swatches.
    - Oversized logo detection system with "Fit to Bounds" functionality.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend.

## External Dependencies

### Frontend Dependencies
- **UI Components**: Radix UI component library.
- **Form Handling**: React Hook Form with Zod validation resolvers.
- **File Upload**: React Dropzone for drag-and-drop.
- **Utilities**: `date-fns` for date manipulation, `clsx` for conditional styling.

### Backend Dependencies
- **Database**: `@neondatabase/serverless` for PostgreSQL connections.
- **ORM**: `drizzle-orm` with `drizzle-zod` for type-safe schema validation.
- **File Upload**: `multer` for handling `multipart/form-data`.
- **Session Management**: `connect-pg-simple` for PostgreSQL session storage.
- **Image Processing**: Ghostscript, ImageMagick, `rsvg-convert` (for SVG to PDF).
- **PDF Manipulation**: `pdf-lib`.
- **AI Vectorization**: External AI vectorization API.

### Development Tools
- **Build**: `esbuild` for backend, Vite for frontend.
- **TypeScript**: Strict type checking.
- **Linting**: ESLint with TypeScript rules.