// Direct test of vector preservation with pdf-lib
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

async function testVectorPreservation() {
    console.log('Testing true vector preservation with pdf-lib...');
    
    // Create new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size in points
    
    // Test with the CompleteTransfers logo PDF
    const logoPath = './attached_assets/CompleteLogoLandscaple_b88f3ee7-d80a-40e1-9feb-9fde499db87f_1753538047767.pdf';
    
    if (fs.existsSync(logoPath)) {
        const logoPdfBytes = fs.readFileSync(logoPath);
        const logoPdf = await PDFDocument.load(logoPdfBytes);
        
        const logoPages = logoPdf.getPages();
        if (logoPages.length > 0) {
            const logoPage = logoPages[0];
            const embeddedPage = await pdfDoc.embedPage(logoPage);
            
            // Draw the embedded page (vectors preserved)
            page.drawPage(embeddedPage, {
                x: 50,
                y: 500,
                width: embeddedPage.size().width * 0.5,
                height: embeddedPage.size().height * 0.5,
            });
            
            console.log('Vector logo embedded successfully');
        }
    } else {
        console.error('Logo PDF not found');
        return;
    }
    
    // Save the vector-preserving PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test-vector-preserved.pdf', pdfBytes);
    
    console.log('Vector-preserving PDF created: test-vector-preserved.pdf');
    console.log('Size:', pdfBytes.length, 'bytes');
    
    // For comparison, also create a rasterized version
    const execAsync = promisify(exec);
    
    try {
        // Create rasterized version
        await execAsync(`convert "${logoPath}" -density 150 test-rasterized.pdf`);
        const rasterStats = fs.statSync('test-rasterized.pdf');
        console.log('Rasterized version size:', rasterStats.size, 'bytes');
        
        console.log('Comparison:');
        console.log('Vector PDF:', pdfBytes.length, 'bytes');
        console.log('Raster PDF:', rasterStats.size, 'bytes');
        console.log('Vector is', ((pdfBytes.length / rasterStats.size) * 100).toFixed(1), '% of raster size');
    } catch (error) {
        console.error('Failed to create comparison:', error.message);
    }
}

testVectorPreservation().catch(console.error);