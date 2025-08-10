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
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      // Preserve file extension by appending it to the generated hash
      const ext = path.extname(file.originalname);
      const hash = crypto.randomBytes(16).toString('hex');
      cb(null, hash + ext);
    }
  }),
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
  
  // CRITICAL: Ultra-early debugging to verify function is called
  process.stdout.write(`🚀🚀🚀 REGISTER ROUTES CALLED - ${new Date().toISOString()}\n`);
  console.error(`🚀🚀🚀 REGISTERING ROUTES FUNCTION STARTED`);
  
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

      // Import the ORIGINAL WORKING PDF generator
      console.log('📦 Using OriginalWorkingGenerator...');
      const { OriginalWorkingGenerator } = await import('./original-working-generator');
      console.log('✅ OriginalWorkingGenerator imported successfully');
      const generator = new OriginalWorkingGenerator();
      console.log('📊 Original working generator instance created');

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
      
      // Check if this is for preview (inline viewing) or download
      const isPreview = req.query.preview === 'true' || req.headers['user-agent']?.includes('iframe');
      
      if (isPreview) {
        // For preview, use inline disposition so it displays in iframe
        res.setHeader('Content-Disposition', `inline; filename="${project.name || 'project'}_cmyk.pdf"`);
        res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow iframe from same origin
        res.setHeader('Content-Security-Policy', 'frame-ancestors \'self\''); // Modern alternative to X-Frame-Options
        res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
        res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none'); // Allow embedding
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); // Same-origin policy
      } else {
        // For download, use attachment disposition
        res.setHeader('Content-Disposition', `attachment; filename="${project.name || 'project'}_cmyk.pdf"`);
      }
      
      res.send(pdfBuffer);
      
    } catch (error) {
      console.error('❌ PDF generation error:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // REMOVED problematic app.all route that was intercepting requests

  // Debug test route
  app.post('/api/test-debug/:projectId/logos', (req, res) => {
    console.log('🚨 DEBUG TEST ROUTE HIT!');
    res.json({ message: 'Test route works!' });
  });

  // MOVE app.all AFTER specific routes to fix route precedence issue
  
  // CRITICAL: Log route registration
  process.stdout.write(`📍📍📍 REGISTERING UPLOAD ROUTE - ${new Date().toISOString()}\n`);
  console.error(`📍📍📍 REGISTERING /api/projects/:projectId/logos route`);

  // ================== MAIN UPLOAD HANDLER (ENHANCED WITH CMYKSERVICE) ==================
  app.post('/api/projects/:projectId/logos', upload.array('files'), async (req, res) => {
    console.log(`🚨🚨🚨 ENHANCED HANDLER ENTRY POINT HIT! Project: ${req.params.projectId}`);
    console.log(`🚨🚨🚨 Method: ${req.method}, URL: ${req.url}`);
    console.log(`🚨🚨🚨 Files count: ${req.files?.length || 0}`);
    
    try {
      console.log(`🚀 ENHANCED UPLOAD HANDLER: Processing files for project ${req.params.projectId}`);
      const projectId = req.params.projectId;
      const files = req.files as Express.Multer.File[];
      
      console.log(`🚨 FILES ARRAY:`, files?.map(f => ({ name: f.originalname, mime: f.mimetype, filename: f.filename })) || 'NO FILES');
      
      if (!files || files.length === 0) {
        console.log(`❌ NO FILES PROVIDED IN UPLOAD`);
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // PRODUCTION FLOW: Import production flow manager
      const { productionFlow } = await import('./production-flow-manager');

      // Get template information to check if this is a single colour template
      const templateSizes = await storage.getTemplateSizes();
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      const isSingleColourTemplate = templateSize?.group === "Single Colour Transfers";
      
      console.log(`📐 Template: ${templateSize?.name} (Group: ${templateSize?.group}), Single Colour: ${isSingleColourTemplate}, Ink Color: ${project.inkColor}`);

      const logos = [];
      
      // Import CMYK service for reliable detection
      const { CMYKService } = await import('./cmyk-service');
      
      for (const file of files) {
        let cmykResult: { isCMYKPreserved: boolean; originalPdfPath?: string; cmykColors?: { c: number; m: number; y: number; k: number; }[] } = { isCMYKPreserved: false };
        try {
          console.log(`🔄 Processing file: ${file.originalname} (${file.mimetype})`);
          
          // DEBUG: Check variables before CMYK detection
          console.log(`🔍 DEBUG: uploadDir = ${uploadDir}`);
          console.log(`🔍 DEBUG: CMYKService imported:`, typeof CMYKService);
          console.log(`🔍 DEBUG: file object:`, { filename: file.filename, originalname: file.originalname, mimetype: file.mimetype });
          
          try {
            // IMMEDIATE CMYK detection before ANY processing
            console.log(`🔍 CALLING ENHANCED CMYKService.processUploadedFile for ${file.originalname}`);
            
            // Use the NEW unified CMYKService with proper file path
            const filePath = path.join(uploadDir, file.filename);
            cmykResult = await CMYKService.processUploadedFile(file, uploadDir);
            
            console.log(`🎨 ENHANCED CMYK Result for ${file.originalname}:`, cmykResult);
            console.log(`🎨 Enhanced Extracted CMYK colors:`, cmykResult.cmykColors);
            console.log(`🎨 Enhanced isCMYKPreserved:`, cmykResult.isCMYKPreserved);
          } catch (cmykError) {
            console.error(`❌ CMYK Detection Error for ${file.originalname}:`, cmykError);
            console.error(`❌ CMYK Error Stack:`, cmykError instanceof Error ? cmykError.stack : 'No stack trace');
          }

          // ENHANCED PROCESSING: Use CMYK detection results for clean file processing
          let finalFilename = file.filename;
          let finalMimeType = file.mimetype;
          let finalUrl = `/uploads/${file.filename}`;

          console.log(`📁 Enhanced processing file: ${file.filename}, CMYK: ${cmykResult.isCMYKPreserved}`);

        // Handle PDF files - convert to SVG for display
        if (file.mimetype === 'application/pdf') {
          try {
            const sourcePath = path.join(uploadDir, file.filename);
            const svgFilename = `${file.filename}.svg`;
            const svgPath = path.join(uploadDir, svgFilename);
            
            console.log(`📄 Processing PDF file: ${file.filename}`);
            console.log(`🔍 Source file exists: ${fs.existsSync(sourcePath)}`);
            
            if (!fs.existsSync(sourcePath)) {
              throw new Error(`PDF source file not found: ${sourcePath}`);
            }

            // EXTRACT ORIGINAL CMYK COLORS BEFORE SVG CONVERSION
            console.log(`🎨 Extracting original CMYK colors from PDF...`);
            const { CMYKDetector } = await import('./cmyk-detector');
            const originalCMYKColors = await CMYKDetector.extractCMYKColors(sourcePath);
            console.log(`🎨 Extracted ${originalCMYKColors.length} original CMYK colors:`, originalCMYKColors);
        
        // Store extracted CMYK colors for the frontend
        if (originalCMYKColors.length > 0) {
          console.log(`🎨 STORING ORIGINAL CMYK VALUES for frontend display`);
        }
            
            // Convert PDF to SVG using pdf2svg
            const pdf2svgCommand = `pdf2svg "${sourcePath}" "${svgPath}"`;
            console.log(`🔄 Running: ${pdf2svgCommand}`);
            await execAsync(pdf2svgCommand);
            
            if (fs.existsSync(svgPath)) {
              // Analyze SVG content for colors and dimensions
              const svgContent = fs.readFileSync(svgPath, 'utf8');
              
              // Calculate SVG content bounds and extract colors
              const { calculateSVGContentBounds } = await import('./dimension-utils');
              const contentBounds = calculateSVGContentBounds(svgContent);
              console.log(`📐 SVG content bounds calculated:`, contentBounds);
              
              // Extract SVG colors and dimensions
              const { detectDimensionsFromSVG } = await import('./dimension-utils');
              const dimensions = detectDimensionsFromSVG(svgContent);
              console.log(`📏 SVG dimensions detected:`, dimensions);
              
              // Analyze SVG colors - create basic analysis structure
              const colorAnalysis: {
                colors: Array<{ color: string; type: string; isCMYK: boolean; }>;
                fonts: string[];
                strokeWidths: number[];
                hasText: boolean;
              } = {
                colors: [],
                fonts: [],
                strokeWidths: [],
                hasText: false
              };
              
              // Extract colors from SVG paths and elements with proper SVGColorInfo structure
              const colorMatches = svgContent.match(/fill="[^"]*"/g) || [];
              const uniqueColors = new Set<string>();
              
              const colors = colorMatches
                .map(match => match.replace(/fill="|"/g, ''))
                .filter(color => {
                  if (color === 'none' || color === 'transparent' || uniqueColors.has(color)) {
                    return false;
                  }
                  uniqueColors.add(color);
                  return true;
                })
                .map((color, index) => {
                  // Use original CMYK values if available, otherwise fall back to RGB-to-CMYK conversion
                  const originalCMYK = originalCMYKColors && originalCMYKColors[index];
                  
                  return {
                    id: `color-${index}`,
                    originalColor: color,
                    originalFormat: color, // Store SVG format
                    elementType: 'path',
                    attribute: 'fill',
                    selector: `[fill="${color}"]`,
                    isCMYK: cmykResult.isCMYKPreserved,
                    cmykColor: originalCMYK ? 
                      `C:${originalCMYK.c} M:${originalCMYK.m} Y:${originalCMYK.y} K:${originalCMYK.k}` : 
                      undefined,
                    // Store original CMYK values for accurate color picker display
                    originalCMYK: originalCMYK
                  };
                });
              
              // Store SVG colors in the expected format for color analysis
              colorAnalysis.colors = colors.map(c => ({
                color: c.originalColor,
                type: 'fill',
                isCMYK: c.isCMYK
              }));
              console.log(`🎨 Enhanced SVG color analysis: found ${colors.length} unique colors with CMYK status: ${cmykResult.isCMYKPreserved}:`, colors.map(c => ({ originalColor: c.originalColor, isCMYK: c.isCMYK, cmykColor: c.cmykColor })));
              console.log(`🎨 SVG color analysis: found ${colors.length} colors:`, colors);
              
              // Store analysis results on file object for logo creation
              (file as any).svgContentBounds = contentBounds;
              (file as any).svgDimensions = dimensions;
              (file as any).svgColorAnalysis = colorAnalysis;
              (file as any).svgColors = colors; // Store enhanced color data with originalCMYK
              (file as any).originalCMYKColors = originalCMYKColors; // Store original CMYK values
              
              // Use SVG for display
              finalFilename = svgFilename;
              finalMimeType = 'image/svg+xml';
              finalUrl = `/uploads/${svgFilename}`;
              console.log(`✅ PDF converted to SVG: ${svgFilename}`);
            } else {
              console.warn(`⚠️ SVG conversion failed, using original PDF`);
            }
            
          } catch (pdfError) {
            console.error('PDF to SVG conversion failed:', pdfError);
            // Continue with original PDF file
          }
        }
        
        // Handle AI/EPS files - convert to SVG for display
        else if (file.mimetype === 'application/postscript' || 
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



        // Process PDF files - convert to SVG for display
        if (file.mimetype === 'application/pdf') {
          try {
            const pdfPath = path.join(uploadDir, file.filename);
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
              let svgContent = fs.readFileSync(svgPath, 'utf8');
              
              // If this is a CMYK PDF, add markers to the SVG
              if (cmykResult.isCMYKPreserved) {
                svgContent = svgContent.replace('<svg', `<svg data-original-cmyk-pdf="${cmykResult.originalPdfPath}" data-cmyk-preserved="true"`);
                console.log(`✅ Marked SVG as CMYK-preserved from original: ${cmykResult.originalPdfPath}`);
              }
              
              const cleanedSvg = removeVectorizedBackgrounds(svgContent);
              fs.writeFileSync(svgPath, cleanedSvg);
              console.log(`🧹 Cleaned SVG content for ${svgFilename}`);
              
              // Use SVG for display but remember original settings
              finalFilename = svgFilename;
              finalMimeType = 'image/svg+xml';
              finalUrl = `/uploads/${finalFilename}`;
              
              console.log(`Created SVG preview for PDF: ${svgFilename} (CMYK: ${(file as any).isCMYKPreserved || false})`);
            }
          } catch (error) {
            console.error('PDF to SVG conversion failed:', error);
            // Continue with original PDF
          }
        }



        // ENHANCED: Analyze final file content for colors and dimensions
        let svgColors = (file as any).svgColorAnalysis || { colors: [], fonts: [], strokeWidths: [], hasText: false };
        let contentBounds = (file as any).svgContentBounds || null;
        let dimensions = (file as any).svgDimensions || null;

        // If we have an SVG file (converted or direct), analyze it for colors
        if (finalMimeType === 'image/svg+xml' && finalFilename.endsWith('.svg')) {
          try {
            const svgPath = path.join(uploadDir, finalFilename);
            if (fs.existsSync(svgPath)) {
              const svgContent = fs.readFileSync(svgPath, 'utf8');
              
              // Calculate content bounds and dimensions if not already done
              if (!contentBounds) {
                const { calculateSVGContentBounds } = await import('./svg-color-utils');
                contentBounds = calculateSVGContentBounds(svgContent);
                console.log(`📐 Late SVG content bounds calculated:`, contentBounds);
              }
              
              if (!dimensions) {
                const { detectDimensionsFromSVG } = await import('./dimension-utils');
                dimensions = detectDimensionsFromSVG(svgContent);
                console.log(`📏 Late SVG dimensions detected:`, dimensions);
              }
              
              // Extract colors with proper structure if not already done
              if (!svgColors.colors || svgColors.colors.length === 0) {
                const colorMatches = svgContent.match(/fill="[^"]*"/g) || [];
                const uniqueColors = new Set<string>();
                
                const colors = colorMatches
                  .map(match => match.replace(/fill="|"/g, ''))
                  .filter(color => {
                    if (color === 'none' || color === 'transparent' || uniqueColors.has(color)) {
                      return false;
                    }
                    uniqueColors.add(color);
                    return true;
                  })
                  .map((color, index) => ({
                    id: `color-${index}`,
                    originalColor: color,
                    originalFormat: color,
                    elementType: 'path', 
                    attribute: 'fill',
                    selector: `[fill="${color}"]`,
                    isCMYK: cmykResult.isCMYKPreserved,
                    cmykColor: cmykResult.isCMYKPreserved && cmykResult.cmykColors && cmykResult.cmykColors[index] ? 
                      `C:${cmykResult.cmykColors[index].c} M:${cmykResult.cmykColors[index].m} Y:${cmykResult.cmykColors[index].y} K:${cmykResult.cmykColors[index].k}` : 
                      undefined
                  }));
                
                svgColors = { colors, fonts: [], strokeWidths: [], hasText: false };
                console.log(`🎨 Late SVG color analysis: found ${colors.length} unique colors with CMYK status: ${cmykResult.isCMYKPreserved}`);
              }
            }
          } catch (analysisError) {
            console.error('Late SVG analysis error:', analysisError);
          }
        }

        console.log(`🚀 ENHANCED: Creating logo record for ${file.originalname}`);
        console.log(`🚀 ENHANCED: CMYK preserved: ${cmykResult.isCMYKPreserved}`);
        console.log(`🚀 ENHANCED: Original PDF path: ${cmykResult.originalPdfPath || 'none'}`);
        console.log(`🚀 ENHANCED: Final color count: ${svgColors.colors?.length || 0}`);
        
        // Ensure svgColors structure matches frontend expectations (SVGColorInfo[])
        // Use the enhanced color data with originalCMYK if available
        const enhancedColors = (file as any).svgColors || svgColors.colors || [];
        console.log(`🎨 SAVING TO DATABASE: Enhanced colors with originalCMYK:`, enhancedColors.map((c: any) => ({ 
          originalColor: c.originalColor, 
          originalCMYK: c.originalCMYK,
          cmykColor: c.cmykColor 
        })));
        
        const logo = await storage.createLogo({
          projectId: projectId,
          filename: finalFilename,
          originalName: file.originalname,
          mimeType: finalMimeType,
          size: file.size,
          url: finalUrl,
          width: dimensions?.width || null,
          height: dimensions?.height || null,
          svgColors: enhancedColors,
          svgFonts: svgColors.fonts || [],
          contentBounds: contentBounds,
          isMixedContent: false,
          isCMYKPreserved: cmykResult.isCMYKPreserved, // USE CMYK SERVICE RESULT
          originalPdfPath: cmykResult.originalPdfPath || null, // ADD ORIGINAL PDF PATH
          isPdfWithRasterOnly: false
        });
        
        logos.push(logo);
        console.log(`✅ ENHANCED: Logo created successfully with ID: ${logo.id}`);
        
        // ENHANCED: Calculate proper canvas element size from content bounds or dimensions
        let displayWidth = 200; // default
        let displayHeight = 150; // default
        
        if (contentBounds && contentBounds.width > 0 && contentBounds.height > 0) {
          // CRITICAL FIX: Use EXACT content bounds without rounding or padding
          displayWidth = contentBounds.width;  // Use exact width
          displayHeight = contentBounds.height; // Use exact height
          
          // Calculate actual mm equivalent for logging
          const pixelToMm = 1 / 2.834645669; // Convert pixels to mm (72 DPI)
          const actualWidthMm = displayWidth * pixelToMm;
          const actualHeightMm = displayHeight * pixelToMm;
          
          console.log(`📐 EXACT content bounds: ${displayWidth.toFixed(3)}x${displayHeight.toFixed(3)} pixels (${actualWidthMm.toFixed(3)}mm x ${actualHeightMm.toFixed(3)}mm)`);
        } else if (dimensions && dimensions.widthPx > 0 && dimensions.heightPx > 0) {
          // Use dimension detection results with proper pixel values
          displayWidth = Math.round(dimensions.widthPx);
          displayHeight = Math.round(dimensions.heightPx);
          
          // Calculate actual mm equivalent for logging
          const pixelToMm = 1 / 2.834645669;
          const actualWidthMm = displayWidth * pixelToMm;
          const actualHeightMm = displayHeight * pixelToMm;
          
          console.log(`📐 Canvas element sized from dimension detection: ${displayWidth}x${displayHeight} pixels (${actualWidthMm.toFixed(2)}mm x ${actualHeightMm.toFixed(2)}mm)`);
        } else if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
          // Fallback to SVG dimensions - use pixel values directly
          displayWidth = dimensions.width; // Use pixel width directly
          displayHeight = dimensions.height; // Use pixel height directly
          
          // Calculate actual mm equivalent for logging
          const pixelToMm = 1 / 2.834645669;
          const actualWidthMm = displayWidth * pixelToMm;
          const actualHeightMm = displayHeight * pixelToMm;
          
          console.log(`📐 Canvas element sized from SVG dimensions: ${displayWidth}x${displayHeight} pixels (${actualWidthMm.toFixed(2)}mm x ${actualHeightMm.toFixed(2)}mm)`);
        }
        
        // Create canvas element with centered positioning
        const templateSize = await storage.getTemplateSize(project.templateSize);
        if (!templateSize) {
          throw new Error('Template size not found');
        }

        // Fix: For PDF-derived elements, displayWidth/Height are in pixels
        // We need to center them within the template's pixel dimensions, not mm dimensions
        let centerX, centerY;
        
        if (displayWidth > 200 || displayHeight > 200) {
          // PDF-derived elements: use pixel dimensions for centering
          centerX = Math.max(0, (templateSize.pixelWidth - displayWidth) / 2);
          centerY = Math.max(0, (templateSize.pixelHeight - displayHeight) / 2);
          console.log(`🎯 Centering PDF element: template=${templateSize.pixelWidth}x${templateSize.pixelHeight}px, element=${displayWidth}x${displayHeight}px, position=(${centerX},${centerY})`);
        } else {
          // Regular elements: use mm dimensions for centering  
          centerX = Math.max(0, (templateSize.width - displayWidth) / 2);
          centerY = Math.max(0, (templateSize.height - displayHeight) / 2);
          console.log(`🎯 Centering regular element: template=${templateSize.width}x${templateSize.height}mm, element=${displayWidth}x${displayHeight}mm, position=(${centerX},${centerY})`);
        }

        const canvasElementData = {
          projectId: projectId,
          logoId: logo.id,
          x: centerX,
          y: centerY,
          width: displayWidth,  // Use exact dimensions without rounding
          height: displayHeight, // Use exact dimensions without rounding
          rotation: 0,
          zIndex: logos.length - 1,
          isVisible: true,
          isLocked: false,
          colorOverrides: null
        };

        await storage.createCanvasElement(canvasElementData);
        console.log(`✅ ENHANCED: Canvas element created successfully`);
        
        } catch (fileError) {
          console.error(`❌ Error processing file ${file.originalname}:`, fileError);
          // Skip this file and continue with next one
          continue;
        }
      }

      console.log('🚀 ENHANCED: Returning logos to client:', logos.map(logo => ({
        id: logo.id,
        filename: logo.filename,
        originalName: logo.originalName,
        isPdfWithRasterOnly: logo.isPdfWithRasterOnly,
        isCMYKPreserved: logo.isCMYKPreserved,
        mimeType: logo.mimeType
      })));
      res.json(logos);
    } catch (error) {
      console.error('Enhanced upload error:', error);
      res.status(500).json({ error: 'Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // TEMPORARILY DISABLE imposition routes to test CMYK detection
  // setupImpositionRoutes(app, storage);

  // Other essential routes
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await storage.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get projects' });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const project = await storage.createProject(req.body);
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

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

  // ====== PDF GENERATION ROUTE ======
  app.post('/api/projects/:projectId/generate-pdf', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      console.log('📄 Generating PDF for project:', projectId);
      
      // Get project and validate
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Use OriginalWorkingGenerator for PDF generation
      const { OriginalWorkingGenerator } = await import('./original-working-generator');
      const generator = new OriginalWorkingGenerator();
      
      // Build PDF data object
      const logos = await storage.getLogosByProject(projectId);
      const canvasElements = await storage.getCanvasElementsByProject(projectId);
      
      const pdfData = {
        projectId: projectId,
        logos,
        canvasElements,
        templateSize: await storage.getTemplateSize(project.templateSize),
        garmentColor: project.garmentColor,
        appliqueBadgesForm: project.appliqueBadgesForm
      };
      
      const pdfBuffer = await generator.generatePDF(pdfData);
      
      // Set headers for PDF response
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Content-Disposition', 'inline'); // For preview, use 'attachment' for download
      
      res.send(pdfBuffer);
      
    } catch (error) {
      console.error('PDF generation error:', error);
      res.status(500).json({ error: 'Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error') });
    }
  });

  // Essential routes continue here...
  app.patch('/api/projects/:projectId', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const updateData = req.body;
      
      const updatedProject = await storage.updateProject(projectId, updateData);
      res.json(updatedProject);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  app.delete('/api/projects/:projectId/logos/:logoId', async (req, res) => {
    try {
      await storage.deleteLogo(req.params.logoId);
      await storage.deleteCanvasElementsByLogo(req.params.logoId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete logo' });
    }
  });

  // Template sizes route
  app.get('/api/template-sizes', async (req, res) => {
    try {
      const templateSizes = await storage.getTemplateSizes();
      res.json(templateSizes);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get template sizes' });
    }
  });

  // Canvas element routes
  app.patch('/api/canvas-elements/:id', async (req, res) => {
    try {
      const element = await storage.updateCanvasElement(req.params.id, req.body);
      res.json(element);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update canvas element' });
    }
  });

  app.delete('/api/canvas-elements/:id', async (req, res) => {
    try {
      await storage.deleteCanvasElement(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete canvas element' });
    }
  });

  app.post('/api/canvas-elements/:id/duplicate', async (req, res) => {
    try {
      const duplicated = await storage.duplicateCanvasElement(req.params.id);
      res.json(duplicated);
    } catch (error) {
      res.status(500).json({ error: 'Failed to duplicate canvas element' });
    }
  });

  return app;
}
