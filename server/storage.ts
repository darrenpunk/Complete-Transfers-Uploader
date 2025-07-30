import { 
  type User, 
  type InsertUser, 
  type Project, 
  type InsertProject,
  type Logo,
  type InsertLogo,
  type CanvasElement,
  type InsertCanvasElement,
  type TemplateSize,
  type InsertTemplateSize
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Project methods
  getProject(id: string): Promise<Project | undefined>;
  getProjects(): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Logo methods
  getLogo(id: string): Promise<Logo | undefined>;
  getLogosByProject(projectId: string): Promise<Logo[]>;
  createLogo(logo: InsertLogo): Promise<Logo>;
  updateLogo(id: string, updates: Partial<Logo>): Promise<Logo | undefined>;
  deleteLogo(id: string): Promise<boolean>;

  // Canvas element methods
  getCanvasElement(id: string): Promise<CanvasElement | undefined>;
  getCanvasElementsByProject(projectId: string): Promise<CanvasElement[]>;
  createCanvasElement(element: InsertCanvasElement): Promise<CanvasElement>;
  updateCanvasElement(id: string, updates: Partial<CanvasElement>): Promise<CanvasElement | undefined>;
  deleteCanvasElement(id: string): Promise<boolean>;
  duplicateCanvasElement(id: string): Promise<CanvasElement | undefined>;
  deleteCanvasElementsByLogo(logoId: string): Promise<void>;

  // Template size methods
  getTemplateSize(id: string): Promise<TemplateSize | undefined>;
  getTemplateSizes(): Promise<TemplateSize[]>;
  createTemplateSize(templateSize: InsertTemplateSize): Promise<TemplateSize>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private projects: Map<string, Project> = new Map();
  private logos: Map<string, Logo> = new Map();
  private canvasElements: Map<string, CanvasElement> = new Map();
  private templateSizes: Map<string, TemplateSize> = new Map();

  constructor() {
    this.initializeTemplateSizes();
  }

  private initializeTemplateSizes() {
    const standardSizes = [
      // Full Colour Transfers
      { id: "template-A3", name: "A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-A4", name: "A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-A5", name: "A5", label: "A5", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-A6", name: "A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-transfer-size", name: "transfer_size", label: "295×100mm", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-square", name: "square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-badge", name: "badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-small", name: "small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Full Colour Transfers", description: "Full-Colour screen printed heat applied transfers" },
      
      // Full Colour Metallic
      { id: "metallic-A3", name: "metallic_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-A4", name: "metallic_A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-A5", name: "metallic_A5", label: "A5", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-A6", name: "metallic_A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-transfer-size", name: "metallic_transfer_size", label: "295×100mm", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-square", name: "metallic_square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-badge", name: "metallic_badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-small", name: "metallic_small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Full Colour Metallic", description: "Full-Colour screen printed with metallic finish" },
      
      // Full Colour HD
      { id: "hd-A3", name: "hd_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Full Colour HD", description: "High-definition full-colour screen printed transfers" },
      { id: "hd-A4", name: "hd_A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Full Colour HD", description: "High-definition full-colour screen printed transfers" },
      
      // Single Colour Transfers
      { id: "single-A3", name: "single_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-A4", name: "single_A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-A5", name: "single_A5", label: "A5", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-A6", name: "single_A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-transfer-size", name: "single_transfer_size", label: "295×100mm", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-square", name: "single_square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-badge", name: "single_badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-small", name: "single_small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Single Colour Transfers", description: "Screen printed using our off-the-shelf colour range" },
      
      // DTF - Digital Film Transfers
      { id: "dtf-SRA3", name: "SRA3", label: "SRA3", width: 320, height: 450, pixelWidth: 907, pixelHeight: 1276, group: "DTF - Digital Film Transfers", description: "Small order digital heat transfers" },
      { id: "dtf-large", name: "large_dtf", label: "1000×550mm", width: 1000, height: 550, pixelWidth: 2834, pixelHeight: 1559, group: "DTF - Digital Film Transfers", description: "Small order digital heat transfers" },
      
      // UV DTF
      { id: "uvdtf-A3", name: "uv_dtf_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "UV DTF", description: "Hard Surface Transfers" },
      
      // Custom Badges
      { id: "woven-A6", name: "woven_A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Custom Badges", description: "Polyester textile woven badges" },
      { id: "woven-square", name: "woven_square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Custom Badges", description: "Polyester textile woven badges" },
      { id: "woven-badge", name: "woven_badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Custom Badges", description: "Polyester textile woven badges" },
      { id: "woven-small", name: "woven_small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Custom Badges", description: "Polyester textile woven badges" },
      
      // Applique Badges (keeping as separate group)
      { id: "applique-A6", name: "applique_A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Applique Badges", description: "Fabric applique badges" },
      { id: "applique-square", name: "applique_square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Applique Badges", description: "Fabric applique badges" },
      { id: "applique-badge", name: "applique_badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Applique Badges", description: "Fabric applique badges" },
      { id: "applique-small", name: "applique_small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Applique Badges", description: "Fabric applique badges" },
      
      // Reflective Transfers
      { id: "reflective-A3", name: "reflective_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Reflective Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      
      // ZERO Single Colour Transfers
      { id: "zero-silicone-A3", name: "zero_silicone_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "ZERO Single Colour Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      
      // Sublimation Transfers
      { id: "sublimation-A3", name: "sublimation_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Sublimation Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-A4", name: "sublimation_A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Sublimation Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-mug", name: "sublimation_mug", label: "Mug Sized (240×100mm)", width: 240, height: 100, pixelWidth: 680, pixelHeight: 283, group: "Sublimation Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
    ];

    standardSizes.forEach(size => {
      this.templateSizes.set(size.id, size);
    });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: any): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Project methods
  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const project: Project = { 
      ...insertProject, 
      id, 
      status: insertProject.status || "draft",
      createdAt: new Date().toISOString(),
      inkColor: insertProject.inkColor || null
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
    const existing = this.projects.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  // Logo methods
  async getLogo(id: string): Promise<Logo | undefined> {
    return this.logos.get(id);
  }

  async getLogosByProject(projectId: string): Promise<Logo[]> {
    return Array.from(this.logos.values()).filter(logo => logo.projectId === projectId);
  }

  async createLogo(insertLogo: InsertLogo): Promise<Logo> {
    const id = randomUUID();
    const logo: Logo = { 
      ...insertLogo, 
      id,
      width: insertLogo.width || null,
      height: insertLogo.height || null,
      originalFilename: insertLogo.originalFilename ?? null,
      originalMimeType: insertLogo.originalMimeType ?? null,
      originalUrl: insertLogo.originalUrl ?? null,
      svgColors: insertLogo.svgColors || null,
      svgFonts: insertLogo.svgFonts || null,
      fontsOutlined: insertLogo.fontsOutlined || false
    };
    this.logos.set(id, logo);
    return logo;
  }

  async updateLogo(id: string, updates: Partial<Logo>): Promise<Logo | undefined> {
    const existing = this.logos.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.logos.set(id, updated);
    return updated;
  }

  async deleteLogo(id: string): Promise<boolean> {
    return this.logos.delete(id);
  }

  // Canvas element methods
  async getCanvasElement(id: string): Promise<CanvasElement | undefined> {
    return this.canvasElements.get(id);
  }

  async getCanvasElementsByProject(projectId: string): Promise<CanvasElement[]> {
    return Array.from(this.canvasElements.values())
      .filter(element => element.projectId === projectId)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  async createCanvasElement(insertElement: InsertCanvasElement): Promise<CanvasElement> {
    const id = randomUUID();
    const element: CanvasElement = { 
      ...insertElement, 
      id,
      x: insertElement.x || 0,
      y: insertElement.y || 0,
      rotation: insertElement.rotation || 0,
      zIndex: insertElement.zIndex || 0,
      isVisible: insertElement.isVisible !== undefined ? insertElement.isVisible : true,
      isLocked: insertElement.isLocked !== undefined ? insertElement.isLocked : false,
      colorOverrides: insertElement.colorOverrides || null,
      garmentColor: insertElement.garmentColor || null,
      logoId: insertElement.logoId || null,
      opacity: insertElement.opacity || null
    };
    this.canvasElements.set(id, element);
    return element;
  }

  async updateCanvasElement(id: string, updates: Partial<CanvasElement>): Promise<CanvasElement | undefined> {
    const existing = this.canvasElements.get(id);
    if (!existing) return undefined;
    
    console.log('Storage updateCanvasElement:', { id, existing: existing.rotation, updates });
    const updated = { ...existing, ...updates };
    this.canvasElements.set(id, updated);
    console.log('Storage updated element:', { id, rotation: updated.rotation });
    return updated;
  }

  async deleteCanvasElement(id: string): Promise<boolean> {
    return this.canvasElements.delete(id);
  }

  async duplicateCanvasElement(id: string): Promise<CanvasElement | undefined> {
    const original = this.canvasElements.get(id);
    if (!original) return undefined;
    
    // Create a duplicate with new ID and offset position
    const duplicateId = randomUUID();
    const duplicate: CanvasElement = {
      ...original,
      id: duplicateId,
      x: original.x + 20, // Offset by 20mm
      y: original.y + 20, // Offset by 20mm
      zIndex: Math.max(...Array.from(this.canvasElements.values()).map(el => el.zIndex)) + 1
    };
    
    this.canvasElements.set(duplicateId, duplicate);
    return duplicate;
  }

  async deleteCanvasElementsByLogo(logoId: string): Promise<void> {
    const elementsToDelete: string[] = [];
    
    this.canvasElements.forEach((element, id) => {
      if (element.logoId === logoId) {
        elementsToDelete.push(id);
      }
    });
    
    elementsToDelete.forEach(id => {
      this.canvasElements.delete(id);
    });
  }

  // Template size methods
  async getTemplateSize(id: string): Promise<TemplateSize | undefined> {
    return this.templateSizes.get(id);
  }

  async getTemplateSizes(): Promise<TemplateSize[]> {
    return Array.from(this.templateSizes.values());
  }

  async createTemplateSize(insertTemplateSize: InsertTemplateSize): Promise<TemplateSize> {
    const id = randomUUID();
    const templateSize: TemplateSize = { ...insertTemplateSize, id };
    this.templateSizes.set(id, templateSize);
    return templateSize;
  }
}

export const storage = new MemStorage();
