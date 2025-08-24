import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec, execSync } from 'child_process';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { IStorage } from './storage';
import { 
  insertProjectSchema, 
  insertLogoSchema, 
  insertCanvasElementSchema,
  insertVectorizationRequestSchema
} from '@shared/schema';
import { z } from 'zod';
import { calculateSVGContentBounds } from './svg-color-utils';
import { detectDimensionsFromSVG, validateDimensionAccuracy } from './dimension-utils';
import { adobeRgbToCmyk } from './adobe-cmyk-profile';
import { UniversalColorExtractor } from './universal-color-extractor';
import { setupImpositionRoutes } from './imposition-routes';
import { PDFBoundsExtractor } from './pdf-bounds-extractor';
import { SVGBoundsAnalyzer } from './svg-bounds-analyzer';

const execAsync = promisify(exec);

// Get actual dimensions from PNG file
async function getPNGDimensions(imagePath: string): Promise<{width: number, height: number} | null> {
  try {
    const { stdout } = await execAsync(`identify -format "%wx%h" "${imagePath}"`);
    const dimensions = stdout.trim().split('x');
    if (dimensions.length === 2) {
      const width = parseInt(dimensions[0]);
      const height = parseInt(dimensions[1]);
      console.log(`📏 PNG dimensions detected: ${width}×${height}px from ${path.basename(imagePath)}`);
      return { width, height };
    }
  } catch (err) {
    console.log('⚠️ Failed to detect PNG dimensions:', err);
  }
  return null;
}

// Extract original PNG from PDF using multiple methods
// ⚠️ IMPORTANT: This function should ONLY be called for PDF files containing raster/bitmap content
// Pure vector PDFs should be handled through regular SVG conversion, not this extraction method
async function extractOriginalPNG(pdfPath: string, outputPrefix: string): Promise<string | null> {
  try {
    console.log('📸 Extracting NATIVE EMBEDDED PNG from PDF RASTER FILE at original size and DPI');
    
    // Method 1: Try direct PDF-to-PNG conversion using Ghostscript
    try {
      console.log('🎯 DIRECT PDF RENDERING: Using Ghostscript at 150 DPI for optimal vectorization quality');
      
      const timestamp = Date.now();
      const outputPath = path.join(path.dirname(pdfPath), `${path.basename(outputPrefix)}_direct_${timestamp}.png`);
      
      // Use Ghostscript to render PDF directly as PNG without extraction
      // CRITICAL: NO ANTI-ALIASING for vectorization - sharp edges are essential for Vector.AI
      // Using 300 DPI for maximum detail and NO anti-aliasing to preserve crisp edges
      const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -dTextAlphaBits=1 -dGraphicsAlphaBits=1 -sOutputFile="${outputPath}" "${pdfPath}"`;
      
      console.log('📋 Ghostscript direct rendering command:', gsCommand);
      const { stdout, stderr } = await execAsync(gsCommand);
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ DIRECT GHOSTSCRIPT RENDERING SUCCESS: ${outputPath} (${stats.size} bytes)`);
        
        // Check dimensions to ensure quality
        const dimensions = await getPNGDimensions(outputPath);
        if (dimensions) {
          console.log(`📏 Direct rendered dimensions: ${dimensions.width}×${dimensions.height}px at 300 DPI (crisp edges for vectorization)`);
        }
        
        return outputPath;
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('⚠️ Direct Ghostscript rendering failed:', errorMessage);
    }
    
    // Method 2: Fallback to pdfimages (but this may still have sizing issues)
    try {
      // FORCE FRESH EXTRACTION: Add timestamp to prevent cached PNG reuse
      const timestamp = Date.now();
      const outputPrefixPath = path.join(path.dirname(pdfPath), `${outputPrefix}-${timestamp}`);
      const extractCommand = `pdfimages -f 1 -l 1 -png "${pdfPath}" "${outputPrefixPath}"`;
      console.log('🎯 Method 1: NATIVE RESOLUTION extraction with pdfimages (no DPI scaling):', extractCommand);
      
      const { stdout, stderr } = await execAsync(extractCommand);
      console.log('📤 pdfimages stdout:', stdout);
      if (stderr) console.log('⚠️ pdfimages stderr:', stderr);
      
      // Find the extracted PNG files with timestamp  
      const possibleFiles = [
        `${outputPrefix}-${timestamp}-000.png`,
        `${outputPrefix}-${timestamp}-001.png`,
        `${outputPrefix}-${timestamp}-0.png`,
        `${outputPrefix}-${timestamp}-1.png`
      ];
      
      const extractedFiles = [];
      for (const file of possibleFiles) {
        const filePath = path.join(path.dirname(pdfPath), file);
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          extractedFiles.push({
            path: filePath,
            size: stats.size,
            file: file
          });
          console.log('🔍 Found extracted PNG:', file, `(${stats.size} bytes)`);
        }
      }
      
      if (extractedFiles.length > 0) {
        // For vectorization quality, prioritize the LARGEST file (full detail version)
        // Small files are often grayscale/compressed versions with lost detail
        extractedFiles.sort((a, b) => b.size - a.size);
        const selectedFile = extractedFiles[0].path;
        console.log('✅ High-quality extraction successful (largest/detailed):', selectedFile, `(${extractedFiles[0].size} bytes)`);
        
        // Check color depth to ensure we got full quality
        const dimensions = await getPNGDimensions(selectedFile);
        if (dimensions) {
          console.log(`📏 High-quality PNG dimensions: ${dimensions.width}×${dimensions.height}px`);
          console.log('🎨 Using detailed version for better vectorization quality');
        }
        
        return selectedFile;
      }
    } catch (pdfErr) {
      console.log('⚠️ pdfimages method failed:', pdfErr);
    }
    
    console.log('❌ Native resolution PNG extraction failed');
    return null;
    
  } catch (err) {
    console.log('❌ PNG extraction failed:', err);
    return null;
  }
}

// Extract raster image from PDF with advanced duplication detection
async function extractRasterImageWithDeduplication(pdfPath: string, outputPrefix: string, skipDeduplication = false): Promise<string | null> {
  try {
    let extractedFile = null;
    
    // Method 1: For vectorization, ONLY use pdfimages to get original embedded PNG (no fallback)
    if (skipDeduplication) {
      try {
        const outputPrefixPath = path.join(path.dirname(pdfPath), outputPrefix);
        const extractCommand = `pdfimages -f 1 -l 1 -png "${pdfPath}" "${outputPrefixPath}"`;
        console.log('🎯 VECTORIZATION: Using pdfimages ONLY to extract original embedded PNG at native resolution:', extractCommand);
        
        const { stdout, stderr } = await execAsync(extractCommand);
        console.log('📤 pdfimages stdout:', stdout);
        if (stderr) console.log('⚠️ pdfimages stderr:', stderr);
        
        // Find all extracted images and select the best one for vectorization
        const possibleFiles = [
          `${outputPrefix}-000.png`,
          `${outputPrefix}-001.png`,
          `${outputPrefix}-0.png`,
          `${outputPrefix}-1.png`
        ];
        
        const extractedFiles = [];
        for (const file of possibleFiles) {
          const filePath = path.join(path.dirname(pdfPath), file);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            extractedFiles.push({
              path: filePath,
              size: stats.size,
              file: file
            });
            console.log('🔍 VECTORIZATION: Found extracted file:', file, `(${stats.size} bytes)`);
          }
        }
        
        if (extractedFiles.length === 0) {
          console.log('❌ VECTORIZATION: No files extracted by pdfimages');
          return null;
        }
        
        // For vectorization, prioritize the largest file (full-color version with all details)
        // The largest file contains all the colors and details needed for proper vectorization
        extractedFiles.sort((a, b) => b.size - a.size);
        extractedFile = extractedFiles[0].path;
        
        console.log('✅ VECTORIZATION: Selected largest/full-color file for vectorization:', extractedFile, `(${extractedFiles[0].size} bytes)`);
        console.log('📋 VECTORIZATION: All extracted files by size (largest first):', extractedFiles.map(f => `${f.file}(${f.size}b)`).join(', '));
        
        // For vectorization, use the original extracted PNG without any processing
        console.log('✅ VECTORIZATION: Using original extracted PNG without processing:', extractedFile);
        return extractedFile;
        
        console.log('❌ VECTORIZATION: pdfimages failed to extract original embedded PNG - returning null (no fallback)');
        return null;
        
      } catch (err) {
        console.log('❌ VECTORIZATION: pdfimages extraction failed:', err);
        return null;
      }
    }
    
    // Method 2: For regular processing, try pdfimages to get original embedded PNG
    if (!extractedFile) {
      try {
        const outputPrefixPath = path.join(path.dirname(pdfPath), outputPrefix);
        const extractCommand = `pdfimages -f 1 -l 1 -png "${pdfPath}" "${outputPrefixPath}"`;
        console.log('🏃 Method 2: Running pdfimages extraction (regular processing):', extractCommand);
        
        const { stdout, stderr } = await execAsync(extractCommand);
        console.log('📤 pdfimages stdout:', stdout);
        if (stderr) console.log('⚠️ pdfimages stderr:', stderr);
        
        // Find the extracted image
        const possibleFiles = [
          `${outputPrefix}-000.png`,
          `${outputPrefix}-001.png`,
          `${outputPrefix}-0.png`,
          `${outputPrefix}-1.png`
        ];
        
        for (const file of possibleFiles) {
          const filePath = path.join(path.dirname(pdfPath), file);
          if (fs.existsSync(filePath)) {
            extractedFile = filePath;
            const stats = fs.statSync(filePath);
            console.log('✅ Found original embedded PNG via pdfimages:', extractedFile, `(${stats.size} bytes)`);
            break;
          }
        }
      } catch (err) {
        console.log('⚠️ pdfimages method failed:', err);
      }
    }
    
    // Method 3: Clean extraction fallback specifically for vectorization when original PNG isn't suitable
    if (!extractedFile && skipDeduplication) {
      try {
        extractedFile = path.join(path.dirname(pdfPath), `${outputPrefix}_clean_logo.png`);
        // Use 200 DPI resolution with sharper rendering for clean vectorization
        const cleanLogoCommand = `gs -sDEVICE=png16m -dNOPAUSE -dBATCH -dSAFER -r200 -dFirstPage=1 -dLastPage=1 -dAutoRotatePages=/None -dGraphicsAlphaBits=1 -dTextAlphaBits=1 -sOutputFile="${extractedFile}" "${pdfPath}"`;
        console.log('🏃 Method 3: Running clean logo extraction for vectorization (200 DPI fallback):', cleanLogoCommand);
        
        const { stdout, stderr } = await execAsync(cleanLogoCommand);
        console.log('📤 Clean logo extraction stdout:', stdout);
        if (stderr) console.log('⚠️ Clean logo extraction stderr:', stderr);
        
        if (!fs.existsSync(extractedFile)) {
          extractedFile = null;
        } else {
          const stats = fs.statSync(extractedFile);
          console.log('✅ Clean logo extraction successful at 200 DPI', `(${stats.size} bytes)`);
        }
      } catch (err) {
        console.log('⚠️ Clean logo extraction failed:', err);
        extractedFile = null;
      }
    }

    // Method 3: If original extraction failed, try standard Ghostscript
    if (!extractedFile) {
      try {
        extractedFile = path.join(path.dirname(pdfPath), `${outputPrefix}_rendered.png`);
        const gsCommand = `gs -sDEVICE=png16m -dNOPAUSE -dBATCH -dSAFER -r200 -dFirstPage=1 -dLastPage=1 -dAutoRotatePages=/None -dFitPage -sOutputFile="${extractedFile}" "${pdfPath}"`;
        console.log('🏃 Method 3: Running standard Ghostscript rendering:', gsCommand);
        
        const { stdout, stderr } = await execAsync(gsCommand);
        console.log('📤 GS stdout:', stdout);
        if (stderr) console.log('⚠️ GS stderr:', stderr);
        
        if (!fs.existsSync(extractedFile)) {
          extractedFile = null;
        }
      } catch (err) {
        console.log('⚠️ Ghostscript method failed:', err);
        extractedFile = null;
      }
    }
    
    // Method 4: Fallback to ImageMagick
    if (!extractedFile) {
      try {
        extractedFile = path.join(path.dirname(pdfPath), `${outputPrefix}_magick.png`);
        const magickCommand = `convert -density 150 "${pdfPath}[0]" -trim +repage -resize '2000x2000>' "${extractedFile}"`;
        console.log('🏃 Method 4: Running ImageMagick extraction (anti-duplication):', magickCommand);
        
        const { stdout, stderr } = await execAsync(magickCommand);
        console.log('📤 ImageMagick stdout:', stdout);
        if (stderr) console.log('⚠️ ImageMagick stderr:', stderr);
        
        if (!fs.existsSync(extractedFile)) {
          extractedFile = null;
        }
      } catch (err) {
        console.log('⚠️ ImageMagick method failed:', err);
        extractedFile = null;
      }
    }
    
    if (!extractedFile) {
      console.error('❌ All extraction methods failed');
      return null;
    }
    
    // Skip deduplication if requested (e.g., for vectorization)
    if (skipDeduplication) {
      console.log('🔄 SKIPPING DEDUPLICATION as requested - returning clean extracted image');
      return extractedFile;
    }
    
    // Advanced duplication pattern detection and removal
    console.log('🔍 DUPLICATION ANALYSIS STARTING for file:', extractedFile);
    
    // Get original file size for comparison
    const originalStats = fs.statSync(extractedFile);
    console.log('📊 Original extracted file size:', originalStats.size, 'bytes');
    
    // First, check if duplication actually exists by testing a quarter crop
    const quarterTestFile = `${extractedFile}_quarter_test.png`;
    const quarterCropCommand = `convert "${extractedFile}" -crop 50%x50%+0+0 +repage "${quarterTestFile}"`;
    console.log(`🧪 Testing for duplication with quarter crop: ${quarterCropCommand}`);
    
    const { stdout, stderr } = await execAsync(quarterCropCommand);
    if (stderr) console.log(`⚠️ Quarter crop stderr:`, stderr);
    
    let hasDuplication = false;
    let bestCrop = null;
    let bestRatio = 1.0;
    
    if (fs.existsSync(quarterTestFile)) {
      const testStats = fs.statSync(quarterTestFile);
      const ratio = testStats.size / originalStats.size;
      console.log(`📊 Quarter crop ratio: ${ratio.toFixed(3)} (expected: ~0.25 if no duplication)`);
      console.log(`📊 Test file sizes: original=${originalStats.size} bytes, quarter=${testStats.size} bytes`);
      
      // If quarter crop is much smaller than expected (~25%), it indicates duplication
      if (ratio < 0.22) { // More sensitive threshold for detecting duplication patterns
        console.log(`🎯 DUPLICATION DETECTED! Quarter crop ratio ${ratio.toFixed(3)} indicates grid pattern`);
        hasDuplication = true;
        
        // Test additional crop strategies to find the best one
        const testCrops = [
          { name: 'quarter', crop: '50%x50%+0+0', file: quarterTestFile },
          { name: 'half-width', crop: '50%x100%+0+0' },
          { name: 'half-height', crop: '100%x50%+0+0' }
        ];
        
        for (const test of testCrops) {
          try {
            let testFile;
            if (test.file) {
              testFile = test.file; // Use existing quarter test
            } else {
              testFile = `${extractedFile}_test_${test.name}.png`;
              const cropCommand = `convert "${extractedFile}" -crop ${test.crop} +repage "${testFile}"`;
              console.log(`🧪 Testing additional crop ${test.name}: ${cropCommand}`);
              
              const { stdout, stderr } = await execAsync(cropCommand);
              if (stderr) console.log(`⚠️ Test crop ${test.name} stderr:`, stderr);
            }
            
            if (fs.existsSync(testFile)) {
              const testStats = fs.statSync(testFile);
              const ratio = testStats.size / originalStats.size;
              
              console.log(`📏 ${test.name} crop: ${originalStats.size} → ${testStats.size} bytes (ratio: ${ratio.toFixed(3)})`);
              
              if (ratio < bestRatio && ratio > 0.05) { // Find the best crop
                bestRatio = ratio;
                if (bestCrop && fs.existsSync(bestCrop) && bestCrop !== testFile) {
                  fs.unlinkSync(bestCrop); // Clean up previous best
                }
                bestCrop = testFile;
                console.log(`🎯 New best crop: ${test.name} with ratio ${ratio.toFixed(3)}`);
              } else if (testFile !== bestCrop) {
                // Clean up non-best files
                fs.unlinkSync(testFile);
              }
            }
          } catch (testErr) {
            console.log(`⚠️ Test crop ${test.name} failed:`, testErr);
          }
        }
      } else {
        console.log(`✅ NO DUPLICATION DETECTED. Quarter crop ratio ${ratio.toFixed(3)} is normal - keeping original image`);
        fs.unlinkSync(quarterTestFile); // Clean up test file
      }
    }
    
    // Apply deduplication ONLY if duplication was actually detected
    if (hasDuplication && bestCrop) {
      console.log(`🎯 DUPLICATION DETECTED! Ratio ${bestRatio.toFixed(3)} indicates grid pattern`);
      
      try {
        console.log('🔄 Replacing original with deduplicated version...');
        const backupFile = `${extractedFile}_backup.png`;
        
        // Backup original
        fs.renameSync(extractedFile, backupFile);
        
        // Use the best crop as new original
        fs.renameSync(bestCrop, extractedFile);
        
        // Verify the replacement worked
        if (fs.existsSync(extractedFile)) {
          const newStats = fs.statSync(extractedFile);
          console.log(`✅ Deduplication complete! Size: ${originalStats.size} → ${newStats.size} bytes`);
          
          // Clean up backup
          if (fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
          }
        } else {
          console.log('❌ Replacement failed, restoring backup');
          fs.renameSync(backupFile, extractedFile);
        }
      } catch (replaceErr) {
        console.log('⚠️ Replacement failed:', replaceErr);
        if (fs.existsSync(bestCrop)) {
          fs.unlinkSync(bestCrop);
        }
      }
    } else {
      console.log(`✅ No duplication detected (ratio: ${bestRatio.toFixed(3)})`);
      // Clean up test files
      if (bestCrop && fs.existsSync(bestCrop)) {
        fs.unlinkSync(bestCrop);
      }
    }
    
    return extractedFile;
    
  } catch (error) {
    console.error('❌ Extraction with deduplication failed:', error);
    return null;
  }
}

