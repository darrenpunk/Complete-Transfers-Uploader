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
  type InsertTemplateSize,
  type VectorizationRequest,
  type InsertVectorizationRequest
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

  // Vectorization request methods
  getVectorizationRequest(id: string): Promise<VectorizationRequest | undefined>;
  getVectorizationRequests(): Promise<VectorizationRequest[]>;
  createVectorizationRequest(request: InsertVectorizationRequest): Promise<VectorizationRequest>;
  updateVectorizationRequest(id: string, updates: Partial<VectorizationRequest>): Promise<VectorizationRequest | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private projects: Map<string, Project> = new Map();
  private logos: Map<string, Logo> = new Map();
  private canvasElements: Map<string, CanvasElement> = new Map();
  private templateSizes: Map<string, TemplateSize> = new Map();
  private vectorizationRequests: Map<string, VectorizationRequest> = new Map();

  constructor() {
    this.initializeTemplateSizes();
  }

  private initializeTemplateSizes() {
    const standardSizes = [
      // Screen Printed Transfers - Full Colour
      { id: "template-A3", name: "A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-A4", name: "A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-A5", name: "A5", label: "A5", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-A6", name: "A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-transfer-size", name: "transfer_size", label: "295×100mm", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-square", name: "square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-badge", name: "badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      { id: "template-small", name: "small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Screen Printed Transfers", description: "Full-Colour screen printed heat applied transfers" },
      
      // Screen Printed Transfers - Full Colour Metallic
      { id: "metallic-A3", name: "metallic_A3", label: "A3 Metallic", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-A4", name: "metallic_A4", label: "A4 Metallic", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-A5", name: "metallic_A5", label: "A5 Metallic", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-A6", name: "metallic_A6", label: "A6 Metallic", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-transfer-size", name: "metallic_transfer_size", label: "295×100mm Metallic", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-square", name: "metallic_square", label: "95×95mm Metallic", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-badge", name: "metallic_badge", label: "100×70mm Metallic", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      { id: "metallic-small", name: "metallic_small", label: "60×60mm Metallic", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Screen Printed Transfers", description: "Full-Colour screen printed with metallic finish" },
      
      // Screen Printed Transfers - Full Colour HD
      { id: "hd-A3", name: "hd_A3", label: "A3 HD", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Screen Printed Transfers", description: "High-definition full-colour screen printed transfers" },
      { id: "hd-A4", name: "hd_A4", label: "A4 HD", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Screen Printed Transfers", description: "High-definition full-colour screen printed transfers" },
      
      // Screen Printed Transfers - Single Colour
      { id: "single-A3", name: "single_A3", label: "A3 Single Colour", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-A4", name: "single_A4", label: "A4 Single Colour", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-A5", name: "single_A5", label: "A5 Single Colour", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-A6", name: "single_A6", label: "A6 Single Colour", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-transfer-size", name: "single_transfer_size", label: "295×100mm Single Colour", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-square", name: "single_square", label: "95×95mm Single Colour", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-badge", name: "single_badge", label: "100×70mm Single Colour", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      { id: "single-small", name: "single_small", label: "60×60mm Single Colour", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Screen Printed Transfers", description: "Screen printed using our off-the-shelf colour range" },
      
      // Screen Printed Transfers - Zero
      { id: "zero-A3", name: "zero_A3", label: "A3 Zero", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-A4", name: "zero_A4", label: "A4 Zero", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-A5", name: "zero_A5", label: "A5 Zero", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-A6", name: "zero_A6", label: "A6 Zero", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-transfer-size", name: "zero_transfer_size", label: "295×100mm Zero", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-square", name: "zero_square", label: "95×95mm Zero", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-badge", name: "zero_badge", label: "100×70mm Zero", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      { id: "zero-small", name: "zero_small", label: "60×60mm Zero", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Screen Printed Transfers", description: "Zero inks are super stretchy and do not bleed!" },
      
      // Digital Transfers - DTF
      { id: "dtf-SRA3", name: "SRA3", label: "SRA3", width: 320, height: 450, pixelWidth: 907, pixelHeight: 1276, group: "Digital Transfers", description: "Small order digital heat transfers" },
      { id: "dtf-large", name: "large_dtf", label: "1000×550mm DTF", width: 1000, height: 550, pixelWidth: 2834, pixelHeight: 1559, group: "Digital Transfers", description: "Small order digital heat transfers" },
      
      // Digital Transfers - UV DTF
      { id: "uvdtf-A3", name: "uv_dtf_A3", label: "A3 UV DTF", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Digital Transfers", description: "Hard Surface Transfers" },
      
      // Digital Transfers - Custom Badges
      { id: "woven-A6", name: "woven_A6", label: "A6 Woven", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Digital Transfers", description: "Polyester textile woven badges" },
      { id: "woven-square", name: "woven_square", label: "95×95mm Woven", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Digital Transfers", description: "Polyester textile woven badges" },
      { id: "woven-badge", name: "woven_badge", label: "100×70mm Woven", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Digital Transfers", description: "Polyester textile woven badges" },
      { id: "woven-small", name: "woven_small", label: "60×60mm Woven", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Digital Transfers", description: "Polyester textile woven badges" },
      
      // Digital Transfers - Applique Badges
      { id: "applique-A6", name: "applique_A6", label: "A6 Applique", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Digital Transfers", description: "Fabric applique badges" },
      { id: "applique-square", name: "applique_square", label: "95×95mm Applique", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Digital Transfers", description: "Fabric applique badges" },
      { id: "applique-badge", name: "applique_badge", label: "100×70mm Applique", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Digital Transfers", description: "Fabric applique badges" },
      { id: "applique-small", name: "applique_small", label: "60×60mm Applique", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Digital Transfers", description: "Fabric applique badges" },
      
      // Screen Printed Transfers - Reflective (Single Colour)
      { id: "reflective-A3", name: "reflective_A3", label: "A3", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-A4", name: "reflective_A4", label: "A4", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-A5", name: "reflective_A5", label: "A5", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-A6", name: "reflective_A6", label: "A6", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-transfer-size", name: "reflective_transfer_size", label: "295×100mm", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-square", name: "reflective_square", label: "95×95mm", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-badge", name: "reflective_badge", label: "100×70mm", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      { id: "reflective-small", name: "reflective_small", label: "60×60mm", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Screen Printed Transfers", description: "Our silver reflective helps enhance the visibility of the wearer at night" },
      
      // Digital Transfers - Sublimation
      { id: "sublimation-A3", name: "sublimation_A3", label: "A3 Sublimation", width: 297, height: 420, pixelWidth: 842, pixelHeight: 1191, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-A4", name: "sublimation_A4", label: "A4 Sublimation", width: 210, height: 297, pixelWidth: 595, pixelHeight: 842, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-A5", name: "sublimation_A5", label: "A5 Sublimation", width: 148, height: 210, pixelWidth: 420, pixelHeight: 595, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-A6", name: "sublimation_A6", label: "A6 Sublimation", width: 105, height: 148, pixelWidth: 298, pixelHeight: 420, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-transfer-size", name: "sublimation_transfer_size", label: "295×100mm Sublimation", width: 295, height: 100, pixelWidth: 836, pixelHeight: 283, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-square", name: "sublimation_square", label: "95×95mm Sublimation", width: 95, height: 95, pixelWidth: 269, pixelHeight: 269, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-badge", name: "sublimation_badge", label: "100×70mm Sublimation", width: 100, height: 70, pixelWidth: 283, pixelHeight: 198, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
      { id: "sublimation-small", name: "sublimation_small", label: "60×60mm Sublimation", width: 60, height: 60, pixelWidth: 170, pixelHeight: 170, group: "Digital Transfers", description: "Sublimation heat transfers are designed for full-colour decoration of white, 100% polyester" },
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
      inkColor: insertProject.inkColor || null,
      appliqueBadgesForm: insertProject.appliqueBadgesForm || null
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
    // Use provided ID if available, otherwise generate new one
    const id = (insertLogo as any).id || randomUUID();
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
      fontsOutlined: insertLogo.fontsOutlined || false,
      contentBounds: insertLogo.contentBounds || null,
      isMixedContent: insertLogo.isMixedContent || false,
      isPhotographic: insertLogo.isPhotographic || false,
      isCMYKPreserved: insertLogo.isCMYKPreserved || false,
      isPdfWithRasterOnly: insertLogo.isPdfWithRasterOnly || false,
      extractedRasterPath: insertLogo.extractedRasterPath ?? null,
      previewFilename: insertLogo.previewFilename || null
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
    console.log(`🔍 DEBUG: Creating canvas element with logoId: ${insertElement.logoId}`);
    const id = randomUUID();
    const element: CanvasElement = { 
      ...insertElement, 
      id,
      elementType: insertElement.elementType || 'logo',
      x: insertElement.x || 0,
      y: insertElement.y || 0,
      rotation: insertElement.rotation || 0,
      zIndex: insertElement.zIndex || 0,
      isVisible: insertElement.isVisible !== undefined ? insertElement.isVisible : true,
      isLocked: insertElement.isLocked !== undefined ? insertElement.isLocked : false,
      colorOverrides: insertElement.colorOverrides || null,
      garmentColor: insertElement.garmentColor ?? null,
      logoId: insertElement.logoId ?? null,
      textContent: insertElement.textContent ?? null,
      fontSize: insertElement.fontSize ?? null,
      fontFamily: insertElement.fontFamily ?? null,
      textColor: insertElement.textColor ?? null,
      textAlign: insertElement.textAlign ?? null,
      fontWeight: insertElement.fontWeight ?? null,
      fontStyle: insertElement.fontStyle ?? null,
      fillColor: insertElement.fillColor ?? null,
      strokeColor: insertElement.strokeColor ?? null,
      strokeWidth: insertElement.strokeWidth ?? null,
      opacity: insertElement.opacity ?? null
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
    
    console.log('Original element for duplication:', { 
      id: original.id, 
      x: original.x, 
      y: original.y, 
      width: original.width, 
      height: original.height 
    });
    
    // Create a duplicate with new ID and offset position
    const duplicateId = randomUUID();
    const duplicate: CanvasElement = {
      ...original,
      id: duplicateId,
      x: original.x + 20, // Offset by 20mm
      y: original.y + 20, // Offset by 20mm
      width: original.width, // Keep original width
      height: original.height, // Keep original height
      zIndex: Math.max(...Array.from(this.canvasElements.values()).map(el => el.zIndex)) + 1
    };
    
    console.log('Created duplicate element:', { 
      id: duplicate.id, 
      x: duplicate.x, 
      y: duplicate.y, 
      width: duplicate.width, 
      height: duplicate.height 
    });
    
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
    const templateSize: TemplateSize = { 
      ...insertTemplateSize, 
      id,
      description: insertTemplateSize.description ?? null
    };
    this.templateSizes.set(id, templateSize);
    return templateSize;
  }

  // Vectorization request methods
  async getVectorizationRequest(id: string): Promise<VectorizationRequest | undefined> {
    return this.vectorizationRequests.get(id);
  }

  async getVectorizationRequests(): Promise<VectorizationRequest[]> {
    return Array.from(this.vectorizationRequests.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async createVectorizationRequest(insertRequest: InsertVectorizationRequest): Promise<VectorizationRequest> {
    const id = randomUUID();
    const request: VectorizationRequest = { 
      ...insertRequest, 
      id,
      charge: insertRequest.charge || 15,
      status: insertRequest.status || "pending",
      createdAt: new Date().toISOString(),
      webcartOrderId: insertRequest.webcartOrderId ?? null,
      completedAt: null
    };
    this.vectorizationRequests.set(id, request);
    return request;
  }

  async updateVectorizationRequest(id: string, updates: Partial<VectorizationRequest>): Promise<VectorizationRequest | undefined> {
    const existing = this.vectorizationRequests.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.vectorizationRequests.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
