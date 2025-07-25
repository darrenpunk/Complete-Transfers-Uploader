import { storage } from "./storage";
import type { CanvasElement, Logo, TemplateSize } from "@shared/schema";
import fs from "fs";
import path from "path";
import { PDFDocument, rgb, degrees } from "pdf-lib";

export interface PDFGenerationData {
  projectId: string;
  templateSize: TemplateSize;
  canvasElements: CanvasElement[];
  logos: Logo[];
}

export class PDFGenerator {
  async generateProductionPDF(data: PDFGenerationData): Promise<Buffer> {
    const { projectId, templateSize, canvasElements, logos } = data;
    
    try {
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Convert template size from mm to points (1mm = 2.834645669 points)
      const pageWidth = templateSize.width * 2.834645669;
      const pageHeight = templateSize.height * 2.834645669;
      
      // Add a page with the template dimensions
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Create a logo map for quick lookup
      const logoMap = new Map(logos.map(logo => [logo.id, logo]));
      
      // Process each canvas element
      for (const element of canvasElements) {
        const logo = logoMap.get(element.logoId);
        if (!logo || !element.isVisible) continue;
        
        try {
          await this.embedLogoInPDF(pdfDoc, page, element, logo, templateSize);
        } catch (error) {
          console.error(`Failed to embed logo ${logo.originalName}:`, error);
          // Continue with other elements even if one fails
        }
      }
      
      // Serialize the PDF
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw new Error('Failed to generate PDF');
    }
  }
  
  private async embedLogoInPDF(
    pdfDoc: PDFDocument, 
    page: ReturnType<PDFDocument['addPage']>, 
    element: CanvasElement, 
    logo: Logo, 
    templateSize: TemplateSize
  ) {
    const uploadDir = path.join(process.cwd(), "uploads");
    
    // Try to use original PDF if available, otherwise use the converted image
    const shouldUseOriginal = logo.originalMimeType === 'application/pdf' && logo.originalFilename;
    const filePath = shouldUseOriginal 
      ? path.join(uploadDir, logo.originalFilename!)
      : path.join(uploadDir, logo.filename);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return;
    }
    