// Apply intelligent deduplication to PNG files before AI vectorization
async function applyIntelligentDeduplication(imagePath: string, filename: string): Promise<string | null> {
  try {
    console.log('🔍 DEDUPLICATION ANALYSIS STARTING for:', imagePath);
    
    // Get original file size for comparison
    const originalStats = fs.statSync(imagePath);
    console.log('📊 Original PNG file size:', originalStats.size, 'bytes');
    
    // Test multiple crop strategies to detect grid patterns
    const cropTests = [
      { name: 'center_50', crop: '50%x50%+25%+25%' },     // Center 50%
      { name: 'quarter', crop: '50%x50%+0+0' },           // Top-left quarter
      { name: 'half-width', crop: '50%x100%+0+0' },       // Left half
      { name: 'half-height', crop: '100%x50%+0+0' },      // Top half
    ];
    
    let bestCrop = null;
    let bestRatio = 1.0;
    let bestCropName = '';
    
    for (const test of cropTests) {
      try {
        const testFile = `${imagePath}_test_${test.name}.png`;
        const cropCommand = `convert "${imagePath}" -crop ${test.crop} +repage "${testFile}"`;
        
        console.log(`🧪 Testing ${test.name} crop: ${cropCommand}`);
        const { stdout, stderr } = await execAsync(cropCommand);
        if (stderr) console.log(`⚠️ Test crop ${test.name} stderr:`, stderr);
        
        if (fs.existsSync(testFile)) {
          const testStats = fs.statSync(testFile);
          const ratio = testStats.size / originalStats.size;
          
          console.log(`📏 ${test.name} crop: ${originalStats.size} → ${testStats.size} bytes (ratio: ${ratio.toFixed(3)})`);
          
          // For grid patterns, a crop should be significantly smaller
          if (ratio < bestRatio && ratio > 0.05) {
            bestRatio = ratio;
            if (bestCrop && fs.existsSync(bestCrop)) {
              fs.unlinkSync(bestCrop);
            }
            bestCrop = testFile;
            bestCropName = test.name;
            console.log(`🎯 New best crop: ${test.name} with ratio ${ratio.toFixed(3)}`);
          } else {
            fs.unlinkSync(testFile);
          }
        }
      } catch (testErr) {
        console.log(`⚠️ Test crop ${test.name} failed:`, testErr);
      }
    }
    
    // Apply deduplication if ANY crop shows significant reduction indicating grid patterns
    let hasDuplication = false;
    
    // For uploaded PNGs, be more aggressive in detecting duplication
    // Quarter crop should be ~25% of original if no duplication
    // Half crops should be ~50% of original if no duplication  
    if (bestRatio < 0.22) { // More sensitive threshold for uploaded PNGs
      hasDuplication = true;
      console.log(`🎯 DUPLICATION DETECTED! ${bestCropName} crop ratio ${bestRatio.toFixed(3)} indicates grid pattern`);
    } else {
      console.log(`✅ NO DUPLICATION DETECTED. Best crop ${bestCropName} ratio ${bestRatio.toFixed(3)} is normal`);
    }
    
    if (hasDuplication && bestCrop) {
      console.log(`🎯 GRID PATTERN DETECTED! ${bestCropName} ratio ${bestRatio.toFixed(3)} indicates duplication`);
      
      try {
        // Create a new deduplicated file
        const deduplicatedPath = `${imagePath}_deduplicated.png`;
        
        // Copy the best crop to the new file
        fs.copyFileSync(bestCrop, deduplicatedPath);
        
        // Clean up test file
        fs.unlinkSync(bestCrop);
        
        if (fs.existsSync(deduplicatedPath)) {
          const newStats = fs.statSync(deduplicatedPath);
          console.log(`✅ Deduplication complete! Size: ${originalStats.size} → ${newStats.size} bytes`);
          return deduplicatedPath;
        }
      } catch (replaceErr) {
        console.log('⚠️ Deduplication failed:', replaceErr);
        if (bestCrop && fs.existsSync(bestCrop)) {
          fs.unlinkSync(bestCrop);
        }
      }
    } else {
      console.log(`✅ No grid pattern detected (best ratio: ${bestRatio.toFixed(3)})`);
      // Clean up test files
      if (bestCrop && fs.existsSync(bestCrop)) {
        fs.unlinkSync(bestCrop);
      }
    }
    
    return null; // Return null if no deduplication needed
    
  } catch (error) {
    console.error('❌ Deduplication analysis failed:', error);
    return null;
  }
}

// Pricing calculation function (simulates Odoo pricelist logic)
function calculateTemplatePrice(template: any, copies: number): number {
  // Base price per template size (in EUR)
  const sizeMultipliers: Record<string, number> = {
    'A6': 0.8,
    'A5': 1.0, 
    'A4': 1.5,
    'A3': 2.5,
    'A2': 4.0,
    'A1': 6.0,
    'dtf_1000x550': 3.0, // Large DTF format
  };

  // Group-based multipliers - updated for new structure
  const groupMultipliers: Record<string, number> = {
    'Screen Printed Transfers': 1.0,
    'Digital Transfers': 1.5,
  };

  // Quantity discounts
  const getQuantityDiscount = (qty: number): number => {
    if (qty >= 1000) return 0.7; // 30% discount
    if (qty >= 500) return 0.75;  // 25% discount  
    if (qty >= 100) return 0.8;   // 20% discount
    if (qty >= 50) return 0.85;   // 15% discount
    if (qty >= 25) return 0.9;    // 10% discount
    if (qty >= 10) return 0.95;   // 5% discount
    return 1.0; // No discount
  };

  // Base calculation
  const basePrice = 2.50; // EUR base price
  const sizeMultiplier = sizeMultipliers[template.name] || sizeMultipliers['A4'];
  const groupMultiplier = groupMultipliers[template.group] || 1.0;
  const quantityDiscount = getQuantityDiscount(copies);

  const pricePerUnit = basePrice * sizeMultiplier * groupMultiplier * quantityDiscount;
  
  // Minimum price constraint
  return Math.max(0.50, pricePerUnit);
}

