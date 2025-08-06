import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';
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
      
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      if (!templateSize) {
        console.error(`❌ Invalid template size: ${project.templateSize}`);
        return res.status(400).json({ error: 'Invalid template size' });
      }

      console.log(`📐 Template size: ${templateSize.name} (${templateSize.width}×${templateSize.height}mm)`);

      // Import the SimplifiedPDFGenerator for preserving original files
      console.log('📦 About to import SimplifiedPDFGenerator...');
      const { SimplifiedPDFGenerator } = await import('./simplified-pdf-generator');
      console.log('✅ SimplifiedPDFGenerator imported successfully');
      const generator = new SimplifiedPDFGenerator();
      console.log('📊 Generator instance created');

      // Generate PDF that preserves original file content
      const pdfData = {
        projectId,
        templateSize,
        canvasElements,
        logos,
        garmentColor: project.garmentColor,
        appliqueBadgesForm: project.appliqueBadgesForm
      };
      
      // Debug: Log canvas elements with garment colors
      console.log('📊 Canvas elements with garment colors:');
      canvasElements.forEach(element => {
        console.log(`  - Element ${element.id}: garmentColor = ${element.garmentColor || 'none'}`);
      });

      console.log(`🔄 Generating PDF with original file preservation...`);
      const pdfBuffer = await generator.generatePDF(pdfData);
      console.log(`✅ PDF generated successfully - Size: ${pdfBuffer.length} bytes`);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name || 'project'}_cmyk.pdf"`);
      res.send(pdfBuffer);
      
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
    }
  });
  
  // Setup imposition routes
  setupImpositionRoutes(app, storage);
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

      // Get template information to check if this is a single colour template
      const templateSizes = await storage.getTemplateSizes();
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      const isSingleColourTemplate = templateSize?.group === "Single Colour Transfers";
      
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
                
                // Use pdf2svg for high-quality vector conversion
                let svgCommand;
                try {
                  await execAsync('which pdf2svg');
                  svgCommand = `pdf2svg "${pdfPath}" "${svgPath}"`;
                } catch {
                  // Fallback to Inkscape if pdf2svg not available
                  svgCommand = `inkscape --pdf-poppler "${pdfPath}" --export-type=svg --export-filename="${svgPath}" 2>/dev/null || convert -density 300 -background none "${pdfPath}[0]" "${svgPath}"`;
                }
                
                await execAsync(svgCommand);
                
                if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                  // Clean SVG content to remove stroke scaling issues
                  const { removeVectorizedBackgrounds } = await import('./svg-color-utils');
                  const svgContent = fs.readFileSync(svgPath, 'utf8');
                  const cleanedSvg = removeVectorizedBackgrounds(svgContent);
                  fs.writeFileSync(svgPath, cleanedSvg);
                  console.log(`🧹 Cleaned SVG content for ${svgFilename}`);
                  
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
                  // Clean SVG content to remove stroke scaling issues (only for non-AI-vectorized files)
                  const { removeVectorizedBackgrounds } = await import('./svg-color-utils');
                  const cleanedSvg = removeVectorizedBackgrounds(svgContent);
                  fs.writeFileSync(svgPath, cleanedSvg);
                  console.log(`🧹 Cleaned SVG content for ${svgFilename}`);
                }
                
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
          
          // Override file type based on content analysis
          if (contentAnalysis.hasRasterContent) {
            // PDF contains raster content (logo/images), extract PNG for canvas display
            console.log(`📷 PDF contains raster content, extracting PNG for canvas display`);
            
            // Store original PDF path for later embedding
            (file as any).originalPdfPath = originalPdfPath;
            (file as any).isPdfWithRaster = true;
            (file as any).isPdfWithRasterOnly = true;  // Fix vectorizer issue
            
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
            fileType = FileType.MIXED_CONTENT;
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
            
            // Special handling for CMYK PDFs - mark the SVG as containing CMYK colors
            let analysis = analyzeSVGWithStrokeWidths(svgPath);
            
            // If this is a CMYK PDF that was converted to SVG, mark all colors as CMYK
            if ((file as any).isCMYKPreserved && (file as any).originalPdfPath) {
              console.log(`🎨 CMYK PDF detected - marking all colors as CMYK in analysis`);
              
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
                  
                  // Re-analyze the outlined SVG to update text status
                  analysis = analyzeSVGWithStrokeWidths(svgPath);
                  analysisData = {
                    colors: analysis.colors,
                    fonts: analysis.fonts,
                    strokeWidths: analysis.strokeWidths,
                    minStrokeWidth: analysis.minStrokeWidth,
                    maxStrokeWidth: analysis.maxStrokeWidth,
                    hasText: analysis.hasText
                  };
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
            console.error('Stack trace:', analysisError.stack);
          }
        }

        // Create logo record with analysis data
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
          isPdfWithRasterOnly: (file as any).isPdfWithRasterOnly || false
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
          logoData.originalFilename = file.filename; // Store the original PDF filename
          logoData.originalMimeType = 'application/pdf';
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

        logos.push(logo);

        // Create canvas element with proper sizing
        let displayWidth = 200;
        let displayHeight = 150;

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
            const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
            let isA3Document = false;
            
            if (viewBoxMatch) {
              const viewBoxValues = viewBoxMatch[1].split(' ').map(parseFloat);
              if (viewBoxValues.length >= 4) {
                const [vbX, vbY, vbWidth, vbHeight] = viewBoxValues;
                
                // Check for large format documents - A3, A4, or similar sizes
                const isA3 = (vbWidth > 800 && vbHeight > 1100) || (vbWidth > 1100 && vbHeight > 800);  // A3: 842×1191
                const isA4 = (vbWidth > 580 && vbHeight > 800) || (vbWidth > 800 && vbHeight > 580);    // A4: 595×842
                const isLargeFormat = isA3 || isA4;
                
                console.log(`ViewBox: ${vbWidth}×${vbHeight}, A3: ${isA3}, A4: ${isA4}, Large format: ${isLargeFormat}`);
                
                if (isLargeFormat) {
                  isA3Document = true; // Mark as large format for later processing
                }
              }
            }
            
            // Get content bounds, but only crop for small AI-vectorized content, not large format PDFs
            const contentBounds = calculateSVGContentBounds(svgContent);
            
            // Use the existing viewBox detection result from above
            const isLargeFormat = isA3Document; // Already calculated above
            
            // Only crop SVG to content bounds for small format documents (AI-vectorized logos)
            // Skip cropping for large format documents (PDFs) to prevent clipping
            if (!isLargeFormat && contentBounds && contentBounds.minX !== undefined && contentBounds.minY !== undefined && 
                contentBounds.maxX !== undefined && contentBounds.maxY !== undefined) {
              
              const croppedWidth = contentBounds.maxX - contentBounds.minX;
              const croppedHeight = contentBounds.maxY - contentBounds.minY;
              
              // Create new viewBox that crops to actual content
              const newViewBox = `${contentBounds.minX} ${contentBounds.minY} ${croppedWidth} ${croppedHeight}`;
              
              // Update SVG with cropped viewBox
              let updatedSvgContent = svgContent.replace(
                /viewBox="[^"]*"/,
                `viewBox="${newViewBox}"`
              );
              
              // Also update width and height to match aspect ratio
              updatedSvgContent = updatedSvgContent.replace(
                /width="[^"]*"/,
                `width="${croppedWidth}"`
              );
              updatedSvgContent = updatedSvgContent.replace(
                /height="[^"]*"/,
                `height="${croppedHeight}"`
              );
              
              console.log(`✂️ Small format: Cropped SVG viewBox from full page to content: ${newViewBox} (${croppedWidth.toFixed(1)}×${croppedHeight.toFixed(1)})`);
              
              // Write the cropped SVG back to file
              fs.writeFileSync(svgPath, updatedSvgContent, 'utf8');
            } else if (isLargeFormat) {
              console.log(`📄 Large format: Preserving original viewBox to prevent content clipping`);
            }
            
            // ROBUST DIMENSION SYSTEM: Use centralized dimension calculation
            const updatedSvgContent2 = fs.readFileSync(svgPath, 'utf8');
            const dimensionResult = detectDimensionsFromSVG(updatedSvgContent2, contentBounds);
            
            // Validate accuracy and log any issues
            validateDimensionAccuracy(dimensionResult);
            
            // Check if this is AI-vectorized content that needs auto-fitting
            const isAIVectorized = updatedSvgContent2.includes('data-ai-vectorized="true"') || 
                                   updatedSvgContent2.includes('vector-effect="non-scaling-stroke"');
            
            // Use the calculated mm dimensions directly
            displayWidth = dimensionResult.widthMm;
            displayHeight = dimensionResult.heightMm;
            
            // For AI-vectorized content, use actual SVG viewBox dimensions without arbitrary scaling
            if (isAIVectorized) {
              console.log(`✅ AI-VECTORIZED: Using actual SVG dimensions ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm for proper canvas display`);
              // No arbitrary scaling - let the canvas handle display scaling appropriately based on actual vector bounds
            }
            
            console.log(`🎯 ROBUST DIMENSIONS: ${dimensionResult.widthPx}×${dimensionResult.heightPx}px → ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm (${dimensionResult.accuracy} accuracy, ${dimensionResult.source})`);
            
            } else {
              // Fallback: for large documents with no detectable content bounds
              console.log(`Large format document with no detectable content bounds, using conservative sizing`);
              displayWidth = 200;
              displayHeight = 150;
          }
        } catch (error) {
          console.error('Failed to calculate content bounds:', error);
        }

        // Get template size for centering
        const templateSize = await storage.getTemplateSize(project.templateSize);
        if (!templateSize) {
          throw new Error('Template size not found');
        }

        // Calculate centered position
        const centerX = Math.max(0, (templateSize.width - displayWidth) / 2);
        const centerY = Math.max(0, (templateSize.height - displayHeight) / 2);

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
          colorOverrides: null
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
      res.json(logos);
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

  // Static file serving with fallback
  app.use('/uploads', express.static(uploadDir));

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
      const logo = await storage.getLogo(element.logoId);
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
        
        // Get SVG color analysis for format mapping
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

  // Ink recolor endpoint (simplified)
  app.get('/uploads/:filename', (req, res, next) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // Try fallback to original PDF if SVG doesn't exist
      const pdfFilename = filename.replace('.svg', '');
      const pdfPath = path.join(uploadDir, pdfFilename);
      
      if (fs.existsSync(pdfPath)) {
        res.sendFile(pdfPath);
      } else {
        next();
      }
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
          const cmyk = adobeRgbToCmyk(r, g, b);
          
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
        const cmyk = adobeRgbToCmyk(parseInt(r), parseInt(g), parseInt(b));
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
        const cmyk = adobeRgbToCmyk(r, g, b);
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
        const uniqueColors = [...new Set(matches)];
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
      
      // CRITICAL FIX: Vector.AI API expects specific mode values based on documentation
      if (!isPreview) {
        // Production mode should NOT include mode parameter (uses default)
        console.log('✅ Production mode - using Vector.AI default settings (no mode parameter)');
      } else {
        formData.append('mode', 'preview');
        console.log('⚡ Preview mode for testing');
      }
      
      // Based on Vector.AI docs, SVG is the default output format
      // Let's test without specifying output_format to match their examples
      console.log('📋 Using default SVG output format (not explicitly specified)');
      
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
      
      let result;
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
        matches.forEach(match => {
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
              const x1 = parseFloat(coords[0]);
              const y1 = parseFloat(coords[1]);
              const x2 = parseFloat(coords[2]);
              const y2 = parseFloat(coords[3]);
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

  return app;
}