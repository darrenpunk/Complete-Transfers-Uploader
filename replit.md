# Logo Upload and Design Tool

## Recent Updates (July 31, 2025)

### Logo Import Clipping Investigation
**Issue**: Specific logo (Greystones) was importing with clipped/missing content while other documents processed correctly
**Investigation**: 
- Initially suspected aggressive coordinate filtering in content bounds calculation
- Temporarily disabled SVG viewBox cropping, but this caused bounding boxes to be document size instead of content size
- Reverted viewBox cropping and reduced coordinate filtering to minimal level
- Removed aggressive filtering that was excluding legitimate logo content coordinates
**Status**: Fixes implemented, monitoring for similar issues in future uploads

### Adobe CMYK Color Profile Implementation ✓ COMPLETED
**Achievement**: Perfect Illustrator compatibility with universal CMYK algorithm
- RGB(242,97,36) now converts to exactly C:0 M:75 Y:95 K:0 matching Adobe Illustrator
- Universal algorithm with fine-tuned adjustments (Magenta×1.25, Yellow×1.12, K=0 for bright colors)
- All client-side CMYK functions updated to match server-side Adobe algorithm
- Complete color consistency across UI components and PDF output

## Overview

This is a full-stack web application designed for uploading logo files and creating layouts on garment templates. Its primary purpose is to provide a workflow-based interface for users to upload logos, accurately position them on various canvas templates, and generate production-ready outputs with preserved vector graphics. The application aims to streamline the design-to-print process, ensuring high-fidelity output for professional use.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming, with a dark mode interface featuring a #961E75 primary color.
- **Build Tool**: Vite with React plugin and hot module replacement
- **UI/UX Decisions**: Incorporates professional color palettes (27 garment colors), enhanced color tooltips (showing names, HEX, RGB, CMYK, ink types), t-shirt shaped color swatches, ink drop/splash swatches, and a comprehensive help guide system. It features a streamlined, single-click template selection UX and a two-tier template launcher system.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints with JSON responses
- **File Handling**: Multer for multipart file uploads with validation, supporting large files up to 200MB.
- **Error Handling**: Centralized error middleware with status codes
- **Development**: Hot reload with tsx for TypeScript execution
- **Critical Architecture Pattern**: Uses a single, shared storage instance (`server/storage.ts`) to maintain data persistence across all operations.

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (configured via DATABASE_URL)
- **Migrations**: Drizzle Kit for schema management
- **Connection**: Neon Database serverless driver for PostgreSQL connections

### Core Features & Implementations
- **File Upload System**: Local filesystem storage (`/uploads`), supports PNG, JPEG, SVG, PDF. Includes multi-tier PDF conversion (Ghostscript primary, ImageMagick fallback) and preserves original PDFs for vector output. Features a real-time upload progress bar. Logos are automatically converted to CMYK on upload.
- **Canvas System**: Interactive workspace for logo manipulation, supporting drag-and-drop, snapping, and precise millimeter-based positioning. Includes a properties panel for real-time editing of element properties (position, size, rotation, opacity). Features automatic logo centering on upload, and a "Fit to Bounds" function for oversized logos. Supports canvas rotation for working with landscape artwork.
- **Image Processing**: Implements Adobe CMYK color profile matching for accurate color conversion, and enhanced white element preservation in SVGs. Features a comprehensive CMYK color adjustment system with real-time canvas preview.
- **PDF Generation**: Capable of generating production-ready vector PDFs with FOGRA51 ICC profile integration for accurate CMYK reproduction. Supports dual-page PDF output (artwork on garment background). Includes a mandatory project naming modal and a 2-page PDF preview with approval checkboxes.
- **Vectorization System**: Integrates an AI-powered vectorization API with options for photographic approval, AI vectorization, and professional service. Features an advanced vectorizer interface with zoom controls, transparency checkerboard, side-by-side comparison, and color management tools (color reduction, individual color deletion, color locking, eyedropper tool).
- **Preflight Checks**: Includes comprehensive preflight checks for font outlining, line thickness (0.25pt minimum), and oversized logo detection.
- **Imposition Tool**: Grid replication system for logos with customizable rows, columns, spacing, and canvas centering.
- **Alignment Tools**: "Select All" and "Center All" functions for group alignment.
- **Applique Badges Form**: Specialized modal for Custom Badges templates to capture embroidery specifications, with data embedded into PDF output.
- **Pantone Detection**: Automatically detects and displays embedded Pantone swatches.
- **Dimension & Scaling**: Robust dimension system with exact pixel-to-mm conversion for precise bounding box calculations and accurate logo sizing, ensuring consistency between canvas and PDF output. Automatically scales templates to workspace size.
- **Monorepo Structure**: Shared TypeScript types between frontend and backend for full-stack type safety.

## External Dependencies

### Frontend Dependencies
- **UI Components**: Radix UI component library
- **Form Handling**: React Hook Form with Zod validation resolvers
- **File Upload**: React Dropzone for drag-and-drop file selection
- **Utilities**: date-fns for date manipulation, clsx for conditional styling

### Backend Dependencies
- **Database**: @neondatabase/serverless for PostgreSQL connections
- **ORM**: drizzle-orm with drizzle-zod for type-safe schema validation
- **File Upload**: multer for handling multipart/form-data
- **Session Management**: connect-pg-simple for PostgreSQL session storage
- **PDF Processing**: Ghostscript, ImageMagick, pdf-lib, pdf2svg, rsvg-convert (for SVG-based recoloring and vector preservation)
- **AI Vectorization**: External AI vectorization API

### Development Tools
- **Build**: esbuild for backend bundling, Vite for frontend
- **TypeScript**: Strict type checking
- **Linting**: ESLint with TypeScript rules