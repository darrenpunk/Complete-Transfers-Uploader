# Logo Upload and Design Tool

## Overview

This is a full-stack web application for uploading logo files and designing layouts on garment templates. The application provides a workflow-based interface where users can upload logos, position them on canvas templates, and generate production-ready outputs. It's built with a modern React frontend and Express.js backend, using PostgreSQL for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Build Tool**: Vite with React plugin and hot module replacement

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints with JSON responses
- **File Handling**: Multer for multipart file uploads with validation
- **Error Handling**: Centralized error middleware with status codes
- **Development**: Hot reload with tsx for TypeScript execution

### Database Strategy
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (configured via DATABASE_URL environment variable)
- **Migrations**: Drizzle Kit for schema management
- **Connection**: Neon Database serverless driver for PostgreSQL connections

## Key Components

### Data Models
- **Users**: Basic user authentication schema
- **Projects**: Main project entity with template size and garment color
- **Logos**: File metadata for uploaded logos (filename, dimensions, MIME type)
- **Canvas Elements**: Positioned logo instances with transform properties (position, size, rotation, opacity)
- **Template Sizes**: Predefined canvas dimensions for different garment types

### File Upload System
- **Storage**: Local filesystem storage in `/uploads` directory
- **Validation**: File type restrictions (PNG, JPEG, SVG, PDF) with 10MB size limit
- **Processing**: Image dimension extraction and metadata storage

### Canvas System
- **Workspace**: Interactive canvas for logo positioning and manipulation
- **Properties Panel**: Real-time editing of element properties (position, size, rotation, opacity)
- **Transform Tools**: Drag-and-drop positioning with snap-to-grid functionality
- **Zoom Controls**: Canvas zoom with percentage display

### Workflow Management
- **Progress Steps**: 5-step workflow (Upload → Design → Pre-flight → Generate PDF → Attach to Order)
- **State Management**: Project status tracking (draft, in_progress, completed)
- **Tools Sidebar**: Context-sensitive tools based on current workflow step

## Data Flow

1. **Project Creation**: User creates a new project with template size and garment color selection
2. **Logo Upload**: Multiple file upload with client-side validation and progress tracking
3. **Canvas Design**: Drag-and-drop logo positioning with real-time property updates
4. **Element Management**: CRUD operations on canvas elements with optimistic updates
5. **State Persistence**: All changes automatically saved to PostgreSQL via Drizzle ORM

## External Dependencies

### Frontend Dependencies
- **UI Components**: Comprehensive Radix UI component library
- **Form Handling**: React Hook Form with Zod validation resolvers
- **File Upload**: React Dropzone for drag-and-drop file selection
- **Utilities**: date-fns for date manipulation, clsx for conditional styling

### Backend Dependencies
- **Database**: @neondatabase/serverless for PostgreSQL connections
- **ORM**: drizzle-orm with drizzle-zod for type-safe schema validation
- **File Upload**: multer for handling multipart/form-data
- **Session Management**: connect-pg-simple for PostgreSQL session storage

### Development Tools
- **Build**: esbuild for backend bundling, Vite for frontend
- **TypeScript**: Strict type checking with path mapping
- **Linting**: ESLint with TypeScript rules
- **Development**: Replit-specific plugins for runtime error handling

## Deployment Strategy

### Development Mode
- **Frontend**: Vite dev server with HMR on client directory
- **Backend**: tsx with nodemon-like behavior for TypeScript execution
- **Database**: Drizzle push for schema synchronization
- **File Serving**: Express static middleware for uploaded files

### Production Build
- **Frontend**: Vite build output to `dist/public`
- **Backend**: esbuild bundle to `dist/index.js` with external packages
- **Static Assets**: Served from build output directory
- **Environment**: NODE_ENV-based configuration switching

### Database Management
- **Schema**: Centralized in `shared/schema.ts` with Drizzle table definitions
- **Migrations**: Generated in `./migrations` directory
- **Environment**: DATABASE_URL required for all database operations
- **Connection**: Serverless-first approach with connection pooling

The application uses a monorepo structure with shared TypeScript types between frontend and backend, ensuring type safety across the full stack. The storage layer is abstracted with an interface-based approach, currently using in-memory storage but designed for easy PostgreSQL integration.