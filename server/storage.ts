import type { SelectProject, SelectLogo, InsertProject, InsertLogo, ProjectElement } from "../shared/schema";

export interface IStorage {
  // Projects
  createProject(data: InsertProject): Promise<SelectProject>;
  getProject(id: string): Promise<SelectProject | null>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<SelectProject>;
  getAllProjects(): Promise<SelectProject[]>;
  
  // Logos
  createLogo(data: InsertLogo): Promise<SelectLogo>;
  getLogo(id: string): Promise<SelectLogo | null>;
  getAllLogos(): Promise<SelectLogo[]>;
  
  // Project elements (for canvas positioning)
  updateProjectElements(projectId: string, elements: ProjectElement[]): Promise<void>;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private projects = new Map<string, SelectProject>();
  private logos = new Map<string, SelectLogo>();

  async createProject(data: InsertProject): Promise<SelectProject> {
    const id = Date.now().toString();
    const project: SelectProject = {
      id,
      ...data,
      elements: data.elements || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.set(id, project);
    return project;
  }

  async getProject(id: string): Promise<SelectProject | null> {
    return this.projects.get(id) || null;
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<SelectProject> {
    const existing = this.projects.get(id);
    if (!existing) throw new Error('Project not found');
    
    const updated: SelectProject = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.projects.set(id, updated);
    return updated;
  }

  async getAllProjects(): Promise<SelectProject[]> {
    return Array.from(this.projects.values());
  }

  async createLogo(data: InsertLogo): Promise<SelectLogo> {
    const id = Date.now().toString();
    const logo: SelectLogo = {
      id,
      ...data,
      createdAt: new Date(),
    };
    this.logos.set(id, logo);
    return logo;
  }

  async getLogo(id: string): Promise<SelectLogo | null> {
    return this.logos.get(id) || null;
  }

  async getAllLogos(): Promise<SelectLogo[]> {
    return Array.from(this.logos.values());
  }

  async updateProjectElements(projectId: string, elements: ProjectElement[]): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    
    const updated: SelectProject = {
      ...project,
      elements,
      updatedAt: new Date(),
    };
    this.projects.set(projectId, updated);
  }
}

// Shared storage instance
export const storage = new MemStorage();