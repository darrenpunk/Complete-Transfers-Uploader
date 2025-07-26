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
});

export const canvasElements = pgTable("canvas_elements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  logoId: varchar("logo_id").notNull(),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  width: real("width").notNull(),
  height: real("height").notNull(),
  rotation: real("rotation").notNull().default(0),
  zIndex: integer("z_index").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  isLocked: boolean("is_locked").notNull().default(false),
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
