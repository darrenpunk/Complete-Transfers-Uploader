import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface AppliqueBadgesFormData {
  embroideryFileOptions: string[];
  embroideryThreadOptions: string[];
  position: string[];
  graphicSize: string;
  embroideredParts: string;
}

interface AppliquePDFData {
  originalPdfBuffer: Buffer;
  appliqueBadgesForm: AppliqueBadgesFormData;
  projectName?: string;
}

export class AppliqueBadgesPDFGenerator {
  /**
   * Generate PDF with applique badges form data on second A4 page
   * Takes existing PDF and adds A4 form page without affecting other outputs
   */
  async generateAppliquePDF(data: AppliquePDFData): Promise<Buffer> {
    console.log('📄 Applique Badges PDF Generation Started');
    console.log(`📋 Form data: ${Object.keys(data.appliqueBadgesForm).length} fields`);
    
    try {
      // Load the original PDF
      const originalPdf = await PDFDocument.load(data.originalPdfBuffer);
      
      // Create a new PDF document that will contain both pages
      const finalPdf = await PDFDocument.create();
      finalPdf.setTitle(data.projectName || 'Applique Badges Order');
      finalPdf.setCreator('CompleteTransfers.com Logo Uploader');
      
      // Copy all pages from original PDF
      const originalPages = await finalPdf.copyPages(originalPdf, originalPdf.getPageIndices());
      originalPages.forEach(page => finalPdf.addPage(page));
      
      // Add A4 form page (always A4: 210×297mm = 595×842 points)
      const formPage = finalPdf.addPage([595, 842]);
      
      // Render the applique form data on the new A4 page
      await this.renderAppliqueBadgesForm(formPage, data.appliqueBadgesForm, finalPdf);
      
      // Generate final PDF
      const pdfBytes = await finalPdf.save();
      console.log(`✅ Applique Badges PDF generated: ${pdfBytes.length} bytes with form page`);
      
      return Buffer.from(pdfBytes);
      
    } catch (error) {
      console.error('❌ Applique Badges PDF generation failed:', error);
      throw error;
    }
  }