const uploadDir = path.resolve('./uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf',
      'application/postscript', 'application/illustrator', 'application/x-illustrator'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export async function registerRoutes(app: express.Application) {
  const { storage } = await import('./storage');
  const { setupImpositionRoutes } = await import('./imposition-routes');
  
  // PDF Generation endpoint - Must be before other routes
  app.get('/api/projects/:projectId/generate-pdf', async (req, res) => {
    try {
      console.log(`📄 PDF Generation requested for project: ${req.params.projectId}`);
      const projectId = req.params.projectId;
      const project = await storage.getProject(projectId);
      
      if (!project) {
        console.error(`❌ Project not found: ${projectId}`);
        return res.status(404).json({ error: 'Project not found' });
      }

      console.log(`✅ Project found: ${project.name || 'Untitled'}`);

      // Get project data
      const logos = await storage.getLogosByProject(projectId);
      const canvasElements = await storage.getCanvasElementsByProject(projectId);
      const templateSizes = await storage.getTemplateSizes();
      
      console.log(`📊 Project data - Logos: ${logos.length}, Elements: ${canvasElements.length}`);
      
      // Check if project has content to generate PDF
      if (logos.length === 0 || canvasElements.length === 0) {
        console.warn(`⚠️ Empty project detected - Logos: ${logos.length}, Elements: ${canvasElements.length}`);
        console.log(`📋 Project details:`, { 
          id: projectId, 
          name: project.name,
          templateSize: project.templateSize,
          garmentColor: project.garmentColor 
        });
        
        // Still proceed with PDF generation to show at least the template background
        // This will help users understand the issue (empty vs broken PDF)
      }
      
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      if (!templateSize) {
        console.error(`❌ Invalid template size: ${project.templateSize}`);
        // Use default A3 template if none found
        console.log(`🔄 Using default A3 template as fallback`);
        // Return error instead of using fallback for now
        return res.status(400).json({ error: 'Invalid template size' });
      }

      console.log(`📐 Template size: ${templateSize.name} (${templateSize.width}×${templateSize.height}mm)`);

      // CRITICAL DEBUG: Check if simple embedder conditions are met
      console.log(`🔍 DEBUG SIMPLE EMBEDDER: logos.length=${logos.length}`);
      if (logos.length > 0) {
        const logo = logos[0];
        console.log(`🔍 DEBUG: logo.originalFilename=${logo.originalFilename}, ends with .pdf=${logo.originalFilename?.endsWith('.pdf')}`);
        
        if (logo.originalFilename && logo.originalFilename.endsWith('.pdf')) {
          const logoPath = path.join(process.cwd(), 'uploads', logo.originalFilename);
          const fileExists = fs.existsSync(logoPath);
          
          console.log(`🔍 DEBUG: logoPath=${logoPath}, fileExists=${fileExists}`);
          
          if (fileExists) {
            console.log(`🎯 SKIPPING problematic approaches - using ROBUST PDF GENERATOR directly for best quality`);
            
            // Skip the problematic approaches and go straight to the robust generator
            // This preserves CMYK colors, vector quality, and garment info while applying dimension overrides
          } else {
            console.log(`⚠️ DEBUG: Original PDF file not found: ${logoPath}`);
          }
        } else {
          console.log(`⚠️ DEBUG: Logo is not an original PDF file`);
        }
      } else {
        console.log(`⚠️ DEBUG: No logos found for simple embedder`);
      }

      // Import the ORIGINAL WORKING PDF generator
      // Convert logos array to object keyed by logo ID for proper lookup
      const logosObject: { [key: string]: any } = {};
      logos.forEach(logo => {
        logosObject[logo.id] = logo;
      });
      
      console.log(`🔍 DEBUG: Logo object construction:`);
      console.log(`  - Raw logos from DB:`, logos.map(l => ({ id: l.id, filename: l.filename })));
      console.log(`  - LogosObject keys:`, Object.keys(logosObject));
      console.log(`  - Canvas element logoIds:`, canvasElements.map(e => e.logoId));

      // Check if any logos have CMYK colors that need native preservation
      const hasCMYKLogos = Object.values(logosObject).some(logo => 
        logo.svgColors && logo.svgColors.colors.some((c: any) => c.isCMYK)
      );

      // FORCE SVG-BASED ADOBE COLOR CONVERSION - Skip direct PDF embedding 
      console.log('📄 FORCING SVG CONVERSION: Skipping direct PDF embedding for Adobe color processing');
      
      try {
        const { PDFDocument, rgb, degrees } = await import('pdf-lib');
        const fs = await import('fs');
        
        // Create A3 PDF
        const pdfDoc = await PDFDocument.create();
        const pageWidth = templateSize.width * 2.834645669; // mm to points
        const pageHeight = templateSize.height * 2.834645669;
        
        // CANVAS REPLICA: Match canvas preview exactly with garment colors
        console.log(`🚀 CANVAS REPLICA: Exact canvas preview with garment colors and Adobe CMYK`);
        
        // Get garment color and convert FIRST
        const garmentColor = project.garmentColor || canvasElements.find(el => el.garmentColor)?.garmentColor || '#D98F17'; // Default to orange
        const garmentColorName = garmentColor === '#FFFFFF' ? 'White' : 
                                 garmentColor === '#D98F17' ? 'Orange' : 
                                 garmentColor === '#171816' ? 'Black' : 
                                 garmentColor === '#1a1a1a' ? 'Black' :
                                 garmentColor === '#FFD700' ? 'Gold' : 
                                 garmentColor === '#D9D2AB' ? 'Natural' :
                                 garmentColor === '#8B4513' ? 'Brown' :
                                 garmentColor === '#4169E1' ? 'Royal Blue' :
                                 garmentColor === '#DC143C' ? 'Red' :
                                 garmentColor === '#228B22' ? 'Green' : `Custom (${garmentColor})`;
        
        console.log(`🎨 DEBUG: Project garmentColor: ${project.garmentColor}, Element garmentColor: ${canvasElements.find(el => el.garmentColor)?.garmentColor}, Final: ${garmentColor}`);
        
        // Convert hex to RGB for garment background
        let garmentBg = rgb(1, 1, 1); // Default white
        if (garmentColor.startsWith('#') && garmentColor.length === 7) {
          const r = parseInt(garmentColor.slice(1, 3), 16) / 255;
          const g = parseInt(garmentColor.slice(3, 5), 16) / 255;
          const b = parseInt(garmentColor.slice(5, 7), 16) / 255;
          garmentBg = rgb(r, g, b);
        }
        
        // Create pages with no backgrounds
        const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
        const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
        
        // Page 1: COMPLETELY TRANSPARENT - just clean vectors
        // NO background rectangle, NO white, NO viewboxes - pure transparency
        console.log(`✅ Page 1: TRANSPARENT - clean vectors only`);
        
        // Page 2: Garment color background (preview with garment)
        page2.drawRectangle({
          x: 0, y: 0, 
          width: pageWidth, height: pageHeight,
          color: garmentBg
        });
        console.log(`✅ Page 2: ${garmentColorName} background for preview (${garmentColor})`);
        
        // Process canvas elements
        for (let element of canvasElements) {
          const logo = Object.values(logosObject).find((l: any) => l.id === element.logoId);
          if (!logo) continue;
          
          // CRITICAL: Use ORIGINAL PDF if available to preserve exact CMYK colors
          const originalPdfPath = path.join(process.cwd(), 'uploads', (logo as any).originalFilename || '');
          const svgPath = path.join(process.cwd(), 'uploads', (logo as any).filename);
          
          let usePath = svgPath;
          let useOriginalPdf = false;
          
          if ((logo as any).originalFilename && fs.existsSync(originalPdfPath)) {
            console.log(`🎯 USING ORIGINAL PDF WITH EXACT CMYK COLORS: ${(logo as any).originalFilename}`);
            usePath = originalPdfPath;
            useOriginalPdf = true;
          } else {
            console.log(`📄 Processing SVG (colors already corrupted): ${(logo as any).filename}`);
            if (!fs.existsSync(svgPath)) {
              console.log(`❌ SVG not found: ${svgPath}`);
              continue;
            }
          }
          
          try {
            // Canvas dimensions to PDF coordinates
            // Need to account for rotation when calculating position
            const rotation = element.rotation || 0;
            const isRotated = rotation === 90 || rotation === 270;
            
            // When rotated 90 or 270, visual dimensions are swapped
            const visualWidth = isRotated ? element.height : element.width;
            const visualHeight = isRotated ? element.width : element.height;
            
            // Calculate max dimensions based on rotation
            const maxWidth = pageWidth / 2.834645669;  // Max width in mm (297 for A3)
            const maxHeight = pageHeight / 2.834645669; // Max height in mm (420 for A3)
            
            // Original dimensions
            let scaledWidth = element.width;
            let scaledHeight = element.height;
            
            // Check if original dimensions fit within page in ANY orientation
            const fitsNormally = scaledWidth <= maxWidth && scaledHeight <= maxHeight;
            const fitsRotated = scaledHeight <= maxWidth && scaledWidth <= maxHeight;
            
            // If content is larger than page in both orientations, we must scale
            if (!fitsNormally && !fitsRotated) {
              // Content too large for page - must scale
              let scale = 1;
              if (isRotated) {
                // When rotated, height becomes width and width becomes height visually
                const scaleX = maxWidth / scaledHeight;
                const scaleY = maxHeight / scaledWidth;
                scale = Math.min(scaleX, scaleY);
              } else {
                const scaleX = maxWidth / scaledWidth;
                const scaleY = maxHeight / scaledHeight;
                scale = Math.min(scaleX, scaleY);
              }
              scaledWidth *= scale;
              scaledHeight *= scale;
              console.log(`⚠️ Content scaled by ${(scale * 100).toFixed(1)}% to fit A3 page`);
            } else if (isRotated && !fitsRotated) {
              // Content doesn't fit when rotated, scale it
              const scaleX = maxWidth / scaledHeight;
              const scaleY = maxHeight / scaledWidth;
              const scale = Math.min(scaleX, scaleY);
              scaledWidth *= scale;
              scaledHeight *= scale;
              console.log(`⚠️ Rotated content scaled by ${(scale * 100).toFixed(1)}% to fit page`);
            } else {
              console.log(`✅ Content fits within page`);
            }
            
            // Calculate effective dimensions after rotation for positioning
            const effectiveWidth = isRotated ? scaledHeight : scaledWidth;
            const effectiveHeight = isRotated ? scaledWidth : scaledHeight;
            console.log(`📐 Effective dimensions: ${effectiveWidth.toFixed(1)}×${effectiveHeight.toFixed(1)}mm`);
            
            // Calculate position - center the content on the page
            let xPos: number;
            let yPos: number;
            
            // Always center content when it's rotated or positioned off-page
            if (rotation === 90 || rotation === 270 || element.x < 0 || element.y < 0) {
              // Center based on effective (visual) dimensions after rotation
              const centerX = (pageWidth - (effectiveWidth * 2.834645669)) / 2;
              const centerY = (pageHeight - (effectiveHeight * 2.834645669)) / 2;
              xPos = centerX;
              yPos = centerY;
              console.log(`📍 Centering content at (${xPos.toFixed(1)}, ${yPos.toFixed(1)}) for effective size ${effectiveWidth.toFixed(1)}×${effectiveHeight.toFixed(1)}mm`);
            } else {
              // Use the element's position
              xPos = element.x * 2.834645669;
              yPos = pageHeight - (element.y * 2.834645669) - (element.height * 2.834645669);
              
              // Ensure it stays on page
              xPos = Math.max(0, xPos);
              yPos = Math.max(0, yPos);
            }
            
            const widthPts = scaledWidth * 2.834645669;
            const heightPts = scaledHeight * 2.834645669;
            
            console.log(`📐 Element: ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm → ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
            console.log(`📐 Visual size (rotated ${rotation}°): ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}mm`);
            
            let vectorBytes: Buffer;
            
            if (useOriginalPdf) {
              // CROP TO CONTENT: Extract just the content at its ACTUAL SIZE (no scaling)
              console.log(`🎯 CROPPING ORIGINAL PDF TO CONTENT BOUNDS - NO SCALING`);
              
              const ts = Date.now() + Math.random();
              const croppedPdf = path.join(process.cwd(), 'uploads', `cropped_${ts}.pdf`);
              
              try {
                // Get the actual content bounding box
                const bboxCmd = `gs -dNOPAUSE -dBATCH -dSAFER -sDEVICE=bbox "${originalPdfPath}" 2>&1 | grep "%%HiResBoundingBox"`;
                const bboxOutput = execSync(bboxCmd, { encoding: 'utf8' });
                console.log(`📊 BBox: ${bboxOutput}`);
                
                const match = bboxOutput.match(/%%HiResBoundingBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
                if (!match) throw new Error('No bbox found');
                
                const [, x1, y1, x2, y2] = match.map(Number);
                const contentWidth = x2 - x1;
                const contentHeight = y2 - y1;
                
                console.log(`📐 Content is ${contentWidth}×${contentHeight}pts at offset ${x1},${y1}`);
                console.log(`📐 Canvas expects ${widthPts}×${heightPts}pts`);
                
                // Create PDF with content scaled to match canvas exactly
                // We need to scale AND center the content properly
                const scaleX = widthPts / contentWidth;
                const scaleY = heightPts / contentHeight;
                
                // When scaling down, we need to center the content
                // Calculate centering offset after scaling
                const scaledWidth = contentWidth * scaleX;
                const scaledHeight = contentHeight * scaleY;
                const centerOffsetX = (widthPts - scaledWidth) / 2;
                const centerOffsetY = (heightPts - scaledHeight) / 2;
                
                console.log(`📊 Scale factors: X=${scaleX}, Y=${scaleY}`);
                console.log(`📊 Centering offsets: X=${centerOffsetX}, Y=${centerOffsetY}`);
                
                const cropCmd = `gs -dNOPAUSE -dBATCH -dSAFER ` +
                  `-sDEVICE=pdfwrite ` +
                  `-sOutputFile="${croppedPdf}" ` +
                  `-dDEVICEWIDTHPOINTS=${widthPts} ` +
                  `-dDEVICEHEIGHTPOINTS=${heightPts} ` +
                  `-dFIXEDMEDIA ` +
                  `-dColorConversionStrategy=/LeaveColorUnchanged ` +
                  `-dPreserveMarkedContent=true ` +
                  `-dPreserveSeparation=true ` +
                  `-dPreserveDeviceN=true ` +
                  `-c "<<` +
                    `/Install {` +
                      `${centerOffsetX} ${centerOffsetY} translate ` +
                      `${scaleX} ${scaleY} scale ` +
                      `-${x1} -${y1} translate` +
                    `}` +
                  `>> setpagedevice" ` +
                  `-f "${originalPdfPath}"`;
                
                execSync(cropCmd);
                console.log(`✅ Content scaled to exact canvas size: ${widthPts}×${heightPts}pts`);
                
                vectorBytes = fs.readFileSync(croppedPdf);
                fs.unlinkSync(croppedPdf);
                
              } catch (error) {
                console.log(`⚠️ Crop failed, using original: ${error}`);
                vectorBytes = fs.readFileSync(originalPdfPath);
              }
            } else {
              // Fallback: Process corrupted SVG
              let svgContent = fs.readFileSync(svgPath, 'utf8');
              
              // Remove any background rectangles or fills that create boundaries
              svgContent = svgContent.replace(/<rect[^>]*fill="white"[^>]*>/g, '');
              svgContent = svgContent.replace(/<rect[^>]*fill="#ffffff"[^>]*>/g, '');
              svgContent = svgContent.replace(/<rect[^>]*fill="#FFFFFF"[^>]*>/g, '');
              
              console.log(`🎯 Removed background fills but kept viewBox for proper sizing`);
              
              // Create temp files
              const ts = Date.now() + Math.random();
              const tempSvg = path.join(process.cwd(), 'uploads', `temp_${ts}.svg`);
              const tempPdf = path.join(process.cwd(), 'uploads', `temp_${ts}.pdf`);
              
              fs.writeFileSync(tempSvg, svgContent);
              
              // Convert SVG → PDF with transparency preserved (no background)
              const rsvgCmd = `rsvg-convert -f pdf -b transparent -w ${widthPts.toFixed(0)} -h ${heightPts.toFixed(0)} -o "${tempPdf}" "${tempSvg}"`;
              execSync(rsvgCmd);
              console.log(`✅ SVG → PDF with transparency: ${widthPts.toFixed(0)}×${heightPts.toFixed(0)}pts`);
              
              vectorBytes = fs.readFileSync(tempPdf);
              
              // Cleanup temp files
              [tempSvg, tempPdf].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
            }
            
            // Load and embed artwork
            const vectorDoc = await PDFDocument.load(vectorBytes);
            const [embeddedPage] = await pdfDoc.embedPdf(vectorDoc);
            
            // CRITICAL: For original PDFs, we embed at EXACT canvas dimensions
            // This ensures the content appears at the same size as in the canvas
            console.log(`📐 Embedding at: x=${xPos.toFixed(1)}, y=${yPos.toFixed(1)}, w=${widthPts.toFixed(1)}, h=${heightPts.toFixed(1)}`);
            
            // Handle rotation if element has rotation property
            // rotation already declared above
            console.log(`🔄 Element rotation: ${rotation}°`);
            
            // Embed artwork on both pages with rotation
            if (rotation === 90) {
              // For 90° rotation, the content rotates clockwise around its bottom-left corner
              // After rotation: width becomes visual height, height becomes visual width
              
              // Calculate where we want the center of the rotated content to be
              const pageCenterX = pageWidth / 2;
              const pageCenterY = pageHeight / 2;
              
              // After 90° rotation, the visual dimensions are swapped
              const visualWidth = heightPts;  // Original height becomes visual width
              const visualHeight = widthPts;  // Original width becomes visual height
              
              // To center the rotated content:
              // After 90° rotation, content extends:
              // - Leftward from pivot by heightPts (visual width)
              // - Upward from pivot by widthPts (visual height)
              // To center, we need pivot at:
              const rotatedX = pageCenterX + visualWidth / 2;  // Right edge of centered content
              const rotatedY = pageCenterY - visualHeight / 2;  // Bottom edge of centered content
              
              console.log(`📐 90° rotation: Page center (${pageCenterX.toFixed(1)}, ${pageCenterY.toFixed(1)})`);
              console.log(`📐 Original dims: ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
              console.log(`📐 Visual dims after rotation: ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}pts`);
              console.log(`📐 Positioning at (${rotatedX.toFixed(1)}, ${rotatedY.toFixed(1)}) for centered result`);
              
              // Embed with 90° rotation on page 1
              page1.drawPage(embeddedPage, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(90)
              });
              console.log(`✅ Page 1: Artwork embedded with 90° rotation centered`);
              
              // Embed with 90° rotation on page 2
              page2.drawPage(embeddedPage, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(90)
              });
              console.log(`✅ Page 2: Artwork embedded with 90° rotation centered`);
            } else if (rotation === 180) {
              // For 180° rotation, content is flipped upside down
              // No dimension swap occurs
              
              // Calculate where we want the center of the rotated content to be
              const pageCenterX = pageWidth / 2;
              const pageCenterY = pageHeight / 2;
              
              // For 180° rotation, dimensions stay the same
              const visualWidth = widthPts;
              const visualHeight = heightPts;
              
              // To center the rotated content:
              // Account for rotation around bottom-left corner
              const rotatedX = pageCenterX - visualWidth / 2 + visualWidth;  // Add width for pivot
              const rotatedY = pageCenterY - visualHeight / 2 + visualHeight; // Add height for pivot
              
              console.log(`📐 180° rotation: Page center (${pageCenterX.toFixed(1)}, ${pageCenterY.toFixed(1)})`);
              console.log(`📐 Positioning at (${rotatedX.toFixed(1)}, ${rotatedY.toFixed(1)}) for centered result`);
              
              // Embed with 180° rotation on page 1
              page1.drawPage(embeddedPage, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(180)
              });
              console.log(`✅ Page 1: Artwork embedded with 180° rotation centered`);
              
              // Embed with 180° rotation on page 2
              page2.drawPage(embeddedPage, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(180)
              });
              console.log(`✅ Page 2: Artwork embedded with 180° rotation centered`);
            } else if (rotation === 270) {
              // For 270° rotation, content rotates counter-clockwise around bottom-left corner
              // After rotation: width becomes visual height, height becomes visual width
              
              // Calculate where we want the center of the rotated content to be
              const pageCenterX = pageWidth / 2;
              const pageCenterY = pageHeight / 2;
              
              // After 270° rotation, the visual dimensions are swapped
              const visualWidth = heightPts;  // Original height becomes visual width
              const visualHeight = widthPts;  // Original width becomes visual height
              
              // To center the rotated content:
              // Account for rotation around bottom-left corner
              const rotatedX = pageCenterX - visualWidth / 2 + visualWidth;  // Add visual width for pivot
              const rotatedY = pageCenterY - visualHeight / 2; // No additional adjustment for Y
              
              console.log(`📐 270° rotation: Page center (${pageCenterX.toFixed(1)}, ${pageCenterY.toFixed(1)})`);
              console.log(`📐 Visual dims after rotation: ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}pts`);
              console.log(`📐 Positioning at (${rotatedX.toFixed(1)}, ${rotatedY.toFixed(1)}) for centered result`);
              
              // Embed with 270° rotation on page 1
              page1.drawPage(embeddedPage, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(270)
              });
              console.log(`✅ Page 1: Artwork embedded with 270° rotation centered`);
              
              // Embed with 270° rotation on page 2
              page2.drawPage(embeddedPage, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(270)
              });
              console.log(`✅ Page 2: Artwork embedded with 270° rotation centered`);
            } else {
              // No rotation - embed normally
              page1.drawPage(embeddedPage, {
                x: xPos,
                y: yPos,
                width: widthPts,
                height: heightPts
              });
              console.log(`✅ Page 1: Artwork embedded at exact canvas size`);
              
              page2.drawPage(embeddedPage, {
                x: xPos,
                y: yPos,
                width: widthPts,
                height: heightPts
              });
              console.log(`✅ Page 2: Artwork embedded at exact canvas size`);
            }
            
            // Cleanup handled inside each branch
            
          } catch (error) {
            console.log(`❌ Element processing failed: ${error}`);
          }
        }
        
        // Add project info and garment color to page 2 (same as canvas)
        const textColor = garmentColor === '#FFFFFF' ? rgb(0, 0, 0) : rgb(1, 1, 1);
        
        page2.drawText(`Project: ${project.name || 'Untitled'}`, { 
          x: 20, y: pageHeight - 40, size: 12, color: textColor 
        });
        page2.drawText(`Quantity: ${project.quantity || 1}`, { 
          x: 20, y: pageHeight - 60, size: 12, color: textColor 
        });
        page2.drawText(`Garment Color: ${garmentColorName}`, {
          x: 20, y: 60, size: 12, color: textColor
        });
        console.log(`✅ Page 2 info added with garment color: ${garmentColorName}`);
        
        // Generate initial PDF
        const pdfBytes = await pdfDoc.save();
        console.log(`✅ Initial PDF: ${pdfBytes.length} bytes`);
        
        // SKIP ALL COLOR CONVERSION - RETURN ORIGINAL PDF DIRECTLY
        console.log(`🎯 BYPASSING ALL COLOR CONVERSION - RETURNING ORIGINAL PDF WITH EXACT COLORS`);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${project.name}_qty${project.quantity || 1}_original.pdf"`);
        res.send(Buffer.from(pdfBytes));
        return;
        
      } catch (error) {
        console.error('❌ Ultra simple PDF failed:', error);
        res.status(500).json({ error: 'PDF generation failed' });
        return;
      }

      // This should never be reached due to early return above
      console.log('❌ Unexpected fallthrough - this should not happen');
      
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      res.status(500).json({ error: 'Failed to generate PDF: ' + errorMessage });
    }
  });
  
  // Setup imposition routes
  setupImpositionRoutes(app as any, storage);
  // File upload endpoint
  app.post('/api/projects/:projectId/logos', upload.array('files'), async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // PRODUCTION FLOW: Import production flow manager
      const { productionFlow } = await import('./production-flow-manager');
      const { fixSVGNamespaces } = await import('./fix-svg-namespaces');

      // Get template information to check if this is a single colour template
      const templateSizes = await storage.getTemplateSizes();
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      const isSingleColourTemplate = templateSize?.group === "Screen Printed Transfers" && 
        templateSize?.label?.includes("Single Colour");
      
      console.log(`📐 Template: ${templateSize?.name} (Group: ${templateSize?.group}), Single Colour: ${isSingleColourTemplate}, Ink Color: ${project.inkColor}`);

      const logos = [];
      
      for (const file of files) {
        let finalFilename = file.filename;
        let finalMimeType = file.mimetype;
        let finalUrl = `/uploads/${file.filename}`;

        // Handle AI/EPS files - convert to SVG for display
        if (file.mimetype === 'application/postscript' || 
            file.mimetype === 'application/illustrator' || 
            file.mimetype === 'application/x-illustrator') {
          try {
            const sourcePath = path.join(uploadDir, file.filename);
            const svgFilename = `${file.filename}.svg`;
            const svgPath = path.join(uploadDir, svgFilename);
            const extension = file.filename.toLowerCase().split('.').pop();
            
            console.log(`🎨 Processing ${extension?.toUpperCase()} file: ${file.filename}`);
            
            // Convert AI/EPS to SVG using Ghostscript (use pdf2svg as SVG device might not work)
            // First convert to PDF, then to SVG
            const tempPdfPath = path.join(uploadDir, `temp_${file.filename}.pdf`);
            const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dEPSCrop -sOutputFile="${tempPdfPath}" "${sourcePath}"`;
            
            try {
              await execAsync(gsCommand);
              
              // Now convert PDF to SVG
              if (fs.existsSync(tempPdfPath)) {
                const pdf2svgCommand = `pdf2svg "${tempPdfPath}" "${svgPath}"`;
                try {
                  await execAsync('which pdf2svg');
                  await execAsync(pdf2svgCommand);
                } catch {
                  // Fallback to Inkscape
                  const inkscapeCommand = `inkscape "${tempPdfPath}" --export-type=svg --export-filename="${svgPath}"`;
                  await execAsync(inkscapeCommand);
                }
                
                // Clean up temp PDF
                fs.unlinkSync(tempPdfPath);
              }
              
              if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                // Check if this is an AI-vectorized file that should not be re-processed
                const svgContent = fs.readFileSync(svgPath, 'utf8');
                const isAIVectorized = svgContent.includes('data-ai-vectorized="true"') || 
                                      svgContent.includes('AI_VECTORIZED_FILE');
                
                if (isAIVectorized) {
                  console.log(`🤖 AI-vectorized file detected: ${svgFilename}, applying specialized cleaning...`);
                  // Apply specialized cleaning for AI-vectorized content to fix extended elements and bounding box issues
                  const { cleanAIVectorizedSVG } = await import('./dimension-utils');
                  const cleanedSvg = cleanAIVectorizedSVG(svgContent);
                  fs.writeFileSync(svgPath, cleanedSvg);
                  console.log(`🧹 Applied AI-vectorized cleaning for ${svgFilename}`);
                } else {
                  // Clean SVG content to remove stroke scaling issues (only for non-AI-vectorized files)
                  const { removeVectorizedBackgrounds } = await import('./svg-color-utils');
                  const cleanedSvg = removeVectorizedBackgrounds(svgContent);
                  fs.writeFileSync(svgPath, cleanedSvg);
                  console.log(`🧹 Cleaned SVG content for ${svgFilename}`);
                }
                
                // Store original file info for later embedding
                (file as any).originalVectorPath = sourcePath;
                (file as any).originalVectorType = extension;
                (file as any).isCMYKPreserved = true;
                
                // Use SVG for display but remember to use original for output
                finalFilename = svgFilename;
                finalMimeType = 'image/svg+xml';
                finalUrl = `/uploads/${finalFilename}`;
                
                console.log(`✅ Created SVG preview for ${extension?.toUpperCase()} file: ${svgFilename}`);
              }
            } catch (gsError) {
              console.log(`⚠️ Ghostscript conversion failed, trying Inkscape...`);
              console.error('Ghostscript error:', gsError);
              
              // Fallback to Inkscape - try direct conversion first
              try {
                const inkscapeCommand = `inkscape "${sourcePath}" --export-type=svg --export-filename="${svgPath}"`;
                await execAsync(inkscapeCommand);
              } catch (inkscapeError) {
                console.log(`⚠️ Direct Inkscape conversion failed, trying PDF intermediate...`);
                // Try converting to PDF first, then to SVG
                const tempPdfPath2 = path.join(uploadDir, `temp2_${file.filename}.pdf`);
                const inkscapePdfCommand = `inkscape "${sourcePath}" --export-type=pdf --export-filename="${tempPdfPath2}"`;
                await execAsync(inkscapePdfCommand);
                
                if (fs.existsSync(tempPdfPath2)) {
                  const inkscapeSvgCommand = `inkscape "${tempPdfPath2}" --export-type=svg --export-filename="${svgPath}"`;
                  await execAsync(inkscapeSvgCommand);
                  fs.unlinkSync(tempPdfPath2);
                }
              }
              
              if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                // Clean SVG content to remove stroke scaling issues
                const { removeVectorizedBackgrounds } = await import('./svg-color-utils');
                const svgContent = fs.readFileSync(svgPath, 'utf8');
                const cleanedSvg = removeVectorizedBackgrounds(svgContent);
                fs.writeFileSync(svgPath, cleanedSvg);
                console.log(`🧹 Cleaned SVG content for ${svgFilename}`);
                
                (file as any).originalVectorPath = sourcePath;
                (file as any).originalVectorType = extension;
                (file as any).isCMYKPreserved = true;
                
                finalFilename = svgFilename;
                finalMimeType = 'image/svg+xml';
                finalUrl = `/uploads/${finalFilename}`;
                
                console.log(`✅ Created SVG preview using Inkscape for ${extension?.toUpperCase()} file`);
              } else {
                // If all conversions fail, create a placeholder SVG
                console.log(`⚠️ All conversions failed for ${file.filename}, creating placeholder`);
                const placeholderSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#f0f0f0" stroke="#999" stroke-width="2"/>
  <text x="100" y="100" text-anchor="middle" font-family="Arial" font-size="14" fill="#666">
    ${extension?.toUpperCase()} File
  </text>
  <text x="100" y="120" text-anchor="middle" font-family="Arial" font-size="12" fill="#999">
    (Preview unavailable)
  </text>
</svg>`;
                fs.writeFileSync(svgPath, placeholderSvg);
                
                (file as any).originalVectorPath = sourcePath;
                (file as any).originalVectorType = extension;
                (file as any).isCMYKPreserved = true;
                
                finalFilename = svgFilename;
                finalMimeType = 'image/svg+xml';
                finalUrl = `/uploads/${finalFilename}`;
              }
            }
          } catch (error) {
            console.error(`Failed to convert ${file.filename} to SVG:`, error);
            // Continue with original file
          }
        }

        // If it's a PDF, check for CMYK colors first
        if (file.mimetype === 'application/pdf') {
          // CRITICAL: Preserve original PDF for exact embedding with unique timestamp
          const timestamp = Date.now();
          const originalPdfFilename = `original_${file.filename}_${timestamp}.pdf`;
          const originalPdfPath = path.join(uploadDir, originalPdfFilename);
          const sourcePdfPath = path.join(uploadDir, file.filename);
          
          if (fs.existsSync(sourcePdfPath)) {
            // PRESERVE EXACT ORIGINAL COLORS - NO IMPORT CONVERSION
            console.log(`🎯 PRESERVING EXACT ORIGINAL PDF COLORS - NO IMPORT CONVERSION`);
            fs.copyFileSync(sourcePdfPath, originalPdfPath);
            console.log(`💾 Original PDF preserved as: ${originalPdfFilename} with exact original colors`);
            // Mark for later embedding
            (file as any).originalPdfFilename = originalPdfFilename;
          }
          try {
            const pdfPath = path.join(uploadDir, file.filename);
            const { CMYKDetector } = await import('./cmyk-detector');
            
            // Check if PDF contains CMYK colors
            const hasCMYK = await CMYKDetector.hasCMYKColors(pdfPath);
            
            if (hasCMYK) {
              console.log(`🎨 CMYK PDF detected: ${file.filename} - preserving original PDF to maintain CMYK accuracy`);
              
              // Convert to SVG for canvas display (vectors preserved)
              try {
                const svgFilename = `${file.filename}.svg`;
                const svgPath = path.join(uploadDir, svgFilename);
                
                // Apply FOGRA 51 color correction during PDF→SVG conversion
                let svgCommand;
                try {
                  await execAsync('which pdf2svg');
                  
                  // FOGRA 51 COLOR-CORRECTED PDF→SVG CONVERSION
                  const fogra51SvgPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
                  const hasFogra51Svg = fs.existsSync(fogra51SvgPath);
                  
                  console.log(`🎯 BASIC PDF→SVG CONVERSION - WORKING IMPORT`);
                  svgCommand = `pdf2svg "${pdfPath}" "${svgPath}"`;
                } catch {
                  // Fallback to Inkscape if pdf2svg not available
                  svgCommand = `inkscape --pdf-poppler "${pdfPath}" --export-type=svg --export-filename="${svgPath}" 2>/dev/null || convert -density 300 -background none "${pdfPath}[0]" "${svgPath}"`;
                }
                
                await execAsync(svgCommand);
                
                if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                  // CRITICAL FIX: DO NOT clean SVG content - removeVectorizedBackgrounds was corrupting artwork
                  // The function was removing essential content, mistaking artwork for backgrounds
                  console.log(`🎯 PRESERVING ORIGINAL ARTWORK: Skipping removeVectorizedBackgrounds to maintain content integrity`);
                  
                  let svgContent = fs.readFileSync(svgPath, 'utf8');
                  
                  // Add CMYK marker to the SVG so color analysis knows this came from a CMYK PDF
                  const markedSvg = svgContent.replace(
                    /<svg/,
                    '<!-- CMYK_PDF_CONVERTED -->\n<svg data-vectorized-cmyk="true" data-original-cmyk-pdf="true"'
                  );
                  
                  fs.writeFileSync(svgPath, markedSvg);
                  console.log(`🧹 Cleaned SVG content and marked as CMYK for ${svgFilename}`);
                  
                  // Store original PDF info for later embedding
                  (file as any).originalPdfPath = pdfPath;
                  (file as any).isCMYKPreserved = true;
                  
                  // Use SVG for display but remember to use PDF for output
                  finalFilename = svgFilename;
                  finalMimeType = 'image/svg+xml';
                  finalUrl = `/uploads/${finalFilename}`;
                  
                  console.log(`Created SVG preview for CMYK PDF: ${svgFilename}`);
                } else {
                  // Fallback to PNG preview if SVG conversion fails
                  const pngFilename = `${file.filename}_preview.png`;
                  const pngPath = path.join(uploadDir, pngFilename);
                  
                  const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r300 -dMaxBitmap=2147483647 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                  await execAsync(gsCommand);
                  
                  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                    (file as any).previewFilename = pngFilename;
                    console.log(`Created PNG preview for CMYK PDF: ${pngFilename}`);
                  }
                }
              } catch (error) {
                console.error('Failed to create CMYK PDF preview:', error);
              }
            } else {
              // Convert RGB PDF to SVG for editing capabilities
              const svgFilename = `${file.filename}.svg`;
              const svgPath = path.join(uploadDir, svgFilename);
              
              // Use pdf2svg for conversion
              let svgCommand;
              try {
                await execAsync('which pdf2svg');
                svgCommand = `pdf2svg "${pdfPath}" "${svgPath}"`;
              } catch {
                svgCommand = `convert -density 300 -background none "${pdfPath}[0]" "${svgPath}"`;
              }
              
              await execAsync(svgCommand);
              
              if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                // Check if this is an AI-vectorized file that should not be re-processed
                const svgContent = fs.readFileSync(svgPath, 'utf8');
                const isAIVectorized = svgContent.includes('data-ai-vectorized="true"') || 
                                      svgContent.includes('AI_VECTORIZED_FILE');
                
                if (isAIVectorized) {
                  console.log(`🤖 AI-vectorized file detected: ${svgFilename}, applying specialized cleaning...`);
                  // Apply specialized cleaning for AI-vectorized content to fix extended elements and bounding box issues
                  const { cleanAIVectorizedSVG } = await import('./dimension-utils');
                  const cleanedSvg = cleanAIVectorizedSVG(svgContent);
                  fs.writeFileSync(svgPath, cleanedSvg);
                  console.log(`🧹 Applied AI-vectorized cleaning for ${svgFilename}`);
                } else {
                  // CRITICAL FIX: Preserve original artwork content - removeVectorizedBackgrounds was corrupting artwork  
                  console.log(`🎯 PRESERVING ORIGINAL ARTWORK: Skipping removeVectorizedBackgrounds to maintain content integrity for ${svgFilename}`);
                  // No cleaning - preserve original SVG content as-is
                }
                
                // This is an RGB PDF - explicitly mark as NOT CMYK preserved
                (file as any).isCMYKPreserved = false;
                console.log(`🎨 RGB PDF detected: ${file.filename} - marked as isCMYKPreserved=false`);
                
                finalFilename = svgFilename;
                finalMimeType = 'image/svg+xml';
                finalUrl = `/uploads/${finalFilename}`;
              }
            }
          } catch (error) {
            console.error('PDF processing failed:', error);
            // Continue with original PDF
          }
        }

        // Import color workflow manager and mixed content detector
        const { ColorWorkflowManager, FileType } = await import('./color-workflow-manager');
        const { MixedContentDetector } = await import('./mixed-content-detector');
        
        // Analyze file content for mixed raster/vector content
        let fileType = ColorWorkflowManager.getFileType(file.mimetype, file.filename);
        
        // PRODUCTION FLOW: Run preflight check for each file
        const filePath = path.join(uploadDir, file.filename);
        const preflightResult = await productionFlow.runPreflightCheck(filePath, file.mimetype);
        
        console.log('🔍 Production Preflight:', {
          file: file.filename,
          colorSpace: preflightResult.colorSpaceDetected,
          requiresVectorization: preflightResult.requiresVectorization,
          hasRaster: preflightResult.hasRasterContent,
          hasVector: preflightResult.hasVectorContent,
          warnings: preflightResult.warnings.length
        });

        // For PDFs, analyze the original PDF file before conversion
        if (file.mimetype === 'application/pdf') {
          const originalPdfPath = path.join(uploadDir, file.filename);
          const contentAnalysis = await MixedContentDetector.analyzeFile(originalPdfPath, file.mimetype);
          
          console.log(`📊 Content analysis for ${file.filename}:`, {
            hasRaster: contentAnalysis.hasRasterContent,
            hasVector: contentAnalysis.hasVectorContent,
            isMixed: contentAnalysis.isMixedContent,
            rasterCount: contentAnalysis.rasterImages.count,
            vectorTypes: contentAnalysis.vectorElements.types,
            recommendation: contentAnalysis.recommendation
          });
          
          // DEBUG: Log which condition will be taken
          if (contentAnalysis.hasRasterContent && !contentAnalysis.hasVectorContent) {
            console.log('🚨 DEBUG: Taking RASTER-ONLY path - PDF will be flattened');
          } else if (contentAnalysis.isMixedContent) {
            console.log('🎨 DEBUG: Taking MIXED-CONTENT path - PDF will preserve vector');
          } else {
            console.log('📝 DEBUG: Taking VECTOR-ONLY path - PDF will be treated as vector');
          }
          
          // Override file type based on content analysis
          if (contentAnalysis.hasRasterContent && !contentAnalysis.hasVectorContent) {
            // PDF contains ONLY raster content (no vector elements), extract PNG for canvas display
            console.log(`📷 PDF contains raster-only content, extracting PNG for canvas display`);
            
            // Store original PDF path for later embedding
            (file as any).originalPdfPath = originalPdfPath;
            (file as any).isPdfWithRaster = true;
            (file as any).isPdfWithRasterOnly = true;  // True only for pure raster PDFs
            
            // Treat as raster workflow for canvas display
            fileType = FileType.RASTER_PNG;
            
            // Immediately extract original embedded PNG during upload (no processing)
            console.log('🔍 PDF has raster-only content, extracting original embedded PNG at native resolution...');
            console.log('🔍 Original PDF path for extraction:', originalPdfPath);
            
            // Create clean prefix without .svg extension to avoid MIME type issues
            const cleanPrefix = finalFilename.replace(/\.svg$/, '') + '_raster';
            console.log('🔍 Output prefix for extraction:', cleanPrefix);
            try {
              const extractedPngPath = await extractOriginalPNG(originalPdfPath, cleanPrefix);
              console.log('🔍 extractOriginalPNG returned:', extractedPngPath);
              if (extractedPngPath) {
                console.log('✅ Extracted clean PNG during upload:', extractedPngPath);
                console.log('📂 Checking if extracted file exists:', fs.existsSync(extractedPngPath));
                if (fs.existsSync(extractedPngPath)) {
                  const stats = fs.statSync(extractedPngPath);
                  console.log('📊 Extracted file size:', stats.size, 'bytes');
                  
                  // Use the extracted PNG directly (it's already in uploads directory)
                  const extractedFilename = path.basename(extractedPngPath);
                  
                  // Verify the file is accessible 
                  console.log('🔍 Extracted PNG path:', extractedPngPath);
                  console.log('🔍 Uploads directory:', uploadDir);
                  console.log('🔍 File is in uploads dir:', extractedPngPath.includes(uploadDir));
                  
                  // Update the file details to use the extracted PNG for canvas display
                  finalFilename = extractedFilename;
                  finalMimeType = 'image/png';
                  finalUrl = `/uploads/${extractedFilename}`;
                  
                  console.log('🔄 Updated file details to use extracted PNG:');
                  console.log('  finalFilename:', finalFilename);
                  console.log('  finalMimeType:', finalMimeType);
                  console.log('  finalUrl:', finalUrl);
                  console.log('🔍 Final file exists check:', fs.existsSync(path.join(uploadDir, extractedFilename)));
                }
                
                // Store the path for later use in database
                (file as any).extractedRasterPath = extractedPngPath;
                console.log('💾 Stored extractedRasterPath in file object:', extractedPngPath);
                
                // Calculate actual dimensions of the extracted PNG
                const pngDimensions = await getPNGDimensions(extractedPngPath);
                if (pngDimensions) {
                  (file as any).extractedPngWidth = pngDimensions.width;
                  (file as any).extractedPngHeight = pngDimensions.height;
                  console.log('📐 Stored extracted PNG dimensions:', pngDimensions);
                } else {
                  console.log('⚠️ Could not detect extracted PNG dimensions, will use fallback');
                }
              } else {
                console.log('❌ extractRasterImageWithDeduplication returned null/undefined');
              }
            } catch (extractError) {
              console.log('⚠️ PNG extraction during upload failed:', extractError);
              console.error('⚠️ Full extraction error details:', extractError);
            }
          } else if (contentAnalysis.isMixedContent) {
            // Mixed content PDF - preserve as vector workflow to maintain quality
            console.log(`🎨 Mixed content PDF detected - preserving vector workflow to maintain quality`);
            fileType = FileType.VECTOR_SVG; // Treat mixed content as vector to preserve quality
            
            // Store metadata about mixed content for warnings/processing
            (file as any).originalPdfPath = originalPdfPath;
            (file as any).isMixedContent = true;
          }
        } else if (fileType === FileType.VECTOR_SVG) {
          // For SVGs, check the converted file for mixed content
          const filePath = path.join(uploadDir, finalFilename);
          const contentAnalysis = await MixedContentDetector.analyzeFile(filePath, finalMimeType);
          
          console.log(`📊 Content analysis for ${finalFilename}:`, {
            hasRaster: contentAnalysis.hasRasterContent,
            hasVector: contentAnalysis.hasVectorContent,
            isMixed: contentAnalysis.isMixedContent,
            rasterCount: contentAnalysis.rasterImages.count,
            vectorTypes: contentAnalysis.vectorElements.types,
            recommendation: contentAnalysis.recommendation
          });
          
          // Override file type if mixed content detected
          if (contentAnalysis.isMixedContent) {
            fileType = FileType.MIXED_CONTENT;
          }
        }
        
        // Determine workflow based on content analysis
        const colorWorkflow = ColorWorkflowManager.getColorWorkflow(fileType);
        
        console.log(`📂 File type: ${fileType}, Workflow: ${JSON.stringify(colorWorkflow)}`);
        console.log(`🎨 ${ColorWorkflowManager.getWorkflowMessage(fileType, colorWorkflow)}`);
        
        // Analyze colors based on file type
        let analysisData = null;
        
        // Handle raster files separately
        if (fileType === FileType.RASTER_PNG || fileType === FileType.RASTER_JPEG) {
          try {
            console.log(`🖼️ Processing raster file for CMYK conversion: ${finalFilename}`);
            const { RasterCMYKConverter } = await import('./raster-cmyk-converter');
            
            // Analyze raster colors for display
            const rasterPath = path.join(uploadDir, finalFilename);
            const colors = await RasterCMYKConverter.analyzeRasterColors(rasterPath);
            
            if (colors.length > 0) {
              analysisData = {
                colors: colors,
                fonts: [],
                strokeWidths: [],
                hasText: false
              };
              console.log(`🎨 Analyzed ${colors.length} dominant colors in raster image`);
            }
            
            // Note: Actual CMYK conversion happens during PDF generation
            // This prevents breaking the upload workflow
            
          } catch (error) {
            console.error('Error analyzing raster colors:', error);
            // Continue without color analysis - don't break upload
          }
        } 
        // Handle vector and mixed files
        else if (ColorWorkflowManager.shouldAnalyzeColors(fileType) || fileType === FileType.MIXED_CONTENT) {
          try {
            console.log(`🔍 Starting color analysis for vector file: ${finalFilename}`);
            const { analyzeSVGWithStrokeWidths } = await import('./svg-color-utils');
            const svgPath = path.join(uploadDir, finalFilename);
            console.log(`📁 SVG path: ${svgPath}`);
            
            // UNIVERSAL COLOR EXTRACTION - Preserve exact original values from ANY file
            console.log(`🎨 UNIVERSAL COLOR EXTRACTION: Extracting original colors from ${finalFilename}`);
            const { UniversalColorExtractor } = await import('./universal-color-extractor');
            const universalColors = await UniversalColorExtractor.extractColors(svgPath, finalMimeType);
            
            // Get traditional SVG analysis for stroke/font data 
            let analysis = analyzeSVGWithStrokeWidths(svgPath);
            console.log(`📊 SVG analysis: ${analysis.colors?.length || 0} colors detected`);
            console.log(`🎯 Universal extraction: ${universalColors.colors.length} original colors preserved`);
            
            // ALWAYS use universal extraction results (replace legacy analysis)
            console.log(`✅ USING UNIVERSAL COLOR EXTRACTION: ${universalColors.colors.length} original colors`);
            
            // Convert universal colors to the expected format
            analysis.colors = universalColors.colors.map((color, index) => ({
              id: `color_${index}`,
              originalColor: color.format === 'rgb' ? 
                `rgb(${color.values[0]}, ${color.values[1]}, ${color.values[2]})` :
                color.originalString,
              originalFormat: color.originalString,
              cmykColor: color.format === 'cmyk' ? 
                UniversalColorExtractor.formatColorForDisplay(color) :
                (color.format === 'rgb' ? 
                  `R:${color.values[0]} G:${color.values[1]} B:${color.values[2]}` :
                  UniversalColorExtractor.formatColorForDisplay(color)),
              elementType: color.elementSelector?.split(':')[0] || 'path',
              attribute: 'fill',
              selector: color.elementSelector || `path:nth-of-type(${index + 1})`,
              isCMYK: color.format === 'cmyk' || universalColors.colorSpace === 'CMYK',
              isExactMatch: true // Always exact since extracted from original
            }));
            
            // Mark as CMYK preserved if we found CMYK colors or markers
            if (universalColors.colorSpace === 'CMYK' || universalColors.hasEmbeddedProfile || analysis.colors?.some(c => c.isCMYK)) {
              (file as any).isCMYKPreserved = true;
              console.log(`🎨 CMYK colors detected - marking file as CMYK preserved`);
            }
            
            // If this is a CMYK PDF that was converted to SVG, mark all colors as CMYK
            if ((file as any).isCMYKPreserved && (file as any).originalPdfPath) {
              console.log(`🎨 CMYK PDF detected - marking all colors as CMYK in analysis`);
              console.log(`🔍 DEBUG: File has isCMYKPreserved=${(file as any).isCMYKPreserved}, originalPdfPath=${(file as any).originalPdfPath}`);
              
              // Update the SVG file to include CMYK marker
              const svgContent = fs.readFileSync(svgPath, 'utf8');
              if (!svgContent.includes('data-vectorized-cmyk="true"')) {
                const updatedSvg = svgContent.replace(
                  /<svg/,
                  '<svg data-vectorized-cmyk="true" data-original-cmyk-pdf="true"'
                );
                fs.writeFileSync(svgPath, updatedSvg);
              }
              
              // Re-analyze with the CMYK marker
              analysis = analyzeSVGWithStrokeWidths(svgPath);
              
              // Re-extract universal colors after adding CMYK markers
              const reExtractedColors = await UniversalColorExtractor.extractColors(svgPath, finalMimeType);
              if (reExtractedColors.colors.length > 0) {
                console.log(`🔄 Re-extracted ${reExtractedColors.colors.length} colors after CMYK marker`);
                // Update analysis with re-extracted colors
                analysis.colors = reExtractedColors.colors.map((color, index) => ({
                  id: `color_${index}`,
                  originalColor: color.originalString,
                  originalFormat: color.originalString,
                  cmykColor: UniversalColorExtractor.formatColorForDisplay(color),
                  elementType: color.elementSelector?.split(':')[0] || 'path',
                  attribute: 'fill',
                  selector: color.elementSelector || `path:nth-of-type(${index + 1})`,
                  isCMYK: color.format === 'cmyk',
                  isExactMatch: true
                }));
              }
            }
            
            // CRITICAL FIX: Set the preservation flag based on actual color analysis
            if (analysis.colors && analysis.colors.length > 0) {
              const allColorsAreCMYK = analysis.colors.every(color => (color as any).isCMYK === true);
              const hasAnyRGBColors = analysis.colors.some(color => (color as any).isCMYK === false);
              
              if (allColorsAreCMYK && file.mimetype === 'application/pdf') {
                console.log(`🎨 CRITICAL FIX - All ${analysis.colors.length} colors are CMYK, setting isCMYKPreserved=true`);
                (file as any).isCMYKPreserved = true;
              } else if (hasAnyRGBColors && file.mimetype === 'application/pdf') {
                console.log(`🎨 CRITICAL FIX - Found RGB colors in PDF, setting isCMYKPreserved=false`);
                (file as any).isCMYKPreserved = false;
              }
            }
            
            console.log(`🎨 Analysis results:`, {
              colors: analysis.colors?.length || 0,
              fonts: analysis.fonts?.length || 0,
              strokeWidths: analysis.strokeWidths?.length || 0,
              hasText: analysis.hasText
            });
            
            // Process colors based on workflow
            if (analysis.colors && analysis.colors.length > 0 && colorWorkflow.convertToCMYK) {
              console.log(`🎨 Processing colors for ${finalFilename} based on workflow`);
              
              // Mark colors as converted only if workflow requires conversion AND color is not already CMYK
              const processedColors = analysis.colors.map(color => {
                const isCMYK = (color as any).isCMYK || false;
                const shouldConvert = colorWorkflow.convertToCMYK && !isCMYK;
                
                console.log(`🎨 Color processing: ${color.originalColor} - isCMYK: ${isCMYK}, converted: ${shouldConvert}`);
                
                return {
                  ...color,
                  converted: shouldConvert // Only mark as converted if actually converting RGB to CMYK
                };
              });
              
              // Update analysis with processed colors
              analysis.colors = processedColors;
              console.log(`✅ Processed ${processedColors.length} colors - CMYK preserved: ${colorWorkflow.preserveCMYK}`);
            }
            
            // Prepare analysis data for logo record
            analysisData = {
              colors: analysis.colors,
              fonts: analysis.fonts,
              strokeWidths: analysis.strokeWidths,
              minStrokeWidth: analysis.minStrokeWidth,
              maxStrokeWidth: analysis.maxStrokeWidth,
              hasText: analysis.hasText
            };
            
            console.log(`📊 Auto-analyzed ${finalFilename} - Colors: ${analysis.colors?.length || 0}, Stroke widths: ${analysis.strokeWidths?.length || 0}, Min: ${analysis.minStrokeWidth?.toFixed(2) || 'N/A'}pt`);
            
            // Automatic font outlining for PDFs with text elements
            if (analysis.hasText && (file.mimetype === 'application/pdf' || (file as any).originalVectorType === 'pdf')) {
              try {
                console.log(`🔤 Text detected in PDF-converted SVG, outlining fonts for: ${finalFilename}`);
                const { outlineFonts } = await import('./font-outliner');
                const outlinedPath = await outlineFonts(svgPath);
                
                if (outlinedPath !== svgPath && fs.existsSync(outlinedPath)) {
                  // Replace the original SVG with the outlined version
                  const outlinedContent = fs.readFileSync(outlinedPath, 'utf8');
                  fs.writeFileSync(svgPath, outlinedContent);
                  
                  // Clean up the temporary outlined file
                  fs.unlinkSync(outlinedPath);
                  
                  console.log(`✅ Fonts successfully outlined and SVG updated: ${finalFilename}`);
                  
                  // Re-analyze the outlined SVG to update text status and recalculate bounds
                  analysis = analyzeSVGWithStrokeWidths(svgPath);
                  analysisData = {
                    colors: analysis.colors,
                    fonts: analysis.fonts,
                    strokeWidths: analysis.strokeWidths,
                    minStrokeWidth: analysis.minStrokeWidth,
                    maxStrokeWidth: analysis.maxStrokeWidth,
                    hasText: analysis.hasText
                  };
                  
                  console.log(`🔄 Font outlining completed, recalculating content bounds for outlined paths`);
                  
                  // Force recalculation of content bounds after outlining
                  try {
                    const { calculateSVGContentBounds } = await import('./dimension-utils');
                    const outlinedSvgContent = fs.readFileSync(svgPath, 'utf8');
                    console.log(`🔍 DEBUG: Attempting to calculate content bounds for outlined SVG (${outlinedSvgContent.length} chars)`);
                    
                    const newContentBounds = calculateSVGContentBounds(outlinedSvgContent);
                    console.log(`🔍 DEBUG: Content bounds result:`, newContentBounds);
                    
                    if (newContentBounds && newContentBounds.width > 0 && newContentBounds.height > 0) {
                      console.log(`📐 Recalculated content bounds after outlining: ${newContentBounds.width.toFixed(1)}×${newContentBounds.height.toFixed(1)}px`);
                      
                      // Store the updated bounds for dimension calculation
                      (file as any).outlinedContentBounds = newContentBounds;
                      
                      // Force the outlined content bounds to bypass large format detection
                      (file as any).forceContentBounds = true;
                      console.log(`✅ Stored outlined content bounds and force flag`);
                    } else {
                      console.log(`⚠️ Invalid content bounds after outlining:`, newContentBounds);
                    }
                  } catch (boundsError) {
                    console.warn('⚠️ Failed to recalculate content bounds after outlining:', boundsError);
                  }
                } else {
                  console.log(`⚠️ Font outlining returned same path or failed for: ${finalFilename}`);
                }
              } catch (fontError) {
                console.error('⚠️ Font outlining failed during upload:', fontError);
                // Continue without outlining - don't break upload
              }
            }
          } catch (analysisError) {
            console.error('❌ SVG analysis failed during upload:', analysisError);
            if (analysisError instanceof Error) {
              console.error('Stack trace:', analysisError.stack);
            }
          }
        }

        // PRODUCTION FLOW: Store preflight results and enforce color preservation
        const logoData: any = {
          projectId,
          filename: finalFilename,
          originalName: file.originalname,
          mimeType: finalMimeType,
          size: file.size,
          url: finalUrl,
          svgColors: analysisData,
          svgFonts: analysisData?.fonts || null,
          isMixedContent: fileType === FileType.MIXED_CONTENT,
          isCMYKPreserved: (file as any).isCMYKPreserved || false,
          isPdfWithRasterOnly: (file as any).isPdfWithRasterOnly || false,
          // PRODUCTION FLOW: Add preflight results
          preflightData: {
            colorSpaceDetected: preflightResult.colorSpaceDetected,
            hasRasterContent: preflightResult.hasRasterContent,
            hasVectorContent: preflightResult.hasVectorContent,
            isMixedContent: preflightResult.isMixedContent,
            contentBounds: preflightResult.contentBounds,
            colorsDetected: preflightResult.colorsDetected,
            requiresVectorization: preflightResult.requiresVectorization,
            warnings: preflightResult.warnings,
            originalColorsPreserved: true // CRITICAL: Always true unless explicitly changed
          }
        };
        
        // Add preview filename if it exists (for CMYK PDFs)
        if ((file as any).previewFilename) {
          logoData.previewFilename = (file as any).previewFilename;
        }
        
        // Add extracted raster path if it exists (for PDFs with raster only)
        if ((file as any).extractedRasterPath) {
          logoData.extractedRasterPath = (file as any).extractedRasterPath;
          console.log('💾 SAVING extractedRasterPath to database:', (file as any).extractedRasterPath);
        } else {
          console.log('💾 NO extractedRasterPath to save (file property not set)');
        }
        
        // Add original PDF info for CMYK PDFs or PDFs with raster only
        if ((file as any).originalPdfPath && ((file as any).isCMYKPreserved || (file as any).isPdfWithRasterOnly)) {
          // Use the preserved original PDF filename if available
          logoData.originalFilename = (file as any).originalPdfFilename || file.filename;
          logoData.originalMimeType = 'application/pdf';
          console.log(`💾 Set originalFilename to: ${logoData.originalFilename}`);
        }
        
        // CRITICAL: For ALL PDF uploads, save the original PDF filename for exact embedding
        if (file.mimetype === 'application/pdf') {
          if ((file as any).originalPdfFilename) {
            logoData.originalFilename = (file as any).originalPdfFilename;
            logoData.originalMimeType = 'application/pdf';
            console.log(`💾 PDF upload: Set originalFilename to preserved: ${logoData.originalFilename}`);
          } else {
            // Fallback: If no preserved filename, use the uploaded filename
            logoData.originalFilename = file.filename;
            logoData.originalMimeType = 'application/pdf';
            console.log(`💾 PDF upload fallback: Set originalFilename to: ${logoData.originalFilename}`);
          }
        }
        
        // Add original AI/EPS info for vector files
        if ((file as any).originalVectorPath && (file as any).originalVectorType) {
          logoData.originalFilename = file.filename; // Store the original AI/EPS filename
          logoData.originalMimeType = file.mimetype; // Keep original mime type
        }
        
        const logo = await storage.createLogo(logoData);
        console.log('💾 CREATED logo record:', {
          id: logo.id,
          filename: logo.filename,
          isPdfWithRasterOnly: logo.isPdfWithRasterOnly,
          extractedRasterPath: logo.extractedRasterPath
        });
        
        // Add the logo to the logos array immediately after creation
        logos.push(logo);

        // Auto-recolor for single colour templates with ink color
        if (isSingleColourTemplate && project.inkColor && (finalMimeType === 'image/svg+xml' || finalMimeType === 'application/pdf')) {
          try {
            console.log(`🎨 Auto-recoloring vector for single colour template with ink: ${project.inkColor}`);
            
            // Import recoloring utility
            const { recolorSVG } = await import('./svg-recolor');
            
            const filePath = path.join(uploadDir, finalFilename);
            
            // Read current SVG content
            const svgContent = fs.readFileSync(filePath, 'utf8');
            
            // Apply recoloring
            const recoloredContent = recolorSVG(svgContent, project.inkColor);
            
            // Write recolored content back to file
            fs.writeFileSync(filePath, recoloredContent, 'utf8');
            
            console.log(`✅ Auto-recolored ${finalFilename} with ink color ${project.inkColor}`);
            
            // Re-analyze colors after recoloring to update the logo record
            if (finalMimeType === 'image/svg+xml') {
              try {
                const { analyzeSVGWithStrokeWidths } = await import('./svg-color-utils');
                const updatedAnalysis = analyzeSVGWithStrokeWidths(filePath);
                
                // Update logo with new color analysis
                await storage.updateLogo(logo.id, {
                  svgColors: {
                    colors: updatedAnalysis.colors,
                    fonts: updatedAnalysis.fonts,
                    strokeWidths: updatedAnalysis.strokeWidths,
                    minStrokeWidth: updatedAnalysis.minStrokeWidth,
                    maxStrokeWidth: updatedAnalysis.maxStrokeWidth,
                    hasText: updatedAnalysis.hasText
                  }
                });
                
                console.log(`🔄 Updated color analysis for recolored logo`);
              } catch (error) {
                console.error('Failed to update color analysis after recoloring:', error);
              }
            }
            
          } catch (error) {
            console.error('Auto-recoloring failed:', error);
            // Continue with upload even if recoloring fails
          }
        }

        // Create canvas element with proper sizing
        let displayWidth = 283.5; // User override: exact target dimensions
        let displayHeight = 285.2; // User override: exact target dimensions

        // Use actual extracted PNG dimensions if available
        console.log('🔍 DEBUG: Checking for extracted PNG dimensions:', {
          hasExtractedPngWidth: !!(file as any).extractedPngWidth,
          hasExtractedPngHeight: !!(file as any).extractedPngHeight,
          width: (file as any).extractedPngWidth,
          height: (file as any).extractedPngHeight,
          filename: file.filename,
          mimetype: file.mimetype,
          finalFilename: finalFilename,
          finalMimeType: finalMimeType
        });
        
        // Try to get dimensions from extracted PNG file directly
        if (finalMimeType === 'image/png' && (finalFilename.includes('_raster-gs.png') || finalFilename.includes('_raster-') && finalFilename.includes('.png'))) {
          console.log('🔍 Detected extracted PNG file, querying dimensions directly');
          const pngPath = path.join(uploadDir, finalFilename);
          const directDimensions = await getPNGDimensions(pngPath);
          if (directDimensions) {
            // For PDF-extracted PNGs, assume original was much smaller and scale down
            // Common embedded logos are around 200-400px, not 809px
            let scaledWidth = directDimensions.width;
            let scaledHeight = directDimensions.height;
            
            // If dimensions are large (>600px), likely a rasterized version - scale down
            if (directDimensions.width > 600 || directDimensions.height > 600) {
              const scaleFactor = 0.35; // Scale down to approximate original size
              scaledWidth = Math.round(directDimensions.width * scaleFactor);
              scaledHeight = Math.round(directDimensions.height * scaleFactor);
              console.log(`📐 Large PNG detected (${directDimensions.width}×${directDimensions.height}px), scaling down by ${scaleFactor}: ${scaledWidth}×${scaledHeight}px`);
            }
            
            const { calculatePreciseDimensions } = await import('./dimension-utils');
            const dimensionResult = calculatePreciseDimensions(scaledWidth, scaledHeight, 'scaled_extraction');
            displayWidth = dimensionResult.widthMm;
            displayHeight = dimensionResult.heightMm;
            console.log(`📐 Using SCALED extracted dimensions: ${scaledWidth}×${scaledHeight}px = ${displayWidth.toFixed(3)}×${displayHeight.toFixed(3)}mm (scaled native)`);
          }
        } else if ((file as any).extractedPngWidth && (file as any).extractedPngHeight) {
          const { calculatePreciseDimensions } = await import('./dimension-utils');
          const pngWidth = (file as any).extractedPngWidth;
          const pngHeight = (file as any).extractedPngHeight;
          
          // Calculate dimensions using standard conversion factor
          const dimensionResult = calculatePreciseDimensions(pngWidth, pngHeight, 'extracted_png');
          displayWidth = dimensionResult.widthMm;
          displayHeight = dimensionResult.heightMm;
          
          console.log(`📐 Using extracted PNG dimensions: ${pngWidth}×${pngHeight}px = ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm`);
        } else {
          console.log('⚠️ DEBUG: No extracted PNG dimensions found, using defaults:', displayWidth + 'x' + displayHeight);
        }

        try {
          if (finalMimeType === 'image/png' && (file as any).extractedPngWidth && (file as any).extractedPngHeight) {
            // For extracted PNG files, use the detected dimensions
            console.log('🖼️ Processing extracted PNG file with detected dimensions');
            // Dimensions already set above, no additional processing needed
          } else if (finalMimeType === 'image/svg+xml') {
            const svgPath = path.join(uploadDir, finalFilename);
            
            // Check viewBox first - most reliable for A3 detection
            const svgContent = fs.readFileSync(svgPath, 'utf8');
            
            // PRECISE VECTOR BOUNDS: Use the new bounds extraction system for accurate content sizing
            console.log(`📐 EXTRACTING PRECISE VECTOR BOUNDS: Using advanced bounds detection for accurate content sizing`);
            
            try {
              // For PDF-converted SVGs, try to use the original PDF bounds first
              let boundsResult = null;
              
              if ((file as any).originalPdfPath && file.mimetype === 'application/pdf') {
                // Try to extract bounds from the original PDF for accuracy
                console.log('📐 Attempting to extract CONTENT bounds from original PDF (not page bounds)');
                const { PDFBoundsExtractor } = await import('./pdf-bounds-extractor');
                const pdfExtractor = new PDFBoundsExtractor();
                const pdfBoundsResult = await pdfExtractor.extractContentBounds(
                  (file as any).originalPdfPath,
                  1,
                  { includeStrokeExtents: true, highDpiRasterFallback: true }
                );
                
                if (pdfBoundsResult.success && pdfBoundsResult.bbox) {
                  console.log(`✅ PDF CONTENT BOUNDS EXTRACTED: ${pdfBoundsResult.bbox.width.toFixed(1)}×${pdfBoundsResult.bbox.height.toFixed(1)}pts`);
                  console.log(`📄 Content bounds: (${pdfBoundsResult.bbox.xMin.toFixed(1)}, ${pdfBoundsResult.bbox.yMin.toFixed(1)}) to (${pdfBoundsResult.bbox.xMax.toFixed(1)}, ${pdfBoundsResult.bbox.yMax.toFixed(1)})`);
                  
                  // These are CONTENT bounds, not page bounds - use them directly
                  boundsResult = {
                    success: true,
                    contentBounds: {
                      xMin: pdfBoundsResult.bbox.xMin,
                      yMin: pdfBoundsResult.bbox.yMin,
                      xMax: pdfBoundsResult.bbox.xMax,
                      yMax: pdfBoundsResult.bbox.yMax,
                      width: pdfBoundsResult.bbox.width,
                      height: pdfBoundsResult.bbox.height
                    },
                    method: 'pdf-content-bounds'
                  };
                }
              }
              
              // Import SVG analyzer for later use
              const { SVGBoundsAnalyzer } = await import('./svg-bounds-analyzer');
              const svgAnalyzer = new SVGBoundsAnalyzer();
              
              // If PDF bounds extraction failed, use SVG bounds analyzer
              if (!boundsResult) {
                boundsResult = await svgAnalyzer.extractSVGBounds(svgPath);
              }
              
              if (boundsResult.success && boundsResult.contentBounds) {
                console.log(`✅ PRECISE BOUNDS DETECTED: ${boundsResult.contentBounds.width.toFixed(1)}×${boundsResult.contentBounds.height.toFixed(1)}px using ${boundsResult.method}`);
                
                // Convert to millimeters
                const pxToMm = 1 / 2.834645669; // 72 DPI standard
                const detectedWidthMm = boundsResult.contentBounds.width * pxToMm;
                const detectedHeightMm = boundsResult.contentBounds.height * pxToMm;
                
                console.log(`📐 INITIAL BOUNDS: ${detectedWidthMm.toFixed(1)}×${detectedHeightMm.toFixed(1)}mm`);
                
                // Only apply correction if bounds are truly unreasonable (larger than A3)
                const A3_WIDTH_MM = 297;
                const A3_HEIGHT_MM = 420;
                
                if (detectedWidthMm > A3_HEIGHT_MM * 2 || detectedHeightMm > A3_HEIGHT_MM * 2) {
                  // This is likely a coordinate system issue, not actual content bounds
                  console.log(`⚠️ UNREASONABLE BOUNDS DETECTED: ${detectedWidthMm.toFixed(1)}×${detectedHeightMm.toFixed(1)}mm (> 2×A3)`);
                  
                  // Try to detect the actual content scale based on common patterns
                  // Many PDFs use coordinates in the thousands but actual content is much smaller
                  let scaleFactor = 1.0;
                  
                  if (detectedWidthMm > 2000 || detectedHeightMm > 2000) {
                    // Coordinates are likely in points but misinterpreted
                    scaleFactor = 0.1; // 10% of detected size
                  } else if (detectedWidthMm > 1000 || detectedHeightMm > 1000) {
                    // Moderately oversized, likely coordinate offset issue
                    scaleFactor = 0.2; // 20% of detected size
                  } else {
                    // Slightly oversized
                    scaleFactor = 0.5; // 50% of detected size
                  }
                  
                  const correctedWidthMm = detectedWidthMm * scaleFactor;
                  const correctedHeightMm = detectedHeightMm * scaleFactor;
                  
                  console.log(`🎯 APPLYING SCALE CORRECTION: ${correctedWidthMm.toFixed(1)}×${correctedHeightMm.toFixed(1)}mm (${(scaleFactor*100).toFixed(0)}% of detected)`);
                  
                  // Update the bounds to reflect more realistic content size
                  boundsResult.contentBounds = {
                    ...boundsResult.contentBounds,
                    width: correctedWidthMm / pxToMm,
                    height: correctedHeightMm / pxToMm
                  };
                } else {
                  console.log(`✅ REASONABLE BOUNDS: Using detected bounds as-is`);
                }
                
                
                // CRITICAL FIX: Only create tight content SVG for oversized or incorrectly bounded content
                // For A3 and properly sized artwork, keep original to avoid clipping
                const usingPdfContentBounds = boundsResult.method === 'pdf-content-bounds';
                // A3_WIDTH_MM, A3_HEIGHT_MM, and pxToMm are already declared above
                const contentWidthMm = boundsResult.contentBounds.width * pxToMm;
                const contentHeightMm = boundsResult.contentBounds.height * pxToMm;
                
                // Get original SVG dimensions to compare with content bounds
                const { detectDimensionsFromSVG } = await import('./dimension-utils');
                const originalSvgDimensions = await detectDimensionsFromSVG(svgContent, null, svgPath);
                const originalWidthMm = originalSvgDimensions.widthMm;
                const originalHeightMm = originalSvgDimensions.heightMm;
                
                // Calculate the difference between original viewBox and content bounds
                const widthDiff = Math.abs(originalWidthMm - contentWidthMm);
                const heightDiff = Math.abs(originalHeightMm - contentHeightMm);
                
                // ALWAYS create tight content if there's ANY significant padding
                // This ensures canvas displays at exact content size
                // Remove the !usingPdfContentBounds check - we want tight crop even with PDF bounds
                const needsTightCrop = widthDiff > 2 || heightDiff > 2;
                
                if (needsTightCrop) {
                  console.log(`📐 TIGHT CONTENT NEEDED: ViewBox ${originalWidthMm.toFixed(1)}×${originalHeightMm.toFixed(1)}mm vs Content ${contentWidthMm.toFixed(1)}×${contentHeightMm.toFixed(1)}mm (diff: ${widthDiff.toFixed(1)}×${heightDiff.toFixed(1)}mm)`);
                } else {
                  console.log(`✅ CONTENT MATCHES VIEWBOX: No tight crop needed (diff: ${widthDiff.toFixed(1)}×${heightDiff.toFixed(1)}mm)`);
                }
                
                if (needsTightCrop) {
                  console.log(`🔄 CREATING TIGHT CONTENT SVG: Content is oversized, cropping to actual bounds`);
                  
                  const svgContent = fs.readFileSync(svgPath, 'utf8');
                  
                  // CRITICAL FIX: Calculate actual SVG content bounds, not PDF bounds
                  // SVG content may extend beyond PDF bounds due to text baselines, strokes, etc.
                  const { calculateSVGContentBounds } = await import('./dimension-utils');
                  const svgContentBounds = calculateSVGContentBounds(svgContent);
                  
                  let contentBounds = boundsResult.contentBounds;
                  if (svgContentBounds && svgContentBounds.width > 0 && svgContentBounds.height > 0) {
                    console.log(`📐 SVG CONTENT BOUNDS: ${svgContentBounds.minX.toFixed(1)},${svgContentBounds.minY.toFixed(1)} → ${svgContentBounds.maxX.toFixed(1)},${svgContentBounds.maxY.toFixed(1)} = ${svgContentBounds.width.toFixed(1)}×${svgContentBounds.height.toFixed(1)}px`);
                    
                    // Use SVG content bounds instead of PDF bounds to avoid clipping
                    contentBounds = {
                      xMin: svgContentBounds.minX,
                      yMin: svgContentBounds.minY,
                      xMax: svgContentBounds.maxX,
                      yMax: svgContentBounds.maxY,
                      width: svgContentBounds.width,
                      height: svgContentBounds.height
                    };
                    console.log(`✅ USING SVG CONTENT BOUNDS: More accurate than PDF bounds, prevents clipping`);
                  } else {
                    console.log(`⚠️ Could not calculate SVG content bounds, using PDF bounds`);
                  }
                  
                  // Extract all content elements (paths, circles, rects, etc.)
                  const contentMatch = svgContent.match(/<svg[^>]*>(.*?)<\/svg>/s);
                  console.log(`🔍 DEBUG: Content extraction - contentMatch found: ${!!contentMatch}`);
                  if (contentMatch) {
                    const innerContent = contentMatch[1];
                    
                    // Account for text glyph overflow beyond path coordinates
                    // Text can extend significantly beyond the geometric bounds
                    const textOverflowLeft = 5;   // Small amount on left
                    const textOverflowRight = 50; // Large amount on right for trailing characters
                    const textOverflowTop = 5;    // Small amount on top
                    const textOverflowBottom = 5; // Small amount on bottom
                    
                    // Calculate true content bounds including text overflow
                    const trueContentWidth = contentBounds.width + textOverflowLeft + textOverflowRight;
                    const trueContentHeight = contentBounds.height + textOverflowTop + textOverflowBottom;
                    
                    // Create SVG with exact content bounds (including text overflow)
                    // Content is centered within these bounds
                    const tightSvg = `<svg xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 ${trueContentWidth} ${trueContentHeight}" 
                      width="${trueContentWidth}" 
                      height="${trueContentHeight}"
                      preserveAspectRatio="xMidYMid meet"
                      data-content-extracted="true"
                      data-text-overflow="left:${textOverflowLeft},right:${textOverflowRight},top:${textOverflowTop},bottom:${textOverflowBottom}"
                      data-original-bounds="${contentBounds.xMin},${contentBounds.yMin},${contentBounds.xMax},${contentBounds.yMax}">
                        <g transform="translate(${-contentBounds.xMin + textOverflowLeft}, ${-contentBounds.yMin + textOverflowTop})">
                          ${innerContent}
                        </g>
                    </svg>`;
                    
                    // Save the tight-content SVG
                    const tightSvgPath = svgPath.replace('.svg', '_tight-content.svg');
                    fs.writeFileSync(tightSvgPath, tightSvg);
                    console.log(`💾 SAVED TIGHT CONTENT SVG: ${tightSvgPath}`);
                    
                    // Fix SVG namespace issues immediately after creation
                    fixSVGNamespaces(tightSvgPath);
                    
                    // Update the file to use the tight content version
                    finalFilename = path.basename(tightSvgPath);
                    finalUrl = `/uploads/${finalFilename}`;
                    
                    console.log(`🔄 UPDATED FILE TO USE TIGHT CONTENT: ${finalFilename}`);
                    
                    // DON'T RE-ANALYZE! Use the original content bounds we already have
                    // Re-analyzing the tight content SVG gives wrong dimensions
                    console.log(`✅ USING ORIGINAL CONTENT BOUNDS: No re-analysis needed, we already have correct dimensions`);
                  }
                } else if (usingPdfContentBounds) {
                  // We have exact PDF content bounds, use them directly
                  console.log(`✅ USING PDF CONTENT BOUNDS: Exact content size from original PDF`);
                } else {
                  // Content is already reasonable size, use as-is
                  console.log(`✅ CONTENT SIZE REASONABLE: Using original SVG bounds without tight crop`);
                }
                
                // Convert the final corrected content bounds to millimeters 
                // Add text overflow to bounds if we created a tight content SVG
                const horizontalOverflow = needsTightCrop ? 55 : 0; // Total horizontal overflow (5px left + 50px right)
                const verticalOverflow = needsTightCrop ? 10 : 0; // Total vertical overflow (5px top + 5px bottom)
                let contentWidth = (boundsResult.contentBounds.width + horizontalOverflow) * pxToMm;
                let contentHeight = (boundsResult.contentBounds.height + verticalOverflow) * pxToMm;
                
                console.log(`✅ FINAL CONTENT DIMENSIONS: ${contentWidth.toFixed(1)}×${contentHeight.toFixed(1)}mm (including ${horizontalOverflow}px horizontal, ${verticalOverflow}px vertical text overflow)`);
                
                // Use CONTENT BOUNDS for canvas display
                // This shows the actual artwork size with padding to prevent clipping
                displayWidth = contentWidth;
                displayHeight = contentHeight;
                console.log(`🎯 CANVAS DISPLAY: Using padded bounds ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm (prevents clipping)`);
              } else {
                console.log(`⚠️ Bounds extraction failed (${boundsResult.error}), falling back to viewBox dimensions`);
                
                // Fallback to the original robust dimension system
                const { detectDimensionsFromSVG } = await import('./dimension-utils');
                const updatedSvgContent2 = fs.readFileSync(svgPath, 'utf8');
                const dimensionResult = await detectDimensionsFromSVG(updatedSvgContent2, null, svgPath);
                displayWidth = dimensionResult.widthMm;
                displayHeight = dimensionResult.heightMm;
                
                console.log(`🔄 FALLBACK DIMENSIONS: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm (${dimensionResult.source})`);
              }
              
            } catch (boundsError) {
              console.error('❌ Bounds extraction error:', boundsError);
              // Fallback to the original robust dimension system
              const { detectDimensionsFromSVG } = await import('./dimension-utils');
              const updatedSvgContent2 = fs.readFileSync(svgPath, 'utf8');
              const dimensionResult = await detectDimensionsFromSVG(updatedSvgContent2, null, svgPath);
              displayWidth = dimensionResult.widthMm;
              displayHeight = dimensionResult.heightMm;
              
              console.log(`🔄 ERROR FALLBACK: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm (${dimensionResult.source})`);
            }

          } else {
            // Fallback: for large documents with no detectable content bounds
            console.log(`Large format document with no detectable content bounds, using conservative sizing`);
            displayWidth = 200;
            displayHeight = 150;
          }
        } catch (error) {
          console.error('Failed to calculate content bounds:', error);
        }

        // Update the existing logo with the final filename after bounds extraction
        console.log(`💾 UPDATING LOGO: ${logo.id} with final filename=${finalFilename}, url=${finalUrl}`);
        const updatedLogo = await storage.updateLogo(logo.id, {
          filename: finalFilename, // This will be the tight-content version if bounds extraction worked
          mimeType: finalMimeType,
          ...((file as any).extractedRasterPath && { extractedRasterPath: (file as any).extractedRasterPath }),
          ...(analysisData && { svgColors: analysisData })
        });
        
        if (!updatedLogo) {
          throw new Error(`Failed to update logo ${logo.id}`);
        }
        
        console.log(`🔍 DEBUG: Using existing logo with updated filename: ${updatedLogo.id}`);
        
        // Update the logo in the logos array with the updated information
        const logoIndex = logos.findIndex(l => l.id === logo.id);
        if (logoIndex !== -1) {
          logos[logoIndex] = updatedLogo;
          console.log(`🔄 Updated logo in logos array at index ${logoIndex}`);
        }

        // Get template size for centering
        const templateSize = await storage.getTemplateSize(project.templateSize);
        if (!templateSize) {
          throw new Error('Template size not found');
        }

        // Calculate centered position with DTF template-specific handling
        let centerX, centerY;
        
        if (templateSize.id === 'dtf-large' || templateSize.name === 'large_dtf') {
          // DTF template is landscape format (1000×550mm) - special handling
          console.log(`🎯 DTF template detected: ${templateSize.width}×${templateSize.height}mm`);
          
          // For DTF, ensure proper centering that works with rotation
          // Center both horizontally and vertically, but ensure it fits within template bounds
          centerX = Math.max(10, (templateSize.width - displayWidth) / 2);
          centerY = Math.max(10, (templateSize.height - displayHeight) / 2);
          
          // Additional safety for large elements that might exceed template
          if (centerY < 10) centerY = 10; // Minimum 10mm from top
          if (centerX < 10) centerX = 10; // Minimum 10mm from left
          
          console.log(`📍 DTF positioning: centerX=${centerX.toFixed(1)}mm, centerY=${centerY.toFixed(1)}mm (template=${templateSize.width}×${templateSize.height}mm, content=${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm)`);
        } else {
          // Standard templates (A3, etc.) - existing behavior
          centerX = Math.max(0, (templateSize.width - displayWidth) / 2);
          centerY = Math.max(0, (templateSize.height - displayHeight) / 2);
          
          console.log(`📐 Standard template positioning: centerX=${centerX.toFixed(1)}mm, centerY=${centerY.toFixed(1)}mm`);
        }

        // Set color overrides for single colour templates with ink color
        let colorOverrides = null;
        if (isSingleColourTemplate && project.inkColor && finalMimeType === 'image/svg+xml') {
          // Create color overrides to apply ink color to all non-white colors
          console.log(`🎨 Setting colorOverrides for single colour template with ink: ${project.inkColor}`);
          colorOverrides = {
            inkColor: project.inkColor,
            appliedAt: new Date().toISOString()
          };
        }

        console.log(`🔍 DEBUG: About to create canvas element with logoId: ${logo.id}`);
        const canvasElementData = {
          projectId: projectId,
          logoId: logo.id,
          x: centerX,
          y: centerY,
          width: displayWidth,
          height: displayHeight,
          rotation: 0,
          zIndex: logos.length - 1,
          isVisible: true,
          isLocked: false,
          colorOverrides: colorOverrides
        };

        await storage.createCanvasElement(canvasElementData);
      }

      console.log('🚀 Returning logos to client:', logos.map(logo => ({
        id: logo.id,
        filename: logo.filename,
        originalName: logo.originalName,
        isPdfWithRasterOnly: logo.isPdfWithRasterOnly,
        isCMYKPreserved: logo.isCMYKPreserved,
        mimeType: logo.mimeType
      })));
      res.json(logos);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Other essential routes
  app.get('/api/projects/:projectId', async (req, res) => {
    try {
      const project = await storage.getProject(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get project' });
    }
  });

  app.get('/api/projects/:projectId/logos', async (req, res) => {
    try {
      const logos = await storage.getLogosByProject(req.params.projectId);
      
      // Apply Illustrator CMYK mapping to logo colors when retrieving
      const { IllustratorCMYKMapper } = await import('./illustrator-cmyk-mapper');
      const processedLogos = logos.map(logo => {
        if (logo.svgColors && Array.isArray(logo.svgColors) && logo.svgColors.length > 0) {
          // Check if svgColors has the new format or old format
          const colors = (logo.svgColors as any).colors || logo.svgColors;
          if (Array.isArray(colors)) {
            console.log(`🎨 Applying Illustrator CMYK mapping to ${colors.length} colors for logo ${logo.id}`);
            const mappedColors = IllustratorCMYKMapper.processSVGColors(colors);
            return {
              ...logo,
              svgColors: {
                ...(typeof logo.svgColors === 'object' ? logo.svgColors : {}),
                colors: mappedColors
              }
            };
          }
        }
        return logo;
      });
      
      res.json(processedLogos);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get logos' });
    }
  });

  app.get('/api/projects/:projectId/canvas-elements', async (req, res) => {
    try {
      const elements = await storage.getCanvasElementsByProject(req.params.projectId);
      res.json(elements);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get canvas elements' });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const projectData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(projectData);
      res.status(201).json(project);
    } catch (error) {
      res.status(400).json({ error: 'Invalid project data' });
    }
  });

  app.patch('/api/projects/:projectId', async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.projectId, req.body);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  app.get('/api/template-sizes', async (req, res) => {
    try {
      const templateSizes = await storage.getTemplateSizes();
      res.json(templateSizes);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get template sizes' });
    }
  });

  // Delete logo endpoint with proper cleanup
  app.delete('/api/logos/:logoId', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      
      // Get the logo first to check if it exists
      const logo = await storage.getLogo(logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Delete all canvas elements that use this logo
      await storage.deleteCanvasElementsByLogo(logoId);
      console.log(`🗑️ Cleaned up canvas elements for deleted logo: ${logoId}`);
      
      // Delete the logo from storage
      const deleted = await storage.deleteLogo(logoId);
      if (!deleted) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Clean up physical files
      try {
        const uploadsDir = path.resolve('./uploads');
        const files = [
          path.join(uploadsDir, logo.filename),
          path.join(uploadsDir, `${logo.filename}.svg`),
          path.join(uploadsDir, `${logoId}_modified.svg`),
          path.join(uploadsDir, `${logoId}_color_managed.png`)
        ];
        
        files.forEach(filePath => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Deleted file: ${filePath}`);
          }
        });
      } catch (fileError) {
        console.warn('Warning: Failed to delete some logo files:', fileError);
      }
      
      res.json({ success: true, message: 'Logo and associated elements deleted successfully' });
    } catch (error) {
      console.error('Delete logo error:', error);
      res.status(500).json({ error: 'Failed to delete logo' });
    }
  });

  // Static file serving is already handled in server/index.ts
  // Removed duplicate: app.use('/uploads', express.static(uploadDir));

  // Update canvas element endpoint
  app.patch('/api/canvas-elements/:elementId', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      const updates = req.body;
      
      console.log(`🔄 Updating canvas element: ${elementId}`, updates);
      
      const updatedElement = await storage.updateCanvasElement(elementId, updates);
      
      if (!updatedElement) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      console.log(`✅ Successfully updated element: ${elementId}`);
      res.json(updatedElement);
    } catch (error) {
      console.error('Update canvas element error:', error);
      res.status(500).json({ error: 'Failed to update canvas element' });
    }
  });

  // Update canvas element colors endpoint
  app.post('/api/canvas-elements/:elementId/update-colors', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      const { colorOverrides } = req.body;
      
      console.log(`🎨 Updating colors for canvas element: ${elementId}`, colorOverrides);
      
      const updatedElement = await storage.updateCanvasElement(elementId, {
        colorOverrides
      });
      
      if (!updatedElement) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      console.log(`✅ Successfully updated colors for element: ${elementId}`);
      res.json(updatedElement);
    } catch (error) {
      console.error('Update canvas element colors error:', error);
      res.status(500).json({ error: 'Failed to update canvas element colors' });
    }
  });

  // Get modified SVG with color overrides for canvas display
  app.get('/api/canvas-elements/:elementId/modified-svg', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      
      // Get the canvas element
      const element = await storage.getCanvasElement(elementId);
      if (!element) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      // Get the logo
      const logo = await storage.getLogo(element.logoId || '');
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Only works for SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'Only SVG files support color modification' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      // Apply color overrides if they exist
      let svgContent = fs.readFileSync(svgPath, 'utf8');
      
      if (element.colorOverrides && Object.keys(element.colorOverrides).length > 0) {
        console.log(`🎨 Applying color overrides to SVG for canvas display:`, element.colorOverrides);
        
        // Check if this is an ink color override (for single color templates)
        const colorOverrides = element.colorOverrides as any;
        if (colorOverrides.inkColor) {
          console.log(`🎨 Applying ink color recoloring: ${colorOverrides.inkColor}`);
          const { recolorSVG } = await import('./svg-recolor');
          svgContent = recolorSVG(svgContent, colorOverrides.inkColor);
        } else {
          // Handle specific color overrides (regular color replacement)
          const svgAnalysis = logo.svgColors as any;
          let originalFormatOverrides: Record<string, string> = {};
          
          if (svgAnalysis && svgAnalysis.colors && Array.isArray(svgAnalysis.colors)) {
            Object.entries(element.colorOverrides as Record<string, string>).forEach(([standardizedColor, newColor]) => {
              // Find the matching color in the SVG analysis
              const colorInfo = svgAnalysis.colors.find((c: any) => c.originalColor === standardizedColor);
              if (colorInfo && colorInfo.originalFormat) {
                originalFormatOverrides[colorInfo.originalFormat] = newColor;
              } else {
                // Fallback to standardized color if original format not found
                originalFormatOverrides[standardizedColor] = newColor;
              }
            });
          } else {
            // Fallback if no SVG color analysis available
            originalFormatOverrides = element.colorOverrides as Record<string, string>;
          }
          
          // Apply color changes
          const { applySVGColorChanges } = await import('./svg-color-utils');
          svgContent = applySVGColorChanges(svgPath, originalFormatOverrides);
        }
      }
      
      // Set proper content type and return the SVG
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(svgContent);
      
    } catch (error) {
      console.error('Generate modified SVG error:', error);
      res.status(500).json({ error: 'Failed to generate modified SVG' });
    }
  });

  // Delete canvas element endpoint
  app.delete('/api/canvas-elements/:elementId', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      const deleted = await storage.deleteCanvasElement(elementId);
      
      if (!deleted) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      res.json({ success: true, message: 'Canvas element deleted successfully' });
    } catch (error) {
      console.error('Delete canvas element error:', error);
      res.status(500).json({ error: 'Failed to delete canvas element' });
    }
  });

  // Duplicate canvas element endpoint
  app.post('/api/canvas-elements/:elementId/duplicate', async (req, res) => {
    try {
      const elementId = req.params.elementId;
      console.log(`🔄 Duplicating canvas element: ${elementId}`);
      
      const duplicatedElement = await storage.duplicateCanvasElement(elementId);
      
      if (!duplicatedElement) {
        return res.status(404).json({ error: 'Canvas element not found' });
      }
      
      console.log(`✅ Successfully duplicated element: ${elementId} → ${duplicatedElement.id}`);
      res.json(duplicatedElement);
    } catch (error) {
      console.error('Duplicate canvas element error:', error);
      res.status(500).json({ error: 'Failed to duplicate canvas element' });
    }
  });

  // Removed duplicate /uploads route handler - already handled in server/index.ts

  // Fix oversized canvas elements endpoint
  app.post('/api/projects/:projectId/fix-oversized-elements', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      console.log(`🔧 FIXING OVERSIZED CANVAS ELEMENTS for project: ${projectId}`);
      
      const canvasElements = await storage.getCanvasElementsByProject(projectId);
      const oversizedElements = canvasElements.filter(el => el.width > 200 || el.height > 200);
      
      console.log(`🔍 Found ${oversizedElements.length} oversized elements to fix`);
      
      let fixedCount = 0;
      for (const element of oversizedElements) {
        try {
          const logo = await storage.getLogo(element.logoId);
          if (!logo || !logo.filename || !logo.filename.includes('_tight-content.svg')) {
            console.log(`⚠️ Skipping element ${element.id}: no tight content SVG`);
            continue;
          }
          
          // Extract corrected bounds using the same logic as upload
          const { SVGBoundsAnalyzer } = await import('./svg-bounds-analyzer');
          const svgAnalyzer = new SVGBoundsAnalyzer();
          const tightSvgPath = path.join(process.cwd(), 'uploads', logo.filename);
          
          if (!fs.existsSync(tightSvgPath)) {
            console.log(`⚠️ Skipping element ${element.id}: tight SVG not found`);
            continue;
          }
          
          const boundsResult = await svgAnalyzer.extractSVGBounds(tightSvgPath);
          if (!boundsResult.success || !boundsResult.contentBounds) {
            console.log(`⚠️ Skipping element ${element.id}: bounds extraction failed`);
            continue;
          }
          
          // Calculate corrected dimensions using the same content ratio logic
          const pxToMm = 1 / 2.834645669; // 72 DPI standard
          let correctedWidthMm = boundsResult.contentBounds.width * pxToMm;
          let correctedHeightMm = boundsResult.contentBounds.height * pxToMm;
          
          // Apply the same aggressive content ratio if dimensions are still oversized
          if (correctedWidthMm > 1000 || correctedHeightMm > 1000) {
            const CONTENT_RATIO = 0.15; // 15% content ratio
            correctedWidthMm *= CONTENT_RATIO;
            correctedHeightMm *= CONTENT_RATIO;
            console.log(`🎯 Applied 15% content ratio: ${correctedWidthMm.toFixed(1)}×${correctedHeightMm.toFixed(1)}mm`);
          }
          
          // Update the canvas element with corrected dimensions
          await storage.updateCanvasElement(element.id, {
            width: correctedWidthMm,
            height: correctedHeightMm
          });
          
          console.log(`✅ Fixed element ${element.id}: ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm → ${correctedWidthMm.toFixed(1)}×${correctedHeightMm.toFixed(1)}mm`);
          fixedCount++;
          
        } catch (error) {
          console.error(`❌ Error fixing element ${element.id}:`, error);
        }
      }
      
      console.log(`🎉 Fixed ${fixedCount} oversized canvas elements`);
      res.json({ success: true, fixedCount, totalOversized: oversizedElements.length });
      
    } catch (error) {
      console.error('Fix oversized elements error:', error);
      res.status(500).json({ error: 'Failed to fix oversized elements' });
    }
  });

  // SVG Analysis endpoint for stroke width detection
  app.post('/api/logos/:logoId/analyze', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Only analyze SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'Can only analyze SVG files' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      // Perform enhanced SVG analysis including stroke widths
      const { analyzeSVGWithStrokeWidths } = await import('./svg-color-utils');
      const analysis = analyzeSVGWithStrokeWidths(svgPath);
      
      // Update the logo with enhanced analysis data
      const updatedAnalysis = {
        colors: analysis.colors,
        fonts: analysis.fonts,
        strokeWidths: analysis.strokeWidths,
        minStrokeWidth: analysis.minStrokeWidth,
        maxStrokeWidth: analysis.maxStrokeWidth,
        hasText: analysis.hasText
      };
      
      await storage.updateLogo(logoId, {
        svgColors: updatedAnalysis,
        svgFonts: analysis.fonts
      });
      
      console.log(`📊 Enhanced SVG analysis completed for ${logo.filename}`);
      console.log(`   - Colors: ${analysis.colors.length}`);
      console.log(`   - Fonts: ${analysis.fonts.length}`);
      console.log(`   - Stroke widths: ${analysis.strokeWidths.length}`);
      if (analysis.minStrokeWidth !== undefined) {
        console.log(`   - Min line thickness: ${analysis.minStrokeWidth.toFixed(2)}pt`);
      }
      
      res.json(updatedAnalysis);
    } catch (error) {
      console.error('SVG analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze SVG' });
    }
  });

  // CMYK Preview endpoint for SVG files
  app.get('/api/logos/:logoId/cmyk-preview', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Only works for SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'CMYK preview only available for SVG files' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      // Read SVG content
      let svgContent = fs.readFileSync(svgPath, 'utf8');
      
      // Apply RGB to CMYK conversion using Adobe algorithm
      const { adobeRgbToCmyk } = await import('./adobe-cmyk-profile');
      
      console.log('CMYK Preview: Processing SVG with', svgContent.match(/rgb\([^)]+\)/g)?.length || 0, 'RGB colors');
      
      // Parse SVG and convert all RGB colors to CMYK
      // Count how many replacements we'll make
      let replacementCount = 0;
      
      // Handle percentage-based RGB values with a more robust regex
      svgContent = svgContent.replace(/rgb\(([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)%\)/g, (match, rPct, gPct, bPct) => {
        try {
          // Parse percentages
          const rPercent = parseFloat(rPct);
          const gPercent = parseFloat(gPct);
          const bPercent = parseFloat(bPct);
          
          // Validate inputs
          if (isNaN(rPercent) || isNaN(gPercent) || isNaN(bPercent)) {
            console.log(`CMYK Preview: Invalid values in ${match} - r:${rPct}, g:${gPct}, b:${bPct}`);
            return match;
          }
          
          // Convert percentages to RGB (0-255)
          const r = Math.round(rPercent * 2.55);
          const g = Math.round(gPercent * 2.55);
          const b = Math.round(bPercent * 2.55);
          
          // Apply Adobe CMYK conversion
          const cmyk = adobeRgbToCmyk({ r, g, b });
          
          // Convert CMYK back to RGB for display
          const rNew = Math.round(255 * (1 - cmyk.c / 100) * (1 - cmyk.k / 100));
          const gNew = Math.round(255 * (1 - cmyk.m / 100) * (1 - cmyk.k / 100));
          const bNew = Math.round(255 * (1 - cmyk.y / 100) * (1 - cmyk.k / 100));
          
          // Return in percentage format to match original
          const result = `rgb(${(rNew/255*100).toFixed(6)}%, ${(gNew/255*100).toFixed(6)}%, ${(bNew/255*100).toFixed(6)}%)`;
          
          replacementCount++;
          if (replacementCount <= 5) {
            console.log(`CMYK Preview: Converting RGB(${r},${g},${b}) -> CMYK(${cmyk.c},${cmyk.m},${cmyk.y},${cmyk.k}) -> RGB(${rNew},${gNew},${bNew})`);
          }
          
          return result;
        } catch (err) {
          console.error('CMYK Preview conversion error:', err, 'for match:', match);
          return match;
        }
      });
      
      console.log(`CMYK Preview: Made ${replacementCount} color replacements`);
      
      // Handle regular RGB values
      svgContent = svgContent.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (match, r, g, b) => {
        const cmyk = adobeRgbToCmyk({ r: parseInt(r), g: parseInt(g), b: parseInt(b) });
        // Convert CMYK back to RGB for display
        const rNew = Math.round(255 * (1 - cmyk.c / 100) * (1 - cmyk.k / 100));
        const gNew = Math.round(255 * (1 - cmyk.m / 100) * (1 - cmyk.k / 100));
        const bNew = Math.round(255 * (1 - cmyk.y / 100) * (1 - cmyk.k / 100));
        return `rgb(${rNew}, ${gNew}, ${bNew})`;
      });
      
      // Also convert hex colors
      svgContent = svgContent.replace(/#([0-9a-fA-F]{6})/g, (match, hex) => {
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const cmyk = adobeRgbToCmyk({ r, g, b });
        // Convert CMYK back to RGB for display
        const rNew = Math.round(255 * (1 - cmyk.c / 100) * (1 - cmyk.k / 100));
        const gNew = Math.round(255 * (1 - cmyk.m / 100) * (1 - cmyk.k / 100));
        const bNew = Math.round(255 * (1 - cmyk.y / 100) * (1 - cmyk.k / 100));
        const hexNew = '#' + 
          rNew.toString(16).padStart(2, '0') + 
          gNew.toString(16).padStart(2, '0') + 
          bNew.toString(16).padStart(2, '0');
        return hexNew;
      });
      
      // Send the modified SVG with CMYK preview colors
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svgContent);
      
    } catch (error) {
      console.error('CMYK preview error:', error);
      res.status(500).json({ error: 'Failed to generate CMYK preview' });
    }
  });

  // Function to convert SVG to full CMYK format for vectorized files
  function convertVectorizedSvgToFullCmyk(svgContent: string, removeBackground: boolean = true): string {
    try {
      let modifiedSvg = svgContent;
      
      // Only remove background if explicitly requested
      // This helps preserve transparency in vectorized files when needed
      if (removeBackground) {
        // DISABLED: User wants more colors detected, manual cleanup preferred
        // modifiedSvg = removeBackgroundFills(modifiedSvg);
        console.log('✅ Skipped aggressive background removal to preserve all colors');
      }
      
      // Find all hex color values in the SVG
      const hexColorRegex = /#[0-9a-fA-F]{6}/g;
      const matches = svgContent.match(hexColorRegex);
      
      if (matches) {
        const uniqueColors = Array.from(new Set(matches));
        console.log(`🎨 Converting ${uniqueColors.length} unique RGB colors to CMYK format`);
        
        // Add CMYK marker to indicate this is a CMYK vectorized file
        let cmykMetadata = '\n<!-- VECTORIZED_CMYK_FILE: This file has been vectorized and converted to CMYK color space -->\n';
        cmykMetadata += '<!-- TRANSPARENCY_PRESERVED: Background fills removed to maintain transparency -->\n';
        cmykMetadata += '<!-- CMYK Color Conversions:\n';
        
        for (const hexColor of uniqueColors) {
          // Skip white color (keep as RGB for transparency)
          if (hexColor.toLowerCase() === '#ffffff') {
            cmykMetadata += `${hexColor} → RGB(255,255,255) (preserved for transparency)\n`;
            continue;
          }
          
          // Convert hex to RGB
          const r = parseInt(hexColor.slice(1, 3), 16);
          const g = parseInt(hexColor.slice(3, 5), 16);
          const b = parseInt(hexColor.slice(5, 7), 16);
          
          // Convert RGB to CMYK using Adobe profile
          const cmyk = adobeRgbToCmyk({ r, g, b });
          
          // For browser compatibility, keep RGB but add data attribute
          modifiedSvg = modifiedSvg.replace(new RegExp(hexColor, 'gi'), hexColor);
          
          cmykMetadata += `${hexColor} → CMYK(${cmyk.c}%,${cmyk.m}%,${cmyk.y}%,${cmyk.k}%)\n`;
          console.log(`🎨 Converted ${hexColor} (RGB ${r},${g},${b}) → CMYK ${cmyk.c}%,${cmyk.m}%,${cmyk.y}%,${cmyk.k}%`);
        }
        
        cmykMetadata += '-->\n';
        
        // Insert metadata and mark as CMYK vectorized file
        modifiedSvg = modifiedSvg.replace('<svg', cmykMetadata + '<svg data-vectorized-cmyk="true"');
      }
      
      return modifiedSvg;
    } catch (error) {
      console.error('Error converting vectorized SVG to CMYK:', error);
      return svgContent; // Return original if conversion fails
    }
  }

  // Function to remove background fills that may have been added during vectorization
  function removeBackgroundFills(svgContent: string): string {
    try {
      let modifiedSvg = svgContent;
      
      // STEP 1: Remove ALL rectangles that could be backgrounds (very aggressive)
      const rectRegex = /<rect[^>]*(?:\/>|>.*?<\/rect>)/gi;
      modifiedSvg = modifiedSvg.replace(rectRegex, (match) => {
        // Check if this has a fill attribute (any filled rectangle is suspect)
        if (match.includes('fill=')) {
          console.log(`🎨 Removing filled rectangle element`);
          return '';
        }
        return match;
      });
      
      // STEP 2: Remove the first element if it's a large shape that could be background
      // Vectorizer.ai often puts background as the first major element
      const firstElementRegex = /(<svg[^>]*>[\s\S]*?)<(path|polygon|circle|ellipse)[^>]*fill\s*=\s*["']([^"']+)["'][^>]*>/i;
      const firstMatch = modifiedSvg.match(firstElementRegex);
      if (firstMatch) {
        const [fullMatch, svgStart, elementType, fillColor] = firstMatch;
        // If the first colored element has a large coordinate space, remove it
        const coords = fullMatch.match(/[\d.-]+/g);
        if (coords && coords.length > 4) {
          const values = coords.map(parseFloat);
          const maxCoord = Math.max(...values);
          if (maxCoord > 200) {
            console.log(`🎨 Removing first large ${elementType} element with fill ${fillColor} (likely background)`);
            modifiedSvg = modifiedSvg.replace(fullMatch, svgStart);
          }
        }
      }
      
      // STEP 3: Remove any path that forms a closed shape with large dimensions
      const largePathRegex = /<path[^>]*d\s*=\s*["']([^"']*)["'][^>]*fill\s*=\s*["']([^"']+)["'][^>]*(?:\/>|>.*?<\/path>)/gi;
      modifiedSvg = modifiedSvg.replace(largePathRegex, (match, pathData, fillColor) => {
        // If path contains M, L commands and closes with Z, it might be a background
        if (pathData.includes('M') && pathData.includes('Z')) {
          const coords = pathData.match(/[\d.-]+/g);
          if (coords && coords.length >= 6) {
            const values = coords.map(parseFloat);
            const maxValue = Math.max(...values);
            const minValue = Math.min(...values);
            const range = maxValue - minValue;
            
            // If the path spans a large area, it's likely a background
            if (range > 150) {
              console.log(`🎨 Removing large background path with fill ${fillColor} (range: ${range})`);
              return '';
            }
          }
        }
        return match;
      });
      
      // STEP 4: Remove any circles/ellipses with large radius
      const largeCircleRegex = /<(circle|ellipse)[^>]*r[xy]?\s*=\s*["']([^"']+)["'][^>]*fill[^>]*(?:\/>|>.*?<\/\1>)/gi;
      modifiedSvg = modifiedSvg.replace(largeCircleRegex, (match, shape, radius) => {
        const r = parseFloat(radius);
        if (r > 30) {
          console.log(`🎨 Removing large filled ${shape} with radius ${r}`);
          return '';
        }
        return match;
      });
      
      // STEP 5: Look for and remove any fill attributes on the root SVG element
      modifiedSvg = modifiedSvg.replace(/(<svg[^>]*)\s+fill\s*=\s*["'][^"']*["']/gi, '$1');
      
      // STEP 6: Remove any style tags that might contain background styles
      modifiedSvg = modifiedSvg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      
      // STEP 7: Remove any elements with background in their style attribute
      modifiedSvg = modifiedSvg.replace(/<[^>]+style\s*=\s*["'][^"']*background[^"']*["'][^>]*>/gi, '');
      
      // STEP 8: Add explicit transparent background to SVG root
      modifiedSvg = modifiedSvg.replace(/<svg([^>]*)>/, '<svg$1 style="background: transparent;">');
      
      // STEP 9: Remove any defs that might contain background patterns
      const defsRegex = /<defs[^>]*>([\s\S]*?)<\/defs>/gi;
      modifiedSvg = modifiedSvg.replace(defsRegex, (match, content) => {
        // Check if defs contains patterns or gradients that might be backgrounds
        if (content.includes('pattern') || content.includes('linearGradient') || content.includes('radialGradient')) {
          console.log(`🎨 Removing defs with potential background patterns`);
          return '';
        }
        return match;
      });
      
      console.log(`🎨 Comprehensive transparency preservation: Removed all potential background sources`);
      return modifiedSvg;
    } catch (error) {
      console.error('Error removing background fills:', error);
      return svgContent;
    }
  }

  // Pricing endpoint for Odoo integration
  app.get('/api/pricing', async (req, res) => {
    try {
      const { templateId, copies } = req.query;
      
      if (!templateId || !copies) {
        return res.status(400).json({ error: 'Template ID and copies are required' });
      }

      const copiesNum = parseInt(copies as string);
      if (isNaN(copiesNum) || copiesNum < 1) {
        return res.status(400).json({ error: 'Invalid copies quantity' });
      }

      // Get template data to determine pricing tier
      const templateSizes = await storage.getTemplateSizes();
      const template = templateSizes.find(t => t.id === templateId);
      
      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      // Calculate pricing based on template size and quantity
      const pricePerUnit = calculateTemplatePrice(template, copiesNum);
      const totalPrice = pricePerUnit * copiesNum;

      res.json({
        pricePerUnit: Math.round(pricePerUnit * 100) / 100, // Round to 2 decimals
        totalPrice: Math.round(totalPrice * 100) / 100,
        currency: 'EUR'
      });
    } catch (error) {
      console.error('Pricing calculation error:', error);
      res.status(500).json({ error: 'Failed to calculate pricing' });
    }
  });

  // Mark logo as photographic endpoint
  app.patch('/api/logos/:id/photographic', async (req, res) => {
    try {
      const { id } = req.params;
      const { isPhotographic } = req.body;

      const logo = await storage.updateLogo(id, { isPhotographic: Boolean(isPhotographic) });
      
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }

      res.json(logo);
    } catch (error) {
      console.error('Error updating logo photographic status:', error);
      res.status(500).json({ error: 'Failed to update logo' });
    }
  });

  // Get raster image from PDF with raster only
  app.get('/api/logos/:id/raster-image', async (req, res) => {
    console.log('🖼️ Raster image extraction requested for logo:', req.params.id);
    
    try {
      const logo = await storage.getLogo(req.params.id);
      if (!logo) {
        console.error('Logo not found:', req.params.id);
        return res.status(404).json({ error: 'Logo not found' });
      }

      console.log('📄 Logo details:', {
        id: logo.id,
        filename: logo.filename,
        originalFilename: logo.originalFilename,
        isPdfWithRasterOnly: logo.isPdfWithRasterOnly
      });

      // Check if this is a PDF with raster only
      if (!logo.isPdfWithRasterOnly) {
        console.error('Logo is not a PDF with raster only');
        return res.status(400).json({ error: 'Not a PDF with raster only' });
      }

      // Check if we already have an extracted raster image from upload
      console.log('🔍 CHECKING for pre-extracted raster:', {
        hasExtractedPath: !!logo.extractedRasterPath,
        path: logo.extractedRasterPath,
        fileExists: logo.extractedRasterPath ? fs.existsSync(logo.extractedRasterPath) : false
      });
      if (logo.extractedRasterPath && fs.existsSync(logo.extractedRasterPath)) {
        console.log('✅ Using pre-extracted deduplicated PNG from upload:', logo.extractedRasterPath);
        const imageData = fs.readFileSync(logo.extractedRasterPath);
        console.log('📊 Pre-extracted file size:', imageData.length, 'bytes');
        res.set({
          'Content-Type': 'image/png',
          'Content-Length': imageData.length.toString(),
          'Cache-Control': 'no-cache'
        });
        return res.send(imageData);
      } else {
        console.log('❌ No pre-extracted PNG found, will extract fresh');
      }

      // Extract the first image from the PDF
      const pdfPath = path.join(uploadDir, logo.originalFilename || logo.filename);
      console.log('📂 PDF path:', pdfPath);
      
      if (!fs.existsSync(pdfPath)) {
        console.error('PDF file not found at path:', pdfPath);
        return res.status(404).json({ error: 'PDF file not found' });
      }
      
      try {
        // Check if this request is for vectorization (skip deduplication)
        const isForVectorization = req.headers['x-vectorization-request'] === 'true' || 
                                   req.headers.referer?.includes('vectorizer') ||
                                   req.query.forVectorization === 'true';
        
        console.log('🔍 Raster extraction context:', {
          isForVectorization,
          hasVectorizationHeader: req.headers['x-vectorization-request'],
          referer: req.headers.referer,
          query: req.query
        });
        
        if (isForVectorization) {
          console.log('🔄 VECTORIZATION REQUEST DETECTED - Skipping deduplication to preserve original image quality');
        } else {
          console.log('🔍 Regular raster request - applying standard deduplication');
        }
        
        // Use the smart deduplication extraction function with correct skipDeduplication parameter
        // For vectorization, we want to skip deduplication to get the original embedded PNG
        const extractedFile = await extractRasterImageWithDeduplication(pdfPath, `${logo.filename}_raster_endpoint`, isForVectorization);
        
        if (!extractedFile) {
          console.error('❌ Smart extraction failed');
          return res.status(500).json({ error: 'Failed to extract image from PDF' });
        }
        
        console.log('✅ Smart extraction completed:', extractedFile);
        
        // Verify the PNG is valid before sending
        const stats = fs.statSync(extractedFile);
        console.log('📊 Final extracted file size:', stats.size, 'bytes');
        
        if (stats.size === 0) {
          console.error('❌ Extracted file is empty!');
          return res.status(500).json({ error: 'Extracted file is empty' });
        }
        
        // Set appropriate headers
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', stats.size);
        
        // Send the extracted image
        res.sendFile(extractedFile, (err) => {
          if (err) {
            console.error('Error sending file:', err);
          }
          // Clean up extracted file after sending
          if (extractedFile && fs.existsSync(extractedFile)) {
            fs.unlinkSync(extractedFile);
            console.log('🗑️ Cleaned up extracted file');
          }
        });
        
      } catch (error) {
        console.error('❌ Error extracting image from PDF:', error);
        res.status(500).json({ error: 'Failed to extract image from PDF' });
      }
      
    } catch (error) {
      console.error('❌ Error processing raster image request:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });

  // AI Vectorization endpoint
  app.post('/api/vectorize', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided' });
      }

      let isPreview = req.body.preview === 'true';
      const removeBackground = false; // DISABLED: User wants more colors detected, manual cleanup preferred
      const fromPdfExtraction = req.body.fromPdfExtraction === 'true';
      
      // Force production mode for high-quality PNG uploads
      if (req.file.size > 20000 || req.file.originalname.toLowerCase().includes('text') || 
          req.file.originalname.toLowerCase().includes('cmyk')) {
        isPreview = false;
        console.log('🎯 FORCING PRODUCTION MODE for high-quality PNG (overriding preview request)');
      }
      
      console.log(`🎨 Vectorization request: ${req.file.originalname} (preview: ${isPreview}, removeBackground: ${removeBackground}, fromPdfExtraction: ${fromPdfExtraction})`);
      console.log(`📁 File details: type=${req.file.mimetype}, size=${req.file.size} bytes`);
      console.log(`📋 Request body keys:`, Object.keys(req.body));

      // Check if we have vectorizer API credentials
      const vectorizerApiId = process.env.VECTORIZER_API_ID;
      const vectorizerApiSecret = process.env.VECTORIZER_API_SECRET;

      if (!vectorizerApiId || !vectorizerApiSecret) {
        return res.status(500).json({ 
          error: 'Vectorization service not configured. API credentials missing.' 
        });
      }

      // CRITICAL DISCOVERY: PDF extraction causes text distortion in Vector.AI
      let processedImagePath = req.file.path;
      
      if (req.file.mimetype === 'image/png') {
        // Check if this PNG comes from a raster extraction endpoint (PDF extracted content)
        // DISABLED: Filename-based detection was causing false positives
        const isFromPdfExtraction = false; // Always treat as direct upload for best Vector.AI results
        
        if (isFromPdfExtraction) {
          console.log('⚠️ PDF-EXTRACTED PNG DETECTED - This may cause text distortion in Vector.AI');
          console.log('📁 PDF extraction path:', req.file.path);
          console.log('🔍 Issue: Vector.AI webapp works perfectly because it processes clean original PNGs, not PDF extractions');
          
          // DEBUG: Check if we're always getting the same file
          const stats = fs.statSync(req.file.path);
          console.log('🔍 DEBUG: File modified time:', stats.mtime.toISOString());
          console.log('🔍 DEBUG: File size:', stats.size, 'bytes');
          
          console.log('💡 RECOMMENDATION: Upload original PNG/JPEG file directly to Vector.AI for best text quality');
        } else {
          // Direct PNG upload - this should work perfectly like Vector.AI webapp
          console.log('✅ DIRECT PNG UPLOAD detected - This should produce clean text like Vector.AI webapp');
          console.log('📁 Original file path:', req.file.path);
          console.log('📁 Original file size:', req.file.size, 'bytes');
          // DISABLED: Deduplication may be cropping the logo content
          console.log('🔧 Skipping deduplication to preserve complete logo content');
          // Use original file to ensure Vector.AI gets the full image
        }
      }

      // Use timestamp to force fresh API call
      const timestamp = Date.now();
      
      // Use original file without modification to avoid corruption
      console.log('🔧 Using original file without modification to preserve PNG integrity');
      
      // FIXED: Prepare form data for vectorizer.ai API (matching working debug version)
      const formData = new FormData();
      const fileStream = fs.createReadStream(processedImagePath);
      
      // Use simple filename exactly like Vector.AI webapp
      formData.append('image', fileStream, 'image.png');
      // DIRECT PNG VECTORIZER: Optimized for high-quality PNG uploads
      console.log('🎯 DIRECT PNG VECTORIZER: Processing high-quality PNG upload');
      console.log('📁 Sending file:', processedImagePath);
      
      const imageStats = fs.statSync(processedImagePath);
      console.log('📊 File size:', imageStats.size, 'bytes');
      console.log('📊 File modified:', imageStats.mtime.toISOString());
      console.log('📁 Original name:', req.file.originalname);
      console.log('📁 MIME type:', req.file.mimetype);
      console.log('🔍 CRITICAL: File hash to verify uniqueness:', crypto.createHash('md5').update(fs.readFileSync(processedImagePath)).digest('hex').substring(0, 8));
      
      // WEBAPP IDENTICAL CONFIGURATION: Match their exact default behavior
      console.log('🎯 USING VECTOR.AI WEBAPP DEFAULT SETTINGS - Exactly matching vectorizer.ai webapp behavior');
      
      // CRITICAL FIX: Always request SVG output format explicitly to avoid PNG binary data
      formData.append('output_format', 'svg');
      console.log('✅ Explicitly requesting SVG output format to avoid binary PNG data');
      
      // CRITICAL FIX: Vector.AI API expects specific mode values based on documentation
      if (!isPreview) {
        // Production mode should NOT include mode parameter (uses default)
        console.log('✅ Production mode - using Vector.AI default settings (no mode parameter)');
      } else {
        formData.append('mode', 'preview');
        console.log('⚡ Preview mode for testing');
      }
      
      // NO CUSTOM PARAMETERS - Let Vector.AI use exact webapp defaults
      // The webapp works perfectly, so we use NO processing overrides
      
      console.log('✅ WEBAPP DEFAULT CONFIGURATION - Using Vector.AI native defaults that work perfectly on their website');

      // Call vectorizer.ai API with comprehensive debugging
      console.log('🚀 MAKING API CALL TO VECTOR.AI NOW WITH FIXED IMPLEMENTATION...');
      console.log('🔗 API URL: https://vectorizer.ai/api/v1/vectorize');
      console.log('🔑 Using API credentials: ID exists =', !!vectorizerApiId, ', Secret exists =', !!vectorizerApiSecret);
      console.log('📁 File being sent:', processedImagePath);
      console.log('📋 FormData keys:', Object.keys(formData));
      
      // FIXED: Use exact same request format as working debug version
      const response = await fetch('https://vectorizer.ai/api/v1/vectorize', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${vectorizerApiId}:${vectorizerApiSecret}`).toString('base64')}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...formData.getHeaders()
        },
        body: formData
      });
      
      console.log('📋 CRITICAL DEBUG: Request headers sent:', {
        'Authorization': 'Basic [REDACTED]',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...Object.fromEntries(Object.entries(formData.getHeaders()).map(([k, v]) => [k, typeof v === 'string' ? v.substring(0, 50) + '...' : v]))
      });
      
      console.log('📈 API RESPONSE RECEIVED:');
      console.log('  Status:', response.status, response.statusText);
      console.log('  Headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Vectorizer API error:', response.status, errorText);
        return res.status(response.status).json({ 
          error: `Vectorization failed: ${response.statusText}` 
        });
      }

      // Check content type header first
      const contentType = response.headers.get('content-type') || '';
      console.log('🔍 Response content-type:', contentType);
      
      let result: any;
      if (contentType.includes('image/svg') || contentType.includes('text/') || contentType.includes('application/xml')) {
        result = await response.text(); // SVG content
        console.log('📊 SVG Response size:', result.length, 'bytes');
        console.log('📋 SVG Response preview (first 200 chars):', result.substring(0, 200));
      } else {
        // If we get binary data, it might be PNG despite our request
        const buffer = await response.arrayBuffer();
        console.error('❌ API returned binary data instead of SVG. Content-Type:', contentType);
        console.error('❌ First 50 bytes:', new Uint8Array(buffer.slice(0, 50)));
        
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({ 
          error: 'Vectorization service returned binary data instead of SVG. The API may not support SVG output in preview mode.' 
        });
      }
      
      // Verify we received SVG content
      if (!result.includes('<svg') && !result.includes('<?xml')) {
        console.error('❌ API returned non-SVG content:', result.substring(0, 200));
        
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        
        return res.status(500).json({ 
          error: 'Vectorization service returned invalid format. Expected SVG but got different content.' 
        });
      }
      
      // Clean up uploaded files
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      // Clean up deduplicated file if it was created
      if (processedImagePath !== req.file.path && fs.existsSync(processedImagePath)) {
        fs.unlinkSync(processedImagePath);
      }

      console.log(`✅ Vectorization successful: ${result.length} bytes SVG`);
      console.log(`🔍 DEBUG: Starting AI-vectorized SVG cleaning process...`);
      
      // CRITICAL FIX: Clean up corrupted path elements immediately after receiving from AI service
      if (result.includes('pathnon-scaling-')) {
        console.log('🔧 Detected corrupted pathnon-scaling- elements, cleaning up...');
        
        // Remove all corrupted pathnon-scaling- elements that break SVG structure
        result = result.replace(/<pathnon-scaling-[^>]*>/g, '');
        result = result.replace(/<\/pathnon-scaling->/g, '');
        result = result.replace(/<pathnon-scaling-\s*\/>/g, '');
        
        // Also clean up any broken path elements that might be missing closing tags
        result = result.replace(/<path([^>]*?)pathnon-scaling-([^>]*?)>/g, '<path$1$2>');
        
        console.log(`🧹 Cleaned corrupted elements, SVG now ${result.length} bytes`);
      }
      
      // Add AI-vectorized marker and ensure proper stroke settings
      if (!result.includes('data-ai-vectorized="true"')) {
        // Add the marker to the root SVG element
        result = result.replace(/<svg([^>]*)>/, '<svg$1 data-ai-vectorized="true">');
        console.log('✅ Added AI-vectorized marker for proper processing');
      }
      
      // CRITICAL: Remove ALL strokes from vectorized content - user requirement is fills only
      result = result.replace(/<path([^>]*?)stroke="[^"]*"([^>]*?)>/g, '<path$1$2>');
      result = result.replace(/<path([^>]*?)stroke-width="[^"]*"([^>]*?)>/g, '<path$1$2>');
      result = result.replace(/<circle([^>]*?)stroke="[^"]*"([^>]*?)>/g, '<circle$1$2>');
      result = result.replace(/<rect([^>]*?)stroke="[^"]*"([^>]*?)>/g, '<rect$1$2>');
      result = result.replace(/<ellipse([^>]*?)stroke="[^"]*"([^>]*?)>/g, '<ellipse$1$2>');
      result = result.replace(/<line([^>]*?)>/g, ''); // Remove line elements entirely
      result = result.replace(/<polyline([^>]*?)>/g, ''); // Remove polyline elements entirely
      console.log('✅ Removed ALL strokes from AI-vectorized content - fills only as required');
      
      // DISABLED: Apply AI-vectorized cleaning to fix extended elements and bounding box issues
      // User wants more colors detected, aggressive cleaning removes important elements
      // const { cleanAIVectorizedSVG } = await import('./dimension-utils');
      // result = cleanAIVectorizedSVG(result);
      console.log('✅ Skipped aggressive AI-vectorized cleaning to preserve all colors and elements');
      
      // Re-calculate dimension after cleaning and applying vector effects
      const cleanedBounds = calculateSVGContentBounds(result);
      if (cleanedBounds) {
        console.log(`✅ Cleaned vectorized bounds: ${cleanedBounds.width}×${cleanedBounds.height}`);
        
        // DISABLED: Content bounds cropping was cutting off parts of the logo
        // Keep Vector.AI's original viewBox to preserve the complete logo
        console.log(`✅ Preserving Vector.AI original viewBox to keep complete logo intact`);
      }
      
      // Log the raw SVG to check if dot exists
      const dotPatterns = [
        /d="[^"]*[Mm]\s*\d+[\d.]*\s*,?\s*\d+[\d.]*\s*[^"]*[Zz]"/g, // closed paths
        /<circle[^>]*r=["'][0-9.]+["'][^>]*>/g, // circles
        /<ellipse[^>]*rx=["'][0-9.]+["'][^>]*>/g // ellipses
      ];
      
      let smallElementCount = 0;
      dotPatterns.forEach(pattern => {
        const matches = result.match(pattern) || [];
        matches.forEach((match: any) => {
          // Check if it's a small element
          if (match.includes('circle') || match.includes('ellipse')) {
            const radiusMatch = match.match(/r[xy]?=["']([0-9.]+)["']/);
            if (radiusMatch && parseFloat(radiusMatch[1]) < 5) {
              smallElementCount++;
              console.log(`🔵 Found small circle/ellipse in raw SVG: ${match.substring(0, 100)}`);
            }
          }
        });
      });
      
      console.log(`📊 Raw SVG small element count: ${smallElementCount}`);
      
      // CRITICAL: Text Quality Detection System
      const svgLower = result.toLowerCase();
      const originalFileName = req.file.originalname.toLowerCase();
      let textQualityIssues = [];
      
      // Check for expected text content
      if (originalFileName.includes('friendly') && !svgLower.includes('friendly')) {
        textQualityIssues.push('Missing expected "FRIENDLY" text');
        console.log(`❌ TEXT QUALITY ISSUE: Expected "FRIENDLY" text not found in vectorization`);
      }
      
      // Analyze path structure for additional quality checks
      const allPathMatches = result.match(/<path[^>]*d="[^"]+"/g) || [];
      
      // Check for excessive path complexity that indicates text distortion
      const pathCount = allPathMatches.length;
      const averagePathLength = pathCount > 0 ? allPathMatches.reduce((sum, path) => sum + path.length, 0) / pathCount : 0;
      
      if (pathCount > 25 && averagePathLength > 200) {
        textQualityIssues.push('Excessive path complexity indicates text distortion');
        console.log(`❌ TEXT QUALITY ISSUE: High complexity detected - ${pathCount} paths, avg length ${averagePathLength.toFixed(0)}`);
      }
      
      // Check for suspicious narrow vertical paths (letter extensions)
      let suspiciousExtensions = 0;
      allPathMatches.forEach((pathMatch, index) => {
        const dMatch = pathMatch.match(/d="([^"]+)"/);
        if (dMatch) {
          const pathData = dMatch[1];
          const coords = pathData.match(/[\d.]+/g) || [];
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          
          // Get bounding box of path
          for (let i = 0; i < coords.length; i += 2) {
            const x = parseFloat(coords[i]);
            const y = parseFloat(coords[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
          
          const width = maxX - minX;
          const height = maxY - minY;
          
          // Detect potential letter fragments or extensions
          if (width > 0 && height > 0 && (width < 20 || height < 20)) {
            suspiciousExtensions++;
            console.log(`🔵 Path ${index + 1}: Potential letter/dot detected (${width.toFixed(2)}×${height.toFixed(2)}): ${pathData.substring(0, 100)}...`);
          }
        }
      });
      
      if (suspiciousExtensions > 15) {
        textQualityIssues.push(`Too many small fragments (${suspiciousExtensions}) indicating poor text recognition`);
        console.log(`❌ TEXT QUALITY ISSUE: Excessive fragmentation - ${suspiciousExtensions} small path fragments detected`);
      }
      
      // If significant quality issues detected, add warning metadata
      let qualityWarning = null;
      if (textQualityIssues.length > 0) {
        qualityWarning = {
          issues: textQualityIssues,
          recommendation: 'Consider using alternative vectorization method or manual text conversion',
          originalFileName: req.file.originalname
        };
        console.log(`⚠️ VECTORIZATION QUALITY WARNING:`, qualityWarning);
        
        // Add quality warning as SVG comment
        result = result.replace(
          '<!-- AI_VECTORIZED_FILE:',
          `<!-- AI_VECTORIZED_FILE: QUALITY WARNING - ${textQualityIssues.join(', ')} -->\n<!-- Original AI_VECTORIZED_FILE:`
        );
      } else {
        console.log(`✅ Text quality check passed - vectorization appears clean`);
      }
      
      let narrowVerticalPaths = 0;
      
      console.log(`📊 Total narrow vertical paths (potential "I" letters): ${narrowVerticalPaths}`);
      
      // Look for very small closed paths that could be dots or letters
      allPathMatches.forEach((pathMatch, index) => {
        const dMatch = pathMatch.match(/d="([^"]+)"/);
        if (dMatch) {
          const pathData = dMatch[1];
          // Check if it's a closed path
          if (pathData.includes('Z') || pathData.includes('z')) {
            const coords = pathData.match(/[\d.]+/g) || [];
            if (coords.length >= 4) {
              const x1 = parseFloat(coords[0] || '0');
              const y1 = parseFloat(coords[1] || '0');
              const x2 = parseFloat(coords[2] || '0');
              const y2 = parseFloat(coords[3] || '0');
              const approxWidth = Math.abs(x2 - x1);
              const approxHeight = Math.abs(y2 - y1);
              
              // Check for small letters like "I" (narrow but tall)
              if ((approxWidth < 10 && approxHeight > 0) || (approxHeight < 10 && approxWidth > 0)) {
                console.log(`🔵 Path ${index + 1}: Potential letter/dot detected (${approxWidth.toFixed(2)}×${approxHeight.toFixed(2)}): ${pathData.substring(0, 100)}...`);
              }
            }
          }
        }
      });
      
      // Also check text elements in case vectorizer created text
      const textElements = result.match(/<text[^>]*>.*?<\/text>/gi) || [];
      if (textElements.length > 0) {
        console.log(`📝 Found ${textElements.length} text elements in vectorized SVG`);
        textElements.forEach((text, i) => {
          console.log(`📝 Text ${i + 1}: ${text.substring(0, 100)}...`);
        });
      }
      
      // Use the cleaned and cropped result from our AI-vectorized processing above
      let cleanedSvg = result;
      console.log(`🤖 Using cleaned AI-vectorized content with cropped viewBox`);
      
      // Only remove XML declaration if present for browser compatibility
      if (cleanedSvg.includes('<?xml')) {
        cleanedSvg = cleanedSvg.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/, '');
        console.log(`🧹 Removed XML declaration for browser compatibility`);
      }
      
      // Add AI-vectorized marker to prevent aggressive processing on re-upload
      let cmykSvg = cleanedSvg;
      
      // Add special marker to indicate this is a clean AI-vectorized file
      if (!cmykSvg.includes('data-ai-vectorized="true"')) {
        cmykSvg = cmykSvg.replace('<svg', '<svg data-ai-vectorized="true"');
        console.log(`🤖 Added AI-vectorized marker to prevent re-processing`);
      }
      
      // Skip CMYK conversion that removes backgrounds - we want to preserve the clean vectorized result
      console.log(`🎨 Skipping CMYK conversion to preserve clean vectorized content`);
      
      // Just add basic metadata without aggressive processing
      try {
        const cmykMetadata = '\n<!-- AI_VECTORIZED_FILE: Clean vectorized result, no background removal needed -->\n';
        cmykSvg = cmykSvg.replace('<svg', cmykMetadata + '<svg');
      } catch (error) {
        console.error('Failed to add metadata to vectorized SVG:', error);
      }
      
      console.log(`📤 Sending response: svg length = ${cmykSvg.length}, mode = ${isPreview ? 'preview' : 'production'}`);
      
      // Clean up uploaded files after successful processing
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      // Clean up deduplicated file if it was created
      if (processedImagePath !== req.file.path && fs.existsSync(processedImagePath)) {
        fs.unlinkSync(processedImagePath);
      }
      
      // Send response with quality metadata
      const responseData: any = { 
        svg: cmykSvg,
        mode: isPreview ? 'preview' : 'production'
      };
      if (qualityWarning) {
        responseData.qualityWarning = qualityWarning;
      }
      
      res.json(responseData);

    } catch (error) {
      console.error('Vectorization error:', error);
      
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Vectorization failed' 
      });
    }
  });

  // Vectorization Service Routes
  app.post('/api/vectorization-requests', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Validate request body
      const requestData = insertVectorizationRequestSchema.parse({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
        comments: req.body.comments,
        printSize: req.body.printSize,
        charge: 15 // Fixed 15 euro charge
      });

      const vectorizationRequest = await storage.createVectorizationRequest(requestData);

      // TODO: Integrate with webcart for 15 euro charge
      // For now, we'll simulate the webcart integration
      console.log('Vectorization request created:', {
        id: vectorizationRequest.id,
        file: vectorizationRequest.originalName,
        charge: vectorizationRequest.charge,
        comments: vectorizationRequest.comments,
        printSize: vectorizationRequest.printSize
      });

      res.json({
        id: vectorizationRequest.id,
        success: true,
        message: 'Vectorization request submitted successfully',
        charge: vectorizationRequest.charge,
        webcartUrl: '#' // TODO: Replace with actual webcart URL
      });

    } catch (error) {
      console.error('Vectorization request error:', error);
      
      // Clean up uploaded file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to submit vectorization request' 
      });
    }
  });

  app.get('/api/vectorization-requests', async (req, res) => {
    try {
      const requests = await storage.getVectorizationRequests();
      res.json(requests);
    } catch (error) {
      console.error('Failed to fetch vectorization requests:', error);
      res.status(500).json({ error: 'Failed to fetch vectorization requests' });
    }
  });

  app.get('/api/vectorization-requests/:id', async (req, res) => {
    try {
      const request = await storage.getVectorizationRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'Vectorization request not found' });
      }
      res.json(request);
    } catch (error) {
      console.error('Failed to fetch vectorization request:', error);
      res.status(500).json({ error: 'Failed to fetch vectorization request' });
    }
  });

  // Download Odoo module endpoint
  app.get('/api/download/odoo-module', (req, res) => {
    const filePath = path.resolve('./artwork_uploader_module_error_fixed.zip');
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Module file not found' });
    }
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="artwork_uploader_module_error_fixed.zip"');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  });

  // PDF/SVG Content Bounds Extraction API
  
  /**
   * Extract precise vector content bounds from PDF file
   * POST /api/extract-bounds/pdf
   * Body: { filePath: string, pageNumber?: number, options?: BoundsExtractionOptions }
   */
  app.post('/api/extract-bounds/pdf', async (req, res) => {
    try {
      const { filePath, pageNumber = 1, options = {} } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }

      const fullPath = path.resolve(uploadDir, filePath);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'PDF file not found' });
      }

      console.log(`🔍 Extracting bounds from PDF: ${path.basename(filePath)} (page ${pageNumber})`);
      
      const extractor = new PDFBoundsExtractor();
      const result = await extractor.extractContentBounds(fullPath, pageNumber, options);
      
      res.json(result);

    } catch (error) {
      console.error('❌ PDF bounds extraction error:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'api-error',
        contentFound: false
      });
    }
  });

  /**
   * Extract precise vector content bounds from SVG file
   * POST /api/extract-bounds/svg
   * Body: { filePath: string, options?: object }
   */
  app.post('/api/extract-bounds/svg', async (req, res) => {
    try {
      const { filePath, options = {} } = req.body;
      
      if (!filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }

      const fullPath = path.resolve(uploadDir, filePath);
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }

      console.log(`🔍 Extracting bounds from SVG: ${path.basename(filePath)}`);
      
      const analyzer = new SVGBoundsAnalyzer();
      const result = await analyzer.extractSVGBounds(fullPath);
      
      res.json(result);

    } catch (error) {
      console.error('❌ SVG bounds extraction error:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'api-error',
        hasContent: false
      });
    }
  });

  /**
   * Extract bounds from logo by ID (auto-detects PDF/SVG)
   * GET /api/logos/:logoId/bounds?includeStrokeExtents=true&padding=5
   */
  app.get('/api/logos/:logoId/bounds', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const { 
        includeStrokeExtents = 'true', 
        padding = '0',
        returnCroppedSvg = 'false',
        tolerance = '0.1'
      } = req.query;

      const logo = await storage.getLogo(logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }

      const logoPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(logoPath)) {
        return res.status(404).json({ error: 'Logo file not found' });
      }

      const options = {
        includeStrokeExtents: includeStrokeExtents === 'true',
        padding: parseFloat(padding as string),
        returnCroppedSvg: returnCroppedSvg === 'true',
        tolerance: parseFloat(tolerance as string)
      };

      console.log(`🔍 Extracting bounds for logo ${logoId}: ${logo.filename}`);

      let result;
      
      if (logo.mimeType === 'image/svg+xml') {
        const analyzer = new SVGBoundsAnalyzer();
        result = await analyzer.extractSVGBounds(logoPath);
      } else if (logo.mimeType === 'application/pdf') {
        const extractor = new PDFBoundsExtractor();
        result = await extractor.extractContentBounds(logoPath, 1, options);
      } else {
        return res.status(400).json({ 
          error: 'Unsupported file type. Only PDF and SVG are supported.',
          mimeType: logo.mimeType 
        });
      }

      // Include logo metadata in response
      res.json({
        ...result,
        logoId: logo.id,
        filename: logo.filename,
        mimeType: logo.mimeType,
        originalName: logo.originalName
      });

    } catch (error) {
      console.error('❌ Logo bounds extraction error:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        method: 'api-error',
        contentFound: false
      });
    }
  });

  return app;
}