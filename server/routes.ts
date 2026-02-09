import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
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
  insertVectorizationRequestSchema,
  insertSupportTicketSchema
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

const SERVER_BUILD_VERSION = Date.now().toString();

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
      
      // Use Ghostscript to render PDF directly as PNG with TRANSPARENCY
      // CRITICAL: Use pngalpha device to preserve transparent backgrounds
      // Using 300 DPI for maximum detail
      const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r300 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${outputPath}" "${pdfPath}"`;
      
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

  app.post('/api/embroidery-preview', async (req, res) => {
    try {
      const { projectId, garmentColor } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: 'Project ID is required' });
      }

      const { GoogleGenAI, Modality } = await import('@google/genai');
      const fs = await import('fs/promises');
      const path = await import('path');
      const sharp = (await import('sharp')).default;

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const canvasElements = await storage.getCanvasElementsByProject(projectId);
      const logos = await storage.getLogosByProject(projectId);

      const badgeElements = canvasElements.filter(el => (el.canvasIndex || 0) === 0);
      const embElements = canvasElements.filter(el => (el.canvasIndex || 0) === 1);

      if (badgeElements.length === 0) {
        return res.status(400).json({ error: 'No badge artwork elements found on Canvas 1' });
      }
      if (embElements.length === 0) {
        return res.status(400).json({ error: 'No embroidery elements found on Canvas 2' });
      }

      const uploadsDir = path.join(process.cwd(), 'uploads');

      const loadLogoAsBuffer = async (logo: any): Promise<{ buffer: Buffer; mime: string } | null> => {
        try {
          const filename = logo.canvasFallbackFilename || logo.previewFilename || logo.filename;
          const filePath = path.join(uploadsDir, filename);
          
          const isPdf = filename.endsWith('.pdf');
          const isSvg = filename.endsWith('.svg');
          
          if (isPdf) {
            const svgFilename = filename.replace(/\.pdf$/, '') + '.svg';
            const svgPath = path.join(uploadsDir, svgFilename);
            try {
              const svgBuffer = await fs.readFile(svgPath);
              const pngBuffer = await sharp(svgBuffer, { density: 300 })
                .resize(1500, 1500, { fit: 'inside', withoutEnlargement: false })
                .png()
                .toBuffer();
              console.log(`[Embroidery Preview] Converted SVG (from PDF) to high-res PNG: ${pngBuffer.length} bytes`);
              return { buffer: pngBuffer, mime: 'image/png' };
            } catch (svgErr) {
              console.log(`[Embroidery Preview] No SVG found for PDF, trying PNG fallback`);
              const pngFallback = filename.replace(/\.pdf$/, '') + '_raster_direct_' + '*.png';
              const { execSync } = await import('child_process');
              try {
                const pngFiles = execSync(`ls ${uploadsDir}/${filename.replace(/\.pdf$/, '')}*.png 2>/dev/null`).toString().trim().split('\n').filter(Boolean);
                if (pngFiles.length > 0) {
                  const pngBuffer = await fs.readFile(pngFiles[0]);
                  return { buffer: pngBuffer, mime: 'image/png' };
                }
              } catch {}
              const buffer = await fs.readFile(filePath);
              return { buffer, mime: 'application/pdf' };
            }
          }
          
          const buffer = await fs.readFile(filePath);
          if (isSvg) {
            const pngBuffer = await sharp(buffer, { density: 300 })
              .resize(1500, 1500, { fit: 'inside', withoutEnlargement: false })
              .png()
              .toBuffer();
            console.log(`[Embroidery Preview] Converted SVG to high-res PNG: ${pngBuffer.length} bytes`);
            return { buffer: pngBuffer, mime: 'image/png' };
          }
          const mime = logo.mimeType || 'image/png';
          return { buffer, mime };
        } catch (e) {
          console.error(`[Embroidery Preview] Failed to load logo ${logo.id}:`, e);
          return null;
        }
      };

      const badgeLogo = logos.find(l => l.id === badgeElements[0]?.logoId);
      const embLogo = logos.find(l => l.id === embElements[0]?.logoId);

      if (!badgeLogo || !embLogo) {
        return res.status(400).json({ error: 'Could not find logo files for badge or embroidery elements' });
      }

      const badgeData = await loadLogoAsBuffer(badgeLogo);
      const embData = await loadLogoAsBuffer(embLogo);

      if (!badgeData || !embData) {
        return res.status(500).json({ error: 'Failed to load logo files from disk' });
      }

      console.log('[Embroidery Preview] Step 1: Loading logo files from disk');
      console.log(`[Embroidery Preview] Badge logo: ${badgeLogo.originalFilename} (${badgeData.buffer.length} bytes)`);
      console.log(`[Embroidery Preview] Embroidery logo: ${embLogo.originalFilename} (${embData.buffer.length} bytes)`);

      const badgeBase64 = badgeData.buffer.toString('base64');
      const embBase64 = embData.buffer.toString('base64');

      const ai = new GoogleGenAI({
        apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
        },
      });

      const fsSync = await import('fs');
      const stitchRefPath = path.join(process.cwd(), 'server', 'assets', 'stitch-reference.png');
      let stitchRefBase64 = '';
      try {
        stitchRefBase64 = fsSync.readFileSync(stitchRefPath).toString('base64');
      } catch (e) {
        console.log('[Embroidery Preview] Warning: stitch reference image not found');
      }

      console.log('[Embroidery Preview] Step 2: Sending to Gemini');

      const promptParts: any[] = [
        { text: "I need a photorealistic preview of a finished applique badge. This badge has TWO layers:\n\nImage 1 (PRINTED LAYER): The complete badge with all printed artwork — icons, images, text, and decorative elements. Everything in this image is FLAT PRINTED onto fabric.\n\nImage 2 (EMBROIDERY MASK): This shows ONLY the specific shapes that will be machine-embroidered on top of the printed badge. These are typically outline borders and text banners." },
        { inlineData: { data: badgeBase64, mimeType: badgeData.mime } },
        { inlineData: { data: embBase64, mimeType: embData.mime } },
        { text: "Generate one photorealistic image of the finished badge:\n\nRULE 1 — PRINTED ELEMENTS: Every element from Image 1 that is NOT in Image 2 must remain as a smooth, flat print with zero embroidery texture. This includes all icons, small crests, crosses, images, and interior artwork. They must look exactly like Image 1 — crisp, flat, and untouched.\n\nRULE 2 — EMBROIDERED ELEMENTS: ALL shapes, text, outlines, and elements visible in Image 2 must be rendered as photorealistic machine satin-stitch embroidery — this includes ALL text (large and small), ALL outlines, ALL borders, and ANY other shape in Image 2. Every single element in Image 2 gets embroidered, no exceptions. Each embroidered element should be a SINGLE thick raised cord with fine perpendicular thread texture, natural 3D relief, and subtle thread sheen. Do NOT render double outlines.\n\nRULE 3 — NO ADDITIONS: Do NOT add any elements, borders, circles, or decorations not present in Image 1 or Image 2.\n\nKeep the exact same design, layout, colors, shapes and proportions. Output one clean image on a plain neutral background with generous padding around ALL edges — ensure the ENTIRE badge is fully visible with nothing cropped or cut off at the top, bottom, left, or right. Leave at least 10% blank space around every edge." },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{
          role: "user",
          parts: promptParts,
        }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidate = response.candidates?.[0];
      const textPart = candidate?.content?.parts?.find((part: any) => part.text);
      if (textPart) {
        console.log('[Embroidery Preview] Gemini text:', textPart.text);
      }
      const imagePart = candidate?.content?.parts?.find(
        (part: any) => part.inlineData
      );

      if (!imagePart?.inlineData?.data) {
        console.error('No image data in Gemini response');
        return res.status(500).json({ error: 'Failed to generate embroidery preview' });
      }

      console.log('[Embroidery Preview] Step 3: Processing Gemini result');

      const timestamp = Date.now();
      const finalBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
      const compositeBase64 = finalBuffer.toString('base64');

      if (projectId) {
        const savedFilename = `embroidery_preview_${projectId}_${timestamp}.png`;
        const savedPath = path.join(process.cwd(), 'uploads', savedFilename);
        await fs.writeFile(savedPath, finalBuffer);
        await storage.updateProject(projectId, { embroideryPreviewPath: savedPath });
        console.log(`[Embroidery Preview] Saved preview to ${savedPath} for project ${projectId}`);
      }

      res.json({
        imageData: `data:image/png;base64,${compositeBase64}`,
      });
    } catch (error: any) {
      console.error('Embroidery preview generation error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate embroidery preview' });
    }
  });

  app.get('/api/version', (_req, res) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store',
    });
    res.json({ version: SERVER_BUILD_VERSION });
  });
  
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
      console.log(`🎨 Project garmentColors:`, project.garmentColors);
      console.log(`🎨 Project garmentColor (single):`, project.garmentColor);

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

      // Check if any logos have original PDFs that should be embedded directly
      const hasOriginalPDFs = Object.values(logosObject).some(logo => 
        logo.originalFilename && logo.originalMimeType === 'application/pdf'
      );

      // USE ROBUST PDF GENERATOR - Embeds original PDFs to preserve CMYK colors and vectors
      if (hasOriginalPDFs) {
        console.log('📄 USING ORIGINAL PDFs: Preserving exact CMYK colors and vectors');
        try {
          const { RobustPDFGenerator } = await import('./robust-pdf-generator');
          const generator = new RobustPDFGenerator();
          
          const pdfBuffer = await generator.generatePDF({
            projectId: project.id,
            projectName: project.name || 'Untitled',
            templateSize,
            canvasElements,
            logos,
            garmentColor: project.garmentColor,
            garmentColors: project.garmentColors,
            quantity: project.quantity || 1,
            useOriginalGarmentPages: project.useOriginalGarmentPages || false
          });
          
          console.log(`✅ Robust PDF generated with original CMYK colors: ${pdfBuffer.length} bytes`);
          
          // Check if this is an applique badges project - need to add form page
          const isAppliqueBadges = project.templateSize?.includes('applique') || project.appliqueBadgesForm;
          
          if (isAppliqueBadges && project.appliqueBadgesForm) {
            console.log('📋 Applique Badges project detected with form data - adding specification page');
            try {
              const { AppliqueBadgesPDFGenerator } = await import('./applique-badges-pdf-generator');
              const appliqueGenerator = new AppliqueBadgesPDFGenerator();
              
              const appliquePdfBytes = await appliqueGenerator.generateAppliquePDF({
                originalPdfBuffer: pdfBuffer,
                appliqueBadgesForm: project.appliqueBadgesForm,
                projectName: project.name,
                embroideryPreviewPath: project.embroideryPreviewPath || undefined
              });
              
              console.log(`✅ Applique Badges PDF with form page: ${appliquePdfBytes.length} bytes`);
              
              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', `attachment; filename="${project.name}_qty${project.quantity}_applique.pdf"`);
              res.send(appliquePdfBytes);
              return;
            } catch (appliqueError) {
              console.error('❌ Applique Badges PDF generation failed:', appliqueError);
              console.log('🔄 Falling back to original PDF without applique form page');
            }
          }
          
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${project.name}_qty${project.quantity}.pdf"`);
          res.send(pdfBuffer);
          return;
        } catch (robustError) {
          console.error('❌ Robust PDF generation failed:', robustError);
          console.log('🔄 Falling back to standard PDF generation');
        }
      }

      // FALLBACK: Standard pdf-lib generation for non-PDF uploads
      console.log('📄 Standard PDF generation (no original PDFs to preserve)');
      
      try {
        const { PDFDocument, rgb, degrees } = await import('pdf-lib');
        const fs = await import('fs');
        
        // Create A3 PDF
        const pdfDoc = await PDFDocument.create();
        const pageWidth = templateSize.width * 2.834645669; // mm to points
        const pageHeight = templateSize.height * 2.834645669;
        
        // CANVAS REPLICA: Match canvas preview exactly with garment colors
        console.log(`🚀 CANVAS REPLICA: Exact canvas preview with garment colors and Adobe CMYK`);
        
        // Collect all unique garment colors from elements
        const uniqueGarmentColors = new Set();
        canvasElements.forEach(element => {
          const elementColor = element.garmentColor || project.garmentColor || '#171816';
          uniqueGarmentColors.add(elementColor);
        });
        
        const allGarmentColors = Array.from(uniqueGarmentColors);
        console.log(`🎨 DEBUG: Found ${allGarmentColors.length} unique garment colors:`, allGarmentColors);
        
        // Function to get color name
        const getColorName = (color: string) => {
          return color === '#FFFFFF' ? 'White' : 
                 color === '#D98F17' ? 'Hi Viz Orange' : 
                 color === '#171816' ? 'Black' : 
                 color === '#1a1a1a' ? 'Black' :
                 color === '#C02300' ? 'Red' :
                 color === '#388032' ? 'HiViz Green' :
                 color === '#FFD700' ? 'Gold' : 
                 color === '#D9D2AB' ? 'Natural' :
                 color === '#8B4513' ? 'Brown' :
                 color === '#4169E1' ? 'Royal Blue' :
                 color === '#DC143C' ? 'Red' :
                 color === '#D2E31D' ? 'Hi Viz' :
                 color === '#90BF33' ? 'Lime Green' :
                 color === '#228B22' ? 'Green' :
                 color === '#C42469' ? 'Heliconia Pink' : `Custom (${color})`;
        };
        
        // Use project garment color as default background, but elements will have individual backgrounds
        const defaultGarmentColor = project.garmentColor || '#171816';
        let defaultGarmentBg = rgb(1, 1, 1); // Default white
        if (defaultGarmentColor.startsWith('#') && defaultGarmentColor.length === 7) {
          const r = parseInt(defaultGarmentColor.slice(1, 3), 16) / 255;
          const g = parseInt(defaultGarmentColor.slice(3, 5), 16) / 255;
          const b = parseInt(defaultGarmentColor.slice(5, 7), 16) / 255;
          defaultGarmentBg = rgb(r, g, b);
        }
        
        // Page 1: COMPLETELY TRANSPARENT - just clean vectors
        const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
        console.log(`✅ Page 1: TRANSPARENT - clean vectors only`);
        
        // Detect applique template for dual-canvas page structure
        const isAppliqueTemplate = project.templateSize?.includes('applique') || !!project.appliqueBadgesForm;
        const badgeElements = isAppliqueTemplate 
          ? canvasElements.filter(el => !el.canvasIndex || el.canvasIndex === 0)
          : canvasElements;
        const embroideryElements = isAppliqueTemplate 
          ? canvasElements.filter(el => el.canvasIndex === 1)
          : [];
        
        if (isAppliqueTemplate) {
          console.log(`📋 Applique fallback: Badge elements: ${badgeElements.length}, Embroidery elements: ${embroideryElements.length}`);
        }
        
        // Multi-Color Orders: Create one page per garment color
        const garmentColorPages: Array<{ page: any; color: string; colorName: string; quantity: number }> = [];
        
        if (isAppliqueTemplate) {
          // Applique templates skip garment color pages - handled separately below
          console.log(`📋 Applique template: skipping garment color pages`);
        } else if (project.garmentColors && Array.isArray(project.garmentColors) && project.garmentColors.length > 0) {
          console.log(`🎨 Multi-Color Order: Creating ${project.garmentColors.length} pages for different garment colors`);
          
          for (const garmentColorItem of project.garmentColors) {
            const page = pdfDoc.addPage([pageWidth, pageHeight]);
            
            // Parse and set background color
            const colorHex = garmentColorItem.color;
            let bgColor = rgb(1, 1, 1);
            if (colorHex.startsWith('#') && colorHex.length === 7) {
              const r = parseInt(colorHex.slice(1, 3), 16) / 255;
              const g = parseInt(colorHex.slice(3, 5), 16) / 255;
              const b = parseInt(colorHex.slice(5, 7), 16) / 255;
              bgColor = rgb(r, g, b);
            }
            
            page.drawRectangle({
              x: 0, y: 0,
              width: pageWidth, height: pageHeight,
              color: bgColor
            });
            
            garmentColorPages.push({
              page,
              color: colorHex,
              colorName: garmentColorItem.colorName,
              quantity: garmentColorItem.quantity
            });
            
            console.log(`✅ Created page for ${garmentColorItem.colorName} (Qty: ${garmentColorItem.quantity})`);
          }
        } else {
          // Backward compatibility: Single color mode (original behavior)
          console.log(`📄 Single Color Mode: Creating one preview page`);
          const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
          
          page2.drawRectangle({
            x: 0, y: 0, 
            width: pageWidth, height: pageHeight,
            color: defaultGarmentBg
          });
          
          garmentColorPages.push({
            page: page2,
            color: defaultGarmentColor,
            colorName: getColorName(defaultGarmentColor),
            quantity: project.quantity || 1
          });
          
          console.log(`✅ Page 2: ${getColorName(defaultGarmentColor)} background for preview (${defaultGarmentColor})`);
        }
        
        // Process canvas elements (use badge-only elements for applique templates)
        const elementsToProcess = isAppliqueTemplate ? badgeElements : canvasElements;
        for (let element of elementsToProcess) {
          const logo = Object.values(logosObject).find((l: any) => l.id === element.logoId);
          if (!logo) continue;
          
          // CRITICAL FIX: Use tight-content SVG when available (already has correct bounds)
          // Original PDF has full artboard dimensions which causes scaling issues
          const originalPdfPath = path.join(process.cwd(), 'uploads', (logo as any).originalFilename || '');
          const svgPath = path.join(process.cwd(), 'uploads', (logo as any).filename);
          
          let usePath = svgPath;
          let useOriginalPdf = false;
          
          // CRITICAL: Prefer tight-content SVG over original PDF to avoid scaling issues
          // The tight-content SVG already has the exact content bounds we detected
          const isTightContent = (logo as any).filename && (logo as any).filename.includes('_tight-content');
          
          if (isTightContent) {
            console.log(`🎯 USING TIGHT-CONTENT SVG: ${(logo as any).filename} (exact content bounds)`);
            usePath = svgPath;
            useOriginalPdf = false;
          } else if ((logo as any).originalFilename && fs.existsSync(originalPdfPath)) {
            console.log(`🎯 USING ORIGINAL PDF WITH EXACT CMYK COLORS: ${(logo as any).originalFilename}`);
            usePath = originalPdfPath;
            useOriginalPdf = true;
          } else {
            console.log(`📄 Processing SVG: ${(logo as any).filename}`);
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
            
            // Calculate dimensions in points
            const widthPts = scaledWidth * 2.834645669;
            const heightPts = scaledHeight * 2.834645669;
            
            console.log(`📐 Element: ${element.width.toFixed(1)}×${element.height.toFixed(1)}mm → ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
            console.log(`📐 Visual size (rotated ${rotation}°): ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}mm`);
            
            let vectorBytes: Buffer;
            let isRasterImage = false; // Track if we're dealing with a raster image
            let rasterImageBytes: Buffer | null = null;
            
            // Check if logo is a PNG/JPEG raster image (not a vector)
            const logoMimeType = (logo as any).mimeType || (logo as any).originalMimeType;
            const isRasterFile = logoMimeType === 'image/png' || logoMimeType === 'image/jpeg' || 
                                 ((logo as any).filename && ((logo as any).filename.endsWith('.png') || (logo as any).filename.endsWith('.jpg') || (logo as any).filename.endsWith('.jpeg')));
            
            if (isRasterFile) {
              console.log(`🖼️ RASTER IMAGE DETECTED: ${(logo as any).filename} - using embedPng/embedJpg`);
              isRasterImage = true;
              rasterImageBytes = fs.readFileSync(svgPath); // svgPath actually points to the image file
            } else if (useOriginalPdf) {
              // CRITICAL FIX: Use original PDF at full page dimensions - NO cropping to painted pixels
              // Cropping to content bounds removes white elements which is unacceptable
              console.log(`🎯 USING ORIGINAL PDF AT FULL PAGE DIMENSIONS - NO cropping to painted pixels`);
              console.log(`📄 This preserves white elements and uses the intended artwork size from the PDF`);
              
              vectorBytes = fs.readFileSync(originalPdfPath);
            } else {
              // Fallback: Process corrupted SVG
              let svgContent = fs.readFileSync(svgPath, 'utf8');
              
              // CRITICAL: Check if this is a vectorized file that needs color preservation
              const isAIVectorized = svgContent.includes('data-ai-vectorized="true"') || 
                                    svgContent.includes('AI_VECTORIZED_FILE');
              
              if (isAIVectorized) {
                console.log(`🤖 AI-VECTORIZED FILE DETECTED: Preserving exact canvas colors for PDF`);
                
                // For vectorized files, we need to LIGHTEN colors to compensate for PDF darkening
                // Apply inverse color correction to counteract rsvg-convert darkening
                svgContent = svgContent.replace(/fill="rgb\(([^)]+)\)"/g, (match, rgbValues) => {
                  try {
                    const [r, g, b] = rgbValues.split(',').map((v: string) => parseInt(v.trim()));
                    
                    // Apply lightening to compensate for PDF conversion darkening
                    // This reverses the darkening effect that rsvg-convert applies
                    const lighterR = Math.min(255, Math.round(r * 1.15)); // 15% lighter
                    const lighterG = Math.min(255, Math.round(g * 1.15));
                    const lighterB = Math.min(255, Math.round(b * 1.15));
                    
                    return `fill="rgb(${lighterR}, ${lighterG}, ${lighterB})"`;
                  } catch {
                    return match; // Keep original if parsing fails
                  }
                });
                
                // Also handle hex colors
                svgContent = svgContent.replace(/fill="#([a-fA-F0-9]{6})"/g, (match, hex) => {
                  try {
                    const r = parseInt(hex.substring(0, 2), 16);
                    const g = parseInt(hex.substring(2, 4), 16);
                    const b = parseInt(hex.substring(4, 6), 16);
                    
                    // Apply lightening
                    const lighterR = Math.min(255, Math.round(r * 1.15));
                    const lighterG = Math.min(255, Math.round(g * 1.15));
                    const lighterB = Math.min(255, Math.round(b * 1.15));
                    
                    const newHex = [lighterR, lighterG, lighterB]
                      .map(v => v.toString(16).padStart(2, '0'))
                      .join('');
                    
                    return `fill="#${newHex}"`;
                  } catch {
                    return match;
                  }
                });
                
                console.log(`✅ Applied color lightening compensation for PDF conversion`);
              }
              
              // Remove any background rectangles or fills that create boundaries
              svgContent = svgContent.replace(/<rect[^>]*fill="white"[^>]*>/g, '');
              svgContent = svgContent.replace(/<rect[^>]*fill="#ffffff"[^>]*>/g, '');
              svgContent = svgContent.replace(/<rect[^>]*fill="#FFFFFF"[^>]*>/g, '');
              
              console.log(`🎯 Removed background fills but kept viewBox for proper sizing`);
              
              // CRITICAL: Check if SVG contains embedded images (base64 data URIs in <image> tags)
              // rsvg-convert strips these out, but Inkscape preserves them
              const hasEmbeddedImages = svgContent.includes('<image') && svgContent.includes('data:image/');
              
              if (hasEmbeddedImages) {
                console.log(`🖼️ EMBEDDED IMAGES DETECTED: Preprocessing for Inkscape compatibility`);
                
                // INKSCAPE FIX: Convert CSS-based clip-path and mask to XML attributes
                // Illustrator uses CSS syntax which Inkscape doesn't support
                // Parse and extract CSS rules from <style> tags
                const styleMatches = svgContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
                if (styleMatches) {
                  const clipPathMap = new Map();
                  const maskMap = new Map();
                  
                  styleMatches.forEach(styleBlock => {
                    const styleContent = styleBlock.replace(/<\/?style[^>]*>/g, '');
                    // Extract clip-path and mask declarations
                    const classRules = styleContent.match(/\.([a-zA-Z0-9-_]+)\s*{[^}]*}/g) || [];
                    
                    classRules.forEach(rule => {
                      const classMatch = rule.match(/\.([a-zA-Z0-9-_]+)/);
                      if (!classMatch) return;
                      const className = classMatch[1];
                      
                      const clipMatch = rule.match(/clip-path\s*:\s*url\(#([^)]+)\)/);
                      if (clipMatch) clipPathMap.set(className, clipMatch[1]);
                      
                      const maskMatch = rule.match(/mask\s*:\s*url\(#([^)]+)\)/);
                      if (maskMatch) maskMap.set(className, maskMatch[1]);
                    });
                  });
                  
                  // Apply clip-path and mask as XML attributes
                  clipPathMap.forEach((id, className) => {
                    svgContent = svgContent.replace(
                      new RegExp(`class="([^"]*\\b${className}\\b[^"]*)"`, 'g'),
                      `class="$1" clip-path="url(#${id})"`
                    );
                  });
                  
                  maskMap.forEach((id, className) => {
                    svgContent = svgContent.replace(
                      new RegExp(`class="([^"]*\\b${className}\\b[^"]*)"`, 'g'),
                      `class="$1" mask="url(#${id})"`
                    );
                  });
                  
                  console.log(`✅ Converted CSS clip-path/mask to XML attributes for Inkscape`);
                }
              }
              
              // Create temp files
              const ts = Date.now() + Math.random();
              const tempSvg = path.join(process.cwd(), 'uploads', `temp_${ts}.svg`);
              const tempPdf = path.join(process.cwd(), 'uploads', `temp_${ts}.pdf`);
              
              fs.writeFileSync(tempSvg, svgContent);
              
              if (hasEmbeddedImages) {
                console.log(`🖼️ EMBEDDED IMAGES: Using high-DPI conversion for Illustrator`);
                // CRITICAL: Use 300 DPI for print-quality embedded images
                // Calculate pixel dimensions at 300 DPI instead of 72 DPI
                const dpi = 300;
                const widthPx = Math.round(widthPts * dpi / 72);
                const heightPx = Math.round(heightPts * dpi / 72);
                
                // rsvg-convert with high DPI for embedded images
                const rsvgCmd = `rsvg-convert -f pdf -d ${dpi} -p ${dpi} -w ${widthPx} -h ${heightPx} -o "${tempPdf}" "${tempSvg}"`;
                execSync(rsvgCmd);
                console.log(`✅ High-DPI SVG → PDF (${dpi} DPI): ${widthPts.toFixed(0)}×${heightPts.toFixed(0)}pts @ ${widthPx}×${heightPx}px`);
              } else {
                // Convert SVG → PDF with transparency preserved (no background)
                const rsvgCmd = `rsvg-convert -f pdf -b transparent -w ${widthPts.toFixed(0)} -h ${heightPts.toFixed(0)} -o "${tempPdf}" "${tempSvg}"`;
                execSync(rsvgCmd);
                console.log(`✅ SVG → PDF with transparency: ${widthPts.toFixed(0)}×${heightPts.toFixed(0)}pts`);
              }
              
              vectorBytes = fs.readFileSync(tempPdf);
              
              // Cleanup temp files
              [tempSvg, tempPdf].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
            }
            
            // Load and embed artwork - handle raster images differently
            let embeddedPage: any = null;
            let embeddedImage: any = null;
            
            if (isRasterImage && rasterImageBytes) {
              // Embed raster image (PNG/JPEG)
              const filename = (logo as any).filename || '';
              if (filename.endsWith('.png') || logoMimeType === 'image/png') {
                embeddedImage = await pdfDoc.embedPng(rasterImageBytes);
                console.log(`✅ Embedded PNG image: ${embeddedImage.width}×${embeddedImage.height}px`);
              } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg') || logoMimeType === 'image/jpeg') {
                embeddedImage = await pdfDoc.embedJpg(rasterImageBytes);
                console.log(`✅ Embedded JPEG image: ${embeddedImage.width}×${embeddedImage.height}px`);
              } else {
                // Fallback - try PNG
                embeddedImage = await pdfDoc.embedPng(rasterImageBytes);
                console.log(`✅ Embedded image (fallback PNG): ${embeddedImage.width}×${embeddedImage.height}px`);
              }
              
              // CRITICAL: Scale image to fit element bounds while preserving aspect ratio
              const imageAspect = embeddedImage.width / embeddedImage.height;
              const elementAspect = widthPts / heightPts;
              
              let adjustedWidthPts = widthPts;
              let adjustedHeightPts = heightPts;
              
              if (imageAspect > elementAspect) {
                // Image is wider - fit to width, adjust height
                adjustedHeightPts = widthPts / imageAspect;
              } else {
                // Image is taller - fit to height, adjust width
                adjustedWidthPts = heightPts * imageAspect;
              }
              
              // Update dimensions for embedding
              console.log(`📐 Original element: ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
              console.log(`📐 Image native aspect: ${imageAspect.toFixed(2)}, element aspect: ${elementAspect.toFixed(2)}`);
              console.log(`📐 Adjusted to preserve ratio: ${adjustedWidthPts.toFixed(1)}×${adjustedHeightPts.toFixed(1)}pts`);
              
              // Store adjusted dimensions for drawing
              (element as any).adjustedWidthPts = adjustedWidthPts;
              (element as any).adjustedHeightPts = adjustedHeightPts;
            } else {
              // Load and embed PDF artwork
              const vectorDoc = await PDFDocument.load(vectorBytes!);
              [embeddedPage] = await pdfDoc.embedPdf(vectorDoc);
            }
            
            // The PDF is now cropped to content bounds, so when we scale it to canvas dimensions
            // the content will appear at the correct size
            
            // POSITION-ACCURATE SYSTEM
            // Use actual canvas positions with rotation adjustments
            console.log(`🔄 Element rotation: ${rotation}°`);
            
            // Convert center-based coordinates to PDF coordinates
            // Element x,y is the center position relative to template center (0,0)
            const templateWidthMM = templateSize?.width || 297; // Use actual template width
            const templateHeightMM = templateSize?.height || 420; // Use actual template height
            const templateCenterXMM = templateWidthMM / 2;
            const templateCenterYMM = templateHeightMM / 2;
            
            // Convert element center position from relative to absolute
            const elementCenterXMM = templateCenterXMM + element.x;
            const elementCenterYMM = templateCenterYMM + element.y;
            
            // Calculate bottom-left corner from center position for PDF
            // PDF uses bottom-left coordinate system
            const xPosPts = (elementCenterXMM - element.width / 2) * 2.834645669;
            const yPosPts = pageHeight - ((elementCenterYMM + element.height / 2) * 2.834645669);
            
            console.log(`📍 Canvas position: ${element.x.toFixed(1)}×${element.y.toFixed(1)}mm`)
            console.log(`📍 PDF position: (${xPosPts.toFixed(1)}, ${yPosPts.toFixed(1)})pts`);
            
            // Helper function to draw either embedded page or embedded image
            // For raster images, use adjusted dimensions to preserve aspect ratio
            const adjustedWidthPts = (element as any).adjustedWidthPts || widthPts;
            const adjustedHeightPts = (element as any).adjustedHeightPts || heightPts;
            
            // Calculate offset to center the aspect-corrected image within the element bounds
            const xOffset = (widthPts - adjustedWidthPts) / 2;
            const yOffset = (heightPts - adjustedHeightPts) / 2;
            
            const drawArtwork = (targetPage: any, options: { x: number; y: number; width: number; height: number; rotate?: any }) => {
              if (embeddedImage) {
                // Use adjusted dimensions for raster images to preserve aspect ratio
                // Also apply offset to center within original bounds
                targetPage.drawImage(embeddedImage, {
                  ...options,
                  x: options.x + xOffset,
                  y: options.y + yOffset,
                  width: adjustedWidthPts,
                  height: adjustedHeightPts
                });
              } else if (embeddedPage) {
                targetPage.drawPage(embeddedPage, options);
              }
            };
            
            // Embed artwork on both pages with rotation
            if (rotation === 90) {
              // For 90° rotation, dimensions swap visually
              const visualWidth = heightPts;
              const visualHeight = widthPts;
              
              // For 90° rotation with center-based positioning:
              // We want the content to appear rotated around its center
              // pdf-lib rotates around bottom-left, so we need to adjust
              const centerXPts = xPosPts + widthPts / 2;  // Center X before rotation
              const centerYPts = yPosPts + heightPts / 2;  // Center Y before rotation
              
              // After 90° rotation, adjust for new bottom-left position
              const rotatedX = centerXPts + heightPts / 2;  // Shift by half the new width
              const rotatedY = centerYPts - widthPts / 2;   // Shift by half the new height
              
              console.log(`📐 90° rotation: Visual dims ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}pts`);
              console.log(`📐 Positioning at (${rotatedX.toFixed(1)}, ${rotatedY.toFixed(1)})`);
              console.log(`📐 Original dims: ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts`);
              
              // Embed with 90° rotation on page 1
              drawArtwork(page1, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(90)
              });
              console.log(`✅ Page 1: Artwork embedded with 90° rotation`);
              
              // Embed with 90° rotation on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: rotatedX,
                  y: rotatedY,
                  width: widthPts,
                  height: heightPts,
                  rotate: degrees(90)
                });
              }
              console.log(`✅ All garment color pages: Artwork embedded with 90° rotation`);
            } else if (rotation === 180) {
              // For 180° rotation, dimensions stay the same
              const visualWidth = widthPts;
              const visualHeight = heightPts;
              
              // For 180° rotation with center-based positioning:
              // Content should appear flipped around its center
              const centerXPts = xPosPts + widthPts / 2;  // Center X
              const centerYPts = yPosPts + heightPts / 2;  // Center Y
              
              // After 180° rotation, adjust for new bottom-left position
              const rotatedX = centerXPts + widthPts / 2;  // Shift right by half width
              const rotatedY = centerYPts + heightPts / 2;  // Shift up by half height
              
              console.log(`📐 180° rotation: Visual dims ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}pts`);
              console.log(`📐 Positioning at (${rotatedX.toFixed(1)}, ${rotatedY.toFixed(1)})`);
              
              // Embed with 180° rotation on page 1
              drawArtwork(page1, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(180)
              });
              console.log(`✅ Page 1: Artwork embedded with 180° rotation`);
              
              // Embed with 180° rotation on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: rotatedX,
                  y: rotatedY,
                  width: widthPts,
                  height: heightPts,
                  rotate: degrees(180)
                });
              }
              console.log(`✅ All garment color pages: Artwork embedded with 180° rotation`);
            } else if (rotation === 270) {
              // For 270° rotation, dimensions swap visually
              const visualWidth = heightPts;
              const visualHeight = widthPts;
              
              // For 270° rotation with center-based positioning:
              // Content rotates counter-clockwise around its center
              const centerXPts = xPosPts + widthPts / 2;  // Center X
              const centerYPts = yPosPts + heightPts / 2;  // Center Y
              
              // After 270° rotation, adjust for new bottom-left position
              const rotatedX = centerXPts - heightPts / 2;  // Shift left by half the new width
              const rotatedY = centerYPts + widthPts / 2;   // Shift up by half the new height
              
              console.log(`📐 270° rotation: Visual dims ${visualWidth.toFixed(1)}×${visualHeight.toFixed(1)}pts`);
              console.log(`📐 Positioning at (${rotatedX.toFixed(1)}, ${rotatedY.toFixed(1)})`);
              
              // Embed with 270° rotation on page 1
              drawArtwork(page1, {
                x: rotatedX,
                y: rotatedY,
                width: widthPts,
                height: heightPts,
                rotate: degrees(270)
              });
              console.log(`✅ Page 1: Artwork embedded with 270° rotation`);
              
              // Embed with 270° rotation on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: rotatedX,
                  y: rotatedY,
                  width: widthPts,
                  height: heightPts,
                  rotate: degrees(270)
                });
              }
              console.log(`✅ All garment color pages: Artwork embedded with 270° rotation`);
            } else {
              // No rotation - use direct position
              console.log(`📐 No rotation: Positioning at (${xPosPts.toFixed(1)}, ${yPosPts.toFixed(1)})`);
              
              drawArtwork(page1, {
                x: xPosPts,
                y: yPosPts,
                width: widthPts,
                height: heightPts
              });
              console.log(`✅ Page 1: Artwork embedded at exact canvas position`);
              
              // Embed on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: xPosPts,
                  y: yPosPts,
                  width: widthPts,
                  height: heightPts
                });
              }
              console.log(`✅ All garment color pages: Artwork embedded at exact canvas position`);
            }
            
            // Cleanup handled inside each branch
            
          } catch (error) {
            console.log(`❌ Element processing failed: ${error}`);
          }
        }
        
        // Add project info and garment color-specific information to each page
        for (const garmentPageInfo of garmentColorPages) {
          const textColor = garmentPageInfo.color === '#FFFFFF' ? rgb(0, 0, 0) : rgb(1, 1, 1);
          
          garmentPageInfo.page.drawText(`Project: ${project.name || 'Untitled'}`, { 
            x: 20, y: pageHeight - 40, size: 12, color: textColor 
          });
          garmentPageInfo.page.drawText(`Garment Color: ${garmentPageInfo.colorName}`, { 
            x: 20, y: pageHeight - 60, size: 12, color: textColor 
          });
          garmentPageInfo.page.drawText(`Quantity: ${garmentPageInfo.quantity}`, { 
            x: 20, y: pageHeight - 80, size: 12, color: textColor 
          });
          
          console.log(`✅ Added footer to ${garmentPageInfo.colorName} page (Qty: ${garmentPageInfo.quantity})`);
        }
        
        // For applique templates: add embroidery page (P2) with canvasIndex=1 elements
        if (isAppliqueTemplate && embroideryElements.length > 0) {
          const embroideryPage = pdfDoc.addPage([pageWidth, pageHeight]);
          console.log(`📋 Applique fallback: Creating embroidery page with ${embroideryElements.length} elements`);
          
          for (let element of embroideryElements) {
            console.log(`📋 Emb element: logoId=${element.logoId?.substring(0,8)}, size=${element.width}x${element.height}, pos=(${element.x},${element.y})`);
            const logo = Object.values(logosObject).find((l: any) => l.id === element.logoId);
            if (!logo) {
              console.log(`❌ Emb logo NOT FOUND for logoId: ${element.logoId}`);
              continue;
            }
            
            const svgPath = path.join(process.cwd(), 'uploads', (logo as any).filename);
            console.log(`📋 Emb SVG path: ${svgPath}, exists=${fs.existsSync(svgPath)}`);
            if (!fs.existsSync(svgPath)) {
              console.log(`❌ Emb SVG file NOT FOUND: ${svgPath}`);
              continue;
            }
            
            try {
              const rotation = element.rotation || 0;
              const widthPts = element.width * 2.834645669;
              const heightPts = element.height * 2.834645669;
              
              const templateCenterXmm = templateSize.width / 2;
              const templateCenterYmm = templateSize.height / 2;
              const leftMM = templateCenterXmm + element.x - element.width / 2;
              const topMM = templateCenterYmm + element.y - element.height / 2;
              const xPts = leftMM * 2.834645669;
              const yPts = pageHeight - (topMM * 2.834645669) - heightPts;
              
              const logoFilename = (logo as any).filename as string;
              const logoMimeType = (logo as any).mimeType || '';
              const isRaster = logoFilename.endsWith('.png') || logoFilename.endsWith('.jpg') || logoFilename.endsWith('.jpeg') ||
                               logoMimeType.startsWith('image/png') || logoMimeType.startsWith('image/jpeg');
              console.log(`📋 Emb logo: ${logoFilename}, mime=${logoMimeType}, isRaster=${isRaster}`);
              
              if (isRaster) {
                const imgBytes = fs.readFileSync(svgPath);
                const embeddedImage = (logoFilename.endsWith('.png') || logoMimeType.startsWith('image/png'))
                  ? await pdfDoc.embedPng(imgBytes) 
                  : await pdfDoc.embedJpg(imgBytes);
                embroideryPage.drawImage(embeddedImage, { x: xPts, y: yPts, width: widthPts, height: heightPts });
                console.log(`✅ Emb raster embedded at (${xPts.toFixed(1)}, ${yPts.toFixed(1)}) size=${widthPts.toFixed(1)}x${heightPts.toFixed(1)}`);
              } else {
                const { execSync } = await import('child_process');
                const tempPdfPath = path.join('/tmp', `emb_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
                console.log(`📋 Converting emb SVG to PDF: rsvg-convert -f pdf "${svgPath}" -o "${tempPdfPath}"`);
                try {
                  execSync(`rsvg-convert -f pdf "${svgPath}" -o "${tempPdfPath}"`, { timeout: 15000 });
                } catch (convertErr: any) {
                  console.error(`❌ rsvg-convert failed for embroidery:`, convertErr.message);
                }
                if (fs.existsSync(tempPdfPath)) {
                  const vecBytes = fs.readFileSync(tempPdfPath);
                  const vecDoc = await pdfDoc.embedPdf(vecBytes);
                  console.log(`📋 Embedded PDF pages: ${vecDoc.length}`);
                  if (vecDoc.length > 0) {
                    const embPage = vecDoc[0];
                    embroideryPage.drawPage(embPage, { x: xPts, y: yPts, width: widthPts, height: heightPts });
                    console.log(`✅ Emb vector embedded at (${xPts.toFixed(1)}, ${yPts.toFixed(1)}) size=${widthPts.toFixed(1)}x${heightPts.toFixed(1)}`);
                  } else {
                    console.log(`❌ embedPdf returned 0 pages for embroidery element`);
                  }
                  fs.unlinkSync(tempPdfPath);
                } else {
                  console.log(`❌ rsvg-convert output file not found: ${tempPdfPath}`);
                }
              }
            } catch (embErr) {
              console.error(`❌ Failed to embed embroidery element:`, embErr);
            }
          }
        }
        
        // Check for external file links and add to first garment color page if exists
        const externalFileLogos = logos.filter(logo => logo.externalFileUrl);
        if (externalFileLogos.length > 0 && garmentColorPages.length > 0) {
          const firstPage = garmentColorPages[0];
          const textColor = firstPage.color === '#FFFFFF' ? rgb(0, 0, 0) : rgb(1, 1, 1);
          let yPos = pageHeight - 100;
          
          firstPage.page.drawText(`External Files (download from link):`, { 
            x: 20, y: yPos, size: 11, color: textColor 
          });
          externalFileLogos.forEach((logo, index) => {
            yPos -= 20;
            const serviceLabel = logo.externalFileService?.toUpperCase() || 'LINK';
            firstPage.page.drawText(`${index + 1}. ${logo.originalName} (${serviceLabel})`, { 
              x: 30, y: yPos, size: 10, color: textColor 
            });
            yPos -= 15;
            firstPage.page.drawText(`   ${logo.externalFileUrl}`, { 
              x: 30, y: yPos, size: 8, color: textColor 
            });
          });
          console.log(`✅ Added external file links to first page`);
        }
        
        // Generate initial PDF
        const pdfBytes = await pdfDoc.save();
        console.log(`✅ Initial PDF: ${pdfBytes.length} bytes`);
        
        // Check if this is an applique badges project and process accordingly
        const isAppliqueBadges = project.templateSize?.includes('applique') || project.appliqueBadgesForm;
        
        if (isAppliqueBadges && project.appliqueBadgesForm) {
          console.log('📋 Applique Badges project detected with form data - adding specification page');
          try {
            const { AppliqueBadgesPDFGenerator } = await import('./applique-badges-pdf-generator');
            const appliqueGenerator = new AppliqueBadgesPDFGenerator();
            
            const appliquePdfBytes = await appliqueGenerator.generateAppliquePDF({
              originalPdfBuffer: Buffer.from(pdfBytes),
              appliqueBadgesForm: project.appliqueBadgesForm,
              projectName: project.name,
              embroideryPreviewPath: project.embroideryPreviewPath || undefined
            });
            
            console.log(`✅ Applique Badges PDF with form page: ${appliquePdfBytes.length} bytes`);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${project.name}_qty${project.quantity}_applique.pdf"`);
            res.send(appliquePdfBytes);
            return;
          } catch (error) {
            console.error('❌ Applique Badges PDF generation failed:', error);
            // Fall back to original PDF if applique generation fails
            console.log('🔄 Falling back to original PDF without applique form page');
          }
        }
        
        // CRITICAL: Convert PDF to proper CMYK colorspace with ICC profile for Illustrator
        console.log(`🎨 Converting PDF to CMYK with OutputIntent for Illustrator compatibility...`);
        
        try {
          const { execSync } = await import('child_process');
          const tempRgbPath = path.join('/tmp', `rgb_${Date.now()}.pdf`);
          const tempCmykPath = path.join('/tmp', `cmyk_${Date.now()}.pdf`);
          const iccProfilePath = path.join(process.cwd(), 'server', 'fogra51.icc');
          
          fs.writeFileSync(tempRgbPath, Buffer.from(pdfBytes));
          
          // Use Ghostscript to convert to proper CMYK with OutputIntent
          // The -sOutputICCProfile parameter embeds the ICC profile as OutputIntent
          // -dPDFSETTINGS=/prepress ensures print-ready output
          const gsCommand = [
            'gs',
            '-dNOPAUSE',
            '-dBATCH',
            '-dSAFER',
            '-sDEVICE=pdfwrite',
            '-dPDFSETTINGS=/prepress',
            '-dCompatibilityLevel=1.4',
            '-dProcessColorModel=/DeviceCMYK',
            '-dColorConversionStrategy=/CMYK',
            '-dConvertCMYKImagesToRGB=false',
            '-dDownsampleColorImages=false',
            '-dDownsampleGrayImages=false',
            '-dDownsampleMonoImages=false',
            '-dAutoFilterColorImages=false',
            '-dAutoFilterGrayImages=false',
            '-dColorImageFilter=/FlateEncode',
            '-dGrayImageFilter=/FlateEncode',
            '-dEmbedAllFonts=true',
            '-dSubsetFonts=true',
            fs.existsSync(iccProfilePath) ? `-sOutputICCProfile="${iccProfilePath}"` : '',
            `-sOutputFile="${tempCmykPath}"`,
            `"${tempRgbPath}"`
          ].filter(Boolean).join(' ');
          
          console.log('🔧 Executing Ghostscript CMYK conversion...');
          execSync(gsCommand, { encoding: 'utf8', timeout: 60000 });
          
          if (fs.existsSync(tempCmykPath)) {
            const cmykPdfBytes = fs.readFileSync(tempCmykPath);
            console.log(`✅ CMYK PDF with OutputIntent generated: ${cmykPdfBytes.length} bytes`);
            
            // Cleanup temp files
            fs.unlinkSync(tempRgbPath);
            fs.unlinkSync(tempCmykPath);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${project.name}_qty${project.quantity}.pdf"`);
            res.send(cmykPdfBytes);
            return;
          } else {
            console.warn('⚠️ CMYK conversion failed, returning RGB PDF');
            fs.unlinkSync(tempRgbPath);
          }
        } catch (cmykError) {
          console.error('⚠️ CMYK conversion error:', cmykError);
          console.log('Returning RGB PDF as fallback');
        }
        
        // Fallback: return original RGB PDF if CMYK conversion failed
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${project.name}_qty${project.quantity}.pdf"`);
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
            
            // PASS-THROUGH MODE: Detect page count for multi-page PDFs
            try {
              const { PDFDocument } = await import('pdf-lib');
              const pdfBytes = fs.readFileSync(sourcePdfPath);
              const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
              const pageCount = pdfDoc.getPageCount();
              (file as any).pageCount = pageCount;
              (file as any).hasGarmentPages = pageCount > 1;
              console.log(`📄 PDF page count detected: ${pageCount} pages (hasGarmentPages: ${pageCount > 1})`);
            } catch (pageCountError) {
              console.log('⚠️ Could not detect PDF page count:', pageCountError);
              (file as any).pageCount = 1;
              (file as any).hasGarmentPages = false;
            }
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
                  console.log(`🎯 USING PDF2SVG FOR CONVERSION`);
                  svgCommand = `pdf2svg "${pdfPath}" "${svgPath}"`;
                } catch {
                  // Fallback to Inkscape if pdf2svg not available
                  svgCommand = `inkscape --pdf-poppler "${pdfPath}" --export-type=svg --export-filename="${svgPath}" 2>/dev/null || convert -density 300 -background none "${pdfPath}[0]" "${svgPath}"`;
                }
                
                await execAsync(svgCommand);
                
                if (fs.existsSync(svgPath) && fs.statSync(svgPath).size > 0) {
                  // EARLY COMPLEXITY CHECK - Prevent memory crashes from extremely complex files
                  const { checkFileComplexityEarly } = await import('./svg-color-utils');
                  const originalPdfSize = fs.statSync(pdfPath).size;
                  const complexityCheck = checkFileComplexityEarly(svgPath, originalPdfSize, file.filename);
                  
                  if (complexityCheck.isLikelyTooComplex) {
                    const fileSizeMB = typeof complexityCheck.originalFileSizeMB === 'number' ? complexityCheck.originalFileSizeMB : 0;
                    
                    // For complex files UNDER 50MB: Use PNG preview with original PDF for output
                    if (fileSizeMB < 50) {
                      console.log(`📸 Complex file under 50MB (${fileSizeMB.toFixed(1)}MB) - creating PNG preview, preserving PDF for output`);
                      
                      // CRITICAL: Extract PDF bounds BEFORE creating PNG - the PNG display needs correct dimensions
                      try {
                        const bboxCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=bbox -f "${pdfPath}" 2>&1`;
                        const bboxResult = await execAsync(bboxCommand, { maxBuffer: 5 * 1024 * 1024 });
                        const bboxOutput = bboxResult.stderr || bboxResult.stdout || '';
                        
                        // Parse HiResBoundingBox from Ghostscript output
                        const hiresMatch = bboxOutput.match(/%%HiResBoundingBox:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
                        if (hiresMatch) {
                          const [, xMin, yMin, xMax, yMax] = hiresMatch.map(parseFloat);
                          const widthPt = xMax - xMin;
                          const heightPt = yMax - yMin;
                          const widthMm = widthPt * 0.352778;
                          const heightMm = heightPt * 0.352778;
                          
                          console.log(`📐 Complex file PDF bounds: ${widthMm.toFixed(1)}mm x ${heightMm.toFixed(1)}mm`);
                          
                          // Store original PDF bounds for canvas display sizing
                          (file as any).originalPdfBounds = {
                            xMin: xMin,
                            yMin: yMin,
                            xMax: xMax,
                            yMax: yMax,
                            width: widthPt,
                            height: heightPt,
                            widthMm: widthMm,
                            heightMm: heightMm
                          };
                        }
                      } catch (bboxError) {
                        console.log(`⚠️ Could not extract PDF bounds for complex file: ${bboxError}`);
                      }
                      
                      // Create PNG preview for canvas display
                      const pngFilename = `${file.filename}_preview.png`;
                      const pngPath = path.join(uploadDir, pngFilename);
                      
                      try {
                        const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r150 -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                        execSync(gsCommand, { encoding: 'buffer', timeout: 120000 });
                        
                        if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                          const pngBuffer = fs.readFileSync(pngPath);
                          const pngSignature = pngBuffer.slice(0, 8).toString('hex');
                          const isValidPng = pngSignature === '89504e470d0a1a0a';
                          console.log(`🔍 PNG validation: signature=${pngSignature}, valid=${isValidPng}`);
                          
                          if (!isValidPng) {
                            console.log(`⚠️ PNG corrupted, regenerating...`);
                            execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r150 -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`, { encoding: 'buffer' });
                            const regenBuffer = fs.readFileSync(pngPath);
                            const regenSig = regenBuffer.slice(0, 8).toString('hex');
                            console.log(`🔍 Regenerated PNG: signature=${regenSig}, valid=${regenSig === '89504e470d0a1a0a'}`);
                          }
                          
                          // Store original PDF path for final output
                          (file as any).originalPdfPath = pdfPath;
                          (file as any).isCMYKPreserved = true;
                          (file as any).isComplexFilePngFallback = true;
                          
                          finalFilename = pngFilename;
                          finalMimeType = 'image/png';
                          finalUrl = `/uploads/${finalFilename}`;
                          
                          console.log(`✅ PNG preview created for complex file: ${pngFilename}, original PDF preserved at: ${pdfPath}`);
                          
                          // Final verification
                          const finalCheck = fs.readFileSync(pngPath);
                          console.log(`🔍 FINAL PNG check before return: signature=${finalCheck.slice(0,8).toString('hex')}, size=${finalCheck.length}`);
                        } else {
                          throw new Error('PNG generation failed');
                        }
                      } catch (pngError) {
                        console.error('❌ PNG fallback failed for complex file:', pngError);
                        res.status(413).json({ 
                          error: 'file_too_complex',
                          message: 'This file is too complex for automated processing',
                          details: complexityCheck.reason,
                          originalFileSizeMB: fileSizeMB,
                          originalFileName: file.filename,
                          suggestion: 'Please upload via Dropbox for files this complex'
                        });
                        return;
                      }
                    } else {
                      // For complex files OVER 50MB: Reject and suggest Dropbox
                      console.log(`🚫 File too complex AND over 50MB (${fileSizeMB.toFixed(1)}MB) - requires Dropbox upload`);
                      res.status(413).json({ 
                        error: 'file_too_complex',
                        message: 'This file is too complex for automated processing',
                        details: complexityCheck.reason,
                        estimatedPaths: complexityCheck.estimatedPathCount,
                        estimatedElements: complexityCheck.estimatedElementCount,
                        originalFileSizeMB: fileSizeMB,
                        convertedFileSizeMB: complexityCheck.convertedFileSizeMB,
                        originalFileName: file.filename,
                        suggestion: 'Please upload via Dropbox for files over 50MB'
                      });
                      return;
                    }
                  } else {
                    // File is NOT too complex - use normal SVG processing
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
                  }
                } else {
                  // Fallback to PNG preview if SVG conversion fails
                  const pngFilename = `${file.filename}_preview.png`;
                  const pngPath = path.join(uploadDir, pngFilename);
                  
                  const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r150 -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
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
                // EARLY COMPLEXITY CHECK - Prevent memory crashes from extremely complex files
                const { checkFileComplexityEarly } = await import('./svg-color-utils');
                const originalPdfSize = fs.statSync(pdfPath).size;
                const complexityCheck = checkFileComplexityEarly(svgPath, originalPdfSize, file.filename);
                
                if (complexityCheck.isLikelyTooComplex) {
                  const fileSizeMB = typeof complexityCheck.originalFileSizeMB === 'number' ? complexityCheck.originalFileSizeMB : 0;
                  
                  // For complex files UNDER 50MB: Use PNG preview with original PDF for output
                  if (fileSizeMB < 50) {
                    console.log(`📸 Complex RGB file under 50MB (${fileSizeMB.toFixed(1)}MB) - creating PNG preview, preserving PDF for output`);
                    
                    // CRITICAL: Extract PDF bounds BEFORE creating PNG - the PNG display needs correct dimensions
                    try {
                      const bboxCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=bbox -f "${pdfPath}" 2>&1`;
                      const bboxResult = await execAsync(bboxCommand, { maxBuffer: 5 * 1024 * 1024 });
                      const bboxOutput = bboxResult.stderr || bboxResult.stdout || '';
                      
                      // Parse HiResBoundingBox from Ghostscript output
                      const hiresMatch = bboxOutput.match(/%%HiResBoundingBox:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
                      if (hiresMatch) {
                        const [, xMin, yMin, xMax, yMax] = hiresMatch.map(parseFloat);
                        const widthPt = xMax - xMin;
                        const heightPt = yMax - yMin;
                        const widthMm = widthPt * 0.352778;
                        const heightMm = heightPt * 0.352778;
                        
                        console.log(`📐 Complex RGB file PDF bounds: ${widthMm.toFixed(1)}mm x ${heightMm.toFixed(1)}mm`);
                        
                        // Store original PDF bounds for canvas display sizing
                        (file as any).originalPdfBounds = {
                          xMin: xMin,
                          yMin: yMin,
                          xMax: xMax,
                          yMax: yMax,
                          width: widthPt,
                          height: heightPt,
                          widthMm: widthMm,
                          heightMm: heightMm
                        };
                      }
                    } catch (bboxError) {
                      console.log(`⚠️ Could not extract PDF bounds for complex RGB file: ${bboxError}`);
                    }
                    
                    // Create PNG preview for canvas display
                    const pngFilename = `${file.filename}_preview.png`;
                    const pngPath = path.join(uploadDir, pngFilename);
                    
                    try {
                      const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r150 -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                      execSync(gsCommand, { encoding: 'buffer', timeout: 120000 });
                      
                      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                        const pngBuffer = fs.readFileSync(pngPath);
                        const pngSignature = pngBuffer.slice(0, 8).toString('hex');
                        const isValidPng = pngSignature === '89504e470d0a1a0a';
                        console.log(`🔍 PNG validation (RGB): signature=${pngSignature}, valid=${isValidPng}`);
                        
                        if (!isValidPng) {
                          console.log(`⚠️ PNG corrupted, regenerating...`);
                          execSync(`gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r150 -dMaxBitmap=500000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`, { encoding: 'buffer' });
                        }
                        
                        // Store original PDF path for final output
                        (file as any).originalPdfPath = pdfPath;
                        (file as any).isCMYKPreserved = false; // RGB PDF
                        (file as any).isComplexFilePngFallback = true;
                        
                        finalFilename = pngFilename;
                        finalMimeType = 'image/png';
                        finalUrl = `/uploads/${finalFilename}`;
                        
                        console.log(`✅ PNG preview created for complex RGB file: ${pngFilename}, original PDF preserved at: ${pdfPath}`);
                      } else {
                        throw new Error('PNG generation failed');
                      }
                    } catch (pngError) {
                      console.error('❌ PNG fallback failed for complex RGB file:', pngError);
                      res.status(413).json({ 
                        error: 'file_too_complex',
                        message: 'This file is too complex for automated processing',
                        details: complexityCheck.reason,
                        originalFileSizeMB: fileSizeMB,
                        originalFileName: file.filename,
                        suggestion: 'Please upload via Dropbox for files this complex'
                      });
                      return;
                    }
                  } else {
                    // For complex files OVER 50MB: Reject and suggest Dropbox
                    console.log(`🚫 RGB file too complex AND over 50MB (${fileSizeMB.toFixed(1)}MB) - requires Dropbox upload`);
                    res.status(413).json({ 
                      error: 'file_too_complex',
                      message: 'This file is too complex for automated processing',
                      details: complexityCheck.reason,
                      estimatedPaths: complexityCheck.estimatedPathCount,
                      estimatedElements: complexityCheck.estimatedElementCount,
                      originalFileSizeMB: fileSizeMB,
                      convertedFileSizeMB: complexityCheck.convertedFileSizeMB,
                      originalFileName: file.filename,
                      suggestion: 'Please upload via Dropbox for files over 50MB'
                    });
                    return;
                  }
                } else {
                  // File is NOT too complex - use normal SVG processing
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
            // CRITICAL FIX: Set originalPdfPath for ALL PDFs so Ghostscript bbox can work
            (file as any).originalPdfPath = originalPdfPath;
            console.log(`📐 Set originalPdfPath for vector PDF: ${originalPdfPath}`);
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
            // CRITICAL: Skip SVG modification for PNG files (complex file fallback) - would corrupt binary data
            if ((file as any).isCMYKPreserved && (file as any).originalPdfPath && !finalFilename.endsWith('.png')) {
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
            } else if ((file as any).isCMYKPreserved && finalFilename.endsWith('.png')) {
              console.log(`🎨 CMYK PDF with PNG fallback - skipping SVG marker (preserving PNG binary data)`);
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
            
            // Check for complex vectors OR Safari-incompatible features and generate PNG fallback
            const needsPngFallback = analysis.vectorComplexity?.isComplex || analysis.vectorComplexity?.hasSafariIncompatibleFeatures;
            if (needsPngFallback) {
              try {
                const reason = analysis.vectorComplexity?.isComplex 
                  ? `complex vector (paths: ${analysis.vectorComplexity.pathCount}, elements: ${analysis.vectorComplexity.elementCount})`
                  : `Safari-incompatible features: ${analysis.vectorComplexity?.safariIssues?.join(', ')}`;
                console.log(`🎨 PNG FALLBACK NEEDED: ${reason}`);
                
                const pngFilename = finalFilename.replace(/\.svg$/, '-canvas-fallback.png');
                const pngPath = path.join(uploadDir, pngFilename);
                
                const { execSync } = await import('child_process');
                try {
                  execSync(`rsvg-convert "${svgPath}" -o "${pngPath}" -d 300 -p 300`, { 
                    stdio: 'pipe',
                    timeout: 30000 
                  });
                  console.log(`✅ PNG fallback generated using rsvg-convert: ${pngFilename}`);
                } catch (rsvgError) {
                  console.log(`⚠️ rsvg-convert failed, trying Inkscape...`);
                  execSync(`inkscape "${svgPath}" --export-filename="${pngPath}" --export-dpi=300`, {
                    stdio: 'pipe',
                    timeout: 30000
                  });
                  console.log(`✅ PNG fallback generated using Inkscape: ${pngFilename}`);
                }
                
                (file as any).canvasFallbackFilename = pngFilename;
                (file as any).isComplexVector = true;
                (file as any).vectorComplexityMetrics = {
                  pathCount: analysis.vectorComplexity.pathCount,
                  elementCount: analysis.vectorComplexity.elementCount,
                  hasSafariIncompatibleFeatures: analysis.vectorComplexity.hasSafariIncompatibleFeatures || false,
                  safariIssues: analysis.vectorComplexity.safariIssues || [],
                  detectedAt: new Date().toISOString()
                };
                
                console.log(`✅ PNG fallback metadata prepared for database storage`);
              } catch (pngError) {
                console.error('⚠️ Failed to generate PNG fallback:', pngError);
              }
            }
            
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
                  
                  console.log(`🔄 Font outlining completed, getting accurate bounds from Inkscape`);
                  
                  // Use Inkscape to query accurate bounds - much more reliable than path parsing
                  try {
                    const { execSync } = await import('child_process');
                    
                    // Query actual rendered dimensions from Inkscape
                    const inkscapeWidth = execSync(`timeout 10 inkscape --query-width "${svgPath}" 2>/dev/null`, { encoding: 'utf8' }).trim();
                    const inkscapeHeight = execSync(`timeout 10 inkscape --query-height "${svgPath}" 2>/dev/null`, { encoding: 'utf8' }).trim();
                    
                    const widthPx = parseFloat(inkscapeWidth);
                    const heightPx = parseFloat(inkscapeHeight);
                    
                    console.log(`📏 Inkscape query: ${widthPx.toFixed(2)}×${heightPx.toFixed(2)}px`);
                    
                    if (widthPx > 0 && heightPx > 0) {
                      const newContentBounds = {
                        width: widthPx,
                        height: heightPx,
                        minX: 0,
                        minY: 0,
                        maxX: widthPx,
                        maxY: heightPx
                      };
                      
                      const pxToMm = 1 / 2.834645669;
                      console.log(`📐 Accurate content bounds from Inkscape: ${(widthPx * pxToMm).toFixed(2)}×${(heightPx * pxToMm).toFixed(2)}mm`);
                      
                      // Store the updated bounds for dimension calculation
                      (file as any).outlinedContentBounds = newContentBounds;
                      (file as any).forceContentBounds = true;
                      console.log(`✅ Stored Inkscape-verified content bounds`);
                    } else {
                      console.log(`⚠️ Invalid Inkscape bounds: ${inkscapeWidth}×${inkscapeHeight}`);
                    }
                  } catch (boundsError) {
                    console.warn('⚠️ Inkscape bounds query failed, falling back to path analysis:', boundsError);
                    // Fallback to path analysis if Inkscape fails
                    try {
                      const { calculateSVGContentBounds } = await import('./dimension-utils');
                      const outlinedSvgContent = fs.readFileSync(svgPath, 'utf8');
                      const newContentBounds = calculateSVGContentBounds(outlinedSvgContent);
                      if (newContentBounds && newContentBounds.width > 0 && newContentBounds.height > 0) {
                        (file as any).outlinedContentBounds = newContentBounds;
                        (file as any).forceContentBounds = true;
                      }
                    } catch (fallbackError) {
                      console.warn('⚠️ Fallback bounds calculation also failed:', fallbackError);
                    }
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
        
        // Add PNG fallback data for complex vectors
        if ((file as any).isComplexVector) {
          logoData.isComplexVector = true;
          logoData.canvasFallbackFilename = (file as any).canvasFallbackFilename;
          logoData.vectorComplexityMetrics = (file as any).vectorComplexityMetrics;
          console.log(`💾 COMPLEX VECTOR: Storing PNG fallback data:`, {
            canvasFallbackFilename: logoData.canvasFallbackFilename,
            pathCount: logoData.vectorComplexityMetrics.pathCount,
            elementCount: logoData.vectorComplexityMetrics.elementCount
          });
        }
        
        // PASS-THROUGH MODE: Add page count and hasGarmentPages for multi-page PDFs
        if ((file as any).pageCount !== undefined) {
          logoData.pageCount = (file as any).pageCount;
          logoData.hasGarmentPages = (file as any).hasGarmentPages;
          console.log(`💾 PDF page info: pageCount=${logoData.pageCount}, hasGarmentPages=${logoData.hasGarmentPages}`);
        }
        
        // COMPLEX FILE PNG FALLBACK: Mark files using PNG preview with original PDF for output
        if ((file as any).isComplexFilePngFallback) {
          logoData.isComplexFilePngFallback = true;
          console.log(`💾 Complex file PNG fallback: Using PNG for canvas, original PDF for output: ${logoData.originalFilename}`);
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
        
        // Store original PDF content bounds for cropping during PDF generation
        // These are the ORIGINAL coordinates BEFORE normalization - needed to crop original PDF
        let originalPdfBounds: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number; units: string } | null = null;

        // CRITICAL: For complex file PNG fallbacks, use the pre-extracted PDF bounds
        if ((file as any).isComplexFilePngFallback && (file as any).originalPdfBounds) {
          const pdfBounds = (file as any).originalPdfBounds;
          displayWidth = pdfBounds.widthMm;
          displayHeight = pdfBounds.heightMm;
          
          // Also set originalPdfBounds for PDF generation
          originalPdfBounds = {
            xMin: pdfBounds.xMin,
            yMin: pdfBounds.yMin,
            xMax: pdfBounds.xMax,
            yMax: pdfBounds.yMax,
            width: pdfBounds.width,
            height: pdfBounds.height,
            units: 'pt'
          };
          
          console.log(`📐 COMPLEX FILE FALLBACK: Using pre-extracted PDF bounds: ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm`);
        }

        // CRITICAL FIX: For DIRECT PNG/JPEG uploads (not extracted from PDFs), detect actual dimensions
        // The PNG might have DPI metadata - read pixel dimensions and convert using 300 DPI as standard
        const isDirectRasterUpload = (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') && 
                                      !(file as any).isPdfWithRasterOnly && 
                                      !(file as any).isComplexFilePngFallback;
        
        if (isDirectRasterUpload) {
          console.log('📸 DIRECT PNG/JPEG UPLOAD: Detecting actual image dimensions');
          const imagePath = path.join(uploadDir, file.filename);
          
          try {
            // Use ImageMagick identify to get dimensions AND DPI
            const { stdout: identifyOutput } = await execAsync(`identify -format "%wx%h %x %y" "${imagePath}" 2>/dev/null || echo ""`);
            const parts = identifyOutput.trim().split(' ');
            
            if (parts.length >= 1 && parts[0].includes('x')) {
              const [pixelW, pixelH] = parts[0].split('x').map(Number);
              
              // Try to parse DPI - ImageMagick returns values like "300 PixelsPerInch"
              let dpi = 300; // Default to 300 DPI if not detected
              if (parts.length >= 2) {
                const dpiValue = parseFloat(parts[1]);
                if (!isNaN(dpiValue) && dpiValue > 0 && dpiValue < 10000) {
                  dpi = dpiValue;
                }
              }
              
              // Convert pixels to mm: pixels / dpi * 25.4 mm/inch
              displayWidth = (pixelW / dpi) * 25.4;
              displayHeight = (pixelH / dpi) * 25.4;
              
              console.log(`✅ DIRECT IMAGE DIMENSIONS: ${pixelW}×${pixelH}px @ ${dpi} DPI = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
              
              // Store for later use
              (file as any).extractedPngWidth = pixelW;
              (file as any).extractedPngHeight = pixelH;
              (file as any).imageDpi = dpi;
            } else {
              console.log('⚠️ Could not parse image dimensions from identify output:', identifyOutput);
            }
          } catch (err) {
            console.log('⚠️ Failed to detect direct image dimensions:', err);
          }
        }
        
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
        
        // CRITICAL FIX: For raster-only PDFs, use the ORIGINAL PDF MediaBox dimensions
        // The PNG is rendered at 300 DPI, so using PNG pixel dimensions with 72 DPI conversion gives wrong results
        // Instead, read the PDF MediaBox directly which gives us the correct dimensions in pts (72 pts/inch)
        if ((file as any).isPdfWithRasterOnly && (file as any).originalPdfPath) {
          console.log('📐 RASTER PDF: Using original PDF MediaBox dimensions (not PNG pixels)');
          try {
            const { PDFDocument } = await import('pdf-lib');
            const originalPdfBytes = fs.readFileSync((file as any).originalPdfPath);
            const originalPdf = await PDFDocument.load(originalPdfBytes);
            const firstPage = originalPdf.getPages()[0];
            const mediaBox = firstPage.getMediaBox();
            
            // Convert pts to mm: 1 pt = 1/72 inch = 25.4/72 mm
            const ptsToMm = 25.4 / 72;
            displayWidth = mediaBox.width * ptsToMm;
            displayHeight = mediaBox.height * ptsToMm;
            
            console.log(`✅ PDF MediaBox: ${mediaBox.width.toFixed(2)}×${mediaBox.height.toFixed(2)}pts = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
          } catch (pdfError) {
            console.log('⚠️ Failed to read PDF MediaBox, falling back to PNG dimensions:', pdfError);
            // Fallback to PNG dimensions with correct 300 DPI conversion
            if ((file as any).extractedPngWidth && (file as any).extractedPngHeight) {
              const pngWidth = (file as any).extractedPngWidth;
              const pngHeight = (file as any).extractedPngHeight;
              // PNG was rendered at 300 DPI, convert to mm: pixels / 300 DPI * 25.4 mm/inch
              displayWidth = pngWidth / 300 * 25.4;
              displayHeight = pngHeight / 300 * 25.4;
              console.log(`📐 Fallback: Using PNG dimensions with 300 DPI: ${pngWidth}×${pngHeight}px = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
            }
          }
        } else if (finalMimeType === 'image/png' && (finalFilename.includes('_raster-gs.png') || finalFilename.includes('_raster-') && finalFilename.includes('.png'))) {
          // For other extracted PNGs (not from raster-only PDFs), try to get original PDF dimensions
          console.log('🔍 Detected extracted PNG file, checking for original PDF path');
          
          if ((file as any).originalPdfPath) {
            // Use original PDF dimensions
            try {
              const { PDFDocument } = await import('pdf-lib');
              const originalPdfBytes = fs.readFileSync((file as any).originalPdfPath);
              const originalPdf = await PDFDocument.load(originalPdfBytes);
              const firstPage = originalPdf.getPages()[0];
              const mediaBox = firstPage.getMediaBox();
              
              const ptsToMm = 25.4 / 72;
              displayWidth = mediaBox.width * ptsToMm;
              displayHeight = mediaBox.height * ptsToMm;
              
              console.log(`✅ PDF MediaBox: ${mediaBox.width.toFixed(2)}×${mediaBox.height.toFixed(2)}pts = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
            } catch (pdfError) {
              console.log('⚠️ Failed to read PDF MediaBox:', pdfError);
            }
          } else {
            // No original PDF, use PNG dimensions with 300 DPI (the render DPI)
            const pngPath = path.join(uploadDir, finalFilename);
            const directDimensions = await getPNGDimensions(pngPath);
            if (directDimensions) {
              // PNG was rendered at 300 DPI, convert to mm: pixels / 300 DPI * 25.4 mm/inch
              displayWidth = directDimensions.width / 300 * 25.4;
              displayHeight = directDimensions.height / 300 * 25.4;
              console.log(`📐 Using PNG dimensions with 300 DPI: ${directDimensions.width}×${directDimensions.height}px = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
            }
          }
        } else if ((file as any).extractedPngWidth && (file as any).extractedPngHeight) {
          // For extracted PNGs with stored dimensions, check if we have original PDF path
          if ((file as any).originalPdfPath) {
            try {
              const { PDFDocument } = await import('pdf-lib');
              const originalPdfBytes = fs.readFileSync((file as any).originalPdfPath);
              const originalPdf = await PDFDocument.load(originalPdfBytes);
              const firstPage = originalPdf.getPages()[0];
              const mediaBox = firstPage.getMediaBox();
              
              const ptsToMm = 25.4 / 72;
              displayWidth = mediaBox.width * ptsToMm;
              displayHeight = mediaBox.height * ptsToMm;
              
              console.log(`✅ PDF MediaBox: ${mediaBox.width.toFixed(2)}×${mediaBox.height.toFixed(2)}pts = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
            } catch (pdfError) {
              console.log('⚠️ Failed to read PDF MediaBox, using PNG with 300 DPI:', pdfError);
              const pngWidth = (file as any).extractedPngWidth;
              const pngHeight = (file as any).extractedPngHeight;
              displayWidth = pngWidth / 300 * 25.4;
              displayHeight = pngHeight / 300 * 25.4;
              console.log(`📐 Using PNG dimensions with 300 DPI: ${pngWidth}×${pngHeight}px = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
            }
          } else {
            // No PDF path, assume PNG was rendered at 300 DPI
            const pngWidth = (file as any).extractedPngWidth;
            const pngHeight = (file as any).extractedPngHeight;
            displayWidth = pngWidth / 300 * 25.4;
            displayHeight = pngHeight / 300 * 25.4;
            console.log(`📐 Using PNG dimensions with 300 DPI: ${pngWidth}×${pngHeight}px = ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
          }
        } else {
          console.log('⚠️ DEBUG: No extracted PNG dimensions found, using defaults:', displayWidth + 'x' + displayHeight);
        }

        // Declare boundsResult in high scope so it's available for database update later
        let boundsResult = null;

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
            
            // Store PDF page dimensions for fallback use
            let pdfPageDimensions = null;
            
            try {
              // For PDF-converted SVGs, try to use the original PDF bounds first
              
              if ((file as any).originalPdfPath && file.mimetype === 'application/pdf') {
                // CRITICAL FIX: Extract PDF PAGE DIMENSIONS (MediaBox), not content bounds
                // The MediaBox defines the intended artwork size - use it directly with NO scaling
                console.log('📐 Extracting PDF PAGE DIMENSIONS (MediaBox) from original PDF - will use 1:1 with NO scaling');
                
                // Use pdf-lib to get exact MediaBox dimensions
                try {
                  const { PDFDocument } = await import('pdf-lib');
                  const originalPdfBytes = fs.readFileSync((file as any).originalPdfPath);
                  const originalPdf = await PDFDocument.load(originalPdfBytes);
                  const firstPage = originalPdf.getPages()[0];
                  const mediaBox = firstPage.getMediaBox();
                  
                  const pageWidth = mediaBox.width;
                  const pageHeight = mediaBox.height;
                  
                  // CRITICAL: Store PDF page dimensions for fallback use
                  const pxToMm = 1 / 2.834645669; // 72 DPI standard
                  pdfPageDimensions = {
                    widthMm: pageWidth * pxToMm,
                    heightMm: pageHeight * pxToMm,
                    widthPts: pageWidth,
                    heightPts: pageHeight
                  };
                  
                  console.log(`✅ PDF PAGE DIMENSIONS EXTRACTED: ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}pts (MediaBox)`);
                  console.log(`📄 Stored for fallback: ${pdfPageDimensions.widthMm.toFixed(1)}×${pdfPageDimensions.heightMm.toFixed(1)}mm`);
                  
                  // PRIMARY METHOD: Use Ghostscript bbox for accurate content bounds
                  // This is more reliable than SVG geometry analysis as it detects ALL visible content
                  console.log(`🎯 USING Ghostscript bbox for accurate content detection (most reliable)`);
                  
                  const { execSync } = await import('child_process');
                  let gsBounds: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number } | null = null;
                  
                  try {
                    const originalPdfPath = (file as any).originalPdfPath;
                    const gsOutput = execSync(`gs -dBATCH -dNOPAUSE -dQUIET -sDEVICE=bbox "${originalPdfPath}" 2>&1`, { encoding: 'utf8' });
                    
                    // Parse HiResBoundingBox for precise bounds
                    const hiResMatch = gsOutput.match(/%%HiResBoundingBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
                    if (hiResMatch) {
                      const [, x1, y1, x2, y2] = hiResMatch.map(Number);
                      gsBounds = {
                        xMin: x1,
                        yMin: y1,
                        xMax: x2,
                        yMax: y2,
                        width: x2 - x1,
                        height: y2 - y1
                      };
                      console.log(`✅ Ghostscript bbox: (${x1.toFixed(1)}, ${y1.toFixed(1)}) to (${x2.toFixed(1)}, ${y2.toFixed(1)})`);
                      console.log(`📐 Content size: ${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts`);
                    }
                  } catch (gsError) {
                    console.log(`⚠️ Ghostscript bbox failed, falling back to SVG geometry:`, gsError);
                  }
                  
                  // Use Ghostscript bounds if available, otherwise fall back to SVG geometry
                  let contentBoundsForNormalization: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number };
                  
                  if (gsBounds) {
                    // Check if Ghostscript bbox aspect ratio dramatically differs from page
                    // Only override if aspect ratios are truly mismatched (GS missing content)
                    const pageAspectRatio = pageWidth / pageHeight;
                    const gsAspectRatio = gsBounds.width / gsBounds.height;
                    const heightRatio = gsBounds.height / pageHeight;
                    const widthRatio = gsBounds.width / pageWidth;
                    
                    // Only override GS bbox if the ASPECT RATIOS are dramatically different
                    // This indicates GS missed some content on one axis
                    // Don't override just because content is smaller than page (valid whitespace)
                    const pageIsSquare = pageAspectRatio >= 0.9 && pageAspectRatio <= 1.1;
                    const gsIsNotSquare = gsAspectRatio < 0.7 || gsAspectRatio > 1.43; // More than 30% aspect ratio difference
                    
                    // Only override if page is square but GS bbox is NOT square (aspect ratio mismatch)
                    // AND the bbox is extremely small (less than 50% of page) - very suspicious
                    const isTinyCoverage = heightRatio < 0.5 || widthRatio < 0.5;
                    
                    if (pageIsSquare && gsIsNotSquare && isTinyCoverage) {
                      console.log(`⚠️ GS BBOX SUSPICIOUS: Page is square (${pageAspectRatio.toFixed(2)}) but GS is ${gsAspectRatio.toFixed(2)}`);
                      console.log(`   Height ratio: ${(heightRatio * 100).toFixed(0)}%, Width ratio: ${(widthRatio * 100).toFixed(0)}%`);
                      console.log(`🔄 Using PDF PAGE DIMENSIONS instead of unreliable GS bbox`);
                      
                      // Use page dimensions with small margin (1pt on each side)
                      const margin = 1;
                      gsBounds = {
                        xMin: margin,
                        yMin: margin,
                        xMax: pageWidth - margin,
                        yMax: pageHeight - margin,
                        width: pageWidth - 2 * margin,
                        height: pageHeight - 2 * margin
                      };
                      console.log(`✅ Corrected bounds: ${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts`);
                    } else {
                      console.log(`✅ GS BBOX TRUSTED: Content covers ${(heightRatio * 100).toFixed(0)}%×${(widthRatio * 100).toFixed(0)}% of page (aspect ratio ${gsAspectRatio.toFixed(2)} vs page ${pageAspectRatio.toFixed(2)})`);
                    }
                    
                    contentBoundsForNormalization = gsBounds;
                    const pxToMm = 1 / 2.834645669;
                    
                    boundsResult = {
                      success: true,
                      method: 'ghostscript-bbox',
                      contentBounds: {
                        xMin: 0,
                        yMin: 0,
                        xMax: gsBounds.width,
                        yMax: gsBounds.height,
                        width: gsBounds.width,
                        height: gsBounds.height,
                        units: 'pt'
                      }
                    };
                    
                    displayWidth = gsBounds.width * pxToMm;
                    displayHeight = gsBounds.height * pxToMm;
                    console.log(`📐 Using Ghostscript dimensions: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                  } else {
                    // Fallback to SVG geometry analysis
                    console.log(`🔄 Falling back to SVG geometry analysis`);
                    const { SVGBoundsAnalyzer } = await import('./svg-bounds-analyzer');
                    const svgAnalyzer = new SVGBoundsAnalyzer();
                    const svgGeometryResult = await svgAnalyzer.extractSVGBounds(svgPath);
                    
                    if (svgGeometryResult.success && svgGeometryResult.contentBounds && 
                        svgGeometryResult.contentBounds.width > 0 && svgGeometryResult.contentBounds.height > 0) {
                      contentBoundsForNormalization = svgGeometryResult.contentBounds;
                      const pxToMm = 1 / 2.834645669;
                      
                      boundsResult = {
                        success: true,
                        method: 'svg-geometry',
                        contentBounds: {
                          xMin: 0,
                          yMin: 0,
                          xMax: svgGeometryResult.contentBounds.width,
                          yMax: svgGeometryResult.contentBounds.height,
                          width: svgGeometryResult.contentBounds.width,
                          height: svgGeometryResult.contentBounds.height,
                          units: 'pt'
                        }
                      };
                      
                      displayWidth = svgGeometryResult.contentBounds.width * pxToMm;
                      displayHeight = svgGeometryResult.contentBounds.height * pxToMm;
                      console.log(`📐 Using SVG geometry dimensions: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                    } else {
                      throw new Error('Both Ghostscript and SVG geometry analysis failed');
                    }
                  }
                  
                  // ARCHITECT GUIDANCE: PDF bbox gives initial dimensions, but Inkscape may report larger bounds
                  // Ghostscript can miss masked strokes/effects that Inkscape's renderer correctly measures
                  console.log(`📍 PDF/Ghostscript bounds: (${contentBoundsForNormalization.xMin.toFixed(1)}, ${contentBoundsForNormalization.yMin.toFixed(1)}) to (${contentBoundsForNormalization.xMax.toFixed(1)}, ${contentBoundsForNormalization.yMax.toFixed(1)})`);
                  
                  let contentWidthPts = contentBoundsForNormalization.width;
                  let contentHeightPts = contentBoundsForNormalization.height;
                  
                  // Store original PDF bounds for PDF cropping during generation
                  originalPdfBounds = {
                    xMin: contentBoundsForNormalization.xMin,
                    yMin: contentBoundsForNormalization.yMin,
                    xMax: contentBoundsForNormalization.xMax,
                    yMax: contentBoundsForNormalization.yMax,
                    width: contentWidthPts,
                    height: contentHeightPts,
                    units: 'pt'
                  };
                  console.log(`📋 Stored original PDF bounds for cropping: (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
                    
                    // Crop SVG viewBox to content bounds AND translate content to zero-origin
                    if (fs.existsSync(svgPath)) {
                      try {
                        // CRITICAL FIX: Query actual SVG content bounds AFTER Inkscape conversion
                        // Inkscape rebases coordinates and may report LARGER dimensions than Ghostscript
                        // (Ghostscript can miss masked strokes/effects that the renderer sees)
                        let svgBoundsX = 0, svgBoundsY = 0;
                        let svgBoundsWidth = contentWidthPts, svgBoundsHeight = contentHeightPts;
                        
                        try {
                          const { execSync } = await import('child_process');
                          const queryResult = execSync(`inkscape --query-all "${svgPath}" 2>/dev/null | head -1`, { encoding: 'utf8', timeout: 10000 });
                          // Format: element_id,x,y,width,height
                          const parts = queryResult.trim().split(',');
                          if (parts.length >= 5) {
                            svgBoundsX = parseFloat(parts[1]) || 0;
                            svgBoundsY = parseFloat(parts[2]) || 0;
                            const inkscapeWidth = parseFloat(parts[3]) || 0;
                            const inkscapeHeight = parseFloat(parts[4]) || 0;
                            console.log(`🔍 Inkscape query-all: SVG at (${svgBoundsX.toFixed(2)}, ${svgBoundsY.toFixed(2)}) size ${inkscapeWidth.toFixed(2)}×${inkscapeHeight.toFixed(2)}pts`);
                            
                            // CRITICAL: Use Inkscape dimensions if they're larger than Ghostscript
                            // This prevents clipping when Ghostscript misses masked content
                            const TOLERANCE = 1.0; // 1pt tolerance
                            if (inkscapeWidth > contentWidthPts + TOLERANCE || inkscapeHeight > contentHeightPts + TOLERANCE) {
                              console.log(`⚠️ Inkscape reports LARGER bounds than Ghostscript!`);
                              console.log(`   Ghostscript: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts`);
                              console.log(`   Inkscape: ${inkscapeWidth.toFixed(2)}×${inkscapeHeight.toFixed(2)}pts`);
                              console.log(`🔧 Using Inkscape dimensions to prevent clipping`);
                              
                              // Use the larger of the two for each dimension
                              svgBoundsWidth = Math.max(contentWidthPts, inkscapeWidth);
                              svgBoundsHeight = Math.max(contentHeightPts, inkscapeHeight);
                              contentWidthPts = svgBoundsWidth;
                              contentHeightPts = svgBoundsHeight;
                              
                              // Update display dimensions
                              const pxToMm = 1 / 2.834645669;
                              displayWidth = contentWidthPts * pxToMm;
                              displayHeight = contentHeightPts * pxToMm;
                              console.log(`✅ Updated dimensions: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts (${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm)`);
                              
                              // CRITICAL FIX: Update originalPdfBounds with Inkscape-detected position
                              // This ensures PDF cropping uses the correct content location (not the guessed center)
                              // IMPORTANT: Inkscape uses top-down Y coords (Y=0 at top), PDF uses bottom-up Y coords (Y=0 at bottom)
                              // Must convert: pdfY = pageHeight - inkscapeY - contentHeight
                              if (originalPdfBounds && originalPdfBounds.width < 1 && svgBoundsX !== undefined && svgBoundsY !== undefined && pdfPageDimensions) {
                                // Convert Inkscape (top-down) Y to PDF (bottom-up) Y
                                const pageHeight = pdfPageDimensions.heightPts;
                                const pdfYMin = pageHeight - svgBoundsY - inkscapeHeight; // Bottom of content in PDF coords
                                const pdfYMax = pageHeight - svgBoundsY; // Top of content in PDF coords
                                
                                console.log(`🔧 Ghostscript bbox failed - converting Inkscape coords to PDF coords:`);
                                console.log(`   Inkscape: y=${svgBoundsY.toFixed(2)}, height=${inkscapeHeight.toFixed(2)} (top-down)`);
                                console.log(`   Page height: ${pageHeight.toFixed(2)}pts`);
                                console.log(`   PDF coords: yMin=${pdfYMin.toFixed(2)}, yMax=${pdfYMax.toFixed(2)} (bottom-up)`);
                                
                                originalPdfBounds = {
                                  xMin: svgBoundsX,
                                  yMin: pdfYMin,
                                  xMax: svgBoundsX + inkscapeWidth,
                                  yMax: pdfYMax,
                                  width: inkscapeWidth,
                                  height: inkscapeHeight,
                                  units: 'pt'
                                };
                                console.log(`📋 Updated PDF bounds for cropping: (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
                              }
                            }
                          }
                        } catch (queryError) {
                          console.log(`⚠️ Inkscape query failed, using Ghostscript bounds:`, queryError);
                        }
                        
                        console.log(`📐 Final content dimensions: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts (${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm)`);
                        
                        let svgContent = fs.readFileSync(svgPath, 'utf8');
                        
                        console.log(`🎯 NORMALIZING SVG to zero-origin:`);
                        console.log(`   SVG content starts at: (${svgBoundsX.toFixed(2)}, ${svgBoundsY.toFixed(2)})`);
                        console.log(`   Size: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts`);
                        console.log(`   Translation needed: (-${svgBoundsX.toFixed(2)}, -${svgBoundsY.toFixed(2)})`);
                        
                        // CRITICAL: Set viewBox to ZERO-ORIGIN (0 0 width height)
                        // This matches the normalized contentBounds the frontend expects
                        const newViewBox = `viewBox="0 0 ${contentWidthPts.toFixed(2)} ${contentHeightPts.toFixed(2)}"`;
                        svgContent = svgContent.replace(/viewBox="[^"]*"/, newViewBox);
                        
                        // Update width/height to match content (unitless to match viewBox)
                        // Using unitless values ensures CSS width:100% works correctly
                        svgContent = svgContent.replace(/width="[^"]*"/, `width="${contentWidthPts.toFixed(2)}"`);
                        svgContent = svgContent.replace(/height="[^"]*"/, `height="${contentHeightPts.toFixed(2)}"`);
                        
                        // CRITICAL: Use ACTUAL SVG content bounds for translation, not PDF bounds
                        // This is the key fix - Inkscape rebases coordinates during conversion
                        const translateX = -svgBoundsX;
                        const translateY = -svgBoundsY;
                        
                        // Find the opening <svg> tag and wrap all content after it
                        svgContent = svgContent.replace(
                          /(<svg[^>]*>)/,
                          `$1\n<g transform="translate(${translateX.toFixed(2)}, ${translateY.toFixed(2)})">`
                        );
                        // Add closing </g> before </svg>
                        svgContent = svgContent.replace(/<\/svg>/, '</g>\n</svg>');
                        
                        // Mark as geometry-cropped and normalized
                        svgContent = svgContent.replace(/<svg\s/, '<svg data-geometry-cropped="true" data-normalized="true" ');
                        
                        fs.writeFileSync(svgPath, svgContent);
                        console.log(`✅ SVG normalized to zero-origin with content translation - centered correctly`);
                      } catch (svgCropError) {
                        console.error('⚠️ Failed to normalize SVG:', svgCropError);
                      }
                    }
                } catch (pdfLibError) {
                  console.error('Failed to extract PDF MediaBox:', pdfLibError);
                  // Fall through to SVG bounds analyzer
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
                let detectedWidthMm = boundsResult.contentBounds.width * pxToMm;
                let detectedHeightMm = boundsResult.contentBounds.height * pxToMm;
                
                console.log(`📐 INITIAL BOUNDS: ${detectedWidthMm.toFixed(1)}×${detectedHeightMm.toFixed(1)}mm`);
                
                // CRITICAL FIX: Check for specific oversized A4 pattern (788×1263px → should be 590×821px)
                const expectedA4WidthPx = 590.1;  // 208.2mm in pixels
                const expectedA4HeightPx = 820.8; // 289.507mm in pixels
                const detectedWidthPx = boundsResult.contentBounds.width;
                const detectedHeightPx = boundsResult.contentBounds.height;
                
                // Check if this matches the problematic pattern: ~788×1263px that should be A4
                const isOversizedA4Pattern = (
                  detectedWidthPx > 750 && detectedWidthPx < 850 &&  // Width around 788-800
                  detectedHeightPx > 1200 && detectedHeightPx < 1300  // Height around 1263-1280
                );
                
                if (isOversizedA4Pattern) {
                  console.log(`🚨 OVERSIZED A4 PATTERN DETECTED: ${detectedWidthPx.toFixed(1)}×${detectedHeightPx.toFixed(1)}px should be A4 ${expectedA4WidthPx.toFixed(0)}×${expectedA4HeightPx.toFixed(0)}px`);
                  console.log(`📏 This matches the known problematic file pattern - applying A4 correction`);
                  
                  // Override with correct A4 dimensions
                  const correctedWidthMm = 208.2;  // Standard A4 width 
                  const correctedHeightMm = 289.507; // Standard A4 height
                  
                  console.log(`✅ APPLYING A4 PATTERN FIX: ${correctedWidthMm.toFixed(1)}×${correctedHeightMm.toFixed(1)}mm (A4 standard)`);
                  
                  // Calculate corrected pixel dimensions
                  const correctedWidthPx = correctedWidthMm / pxToMm;
                  const correctedHeightPx = correctedHeightMm / pxToMm;
                  
                  // Calculate centered bounds - content should be centered within the corrected dimensions
                  const centerX = 0; // Center of corrected bounds
                  const centerY = 0; // Center of corrected bounds
                  const halfWidth = correctedWidthPx / 2;
                  const halfHeight = correctedHeightPx / 2;
                  
                  console.log(`🎯 CENTERING CONTENT: ${correctedWidthPx.toFixed(1)}×${correctedHeightPx.toFixed(1)}px around center (${centerX}, ${centerY})`);
                  
                  // Update bounds to use correct A4 dimensions AND proper centering
                  boundsResult.contentBounds = {
                    xMin: centerX - halfWidth,
                    yMin: centerY - halfHeight,
                    xMax: centerX + halfWidth,
                    yMax: centerY + halfHeight,
                    width: correctedWidthPx,
                    height: correctedHeightPx
                  };
                  
                  // Update calculated mm values
                  detectedWidthMm = correctedWidthMm;
                  detectedHeightMm = correctedHeightMm;
                  
                  console.log(`🎯 CORRECTED BOUNDS: ${detectedWidthMm.toFixed(1)}×${detectedHeightMm.toFixed(1)}mm`);
                }
                
                // Get the actual template size for this project to check bounds reasonableness
                const templateSizes = await storage.getTemplateSizes();
                const currentTemplate = templateSizes.find(t => t.id === project.templateSize);
                const maxTemplateWidth = currentTemplate?.width || 297;
                const maxTemplateHeight = currentTemplate?.height || 420;
                
                // Only consider bounds unreasonable if they exceed template by more than 20%
                const reasonableMaxWidth = maxTemplateWidth * 1.2;
                const reasonableMaxHeight = maxTemplateHeight * 1.2;
                
                if (detectedWidthMm > reasonableMaxWidth && detectedHeightMm > reasonableMaxHeight) {
                  // Both dimensions exceed template - likely a coordinate system issue
                  console.log(`⚠️ UNREASONABLE BOUNDS DETECTED: ${detectedWidthMm.toFixed(1)}×${detectedHeightMm.toFixed(1)}mm (exceeds ${maxTemplateWidth}×${maxTemplateHeight}mm template by >20%)`);
                  
                  // Try to detect the actual content scale based on common patterns
                  // Many PDFs use coordinates in the thousands but actual content is much smaller
                  let scaleFactor = 1.0;
                  
                  if (detectedWidthMm > 2000 || detectedHeightMm > 2000) {
                    // Coordinates are likely in points but misinterpreted
                    scaleFactor = 0.1; // 10% of detected size
                  } else if (detectedWidthMm > maxTemplateWidth * 2 || detectedHeightMm > maxTemplateHeight * 2) {
                    // Moderately oversized relative to template
                    scaleFactor = 0.5; // 50% of detected size
                  } else {
                    // Slightly oversized - keep most of the size
                    scaleFactor = 0.8; // 80% of detected size
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
                // For properly sized artwork, keep original to avoid clipping
                const usingPdfContentBounds = boundsResult.method === 'pdf-content-bounds';
                // pxToMm is already declared above
                let contentWidthMm = boundsResult.contentBounds.width * pxToMm;
                let contentHeightMm = boundsResult.contentBounds.height * pxToMm;
                
                // Get original SVG dimensions to compare with content bounds
                const { detectDimensionsFromSVG } = await import('./dimension-utils');
                const originalSvgDimensions = await detectDimensionsFromSVG(svgContent, null, svgPath);
                const originalWidthMm = originalSvgDimensions.widthMm;
                const originalHeightMm = originalSvgDimensions.heightMm;
                
                // Calculate the difference between original viewBox and content bounds
                const widthDiff = Math.abs(originalWidthMm - contentWidthMm);
                const heightDiff = Math.abs(originalHeightMm - contentHeightMm);
                
                // CRITICAL: Extract ALL clipping mask vector boundaries FIRST (before tight crop decision)
                // Clipping masks are made of vector lines - detect their geometric extent
                let contentBounds = boundsResult.contentBounds;
                console.log(`✅ VECTOR GEOMETRY CONTENT BOUNDS (from SVG analyzer): ${contentBounds.width.toFixed(1)}×${contentBounds.height.toFixed(1)}pts`);
                
                // Extract ALL clipping path geometries from SVG
                const clipPathRegex = /<clipPath[^>]*>(.*?)<\/clipPath>/gs;
                const clipPathMatches = svgContent.match(clipPathRegex);
                
                if (clipPathMatches && clipPathMatches.length > 0) {
                  console.log(`🔍 ANALYZING ${clipPathMatches.length} CLIPPING PATH VECTORS`);
                  
                  let globalMinX = Infinity, globalMinY = Infinity;
                  let globalMaxX = -Infinity, globalMaxY = -Infinity;
                  let foundClipGeometry = false;
                  
                  for (const clipPath of clipPathMatches) {
                    // Extract rect elements from clipping paths
                    const rectRegex = /<rect[^>]*x="([^"]+)"[^>]*y="([^"]+)"[^>]*width="([^"]+)"[^>]*height="([^"]+)"/g;
                    let rectMatch;
                    while ((rectMatch = rectRegex.exec(clipPath)) !== null) {
                      const x = parseFloat(rectMatch[1]);
                      const y = parseFloat(rectMatch[2]);
                      const w = parseFloat(rectMatch[3]);
                      const h = parseFloat(rectMatch[4]);
                      
                      globalMinX = Math.min(globalMinX, x);
                      globalMinY = Math.min(globalMinY, y);
                      globalMaxX = Math.max(globalMaxX, x + w);
                      globalMaxY = Math.max(globalMaxY, y + h);
                      foundClipGeometry = true;
                    }
                    
                    // Extract path elements from clipping paths
                    const pathRegex = /<path[^>]*d="([^"]+)"/g;
                    let pathMatch;
                    while ((pathMatch = pathRegex.exec(clipPath)) !== null) {
                      const pathData = pathMatch[1];
                      // Extract coordinates from path commands (M, L, C, etc.)
                      const coordsRegex = /[-]?[\d.]+/g;
                      const coords = pathData.match(coordsRegex);
                      if (coords) {
                        for (let i = 0; i < coords.length - 1; i += 2) {
                          const x = parseFloat(coords[i]);
                          const y = parseFloat(coords[i + 1]);
                          if (!isNaN(x) && !isNaN(y)) {
                            globalMinX = Math.min(globalMinX, x);
                            globalMinY = Math.min(globalMinY, y);
                            globalMaxX = Math.max(globalMaxX, x);
                            globalMaxY = Math.max(globalMaxY, y);
                            foundClipGeometry = true;
                          }
                        }
                      }
                    }
                  }
                  
                  if (foundClipGeometry && globalMaxX > globalMinX && globalMaxY > globalMinY) {
                    const clipWidth = globalMaxX - globalMinX;
                    const clipHeight = globalMaxY - globalMinY;
                    
                    console.log(`📊 CLIPPING PATHS DETECTED: ${clipWidth.toFixed(1)}×${clipHeight.toFixed(1)}pts (likely gradient masks)`);
                    console.log(`📐 VISIBLE VECTOR GEOMETRY: ${contentBounds.width.toFixed(1)}×${contentBounds.height.toFixed(1)}pts`);
                    
                    // CRITICAL: User confirmed clipping paths are gradient masks, NOT artwork bounds
                    // Use ONLY visible geometry bounds (with stroke expansion disabled)
                    console.log(`✅ IGNORING CLIPPING PATHS - Using only visible vector geometry for bounds`);
                  } else {
                    console.log(`📊 No clipping paths detected - using visible geometry bounds`);
                  }
                } else {
                  console.log(`ℹ️ No clipping paths found in SVG`);
                }
                
                // Extract viewBox dimensions in pixels for overflow detection
                const viewBoxWidthPx = originalWidthMm / pxToMm;
                const viewBoxHeightPx = originalHeightMm / pxToMm;
                
                // DEBUG: Log all values for overflow detection
                console.log(`🔍 OVERFLOW CHECK VALUES:
  contentBounds.xMin: ${contentBounds.xMin}
  contentBounds.yMin: ${contentBounds.yMin}
  contentBounds.xMax: ${contentBounds.xMax}
  contentBounds.yMax: ${contentBounds.yMax}
  viewBoxWidthPx: ${viewBoxWidthPx}
  viewBoxHeightPx: ${viewBoxHeightPx}
  widthDiff: ${widthDiff}mm
  heightDiff: ${heightDiff}mm`);
                
                // CRITICAL FIX: Clamp bounds to PDF page dimensions
                // Transformed elements can expand bounds beyond the artboard - this prevents that
                console.log(`📐 PDF PAGE DIMENSIONS: ${viewBoxWidthPx.toFixed(1)}×${viewBoxHeightPx.toFixed(1)}px (${originalWidthMm.toFixed(1)}×${originalHeightMm.toFixed(1)}mm)`);
                console.log(`📐 RAW CONTENT BOUNDS: ${contentBounds.width.toFixed(1)}×${contentBounds.height.toFixed(1)}px BEFORE clamping`);
                
                // CRITICAL FIX: Save UNCLAMPED bounds (after clipping analysis, before clamping) for tight crop
                const unclampedContentBounds = { ...contentBounds };
                
                // Also save original for crop decision comparison
                const originalContentBounds = { ...contentBounds };
                
                // Clamp bounds to page dimensions - content cannot exceed the artboard
                const clampedXMax = Math.min(contentBounds.xMax, viewBoxWidthPx);
                const clampedYMax = Math.min(contentBounds.yMax, viewBoxHeightPx);
                const clampedXMin = Math.max(contentBounds.xMin, 0);
                const clampedYMin = Math.max(contentBounds.yMin, 0);
                
                const clampedWidth = clampedXMax - clampedXMin;
                const clampedHeight = clampedYMax - clampedYMin;
                
                // If bounds were clamped, log the change
                if (clampedWidth !== contentBounds.width || clampedHeight !== contentBounds.height) {
                  console.log(`✂️ CLAMPED BOUNDS TO PAGE SIZE: ${contentBounds.width.toFixed(1)}×${contentBounds.height.toFixed(1)}px → ${clampedWidth.toFixed(1)}×${clampedHeight.toFixed(1)}px`);
                  contentBounds = {
                    xMin: clampedXMin,
                    yMin: clampedYMin,
                    xMax: clampedXMax,
                    yMax: clampedYMax,
                    width: clampedWidth,
                    height: clampedHeight,
                    units: contentBounds.units
                  };
                }
                
                // CRITICAL: For uploaded files, ALWAYS use tight bounds based on actual content
                // This ensures the element size matches the actual artwork, not the page/viewBox
                const hasNegativeCoords = contentBounds.xMin < 0 || contentBounds.yMin < 0;
                const extendsBeyondViewBox = contentBounds.xMax > viewBoxWidthPx || contentBounds.yMax > viewBoxHeightPx;
                
                // CRITICAL FIX: Use ORIGINAL bounds (before clamping) to decide if tight crop is needed
                // Clamping artificially makes bounds match page size, hiding the need for tight crop
                const originalContentWidthMm = (originalContentBounds.width * pxToMm);
                const originalContentHeightMm = (originalContentBounds.height * pxToMm);
                const originalWidthDiff = Math.abs(originalWidthMm - originalContentWidthMm);
                const originalHeightDiff = Math.abs(originalHeightMm - originalContentHeightMm);
                
                // CRITICAL FIX: For standard artboard sizes, use artboard dimensions even if content extends beyond
                // Decorative backgrounds often inflate bounds beyond the actual artwork
                const isStandardCutSize = (
                  (Math.abs(originalWidthMm - 295) < 1 && Math.abs(originalHeightMm - 100) < 1) || // 295×100mm
                  (Math.abs(originalWidthMm - 100) < 1 && Math.abs(originalHeightMm - 100) < 1) || // 100×100mm
                  (Math.abs(originalWidthMm - 150) < 1 && Math.abs(originalHeightMm - 150) < 1) || // 150×150mm
                  (Math.abs(originalWidthMm - 200) < 1 && Math.abs(originalHeightMm - 200) < 1)    // 200×200mm
                );
                
                // For standard sizes, use artboard dimensions (decorative elements are extending beyond)
                const shouldUseArtboard = isStandardCutSize && originalWidthDiff < 100 && originalHeightDiff < 50;
                
                // CRITICAL FIX: When Ghostscript bbox succeeds, use its dimensions directly 
                // WITHOUT creating a tight-content SVG (GS coords are in PDF space, not SVG space)
                const isGhostscriptSource = boundsResult.method === 'ghostscript-bbox';
                
                // Enable tight crop ONLY for non-Ghostscript sources where coords match SVG space
                const needsTightCrop = !isGhostscriptSource && !shouldUseArtboard && (originalWidthDiff > 5 || originalHeightDiff > 5);
                
                if (hasNegativeCoords) {
                  console.log(`🚨 NEGATIVE COORDINATES DETECTED: Content extends before origin (${contentBounds.xMin.toFixed(1)}, ${contentBounds.yMin.toFixed(1)})`);
                }
                if (extendsBeyondViewBox) {
                  console.log(`🚨 CONTENT EXTENDS BEYOND VIEWBOX: Content (${contentBounds.xMax.toFixed(1)}, ${contentBounds.yMax.toFixed(1)}) > viewBox (${viewBoxWidthPx.toFixed(1)}, ${viewBoxHeightPx.toFixed(1)})`);
                }
                
                if (isGhostscriptSource) {
                  // CRITICAL: Ghostscript gives us accurate dimensions - use them directly
                  // DON'T modify the SVG (GS coords are PDF-space, not SVG-space)
                  console.log(`✅ GHOSTSCRIPT BBOX: Using exact dimensions ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm - NO tight-content SVG needed`);
                  console.log(`📐 Canvas element will use GS bbox dimensions, original SVG preserved`);
                } else if (needsTightCrop) {
                  console.log(`📐 TIGHT CONTENT NEEDED: ViewBox ${originalWidthMm.toFixed(1)}×${originalHeightMm.toFixed(1)}mm vs Content ${originalContentWidthMm.toFixed(1)}×${originalContentHeightMm.toFixed(1)}mm (diff: ${originalWidthDiff.toFixed(1)}×${originalHeightDiff.toFixed(1)}mm)`);
                } else {
                  console.log(`✅ CONTENT MATCHES VIEWBOX: No tight crop needed (diff: ${originalWidthDiff.toFixed(1)}×${originalHeightDiff.toFixed(1)}mm)`);
                }
                
                if (needsTightCrop && !isGhostscriptSource) {
                  console.log(`🔄 CREATING TIGHT CONTENT SVG: Content is oversized, cropping to actual bounds`);
                  
                  const svgContent = fs.readFileSync(svgPath, 'utf8');
                  
                  // CRITICAL CHECK: If SVG has crop marker, use crop dimensions instead of calculated bounds
                  let useCropDimensions = false;
                  if (svgContent.includes('data-crop-extracted="true"')) {
                    console.log('🎯 CROP MARKER DETECTED: Using crop viewBox instead of bounds calculation');
                    
                    // Extract crop dimensions from viewBox
                    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
                    if (viewBoxMatch) {
                      const viewBoxValues = viewBoxMatch[1].split(/\s+/).map(Number);
                      if (viewBoxValues.length === 4) {
                        const [x, y, width, height] = viewBoxValues;
                        
                        console.log(`✅ CROP BOUNDS EXTRACTED: ${width.toFixed(1)}×${height.toFixed(1)}px from viewBox`);
                        console.log(`📐 FORCING CROP DIMENSIONS: Canvas will use exact crop rectangle, not calculated bounds`);
                        
                        // Convert crop dimensions to mm for canvas display
                        const cropWidthMm = width * pxToMm;
                        const cropHeightMm = height * pxToMm;
                        
                        // Set displayWidth/displayHeight directly to crop dimensions
                        displayWidth = cropWidthMm;
                        displayHeight = cropHeightMm;
                        
                        console.log(`🎯 CROP CANVAS DISPLAY: ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm (forced from crop viewBox)`);
                        
                        // Skip all bounds extraction and tight content creation since we have exact crop dimensions
                        console.log(`✅ CROP DETECTED: Using exact crop dimensions, skipping bounds calculation`);
                        useCropDimensions = true;
                      } else {
                        console.log('⚠️ CROP MARKER FOUND but invalid viewBox format, falling back to bounds calculation');
                      }
                    } else {
                      console.log('⚠️ CROP MARKER FOUND but could not extract viewBox, falling back to bounds calculation');
                    }
                  }
                  
                  // Only do bounds calculation if crop dimensions weren't used
                  if (!useCropDimensions) {
                  
                  // Extract all content elements (paths, circles, rects, etc.)
                  const contentMatch = svgContent.match(/<svg[^>]*>(.*?)<\/svg>/s);
                  console.log(`🔍 DEBUG: Content extraction - contentMatch found: ${!!contentMatch}`);
                  if (contentMatch) {
                    const innerContent = contentMatch[1];
                    
                    // CRITICAL FIX: Use UNCLAMPED bounds (after clipping analysis, BEFORE clamping to page)
                    // This preserves the actual artwork bounds, not the artificially limited page bounds
                    const boundsForCrop = unclampedContentBounds;
                    console.log(`🎯 USING UNCLAMPED CONTENT BOUNDS FOR TIGHT CROP: ${boundsForCrop.width.toFixed(1)}×${boundsForCrop.height.toFixed(1)}px (unclamped, with clipping)`);
                    
                    // CRITICAL FIX: NO PADDING - viewBox must exactly match content bounds
                    // Adding padding causes content to be scaled down within the bounds
                    const exactWidth = boundsForCrop.width;
                    const exactHeight = boundsForCrop.height;
                    
                    // CRITICAL FIX: Normalize viewBox to (0, 0) and translate content
                    console.log(`🎯 VIEWBOX NORMALIZATION: viewBox exactly matches content (NO PADDING)`);
                    console.log(`📐 Original content bounds: (${boundsForCrop.xMin}, ${boundsForCrop.yMin}) to (${boundsForCrop.xMax}, ${boundsForCrop.yMax})`);
                    
                    // Calculate the translation needed to move content to (0, 0) origin
                    // Content at (xMin, yMin) should move to (0, 0)
                    const translateX = -boundsForCrop.xMin;
                    const translateY = -boundsForCrop.yMin;
                    
                    console.log(`🔄 Translation: (${translateX.toFixed(1)}, ${translateY.toFixed(1)}) to normalize content position`);
                    console.log(`📐 viewBox: 0 0 ${exactWidth.toFixed(1)} ${exactHeight.toFixed(1)} (EXACT content size, no padding)`);
                    
                    // Create minimal SVG wrapper with EXACT viewBox matching content bounds
                    // NO padding - content fills the viewBox completely for tight bounds
                    const tightSvg = `<svg xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 ${exactWidth} ${exactHeight}"
                      preserveAspectRatio="xMidYMid meet"
                      data-content-extracted="true"
                      data-original-bounds="${boundsForCrop.xMin},${boundsForCrop.yMin},${boundsForCrop.xMax},${boundsForCrop.yMax}">
                        <g transform="translate(${translateX}, ${translateY})">
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
                    
                    // CRITICAL FIX: Update contentBounds to reflect the NORMALIZED coordinates
                    // After translation, content now starts at (0, 0) - NO PADDING
                    const normalizedContentBounds = {
                      xMin: 0,
                      yMin: 0,
                      xMax: boundsForCrop?.width || 0,
                      yMax: boundsForCrop?.height || 0,
                      width: boundsForCrop?.width || 0,
                      height: boundsForCrop?.height || 0,
                      units: (boundsForCrop?.units || 'px') as 'px' | 'mm' | 'pt'
                    };
                    
                    console.log(`🎯 NORMALIZED CONTENT BOUNDS: (0, 0) to (${normalizedContentBounds.xMax.toFixed(1)}, ${normalizedContentBounds.yMax.toFixed(1)})`);
                    console.log(`✅ Content fills viewBox exactly - NO PADDING, tight bounds`);
                    
                    // Replace the original bounds with normalized bounds for correct frontend rendering
                    contentBounds = normalizedContentBounds;
                    
                    // ARCHITECT FIX: Recalculate dimensions from NORMALIZED bounds, not original bounds
                    contentWidthMm = contentBounds.width * pxToMm;
                    contentHeightMm = contentBounds.height * pxToMm;
                    console.log(`📐 RECALCULATED DIMENSIONS FROM NORMALIZED BOUNDS: ${contentWidthMm.toFixed(1)}×${contentHeightMm.toFixed(1)}mm`);
                  }
                } else if (usingPdfContentBounds) {
                  // We have exact PDF content bounds, use them directly
                  console.log(`✅ USING PDF CONTENT BOUNDS: Exact content size from original PDF`);
                } else {
                  // Content is already reasonable size, use as-is
                  console.log(`✅ CONTENT SIZE REASONABLE: Using original SVG bounds without tight crop`);
                }
                
                // CRITICAL: Only update dimensions if NOT using Ghostscript bbox
                // Ghostscript already set accurate displayWidth/displayHeight at extraction time
                if (!isGhostscriptSource) {
                  // Use actual content bounds for canvas display (for SVG analyzer source)
                  displayWidth = contentWidthMm;
                  displayHeight = contentHeightMm;
                  console.log(`🎯 CANVAS DISPLAY: Using SVG analyzer bounds ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm`);
                } else {
                  // Ghostscript source: displayWidth/displayHeight already set from GS bbox
                  console.log(`✅ GHOSTSCRIPT SOURCE: Keeping GS bbox dimensions ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                }
              }
              
            } // End of if (needsTightCrop && !isGhostscriptSource) block
            
            // CRITICAL: When Ghostscript bbox succeeded, preserve those dimensions
            // This runs AFTER the tight-content block (whether it executed or was skipped)
            if (boundsResult?.method === 'ghostscript-bbox') {
              console.log(`✅ GHOSTSCRIPT FINAL: displayWidth=${displayWidth.toFixed(2)}mm, displayHeight=${displayHeight.toFixed(2)}mm preserved from GS bbox`);
            }
            
            // CRITICAL FIX: After font outlining, the content may extend beyond Ghostscript bbox
            // If outlined bounds are larger, use the MAX of both to prevent clipping
            if ((file as any).outlinedContentBounds && (file as any).forceContentBounds) {
              const outlinedBounds = (file as any).outlinedContentBounds;
              // Inkscape returns SVG native units (points at 72dpi), convert to mm: mm = pts * 25.4 / 72
              const ptsToMm = 25.4 / 72;
              const outlinedWidthMm = outlinedBounds.width * ptsToMm;
              const outlinedHeightMm = outlinedBounds.height * ptsToMm;
              
              console.log(`🔍 OUTLINED BOUNDS CHECK: Inkscape=${outlinedWidthMm.toFixed(2)}×${outlinedHeightMm.toFixed(2)}mm vs GS=${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
              
              // CRITICAL: Check if GS bbox has offset origin (content is offset from page origin)
              // If GS bbox has offset (xMin > 5 or yMin > 5), GS correctly measured offset content - trust it
              // If GS bbox is at origin (xMin ~= 0, yMin ~= 0), GS might miss content - use Inkscape if larger
              const gsHasOffsetOrigin = originalPdfBounds && (originalPdfBounds.xMin > 5 || originalPdfBounds.yMin > 5);
              const inkscapeIsLarger = outlinedWidthMm > displayWidth * 1.01 || outlinedHeightMm > displayHeight * 1.01;
              
              console.log(`🔍 GS ORIGIN CHECK: xMin=${originalPdfBounds?.xMin?.toFixed(1) || 'N/A'}, yMin=${originalPdfBounds?.yMin?.toFixed(1) || 'N/A'}, hasOffset=${gsHasOffsetOrigin}`);
              
              if (gsHasOffsetOrigin) {
                // GS bbox has offset origin - it correctly measured offset content, trust it
                console.log(`✅ KEEPING GS BOUNDS: GS bbox has offset origin (${originalPdfBounds!.xMin.toFixed(1)}, ${originalPdfBounds!.yMin.toFixed(1)}) - trusted measurement ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                // Don't override with Inkscape - it returns page size for offset content
              } else if (inkscapeIsLarger && outlinedBounds.minX === 0 && outlinedBounds.minY === 0) {
                // GS bbox at origin but Inkscape gives larger bounds - use Inkscape to catch missed content
                console.log(`📐 USING INKSCAPE BOUNDS (GS at origin, Inkscape larger): ${outlinedWidthMm.toFixed(2)}×${outlinedHeightMm.toFixed(2)}mm (was GS: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm)`);
                displayWidth = outlinedWidthMm;
                displayHeight = outlinedHeightMm;
                
                // Update content bounds to match Inkscape's accurate measurement
                if (boundsResult?.contentBounds) {
                  boundsResult.contentBounds.width = outlinedBounds.width;
                  boundsResult.contentBounds.height = outlinedBounds.height;
                  boundsResult.contentBounds.xMin = 0;
                  boundsResult.contentBounds.yMin = 0;
                  boundsResult.contentBounds.xMax = outlinedBounds.width;
                  boundsResult.contentBounds.yMax = outlinedBounds.height;
                  console.log(`📐 UPDATED CONTENT BOUNDS from Inkscape: ${boundsResult.contentBounds.width.toFixed(2)}×${boundsResult.contentBounds.height.toFixed(2)}pts`);
                }
              } else if (inkscapeIsLarger && !gsHasOffsetOrigin) {
                const newWidth = Math.max(displayWidth, outlinedWidthMm);
                const newHeight = Math.max(displayHeight, outlinedHeightMm);
                console.log(`📐 EXPANDING BOUNDS: Using larger outlined bounds ${newWidth.toFixed(2)}×${newHeight.toFixed(2)}mm to prevent clipping`);
                displayWidth = newWidth;
                displayHeight = newHeight;
                
                // Also update the content bounds to match
                if (boundsResult?.contentBounds) {
                  const mmToPts = 72 / 25.4;
                  boundsResult.contentBounds.width = Math.max(boundsResult.contentBounds.width, outlinedBounds.width);
                  boundsResult.contentBounds.height = Math.max(boundsResult.contentBounds.height, outlinedBounds.height);
                  boundsResult.contentBounds.xMax = boundsResult.contentBounds.xMin + boundsResult.contentBounds.width;
                  boundsResult.contentBounds.yMax = boundsResult.contentBounds.yMin + boundsResult.contentBounds.height;
                  console.log(`📐 UPDATED CONTENT BOUNDS: ${boundsResult.contentBounds.width.toFixed(2)}×${boundsResult.contentBounds.height.toFixed(2)}pts`);
                }
                
                // CRITICAL: Update the SVG viewBox to match the expanded bounds
                // MUST normalize to zero-origin for proper rendering
                if (fs.existsSync(svgPath)) {
                  try {
                    let svgContent = fs.readFileSync(svgPath, 'utf8');
                    const newViewBoxWidth = outlinedBounds.width;
                    const newViewBoxHeight = outlinedBounds.height;
                    
                    // Calculate the additional translation needed for negative coords
                    const additionalTranslateX = -(outlinedBounds.minX || 0);
                    const additionalTranslateY = -(outlinedBounds.minY || 0);
                    
                    // Update viewBox to zero-origin (always start at 0,0)
                    svgContent = svgContent.replace(
                      /viewBox="[^"]*"/,
                      `viewBox="0 0 ${newViewBoxWidth.toFixed(2)} ${newViewBoxHeight.toFixed(2)}"`
                    );
                    // Update width/height attributes
                    svgContent = svgContent.replace(/width="[^"]*"/, `width="${newViewBoxWidth.toFixed(2)}"`);
                    svgContent = svgContent.replace(/height="[^"]*"/, `height="${newViewBoxHeight.toFixed(2)}"`);
                    
                    // Update the existing translate transform to account for expanded bounds
                    // The outlined bounds have negative minX/minY, so we need to ADD the shift to existing translate
                    const existingTranslateMatch = svgContent.match(/<g transform="translate\(([^,]+),\s*([^)]+)\)">/);
                    if (existingTranslateMatch) {
                      const existingX = parseFloat(existingTranslateMatch[1]);
                      const existingY = parseFloat(existingTranslateMatch[2]);
                      const combinedX = existingX + additionalTranslateX;
                      const combinedY = existingY + additionalTranslateY;
                      svgContent = svgContent.replace(
                        /<g transform="translate\([^)]+\)">/,
                        `<g transform="translate(${combinedX.toFixed(2)}, ${combinedY.toFixed(2)})">`
                      );
                      console.log(`   Combined translate: (${existingX.toFixed(2)}, ${existingY.toFixed(2)}) + (${additionalTranslateX.toFixed(2)}, ${additionalTranslateY.toFixed(2)}) = (${combinedX.toFixed(2)}, ${combinedY.toFixed(2)})`);
                    } else {
                      // No existing translate, add new one
                      svgContent = svgContent.replace(
                        /<svg([^>]*)>/,
                        `<svg$1>\n<g transform="translate(${additionalTranslateX.toFixed(2)}, ${additionalTranslateY.toFixed(2)})">`
                      );
                      svgContent = svgContent.replace(/<\/svg>/, '</g>\n</svg>');
                    }
                    
                    fs.writeFileSync(svgPath, svgContent);
                    console.log(`✅ EXPANDED SVG VIEWBOX to 0 0 ${newViewBoxWidth.toFixed(2)} ${newViewBoxHeight.toFixed(2)} with translate(${additionalTranslateX.toFixed(2)}, ${additionalTranslateY.toFixed(2)})`);
                  } catch (svgError) {
                    console.error('⚠️ Failed to update SVG viewBox for expanded bounds:', svgError);
                  }
                }
              } else {
                console.log(`✅ GS bounds are adequate - no expansion needed`);
              }
            }
              
            } catch (boundsError) {
              console.error('❌ Bounds extraction error:', boundsError);
              
              // CRITICAL FIX: If we have PDF page dimensions, use them instead of generic fallback
              if (pdfPageDimensions) {
                displayWidth = pdfPageDimensions.widthMm;
                displayHeight = pdfPageDimensions.heightMm;
                console.log(`✅ USING PDF PAGE DIMENSIONS AS ERROR FALLBACK: ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm (from MediaBox)`);
              } else {
                // Fallback to the original robust dimension system
                const { detectDimensionsFromSVG } = await import('./dimension-utils');
                const updatedSvgContent2 = fs.readFileSync(svgPath, 'utf8');
                const dimensionResult = await detectDimensionsFromSVG(updatedSvgContent2, null, svgPath);
                displayWidth = dimensionResult.widthMm;
                displayHeight = dimensionResult.heightMm;
                
                console.log(`🔄 ERROR FALLBACK: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm (${dimensionResult.source})`);
              }
            }

          } else {
            // Fallback: for large documents with no detectable content bounds
            // BUT preserve dimensions if already set for complex file PNG fallback
            if ((file as any).isComplexFilePngFallback && (file as any).originalPdfBounds) {
              console.log(`Large format complex file - using pre-extracted PDF bounds: ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm`);
              // displayWidth and displayHeight already set from originalPdfBounds
            } else {
              console.log(`Large format document with no detectable content bounds, using conservative sizing`);
              displayWidth = 200;
              displayHeight = 150;
            }
          }
        } catch (error) {
          console.error('Failed to calculate content bounds:', error);
        }

        // Update the existing logo with the final filename after bounds extraction
        console.log(`💾 UPDATING LOGO: ${logo.id} with final filename=${finalFilename}, url=${finalUrl}`);
        
        // CRITICAL: Always save content bounds - use extracted bounds or fallback to full element
        let contentBoundsToSave = null;
        if (boundsResult?.success && boundsResult.contentBounds) {
          contentBoundsToSave = boundsResult.contentBounds;
          console.log(`✅ Using extracted content bounds: ${JSON.stringify(contentBoundsToSave)}`);
        } else {
          // Fallback: Create content bounds from display dimensions
          // This ensures ALL logos have content bounds for position warnings
          const mmToPixelRatio = 2.834645669; // 72 DPI conversion
          const widthPx = displayWidth * mmToPixelRatio;
          const heightPx = displayHeight * mmToPixelRatio;
          contentBoundsToSave = {
            xMin: 0,
            yMin: 0,
            xMax: widthPx,
            yMax: heightPx,
            width: widthPx,
            height: heightPx
          };
          console.log(`⚠️ Bounds extraction failed - using fallback content bounds from display size: ${displayWidth}×${displayHeight}mm = ${widthPx.toFixed(1)}×${heightPx.toFixed(1)}px`);
        }
        
        const updatedLogo = await storage.updateLogo(logo.id, {
          filename: finalFilename, // This will be the tight-content version if bounds extraction worked
          mimeType: finalMimeType,
          ...((file as any).extractedRasterPath && { extractedRasterPath: (file as any).extractedRasterPath }),
          ...(analysisData && { svgColors: analysisData }),
          // CRITICAL FIX: ALWAYS save contentBounds - use extracted or fallback
          contentBounds: contentBoundsToSave,
          // CRITICAL: Store ORIGINAL dimensions for PDF output (before any auto-scaling)
          // These are used by PDF generator to preserve exact original size
          originalWidth: displayWidth,
          originalHeight: displayHeight,
          // CRITICAL: Store original PDF content bounds (before normalization) for cropping
          // These are the coordinates in the ORIGINAL PDF that need to be cropped for proper embedding
          ...(originalPdfBounds && { originalPdfBounds })
        });
        
        console.log(`✅ SAVED CONTENTBOUNDS: ${JSON.stringify(contentBoundsToSave)} to logo ${logo.id}`);
        if (originalPdfBounds) {
          console.log(`✅ SAVED ORIGINAL PDF BOUNDS for cropping: (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
        }
        
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

        // Calculate usable area (template minus 3mm safety margins on each side)
        const safetyMargin = 3; // 3mm safety margin
        const usableWidth = templateSize.width - (safetyMargin * 2);
        const usableHeight = templateSize.height - (safetyMargin * 2);

        // DISABLED AUTO-SCALE: Per user requirement, artwork must retain exact original dimensions
        // Content that exceeds template bounds will extend beyond but retain true size
        let finalDisplayWidth = displayWidth;
        let finalDisplayHeight = displayHeight;
        let wasAutoScaled = false;
        
        // Log if content exceeds bounds (but do NOT scale)
        if (displayWidth > usableWidth || displayHeight > usableHeight) {
          console.log(`📐 ORIGINAL SIZE PRESERVED: Content ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm exceeds usable area ${usableWidth.toFixed(1)}×${usableHeight.toFixed(1)}mm`);
          console.log(`   ⚠️ Content will extend beyond template bounds - this is expected behavior`);
          console.log(`   ℹ️ User can manually scale via "Fit to Bounds" if needed`);
        }

        // Use center-based coordinate system
        // Origin (0,0) is at the center of the template
        // Content is positioned by its center point
        let centerX = 0;  // Center of template
        let centerY = 0;  // Center of template
        
        console.log(`📐 Center-based positioning: content at (${centerX}, ${centerY}) - template center`);
        console.log(`📐 Template: ${templateSize.width}×${templateSize.height}mm, Content: ${finalDisplayWidth.toFixed(1)}×${finalDisplayHeight.toFixed(1)}mm${wasAutoScaled ? ' (auto-scaled)' : ''}`);

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

        const uploadCanvasIndex = parseInt(req.body?.canvasIndex) || 0;
        console.log(`🔍 DEBUG: Creating canvas element with logoId: ${updatedLogo.id}, canvasIndex: ${uploadCanvasIndex}`);
        const canvasElementData = {
          projectId: projectId,
          logoId: updatedLogo.id,
          x: centerX,
          y: centerY,
          width: finalDisplayWidth,
          height: finalDisplayHeight,
          rotation: 0,
          zIndex: logos.length - 1,
          isVisible: true,
          isLocked: false,
          colorOverrides: colorOverrides,
          canvasIndex: uploadCanvasIndex
        };

        const createdElement = await storage.createCanvasElement(canvasElementData);
        console.log(`✅ Successfully created canvas element: ${createdElement.id} for logo: ${updatedLogo.id}`);
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

  // External file link endpoint (deprecated - use Dropbox file request instead)
  app.post('/api/projects/:projectId/logos/external-link', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { fileUrl, service, fileName, notes } = req.body;
      
      if (!fileUrl || !fileName) {
        return res.status(400).json({ error: 'File URL and file name are required' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Create a placeholder SVG for the canvas
      const placeholderSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f3f4f6"/>
  <rect x="10" y="10" width="380" height="280" fill="white" stroke="#d1d5db" stroke-width="2" stroke-dasharray="10,5"/>
  <text x="200" y="120" font-family="Arial" font-size="18" fill="#6b7280" text-anchor="middle" font-weight="bold">
    EXTERNAL FILE
  </text>
  <text x="200" y="155" font-family="Arial" font-size="14" fill="#9ca3af" text-anchor="middle">
    ${fileName.substring(0, 35)}${fileName.length > 35 ? '...' : ''}
  </text>
  <text x="200" y="190" font-family="Arial" font-size="12" fill="#9ca3af" text-anchor="middle">
    via ${service.toUpperCase()}
  </text>
  <text x="200" y="230" font-family="Arial" font-size="11" fill="#d1d5db" text-anchor="middle">
    File will be downloaded during production
  </text>
</svg>`;

      // Save placeholder SVG to uploads directory
      const uploadDir = path.join(process.cwd(), 'uploads');
      const placeholderFilename = `placeholder_${Date.now()}.svg`;
      const placeholderPath = path.join(uploadDir, placeholderFilename);
      fs.writeFileSync(placeholderPath, placeholderSvg);

      // Create logo record with external file info
      const logoData = {
        projectId,
        filename: placeholderFilename,
        originalName: fileName,
        mimeType: 'image/svg+xml',
        size: Buffer.from(placeholderSvg).length,
        width: 400,
        height: 300,
        url: `/uploads/${placeholderFilename}`,
        externalFileUrl: fileUrl,
        externalFileService: service,
        isPlaceholder: true,
        svgColors: notes ? { notes } : null
      };

      const logo = await storage.createLogo(logoData);

      // Create canvas element for the placeholder
      const templateSizes = await storage.getTemplateSizes();
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      
      if (!templateSize) {
        return res.status(404).json({ error: 'Template size not found' });
      }

      const canvasElementData = {
        projectId,
        logoId: logo.id,
        elementType: 'logo' as const,
        x: (templateSize.pixelWidth - 400) / 2,
        y: (templateSize.pixelHeight - 300) / 2,
        width: 400,
        height: 300,
        rotation: 0,
        zIndex: 0,
        isVisible: true,
        isLocked: false
      };

      await storage.createCanvasElement(canvasElementData);

      res.json(logo);
    } catch (error) {
      console.error('External file link error:', error);
      res.status(500).json({ error: 'Failed to add external file link' });
    }
  });

  // Dropbox file request endpoint - Generate upload link dynamically
  app.post('/api/projects/:projectId/logos/dropbox-upload', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { fileName, description } = req.body;
      
      if (!fileName) {
        return res.status(400).json({ error: 'File name is required' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Create Dropbox file request
      const { createFileRequest } = await import('./dropbox-service');
      const fileRequest = await createFileRequest(projectId, fileName, description);
      
      console.log(`📤 Dropbox file request created for project ${projectId}: ${fileRequest.url}`);

      // Get template to determine placeholder
      const templateSizes = await storage.getTemplateSizes();
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      
      if (!templateSize) {
        return res.status(404).json({ error: 'Template size not found' });
      }

      // Use template-specific placeholder if available, otherwise use generic PDF
      const placeholderFilename = templateSize.placeholderImage || 'placeholders/generic_dropbox_CT.pdf';
      const placeholderPath = path.join(process.cwd(), 'uploads', placeholderFilename);
      
      // Get placeholder file stats
      const stats = fs.statSync(placeholderPath);

      // A4 PDF dimensions: 595.28 x 841.89 points = 210 x 297 mm
      const pdfPixelWidth = 595.28;  // A4 width in points
      const pdfPixelHeight = 841.89; // A4 height in points
      
      // Convert PDF points to mm for canvas
      // 1 point = 0.352778 mm (standard conversion for PDF points to metric)
      const pdfWidthMm = Math.round(pdfPixelWidth * 0.352778);  // 210mm
      const pdfHeightMm = Math.round(pdfPixelHeight * 0.352778); // 297mm
      
      // For PDF placeholders, set contentBounds to match the full A4 page
      // This ensures proper centering without relying on internal content detection
      const placeholderContentBounds = {
        xMin: 0,
        yMin: 0,
        xMax: pdfWidthMm,
        yMax: pdfHeightMm,
        width: pdfWidthMm,
        height: pdfHeightMm,
        units: 'mm' as const
      };
      
      // Create logo record with Dropbox file request info
      const logoData = {
        projectId,
        filename: placeholderFilename,
        originalName: fileName,
        mimeType: 'application/pdf',
        size: stats.size,
        width: pdfPixelWidth,
        height: pdfPixelHeight,
        url: `/uploads/${placeholderFilename}`,
        externalFileUrl: fileRequest.url,
        externalFileService: 'dropbox',
        isPlaceholder: true,
        dropboxFileRequestId: fileRequest.id,
        dropboxFilePath: fileRequest.folder,
        svgColors: description ? { notes: description } : null,
        contentBounds: placeholderContentBounds  // Use full A4 dimensions
      };

      const logo = await storage.createLogo(logoData);
      
      // Canvas uses center-based coordinate system where (0,0) is at template center
      // Position the placeholder at the center of the template
      const canvasElementData = {
        projectId,
        logoId: logo.id,
        elementType: 'logo' as const,
        x: 0,  // Center horizontally
        y: 0,  // Center vertically
        width: pdfWidthMm,
        height: pdfHeightMm,
        rotation: 0,
        zIndex: 0,
        isVisible: true,
        isLocked: false
      };

      await storage.createCanvasElement(canvasElementData);

      res.json({
        logo,
        uploadUrl: fileRequest.url,
        fileRequestId: fileRequest.id
      });
    } catch (error) {
      console.error('Dropbox upload request error:', error);
      res.status(500).json({ error: 'Failed to create Dropbox upload link' });
    }
  });

  // Dropbox webhook endpoint for file upload notifications
  app.get('/api/dropbox/webhook', async (req, res) => {
    // Dropbox sends a GET request with a challenge parameter for verification
    const challenge = req.query.challenge as string;
    if (challenge) {
      console.log('📨 Dropbox webhook verification received');
      return res.status(200).send(challenge);
    }
    res.status(400).send('No challenge parameter');
  });

  app.post('/api/dropbox/webhook', async (req, res) => {
    try {
      // Validate webhook signature to prevent spoofing
      const signature = req.headers['x-dropbox-signature'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const appSecret = process.env.DROPBOX_APP_SECRET;
      
      // NOTE: In production, you MUST set DROPBOX_APP_SECRET environment variable
      // Get it from: https://www.dropbox.com/developers/apps > Your App > Settings > App secret
      if (appSecret) {
        const { validateDropboxWebhook } = await import('./dropbox-webhook-validator');
        const isValid = validateDropboxWebhook(signature, rawBody, appSecret);
        
        if (!isValid) {
          console.error('⚠️ Dropbox webhook signature validation failed - rejecting request');
          return res.status(403).json({ error: 'Invalid webhook signature' });
        }
        console.log('✅ Dropbox webhook signature validated');
      } else {
        console.warn('⚠️ DROPBOX_APP_SECRET not set - skipping webhook signature validation (NOT SAFE FOR PRODUCTION)');
      }
      
      console.log('📨 Dropbox webhook notification received:', JSON.stringify(req.body));
      
      const { list_folder } = req.body;
      
      if (!list_folder || !list_folder.accounts || list_folder.accounts.length === 0) {
        return res.status(200).send('OK');
      }

      // Process webhook notification in background
      setTimeout(async () => {
        try {
          const { listFolderFiles, getFileRequestStatus } = await import('./dropbox-service');
          
          // Check all logos with pending Dropbox uploads
          // Note: This is a simplified check - in production you'd query by dropboxFileRequestId
          const pendingUploads: any[] = [];
          
          // For now, we rely on the notification to trigger a check
          // A production implementation would maintain a queue of pending uploads
          
          console.log(`📂 Found ${pendingUploads.length} pending Dropbox uploads to check`);
          
          for (const logo of pendingUploads) {
            try {
              // Check file request status
              const fileRequest = await getFileRequestStatus(logo.dropboxFileRequestId!);
              
              if (fileRequest.file_count > 0) {
                console.log(`✅ File uploaded for request ${logo.dropboxFileRequestId}: ${fileRequest.file_count} files`);
                
                // Get the project to determine folder path
                const project = await storage.getProject(logo.projectId);
                if (!project) continue;
                
                const folderPath = `/CompleteTransfers/Projects/${project.id}`;
                const files = await listFolderFiles(folderPath);
                
                if (files.length > 0) {
                  const uploadedFile = files[0];
                  
                  // Update logo with Dropbox file path
                  await storage.updateLogo(logo.id, {
                    dropboxFilePath: uploadedFile.path_lower,
                    dropboxUploadedAt: new Date().toISOString()
                  });
                  
                  console.log(`📥 Dropbox file tracked: ${uploadedFile.path_lower} for logo ${logo.id}`);
                }
              }
            } catch (error) {
              console.error(`Error processing logo ${logo.id}:`, error);
            }
          }
        } catch (error) {
          console.error('Webhook processing error:', error);
        }
      }, 0);
      
      // Always respond immediately to Dropbox
      res.status(200).send('OK');
    } catch (error) {
      console.error('Dropbox webhook error:', error);
      res.status(200).send('OK'); // Still return 200 to avoid retries
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
      
      // Check if response might be too large (rough estimate: >10 logos with colors)
      const needsOptimization = logos.length > 10 && logos.some(l => l.svgColors);
      
      if (needsOptimization) {
        // Optimize response: exclude heavy JSONB fields to prevent 413 errors from reverse proxy
        const optimizedLogos = logos.map(logo => {
          const { svgColors, svgFonts, contentBounds, vectorComplexityMetrics, ...essentialFields } = logo;
          return {
            ...essentialFields,
            hasColors: !!svgColors, // Flag to indicate colors are available
            hasFonts: !!svgFonts,
            hasBounds: !!contentBounds
          };
        });
        console.log(`📦 Returning ${optimizedLogos.length} logos (optimized to prevent 413 error)`);
        res.json(optimizedLogos);
      } else {
        // Normal response with all fields
        res.json(logos);
      }
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
      const { force } = req.query; // Allow force deletion with ?force=true
      
      // Get the logo first to check if it exists
      const logo = await storage.getLogo(logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Check if logo is in use by canvas elements (protection against accidental deletion)
      const canvasElements = await storage.getCanvasElementsByProject(logo.projectId || '');
      const elementsUsingLogo = canvasElements.filter(element => element.logoId === logoId);
      
      if (elementsUsingLogo.length > 0 && !force) {
        console.log(`🛡️ PROTECTION: Logo ${logoId} is used by ${elementsUsingLogo.length} canvas elements, refusing deletion`);
        return res.status(409).json({ 
          error: `Logo is currently in use by ${elementsUsingLogo.length} canvas element(s). Delete the elements first or pass ?force=true to override.`,
          elementsInUse: elementsUsingLogo.length
        });
      }
      
      // Delete all canvas elements that use this logo (only if force=true or no elements)
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

  app.get('/api/logos/:logoId/safari-png', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const logo = await storage.getLogo(logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      const pngFilename = logo.filename.replace(/\.svg$/, '-safari-cropped.png');
      const pngPath = path.join(uploadDir, pngFilename);
      
      if (fs.existsSync(pngPath)) {
        return res.sendFile(pngPath);
      }
      
      const { execSync } = await import('child_process');
      
      const bounds = logo.contentBounds as any;
      const hasContentBounds = bounds && typeof bounds === 'object' &&
        typeof bounds.xMin === 'number' && typeof bounds.yMin === 'number' &&
        typeof bounds.width === 'number' && typeof bounds.height === 'number';
      
      let svgToConvert = svgPath;
      let tempSvgPath: string | null = null;
      
      if (hasContentBounds) {
        try {
          let svgContent = fs.readFileSync(svgPath, 'utf8');
          const newViewBox = `${bounds.xMin} ${bounds.yMin} ${bounds.width} ${bounds.height}`;
          console.log(`🍎 Safari PNG: Cropping SVG to content bounds viewBox="${newViewBox}"`);
          
          if (/viewBox\s*=\s*["'][^"']*["']/i.test(svgContent)) {
            svgContent = svgContent.replace(
              /viewBox\s*=\s*["'][^"']*["']/i,
              `viewBox="${newViewBox}"`
            );
          } else {
            svgContent = svgContent.replace(/<svg([^>]*)>/i, `<svg$1 viewBox="${newViewBox}">`);
          }
          
          svgContent = svgContent.replace(
            /(<svg[^>]*?)(\s+width\s*=\s*["'][^"']*["'])([^>]*?>)/i,
            '$1$3'
          );
          svgContent = svgContent.replace(
            /(<svg[^>]*?)(\s+height\s*=\s*["'][^"']*["'])([^>]*?>)/i,
            '$1$3'
          );
          
          tempSvgPath = svgPath.replace(/\.svg$/, '-safari-cropped.svg');
          fs.writeFileSync(tempSvgPath, svgContent);
          svgToConvert = tempSvgPath;
        } catch (e) {
          console.log('Could not crop SVG to content bounds, using original:', e);
          svgToConvert = svgPath;
        }
      }
      
      try {
        execSync(`rsvg-convert "${svgToConvert}" -o "${pngPath}" -d 300 -p 300`, { 
          stdio: 'pipe', timeout: 30000 
        });
      } catch {
        execSync(`inkscape "${svgToConvert}" --export-filename="${pngPath}" --export-dpi=300`, {
          stdio: 'pipe', timeout: 30000
        });
      }
      
      if (tempSvgPath && fs.existsSync(tempSvgPath)) {
        try { fs.unlinkSync(tempSvgPath); } catch {}
      }
      
      try {
        await storage.updateLogo(logoId, { canvasFallbackFilename: pngFilename });
      } catch (e) {
        console.log('Could not persist safari fallback filename:', e);
      }
      
      res.sendFile(pngPath);
    } catch (error) {
      console.error('Safari PNG generation error:', error);
      res.status(500).json({ error: 'Failed to generate PNG' });
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
      
      // Make deletion idempotent - return success even if element doesn't exist
      if (!deleted) {
        console.log(`🗑️ Canvas element ${elementId} not found (already deleted or never existed)`);
        return res.json({ success: true, message: 'Canvas element deleted successfully (was already removed)' });
      }
      
      console.log(`🗑️ Successfully deleted canvas element: ${elementId}`);
      res.json({ success: true, message: 'Canvas element deleted successfully' });
    } catch (error) {
      console.error('Delete canvas element error:', error);
      res.status(500).json({ error: 'Failed to delete canvas element' });
    }
  });

  // Create canvas element directly
  app.post('/api/projects/:projectId/canvas-elements', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      const elementData: any = {
        projectId,
        logoId: req.body.logoId || null,
        elementType: req.body.elementType || 'logo',
        x: req.body.x || 0,
        y: req.body.y || 0,
        width: req.body.width || 50,
        height: req.body.height || 50,
        rotation: req.body.rotation || 0,
        zIndex: req.body.zIndex || 0,
        isVisible: req.body.isVisible !== false,
        isLocked: req.body.isLocked || false,
        colorOverrides: req.body.colorOverrides || null,
        canvasIndex: req.body.canvasIndex || 0,
        fillColor: req.body.fillColor || null,
        strokeColor: req.body.strokeColor || '#000000',
        strokeWidth: req.body.strokeWidth ?? 1,
        opacity: req.body.opacity ?? 1,
        cornerRadius: req.body.cornerRadius ?? 0,
      };
      const created = await storage.createCanvasElement(elementData);
      res.json(created);
    } catch (error) {
      console.error('Create canvas element error:', error);
      res.status(500).json({ error: 'Failed to create canvas element' });
    }
  });

  // Extract selected SVG elements into a new SVG file for embroidery canvas
  app.post('/api/logos/:logoId/extract-elements', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const { selectedIndices, projectId } = req.body;
      
      if (!selectedIndices || !Array.isArray(selectedIndices) || selectedIndices.length === 0) {
        return res.status(400).json({ error: 'selectedIndices array is required' });
      }
      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }
      
      const logo = await storage.getLogo(logoId);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'Element extraction only works with SVG files' });
      }
      
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join('uploads', logo.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'SVG file not found on disk' });
      }
      
      const svgContent = fs.readFileSync(filePath, 'utf-8');
      const selectedSet = new Set(selectedIndices.map(Number));
      
      // Parse SVG and extract only selected elements using same depth-first indexing
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
      const doc = dom.window.document;
      const svgRoot = doc.documentElement;
      
      // First pass: index all elements and mark which to keep
      let elementIndex = 0;
      const keepSet = new Set<Element>();
      
      const indexElements = (el: Element) => {
        if (el.tagName.toLowerCase() === 'defs') return;
        const currentIndex = elementIndex++;
        if (selectedSet.has(currentIndex)) {
          keepSet.add(el);
        }
        Array.from(el.children).forEach(c => indexElements(c));
      };
      indexElements(svgRoot);
      
      // Second pass: remove non-selected leaf elements (keep structure for selected ones)
      const removeUnselected = (el: Element): boolean => {
        if (el.tagName.toLowerCase() === 'defs') return true; // Always keep defs
        if (el === svgRoot) {
          Array.from(el.children).forEach(child => {
            if (!removeUnselected(child)) {
              el.removeChild(child);
            }
          });
          return true;
        }
        
        if (keepSet.has(el)) return true;
        
        // Check if any descendant is selected
        let hasSelectedChild = false;
        Array.from(el.children).forEach(child => {
          if (removeUnselected(child)) {
            hasSelectedChild = true;
          } else {
            el.removeChild(child);
          }
        });
        
        return hasSelectedChild;
      };
      removeUnselected(svgRoot);
      
      // Serialize the filtered SVG
      const serializer = new dom.window.XMLSerializer();
      const extractedSvg = serializer.serializeToString(svgRoot);
      
      // Save as new file
      const { randomUUID } = await import('crypto');
      const newFilename = `${randomUUID()}_embroidery-extract.svg`;
      const newFilePath = path.join('uploads', newFilename);
      fs.writeFileSync(newFilePath, extractedSvg);
      
      // Create a new logo record
      const newLogo = await storage.createLogo({
        projectId,
        filename: newFilename,
        originalName: `${logo.originalName} (embroidery)`,
        mimeType: 'image/svg+xml',
        size: Buffer.byteLength(extractedSvg, 'utf-8'),
        width: logo.width,
        height: logo.height,
        contentBounds: logo.contentBounds
      });
      
      console.log(`✅ Extracted ${selectedIndices.length} elements from ${logo.filename} → ${newFilename}`);
      res.json({ logoId: newLogo.id, filename: newFilename });
    } catch (error) {
      console.error('Extract elements error:', error);
      res.status(500).json({ error: 'Failed to extract SVG elements' });
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

  // Font outlining endpoint for SVG files
  app.post('/api/logos/:logoId/outline-fonts', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const logo = await storage.getLogo(logoId);
      
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }
      
      // Only works for SVG files
      if (logo.mimeType !== 'image/svg+xml') {
        return res.status(400).json({ error: 'Font outlining only available for SVG files' });
      }
      
      const svgPath = path.join(uploadDir, logo.filename);
      if (!fs.existsSync(svgPath)) {
        return res.status(404).json({ error: 'SVG file not found' });
      }
      
      console.log(`🔤 Manual font outlining requested for: ${logo.filename}`);
      
      // Import and run font outlining
      const { outlineFonts } = await import('./font-outliner');
      const outlinedPath = await outlineFonts(svgPath);
      
      if (outlinedPath !== svgPath && fs.existsSync(outlinedPath)) {
        // Replace the original SVG with the outlined version
        const outlinedContent = fs.readFileSync(outlinedPath, 'utf8');
        fs.writeFileSync(svgPath, outlinedContent);
        
        // Clean up the temporary outlined file
        fs.unlinkSync(outlinedPath);
        
        console.log(`✅ Fonts successfully outlined: ${logo.filename}`);
        
        // Re-analyze the outlined SVG to update text status
        const { analyzeSVGWithStrokeWidths } = await import('./svg-color-utils');
        const analysis = analyzeSVGWithStrokeWidths(svgPath);
        
        // Update the logo with fontsOutlined flag and new analysis
        await storage.updateLogo(logoId, {
          fontsOutlined: true,
          svgColors: {
            colors: analysis.colors,
            fonts: analysis.fonts,
            strokeWidths: analysis.strokeWidths,
            minStrokeWidth: analysis.minStrokeWidth,
            maxStrokeWidth: analysis.maxStrokeWidth,
            hasText: analysis.hasText
          },
          svgFonts: analysis.fonts
        });
        
        res.json({ 
          success: true, 
          message: 'Fonts outlined successfully',
          fontsOutlined: true
        });
      } else {
        // No text elements found or outlining returned same path
        console.log(`ℹ️ No text elements to outline in: ${logo.filename}`);
        
        // Still mark as outlined since there's nothing to convert
        await storage.updateLogo(logoId, { fontsOutlined: true });
        
        res.json({ 
          success: true, 
          message: 'No text elements found to outline',
          fontsOutlined: true
        });
      }
    } catch (error) {
      console.error('Font outlining error:', error);
      res.status(500).json({ error: 'Failed to outline fonts' });
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

  // Debug endpoint to check Odoo configuration
  app.get('/api/odoo-config', async (req, res) => {
    const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
    res.json({
      odooUrl: odooBaseUrl,
      pricingEndpoint: `${odooBaseUrl}/artwork/api/pricing`,
      addToCartEndpoint: `${odooBaseUrl}/artwork/api/projects/{uuid}/add-to-cart`,
      hasViteOdooUrl: !!process.env.VITE_ODOO_URL,
    });
  });

  // Pricing endpoint - fetch from Odoo
  app.get('/api/pricing', async (req, res) => {
    console.log('💰 PRICING ENDPOINT CALLED:', { query: req.query });
    
    try {
      const { templateId, copies } = req.query;
      
      if (!templateId || !copies) {
        console.error('❌ Missing params:', { templateId, copies });
        return res.status(400).json({ error: 'Template ID and copies are required' });
      }

      const copiesNum = parseInt(copies as string);
      if (isNaN(copiesNum) || copiesNum < 1) {
        console.error('❌ Invalid copies:', copies);
        return res.status(400).json({ error: 'Invalid copies quantity' });
      }

      // Get Odoo base URL and Complete Transfers website ID from environment
      const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
      const ctWebsiteId = process.env.VITE_ODOO_CT_WEBSITE_ID || '2';
      
      // Build URL with query parameters (Odoo endpoint now uses type='http', not JSON-RPC)
      const odooApiUrl = `${odooBaseUrl}/artwork/api/pricing?templateId=${encodeURIComponent(templateId as string)}&copies=${copiesNum}&source=completetransfers&website_id=${ctWebsiteId}`;

      // Forward cookies from client request to Odoo for customer-specific pricing
      const clientCookies = req.headers.cookie || '';
      console.log(`💰 Fetching Odoo pricing from: ${odooApiUrl}`, { 
        templateId, 
        copies: copiesNum,
        website_id: ctWebsiteId,
        hasCookies: !!clientCookies 
      });

      // Call Odoo pricing API
      // CRITICAL: Pass source=completetransfers and website_id to ensure correct pricelist
      // Forward cookies so Odoo can identify customer and apply customer-specific pricelist
      const response = await fetch(odooApiUrl, {
        method: 'GET',
        headers: {
          'Cookie': clientCookies,  // Forward Odoo session for customer-specific pricing
        },
      });

      if (!response.ok) {
        throw new Error(`Odoo API error: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Handle error response (now direct JSON, not JSON-RPC wrapped)
      if (result.error) {
        console.error('❌ Odoo pricing error:', result.error);
        return res.status(500).json({ 
          error: 'No product mapped for this template. Please configure template mappings in Odoo.',
          details: result.error 
        });
      }
      console.log(`✅ Odoo pricing response:`, result);
      
      // Validate we got valid pricing data
      if (!result.pricePerUnit || result.pricePerUnit === 0) {
        console.error('❌ Invalid pricing data from Odoo:', result);
        return res.status(404).json({ 
          error: 'No pricing available for this template. Please check your Odoo template mappings and product prices.' 
        });
      }
      
      res.json({
        pricePerUnit: result.pricePerUnit,
        totalPrice: result.totalPrice,
        currency: result.currency || 'EUR',
        productName: result.productName,
      });
    } catch (error) {
      console.error('❌ Pricing API error:', error);
      res.status(500).json({ 
        error: 'Failed to connect to Odoo pricing system. Please ensure Odoo is accessible and template mappings are configured.',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Add to Cart endpoint - proxy to Odoo
  app.post('/api/projects/:id/add-to-cart', async (req, res) => {
    let projectId = req.params.id;
    console.log('🛒 ADD TO CART ENDPOINT CALLED:', { projectId, body: { ...req.body, pdfBase64: req.body.pdfBase64 ? '...' : undefined } });
    
    try {
      // Map to Odoo vectorization product if it's a vectorization-only request
      // This handles cases where projectId is passed as 'vector-service' in the URL
      const isVectorizationOnly = req.body.serviceType === 'vectorization-only' || projectId === 'vector-service';
      
      const projectData = req.body;
      
      if (isVectorizationOnly) {
        projectId = 'vector-service';
      }
      
      if (!projectId || projectId === 'undefined') {
        console.error('❌ Missing project ID');
        return res.status(400).json({ error: 'Project ID is required' });
      }

      // Get Odoo base URL from request body (set by frontend based on parent window) or fall back to env
      const odooBaseUrl = projectData.odooBaseUrl || process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
      console.log(`🌐 Using Odoo base URL: ${odooBaseUrl}`);
      
      // Use the projects add-to-cart endpoint for all requests
      // For vectorization-only, we pass template_id in the body to override project template lookup
      const odooApiUrl = `${odooBaseUrl}/artwork/api/projects/${projectId}/add-to-cart`;

      // Forward cookies from client request to Odoo for customer-specific pricing
      const clientCookies = req.headers.cookie || '';
      console.log(`🛒 Proxying add-to-cart to Odoo: ${odooApiUrl}`);
      console.log(`📦 Project data:`, { 
        ...projectData, 
        pdfBase64: projectData.pdfBase64 ? `<${projectData.pdfBase64.length} chars>` : undefined,
        hasCookies: !!clientCookies
      });

      // Add source and website_id parameters to indicate request is from Complete Transfers
      // The website_id is critical for Odoo to use the correct pricelist in iframe context
      const ctWebsiteId = process.env.VITE_ODOO_CT_WEBSITE_ID || '2';  // Default to Complete Transfers website ID
      const requestBody = {
        ...projectData,
        source: 'completetransfers',  // Identifies request as from Complete Transfers for proper pricelist
        website_id: parseInt(ctWebsiteId, 10),  // Explicit website ID for correct pricelist selection
        // For vectorization-only requests, pass template_id so Odoo uses template mapping
        // instead of looking up a project's template field
        ...(isVectorizationOnly && { template_id: 'vector-service' }),
      };

      // Call Odoo add-to-cart API
      // Forward cookies so Odoo can identify customer and apply customer-specific pricelist
      const response = await fetch(odooApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': clientCookies,  // Forward Odoo session for customer identification
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log(`📨 Odoo response status: ${response.status}`);
      console.log(`📨 Odoo response body: ${responseText.substring(0, 500)}`);

      if (!response.ok) {
        console.error('❌ Odoo add-to-cart error:', response.status, responseText);
        return res.status(response.status).json({ 
          error: 'Failed to add to Odoo cart',
          details: responseText 
        });
      }

      // Parse and return Odoo response
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        data = { message: responseText };
      }
      
      console.log(`✅ Successfully added to cart:`, data);
      res.json(data);
    } catch (error) {
      console.error('❌ Add to cart API error:', error);
      res.status(500).json({ 
        error: 'Failed to connect to Odoo. Please ensure Odoo is accessible.',
        details: error instanceof Error ? error.message : String(error)
      });
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

  // Render specific PDF page as preview image (for pass-through mode)
  app.get('/api/logos/:id/pdf-page/:pageNum', async (req, res) => {
    console.log('📄 PDF page preview requested:', req.params.id, 'page:', req.params.pageNum);
    
    try {
      const logo = await storage.getLogo(req.params.id);
      if (!logo) {
        return res.status(404).json({ error: 'Logo not found' });
      }

      const pageNum = parseInt(req.params.pageNum);
      if (isNaN(pageNum) || pageNum < 1) {
        return res.status(400).json({ error: 'Invalid page number' });
      }

      // Verify it's a PDF with multiple pages
      if (!logo.originalFilename || logo.originalMimeType !== 'application/pdf') {
        return res.status(400).json({ error: 'Logo is not a PDF' });
      }

      const pageCount = (logo as any).pageCount || 1;
      if (pageNum > pageCount) {
        return res.status(400).json({ error: `Page ${pageNum} does not exist (PDF has ${pageCount} pages)` });
      }

      const pdfPath = path.join(uploadDir, logo.originalFilename);
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: 'PDF file not found' });
      }

      // Generate preview image using Ghostscript (render specific page)
      const outputPath = path.join(os.tmpdir(), `pdf_page_${logo.id}_${pageNum}_${Date.now()}.png`);
      
      try {
        // Use Ghostscript to render specific page at 150 DPI for preview
        const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r150 -dFirstPage=${pageNum} -dLastPage=${pageNum} -sOutputFile="${outputPath}" "${pdfPath}"`;
        console.log('📋 Ghostscript page render command:', gsCommand);
        
        await execAsync(gsCommand, { timeout: 30000 });
        
        if (!fs.existsSync(outputPath)) {
          return res.status(500).json({ error: 'Failed to render PDF page' });
        }

        const stats = fs.statSync(outputPath);
        console.log(`✅ PDF page ${pageNum} rendered: ${stats.size} bytes`);

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        res.sendFile(outputPath, (err) => {
          // Cleanup after sending
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
          if (err) {
            console.error('Error sending PDF page preview:', err);
          }
        });

      } catch (gsError) {
        console.error('Ghostscript error:', gsError);
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        return res.status(500).json({ error: 'Failed to render PDF page' });
      }

    } catch (error) {
      console.error('Error processing PDF page preview request:', error);
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
      
      // Use original file without modification to preserve PNG integrity
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
      
      // CRITICAL FIX: Shape Stacking setting to make deleted colors transparent instead of black
      const shapeStacking = req.body.shapeStacking || 'cut_out'; // Default to cut-out mode
      formData.append('shape_stacking', shapeStacking);
      console.log(`🔄 Shape Stacking: ${shapeStacking} (${shapeStacking === 'cut_out' ? 'deleted colors will be transparent' : 'deleted colors will be black'})`);
      
      console.log('🎯 Using minimal parameters to preserve original quality');
      
      // CRITICAL FIX: Vector.AI API expects specific mode values based on documentation
      if (!isPreview) {
        // Production mode should NOT include mode parameter (uses default)
        console.log('✅ Production mode - using Vector.AI default settings (no mode parameter)');
      } else {
        formData.append('mode', 'preview');
        console.log('⚡ Preview mode for testing');
      }
      
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
      
      // Check if crop dimensions were provided (from crop interface)
      console.log(`🔍 RAW FORM DATA RECEIVED:`, Object.keys(req.body), JSON.stringify(req.body));
      const cropWidth = req.body.cropWidth ? parseFloat(req.body.cropWidth) : null;
      const cropHeight = req.body.cropHeight ? parseFloat(req.body.cropHeight) : null;
      const hasCropDimensions = cropWidth && cropHeight && cropWidth > 0 && cropHeight > 0;
      
      console.log(`🎯 CROP BOUNDS CHECK: cropWidth=${cropWidth}, cropHeight=${cropHeight}, hasCropDimensions=${hasCropDimensions}`);
      
      // CRITICAL: Filter SVG to only include elements with actual colors IMMEDIATELY after vectorization
      console.log('🎨 VECTORIZATION FILTERING: Starting colored content filtering and bounds recalculation...');
      console.log(`📊 RAW API SVG length: ${result.length} characters`);
      console.log(`📊 RAW API SVG preview (first 300 chars): ${result.substring(0, 300)}`);
      
      try {
        // Extract only elements with visible colors
        const visibleElements = [];
        
        // Extract paths with actual fill/stroke colors (not transparent or none)
        const pathMatches = result.match(/<path[^>]*>/g) || [];
        for (const path of pathMatches) {
          const hasVisibleFill = path.includes('fill=') && !path.includes('fill="none"') && !path.includes('fill="transparent"');
          const hasVisibleStroke = path.includes('stroke=') && !path.includes('stroke="none"') && !path.includes('stroke="transparent"');
          
          if (hasVisibleFill || hasVisibleStroke) {
            visibleElements.push(path);
          }
        }
        
        // Extract other shapes with visible colors
        const shapeMatches = result.match(/<(circle|rect|ellipse|polygon|polyline)[^>]*>/g) || [];
        for (const shape of shapeMatches) {
          const hasVisibleFill = shape.includes('fill=') && !shape.includes('fill="none"') && !shape.includes('fill="transparent"');
          const hasVisibleStroke = shape.includes('stroke=') && !shape.includes('stroke="none"') && !shape.includes('stroke="transparent"');
          
          if (hasVisibleFill || hasVisibleStroke) {
            visibleElements.push(shape);
          }
        }
        
        // Extract text elements (usually visible by default)
        const textMatches = result.match(/<text[^>]*>.*?<\/text>/g) || [];
        visibleElements.push(...textMatches);
        
        console.log(`🎨 IMMEDIATE FILTERING: Found ${visibleElements.length} colored elements out of ${pathMatches.length + shapeMatches.length + textMatches.length} total elements`);
        console.log(`🔍 Breakdown: ${pathMatches.length} paths, ${shapeMatches.length} shapes, ${textMatches.length} text elements`);
        
        if (visibleElements.length > 0) {
          // Create clean SVG with only colored content
          const coloredContent = visibleElements.join('\n    ');
          
          // Create a temporary SVG to analyze bounds
          const tempSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
    ${coloredContent}
</svg>`;
          
          // Calculate bounds of just the colored content
          const { SVGBoundsAnalyzer } = await import('./svg-bounds-analyzer');
          const analyzer = new SVGBoundsAnalyzer();
          
          console.log(`🧮 IMMEDIATE BOUNDS CALCULATION: Analyzing filtered content (${tempSvg.length} chars)`);
          const boundsResult = await analyzer.analyzeSVGContent(tempSvg);
          console.log(`📐 IMMEDIATE BOUNDS RESULT: ${JSON.stringify(boundsResult)}`);
          
          if (boundsResult.success && boundsResult.contentBounds) {
            const bounds = boundsResult.contentBounds;
            
            let finalX, finalY, finalWidth, finalHeight;
            
            if (hasCropDimensions) {
              // USE CROP DIMENSIONS: Set SVG bounds to match user's selected crop rectangle
              finalX = 0;
              finalY = 0;
              finalWidth = cropWidth!;
              finalHeight = cropHeight!;
              
              console.log(`🎯 USING CROP BOUNDS: ${finalWidth.toFixed(1)}×${finalHeight.toFixed(1)}px (from user crop selection)`);
              console.log(`📐 Content will be positioned within crop bounds: ${bounds.xMin}, ${bounds.yMin}, w=${bounds.width}, h=${bounds.height}`);
            } else {
              // FALLBACK: Use automatic tight content bounds  
              const padding = 2; // 2px padding
              finalX = bounds.xMin - padding;
              finalY = bounds.yMin - padding;
              finalWidth = bounds.width + (padding * 2);
              finalHeight = bounds.height + (padding * 2);
              
              console.log(`🎯 AUTOMATIC TIGHT BOUNDS: ${finalWidth.toFixed(1)}×${finalHeight.toFixed(1)}px (content + padding)`);
              console.log(`📐 Content bounds: x=${bounds.xMin}, y=${bounds.yMin}, w=${bounds.width}, h=${bounds.height}`);
            }
            
            // Get original SVG attributes to preserve
            const svgOpenMatch = result.match(/<svg[^>]*>/);
            if (svgOpenMatch) {
              let svgAttributes = svgOpenMatch[0];
              
              // Preserve important attributes but update dimensions to crop or tight bounds
              svgAttributes = svgAttributes.replace(/viewBox="[^"]*"/, `viewBox="${finalX.toFixed(2)} ${finalY.toFixed(2)} ${finalWidth.toFixed(2)} ${finalHeight.toFixed(2)}"`);
              svgAttributes = svgAttributes.replace(/width="[^"]*"/, `width="${finalWidth.toFixed(2)}"`);
              svgAttributes = svgAttributes.replace(/height="[^"]*"/, `height="${finalHeight.toFixed(2)}"`);
              
              // Add appropriate marker
              const marker = hasCropDimensions ? 'data-crop-extracted="true"' : 'data-content-extracted="true"';
              if (!svgAttributes.includes(marker)) {
                svgAttributes = svgAttributes.replace('<svg', `<svg ${marker}`);
              }
              
              result = `<?xml version="1.0" encoding="UTF-8"?>
${svgAttributes}
    ${coloredContent}
</svg>`;
              
              const boundsType = hasCropDimensions ? 'CROP' : 'CONTENT';
              console.log(`✅ IMMEDIATE FILTERING SUCCESS: Created ${boundsType}-bounds SVG with only colored content`);
              console.log(`🎯 NEW ${boundsType} VIEWBOX: "${finalX.toFixed(2)} ${finalY.toFixed(2)} ${finalWidth.toFixed(2)} ${finalHeight.toFixed(2)}"`);
              console.log(`📋 FILTERED SVG length: ${result.length} characters`);
            }
          } else {
            console.log('⚠️ Could not calculate immediate tight bounds, using filtered content with original bounds');
            // Fall back to just filtering without bounds recalculation
            const svgOpenMatch = result.match(/<svg[^>]*>/);
            const svgCloseMatch = result.match(/<\/svg>/);
            
            if (svgOpenMatch && svgCloseMatch) {
              const svgOpen = svgOpenMatch[0];
              const svgClose = svgCloseMatch[0];
              
              result = `<?xml version="1.0" encoding="UTF-8"?>
${svgOpen}
    ${coloredContent}
${svgClose}`;
              
              console.log(`✅ IMMEDIATE CONTENT FILTERING: Applied filtering without bounds recalculation`);
            }
          }
        } else {
          console.log('⚠️ No colored elements found in immediate filtering, keeping original SVG');
        }
      } catch (error) {
        console.error('❌ Error in immediate vectorization filtering:', error);
        // Keep original SVG on error
      }
      
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
      
      // FIXED: Only recalculate bounds if crop dimensions weren't provided
      if (!hasCropDimensions) {
        // Re-calculate dimension after cleaning and applying vector effects
        const cleanedBounds = calculateSVGContentBounds(result);
        if (cleanedBounds) {
          console.log(`✅ Cleaned vectorized bounds: ${cleanedBounds.width}×${cleanedBounds.height}`);
          
          // DISABLED: Content bounds cropping was cutting off parts of the logo
          // Keep Vector.AI's original viewBox to preserve the complete logo
          console.log(`✅ Preserving Vector.AI original viewBox to keep complete logo intact`);
        }
      } else {
        console.log(`🎯 CROP DIMENSIONS FORCED: Skipping bounds recalculation to preserve user's crop selection ${cropWidth}×${cropHeight}px`);
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
      // No additional cleanup needed
      
      // Apply tight cropping if requested (post-processing)
      let finalSvg = cmykSvg;
      const enableTightCropping = req.body.enableTightCropping === 'true';
      
      console.log(`🔧 TIGHT CROPPING DEBUG: enableTightCropping = "${req.body.enableTightCropping}" -> ${enableTightCropping}`);
      console.log(`🔧 CMYK SVG LENGTH: ${cmykSvg.length} characters`);
      console.log(`🔧 PREVIEW MODE: ${isPreview}`);
      
      if (enableTightCropping) {
        console.log('🔍 Applying tight cropping to vectorized SVG (post-processing)...');
        try {
          const { SVGBoundsAnalyzer } = await import('./svg-bounds-analyzer');
          const analyzer = new SVGBoundsAnalyzer();
          
          // Analyze the SVG content bounds
          const boundsResult = await analyzer.analyzeSVGContent(cmykSvg);
          
          if (boundsResult.success && boundsResult.contentBounds) {
            const bounds = boundsResult.contentBounds;
            console.log(`📀 Content bounds found: ${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}px`);
            
            // Apply tight cropping with minimal padding and proper centering for AI vectorized content only
            const minimalPadding = 2; // Just 2px padding to prevent edge clipping
            const paddedXMin = bounds.xMin - minimalPadding;
            const paddedYMin = bounds.yMin - minimalPadding;
            const paddedWidth = bounds.width + (minimalPadding * 2);
            const paddedHeight = bounds.height + (minimalPadding * 2);
            
            console.log(`🎯 AI VECTORIZATION: Tight crop from (${bounds.xMin}, ${bounds.yMin}) size ${bounds.width}×${bounds.height}`);
            console.log(`🎯 VIEWBOX: "${paddedXMin.toFixed(1)} ${paddedYMin.toFixed(1)} ${paddedWidth.toFixed(1)} ${paddedHeight.toFixed(1)}" (content + 2px padding)`);
            
            const croppedSvg = cmykSvg.replace(
              /viewBox="[^"]*"/,
              `viewBox="${paddedXMin.toFixed(2)} ${paddedYMin.toFixed(2)} ${paddedWidth.toFixed(2)} ${paddedHeight.toFixed(2)}"`
            ).replace(
              /width="[^"]*"/,
              `width="${paddedWidth.toFixed(2)}"`
            ).replace(
              /height="[^"]*"/,
              `height="${paddedHeight.toFixed(2)}"`
            );
            
            // Add tight content marker
            finalSvg = croppedSvg.replace(
              '<svg',
              '<svg data-content-extracted="true"'
            );
            
            console.log('✅ Applied tight cropping to vectorized SVG');
            console.log(`🔧 CROPPED SVG LENGTH: ${finalSvg.length} vs ORIGINAL: ${cmykSvg.length}`);
          } else {
            console.log('⚠️ Could not determine content bounds, keeping original SVG');
            console.log(`🔧 BOUNDS RESULT: ${JSON.stringify(boundsResult)}`);
          }
        } catch (error) {
          console.error('❌ Tight cropping failed:', error);
          // Continue with original SVG on error
        }
      } else {
        console.log('🔧 No tight cropping applied - using full vectorized result');
      }

      // Send response with quality metadata
      const responseData: any = { 
        svg: finalSvg,
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

      const serviceType = req.body.serviceType || 'vectorization-with-product'; // Default to legacy behavior

      // Validate request body
      const requestData = insertVectorizationRequestSchema.parse({
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
        comments: req.body.comments,
        printSize: req.body.printSize,
        serviceType,
        transferProduct: req.body.transferProduct || null,
        quantity: req.body.quantity ? parseInt(req.body.quantity) : null,
        garmentColor: req.body.garmentColor || null,
        inkColor: req.body.inkColor || null,
        charge: 15 // Fixed 15 euro charge
      });

      const vectorizationRequest = await storage.createVectorizationRequest(requestData);

      console.log('Vectorization request created:', {
        id: vectorizationRequest.id,
        file: vectorizationRequest.originalName,
        charge: vectorizationRequest.charge,
        comments: vectorizationRequest.comments,
        printSize: vectorizationRequest.printSize,
        serviceType,
        transferProduct: req.body.transferProduct || 'none',
        quantity: req.body.quantity || 0,
        garmentColor: req.body.garmentColor || 'none',
        inkColor: req.body.inkColor || 'none'
      });

      // Add items to Odoo cart
      const cartResults = {
        vectorizationAdded: false,
        transferAdded: false,
        cartUrl: '/shop/cart'
      };

      try {
        // Use odooBaseUrl from request if provided, otherwise fall back to env var
        const odooBaseUrl = req.body.odooBaseUrl || process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
        const ctWebsiteId = process.env.VITE_ODOO_CT_WEBSITE_ID || '3';
        const clientCookies = req.headers.cookie || '';
        const partnerEmail = req.body.partnerEmail || '';
        
        console.log('📦 Cart Integration - Items to add:');
        console.log('  1. Vectorization Service - €15.00');
        console.log(`  📧 Partner email: ${partnerEmail || '(not provided)'}`);
        console.log(`  🌐 Odoo URL: ${odooBaseUrl}`);
        
        // Read customer's uploaded file to attach to vectorization service line
        const uploadedFilePath = req.file?.path;
        let customerFileBase64 = '';
        const customerFileName = req.file?.originalname || 'artwork';
        
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
          const fileBuffer = fs.readFileSync(uploadedFilePath);
          customerFileBase64 = fileBuffer.toString('base64');
          console.log(`📄 Customer file for vectorization line: ${customerFileName}, ${customerFileBase64.length} chars base64`);
        } else {
          console.warn('⚠️ Customer file not found for vectorization line:', uploadedFilePath);
        }
        
        // 1. Add vectorization service product to cart with customer's uploaded file
        const vectorServiceResponse = await fetch(`${odooBaseUrl}/artwork/api/projects/vector-service/add-to-cart`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': clientCookies,
          },
          body: JSON.stringify({
            serviceType: 'vectorization-only',
            requestId: vectorizationRequest.id,
            source: 'completetransfers',
            website_id: parseInt(ctWebsiteId, 10),
            template_id: 'vector-service',
            partnerEmail: partnerEmail,  // Pass customer email for cart linking
            pdfBase64: customerFileBase64,  // Customer's uploaded file
            artworkFilename: customerFileName,  // Original filename
          }),
        });
        
        const vectorResult = await vectorServiceResponse.text();
        console.log('📨 Vectorization service cart response:', vectorResult.substring(0, 200));
        cartResults.vectorizationAdded = vectorServiceResponse.ok;
        
        // Parse Odoo response to extract order_id and access_token for claim-cart flow
        try {
          const odooResponse = JSON.parse(vectorResult);
          if (odooResponse.website_sale_order) {
            (cartResults as any).order_id = odooResponse.website_sale_order;
            (cartResults as any).access_token = odooResponse.access_token || '';
            console.log(`🔑 Cart claim data: order_id=${odooResponse.website_sale_order}, has_token=${!!odooResponse.access_token}`);
          }
        } catch (parseErr) {
          console.warn('⚠️ Could not parse Odoo cart response for claim data');
        }
        
        // 2. If vectorization-with-product, also add the transfer product with placeholder PDF
        // (Customer's file is attached to the vectorization service line, not the transfer line)
        if (serviceType === 'vectorization-with-product' && req.body.transferProduct) {
          console.log(`  2. ${req.body.transferProduct} - Quantity: ${req.body.quantity}`);
          
          // Use placeholder PDF for the transfer product line
          const placeholderPdfPath = path.join(process.cwd(), 'attached_assets', 'Vector_Service_1768292962486.pdf');
          let pdfBase64 = '';
          
          if (fs.existsSync(placeholderPdfPath)) {
            const pdfBuffer = fs.readFileSync(placeholderPdfPath);
            pdfBase64 = pdfBuffer.toString('base64');
            console.log(`📄 Placeholder PDF loaded for transfer line: ${pdfBase64.length} chars base64`);
          } else {
            console.warn('⚠️ Placeholder PDF not found at:', placeholderPdfPath);
          }
          
          // Create a project UUID for this transfer order
          const transferProjectUuid = `vector-transfer-${vectorizationRequest.id}`;
          
          // Add transfer product to cart with placeholder PDF
          const transferResponse = await fetch(`${odooBaseUrl}/artwork/api/projects/${transferProjectUuid}/add-to-cart`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': clientCookies,
            },
            body: JSON.stringify({
              name: `Vectorization Order - ${vectorizationRequest.originalName}`,
              templateSize: req.body.transferProduct,
              quantity: parseInt(req.body.quantity) || 1,
              garmentColor: req.body.garmentColor || '',
              inkColor: req.body.inkColor || '',
              comments: `Vectorization Request #${vectorizationRequest.id}\nOriginal File: ${vectorizationRequest.originalName}\nPrint Size: ${req.body.printSize}\nRequirements: ${req.body.comments}`,
              source: 'completetransfers',
              website_id: parseInt(ctWebsiteId, 10),
              pdfBase64: pdfBase64,  // Placeholder PDF for transfer line
              partnerEmail: partnerEmail,  // Pass customer email for cart linking
            }),
          });
          
          const transferResult = await transferResponse.text();
          console.log('📨 Transfer product cart response:', transferResult.substring(0, 200));
          cartResults.transferAdded = transferResponse.ok;
        } else {
          console.log('  (Vectorization-only service - no transfer product)');
        }
      } catch (cartError) {
        console.error('Cart integration error:', cartError);
        // Continue even if cart fails - request is still saved
      }

      res.json({
        id: vectorizationRequest.id,
        success: true,
        message: serviceType === 'vectorization-only' 
          ? 'Vectorization request submitted'
          : 'Vectorization request submitted and products added to cart',
        charge: vectorizationRequest.charge,
        serviceType,
        cart: cartResults,
        transferProduct: req.body.transferProduct || null,
        quantity: req.body.transferProduct ? (parseInt(req.body.quantity) || 1) : 0
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

  // Support ticket endpoint - creates Odoo Helpdesk ticket for logged-in customers
  app.post('/api/support-tickets', async (req, res) => {
    try {
      const validatedData = insertSupportTicketSchema.parse(req.body);
      const ticket = await storage.createSupportTicket(validatedData);
      
      console.log('🎫 Support ticket created in database:', {
        id: ticket.id,
        subject: ticket.subject,
        email: ticket.email
      });
      
      // Create Odoo Helpdesk ticket via API
      const odooBaseUrl = req.body.odooBaseUrl || 'https://completetransfers.odoo.com';
      const helpdeskEndpoint = `${odooBaseUrl}/artwork/api/helpdesk/create`;
      
      try {
        console.log(`🎫 Creating Odoo Helpdesk ticket at ${helpdeskEndpoint}`);
        
        const odooResponse = await fetch(helpdeskEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.cookie || '',
          },
          credentials: 'include',
          body: JSON.stringify({
            subject: ticket.subject,
            description: ticket.message,
            name: ticket.name,
            email: ticket.email,
          }),
        });
        
        if (odooResponse.ok) {
          const odooData = await odooResponse.json();
          console.log('✅ Odoo Helpdesk ticket created:', odooData);
          
          res.json({ 
            success: true,
            message: 'Support ticket created in Odoo Helpdesk',
            ticketId: ticket.id,
            odooTicketId: odooData.ticket_id
          });
        } else {
          const errorText = await odooResponse.text();
          console.error('⚠️ Odoo Helpdesk API error:', errorText);
          
          // Still return success since we saved to local DB
          res.json({ 
            success: true,
            message: 'Support ticket saved (Odoo sync pending)',
            ticketId: ticket.id,
            warning: 'Could not sync to Odoo Helpdesk'
          });
        }
      } catch (odooError) {
        console.error('⚠️ Odoo Helpdesk connection error:', odooError);
        
        // Still return success since we saved to local DB
        res.json({ 
          success: true,
          message: 'Support ticket saved (Odoo sync pending)',
          ticketId: ticket.id,
          warning: 'Could not connect to Odoo Helpdesk'
        });
      }
    } catch (error) {
      console.error('Support ticket error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to submit support ticket' 
      });
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

  // Support contact endpoint (to be implemented in Odoo Helpdesk)
  app.post('/api/support/send-email', async (req, res) => {
    // This endpoint will be replaced with Odoo Helpdesk ticket creation
    // See: odoo_artwork_uploader/MIGRATION_NOTES_2025.md
    res.status(501).json({ 
      error: 'Support form will be available after Odoo migration',
      details: 'Please contact us directly at uploader@serigraf.com'
    });
  });

  return app;
}