  /**
   * Render applique badges form data on A4 page
   */
  private async renderAppliqueBadgesForm(
    page: any, 
    formData: AppliqueBadgesFormData, 
    pdfDoc: PDFDocument
  ) {
    try {
      console.log('🖨️ Rendering applique badges form on A4 page');
      
      // A4 dimensions: 595×842 points
      const pageWidth = 595;
      const pageHeight = 842;
      
      // Embed fonts
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Colors
      const titleColor = rgb(0.2, 0.2, 0.2); // Dark gray
      const sectionColor = rgb(0.4, 0.4, 0.4); // Medium gray
      const textColor = rgb(0.1, 0.1, 0.1); // Nearly black
      const borderColor = rgb(0.8, 0.8, 0.8); // Light gray
      
      let yPosition = pageHeight - 50; // Start from top with margin
      const leftMargin = 50;
      const rightMargin = pageWidth - 50;
      const lineHeight = 20;
      
      // Page title
      page.drawText('APPLIQUE BADGES EMBROIDERY SPECIFICATION', {
        x: leftMargin,
        y: yPosition,
        size: 16,
        font: helveticaBoldFont,
        color: titleColor,
      });
      yPosition -= 30;
      
      // Draw horizontal line
      page.drawLine({
        start: { x: leftMargin, y: yPosition },
        end: { x: rightMargin, y: yPosition },
        thickness: 1,
        color: borderColor,
      });
      yPosition -= 25;
      
      // Embroidery File Options
      if (formData.embroideryFileOptions.length > 0) {
        page.drawText('EMBROIDERY FILE OPTIONS:', {
          x: leftMargin,
          y: yPosition,
          size: 12,
          font: helveticaBoldFont,
          color: sectionColor,
        });
        yPosition -= lineHeight;
        
        formData.embroideryFileOptions.forEach(option => {
          page.drawText(`• ${option}`, {
            x: leftMargin + 20,
            y: yPosition,
            size: 10,
            font: helveticaFont,
            color: textColor,
          });
          yPosition -= 15;
        });
        yPosition -= 10;
      }
      
      // Embroidery Thread Options
      if (formData.embroideryThreadOptions.length > 0) {
        page.drawText('EMBROIDERY THREAD OPTIONS:', {
          x: leftMargin,
          y: yPosition,
          size: 12,
          font: helveticaBoldFont,
          color: sectionColor,
        });
        yPosition -= lineHeight;
        
        formData.embroideryThreadOptions.forEach(option => {
          page.drawText(`• ${option}`, {
            x: leftMargin + 20,
            y: yPosition,
            size: 10,
            font: helveticaFont,
            color: textColor,
          });
          yPosition -= 15;
        });
        yPosition -= 10;
      }
      
      // Position
      if (formData.position.length > 0) {
        page.drawText('POSITION:', {
          x: leftMargin,
          y: yPosition,
          size: 12,
          font: helveticaBoldFont,
          color: sectionColor,
        });
        yPosition -= lineHeight;
        
        // Display positions in a more compact format (2 columns)
        for (let i = 0; i < formData.position.length; i += 2) {
          const leftPos = formData.position[i];
          const rightPos = formData.position[i + 1];
          
          page.drawText(`• ${leftPos}`, {
            x: leftMargin + 20,
            y: yPosition,
            size: 10,
            font: helveticaFont,
            color: textColor,
          });
          
          if (rightPos) {
            page.drawText(`• ${rightPos}`, {
              x: leftMargin + 280,
              y: yPosition,
              size: 10,
              font: helveticaFont,
              color: textColor,
            });
          }
          yPosition -= 15;
        }
        yPosition -= 10;
      }
      
      // Graphic Size
      if (formData.graphicSize.trim()) {
        page.drawText('GRAPHIC SIZE:', {
          x: leftMargin,
          y: yPosition,
          size: 12,
          font: helveticaBoldFont,
          color: sectionColor,
        });
        yPosition -= lineHeight;
        
        // Wrap text if it's too long
        const sizeText = formData.graphicSize.trim();
        const maxWidth = rightMargin - leftMargin - 20;
        const wrappedSizeText = this.wrapText(sizeText, maxWidth, 10, helveticaFont);
        
        wrappedSizeText.forEach(line => {
          page.drawText(line, {
            x: leftMargin + 20,
            y: yPosition,
            size: 10,
            font: helveticaFont,
            color: textColor,
          });
          yPosition -= 15;
        });
        yPosition -= 10;
      }
      
      // Embroidered Parts
      if (formData.embroideredParts.trim()) {
        page.drawText('EMBROIDERED PARTS:', {
          x: leftMargin,
          y: yPosition,
          size: 12,
          font: helveticaBoldFont,
          color: sectionColor,
        });
        yPosition -= lineHeight;
        
        // Wrap text if it's too long
        const partsText = formData.embroideredParts.trim();
        const maxWidth = rightMargin - leftMargin - 20;
        const wrappedPartsText = this.wrapText(partsText, maxWidth, 10, helveticaFont);
        
        wrappedPartsText.forEach(line => {
          page.drawText(line, {
            x: leftMargin + 20,
            y: yPosition,
            size: 10,
            font: helveticaFont,
            color: textColor,
          });
          yPosition -= 15;
        });
      }
      
      // Footer information
      yPosition = 80;
      page.drawLine({
        start: { x: leftMargin, y: yPosition },
        end: { x: rightMargin, y: yPosition },
        thickness: 1,
        color: borderColor,
      });
      yPosition -= 20;
      
      page.drawText('Generated by CompleteTransfers.com Logo Uploader', {
        x: leftMargin,
        y: yPosition,
        size: 8,
        font: helveticaFont,
        color: sectionColor,
      });
      
      const currentDate = new Date().toLocaleDateString();
      page.drawText(`Date: ${currentDate}`, {
        x: rightMargin - 100,
        y: yPosition,
        size: 8,
        font: helveticaFont,
        color: sectionColor,
      });
      
      console.log('✅ Successfully rendered applique badges form on A4 page');
      
    } catch (error) {
      console.error('❌ Failed to render applique badges form:', error);
      throw error;
    }
  }
  
  /**
   * Simple text wrapping utility
   */
  private wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is too long, just add it anyway
          lines.push(word);
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }
}