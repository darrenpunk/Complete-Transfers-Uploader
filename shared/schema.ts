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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertProjectSchema>;

// Content bounds type definition
export type ContentBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
