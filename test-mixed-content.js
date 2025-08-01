import { PDFDocument, rgb, cmyk } from 'pdf-lib';
import fs from 'fs';
import fetch from 'node-fetch';

async function createMixedContentPDF() {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();
  
  // Add a page
  const page = pdfDoc.addPage([600, 800]);
  
  // Add vector content (text and shapes)
  page.drawText('This is vector text in CMYK', {
    x: 50,
    y: 700,
    size: 24,
    color: cmyk(0, 0.86, 0.84, 0.07)
  });
  
  // Draw a vector rectangle
  page.drawRectangle({
    x: 50,
    y: 500,
    width: 200,
    height: 100,
    color: cmyk(0.97, 0, 0.51, 0.35)
  });
  
  // Embed a raster image (PNG)
  // Create a simple PNG image data URL
  const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const pngImageBytes = Buffer.from(pngDataUrl.split(',')[1], 'base64');
  const pngImage = await pdfDoc.embedPng(pngImageBytes);
  
  // Draw the raster image
  page.drawImage(pngImage, {
    x: 50,
    y: 300,
    width: 200,
    height: 150,
  });
  
  // Add more vector content
  page.drawText('Mixed content test - Vector and Raster', {
    x: 50,
    y: 250,
    size: 16,
    color: cmyk(0.1, 0.1, 0, 0.92)
  });
  
  // Save the PDF
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test-mixed-content.pdf', pdfBytes);
  
  console.log('Created test-mixed-content.pdf with both vector and raster content');
}

createMixedContentPDF().catch(console.error);