    try {
      if (shouldUseOriginal) {
        // Embed original PDF as vector
        await this.embedOriginalPDF(pdfDoc, page, element, filePath, templateSize);
      } else {
        // Embed as image
        await this.embedImageFile(pdfDoc, page, element, filePath, logo.mimeType, templateSize);
      }
    } catch (error) {
      console.error(`Failed to embed file ${filePath}:`, error);
      // Fallback to image version if PDF embedding fails
      if (shouldUseOriginal) {
        const imagePath = path.join(uploadDir, logo.filename);
        if (fs.existsSync(imagePath)) {
          await this.embedImageFile(pdfDoc, page, element, imagePath, logo.mimeType, templateSize);
        }
      }
    }
  }
  
  private async embedOriginalPDF(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    pdfPath: string,
    templateSize: TemplateSize
  ) {
    // Read and embed the original PDF
    const originalPdfBytes = fs.readFileSync(pdfPath);
    const originalPdf = await PDFDocument.load(originalPdfBytes);
    
    // Get the first page of the original PDF
    const [originalPage] = await pdfDoc.copyPages(originalPdf, [0]);
    
    // Calculate position and scale
    const x = element.x * 2.834645669; // Convert from mm to points
    const y = (templateSize.height - element.y - element.height) * 2.834645669;
    const width = element.width * 2.834645669;
    const height = element.height * 2.834645669;
    
    // Get original page dimensions
    const { width: origWidth, height: origHeight } = originalPage.getSize();
    
    // Calculate scale to fit the element bounds
    const scaleX = width / origWidth;
    const scaleY = height / origHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Draw the embedded page with proper scaling and positioning
    page.drawPage(originalPage, {
      x: x,
      y: y,
      width: origWidth * scale,
      height: origHeight * scale,
      rotate: degrees(element.rotation || 0),
      opacity: 1.0, // Remove opacity for now since it's not in schema
    });
  }
  
  private async embedImageFile(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    element: CanvasElement,
    imagePath: string,
    mimeType: string,
    templateSize: TemplateSize
  ) {
    const imageBytes = fs.readFileSync(imagePath);
    
    let image;
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else if (mimeType.includes('png')) {
      image = await pdfDoc.embedPng(imageBytes);
    } else {
      console.warn(`Unsupported image type: ${mimeType}`);
      return;
    }
    
    // Calculate position (flip Y coordinate for PDF)
    const x = element.x * 2.834645669;
    const y = (templateSize.height - element.y - element.height) * 2.834645669;
    const width = element.width * 2.834645669;
    const height = element.height * 2.834645669;
    
    // Draw the image
    page.drawImage(image, {
      x: x,
      y: y,
      width: width,
      height: height,
      rotate: degrees(element.rotation || 0),
      opacity: 1.0, // Remove opacity for now since it's not in schema
    });
  }
  
  private createVectorPreservingPDF(templateSize: TemplateSize, elements: CanvasElement[], logos: Logo[]): string {
    // Create a PDF that embeds original vector PDFs as objects
    // This maintains vector data for production output
    
    const logoMap = new Map(logos.map(logo => [logo.id, logo]));
    
    let pdfObjects = [];
    let objectIndex = 1;
    
    // PDF Header
    let pdf = `%PDF-1.4\n`;
    
    // Catalog object
    pdfObjects.push({
      id: objectIndex++,
      content: `<<\n/Type /Catalog\n/Pages ${objectIndex} 0 R\n>>`
    });
    
    // Pages object
    pdfObjects.push({
      id: objectIndex++,
      content: `<<\n/Type /Pages\n/Kids [${objectIndex} 0 R]\n/Count 1\n>>`
    });
    
    // Page object
    const pageContent = this.generatePageContent(elements, logoMap, templateSize);
    pdfObjects.push({
      id: objectIndex++,
      content: `<<\n/Type /Page\n/Parent ${objectIndex - 1} 0 R\n/MediaBox [0 0 ${templateSize.width * 2.83465} ${templateSize.height * 2.83465}]\n/Contents ${objectIndex} 0 R\n/Resources <<\n/XObject <<\n${this.generateXObjectReferences(elements, logoMap)}\n>>\n>>\n>>`
    });
    
    // Content stream
    pdfObjects.push({
      id: objectIndex++,
      content: `<<\n/Length ${pageContent.length}\n>>\nstream\n${pageContent}\nendstream`
    });
    
    // Add external PDF objects for vector preservation
    for (const element of elements) {
      const logo = logoMap.get(element.logoId);
      if (logo?.originalMimeType === 'application/pdf' && logo.originalFilename) {
        // Reference to original PDF for vector data
        pdfObjects.push({
          id: objectIndex++,
          content: `<<\n/Type /XObject\n/Subtype /Form\n/BBox [0 0 ${element.width} ${element.height}]\n/Length 0\n>>\nstream\n% Original PDF: ${logo.originalName}\n% Vector data preserved from: ${logo.originalUrl}\nendstream`
        });
      }
    }
    
    // Write objects
    const xrefOffsets = [];
    for (const obj of pdfObjects) {
      xrefOffsets.push(pdf.length);
      pdf += `${obj.id} 0 obj\n${obj.content}\nendobj\n\n`;
    }
    
    // XRef table
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${pdfObjects.length + 1}\n0000000000 65535 f \n`;
    
    for (const offset of xrefOffsets) {
      pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    
    // Trailer
    pdf += `\ntrailer\n<<\n/Size ${pdfObjects.length + 1}\n/Root 1 0 R\n>>\nstartxref\n${xrefPos}\n%%EOF`;
    
    return pdf;
  }
  
  private generatePageContent(elements: CanvasElement[], logoMap: Map<string, Logo>, templateSize: TemplateSize): string {
    let content = '';
    
    for (const element of elements) {
      const logo = logoMap.get(element.logoId);
      if (!logo) continue;
      
      // Transform matrix for positioning and scaling
      const scaleX = element.width / 100; // Adjust scaling as needed
      const scaleY = element.height / 100;
      
      content += `q\n`; // Save graphics state
      content += `${scaleX} 0 0 ${scaleY} ${element.x} ${templateSize.height * 2.83465 - element.y - element.height} cm\n`; // Transform matrix
      
      if (logo.originalMimeType === 'application/pdf') {
        // Reference original PDF content for vector preservation
        content += `/PDF${element.logoId} Do\n`;
      } else {
        // For non-PDF images, embed as usual
        content += `/IMG${element.logoId} Do\n`;
      }
      
      content += `Q\n`; // Restore graphics state
    }
    
    return content;
  }
  
  private generateXObjectReferences(elements: CanvasElement[], logoMap: Map<string, Logo>): string {
    let refs = '';
    
    for (const element of elements) {
      const logo = logoMap.get(element.logoId);
      if (!logo) continue;
      
      if (logo.originalMimeType === 'application/pdf') {
        refs += `/PDF${element.logoId} ${5 + elements.indexOf(element)} 0 R\n`;
      } else {
        refs += `/IMG${element.logoId} ${5 + elements.indexOf(element)} 0 R\n`;
      }
    }
    
    return refs;
  }
}

export const pdfGenerator = new PDFGenerator();