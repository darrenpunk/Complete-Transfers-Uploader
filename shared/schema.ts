// Simple TypeScript types for the project (no external dependencies)

// Types for project elements (for canvas positioning)
export interface ProjectElement {
  id: string;
  logoId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Project {
  id: string;
  name: string;
  templateSize: string;
  garmentColor: string;
  elements: ProjectElement[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Logo {
  id: string;
  filename: string;
  originalName: string;
  path: string;
  mimetype: string;
  createdAt: Date;
}

// Input types (without auto-generated fields)
export type InsertProject = Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertLogo = Omit<Logo, 'id' | 'createdAt'>;
export type SelectProject = Project;
export type SelectLogo = Logo;