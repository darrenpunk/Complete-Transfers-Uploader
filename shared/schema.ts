import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  templateSize: text("template_size").notNull(),
  garmentColor: text("garment_color").notNull(),
  inkColor: text("ink_color"), // For single colour transfers
  appliqueBadgesForm: jsonb("applique_badges_form"), // Store embroidery form data for Applique Badges
  quantity: integer("quantity").notNull().default(1), // Number of copies/quantity (total or default if multi-color)
  garmentColors: jsonb("garment_colors"), // For multi-color orders: [{color, colorName, quantity}]
  comments: text("comments"), // User comments/special instructions for production
  status: text("status").notNull().default("draft"), // draft, in_progress, completed
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const logos = pgTable("logos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  width: integer("width"),
  height: integer("height"),
  url: text("url").notNull(),
  originalFilename: text("original_filename"), // Store original PDF filename for vector output
  originalMimeType: text("original_mime_type"), // Store original PDF mime type
  originalUrl: text("original_url"), // Store original PDF URL for vector output
  svgColors: jsonb("svg_colors"), // Store detected SVG colors for color manipulation
  svgFonts: jsonb("svg_fonts"), // Store detected SVG fonts for font analysis
  fontsOutlined: boolean("fonts_outlined").default(false), // Track if fonts have been outlined
  contentBounds: jsonb("content_bounds"), // Store actual content boundaries for proper cropping {minX, minY, maxX, maxY}
  isMixedContent: boolean("is_mixed_content").default(false), // Track if file contains both raster and vector content
  isPhotographic: boolean("is_photographic").default(false), // Track if raster file was marked as photographic
  isCMYKPreserved: boolean("is_cmyk_preserved").default(false), // Track if original file had CMYK colors preserved
  isPdfWithRasterOnly: boolean("is_pdf_with_raster_only").default(false), // Track if PDF contains only raster images
  extractedRasterPath: text("extracted_raster_path"), // Path to deduplicated PNG extracted from PDF
  previewFilename: text("preview_filename"), // PNG preview filename for CMYK PDFs
  isComplexVector: boolean("is_complex_vector").default(false), // Track if SVG has too many paths for browser rendering
  vectorComplexityMetrics: jsonb("vector_complexity_metrics"), // Store path counts and complexity metrics
  canvasFallbackFilename: text("canvas_fallback_filename"), // PNG fallback for canvas display of complex vectors
  externalFileUrl: text("external_file_url"), // WeTransfer/Dropbox link for files too complex to upload directly
  externalFileService: text("external_file_service"), // Service used: wetransfer, dropbox, etc.
  isPlaceholder: boolean("is_placeholder").default(false), // Track if this is a placeholder for externally hosted file
  dropboxFileRequestId: text("dropbox_file_request_id"), // Dropbox file request ID for tracking uploads
  dropboxFilePath: text("dropbox_file_path"), // Path to uploaded file in Dropbox
  dropboxUploadedAt: text("dropbox_uploaded_at"), // Timestamp when file was uploaded to Dropbox
  originalWidth: real("original_width"), // Original PDF/artwork width in mm (before auto-scaling)
  originalHeight: real("original_height"), // Original PDF/artwork height in mm (before auto-scaling)
  originalPdfBounds: jsonb("original_pdf_bounds"), // Original PDF content bounds BEFORE normalization (for cropping during PDF generation)
});

export const canvasElements = pgTable("canvas_elements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  logoId: varchar("logo_id"), // Optional for text/shape elements
  elementType: text("element_type").notNull().default("logo"), // logo, text, rectangle, circle, line
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull(),
  height: real("height").notNull(),
  rotation: real("rotation").notNull().default(0),
  zIndex: integer("z_index").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  isLocked: boolean("is_locked").notNull().default(false),
  colorOverrides: jsonb("color_overrides"), // Store SVG color changes as JSON
  garmentColor: text("garment_color"), // Individual garment color per logo
  // Text element properties
  textContent: text("text_content"), // Text content for text elements
  fontSize: real("font_size").default(16), // Font size in points
  fontFamily: text("font_family").default("Arial"), // Font family
  textColor: text("text_color").default("#000000"), // Text color
  textAlign: text("text_align").default("left"), // left, center, right
  fontWeight: text("font_weight").default("normal"), // normal, bold
  fontStyle: text("font_style").default("normal"), // normal, italic
  // Shape element properties
  fillColor: text("fill_color").default("#000000"), // Fill color for shapes
  strokeColor: text("stroke_color"), // Stroke color for shapes
  strokeWidth: real("stroke_width").default(1), // Stroke width for shapes
  opacity: real("opacity").default(1), // Element opacity
  groupId: text("group_id"), // Group ID for grouping elements together
});

export const templateSizes = pgTable("template_sizes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  label: text("label").notNull(),
  width: integer("width").notNull(), // in mm
  height: integer("height").notNull(), // in mm
  pixelWidth: integer("pixel_width").notNull(), // at 72 DPI
  pixelHeight: integer("pixel_height").notNull(), // at 72 DPI
  group: text("group").notNull(), // template group category
  description: text("description"), // product description
  placeholderImage: text("placeholder_image"), // Template-specific placeholder for Dropbox uploads
});

export const vectorizationRequests = pgTable("vectorization_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  url: text("url").notNull(),
  comments: text("comments").notNull(),
  printSize: text("print_size").notNull(), // Final print size requirement
  serviceType: text("service_type").notNull().default("vectorization-only"), // vectorization-only or vectorization-with-product
  transferProduct: text("transfer_product"), // Template ID if vectorization-with-product
  quantity: integer("quantity"), // Quantity if vectorization-with-product
  garmentColor: text("garment_color"), // Garment color for the transfer
  inkColor: text("ink_color"), // Ink color for single-color transfers
  charge: real("charge").notNull().default(15), // 15 euro charge
  status: text("status").notNull().default("pending"), // pending, processing, completed, cancelled
  webcartOrderId: text("webcart_order_id"), // ID from webcart integration
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"), // When vectorization was completed
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"), // open, in_progress, resolved, closed
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertLogoSchema = createInsertSchema(logos).omit({
  id: true,
});

export const insertCanvasElementSchema = createInsertSchema(canvasElements).omit({
  id: true,
});

export const insertTemplateSizeSchema = createInsertSchema(templateSizes).omit({
  id: true,
});

export const insertVectorizationRequestSchema = createInsertSchema(vectorizationRequests).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  status: true,
});

// Update schemas
export const updateCanvasElementSchema = createInsertSchema(canvasElements).partial().omit({
  id: true,
  projectId: true,
  logoId: true,
});

// Types
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export type InsertLogo = z.infer<typeof insertLogoSchema>;
export type Logo = typeof logos.$inferSelect;

export type InsertCanvasElement = z.infer<typeof insertCanvasElementSchema>;
export type CanvasElement = typeof canvasElements.$inferSelect;

export type InsertTemplateSize = z.infer<typeof insertTemplateSizeSchema>;
export type TemplateSize = typeof templateSizes.$inferSelect;

export type InsertVectorizationRequest = z.infer<typeof insertVectorizationRequestSchema>;
export type VectorizationRequest = typeof vectorizationRequests.$inferSelect;

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertProjectSchema>;

// Content bounds type definition
export type ContentBounds = {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  width: number;
  height: number;
};

// Garment color with quantity type definition
export type GarmentColorItem = {
  color: string; // Hex color code
  colorName: string; // Human-readable name
  quantity: number; // Quantity for this specific color
};
