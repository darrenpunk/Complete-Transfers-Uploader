import express from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import { exec, execSync, execFile } from 'child_process';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { IStorage } from './storage';
import { guardRoute, getOperationStats, isMemoryCritical, getMemoryUsage, shouldSkipNonEssential, getContainerMemoryMB } from './operation-guard';

function getSmartPreviewDPI(pdfPath: string): number {
  try {
    const fileSizeMB = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size / (1024 * 1024) : 0;
    const mem = getMemoryUsage();
    const containerMB = getContainerMemoryMB();
    const memPressure = mem.rssMB > 350 || containerMB > 380;

    if (fileSizeMB > 50 || memPressure) {
      console.log(`[SMART-DPI] Using 72 DPI (file: ${fileSizeMB.toFixed(1)}MB, RSS: ${mem.rssMB}MB, Container: ${containerMB}MB)`);
      return 72;
    }
    if (fileSizeMB > 20) {
      console.log(`[SMART-DPI] Using 72 DPI (file: ${fileSizeMB.toFixed(1)}MB — large file safety)`);
      return 72;
    }
    if (fileSizeMB > 10) {
      console.log(`[SMART-DPI] Using 72 DPI (file: ${fileSizeMB.toFixed(1)}MB)`);
      return 72;
    }
    if (fileSizeMB > 5) {
      console.log(`[SMART-DPI] Using 96 DPI (file: ${fileSizeMB.toFixed(1)}MB)`);
      return 96;
    }
    return 120;
  } catch {
    return 96;
  }
}
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
import { sendMail } from './mailersend-client';
import { manufacturerColors, type ManufacturerColorGroup } from '@shared/garment-colors';
import { PDFBoundsExtractor } from './pdf-bounds-extractor';
import { SVGBoundsAnalyzer } from './svg-bounds-analyzer';

const execAsyncRaw = promisify(exec);
const INKSCAPE_TIMEOUT = 30000;
const EXTERNAL_TOOL_TIMEOUT = 60000;

function execAsync(command: string, options?: any): Promise<{ stdout: string; stderr: string }> {
  const isInkscape = command.includes('inkscape');
  const defaultTimeout = isInkscape ? INKSCAPE_TIMEOUT : EXTERNAL_TOOL_TIMEOUT;
  const opts = { timeout: defaultTimeout, maxBuffer: 10 * 1024 * 1024, killSignal: 'SIGKILL' as const, ...options };
  return execAsyncRaw(command, opts);
}

function buildPdfFilename(projectName: string, quantity: number, productCode?: string | null, suffix?: string): string {
  const name = (projectName || 'artwork').replace(/_/g, ' ');
  const suffixStr = suffix ? ` ${suffix}` : '';
  return `${name}${suffixStr}.pdf`;
}

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
    
    // Determine file size to pick appropriate DPI and timeout
    const fileSizeBytes = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).size : 0;
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    
    // MAX_SIDE: cap output image at this number of pixels on longest side
    const MAX_SIDE_PX = 2000;

    // Use 150 DPI as the default — this prevents oversized images from large-format PDFs.
    // After rendering we resize down if needed. 300 DPI is only necessary for print output,
    // not for canvas previews.
    const containerMB = getContainerMemoryMB();
    let renderDPI = 120;
    let gsTimeout = 45000;
    if (fileSizeMB > 20 || containerMB > 380) {
      renderDPI = 72;
      gsTimeout = 60000;
      console.log(`⚠️ Large file or memory pressure (${fileSizeMB.toFixed(1)}MB, Container: ${containerMB}MB) - using ${renderDPI} DPI`);
    } else if (fileSizeMB > 5) {
      renderDPI = 96;
      gsTimeout = 50000;
      console.log(`📦 Medium file (${fileSizeMB.toFixed(1)}MB) - using ${renderDPI} DPI`);
    }
    
    // Method 1: Try direct PDF-to-PNG conversion using Ghostscript
    try {
      console.log(`🎯 DIRECT PDF RENDERING: Using Ghostscript at ${renderDPI} DPI`);
      
      const timestamp = Date.now();
      const outputPath = path.join(path.dirname(pdfPath), `${path.basename(outputPrefix)}_direct_${timestamp}.png`);
      
      const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r${renderDPI} -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -dMaxBitmap=80000000 -sOutputFile="${outputPath}" "${pdfPath}"`;
      
      console.log('📋 Ghostscript direct rendering command:', gsCommand);
      await execAsync(gsCommand, { timeout: gsTimeout });
      
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`✅ DIRECT GHOSTSCRIPT RENDERING SUCCESS: ${outputPath} (${stats.size} bytes)`);
        
        // Cap the image at MAX_SIDE_PX to prevent massive files being passed downstream
        const dimensions = await getPNGDimensions(outputPath);
        if (dimensions) {
          console.log(`📏 Direct rendered dimensions: ${dimensions.width}×${dimensions.height}px at ${renderDPI} DPI`);
          const longestSide = Math.max(dimensions.width, dimensions.height);
          if (longestSide > MAX_SIDE_PX) {
            const resizedPath = outputPath.replace('.png', '_resized.png');
            try {
              await execAsync(`convert "${outputPath}" -resize ${MAX_SIDE_PX}x${MAX_SIDE_PX} "${resizedPath}"`, { timeout: 15000 });
              if (fs.existsSync(resizedPath)) {
                fs.unlinkSync(outputPath);
                console.log(`📐 Resized from ${longestSide}px to max ${MAX_SIDE_PX}px for performance`);
                return resizedPath;
              }
            } catch (resizeErr) {
              console.log('⚠️ Resize failed, using original:', resizeErr);
            }
          }
        }
        
        return outputPath;
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('⚠️ Direct Ghostscript rendering failed:', errorMessage);
      
      // If first attempt failed, retry at 96 DPI
      if (renderDPI > 96) {
        try {
          console.log('🔄 Retrying at 96 DPI as fallback...');
          const timestamp = Date.now();
          const fallbackPath = path.join(path.dirname(pdfPath), `${path.basename(outputPrefix)}_direct_${timestamp}.png`);
          const fallbackCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r96 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -dMaxBitmap=80000000 -sOutputFile="${fallbackPath}" "${pdfPath}"`;
          await execAsync(fallbackCmd, { timeout: 60000 });
          if (fs.existsSync(fallbackPath)) {
            const stats = fs.statSync(fallbackPath);
            console.log(`✅ FALLBACK 96 DPI RENDERING SUCCESS: ${fallbackPath} (${stats.size} bytes)`);
            return fallbackPath;
          }
        } catch (fallbackError) {
          console.log('⚠️ Fallback 96 DPI rendering also failed');
        }
      }
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
        const cleanLogoCommand = `gs -sDEVICE=png16m -dNOPAUSE -dBATCH -dSAFER -r150 -dFirstPage=1 -dLastPage=1 -dAutoRotatePages=/None -dGraphicsAlphaBits=1 -dTextAlphaBits=1 -dMaxBitmap=80000000 -sOutputFile="${extractedFile}" "${pdfPath}"`;
        console.log('🏃 Method 3: Running clean logo extraction for vectorization (150 DPI fallback):', cleanLogoCommand);
        
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
        const gsCommand = `gs -sDEVICE=png16m -dNOPAUSE -dBATCH -dSAFER -r150 -dFirstPage=1 -dLastPage=1 -dAutoRotatePages=/None -dFitPage -dMaxBitmap=80000000 -sOutputFile="${extractedFile}" "${pdfPath}"`;
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
    fileSize: 500 * 1024 * 1024, // 500MB limit (large files use chunked upload on frontend)
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

const chunkedUploadDir = path.resolve('./uploads/chunks');
if (!fs.existsSync(chunkedUploadDir)) {
  fs.mkdirSync(chunkedUploadDir, { recursive: true });
}

const chunkUpload = multer({
  dest: chunkedUploadDir,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB per chunk
  },
});

interface ChunkedUploadSession {
  uploadId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  projectId: string;
  createdAt: number;
}

const chunkedUploads = new Map<string, ChunkedUploadSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of chunkedUploads.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(chunkedUploadDir, `${id}_chunk_${i}`);
        if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
      }
      chunkedUploads.delete(id);
      console.log(`🗑️ Cleaned up expired chunked upload: ${id}`);
    }
  }
}, 5 * 60 * 1000);

// Cooldown-throttled ops alert for attach-pdf exhaustion. Mirrors the
// health-monitor pattern (lastAlertSentAt map, env-tunable cooldown).
// Default cooldown 30 min so a stuck failure mode emails ops once, not
// once-per-customer.
const attachPdfAlertSentAt = new Map<string, number>();
async function alertAttachPdfExhausted(args: {
  orderLineId: number | string | undefined;
  filename: string | undefined;
  finalBase64Mb: number;
  attempts: { label: string; err?: string }[];
  partnerEmail?: string | undefined;
  projectName?: string | undefined;
}): Promise<void> {
  try {
    const cooldownMin = Math.max(1, parseInt(process.env.ATTACH_PDF_ALERT_COOLDOWN_MIN || '30', 10));
    const lastErr = args.attempts.filter(a => a.err).slice(-1)[0]?.err || 'unknown';
    const failureKey = `attach-pdf-exhausted::${(lastErr || 'unknown').slice(0, 80)}`;
    const now = Date.now();
    const last = attachPdfAlertSentAt.get(failureKey) || 0;
    if (now - last < cooldownMin * 60_000) {
      console.log(`[ATTACH-PDF-ALERT] suppressed (cooldown active for "${failureKey}", last ${Math.round((now - last) / 60_000)}min ago)`);
      return;
    }
    const alertTo = process.env.PDF_HEALTH_ALERT_TO || process.env.ATTACH_PDF_ALERT_TO;
    if (!alertTo) {
      console.warn('[ATTACH-PDF-ALERT] no recipient configured (PDF_HEALTH_ALERT_TO unset) — skipping email');
      return;
    }
    const text = [
      `Order created in Odoo with NO artwork attached after exhausting all retries.`,
      ``,
      `Order line:    ${args.orderLineId ?? '?'}`,
      `Customer:      ${args.partnerEmail || 'unknown'}`,
      `Project:       ${args.projectName || 'unknown'}`,
      `Filename:      ${args.filename || 'unknown'}`,
      `Final size:    ${args.finalBase64Mb.toFixed(1)} MB (base64) after compression escalation`,
      `Server time:   ${new Date(now).toISOString()}`,
      ``,
      `Attempts:`,
      ...args.attempts.map((a, i) => `  ${i + 1}. ${a.label} — ${a.err ? `FAIL: ${a.err}` : 'OK'}`),
      ``,
      `Action: manually attach the artwork in Odoo from the project's stored PDF, or contact the customer to re-place the order.`,
      ``,
      `Further alerts for this failure type are suppressed for ${cooldownMin} minutes.`,
    ].join('\n');
    const result = await sendMail({
      to: alertTo,
      subject: `[completetransfers.com] Order ${args.orderLineId ?? '?'} created without artwork (attach-pdf exhausted)`,
      text,
    });
    if (result.ok) {
      attachPdfAlertSentAt.set(failureKey, now);
      console.log(`[ATTACH-PDF-ALERT] email sent to ${alertTo} (${result.durationMs}ms)`);
    } else {
      console.error(`[ATTACH-PDF-ALERT] email FAILED: ${result.error}`);
    }
  } catch (e: any) {
    console.error('[ATTACH-PDF-ALERT] handler error (non-fatal):', e?.message || e);
  }
}

export async function registerRoutes(app: express.Application) {
  const { storage } = await import('./storage');
  const { setupImpositionRoutes } = await import('./imposition-routes');

  app.post('/api/chunked-upload/init', (req, res) => {
    try {
      const { fileName, fileSize, mimeType, totalChunks, projectId } = req.body;
      
      if (!fileName || !fileSize || !totalChunks || !projectId) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const maxSize = 500 * 1024 * 1024;
      if (fileSize > maxSize) {
        return res.status(400).json({ error: `File size ${Math.round(fileSize / (1024 * 1024))}MB exceeds the 500MB maximum` });
      }
      
      const allowedMimes = [
        'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf',
        'application/postscript', 'application/illustrator', 'application/x-illustrator',
        'image/tiff', 'image/bmp'
      ];
      if (mimeType && !allowedMimes.includes(mimeType)) {
        return res.status(400).json({ error: 'Invalid file type' });
      }
      
      const uploadId = crypto.randomBytes(16).toString('hex');
      
      chunkedUploads.set(uploadId, {
        uploadId,
        fileName,
        fileSize,
        mimeType: mimeType || 'application/octet-stream',
        totalChunks,
        receivedChunks: new Set(),
        projectId,
        createdAt: Date.now(),
      });
      
      console.log(`📦 Chunked upload initialized: ${uploadId} for "${fileName}" (${Math.round(fileSize / (1024 * 1024))}MB, ${totalChunks} chunks)`);
      res.json({ uploadId });
    } catch (error) {
      console.error('Chunked upload init error:', error);
      res.status(500).json({ error: 'Failed to initialize upload' });
    }
  });

  app.post('/api/chunked-upload/chunk', chunkUpload.single('chunk'), (req: any, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks } = req.body;
      const file = req.file;
      
      if (!uploadId || chunkIndex === undefined || !file) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const session = chunkedUploads.get(uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Upload session not found or expired' });
      }
      
      const idx = parseInt(chunkIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= session.totalChunks) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: `Invalid chunk index: ${chunkIndex}` });
      }
      
      const chunkDest = path.join(chunkedUploadDir, `${uploadId}_chunk_${idx}`);
      fs.renameSync(file.path, chunkDest);
      
      session.receivedChunks.add(idx);
      
      console.log(`📦 Chunk ${idx + 1}/${session.totalChunks} received for upload ${uploadId}`);
      res.json({ received: idx, total: session.totalChunks });
    } catch (error) {
      console.error('Chunk upload error:', error);
      res.status(500).json({ error: 'Failed to upload chunk' });
    }
  });

  app.post('/api/chunked-upload/complete', async (req, res) => {
    try {
      const { uploadId, projectId } = req.body;
      
      const session = chunkedUploads.get(uploadId);
      if (!session) {
        return res.status(404).json({ error: 'Upload session not found or expired' });
      }
      
      if (session.receivedChunks.size !== session.totalChunks) {
        return res.status(400).json({ 
          error: `Missing chunks: received ${session.receivedChunks.size}/${session.totalChunks}` 
        });
      }
      
      const ext = path.extname(session.fileName) || '';
      const assembledFilename = crypto.randomBytes(16).toString('hex') + ext;
      const assembledPath = path.join(uploadDir, assembledFilename);
      
      const writeStream = fs.createWriteStream(assembledPath);
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkPath = path.join(chunkedUploadDir, `${uploadId}_chunk_${i}`);
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        fs.unlinkSync(chunkPath);
      }
      
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });
      
      chunkedUploads.delete(uploadId);
      
      const fileSizeMB = (fs.statSync(assembledPath).size / (1024 * 1024)).toFixed(1);
      console.log(`✅ Chunked upload assembled: "${session.fileName}" → ${assembledFilename} (${fileSizeMB}MB)`);
      
      res.json({
        uploadId,
        filename: assembledFilename,
        originalName: session.fileName,
        size: session.fileSize,
        mimetype: session.mimeType,
        path: assembledPath,
      });
    } catch (error) {
      console.error('Chunked upload complete error:', error);
      res.status(500).json({ error: 'Failed to assemble file' });
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

  // Fetch current logged-in user from Odoo
  app.get('/api/user/current', async (req, res) => {
    try {
      const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
      const clientCookies = req.headers.cookie || '';
      
      // Fetch current user from Odoo's web controller
      const response = await fetch(`${odooBaseUrl}/web/session/info`, {
        method: 'GET',
        headers: {
          'Cookie': clientCookies,
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const data = await response.json();
      if (data.uid && data.user_id) {
        // User is logged in - return their email
        return res.json({ email: data.user_id[1] || null, id: data.uid });
      }
      
      res.status(401).json({ error: 'Not authenticated' });
    } catch (error: any) {
      console.warn('[user/current] Failed to fetch user:', error.message);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });
  
  app.post('/api/projects/:projectId/canvas-screenshot', upload.single('screenshot'), async (req: any, res) => {
    try {
      const projectId = req.params.projectId;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      let buf: Buffer | null = null;

      if (req.file) {
        buf = fs.readFileSync(req.file.path);
        try { fs.unlinkSync(req.file.path); } catch {}
      } else if (req.body?.screenshot && typeof req.body.screenshot === 'string') {
        buf = Buffer.from(req.body.screenshot, 'base64');
      }

      if (!buf || buf.length < 8) {
        return res.status(400).json({ error: 'No screenshot data provided' });
      }
      if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) {
        return res.status(400).json({ error: 'Invalid PNG data' });
      }
      const maxSize = 10 * 1024 * 1024;
      if (buf.length > maxSize) {
        return res.status(413).json({ error: 'Screenshot too large' });
      }
      const screenshotPath = path.join(process.cwd(), 'uploads', `canvas_screenshot_${projectId}.png`);
      fs.writeFileSync(screenshotPath, buf);
      console.log(`📸 Canvas screenshot saved for project ${projectId}: ${buf.length} bytes`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('❌ Failed to save canvas screenshot:', error);
      res.status(500).json({ error: 'Failed to save screenshot' });
    }
  });

  async function generateCanvasPreviewPng(canvasElements: any[], logos: any[], templateSize: any): Promise<Buffer | null> {
    try {
      // Skip preview for very large imposition jobs — wastes seconds and floods
      // logs with no real visual benefit (the canvas screenshot already covers it,
      // and nginx body-size pressure dominates response time at this scale).
      const MAX_PREVIEW_ELEMENTS = 40;
      if (canvasElements.length > MAX_PREVIEW_ELEMENTS) {
        console.log(`📸 Canvas preview SKIPPED — ${canvasElements.length} elements (> ${MAX_PREVIEW_ELEMENTS}). Using canvas screenshot only.`);
        return null;
      }

      const templateW = templateSize.width;
      const templateH = templateSize.height;
      const pxPerMm = 4;
      const imgW = Math.round(templateW * pxPerMm);
      const imgH = Math.round(templateH * pxPerMm);
      const centerXmm = templateW / 2;
      const centerYmm = templateH / 2;

      // Per-source rasterization cache (path → base64 png). For repeated logos in
      // an imposition layout this turns N rasterize calls into 1.
      const rasterCache = new Map<string, string>();

      const elementSvgs: string[] = [];

      for (const element of canvasElements) {
        const logo = logos.find((l: any) => l.id === element.logoId);
        if (!logo) continue;

        // Pick the best on-disk source for rasterization. The DB's logo.filename
        // can be a PNG preview (for PDF uploads), an SVG, or the rasterized image
        // itself — picking by extension avoids feeding PNGs to rsvg-convert (which
        // is an SVG renderer and silently fails 144 times on imposition jobs).
        const candidates: { rel: string; ext: string }[] = [];
        if (logo.filename) candidates.push({ rel: logo.filename, ext: logo.filename.split('.').pop()?.toLowerCase() || '' });
        if (logo.originalFilename) candidates.push({ rel: logo.originalFilename, ext: logo.originalFilename.split('.').pop()?.toLowerCase() || '' });
        const pickable = candidates.find(c => ['png', 'jpg', 'jpeg', 'svg'].includes(c.ext));
        if (!pickable) continue;
        const sourcePath = path.join(process.cwd(), 'uploads', pickable.rel);
        if (!fs.existsSync(sourcePath)) continue;

        const elWmm = element.width || 100;
        const elHmm = element.height || 100;
        const elCenterXmm = centerXmm + (element.x || 0);
        const elCenterYmm = centerYmm + (element.y || 0);
        const leftMm = elCenterXmm - elWmm / 2;
        const topMm = elCenterYmm - elHmm / 2;

        const leftPx = leftMm * pxPerMm;
        const topPx = topMm * pxPerMm;
        const wPx = elWmm * pxPerMm;
        const hPx = elHmm * pxPerMm;

        try {
          let pngBase64 = rasterCache.get(sourcePath);
          if (!pngBase64) {
            if (pickable.ext === 'svg') {
              const tmpPng = `/tmp/canvas_el_${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
              try {
                await new Promise<void>((resolve, reject) => {
                  exec(
                    `rsvg-convert -w ${Math.round(wPx * 2)} -h ${Math.round(hPx * 2)} --keep-aspect-ratio -o "${tmpPng}" "${sourcePath}"`,
                    { timeout: 15000 },
                    (err) => { if (err) reject(err); else resolve(); }
                  );
                });
                if (!fs.existsSync(tmpPng)) continue;
                pngBase64 = fs.readFileSync(tmpPng).toString('base64');
              } finally {
                try { fs.unlinkSync(tmpPng); } catch {}
              }
            } else {
              // PNG/JPG — embed bytes directly. No rsvg-convert needed.
              pngBase64 = fs.readFileSync(sourcePath).toString('base64');
            }
            rasterCache.set(sourcePath, pngBase64);
          }

          const rotation = element.rotation || 0;
          const centerPx_X = leftPx + wPx / 2;
          const centerPx_Y = topPx + hPx / 2;
          const opacity = element.opacity !== undefined ? element.opacity : 1;
          const mime = pickable.ext === 'jpg' || pickable.ext === 'jpeg' ? 'image/jpeg' : 'image/png';

          elementSvgs.push(
            `<g transform="translate(${centerPx_X}, ${centerPx_Y}) rotate(${rotation}) translate(${-wPx / 2}, ${-hPx / 2})" opacity="${opacity}">` +
            `<image href="data:${mime};base64,${pngBase64}" x="0" y="0" width="${wPx}" height="${hPx}" preserveAspectRatio="xMidYMid meet"/>` +
            `</g>`
          );
        } catch (err: any) {
          console.error(`⚠️ Preview element failed (${pickable.rel}):`, err.message);
        }
      }
      if (rasterCache.size > 0) {
        console.log(`📸 Preview rasterizer cache: ${rasterCache.size} unique source(s) for ${canvasElements.length} element(s)`);
      }

      if (elementSvgs.length === 0) return null;

      const compositeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${imgW}" height="${imgH}" viewBox="0 0 ${imgW} ${imgH}">
  <rect width="${imgW}" height="${imgH}" fill="#CDCECC"/>
  ${elementSvgs.join('\n  ')}
  <text x="${imgW - 8}" y="${imgH - 8}" text-anchor="end" font-size="14" fill="#666" font-family="Arial, sans-serif">${templateSize.name || 'Template'} (${templateW}×${templateH}mm)</text>
</svg>`;

      const tmpSvg = `/tmp/canvas_composite_${Date.now()}.svg`;
      const tmpPng = `/tmp/canvas_composite_${Date.now()}.png`;
      fs.writeFileSync(tmpSvg, compositeSvg);

      await new Promise<void>((resolve, reject) => {
        exec(
          `rsvg-convert -w ${imgW} -h ${imgH} -o "${tmpPng}" "${tmpSvg}"`,
          { timeout: 20000 },
          (err) => { if (err) reject(err); else resolve(); }
        );
      });

      try { fs.unlinkSync(tmpSvg); } catch {}

      if (!fs.existsSync(tmpPng)) return null;
      const result = fs.readFileSync(tmpPng);
      try { fs.unlinkSync(tmpPng); } catch {}
      console.log(`📸 Canvas preview PNG generated: ${result.length} bytes (${imgW}x${imgH}px)`);
      return result;
    } catch (err: any) {
      console.error('⚠️ Canvas preview generation failed:', err.message);
      return null;
    }
  }

  async function appendCanvasPreviewFromPage1(pdfBytes: Buffer | Uint8Array, canvasElements?: any[], logos?: any[], templateSize?: any): Promise<Buffer> {
    if (!canvasElements || !logos || !templateSize || canvasElements.length === 0) {
      return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
    }
    
    try {
      const previewPng = await generateCanvasPreviewPng(canvasElements, logos, templateSize);
      if (!previewPng) {
        console.log('⚠️ Canvas preview generation returned null, skipping preview page');
        return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
      }

      const { PDFDocument, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pngImage = await pdfDoc.embedPng(previewPng);
      const imgAspect = pngImage.width / pngImage.height;
      
      const existingPage = pdfDoc.getPage(0);
      const pageWidth = existingPage.getWidth();
      const pageHeight = existingPage.getHeight();
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      const labelH = 28;
      page.drawRectangle({
        x: 0,
        y: pageHeight - labelH,
        width: pageWidth,
        height: labelH,
        color: rgb(0.15, 0.15, 0.15),
      });
      page.drawText('Canvas Preview', {
        x: 12,
        y: pageHeight - labelH + 8,
        size: 12,
        color: rgb(0.85, 0.85, 0.85),
      });

      const margin = 24;
      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2 - labelH;
      let drawW: number, drawH: number;
      if (imgAspect > availW / availH) {
        drawW = availW;
        drawH = availW / imgAspect;
      } else {
        drawH = availH;
        drawW = availH * imgAspect;
      }
      const x = (pageWidth - drawW) / 2;
      const y = (pageHeight - labelH - drawH) / 2;
      page.drawImage(pngImage, { x, y, width: drawW, height: drawH });

      const resultBytes = await pdfDoc.save();
      console.log(`📸 Canvas preview page appended (server-rendered)`);
      return Buffer.from(resultBytes);
    } catch (err: any) {
      console.error('⚠️ Failed to append canvas preview page:', err.message);
      return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
    }
  }

  async function appendCanvasScreenshotPage(pdfBytes: Buffer | Uint8Array, projectId: string, canvasElements?: any[], logos?: any[], templateSize?: any): Promise<Buffer> {
    let screenshotData: Buffer | null = null;
    const screenshotPath = path.join(process.cwd(), 'uploads', `canvas_screenshot_${projectId}.png`);

    for (let attempt = 0; attempt < 3 && !screenshotData; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 200));
      if (fs.existsSync(screenshotPath)) {
        const raw = fs.readFileSync(screenshotPath);
        const minNonBlank = 5000;
        if (raw.length > minNonBlank) {
          screenshotData = raw;
          console.log(`📸 Using client-uploaded canvas screenshot (${raw.length} bytes, attempt ${attempt + 1})`);
        } else {
          console.log(`⚠️ Client screenshot too small (${raw.length} bytes), likely blank — trying server fallback`);
        }
        try { fs.unlinkSync(screenshotPath); } catch {}
      }
    }

    if (!screenshotData && canvasElements && logos && templateSize) {
      console.log('📸 No client screenshot — generating server-side canvas preview as fallback...');
      try {
        const previewPromise = generateCanvasPreviewPng(canvasElements, logos, templateSize);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
        screenshotData = await Promise.race([previewPromise, timeoutPromise]);
      } catch (e: any) {
        console.error(`⚠️ Server-side canvas preview failed: ${e.message}`);
      }
      if (screenshotData) {
        console.log(`📸 Server fallback preview: ${screenshotData.length} bytes`);
      } else {
        console.log(`⚠️ Server fallback preview failed or timed out — skipping screenshot page`);
      }
    }

    if (!screenshotData) {
      return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
    }

    try {
      const { PDFDocument, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pngImage = await pdfDoc.embedPng(screenshotData);
      const imgAspect = pngImage.width / pngImage.height;
      const existingPage = pdfDoc.getPage(0);
      const pageWidth = existingPage.getWidth();
      const pageHeight = existingPage.getHeight();
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Build dimension summary line from canvas elements (in mm, accounting for rotation)
      let dimsLine = '';
      try {
        if (canvasElements && canvasElements.length > 0) {
          const visibleEls = canvasElements.filter((el: any) => el.isVisible !== false && el.width && el.height);
          const dimStrs = visibleEls.map((el: any) => {
            const rot = ((el.rotation || 0) * Math.PI) / 180;
            const cos = Math.abs(Math.cos(rot));
            const sin = Math.abs(Math.sin(rot));
            const visW = el.width * cos + el.height * sin;
            const visH = el.width * sin + el.height * cos;
            return `${visW.toFixed(1)} × ${visH.toFixed(1)} mm`;
          });
          if (dimStrs.length === 1) {
            dimsLine = `Artwork: ${dimStrs[0]}`;
          } else if (dimStrs.length > 1 && dimStrs.length <= 4) {
            dimsLine = `Artwork: ${dimStrs.join('  |  ')}`;
          } else if (dimStrs.length > 4) {
            dimsLine = `Artwork (${dimStrs.length} items): ${dimStrs.slice(0, 3).join('  |  ')}  | +${dimStrs.length - 3} more`;
          }
        }
      } catch (e) {
        // best-effort; leave dimsLine empty on failure
      }

      const labelH = 28;
      page.drawRectangle({
        x: 0,
        y: pageHeight - labelH,
        width: pageWidth,
        height: labelH,
        color: rgb(0.15, 0.15, 0.15),
      });
      page.drawText('Canvas Screenshot', {
        x: 12,
        y: pageHeight - labelH + 8,
        size: 12,
        color: rgb(0.85, 0.85, 0.85),
      });
      if (dimsLine) {
        const fontSize = 10;
        // Approximate text width for right-alignment (avg char width ~0.5*fontSize for Helvetica)
        const approxTextW = dimsLine.length * fontSize * 0.5;
        page.drawText(dimsLine, {
          x: Math.max(12, pageWidth - approxTextW - 12),
          y: pageHeight - labelH + 9,
          size: fontSize,
          color: rgb(0.85, 0.85, 0.85),
        });
      }

      // Footer band with dimension(s) printed larger for readability
      const footerH = dimsLine ? 24 : 0;
      if (footerH) {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: footerH,
          color: rgb(0.15, 0.15, 0.15),
        });
        page.drawText(dimsLine, {
          x: 12,
          y: 7,
          size: 12,
          color: rgb(0.95, 0.95, 0.95),
        });
      }

      const margin = 24;
      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2 - labelH - footerH;
      let drawW: number, drawH: number;
      if (imgAspect > availW / availH) {
        drawW = availW;
        drawH = availW / imgAspect;
      } else {
        drawH = availH;
        drawW = availH * imgAspect;
      }
      const x = (pageWidth - drawW) / 2;
      const y = (pageHeight - labelH - drawH) / 2;
      page.drawImage(pngImage, { x, y, width: drawW, height: drawH });

      const resultBytes = await pdfDoc.save();
      console.log(`📸 Canvas screenshot appended as final page for project ${projectId}`);
      return Buffer.from(resultBytes);
    } catch (err: any) {
      console.error('⚠️ Failed to append canvas screenshot page:', err.message);
      return Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
    }
  }

  // PDF Generation endpoint - Must be before other routes
  app.get('/api/projects/:projectId/generate-pdf', guardRoute('pdf-gen'), async (req, res) => {
    const pdfGenSafetyTimer = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`⏰ PDF generation safety timeout (90s) for project: ${req.params.projectId}`);
        res.status(504).json({ error: 'PDF generation timed out' });
      }
    }, 90000);
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
      console.log(`📋 Project appliqueBadgesForm:`, project.appliqueBadgesForm ? JSON.stringify(project.appliqueBadgesForm).substring(0, 200) : 'NULL/UNDEFINED');

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

      // DTF PASSTHROUGH: For DTF templates, serve the original artwork PDF directly without
      // re-embedding it via pdf-lib (which inflates 35MB → 42MB). Compress with Ghostscript
      // to bring it under the inline size threshold before returning.
      //
      // Passthrough is ONLY safe when the source PDF is already a production-ready file at
      // the template's intended dimensions AND the canvas element is placed at the source's
      // natural size at the canonical (0,0) position with zero rotation. Passthrough emits
      // the source bytes verbatim — it cannot scale, translate, or rotate — so any
      // departure from canonical placement must fall through to the full canvas-based
      // generator. All four conditions must hold (no W↔H swap, no rotation allowance):
      //   1. Source page dims match template dims within ±3% (orientation-locked).
      //   2. Canvas element width/height matches source's natural size within ±3%.
      //   3. Canvas element is at the canonical origin (x≈0, y≈0) within ±3% of template.
      //   4. Element rotation is exactly 0°.
      // If any fails, fall through to the full canvas-based PDF generator.
      const isDtfGeneratePdf = templateSize.id?.toLowerCase().includes('dtf') ||
        (templateSize.width ?? 0) >= 1000 || (templateSize.height ?? 0) >= 500;
      const isSingleElementLayout = canvasElements.length === 1;
      if (isDtfGeneratePdf && hasOriginalPDFs && isSingleElementLayout) {
        const canvasLogoId = canvasElements[0]?.logoId;
        const dtfLogo = canvasLogoId
          ? (logosObject[canvasLogoId] && logosObject[canvasLogoId].originalFilename && logosObject[canvasLogoId].originalMimeType === 'application/pdf' ? logosObject[canvasLogoId] : null)
          : Object.values(logosObject).find((logo: any) =>
              logo.originalFilename && logo.originalMimeType === 'application/pdf'
            ) as any;

        // Gate: source ≈ template AND element ≈ source natural size AND element at origin AND rotation=0.
        let passthroughSafe = false;
        if (dtfLogo) {
          const PT_PER_MM = 2.834645669;
          const srcWmm = typeof dtfLogo.originalWidth === 'number' ? dtfLogo.originalWidth : NaN;
          const srcHmm = typeof dtfLogo.originalHeight === 'number' ? dtfLogo.originalHeight : NaN;
          const tmplWmm = templateSize.width ?? 0;
          const tmplHmm = templateSize.height ?? 0;
          const elem = canvasElements[0];
          const elemWmm = (elem?.width ?? 0) / PT_PER_MM;
          const elemHmm = (elem?.height ?? 0) / PT_PER_MM;
          const elemXmm = (elem?.x ?? 0) / PT_PER_MM;
          const elemYmm = (elem?.y ?? 0) / PT_PER_MM;
          const elemRot = ((elem?.rotation ?? 0) % 360 + 360) % 360;

          // Orientation-locked: passthrough cannot rotate, so source orientation must
          // match template orientation directly (no W↔H swap).
          const dimTol = 0.03;
          const sourceMatchesTemplate =
            isFinite(srcWmm) && isFinite(srcHmm) && tmplWmm > 0 && tmplHmm > 0 &&
            Math.abs(srcWmm - tmplWmm) <= tmplWmm * dimTol &&
            Math.abs(srcHmm - tmplHmm) <= tmplHmm * dimTol;

          const elemTol = 0.03;
          const elementAtNaturalSize =
            isFinite(srcWmm) && isFinite(srcHmm) && elemWmm > 0 && elemHmm > 0 &&
            Math.abs(elemWmm - srcWmm) <= srcWmm * elemTol &&
            Math.abs(elemHmm - srcHmm) <= srcHmm * elemTol;

          // Element must be at canonical origin (top-left of template). Tolerance is
          // ±3% of template dimensions, which on a 1000×550mm template is ±30/16.5mm —
          // tight enough to catch any deliberate translation.
          const posTol = 0.03;
          const elementAtOrigin =
            tmplWmm > 0 && tmplHmm > 0 &&
            Math.abs(elemXmm) <= tmplWmm * posTol &&
            Math.abs(elemYmm) <= tmplHmm * posTol;

          // Passthrough cannot apply rotation; only exact 0° qualifies.
          const rotationZero = Math.abs(elemRot) < 0.5;

          passthroughSafe = sourceMatchesTemplate && elementAtNaturalSize && elementAtOrigin && rotationZero;
          if (!passthroughSafe) {
            console.log(`📄 DTF passthrough SKIPPED — source ${srcWmm}×${srcHmm}mm vs template ${tmplWmm}×${tmplHmm}mm (sizeOk=${sourceMatchesTemplate}), element ${elemWmm.toFixed(1)}×${elemHmm.toFixed(1)}mm at (${elemXmm.toFixed(1)},${elemYmm.toFixed(1)})mm rot=${elemRot}° (naturalSize=${elementAtNaturalSize}, origin=${elementAtOrigin}, rotZero=${rotationZero}). Falling through to canvas-based generator.`);
          }
        }
        if (dtfLogo && passthroughSafe) {
          const origPath = path.join(process.cwd(), 'uploads', dtfLogo.originalFilename);
          if (fs.existsSync(origPath)) {
            console.log(`📄 DTF passthrough: compressing original artwork and serving directly`);
            const origBuf = fs.readFileSync(origPath);
            const origMB = (origBuf.length / 1024 / 1024).toFixed(1);
            console.log(`📄 Original DTF artwork: ${origMB}MB`);
            const tmpIn  = `/tmp/dtf_gen_in_${Date.now()}.pdf`;
            const tmpOut = `/tmp/dtf_gen_out_${Date.now()}.pdf`;
            let finalBuf = origBuf;
            try {
              fs.writeFileSync(tmpIn, origBuf);
              await new Promise<void>((resolve, reject) => {
                exec(
                  `gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -dDownsampleColorImages=false -dDownsampleGrayImages=false -dDownsampleMonoImages=false -sOutputFile=${tmpOut} ${tmpIn}`,
                  { timeout: 60000 },
                  (err) => { if (err) reject(err); else resolve(); }
                );
              });
              if (fs.existsSync(tmpOut)) {
                const compressed = fs.readFileSync(tmpOut);
                if (compressed.length < origBuf.length) {
                  finalBuf = compressed;
                  console.log(`🗜️ DTF GS passthrough: ${origMB}MB → ${(finalBuf.length/1024/1024).toFixed(1)}MB`);
                }
              }
            } catch (e: any) {
              console.warn(`⚠️ DTF GS passthrough compression failed, using original:`, e.message);
            } finally {
              try { fs.unlinkSync(tmpIn); } catch {}
              try { fs.unlinkSync(tmpOut); } catch {}
            }
            const dtfWithScreenshot = await appendCanvasScreenshotPage(finalBuf, projectId, canvasElements, logos, templateSize);
            clearTimeout(pdfGenSafetyTimer);
            console.log(`✅ DTF passthrough complete: ${(dtfWithScreenshot.length/1024/1024).toFixed(2)}MB, sending response`);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${buildPdfFilename(project.name || 'DTF', project.quantity || 1)}"`);
            return res.send(dtfWithScreenshot);
          }
        }
      }

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
          const isAppliqueBadges = project.templateSize?.includes('applique');
          
          if (isAppliqueBadges) {
            const formData = project.appliqueBadgesForm || {
              embroideryFileOptions: [],
              embroideryThreadOptions: [],
              position: [],
              graphicSize: '',
              embroideredParts: ''
            };
            console.log('📋 Applique Badges project detected - adding specification page (form data:', project.appliqueBadgesForm ? 'provided' : 'using defaults', ')');
            try {
              const { AppliqueBadgesPDFGenerator } = await import('./applique-badges-pdf-generator');
              const appliqueGenerator = new AppliqueBadgesPDFGenerator();
              
              const appliquePdfBytes = await appliqueGenerator.generateAppliquePDF({
                originalPdfBuffer: pdfBuffer,
                appliqueBadgesForm: formData,
                projectName: project.name,
                embroideryPreviewPath: project.embroideryPreviewPath || undefined
              });
              
              console.log(`✅ Applique Badges PDF with form page: ${appliquePdfBytes.length} bytes`);
              
              const appliqueWithScreenshot = await appendCanvasScreenshotPage(appliquePdfBytes, projectId, canvasElements, logos, templateSize);
              clearTimeout(pdfGenSafetyTimer);
              res.setHeader('Content-Type', 'application/pdf');
              res.setHeader('Content-Disposition', `attachment; filename="${buildPdfFilename(project.name, project.quantity || 1, templateSize.productCode, 'applique')}"`);
              res.send(appliqueWithScreenshot);
              return;
            } catch (appliqueError) {
              console.error('❌ Applique Badges PDF generation failed:', appliqueError);
              console.log('🔄 Falling back to original PDF without applique form page');
            }
          }
          
          const robustWithScreenshot = await appendCanvasScreenshotPage(pdfBuffer, projectId, canvasElements, logos, templateSize);
          clearTimeout(pdfGenSafetyTimer);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${buildPdfFilename(project.name, project.quantity || 1, templateSize.productCode)}"`);
          res.send(robustWithScreenshot);
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
        const GARMENT_COLOR_MAP: Record<string, { name: string; cmyk: string }> = {
          '#ffffff': { name: 'White', cmyk: '0, 0, 0, 0' },
          '#171816': { name: 'Black', cmyk: '0, 0, 0, 100' },
          '#1a1a1a': { name: 'Black', cmyk: '0, 0, 0, 100' },
          '#d9d2ab': { name: 'Natural Cotton', cmyk: '11, 15, 32, 0' },
          '#f3f590': { name: 'Pastel Yellow', cmyk: '4, 2, 50, 0' },
          '#f0f42a': { name: 'Yellow', cmyk: '5, 0, 90, 0' },
          '#d7da14': { name: 'Hi Viz', cmyk: '20, 0, 100, 0' },
          '#d98f17': { name: 'Hi Viz Orange', cmyk: '0, 51, 93, 0' },
          '#388032': { name: 'HiViz Green', cmyk: '86, 16, 100, 3' },
          '#bf0072': { name: 'HIViz Pink', cmyk: '2, 97, 4, 0' },
          '#767878': { name: 'Sports Grey', cmyk: '0, 0, 0, 63' },
          '#919393': { name: 'Light Grey Marl', cmyk: '0, 0, 0, 50' },
          '#a6a9a2': { name: 'Ash Grey', cmyk: '32, 24, 26, 5' },
          '#bcbfbb': { name: 'Light Grey', cmyk: '25, 18, 20, 2' },
          '#353330': { name: 'Charcoal Grey', cmyk: '66, 57, 54, 60' },
          '#b9dbea': { name: 'Pastel Blue', cmyk: '32, 0, 5, 0' },
          '#5998d4': { name: 'Sky Blue', cmyk: '70, 15, 0, 0' },
          '#201c3a': { name: 'Navy', cmyk: '100, 92, 36, 39' },
          '#221866': { name: 'Royal Blue', cmyk: '100, 95, 5, 0' },
          '#b5d55e': { name: 'Pastel Green', cmyk: '34, 0, 73, 0' },
          '#90bf33': { name: 'Lime Green', cmyk: '50, 0, 99, 0' },
          '#3c8a35': { name: 'Kelly Green', cmyk: '85, 10, 100, 0' },
          '#e7bbd0': { name: 'Pastel Pink', cmyk: '0, 32, 3, 0' },
          '#d287a2': { name: 'Light Pink', cmyk: '2, 53, 11, 0' },
          '#c42469': { name: 'Fuchsia Pink', cmyk: '0, 94, 20, 0' },
          '#c02300': { name: 'Red', cmyk: '0, 99, 97, 0' },
          '#762009': { name: 'Burgundy', cmyk: '26, 100, 88, 27' },
          '#4c0a6a': { name: 'Purple', cmyk: '75, 100, 0, 0' },
        };
        for (const [brand, colorGroups] of Object.entries(manufacturerColors)) {
          for (const group of colorGroups) {
            for (const mc of group.colors) {
              const hex = mc.hex.toLowerCase();
              if (!GARMENT_COLOR_MAP[hex]) {
                GARMENT_COLOR_MAP[hex] = {
                  name: mc.name,
                  cmyk: `${mc.cmyk.c}, ${mc.cmyk.m}, ${mc.cmyk.y}, ${mc.cmyk.k}`
                };
              }
            }
          }
        }
        const getColorName = (color: string) => {
          const entry = GARMENT_COLOR_MAP[color.toLowerCase()];
          return entry ? entry.name : `Custom (${color})`;
        };
        const getColorCmyk = (color: string) => {
          const entry = GARMENT_COLOR_MAP[color.toLowerCase()];
          return entry ? entry.cmyk : '';
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

          const ensureFileOnDisk = async (filePath: string): Promise<boolean> => {
            return fs.existsSync(filePath);
          };

          // Helper: draw a visible "file missing" error on all pages instead of blank
          const drawMissingFileError = (targetPages: any[], filename: string) => {
            const errMsg = `⚠️ Artwork file missing: ${filename}`;
            for (const pg of targetPages) {
              try {
                pg.page.drawText(errMsg, {
                  x: 20, y: (pg.page.getHeight ? pg.page.getHeight() : pageHeight) / 2,
                  size: 12, color: rgb(0.8, 0, 0),
                });
              } catch {}
            }
            page1.drawText(errMsg, {
              x: 20, y: pageHeight / 2, size: 12, color: rgb(0.8, 0, 0),
            });
          };

          let usePath = svgPath;
          let useOriginalPdf = false;
          
          // CRITICAL: When original PDF exists, ALWAYS prefer it for output to preserve fonts/text
          // pdf2svg can lose text when fonts aren't embedded; the original PDF has exact content
          // The tight-content SVG is for canvas display only
          const isTightContent = (logo as any).filename && (logo as any).filename.includes('_tight-content');

          // EXCEPTION: when the user has explicitly outlined fonts, the original PDF still
          // contains the live text — using it would silently undo the outlining the user
          // requested. In that case, prefer the outlined SVG (logo.filename) for output.
          const fontsOutlined = (logo as any).fontsOutlined === true;

          let cropToContentBounds = false;
          if (fontsOutlined && await ensureFileOnDisk(svgPath)) {
            console.log(`🔤 FONTS OUTLINED — using outlined SVG instead of original PDF: ${(logo as any).filename}`);
            usePath = svgPath;
            useOriginalPdf = false;
            cropToContentBounds = isTightContent;
          } else if (isTightContent && (logo as any).originalFilename && await ensureFileOnDisk(originalPdfPath)) {
            console.log(`🎯 TIGHT-CONTENT SVG exists but USING ORIGINAL PDF to preserve fonts/text: ${(logo as any).originalFilename}`);
            usePath = originalPdfPath;
            useOriginalPdf = true;
            cropToContentBounds = true;
          } else if (isTightContent) {
            console.log(`🎯 USING TIGHT-CONTENT SVG (no original PDF available): ${(logo as any).filename}`);
            await ensureFileOnDisk(svgPath);
            usePath = svgPath;
            useOriginalPdf = false;
          } else if ((logo as any).originalFilename && await ensureFileOnDisk(originalPdfPath)) {
            console.log(`🎯 USING ORIGINAL PDF WITH EXACT CMYK COLORS: ${(logo as any).originalFilename}`);
            usePath = originalPdfPath;
            useOriginalPdf = true;
          } else {
            console.log(`📄 Processing SVG: ${(logo as any).filename}`);
            const svgExists = await ensureFileOnDisk(svgPath);
            if (!svgExists) {
              console.log(`❌ SVG not found even after Dropbox restore attempt: ${svgPath}`);
              drawMissingFileError(garmentColorPages, path.basename(svgPath));
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
            let rsvgWidthPts = widthPts;
            let rsvgHeightPts = heightPts;
            
            // Check if logo is a PNG/JPEG raster image (not a vector)
            const logoMimeType = (logo as any).mimeType || (logo as any).originalMimeType;
            // A logo whose filename is .png may still have an original vector PDF (DTF/complex fallback).
            // useOriginalPdf is already true in that case — it must take priority over the raster check.
            const isRasterFile = !useOriginalPdf && (
                                 logoMimeType === 'image/png' || logoMimeType === 'image/jpeg' || 
                                 ((logo as any).filename && ((logo as any).filename.endsWith('.png') || (logo as any).filename.endsWith('.jpg') || (logo as any).filename.endsWith('.jpeg'))));
            
            if (useOriginalPdf) {
              vectorBytes = fs.readFileSync(originalPdfPath);
              
              const pdfBounds = (logo as any).originalPdfBounds || (logo as any).contentBounds;
              if (cropToContentBounds && pdfBounds) {
                const cb = pdfBounds;
                const boundsUnits = cb.units || 'pt';
                console.log(`🎯 USING ORIGINAL PDF WITH CONTENT-BOUNDS CROP to preserve fonts/text`);
                console.log(`📐 PDF bounds (${boundsUnits}): (${cb.xMin?.toFixed?.(1) || cb.xMin}, ${cb.yMin?.toFixed?.(1) || cb.yMin}) to (${cb.xMax?.toFixed?.(1) || cb.xMax}, ${cb.yMax?.toFixed?.(1) || cb.yMax})`);
                
                try {
                  const cropDoc = await PDFDocument.load(vectorBytes);
                  const cropPage = cropDoc.getPages()[0];
                  if (cropPage) {
                    let bxMin = cb.xMin ?? 0;
                    let byMin = cb.yMin ?? 0;
                    let bxMax = cb.xMax ?? cropPage.getWidth();
                    let byMax = cb.yMax ?? cropPage.getHeight();
                    
                    if (boundsUnits === 'px') {
                      const pxToPt = 72 / 96;
                      bxMin *= pxToPt;
                      byMin *= pxToPt;
                      bxMax *= pxToPt;
                      byMax *= pxToPt;
                    } else if (boundsUnits === 'mm') {
                      const mmToPt = 2.834645669;
                      bxMin *= mmToPt;
                      byMin *= mmToPt;
                      bxMax *= mmToPt;
                      byMax *= mmToPt;
                    }
                    
                    const cropW = bxMax - bxMin;
                    const cropH = byMax - byMin;
                    
                    cropPage.setCropBox(bxMin, byMin, cropW, cropH);
                    console.log(`✂️ CropBox set: (${bxMin.toFixed(1)}, ${byMin.toFixed(1)}) size ${cropW.toFixed(1)}×${cropH.toFixed(1)}pts`);
                    
                    vectorBytes = Buffer.from(await cropDoc.save());
                  }
                } catch (cropErr: any) {
                  console.log(`⚠️ CropBox failed, using full page: ${cropErr.message}`);
                }
              } else {
                console.log(`🎯 USING ORIGINAL PDF AT FULL PAGE DIMENSIONS`);
                console.log(`📄 This preserves white elements and uses the intended artwork size from the PDF`);
              }
            } else if (isRasterFile) {
              console.log(`🖼️ RASTER IMAGE DETECTED: ${(logo as any).filename} - using embedPng/embedJpg`);
              isRasterImage = true;
              rasterImageBytes = fs.readFileSync(svgPath); // svgPath points to the raster image file
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
              
              // CRITICAL: Extract SVG native aspect ratio from viewBox to prevent squashing
              // When user manually resizes an element to non-matching aspect ratio,
              // rsvg-convert would stretch the content. We must preserve the original ratio.
              let svgNativeAspect: number | null = null;
              const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
              if (viewBoxMatch) {
                const vbParts = viewBoxMatch[1].split(/[\s,]+/).map(Number);
                if (vbParts.length === 4 && vbParts[2] > 0 && vbParts[3] > 0) {
                  svgNativeAspect = vbParts[2] / vbParts[3];
                  console.log(`📐 SVG viewBox: ${vbParts[2].toFixed(1)}×${vbParts[3].toFixed(1)} (aspect: ${svgNativeAspect.toFixed(3)})`);
                }
              }
              if (!svgNativeAspect) {
                const svgWidthMatch = svgContent.match(/\bwidth="([0-9.]+)/);
                const svgHeightMatch = svgContent.match(/\bheight="([0-9.]+)/);
                if (svgWidthMatch && svgHeightMatch) {
                  const sw = parseFloat(svgWidthMatch[1]);
                  const sh = parseFloat(svgHeightMatch[1]);
                  if (sw > 0 && sh > 0) svgNativeAspect = sw / sh;
                }
              }
              
              let rsvgWidthPts = widthPts;
              let rsvgHeightPts = heightPts;
              
              if (svgNativeAspect) {
                const elementAspect = widthPts / heightPts;
                const aspectDiff = Math.abs(svgNativeAspect - elementAspect) / Math.max(svgNativeAspect, elementAspect);
                if (aspectDiff > 0.02) {
                  console.log(`⚠️ Aspect ratio mismatch: SVG=${svgNativeAspect.toFixed(3)}, element=${elementAspect.toFixed(3)} (${(aspectDiff * 100).toFixed(1)}% diff)`);
                  if (svgNativeAspect > elementAspect) {
                    rsvgHeightPts = widthPts / svgNativeAspect;
                  } else {
                    rsvgWidthPts = heightPts * svgNativeAspect;
                  }
                  console.log(`📐 Adjusted rsvg dimensions to preserve ratio: ${rsvgWidthPts.toFixed(1)}×${rsvgHeightPts.toFixed(1)}pts (was ${widthPts.toFixed(1)}×${heightPts.toFixed(1)}pts)`);
                }
              }
              
              if (hasEmbeddedImages) {
                console.log(`🖼️ EMBEDDED IMAGES: Using high-DPI conversion for Illustrator`);
                const dpi = 300;
                const widthPx = Math.round(rsvgWidthPts * dpi / 72);
                const heightPx = Math.round(rsvgHeightPts * dpi / 72);
                
                const rsvgCmd = `rsvg-convert -f pdf -d ${dpi} -p ${dpi} -w ${widthPx} -h ${heightPx} -o "${tempPdf}" "${tempSvg}"`;
                execSync(rsvgCmd);
                console.log(`✅ High-DPI SVG → PDF (${dpi} DPI): ${rsvgWidthPts.toFixed(0)}×${rsvgHeightPts.toFixed(0)}pts @ ${widthPx}×${heightPx}px`);
              } else {
                const rsvgCmd = `rsvg-convert -f pdf -b transparent -w ${rsvgWidthPts.toFixed(0)} -h ${rsvgHeightPts.toFixed(0)} -o "${tempPdf}" "${tempSvg}"`;
                execSync(rsvgCmd);
                console.log(`✅ SVG → PDF with transparency: ${rsvgWidthPts.toFixed(0)}×${rsvgHeightPts.toFixed(0)}pts`);
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
              
              // Preserve aspect ratio for embedded PDF pages too
              const srcPage = vectorDoc.getPages()[0];
              if (srcPage) {
                const srcW = srcPage.getWidth();
                const srcH = srcPage.getHeight();
                const pdfAspect = srcW / srcH;
                const elemAspect = widthPts / heightPts;
                const pdfAspectDiff = Math.abs(pdfAspect - elemAspect) / Math.max(pdfAspect, elemAspect);
                if (pdfAspectDiff > 0.02) {
                  console.log(`⚠️ PDF page aspect mismatch: PDF=${pdfAspect.toFixed(3)} (${srcW.toFixed(1)}×${srcH.toFixed(1)}pts), element=${elemAspect.toFixed(3)} (${(pdfAspectDiff * 100).toFixed(1)}% diff)`);
                  if (pdfAspect > elemAspect) {
                    rsvgHeightPts = widthPts / pdfAspect;
                  } else {
                    rsvgWidthPts = heightPts * pdfAspect;
                  }
                  console.log(`📐 Adjusted PDF embed dimensions to preserve ratio: ${rsvgWidthPts.toFixed(1)}×${rsvgHeightPts.toFixed(1)}pts`);
                }
              }
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
            const adjustedWidthPts = (element as any).adjustedWidthPts || rsvgWidthPts || widthPts;
            const adjustedHeightPts = (element as any).adjustedHeightPts || rsvgHeightPts || heightPts;
            
            // Calculate offset to center the aspect-corrected content within the element bounds
            const xOffset = (widthPts - adjustedWidthPts) / 2;
            const yOffset = (heightPts - adjustedHeightPts) / 2;
            
            if (Math.abs(xOffset) > 0.5 || Math.abs(yOffset) > 0.5) {
              console.log(`📐 Centering offset: x=${xOffset.toFixed(1)}, y=${yOffset.toFixed(1)}pts`);
            }
            
            const drawArtwork = (targetPage: any, options: { x: number; y: number; width: number; height: number; rotate?: any }, rotationDeg: number = 0) => {
              // Transform centering offsets based on rotation
              // pdf-lib rotates around bottom-left, so offsets need to be rotated accordingly
              let adjX = xOffset;
              let adjY = yOffset;
              if (rotationDeg === 90) {
                adjX = -yOffset;  // Y offset becomes negative X in rotated space
                adjY = xOffset;   // X offset becomes Y in rotated space
              } else if (rotationDeg === 180) {
                adjX = -xOffset;
                adjY = -yOffset;
              } else if (rotationDeg === 270) {
                adjX = yOffset;
                adjY = -xOffset;
              }
              
              const drawOpts = {
                ...options,
                x: options.x + adjX,
                y: options.y + adjY,
                width: adjustedWidthPts,
                height: adjustedHeightPts
              };
              
              if (embeddedImage) {
                targetPage.drawImage(embeddedImage, drawOpts);
              } else if (embeddedPage) {
                targetPage.drawPage(embeddedPage, drawOpts);
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
              }, 90);
              console.log(`✅ Page 1: Artwork embedded with 90° rotation`);
              
              // Embed with 90° rotation on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: rotatedX,
                  y: rotatedY,
                  width: widthPts,
                  height: heightPts,
                  rotate: degrees(90)
                }, 90);
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
              }, 180);
              console.log(`✅ Page 1: Artwork embedded with 180° rotation`);
              
              // Embed with 180° rotation on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: rotatedX,
                  y: rotatedY,
                  width: widthPts,
                  height: heightPts,
                  rotate: degrees(180)
                }, 180);
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
              }, 270);
              console.log(`✅ Page 1: Artwork embedded with 270° rotation`);
              
              // Embed with 270° rotation on all garment color pages
              for (const garmentPageInfo of garmentColorPages) {
                drawArtwork(garmentPageInfo.page, {
                  x: rotatedX,
                  y: rotatedY,
                  width: widthPts,
                  height: heightPts,
                  rotate: degrees(270)
                }, 270);
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
          const cmykRef = getColorCmyk(garmentPageInfo.color);
          const garmentLabel = cmykRef ? `Garment Color: ${garmentPageInfo.colorName} (CMYK: ${cmykRef})` : `Garment Color: ${garmentPageInfo.colorName}`;
          garmentPageInfo.page.drawText(garmentLabel, { 
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
        const isAppliqueBadges = project.templateSize?.includes('applique');
        
        if (isAppliqueBadges) {
          const formData = project.appliqueBadgesForm || {
            embroideryFileOptions: [],
            embroideryThreadOptions: [],
            position: [],
            graphicSize: '',
            embroideredParts: ''
          };
          console.log('📋 Applique Badges project detected - adding specification page (form data:', project.appliqueBadgesForm ? 'provided' : 'using defaults', ')');
          try {
            const { AppliqueBadgesPDFGenerator } = await import('./applique-badges-pdf-generator');
            const appliqueGenerator = new AppliqueBadgesPDFGenerator();
            
            const appliquePdfBytes = await appliqueGenerator.generateAppliquePDF({
              originalPdfBuffer: Buffer.from(pdfBytes),
              appliqueBadgesForm: formData,
              projectName: project.name,
              embroideryPreviewPath: project.embroideryPreviewPath || undefined
            });
            
            console.log(`✅ Applique Badges PDF with form page: ${appliquePdfBytes.length} bytes`);
            
            const fallbackAppliqueWithScreenshot = await appendCanvasScreenshotPage(appliquePdfBytes, projectId, canvasElements, logos, templateSize);
            clearTimeout(pdfGenSafetyTimer);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${buildPdfFilename(project.name, project.quantity || 1, templateSize?.productCode, 'applique')}"`);
            res.send(fallbackAppliqueWithScreenshot);
            return;
          } catch (error) {
            console.error('❌ Applique Badges PDF generation failed:', error);
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
          // CRITICAL: async exec — GS CMYK conversion can block event loop for up to 60s
          await execAsyncRaw(gsCommand, { encoding: 'utf8' as any, timeout: 60000 });
          
          if (fs.existsSync(tempCmykPath)) {
            const cmykPdfBytes = fs.readFileSync(tempCmykPath);
            console.log(`✅ CMYK PDF with OutputIntent generated: ${cmykPdfBytes.length} bytes`);
            
            fs.unlinkSync(tempRgbPath);
            fs.unlinkSync(tempCmykPath);
            
            const cmykWithScreenshot = await appendCanvasScreenshotPage(cmykPdfBytes, projectId, canvasElements, logos, templateSize);
            clearTimeout(pdfGenSafetyTimer);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${buildPdfFilename(project.name, project.quantity || 1, templateSize?.productCode)}"`);
            res.send(cmykWithScreenshot);
            return;
          } else {
            console.warn('⚠️ CMYK conversion failed, returning RGB PDF');
            fs.unlinkSync(tempRgbPath);
          }
        } catch (cmykError) {
          console.error('⚠️ CMYK conversion error:', cmykError);
          console.log('Returning RGB PDF as fallback');
        }
        
        const fallbackWithScreenshot = await appendCanvasScreenshotPage(Buffer.from(pdfBytes), projectId, canvasElements, logos, templateSize);
        clearTimeout(pdfGenSafetyTimer);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${buildPdfFilename(project.name, project.quantity || 1, templateSize?.productCode)}"`);
        res.send(fallbackWithScreenshot);
        return;
        
      } catch (error) {
        console.error('❌ Ultra simple PDF failed:', error);
        res.status(500).json({ error: 'PDF generation failed' });
        return;
      }

      // This should never be reached due to early return above
      console.log('❌ Unexpected fallthrough - this should not happen');
      
    } catch (error) {
      clearTimeout(pdfGenSafetyTimer);
      console.error('❌ PDF generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate PDF: ' + errorMessage });
      }
    }
  });
  
  // Setup imposition routes
  setupImpositionRoutes(app as any, storage);
  // File upload endpoint
  app.post('/api/projects/:projectId/logos', upload.array('files'), guardRoute('upload'), async (req, res) => {
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

      // INCIDENT TRACEABILITY: Resolve the Odoo uploader (strictly best-effort) and stamp
      // their email/id on the project the first time they upload. This lets us tie any
      // crash, OOM, or ImageMagick/Inkscape failure back to the actual customer
      // (instead of just an anonymous "Untitled Project"). MUST NOT slow down uploads.
      let uploaderEmail: string | null = (project as any).uploaderEmail || null;
      let uploaderId: string | null = (project as any).uploaderId || null;
      const alreadyAttempted = !!(uploaderEmail || uploaderId);
      const clientCookies = req.headers.cookie || '';
      let lookupDiag = 'skipped';
      if (!alreadyAttempted) {
        if (!clientCookies) {
          lookupDiag = 'no-cookies-on-request';
        } else {
          const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
          const ac = new AbortController();
          const lookupStart = Date.now();
          const timer = setTimeout(() => ac.abort(), 1500); // 1.5s hard cap; runs in parallel with upload setup
          try {
            const sessionResp = await fetch(`${odooBaseUrl}/web/session/info`, {
              method: 'GET',
              headers: { 'Cookie': clientCookies, 'Accept': 'application/json' },
              signal: ac.signal,
            });
            const elapsed = Date.now() - lookupStart;
            if (!sessionResp.ok) {
              lookupDiag = `http-${sessionResp.status}-in-${elapsed}ms`;
            } else {
              const sessionData: any = await sessionResp.json();
              // Odoo /web/session/info: `username` is the login (email for our store);
              // `user_id` is `[id, display_name]` so [1] is NOT the email.
              const resolvedEmail = sessionData?.username || sessionData?.partner_email || null;
              const resolvedId = sessionData?.uid ? String(sessionData.uid) : null;
              if (resolvedEmail || resolvedId) {
                uploaderEmail = resolvedEmail;
                uploaderId = resolvedId;
                lookupDiag = `ok-in-${elapsed}ms`;
                // Fire-and-forget persistence so we don't add DB latency to the upload path
                storage.updateProject(projectId, {
                  uploaderEmail: resolvedEmail || undefined,
                  uploaderId: resolvedId || undefined,
                } as any).catch((persistErr: any) => {
                  console.warn(`[UPLOAD CTX] Failed to persist uploader on project ${projectId}: ${persistErr?.message}`);
                });
              } else {
                lookupDiag = `no-username-in-response-after-${elapsed}ms uid=${sessionData?.uid ?? 'none'}`;
              }
            }
          } catch (sessionErr: any) {
            const elapsed = Date.now() - lookupStart;
            if (sessionErr?.name === 'AbortError') {
              lookupDiag = `timeout-after-${elapsed}ms`;
            } else {
              lookupDiag = `error-after-${elapsed}ms: ${sessionErr?.message}`;
            }
          } finally {
            clearTimeout(timer);
          }
        }
      } else {
        lookupDiag = 'already-known';
      }
      const uploaderTag = uploaderEmail || uploaderId || `anonymous(${lookupDiag})`;
      console.log(`🏷️  [UPLOAD CTX] project=${projectId} uploader=${uploaderTag} files=${files.length} names=[${files.map(f => f.originalname).join(', ')}]`);

      // PRODUCTION FLOW: Import production flow manager
      const { productionFlow } = await import('./production-flow-manager');
      const { fixSVGNamespaces } = await import('./fix-svg-namespaces');

      // Get template information to check if this is a single colour template
      const templateSizes = await storage.getTemplateSizes();
      const templateSize = templateSizes.find(t => t.id === project.templateSize);
      const isSingleColourTemplate = templateSize?.group === "Screen Printed Transfers" && 
        (templateSize?.label?.includes("Single Colour") || templateSize?.label?.includes("Zero") || templateSize?.label?.includes("Reflective"));
      
      // Large format DTF (1000x550mm or any template ≥1000mm wide) — skip pdf2svg entirely for PDF
      // uploads and use PNG for canvas display. The original PDF is always kept for production output.
      const isLargeFormatDTF = (templateSize?.width ?? 0) >= 1000 || (templateSize?.height ?? 0) >= 500;
      const dtfTemplateWmm = templateSize?.width ?? 1000;
      const dtfTemplateHmm = templateSize?.height ?? 550;
      
      console.log(`📐 Template: ${templateSize?.name} (Group: ${templateSize?.group}), Single Colour: ${isSingleColourTemplate}, Ink Color: ${project.inkColor}, LargeFormatDTF: ${isLargeFormatDTF}`);

      const logos = [];
      
      // Get existing canvas elements for proper z-index ordering (use max+1, not count, to avoid collisions after reordering)
      const existingCanvasElements = await storage.getCanvasElementsByProject(projectId);
      let nextZIndex = existingCanvasElements.length > 0 
        ? Math.max(...existingCanvasElements.map(el => el.zIndex ?? 0)) + 1 
        : 0;
      
      for (const file of files) {
        let finalFilename = file.filename;
        let finalMimeType = file.mimetype;
        let finalUrl = `/uploads/${file.filename}`;

        // Handle AI/EPS files — convert to PDF and route through the standard PDF pipeline.
        // Rationale: AI files are essentially PDFs (Illustrator's "Create PDF Compatible File"
        // option produces a valid PDF inside the .ai container), so we get the most accurate
        // bounds detection, CMYK preservation, and tight-content cropping by treating them
        // exactly like PDF uploads instead of going AI → SVG via pdf2svg, which loses precision
        // and skips the Ghostscript bbox / ArtBox / TrimBox handling.
        const isAiOrEpsUpload = file.mimetype === 'application/postscript' ||
            file.mimetype === 'application/illustrator' ||
            file.mimetype === 'application/x-illustrator';

        if (isAiOrEpsUpload) {
          const sourcePath = path.join(uploadDir, file.filename);
          const extension = (file.filename.toLowerCase().split('.').pop() || 'ai');
          console.log(`🎨 Processing ${extension.toUpperCase()} file as PDF: ${file.filename}`);

          const pdfFilename = `${file.filename}.pdf`;
          const pdfPath = path.join(uploadDir, pdfFilename);

          // Step 1: try the AI as a PDF directly (most modern .ai files are valid PDFs)
          let convertedToPdf = false;
          try {
            const head = fs.readFileSync(sourcePath, { encoding: 'binary', flag: 'r' }).slice(0, 1024);
            if (head.startsWith('%PDF-')) {
              fs.copyFileSync(sourcePath, pdfPath);
              convertedToPdf = true;
              console.log(`✅ ${extension.toUpperCase()} file is already a valid PDF — copied as ${pdfFilename}`);
            }
          } catch (e: any) {
            console.log(`⚠️ Failed to inspect ${extension.toUpperCase()} header: ${e.message}`);
          }

          // Step 2: fall back to Ghostscript conversion (for EPS or non-PDF-compatible AI files)
          if (!convertedToPdf) {
            try {
              const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dEPSCrop -sOutputFile="${pdfPath}" "${sourcePath}"`;
              await execAsync(gsCmd);
              if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
                convertedToPdf = true;
                console.log(`✅ Converted ${extension.toUpperCase()} → PDF via Ghostscript: ${pdfFilename}`);
              }
            } catch (gsErr: any) {
              console.error(`❌ Ghostscript ${extension.toUpperCase()}→PDF conversion failed: ${gsErr.message}`);
            }
          }

          if (convertedToPdf) {
            // Track the original AI/EPS source for reference (downstream may use this)
            (file as any).originalVectorPath = sourcePath;
            (file as any).originalVectorType = extension;
            (file as any).isCMYKPreserved = true;

            // Mutate the file object so the rest of the pipeline treats it as a normal PDF upload
            (file as any).filename = pdfFilename;
            (file as any).mimetype = 'application/pdf';
            finalFilename = pdfFilename;
            finalMimeType = 'application/pdf';
            finalUrl = `/uploads/${pdfFilename}`;
            // Do NOT enter the legacy AI→SVG branch — fall through to PDF processing below
          } else {
            console.log(`⚠️ Could not convert ${extension.toUpperCase()} to PDF — falling back to legacy SVG conversion`);
          }
        }

        // Legacy AI/EPS → SVG fallback (only runs if PDF conversion above failed)
        if (isAiOrEpsUpload && file.mimetype !== 'application/pdf') {
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
            // Use lightweight CLI tools for large files to avoid loading 100MB+ into Node memory
            try {
              const fileSizeMB = fs.statSync(sourcePdfPath).size / (1024 * 1024);
              let pageCount = 1;
              if (fileSizeMB > 30) {
                try {
                  const gsPages = execSync(`gs -dNODISPLAY -dQUIET -dNOPAUSE -dBATCH -c "(${sourcePdfPath}) (r) file runpdfbegin pdfpagecount = quit" 2>/dev/null`, { encoding: 'utf8', timeout: 10000 }).trim();
                  const parsed = parseInt(gsPages, 10);
                  if (parsed > 0) pageCount = parsed;
                } catch {
                  try {
                    const identifyPages = execSync(`identify "${sourcePdfPath}" 2>/dev/null | wc -l`, { encoding: 'utf8', timeout: 15000 }).trim();
                    const parsed = parseInt(identifyPages, 10);
                    if (parsed > 0) pageCount = parsed;
                  } catch {}
                }
                console.log(`📄 PDF page count detected (lightweight): ${pageCount} pages for ${file.filename} (${fileSizeMB.toFixed(0)}MB)`);
              } else {
                const { PDFDocument } = await import('pdf-lib');
                const pdfBytes = fs.readFileSync(sourcePdfPath);
                const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
                pageCount = pdfDoc.getPageCount();
                console.log(`📄 PDF page count detected: ${pageCount} pages for ${file.filename}`);
              }
              (file as any).pageCount = pageCount;
              (file as any).hasGarmentPages = false; // Set to true only if garment footer text is actually detected below
              
              // Force hasGarmentPages to true for any multi-page PDF to ensure pass-through
              if (pageCount > 1) {
                (file as any).hasGarmentPages = true;
                console.log(`📄 Multi-page PDF detected - enabling pass-through mode`);
              }
              
              // Extract garment colors and quantities from PDF footer text (for reorder detection)
              if (pageCount > 1) {
                try {
                  const { execSync } = await import('child_process');
                  const detectedColors: Array<{color: string; colorName: string; quantity: number}> = [];
                  
                  // Known garment color name-to-hex mapping for reorder detection
                  const knownColorMap: Record<string, string> = {
                    "white": "#FFFFFF", "black": "#171816", "natural cotton": "#D9D2AB",
                    "yellow": "#F0F42A", "hi viz": "#d7da14", "hiviz": "#d7da14",
                    "sports grey": "#767878", "light grey marl": "#919393",
                    "ash grey": "#A6A9A2", "light grey": "#BCBFBB",
                    "charcoal grey": "#353330", "sky blue": "#5998D4",
                    "navy": "#201C3A", "royal blue": "#221866",
                    "kelly green": "#3C8A35", "red": "#C02300",
                    "burgundy": "#762009", "purple": "#4C0A6A",
                    "fuchsia pink": "#C42469", "pastel blue": "#B9DBEA",
                    "pastel green": "#B5D55E", "pastel pink": "#E7BBD0",
                    "pastel yellow": "#F3F590", "lime green": "#90BF33",
                    "light pink": "#D287A2", "hi viz orange": "#D98F17",
                    "hiviz orange": "#D98F17", "hiviz green": "#388032",
                    "hi viz green": "#388032", "hiviz pink": "#BF0072",
                    "hi viz pink": "#BF0072",
                  };
                  
                  for (let p = 1; p <= pageCount; p++) {
                    try {
                      const pageText = execSync(
                        `pdftotext -f ${p} -l ${p} "${sourcePdfPath}" -`,
                        { encoding: 'utf-8', timeout: 5000 }
                      );
                      
                      console.log(`📄 Page ${p} extracted text:`, pageText.trim().substring(0, 200));
                      
                      // Match "Garment Color: ColorName (#HEXCODE)" or "Garment Color: ColorName"
                      // REQUIRE "Project:" to be present on the page to confirm it's an app-generated order PDF
                      const hasProjectLabel = pageText.includes('Project:');
                      const colorMatch = pageText.match(/Garment\s*Colou?r:\s*(.+?)(?:\s{2,}|\n|Quantity)/i);
                      const qtyMatch = pageText.match(/Quantity:\s*(\d+)/i);
                      
                      if (hasProjectLabel && colorMatch && qtyMatch) {
                        let rawColorPart = colorMatch[1].trim();
                        const quantity = parseInt(qtyMatch[1], 10);
                        
                        // Try to extract hex code from format "ColorName (#HEXCODE)"
                        const hexInParens = rawColorPart.match(/\(#([0-9A-Fa-f]{6})\)/);
                        // Also try standalone hex codes in the page text
                        const standaloneHex = pageText.match(/#([0-9A-Fa-f]{6})/);
                        
                        let hexColor = '#000000';
                        let colorName = rawColorPart;
                        
                        if (hexInParens) {
                          hexColor = `#${hexInParens[1].toUpperCase()}`;
                          colorName = rawColorPart.replace(/\s*\(#[0-9A-Fa-f]{6}\)/, '').trim();
                        } else if (standaloneHex) {
                          hexColor = `#${standaloneHex[1].toUpperCase()}`;
                        } else {
                          // Fall back to name-based lookup
                          const lookupKey = colorName.toLowerCase().trim();
                          if (knownColorMap[lookupKey]) {
                            hexColor = knownColorMap[lookupKey];
                          }
                        }
                        
                        if (colorName && quantity > 0) {
                          const existing = detectedColors.find(dc => dc.colorName === colorName);
                          if (!existing) {
                            detectedColors.push({
                              color: hexColor,
                              colorName,
                              quantity
                            });
                          }
                        }
                      }
                    } catch (pageErr) {
                      // Skip pages that fail text extraction
                    }
                  }
                  
                  if (detectedColors.length > 0) {
                    (file as any).detectedGarmentColors = detectedColors;
                    (file as any).hasGarmentPages = true; // Confirmed: this is a garment order PDF
                    console.log(`🎨 Detected garment colors from PDF reorder (hasGarmentPages=true):`, detectedColors);
                  }
                } catch (extractErr) {
                  console.log('⚠️ Could not extract garment info from PDF:', extractErr);
                }
              }
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

            // ── LARGE FORMAT DTF FAST PATH ──────────────────────────────────────────
            // For templates ≥ 1000mm wide (e.g. 1000×550mm DTF), skip pdf2svg entirely.
            // Complex vectors (glitter, fine-detail) always kill pdf2svg on these files.
            // Render a PNG at 150 DPI for canvas display; original PDF is kept for output.
            if (isLargeFormatDTF) {
              console.log(`📐 Large format DTF — skipping pdf2svg, rendering PNG preview directly`);
              const pngFilename = `${file.filename}_preview.png`;
              const pngPath = path.join(uploadDir, pngFilename);
              let dtfPageWidthPts = 0;
              let dtfPageHeightPts = 0;
              try {
                // Get PDF page dimensions AND content bounds for proper sizing on canvas
                // Use identify (ImageMagick) to get page dimensions WITHOUT loading entire PDF into Node memory
                try {
                  let pageWidthPts = 0;
                  let pageHeightPts = 0;
                  try {
                    const identifyDims = execSync(`identify -format "%w %h" "${pdfPath}[0]" 2>/dev/null`, { encoding: 'utf8', timeout: 10000 }).trim();
                    const [pw, ph] = identifyDims.split(' ').map(Number);
                    if (pw > 0 && ph > 0) {
                      pageWidthPts = pw;
                      pageHeightPts = ph;
                    }
                  } catch {
                    // Fallback: use pdfinfo or Ghostscript for page size
                    try {
                      const gsPageInfo = execSync(`gs -dNODISPLAY -dQUIET -dNOPAUSE -dBATCH -c "(${pdfPath}) (r) file runpdfbegin 1 pdfgetpage /MediaBox pdfgetpageattr == quit" 2>/dev/null`, { encoding: 'utf8', timeout: 10000 });
                      const boxMatch = gsPageInfo.match(/\[([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\]/);
                      if (boxMatch) {
                        pageWidthPts = parseFloat(boxMatch[3]) - parseFloat(boxMatch[1]);
                        pageHeightPts = parseFloat(boxMatch[4]) - parseFloat(boxMatch[2]);
                      }
                    } catch {}
                  }
                  // Final fallback: only load via pdf-lib if file is small enough
                  if (pageWidthPts <= 0 || pageHeightPts <= 0) {
                    const fileSizeMB = fs.statSync(pdfPath).size / (1024 * 1024);
                    if (fileSizeMB < 30) {
                      const { PDFDocument: PDFDocLarge } = await import('pdf-lib');
                      const largePdfBytes = fs.readFileSync(pdfPath);
                      const largePdfDoc = await PDFDocLarge.load(largePdfBytes);
                      const [largePage] = largePdfDoc.getPages();
                      const largePageSize = largePage.getSize();
                      pageWidthPts = largePageSize.width;
                      pageHeightPts = largePageSize.height;
                    } else {
                      console.log(`⚠️ DTF PDF too large (${fileSizeMB.toFixed(0)}MB) for pdf-lib fallback — using template dimensions`);
                      pageWidthPts = (dtfTemplateWmm / 0.352778);
                      pageHeightPts = (dtfTemplateHmm / 0.352778);
                    }
                  }
                  dtfPageWidthPts = pageWidthPts;
                  dtfPageHeightPts = pageHeightPts;
                  console.log(`📐 DTF PDF page: ${(pageWidthPts * 0.352778).toFixed(0)}×${(pageHeightPts * 0.352778).toFixed(0)}mm`);

                  let dtfContentBounds = {
                    xMin: 0, yMin: 0,
                    xMax: pageWidthPts, yMax: pageHeightPts,
                    width: pageWidthPts, height: pageHeightPts,
                    widthMm: pageWidthPts * 0.352778,
                    heightMm: pageHeightPts * 0.352778
                  };

                  const pageWmm = pageWidthPts * 0.352778;
                  const pageHmm = pageHeightPts * 0.352778;
                  const pageFitsTemplate = (
                    (Math.abs(pageWmm - dtfTemplateWmm) < dtfTemplateWmm * 0.15 && Math.abs(pageHmm - dtfTemplateHmm) < dtfTemplateHmm * 0.15) ||
                    (Math.abs(pageWmm - dtfTemplateHmm) < dtfTemplateHmm * 0.15 && Math.abs(pageHmm - dtfTemplateWmm) < dtfTemplateWmm * 0.15)
                  );

                  if (pageFitsTemplate) {
                    console.log(`📐 DTF PDF page (${pageWmm.toFixed(0)}×${pageHmm.toFixed(0)}mm) matches template (${dtfTemplateWmm}×${dtfTemplateHmm}mm) — using full page dimensions (production-ready file)`);
                  } else {
                    try {
                      const gsBboxOutput = execSync(`gs -dBATCH -dNOPAUSE -dQUIET -sDEVICE=bbox "${pdfPath}" 2>&1`, { encoding: 'utf8', timeout: 15000 });
                      const hiResMatch = gsBboxOutput.match(/%%HiResBoundingBox:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
                      if (hiResMatch) {
                        const [, bx1, by1, bx2, by2] = hiResMatch.map(Number);
                        const bw = bx2 - bx1;
                        const bh = by2 - by1;
                        const pageArea = pageWidthPts * pageHeightPts;
                        const contentArea = bw * bh;
                        const coverage = contentArea / pageArea;
                        console.log(`🎯 DTF GS bbox: (${bx1.toFixed(1)},${by1.toFixed(1)}) to (${bx2.toFixed(1)},${by2.toFixed(1)}) = ${bw.toFixed(1)}×${bh.toFixed(1)}pts (${(coverage * 100).toFixed(0)}% of page)`);

                        if (bw > 1 && bh > 1 && coverage >= 0.01) {
                          dtfContentBounds = {
                            xMin: bx1, yMin: by1,
                            xMax: bx2, yMax: by2,
                            width: bw, height: bh,
                            widthMm: bw * 0.352778,
                            heightMm: bh * 0.352778
                          };
                          console.log(`✅ DTF GS content bounds: ${dtfContentBounds.widthMm.toFixed(1)}×${dtfContentBounds.heightMm.toFixed(1)}mm (instead of full page ${pageWmm.toFixed(0)}×${pageHmm.toFixed(0)}mm)`);
                        } else {
                          console.log(`⚠️ DTF GS bbox too small or empty — using full page as bounds`);
                        }
                      } else {
                        console.log(`⚠️ DTF GS bbox returned no HiResBoundingBox — using full page`);
                      }
                    } catch (gsBboxErr) {
                      console.log(`⚠️ DTF GS bbox extraction failed, using full page:`, gsBboxErr);
                    }

                    (file as any)._dtfNeedsAlphaTrimCheck = !!dtfContentBounds;
                  }

                  (file as any).originalPdfBounds = dtfContentBounds;
                } catch (sizeErr) {
                  console.log(`⚠️ Could not read DTF PDF page size: ${sizeErr}`);
                }

                // Smart DPI based on file size and memory — image is capped at 2000px anyway.
                // Lower DPI dramatically reduces memory usage for complex vector PDFs (prevents OOM in production).
                // SIGKILL ensures GS is immediately terminated on timeout (SIGTERM is ignored by GS during rendering).
                const dtfDPI = getSmartPreviewDPI(pdfPath);
                const dtfGsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r${dtfDPI} -dMaxBitmap=80000000 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                await execAsync(dtfGsCmd, { timeout: 60000, killSignal: 'SIGKILL' });

                if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                  const dtfBounds = (file as any).originalPdfBounds;
                  if ((file as any)._dtfNeedsAlphaTrimCheck && dtfBounds && dtfPageWidthPts > 0 && dtfPageHeightPts > 0) {
                    try {
                      const identifyOut = execSync(`identify -format "%w %h" "${pngPath}"`, { encoding: 'utf8', timeout: 5000 }).trim();
                      const [pngW, pngH] = identifyOut.split(' ').map(Number);
                      if (pngW > 0 && pngH > 0) {
                        const trimInfo = execSync(`convert "${pngPath}" -trim -format "%w %h %X %Y" info:`, { encoding: 'utf8', timeout: 5000 }).trim();
                        const trimParts = trimInfo.split(/\s+/).map(Number);
                        if (trimParts.length >= 4 && trimParts[0] > 0 && trimParts[1] > 0) {
                          const [trimW, trimH, trimOffX, trimOffY] = trimParts;
                          const scaleX = dtfPageWidthPts / pngW;
                          const scaleY = dtfPageHeightPts / pngH;
                          const alphaXMin = Math.abs(trimOffX) * scaleX;
                          const alphaYMin = Math.abs(trimOffY) * scaleY;
                          const alphaW = trimW * scaleX;
                          const alphaH = trimH * scaleY;
                          const alphaYMinPdf = dtfPageHeightPts - alphaYMin - alphaH;
                          const alphaArea = alphaW * alphaH;
                          const gsBoundsArea = dtfBounds.width * dtfBounds.height;
                          
                          console.log(`🔍 DTF alpha-trim: ${(alphaW * 0.352778).toFixed(1)}×${(alphaH * 0.352778).toFixed(1)}mm vs GS bbox: ${dtfBounds.widthMm.toFixed(1)}×${dtfBounds.heightMm.toFixed(1)}mm`);
                          
                          if (alphaArea > gsBoundsArea * 1.15) {
                            const unionXMin = Math.min(dtfBounds.xMin, alphaXMin);
                            const unionYMin = Math.min(dtfBounds.yMin, alphaYMinPdf);
                            const unionXMax = Math.max(dtfBounds.xMax, alphaXMin + alphaW);
                            const unionYMax = Math.max(dtfBounds.yMax, alphaYMinPdf + alphaH);
                            const unionW = unionXMax - unionXMin;
                            const unionH = unionYMax - unionYMin;
                            (file as any).originalPdfBounds = {
                              xMin: unionXMin, yMin: unionYMin,
                              xMax: unionXMax, yMax: unionYMax,
                              width: unionW, height: unionH,
                              widthMm: unionW * 0.352778,
                              heightMm: unionH * 0.352778
                            };
                            console.log(`⚠️ DTF GS bbox missed white content — expanded: ${(unionW * 0.352778).toFixed(1)}×${(unionH * 0.352778).toFixed(1)}mm`);
                          }
                        }
                      }
                    } catch (alphaTrimErr) {
                      console.log(`⚠️ DTF alpha-trim check failed (non-critical):`, alphaTrimErr);
                    }
                  }

                  const dtfBoundsForCrop = (file as any).originalPdfBounds;
                  if (dtfBoundsForCrop && dtfBoundsForCrop.xMin !== undefined) {
                    try {
                      const identifyOut2 = execSync(`identify -format "%w %h" "${pngPath}"`, { encoding: 'utf8', timeout: 5000 }).trim();
                      const [pngW, pngH] = identifyOut2.split(' ').map(Number);
                      if (pngW > 0 && pngH > 0 && dtfPageWidthPts > 0 && dtfPageHeightPts > 0) {
                        const scaleX = pngW / dtfPageWidthPts;
                        const scaleY = pngH / dtfPageHeightPts;
                        const cropX = Math.max(0, Math.floor(dtfBoundsForCrop.xMin * scaleX));
                        const cropYFromBottom = dtfBoundsForCrop.yMin * scaleY;
                        const cropW = Math.ceil(dtfBoundsForCrop.width * scaleX);
                        const cropH = Math.ceil(dtfBoundsForCrop.height * scaleY);
                        const cropY = Math.max(0, Math.floor(pngH - cropYFromBottom - cropH));
                        
                        const contentPageRatio = (dtfBoundsForCrop.width * dtfBoundsForCrop.height) / (dtfPageWidthPts * dtfPageHeightPts);
                        if (contentPageRatio < 0.90 && cropW > 10 && cropH > 10) {
                          console.log(`✂️ DTF cropping PNG to content: ${cropW}×${cropH}px at (${cropX},${cropY}) from ${pngW}×${pngH}px`);
                          const croppedPath = pngPath + '.crop.png';
                          await execAsync(`convert "${pngPath}" -crop ${cropW}x${cropH}+${cropX}+${cropY} +repage "${croppedPath}"`, { timeout: 15000 });
                          if (fs.existsSync(croppedPath) && fs.statSync(croppedPath).size > 0) {
                            fs.unlinkSync(pngPath);
                            fs.renameSync(croppedPath, pngPath);
                            console.log(`✅ DTF PNG cropped to content bounds`);
                          }
                        } else {
                          console.log(`📐 DTF content covers ${(contentPageRatio * 100).toFixed(0)}% of page — no crop needed`);
                        }
                      }
                    } catch (cropErr) {
                      console.log(`⚠️ DTF PNG crop failed (non-critical):`, cropErr);
                    }
                  }

                  // Resize to max 2000px on the longest side for performance
                  try {
                    const resizedPath = pngPath + '.r.png';
                    await execAsync(`convert "${pngPath}" -resize 2000x2000 "${resizedPath}"`, { timeout: 15000 });
                    if (fs.existsSync(resizedPath)) { fs.unlinkSync(pngPath); fs.renameSync(resizedPath, pngPath); }
                  } catch {}

                  (file as any).originalPdfPath = pdfPath;
                  (file as any).isCMYKPreserved = hasCMYK;
                  (file as any).isComplexFilePngFallback = true;
                  finalFilename = pngFilename;
                  finalMimeType = 'image/png';
                  finalUrl = `/uploads/${pngFilename}`;
                  console.log(`✅ Large format DTF PNG preview created: ${pngFilename} (original PDF preserved for output)`);
                } else {
                  // Primary render produced nothing — try emergency 72 DPI low-quality fallback
                  console.log(`⚠️ 96 DPI render failed — retrying at 72 DPI emergency fallback`);
                  try {
                    const emergencyCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r72 -dMaxBitmap=80000000 -sOutputFile="${pngPath}" "${pdfPath}"`;
                    await execAsync(emergencyCmd, { timeout: 25000, killSignal: 'SIGKILL' });
                    if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                      try {
                        const resizedPath = pngPath + '.r.png';
                        await execAsync(`convert "${pngPath}" -resize 1200x1200 "${resizedPath}"`, { timeout: 10000 });
                        if (fs.existsSync(resizedPath)) { fs.unlinkSync(pngPath); fs.renameSync(resizedPath, pngPath); }
                      } catch {}
                      (file as any).originalPdfPath = pdfPath;
                      (file as any).isCMYKPreserved = hasCMYK;
                      (file as any).isComplexFilePngFallback = true;
                      finalFilename = pngFilename;
                      finalMimeType = 'image/png';
                      finalUrl = `/uploads/${pngFilename}`;
                      console.log(`✅ Emergency 72 DPI DTF PNG created: ${pngFilename}`);
                    } else {
                      console.log(`⚠️ Emergency fallback also failed — keeping raw PDF`);
                    }
                  } catch (emergencyErr) {
                    console.error(`❌ Emergency DTF PNG fallback failed:`, emergencyErr);
                  }
                }
              } catch (dtfPngErr) {
                console.error(`❌ DTF PNG preview failed:`, dtfPngErr);
                // Try emergency fallback on primary exception too
                try {
                  const emergencyCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r72 -dMaxBitmap=80000000 -sOutputFile="${pngPath}" "${pdfPath}"`;
                  await execAsync(emergencyCmd, { timeout: 25000, killSignal: 'SIGKILL' });
                  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                    try {
                      const resizedPath = pngPath + '.r.png';
                      await execAsync(`convert "${pngPath}" -resize 1200x1200 "${resizedPath}"`, { timeout: 10000 });
                      if (fs.existsSync(resizedPath)) { fs.unlinkSync(pngPath); fs.renameSync(resizedPath, pngPath); }
                    } catch {}
                    (file as any).originalPdfPath = pdfPath;
                    (file as any).isCMYKPreserved = hasCMYK;
                    (file as any).isComplexFilePngFallback = true;
                    finalFilename = pngFilename;
                    finalMimeType = 'image/png';
                    finalUrl = `/uploads/${pngFilename}`;
                    console.log(`✅ Exception-path emergency 72 DPI DTF PNG created: ${pngFilename}`);
                  }
                } catch {}
              }
            } else if (hasCMYK) {
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
                
                // Run with a 30-second timeout — complex vectors (glitter, fine-detail) will kill pdf2svg.
                // Any failure here falls through to the PNG fallback in the else branch below.
                try {
                  await execAsync(svgCommand, { timeout: 30000 });
                } catch (pdf2svgErr: any) {
                  console.log(`⚠️ pdf2svg failed/killed for CMYK file (likely too complex) — will use PNG fallback. Error: ${pdf2svgErr?.message || pdf2svgErr}`);
                  // Delete any partial/empty SVG so the else branch triggers
                  if (fs.existsSync(svgPath)) try { fs.unlinkSync(svgPath); } catch {}
                }
                
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
                      
                      // CRITICAL: Extract PDF bounds and page dimensions BEFORE creating PNG
                      let isFullPageTemplate = false;
                      try {
                        // Get PDF page dimensions first
                        const { PDFDocument: PDFDocComplex } = await import('pdf-lib');
                        const complexPdfBytes = fs.readFileSync(pdfPath);
                        const complexPdfDoc = await PDFDocComplex.load(complexPdfBytes);
                        const [complexPage] = complexPdfDoc.getPages();
                        const complexPageSize = complexPage.getSize();
                        const pageWidthMm = complexPageSize.width * 0.352778;
                        const pageHeightMm = complexPageSize.height * 0.352778;
                        
                        // Check if PDF page matches template dimensions (within 5mm tolerance)
                        const uploadTemplateSize = templateSizes.find(t => t.id === project.templateSize);
                        if (uploadTemplateSize) {
                          const matchesDirect = Math.abs(pageWidthMm - uploadTemplateSize.width) < 5 && 
                                               Math.abs(pageHeightMm - uploadTemplateSize.height) < 5;
                          const matchesRotated = Math.abs(pageWidthMm - uploadTemplateSize.height) < 5 && 
                                                Math.abs(pageHeightMm - uploadTemplateSize.width) < 5;
                          if (matchesDirect || matchesRotated) {
                            isFullPageTemplate = true;
                            console.log(`📄 FULL-PAGE MATCH: PDF page ${pageWidthMm.toFixed(0)}×${pageHeightMm.toFixed(0)}mm matches template ${uploadTemplateSize.width}×${uploadTemplateSize.height}mm`);
                            console.log(`📄 Pre-imposed artwork - using full page dimensions, no cropping`);
                            (file as any).originalPdfBounds = {
                              xMin: 0,
                              yMin: 0,
                              xMax: complexPageSize.width,
                              yMax: complexPageSize.height,
                              width: complexPageSize.width,
                              height: complexPageSize.height,
                              widthMm: pageWidthMm,
                              heightMm: pageHeightMm
                            };
                            (file as any).isFullPageTemplate = true;
                          }
                        }
                        
                        if (!isFullPageTemplate) {
                          const bboxCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=bbox -f "${pdfPath}" 2>&1`;
                          const bboxResult = await execAsync(bboxCommand, { maxBuffer: 5 * 1024 * 1024 });
                          const bboxOutput = bboxResult.stderr || bboxResult.stdout || '';
                          
                          const hiresMatch = bboxOutput.match(/%%HiResBoundingBox:\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
                          if (hiresMatch) {
                            const [, xMin, yMin, xMax, yMax] = hiresMatch.map(parseFloat);
                            let widthPt = xMax - xMin;
                            let heightPt = yMax - yMin;
                            let finalXMin = xMin, finalYMin = yMin, finalXMax = xMax, finalYMax = yMax;
                            
                            console.log(`📐 Complex file GS bbox: ${(widthPt * 0.352778).toFixed(1)}mm x ${(heightPt * 0.352778).toFixed(1)}mm`);
                            
                            const pageArea = complexPageSize.width * complexPageSize.height;
                            const gsArea = widthPt * heightPt;
                            if (gsArea / pageArea < 0.90) {
                              (file as any)._needsAlphaTrimCheck = true;
                              (file as any)._alphaTrimPageSize = complexPageSize;
                            }
                            
                            (file as any).originalPdfBounds = {
                              xMin: finalXMin,
                              yMin: finalYMin,
                              xMax: finalXMax,
                              yMax: finalYMax,
                              width: widthPt,
                              height: heightPt,
                              widthMm: widthPt * 0.352778,
                              heightMm: heightPt * 0.352778
                            };
                          }
                        }
                      } catch (bboxError) {
                        console.log(`⚠️ Could not extract PDF bounds for complex file: ${bboxError}`);
                      }
                      
                      // Create PNG preview for canvas display
                      const pngFilename = `${file.filename}_preview.png`;
                      const pngPath = path.join(uploadDir, pngFilename);
                      
                      try {
                        const smartDPI = getSmartPreviewDPI(pdfPath);
                        const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r${smartDPI} -dMaxBitmap=80000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                        // CRITICAL: async exec — GS PDF→PNG render with 120s timeout was a major event-loop blocker.
                        await execAsyncRaw(gsCommand, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 });
                        
                        if ((file as any)._needsAlphaTrimCheck && (file as any).originalPdfBounds && (file as any)._alphaTrimPageSize) {
                          try {
                            const atPageSize = (file as any)._alphaTrimPageSize;
                            const atBounds = (file as any).originalPdfBounds;
                            const idOut = execSync(`identify -format "%w %h" "${pngPath}"`, { encoding: 'utf8', timeout: 5000 }).trim();
                            const [atPngW, atPngH] = idOut.split(/\s+/).map(Number);
                            if (atPngW > 0 && atPngH > 0) {
                              const atTrimInfo = execSync(`convert "${pngPath}" -trim -format "%w %h %X %Y" info:`, { encoding: 'utf8', timeout: 5000 }).trim();
                              const atParts = atTrimInfo.split(/\s+/).map(Number);
                              if (atParts.length >= 4 && atParts[0] > 0 && atParts[1] > 0) {
                                const scX = atPageSize.width / atPngW;
                                const scY = atPageSize.height / atPngH;
                                const aW = atParts[0] * scX;
                                const aH = atParts[1] * scY;
                                const aXMin = Math.abs(atParts[2]) * scX;
                                const aYTop = Math.abs(atParts[3]) * scY;
                                const aYMinPdf = atPageSize.height - aYTop - aH;
                                const gArea = atBounds.width * atBounds.height;
                                const aArea = aW * aH;
                                console.log(`🔍 Alpha-trim: ${(aW * 0.352778).toFixed(1)}×${(aH * 0.352778).toFixed(1)}mm vs GS: ${atBounds.widthMm.toFixed(1)}×${atBounds.heightMm.toFixed(1)}mm`);
                                if (aArea > gArea * 1.15) {
                                  const uXMin = Math.min(atBounds.xMin, aXMin);
                                  const uYMin = Math.min(atBounds.yMin, aYMinPdf);
                                  const uXMax = Math.max(atBounds.xMax, aXMin + aW);
                                  const uYMax = Math.max(atBounds.yMax, aYMinPdf + aH);
                                  const uW = uXMax - uXMin, uH = uYMax - uYMin;
                                  (file as any).originalPdfBounds = {
                                    xMin: uXMin, yMin: uYMin, xMax: uXMax, yMax: uYMax,
                                    width: uW, height: uH, widthMm: uW * 0.352778, heightMm: uH * 0.352778
                                  };
                                  console.log(`⚠️ GS bbox missed white content — expanded: ${(uW * 0.352778).toFixed(1)}×${(uH * 0.352778).toFixed(1)}mm`);
                                }
                              }
                            }
                          } catch (atErr) {
                            console.log(`⚠️ Deferred alpha-trim check failed (non-critical):`, atErr);
                          }
                        }

                        const pdfBounds = (file as any).originalPdfBounds;
                        if (!isFullPageTemplate && pdfBounds && (pdfBounds.xMin > 5 || pdfBounds.yMin > 5)) {
                          try {
                            const dpi = 150;
                            const scale = dpi / 72; // Convert from pts to pixels at render DPI
                            const cropX = Math.floor(pdfBounds.xMin * scale);
                            const cropY = 0; // GS renders top-down, so we need to calculate from top
                            const cropW = Math.ceil(pdfBounds.width * scale);
                            const cropH = Math.ceil(pdfBounds.height * scale);
                            
                            // Get actual PNG dimensions to calculate Y offset
                            const identifyResult = execSync(`identify -format "%w %h" "${pngPath}"`, { encoding: 'utf8', timeout: 10000 }).trim();
                            const [pngW, pngH] = identifyResult.split(' ').map(Number);
                            
                            // PDF coords: yMin is from bottom, for PNG (top-down): cropY = pngH - (yMax * scale)
                            const cropYFromTop = Math.max(0, Math.floor(pngH - pdfBounds.yMax * scale));
                            
                            console.log(`✂️ Cropping PNG to content area: ${cropW}×${cropH}px at (${cropX}, ${cropYFromTop}) from ${pngW}×${pngH}px`);
                            const croppedPath = pngPath + '.cropped.png';
                            execSync(`convert "${pngPath}" -crop ${cropW}x${cropH}+${cropX}+${cropYFromTop} +repage "${croppedPath}"`, { timeout: 30000 });
                            
                            if (fs.existsSync(croppedPath) && fs.statSync(croppedPath).size > 100) {
                              fs.renameSync(croppedPath, pngPath);
                              console.log(`✅ PNG cropped to content bounds: ${cropW}×${cropH}px`);
                            } else {
                              console.log(`⚠️ Cropped PNG invalid, keeping full page`);
                              if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
                            }
                          } catch (cropErr) {
                            console.log(`⚠️ PNG crop failed, keeping full page:`, cropErr);
                          }
                        }
                        
                        if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                          const pngBuffer = fs.readFileSync(pngPath);
                          const pngSignature = pngBuffer.slice(0, 8).toString('hex');
                          const isValidPng = pngSignature === '89504e470d0a1a0a';
                          console.log(`🔍 PNG validation: signature=${pngSignature}, valid=${isValidPng}`);
                          
                          if (!isValidPng) {
                            console.log(`⚠️ PNG corrupted, regenerating...`);
                            // CRITICAL: async exec — don't block event loop on regen.
                            await execAsyncRaw(`gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r96 -dMaxBitmap=80000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 });
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
                          suggestion: 'This file is too complex to process automatically. Please simplify the artwork and try again.'
                        });
                        return;
                      }
                    } else {
                      console.log(`🚫 File too complex AND over 50MB (${fileSizeMB.toFixed(1)}MB) - requires simplification`);
                      res.status(413).json({ 
                        error: 'file_too_complex',
                        message: 'This file is too complex for automated processing',
                        details: complexityCheck.reason,
                        estimatedPaths: complexityCheck.estimatedPathCount,
                        estimatedElements: complexityCheck.estimatedElementCount,
                        originalFileSizeMB: fileSizeMB,
                        convertedFileSizeMB: complexityCheck.convertedFileSizeMB,
                        originalFileName: file.filename,
                        suggestion: 'This file is too complex and too large to process automatically. Please simplify the artwork and try again.'
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
                  // SVG missing or empty (pdf2svg was killed/failed) — render PNG directly from PDF
                  console.log(`📸 pdf2svg produced no SVG — rendering PNG preview from PDF for canvas display`);
                  const pngFilename = `${file.filename}_preview.png`;
                  const pngPath = path.join(uploadDir, pngFilename);
                  
                  try {
                    // First try to get PDF page dimensions for proper sizing
                    try {
                      const { PDFDocument: PDFDocFallback } = await import('pdf-lib');
                      const fallbackPdfBytes = fs.readFileSync(pdfPath);
                      const fallbackPdfDoc = await PDFDocFallback.load(fallbackPdfBytes);
                      const [fallbackPage] = fallbackPdfDoc.getPages();
                      const fallbackPageSize = fallbackPage.getSize();
                      (file as any).originalPdfBounds = {
                        xMin: 0, yMin: 0,
                        xMax: fallbackPageSize.width, yMax: fallbackPageSize.height,
                        width: fallbackPageSize.width, height: fallbackPageSize.height,
                        widthMm: fallbackPageSize.width * 0.352778,
                        heightMm: fallbackPageSize.height * 0.352778
                      };
                      console.log(`📐 PDF page size: ${(fallbackPageSize.width * 0.352778).toFixed(0)}×${(fallbackPageSize.height * 0.352778).toFixed(0)}mm`);
                    } catch (sizeErr) {
                      console.log(`⚠️ Could not read PDF page size: ${sizeErr}`);
                    }

                    const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r96 -dMaxBitmap=80000000 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                    await execAsync(gsCmd, { timeout: 40000, killSignal: 'SIGKILL' });
                    
                    if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                      // Resize to max 2000px to keep it manageable
                      try {
                        const resizedPath = pngPath + '.r.png';
                        await execAsync(`convert "${pngPath}" -resize 2000x2000 "${resizedPath}"`, { timeout: 15000 });
                        if (fs.existsSync(resizedPath)) { fs.unlinkSync(pngPath); fs.renameSync(resizedPath, pngPath); }
                      } catch {}

                      (file as any).originalPdfPath = pdfPath;
                      (file as any).isCMYKPreserved = true;
                      (file as any).isComplexFilePngFallback = true;
                      finalFilename = pngFilename;
                      finalMimeType = 'image/png';
                      finalUrl = `/uploads/${pngFilename}`;
                      console.log(`✅ PNG fallback created for complex CMYK PDF: ${pngFilename}`);
                    } else {
                      console.log(`⚠️ PNG fallback also produced empty file — file will show as PDF`);
                    }
                  } catch (pngFallbackErr) {
                    console.error(`❌ PNG fallback failed:`, pngFallbackErr);
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
              
              // 30-second timeout — complex vectors will OOM-kill pdf2svg.
              // Failure here falls through to the PNG fallback branch below.
              try {
                await execAsync(svgCommand, { timeout: 30000 });
              } catch (pdf2svgErr: any) {
                console.log(`⚠️ pdf2svg failed/killed for RGB file (likely too complex) — will use PNG fallback. Error: ${pdf2svgErr?.message || pdf2svgErr}`);
                if (fs.existsSync(svgPath)) try { fs.unlinkSync(svgPath); } catch {}
              }
              
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
                        let widthPt = xMax - xMin;
                        let heightPt = yMax - yMin;
                        let finalXMin = xMin, finalYMin = yMin, finalXMax = xMax, finalYMax = yMax;
                        
                        console.log(`📐 Complex RGB file GS bbox: ${(widthPt * 0.352778).toFixed(1)}mm x ${(heightPt * 0.352778).toFixed(1)}mm`);
                        
                        try {
                          const { PDFDocument: PDFDocRgb } = await import('pdf-lib');
                          const rgbPdfBytes = fs.readFileSync(pdfPath);
                          const rgbPdfDoc = await PDFDocRgb.load(rgbPdfBytes);
                          const rgbPage = rgbPdfDoc.getPages()[0];
                          const rgbPageSize = rgbPage.getSize();
                          const rgbPageArea = rgbPageSize.width * rgbPageSize.height;
                          const gsArea = widthPt * heightPt;
                          if (gsArea / rgbPageArea < 0.90) {
                            (file as any)._needsAlphaTrimCheck = true;
                            (file as any)._alphaTrimPageSize = rgbPageSize;
                          }
                        } catch (alphaErr) {
                          console.log(`⚠️ RGB page size check failed (non-critical):`, alphaErr);
                        }
                        
                        (file as any).originalPdfBounds = {
                          xMin: finalXMin,
                          yMin: finalYMin,
                          xMax: finalXMax,
                          yMax: finalYMax,
                          width: widthPt,
                          height: heightPt,
                          widthMm: widthPt * 0.352778,
                          heightMm: heightPt * 0.352778
                        };
                      }
                    } catch (bboxError) {
                      console.log(`⚠️ Could not extract PDF bounds for complex RGB file: ${bboxError}`);
                    }
                    
                    // Create PNG preview for canvas display
                    const pngFilename = `${file.filename}_preview.png`;
                    const pngPath = path.join(uploadDir, pngFilename);
                    
                    try {
                      const smartDPI2 = getSmartPreviewDPI(pdfPath);
                      const gsCommand = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r${smartDPI2} -dMaxBitmap=80000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                      // CRITICAL: async exec — RGB PDF→PNG render path
                      await execAsyncRaw(gsCommand, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 });
                      
                      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                        const pngBuffer = fs.readFileSync(pngPath);
                        const pngSignature = pngBuffer.slice(0, 8).toString('hex');
                        const isValidPng = pngSignature === '89504e470d0a1a0a';
                        console.log(`🔍 PNG validation (RGB): signature=${pngSignature}, valid=${isValidPng}`);
                        
                        if (!isValidPng) {
                          console.log(`⚠️ PNG corrupted, regenerating...`);
                          // CRITICAL: async exec — don't block event loop on regen.
                          await execAsyncRaw(`gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r96 -dMaxBitmap=80000000 -dAlignToPixels=0 -dGridFitTT=2 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`, { timeout: 120000, maxBuffer: 1024 * 1024 * 50 });
                        }

                        if ((file as any)._needsAlphaTrimCheck && (file as any).originalPdfBounds && (file as any)._alphaTrimPageSize) {
                          try {
                            const atPS = (file as any)._alphaTrimPageSize;
                            const atB = (file as any).originalPdfBounds;
                            const idR = execSync(`identify -format "%w %h" "${pngPath}"`, { encoding: 'utf8', timeout: 5000 }).trim();
                            const [aPW, aPH] = idR.split(/\s+/).map(Number);
                            if (aPW > 0 && aPH > 0) {
                              const atInfo = execSync(`convert "${pngPath}" -trim -format "%w %h %X %Y" info:`, { encoding: 'utf8', timeout: 5000 }).trim();
                              const aP = atInfo.split(/\s+/).map(Number);
                              if (aP.length >= 4 && aP[0] > 0 && aP[1] > 0) {
                                const sX = atPS.width / aPW, sY = atPS.height / aPH;
                                const aW2 = aP[0] * sX, aH2 = aP[1] * sY;
                                const aX2 = Math.abs(aP[2]) * sX, aYT2 = Math.abs(aP[3]) * sY;
                                const aYP2 = atPS.height - aYT2 - aH2;
                                const gA2 = atB.width * atB.height, aA2 = aW2 * aH2;
                                console.log(`🔍 RGB alpha-trim: ${(aW2 * 0.352778).toFixed(1)}×${(aH2 * 0.352778).toFixed(1)}mm vs GS: ${atB.widthMm.toFixed(1)}×${atB.heightMm.toFixed(1)}mm`);
                                if (aA2 > gA2 * 1.15) {
                                  const uX = Math.min(atB.xMin, aX2), uY = Math.min(atB.yMin, aYP2);
                                  const uXM = Math.max(atB.xMax, aX2 + aW2), uYM = Math.max(atB.yMax, aYP2 + aH2);
                                  const uW2 = uXM - uX, uH2 = uYM - uY;
                                  (file as any).originalPdfBounds = {
                                    xMin: uX, yMin: uY, xMax: uXM, yMax: uYM,
                                    width: uW2, height: uH2, widthMm: uW2 * 0.352778, heightMm: uH2 * 0.352778
                                  };
                                  console.log(`⚠️ GS bbox missed white content (RGB) — expanded: ${(uW2 * 0.352778).toFixed(1)}×${(uH2 * 0.352778).toFixed(1)}mm`);
                                }
                              }
                            }
                          } catch (atRgbErr) {
                            console.log(`⚠️ RGB deferred alpha-trim failed (non-critical):`, atRgbErr);
                          }
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
                        suggestion: 'This file is too complex to process automatically. Please simplify the artwork and try again.'
                      });
                      return;
                    }
                  } else {
                    console.log(`🚫 RGB file too complex AND over 50MB (${fileSizeMB.toFixed(1)}MB) - requires simplification`);
                    res.status(413).json({ 
                      error: 'file_too_complex',
                      message: 'This file is too complex for automated processing',
                      details: complexityCheck.reason,
                      estimatedPaths: complexityCheck.estimatedPathCount,
                      estimatedElements: complexityCheck.estimatedElementCount,
                      originalFileSizeMB: fileSizeMB,
                      convertedFileSizeMB: complexityCheck.convertedFileSizeMB,
                      originalFileName: file.filename,
                      suggestion: 'This file is too complex and too large to process automatically. Please simplify the artwork and try again.'
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
              } else {
                // SVG missing/empty after pdf2svg failure — render PNG fallback directly
                console.log(`📸 No SVG from pdf2svg for RGB file — rendering PNG preview`);
                const pngFilename = `${file.filename}_preview.png`;
                const pngPath = path.join(uploadDir, pngFilename);
                try {
                  // Get PDF page size for proper canvas sizing
                  try {
                    const { PDFDocument: PDFDocRGB } = await import('pdf-lib');
                    const rgbPdfBytes = fs.readFileSync(pdfPath);
                    const rgbPdfDoc = await PDFDocRGB.load(rgbPdfBytes);
                    const [rgbPage] = rgbPdfDoc.getPages();
                    const rgbPageSize = rgbPage.getSize();
                    (file as any).originalPdfBounds = {
                      xMin: 0, yMin: 0,
                      xMax: rgbPageSize.width, yMax: rgbPageSize.height,
                      width: rgbPageSize.width, height: rgbPageSize.height,
                      widthMm: rgbPageSize.width * 0.352778,
                      heightMm: rgbPageSize.height * 0.352778
                    };
                  } catch {}

                  const smartDPI3 = getSmartPreviewDPI(pdfPath);
                  const gsCmd = `gs -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r${smartDPI3} -dMaxBitmap=80000000 -dTextAlphaBits=4 -dGraphicsAlphaBits=4 -sOutputFile="${pngPath}" "${pdfPath}"`;
                  await execAsync(gsCmd, { timeout: 60000 });

                  if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
                    try {
                      const resizedPath = pngPath + '.r.png';
                      await execAsync(`convert "${pngPath}" -resize 2000x2000 "${resizedPath}"`, { timeout: 15000 });
                      if (fs.existsSync(resizedPath)) { fs.unlinkSync(pngPath); fs.renameSync(resizedPath, pngPath); }
                    } catch {}

                    (file as any).originalPdfPath = pdfPath;
                    (file as any).isComplexFilePngFallback = true;
                    finalFilename = pngFilename;
                    finalMimeType = 'image/png';
                    finalUrl = `/uploads/${pngFilename}`;
                    console.log(`✅ PNG fallback created for complex RGB PDF: ${pngFilename}`);
                  }
                } catch (rgbPngErr) {
                  console.error(`❌ PNG fallback failed for RGB PDF:`, rgbPngErr);
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
        // IMPORTANT: Skip all expensive analysis for large format DTF — the file is already
        // handled (PNG preview created); running pdf2svg/GS on it crashes the production server.
        const filePath = path.join(uploadDir, file.filename);
        const skipPreflight = isLargeFormatDTF || shouldSkipNonEssential();
        const preflightResult = skipPreflight
          ? {
              colorSpaceDetected: (file as any).isCMYKPreserved ? 'CMYK' : 'RGB',
              hasRasterContent: false,
              hasVectorContent: true,
              isMixedContent: false,
              contentBounds: (file as any).originalPdfBounds || null,
              colorsDetected: [],
              requiresVectorization: false,
              warnings: [] as string[],
            }
          : await productionFlow.runPreflightCheck(filePath, file.mimetype);
        
        console.log('🔍 Production Preflight:', {
          file: file.filename,
          colorSpace: preflightResult.colorSpaceDetected,
          requiresVectorization: preflightResult.requiresVectorization,
          hasRaster: preflightResult.hasRasterContent,
          hasVector: preflightResult.hasVectorContent,
          warnings: preflightResult.warnings.length,
          skipped: isLargeFormatDTF ? 'large-format-DTF' : skipPreflight ? 'memory-pressure' : false
        });

        // For PDFs, analyze the original PDF file before conversion
        // Skip for large format DTF — pdf2svg on these files crashes the server
        // Skip when container memory is high to prevent OOM
        if (file.mimetype === 'application/pdf' && !isLargeFormatDTF && !shouldSkipNonEssential()) {
          const originalPdfPath = path.join(uploadDir, file.filename);
          const contentAnalysis = await MixedContentDetector.analyzeFile(originalPdfPath, file.mimetype);
          
          console.log(`📊 Content analysis for ${file.filename}:`, {
            hasRaster: contentAnalysis.hasRasterContent,
            hasVector: contentAnalysis.hasVectorContent,
            isMixed: contentAnalysis.isMixedContent,
            rasterCount: contentAnalysis.rasterImages.count,
            vectorTypes: contentAnalysis.vectorElements.types,
            recommendation: contentAnalysis.recommendation,
            hasLowResImages: contentAnalysis.hasLowResImages || false,
            lowestDpi: contentAnalysis.lowestDpi || null,
            embeddedImageCount: contentAnalysis.embeddedImages?.length || 0
          });
          if (contentAnalysis.embeddedImages && contentAnalysis.embeddedImages.length > 0) {
            (file as any).embeddedImageData = {
              images: contentAnalysis.embeddedImages,
              hasLowResImages: contentAnalysis.hasLowResImages || false,
              lowestDpi: contentAnalysis.lowestDpi || null,
            };
          }
          
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
          // For re-uploaded order PDFs (hasGarmentPages=true), treat as raster even when vectors
          // are detected — those vectors are from app-generated garment text pages, not the artwork.
          const isRasterArtwork = contentAnalysis.hasRasterContent &&
            (!contentAnalysis.hasVectorContent || (file as any).hasGarmentPages);
          if (isRasterArtwork) {
            // PDF contains raster artwork (either raster-only, or multi-page order PDF)
            console.log(`📷 PDF contains raster artwork (hasGarmentPages=${(file as any).hasGarmentPages}) - extracting PNG for canvas display`);
            
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
        } else if (fileType === FileType.VECTOR_SVG && !shouldSkipNonEssential()) {
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
                
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                const svgContentForSize = fs.readFileSync(svgPath, 'utf-8');
                // Detect broken PDF compositing-group filter refs that neither rsvg nor inkscape can render.
                // When present, skip straight to the post-normalization Ghostscript→PDF fallback path
                // (which will run later and render the original PDF directly). Trying rsvg/inkscape here
                // wastes ~15-30s, produces 50+ "SPFeImage::reread_href failed" warnings, and burns RAM
                // on per-failed-href raster surface allocations — a known contributor to OOM pressure.
                const hasBrokenCompositingGroups = /compositing-group-\d+/.test(svgContentForSize);
                if (hasBrokenCompositingGroups) {
                  console.log(`⏭️ Skipping upload-time rsvg/inkscape PNG fallback — SVG contains broken PDF compositing-group refs; deferring to Ghostscript→original-PDF fallback path`);
                  throw new Error('DEFER_TO_GHOSTSCRIPT_FALLBACK');
                }
                try {
                  const svgWidthMatch = svgContentForSize.match(/width="([^"]+)"/);
                  const svgHeightMatch = svgContentForSize.match(/height="([^"]+)"/);
                  const svgW = svgWidthMatch ? parseFloat(svgWidthMatch[1]) : 200;
                  const svgH = svgHeightMatch ? parseFloat(svgHeightMatch[1]) : 200;
                  const pngScale = 4;
                  const pngW = Math.round(svgW * pngScale);
                  const pngH = Math.round(svgH * pngScale);
                  console.log(`📐 PNG fallback: SVG ${svgW}×${svgH}px → PNG ${pngW}×${pngH}px (${pngScale}x scale)`);
                  await execAsync(`rsvg-convert "${svgPath}" -o "${pngPath}" -w ${pngW} -h ${pngH}`, { 
                    timeout: 30000,
                    killSignal: 'SIGKILL'
                  });
                  console.log(`✅ PNG fallback generated using rsvg-convert: ${pngFilename}`);
                } catch (rsvgError) {
                  console.log(`⚠️ rsvg-convert failed, trying Inkscape...`);
                  await execAsync(`inkscape "${svgPath}" --export-filename="${pngPath}" --export-dpi=150`, {
                    timeout: 15000,
                    killSignal: 'SIGKILL'
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
                    // CRITICAL: async exec — these inkscape queries can block the event loop
                    // for 10-20s on complex SVGs and were responsible for production crashes.
                    const inkscapeWidth = (await execAsyncRaw(`timeout 10 inkscape --query-width "${svgPath}" 2>/dev/null`, { encoding: 'utf8' as any })).stdout.toString().trim();
                    const inkscapeHeight = (await execAsyncRaw(`timeout 10 inkscape --query-height "${svgPath}" 2>/dev/null`, { encoding: 'utf8' as any })).stdout.toString().trim();
                    
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
          // Multi-page order PDFs (re-uploads): CMYK/vector content detected from garment text pages
          // should NOT contaminate the artwork analysis — artwork is on page 1 only.
          isCMYKPreserved: (file as any).hasGarmentPages ? false : ((file as any).isCMYKPreserved || false),
          isPdfWithRasterOnly: (file as any).isPdfWithRasterOnly || false,
          // PRODUCTION FLOW: Add preflight results
          preflightData: {
            colorSpaceDetected: (file as any).hasGarmentPages ? 'RGB' : preflightResult.colorSpaceDetected,
            hasRasterContent: (file as any).hasGarmentPages
              ? !preflightResult.hasVectorContent || preflightResult.hasRasterContent
              : preflightResult.hasRasterContent,
            hasVectorContent: (file as any).hasGarmentPages ? false : preflightResult.hasVectorContent,
            isMixedContent: (file as any).hasGarmentPages ? false : preflightResult.isMixedContent,
            contentBounds: preflightResult.contentBounds,
            colorsDetected: preflightResult.colorsDetected,
            requiresVectorization: preflightResult.requiresVectorization,
            warnings: preflightResult.warnings,
            originalColorsPreserved: true,
            embeddedImageData: (file as any).embeddedImageData || null
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
        
        // REORDER DETECTION: Add detected garment colors from PDF footer
        if ((file as any).detectedGarmentColors) {
          logoData.detectedGarmentColors = (file as any).detectedGarmentColors;
          console.log(`🎨 Detected garment colors attached to logo:`, logoData.detectedGarmentColors);
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

        // Fire-and-forget: back up all files created for this logo to Dropbox.
        // This ensures files survive redeployment — they will be transparently
        // restored from Dropbox if the local ./uploads directory is wiped.
        const filesToBackup = new Set<string>();
        if (file.filename) filesToBackup.add(file.filename);
        if (finalFilename && finalFilename !== file.filename) filesToBackup.add(finalFilename);
        if (logoData.originalFilename && logoData.originalFilename !== file.filename) filesToBackup.add(logoData.originalFilename);
        if ((logoData as any).canvasFallbackFilename) filesToBackup.add((logoData as any).canvasFallbackFilename);
        if ((file as any).extractedRasterPath) filesToBackup.add(path.basename((file as any).extractedRasterPath));

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
        let displayWidth = 100; // Default fallback, will be overridden by bounds detection
        let displayHeight = 100; // Default fallback, will be overridden by bounds detection
        
        // Store original PDF content bounds for cropping during PDF generation
        // These are the ORIGINAL coordinates BEFORE normalization - needed to crop original PDF
        let originalPdfBounds: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number; units: string } | null = null;
        
        // Track normalized content bounds (set during tight crop for raw SVGs) for saving to DB
        let normalizedBoundsForSave: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number; units: string } | null = null;

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
        } else if (!isDirectRasterUpload && (file as any).extractedPngWidth && (file as any).extractedPngHeight) {
          // For extracted PNGs with stored dimensions, check if we have original PDF path
          // NOTE: isDirectRasterUpload already set correct displayWidth/displayHeight from embedded DPI — don't override
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
                  
                  // Check for ArtBox (Illustrator artboard) or TrimBox — these define intended output area
                  let artBoxPts: { x: number; y: number; width: number; height: number } | null = null;
                  try {
                    const artBox = firstPage.getArtBox();
                    // Only use ArtBox if it's meaningfully smaller than MediaBox (not just a fallback copy)
                    const wDiff = Math.abs(artBox.width - pageWidth);
                    const hDiff = Math.abs(artBox.height - pageHeight);
                    if (artBox.width > 10 && artBox.height > 10 && (wDiff > 5 || hDiff > 5)) {
                      artBoxPts = artBox;
                      const pxToMmArt = 1 / 2.834645669;
                      console.log(`🎨 ArtBox found: (${artBox.x.toFixed(1)}, ${artBox.y.toFixed(1)}) ${artBox.width.toFixed(1)}×${artBox.height.toFixed(1)}pts = ${(artBox.width * pxToMmArt).toFixed(1)}×${(artBox.height * pxToMmArt).toFixed(1)}mm`);
                    }
                  } catch {}
                  try {
                    const trimBox = firstPage.getTrimBox();
                    const wDiff = Math.abs(trimBox.width - pageWidth);
                    const hDiff = Math.abs(trimBox.height - pageHeight);
                    if (!artBoxPts && trimBox.width > 10 && trimBox.height > 10 && (wDiff > 5 || hDiff > 5)) {
                      artBoxPts = trimBox;
                      const pxToMmTrim = 1 / 2.834645669;
                      console.log(`✂️ TrimBox found: (${trimBox.x.toFixed(1)}, ${trimBox.y.toFixed(1)}) ${trimBox.width.toFixed(1)}×${trimBox.height.toFixed(1)}pts = ${(trimBox.width * pxToMmTrim).toFixed(1)}×${(trimBox.height * pxToMmTrim).toFixed(1)}mm`);
                    }
                  } catch {}

                  // CRITICAL: Store PDF page dimensions for fallback use
                  const pxToMm = 1 / 2.834645669; // 72 DPI standard
                  pdfPageDimensions = {
                    widthMm: pageWidth * pxToMm,
                    heightMm: pageHeight * pxToMm,
                    widthPts: pageWidth,
                    heightPts: pageHeight,
                    artBoxPts: artBoxPts || undefined
                  } as any;
                  
                  console.log(`✅ PDF PAGE DIMENSIONS EXTRACTED: ${pageWidth.toFixed(1)}×${pageHeight.toFixed(1)}pts (MediaBox)`);
                  console.log(`📄 Stored for fallback: ${pdfPageDimensions.widthMm.toFixed(1)}×${pdfPageDimensions.heightMm.toFixed(1)}mm`);
                  
                  // PRIMARY METHOD: Use Ghostscript bbox for accurate content bounds
                  // This is more reliable than SVG geometry analysis as it detects ALL visible content
                  console.log(`🎯 USING Ghostscript bbox for accurate content detection (most reliable)`);
                  
                  let gsBounds: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number } | null = null;
                  
                  try {
                    const originalPdfPath = (file as any).originalPdfPath;
                    // CRITICAL: async exec — Ghostscript bbox can take several seconds on complex PDFs
                    const gsOutput = (await execAsyncRaw(`gs -dBATCH -dNOPAUSE -dQUIET -sDEVICE=bbox "${originalPdfPath}" 2>&1`, { encoding: 'utf8' as any, timeout: 30000 })).stdout.toString();
                    
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
                  let boundsSourceIsArtBox = false; // True when ArtBox was the authoritative source — prevents secondary Inkscape check from overriding
                  let inkscapeVerified = false; // True when Inkscape verification ran (confirms or corrects GS bounds)
                  
                  // CRITICAL FIX: Ghostscript bbox misses white content on its default white background
                  // This causes partial bounds for files with mixed colored + white artwork
                  // (e.g., CorelDRAW files with orange "TEAM" + white "MAPLES" text)
                  // Must validate GS bounds against Inkscape to catch missed white content
                  if (gsBounds && gsBounds.width > 1 && gsBounds.height > 1) {
                    const heightRatio = gsBounds.height / pageHeight;
                    const widthRatio = gsBounds.width / pageWidth;
                    const areaCoverage = (gsBounds.width * gsBounds.height) / (pageWidth * pageHeight);
                    
                    console.log(`📊 GS bbox coverage: ${(widthRatio * 100).toFixed(0)}%W × ${(heightRatio * 100).toFixed(0)}%H = ${(areaCoverage * 100).toFixed(0)}% area`);
                    
                    if (areaCoverage < 0.92) {
                      console.log(`⚠️ GS bbox covers ${(areaCoverage * 100).toFixed(0)}% of page - verifying with Inkscape for white content`);
                      
                      let inkscapeVerifyBounds: typeof gsBounds | null = null;
                      try {
                        // CRITICAL: async exec — inkscape --query-all is the heaviest call in the
                        // pipeline and was repeatedly blocking the event loop, killing prod.
                        const queryResult = (await execAsyncRaw(`inkscape --query-all "${svgPath}" 2>/dev/null`, { encoding: 'utf8' as any, timeout: 10000 })).stdout.toString();
                        const lines = queryResult.trim().split('\n');
                        let globalXMin = Infinity, globalYMin = Infinity, globalXMax = -Infinity, globalYMax = -Infinity;
                        const verifyPageW = pdfPageDimensions?.widthPts ?? Infinity;
                        const verifyPageH = pdfPageDimensions?.heightPts ?? Infinity;
                        for (const line of lines) {
                          const parts = line.split(',');
                          if (parts.length >= 5) {
                            const elX = parseFloat(parts[1]) || 0;
                            const elY = parseFloat(parts[2]) || 0;
                            const elW = parseFloat(parts[3]) || 0;
                            const elH = parseFloat(parts[4]) || 0;
                            if (elW > 0.5 && elH > 0.5) {
                              // Clamp each element to page bounds before accumulating global bbox
                              const clampedX = Math.max(elX, 0);
                              const clampedY = Math.max(elY, 0);
                              const clampedXMax = Math.min(elX + elW, verifyPageW);
                              const clampedYMax = Math.min(elY + elH, verifyPageH);
                              if (clampedXMax > clampedX && clampedYMax > clampedY) {
                                globalXMin = Math.min(globalXMin, clampedX);
                                globalYMin = Math.min(globalYMin, clampedY);
                                globalXMax = Math.max(globalXMax, clampedXMax);
                                globalYMax = Math.max(globalYMax, clampedYMax);
                              }
                            }
                          }
                        }
                        if (globalXMin < Infinity) {
                          const inkW = globalXMax - globalXMin;
                          const inkH = globalYMax - globalYMin;
                          if (inkW > 1 && inkH > 1) {
                            inkscapeVerifyBounds = { xMin: globalXMin, yMin: globalYMin, xMax: globalXMax, yMax: globalYMax, width: inkW, height: inkH };
                            console.log(`🔍 Inkscape all-elements bounds: (${globalXMin.toFixed(1)}, ${globalYMin.toFixed(1)}) to (${globalXMax.toFixed(1)}, ${globalYMax.toFixed(1)}) = ${inkW.toFixed(1)}×${inkH.toFixed(1)}`);
                          }
                        }
                      } catch (inkErr) {
                        console.log(`⚠️ Inkscape verification failed:`, inkErr);
                      }
                      
                      if (!inkscapeVerifyBounds && areaCoverage < 0.30 && pdfPageDimensions) {
                        console.log(`⚠️ Inkscape verification failed AND GS coverage very low (${(areaCoverage * 100).toFixed(0)}%) — falling back to MediaBox as safety measure`);
                        gsBounds = {
                          xMin: 0,
                          yMin: 0,
                          xMax: pdfPageDimensions.widthPts,
                          yMax: pdfPageDimensions.heightPts,
                          width: pdfPageDimensions.widthPts,
                          height: pdfPageDimensions.heightPts
                        };
                      }
                      
                      if (inkscapeVerifyBounds) {
                        const gsArea = gsBounds.width * gsBounds.height;
                        const pageArea = pageWidth * pageHeight;
                        const inkArea = inkscapeVerifyBounds.width * inkscapeVerifyBounds.height;
                        
                        const inkPageCoverage = inkArea / pageArea;
                        if (inkArea > gsArea * 1.05) {
                          const inkWidthBigger = inkscapeVerifyBounds.width > gsBounds.width * 1.05;
                          const inkHeightBigger = inkscapeVerifyBounds.height > gsBounds.height * 1.05;
                          
                          // If Inkscape reports near-full-page bounds (>85%) AND GS already detected
                          // meaningful content (>20% coverage), Inkscape is most likely picking up an
                          // invisible background rect or clip path (common in Corel/Illustrator exports)
                          // — trust GS's tight bounds in that case.
                          // BUT if GS coverage is very low (<20%), GS likely missed real content
                          // (e.g. white ink on light background, clipped paths) — trust Inkscape.
                          // NOTE: Lowered from 0.97/0.60 because Corel-exported PDFs commonly have
                          // an invisible page-sized clip/background that Inkscape includes (~85-95%)
                          // while the actual artwork only covers a fraction of the page.
                          const inkscapeIsFullPage = inkPageCoverage > 0.85;
                          const gsBboxPageCoverage = gsArea / pageArea;
                          const shouldTrustGSOverInkscape = inkscapeIsFullPage && gsBboxPageCoverage > 0.20;
                          
                          if ((inkWidthBigger || inkHeightBigger) && !shouldTrustGSOverInkscape) {
                            const gsPageCov = (gsArea / pageArea * 100).toFixed(0);
                            const inkPageCov = (inkPageCoverage * 100).toFixed(0);
                            console.log(`🔄 Inkscape found more content than GS (${(inkArea / gsArea).toFixed(1)}x area) - white/clipped content detected!`);
                            console.log(`   GS: ${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts (${gsPageCov}% page)`);
                            console.log(`   Inkscape: ${inkscapeVerifyBounds.width.toFixed(1)}×${inkscapeVerifyBounds.height.toFixed(1)}pts (${inkPageCov}% page)`);
                            
                            // If Inkscape bounds are significantly larger but still within the page, 
                            // use them to ensure no content is clipped on the canvas.
                            // CRITICAL: Ensure we don't pick up full-page background rectangles if GS already found the logo.
                            // RELAXED: Use a 99% threshold to be even safer for near-full-page content
                            // AND only switch if Inkscape is at least 5% larger than GS (prevents jitter)
                            // EXCEPTION: When GS coverage is very low (<50%) and Inkscape found much more (>2x),
                            // trust Inkscape even at full-page coverage — GS likely missed white/light content
                            const gsVeryLow = gsBboxPageCoverage < 0.50;
                            const inkMuchLarger = inkArea > gsArea * 2.0;
                            
                            const artBoxCheck = pdfPageDimensions && (pdfPageDimensions as any).artBoxPts;
                            const artBoxConfirmsGS = artBoxCheck && 
                              Math.abs(artBoxCheck.width - gsBounds.width) < gsBounds.width * 0.3 &&
                              Math.abs(artBoxCheck.height - gsBounds.height) < gsBounds.height * 0.3;
                            const inkscapeIsJustRootElement = inkPageCoverage > 0.98;
                            
                            if (inkscapeIsJustRootElement && artBoxConfirmsGS) {
                              console.log(`✅ Inkscape reports full page (${(inkPageCoverage * 100).toFixed(0)}%) but ArtBox confirms GS bounds — trusting GS bbox: ${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts`);
                            } else if ((inkPageCoverage < 0.99 && (inkArea > gsArea * 1.05 || gsBboxPageCoverage < 0.05)) ||
                                (gsVeryLow && inkMuchLarger && !artBoxConfirmsGS)) {
                              gsBounds = inkscapeVerifyBounds;
                              (gsBounds as any).__fromSvgCoords = true;
                              console.log(`✅ Using Inkscape bounds (white/clipped content): ${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts`);
                            } else {
                              console.log(`⚠️ Inkscape found near-full page or is not significantly larger - sticking with GS`);
                            }
                          } else if (shouldTrustGSOverInkscape) {
                            console.log(`✅ Inkscape reports full-page bounds (${(inkPageCoverage * 100).toFixed(0)}% coverage) but GS covers ${(gsBboxPageCoverage * 100).toFixed(0)}% — likely background rect, trusting GS bbox: ${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts`);
                          } else {
                            console.log(`✅ Inkscape bounds slightly larger but dimensions similar - trusting GS bbox`);
                          }
                        } else {
                          console.log(`✅ Inkscape confirms GS bounds are accurate (similar area)`);
                        }
                      }
                      inkscapeVerified = true;
                    } else {
                      console.log(`✅ GS BBOX TRUSTED: Content covers ${(areaCoverage * 100).toFixed(0)}% of page`);
                    }
                    
                    // If ArtBox (Illustrator artboard) is available and larger than GS ink-area, prefer it.
                    // ArtBox = designer's explicit artboard boundary = intended print/transfer size.
                    // GS bbox = tight ink area only (excludes white ink on dark backgrounds, masked/clipped content).
                    //
                    // CAVEAT: Corel exports often set TrimBox to the template size even when the actual
                    // artwork is much smaller and sits inside it. In that case, using TrimBox as bounds
                    // stretches a small logo to fill the whole template area, leaving it visually off-center.
                    // Only honor ArtBox/TrimBox when the visible content fills a meaningful fraction of it
                    // (≥60% area coverage). Otherwise the artwork doesn't fill the artboard — use GS bounds.
                    const artBoxFromPdfGs = pdfPageDimensions && (pdfPageDimensions as any).artBoxPts;
                    if (artBoxFromPdfGs && (artBoxFromPdfGs.width > gsBounds.width + 2 || artBoxFromPdfGs.height > gsBounds.height + 2)) {
                      const artBoxArea = artBoxFromPdfGs.width * artBoxFromPdfGs.height;
                      const gsAreaForArtCheck = gsBounds.width * gsBounds.height;
                      const gsToArtBoxCoverage = artBoxArea > 0 ? gsAreaForArtCheck / artBoxArea : 0;

                      if (gsToArtBoxCoverage < 0.60) {
                        console.log(`⚠️ GS content (${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts) only fills ${(gsToArtBoxCoverage * 100).toFixed(0)}% of ArtBox/TrimBox (${artBoxFromPdfGs.width.toFixed(1)}×${artBoxFromPdfGs.height.toFixed(1)}pts) — artwork doesn't fill artboard, keeping tight GS bounds`);
                      } else {
                        console.log(`🎨 ArtBox (${artBoxFromPdfGs.width.toFixed(1)}×${artBoxFromPdfGs.height.toFixed(1)}pts) is larger than GS bbox (${gsBounds.width.toFixed(1)}×${gsBounds.height.toFixed(1)}pts) and content fills ${(gsToArtBoxCoverage * 100).toFixed(0)}% of it — using ArtBox as intended print area`);
                        gsBounds = {
                          xMin: artBoxFromPdfGs.x,
                          yMin: artBoxFromPdfGs.y,
                          xMax: artBoxFromPdfGs.x + artBoxFromPdfGs.width,
                          yMax: artBoxFromPdfGs.y + artBoxFromPdfGs.height,
                          width: artBoxFromPdfGs.width,
                          height: artBoxFromPdfGs.height
                        };
                        boundsSourceIsArtBox = true;
                      }
                    }
                    
                    // LOW-COVERAGE FALLBACK: If GS coverage is extremely low (< 15%), GS is clearly
                    // missing large portions of the artwork (white elements, clipped paths, etc).
                    // In that case, fall back to the full PDF page (MediaBox) dimensions so the
                    // entire artwork is visible on canvas — much safer than a heavily cropped view.
                    // NOTE: Threshold was lowered from 55% to 15% because artwork that covers
                    // 30-50% of its page (e.g. 50×33mm content on a 60×60mm page) was being
                    // incorrectly expanded to full page dimensions.
                    let usedMediaBoxFallback = false;
                    const gsCoverageRatio = (gsBounds.width * gsBounds.height) / (pageWidth * pageHeight);
                    if (!boundsSourceIsArtBox && !inkscapeVerified && gsCoverageRatio < 0.15 && pdfPageDimensions) {
                      console.log(`⚠️ GS coverage is only ${(gsCoverageRatio * 100).toFixed(0)}% and Inkscape verification unavailable — using full PDF page (MediaBox) to avoid cropping white artwork`);
                      gsBounds = {
                        xMin: 0,
                        yMin: 0,
                        xMax: pdfPageDimensions.widthPts,
                        yMax: pdfPageDimensions.heightPts,
                        width: pdfPageDimensions.widthPts,
                        height: pdfPageDimensions.heightPts
                      };
                      usedMediaBoxFallback = true;
                      console.log(`📐 Falling back to MediaBox: ${pdfPageDimensions.widthMm.toFixed(1)}×${pdfPageDimensions.heightMm.toFixed(1)}mm`);
                    }

                    contentBoundsForNormalization = gsBounds;
                    const pxToMm = 1 / 2.834645669;
                    
                    boundsResult = {
                      success: true,
                      method: boundsSourceIsArtBox ? 'artbox' : (usedMediaBoxFallback ? 'mediabox-fallback' : 'ghostscript-bbox'),
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
                    console.log(`📐 Using ${boundsSourceIsArtBox ? 'ArtBox' : 'Ghostscript'} dimensions: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                  } else {
                    // Ghostscript bbox returned zero/empty bounds (common with white-on-white content)
                    // Try Inkscape first for accurate content detection, then fall back to SVG geometry
                    console.log(`⚠️ Ghostscript bbox returned zero/empty bounds - trying Inkscape for content detection`);
                    
                    let inkscapeBounds: { xMin: number; yMin: number; xMax: number; yMax: number; width: number; height: number } | null = null;
                    
                    // If PDF has an ArtBox (Illustrator artboard) that differs from MediaBox, use it directly
                    // This is the most accurate representation of the intended artwork area
                    const artBoxFromPdf = pdfPageDimensions && (pdfPageDimensions as any).artBoxPts;
                    if (artBoxFromPdf && pdfPageDimensions) {
                      const pxToMm = 1 / 2.834645669;
                      inkscapeBounds = {
                        xMin: artBoxFromPdf.x,
                        yMin: artBoxFromPdf.y,
                        xMax: artBoxFromPdf.x + artBoxFromPdf.width,
                        yMax: artBoxFromPdf.y + artBoxFromPdf.height,
                        width: artBoxFromPdf.width,
                        height: artBoxFromPdf.height
                      };
                      boundsSourceIsArtBox = true;
                      console.log(`✅ Using ArtBox as content bounds: ${artBoxFromPdf.width.toFixed(1)}×${artBoxFromPdf.height.toFixed(1)}pts = ${(artBoxFromPdf.width * pxToMm).toFixed(1)}×${(artBoxFromPdf.height * pxToMm).toFixed(1)}mm`);
                    }

                    if (!inkscapeBounds) {
                      try {
                        const { execSync: execSyncBounds } = await import('child_process');
                        const queryResult = execSyncBounds(`inkscape --query-all "${svgPath}" 2>/dev/null | head -1`, { encoding: 'utf8', timeout: 10000 });
                        const parts = queryResult.trim().split(',');
                        if (parts.length >= 5) {
                          let inkX = parseFloat(parts[1]) || 0;
                          let inkY = parseFloat(parts[2]) || 0;
                          let inkXMax = inkX + (parseFloat(parts[3]) || 0);
                          let inkYMax = inkY + (parseFloat(parts[4]) || 0);
                          // Clamp to PDF MediaBox — bleed/margin elements outside the page inflate bounds
                          if (pdfPageDimensions) {
                            inkX = Math.max(inkX, 0);
                            inkY = Math.max(inkY, 0);
                            inkXMax = Math.min(inkXMax, pdfPageDimensions.widthPts);
                            inkYMax = Math.min(inkYMax, pdfPageDimensions.heightPts);
                            console.log(`📏 Inkscape bounds clamped to MediaBox (${pdfPageDimensions.widthPts.toFixed(1)}×${pdfPageDimensions.heightPts.toFixed(1)}pts)`);
                          }
                          const inkW = inkXMax - inkX;
                          const inkH = inkYMax - inkY;
                          if (inkW > 1 && inkH > 1) {
                            inkscapeBounds = { xMin: inkX, yMin: inkY, xMax: inkXMax, yMax: inkYMax, width: inkW, height: inkH };
                            console.log(`✅ Inkscape content bounds (clamped): (${inkX.toFixed(1)}, ${inkY.toFixed(1)}) size ${inkW.toFixed(1)}×${inkH.toFixed(1)}pts`);
                          }
                        }
                      } catch (inkErr) {
                        console.log(`⚠️ Inkscape query failed:`, inkErr);
                      }
                    }
                    
                    if (inkscapeBounds) {
                      contentBoundsForNormalization = inkscapeBounds;
                      const pxToMm = 1 / 2.834645669;
                      
                      boundsResult = {
                        success: true,
                        method: 'inkscape-fallback',
                        contentBounds: {
                          xMin: 0,
                          yMin: 0,
                          xMax: inkscapeBounds.width,
                          yMax: inkscapeBounds.height,
                          width: inkscapeBounds.width,
                          height: inkscapeBounds.height,
                          units: 'pt'
                        }
                      };
                      
                      displayWidth = inkscapeBounds.width * pxToMm;
                      displayHeight = inkscapeBounds.height * pxToMm;
                      console.log(`📐 Using Inkscape dimensions: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                      
                      // Store original PDF bounds for cropping (convert Inkscape top-down Y to PDF bottom-up Y)
                      if (pdfPageDimensions) {
                        const pdfYMin = pdfPageDimensions.heightPts - inkscapeBounds.yMin - inkscapeBounds.height;
                        const pdfYMax = pdfPageDimensions.heightPts - inkscapeBounds.yMin;
                        originalPdfBounds = {
                          xMin: inkscapeBounds.xMin,
                          yMin: pdfYMin,
                          xMax: inkscapeBounds.xMax,
                          yMax: pdfYMax,
                          width: inkscapeBounds.width,
                          height: inkscapeBounds.height,
                          units: 'pt'
                        };
                        console.log(`📋 PDF bounds from Inkscape: (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
                      }
                    } else {
                      // Final fallback to SVG geometry analysis
                      console.log(`🔄 Falling back to SVG geometry analysis`);
                      const { SVGBoundsAnalyzer } = await import('./svg-bounds-analyzer');
                      const svgAnalyzer2 = new SVGBoundsAnalyzer();
                      const svgGeometryResult = await svgAnalyzer2.extractSVGBounds(svgPath);
                      
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
                        throw new Error('Ghostscript, Inkscape, and SVG geometry analysis all failed');
                      }
                    }
                  }
                  
                  // ARCHITECT GUIDANCE: PDF bbox gives initial dimensions, but Inkscape may report larger bounds
                  // Ghostscript can miss masked strokes/effects that Inkscape's renderer correctly measures
                  console.log(`📍 PDF/Ghostscript bounds: (${contentBoundsForNormalization.xMin.toFixed(1)}, ${contentBoundsForNormalization.yMin.toFixed(1)}) to (${contentBoundsForNormalization.xMax.toFixed(1)}, ${contentBoundsForNormalization.yMax.toFixed(1)})`);
                  
                  let contentWidthPts = contentBoundsForNormalization.width;
                  let contentHeightPts = contentBoundsForNormalization.height;
                  
                  // Store original PDF bounds for PDF cropping during generation
                  // CRITICAL: If bounds came from Inkscape SVG analysis, Y coordinates are in SVG space (top-down)
                  // and must be converted to PDF space (bottom-up) for correct Ghostscript cropping
                  if ((contentBoundsForNormalization as any).__fromSvgCoords && pdfPageDimensions) {
                    const svgYMin = contentBoundsForNormalization.yMin;
                    const svgYMax = contentBoundsForNormalization.yMax;
                    originalPdfBounds = {
                      xMin: contentBoundsForNormalization.xMin,
                      yMin: pdfPageDimensions.heightPts - svgYMax,
                      xMax: contentBoundsForNormalization.xMax,
                      yMax: pdfPageDimensions.heightPts - svgYMin,
                      width: contentWidthPts,
                      height: contentHeightPts,
                      units: 'pt'
                    };
                    console.log(`📋 Stored PDF bounds (converted from SVG coords): (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
                    console.log(`   SVG Y range: ${svgYMin.toFixed(1)}-${svgYMax.toFixed(1)} → PDF Y range: ${originalPdfBounds.yMin.toFixed(1)}-${originalPdfBounds.yMax.toFixed(1)} (page height: ${pdfPageDimensions.heightPts.toFixed(1)})`);
                  } else {
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
                  }
                    
                    // Crop SVG viewBox to content bounds AND translate content to zero-origin
                    if (fs.existsSync(svgPath)) {
                      try {
                        let svgBoundsX = 0, svgBoundsY = 0;
                        let svgBoundsWidth = contentWidthPts, svgBoundsHeight = contentHeightPts;
                        
                        try {
                          // CRITICAL: async exec — see notes above about inkscape blocking the event loop.
                          const queryResult = (await execAsyncRaw(`inkscape --query-all "${svgPath}" 2>/dev/null`, { encoding: 'utf8' as any, timeout: 15000 })).stdout.toString();
                          const allLines = queryResult.trim().split('\n');
                          
                          const rootParts = allLines[0]?.split(',');
                          if (rootParts && rootParts.length >= 5) {
                            svgBoundsX = parseFloat(rootParts[1]) || 0;
                            svgBoundsY = parseFloat(rootParts[2]) || 0;
                            if (pdfPageDimensions) {
                              svgBoundsX = Math.max(svgBoundsX, 0);
                              svgBoundsY = Math.max(svgBoundsY, 0);
                            }
                          }
                          
                          let unionXMin = Infinity, unionYMin = Infinity, unionXMax = -Infinity, unionYMax = -Infinity;
                          const pageW = pdfPageDimensions?.widthPts ?? Infinity;
                          const pageH = pdfPageDimensions?.heightPts ?? Infinity;
                          for (let lineIdx = 0; lineIdx < allLines.length; lineIdx++) {
                            const line = allLines[lineIdx];
                            const parts = line.split(',');
                            if (parts.length >= 5) {
                              const elId = parts[0] || '';
                              if (lineIdx === 0 || elId === 'svg1' || elId === 'svg' || elId.startsWith('svg:svg')) {
                                continue;
                              }
                              const elX = parseFloat(parts[1]) || 0;
                              const elY = parseFloat(parts[2]) || 0;
                              const elW = parseFloat(parts[3]) || 0;
                              const elH = parseFloat(parts[4]) || 0;
                              if (elW > 0.5 && elH > 0.5) {
                                const cx = Math.max(elX, 0);
                                const cy = Math.max(elY, 0);
                                const cxMax = Math.min(elX + elW, pageW);
                                const cyMax = Math.min(elY + elH, pageH);
                                if (cxMax > cx && cyMax > cy) {
                                  unionXMin = Math.min(unionXMin, cx);
                                  unionYMin = Math.min(unionYMin, cy);
                                  unionXMax = Math.max(unionXMax, cxMax);
                                  unionYMax = Math.max(unionYMax, cyMax);
                                }
                              }
                            }
                          }
                          
                          if (unionXMin < Infinity) {
                            const inkscapeWidth = unionXMax - unionXMin;
                            const inkscapeHeight = unionYMax - unionYMin;
                            console.log(`🔍 Inkscape all-elements union: (${unionXMin.toFixed(2)}, ${unionYMin.toFixed(2)}) to (${unionXMax.toFixed(2)}, ${unionYMax.toFixed(2)}) = ${inkscapeWidth.toFixed(2)}×${inkscapeHeight.toFixed(2)}pts`);
                            console.log(`🔍 Root element position: (${svgBoundsX.toFixed(2)}, ${svgBoundsY.toFixed(2)})`);
                            
                            const TOLERANCE = 1.0;
                            const inkPageCoverage2 = pdfPageDimensions ? (inkscapeWidth * inkscapeHeight) / (pdfPageDimensions.widthPts * pdfPageDimensions.heightPts) : 0;
                            const gsPageCoverage = pdfPageDimensions ? (contentWidthPts * contentHeightPts) / (pdfPageDimensions.widthPts * pdfPageDimensions.heightPts) : 0;
                            const isBackgroundRect = inkPageCoverage2 > 0.97 && gsPageCoverage < 0.50;
                            
                            console.log(`📊 Coverage: GS=${(gsPageCoverage * 100).toFixed(0)}%, Inkscape=${(inkPageCoverage2 * 100).toFixed(0)}%, isBackgroundRect=${isBackgroundRect}`);
                            
                            if (!boundsSourceIsArtBox && !isBackgroundRect && (inkscapeWidth > contentWidthPts + TOLERANCE || inkscapeHeight > contentHeightPts + TOLERANCE)) {
                              console.log(`⚠️ Inkscape reports LARGER bounds than Ghostscript!`);
                              console.log(`   Ghostscript: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts`);
                              console.log(`   Inkscape: ${inkscapeWidth.toFixed(2)}×${inkscapeHeight.toFixed(2)}pts`);
                              console.log(`🔧 Using Inkscape dimensions to prevent clipping`);
                              
                              const finalWidth = Math.max(contentWidthPts, inkscapeWidth);
                              const finalHeight = Math.max(contentHeightPts, inkscapeHeight);
                              svgBoundsWidth = finalWidth;
                              svgBoundsHeight = finalHeight;
                              contentWidthPts = finalWidth;
                              contentHeightPts = finalHeight;
                              
                              svgBoundsX = unionXMin;
                              svgBoundsY = unionYMin;
                              
                              const pxToMm = 1 / 2.834645669;
                              displayWidth = contentWidthPts * pxToMm;
                              displayHeight = contentHeightPts * pxToMm;
                              console.log(`✅ Updated dimensions: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts (${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm)`);
                              
                              if (pdfPageDimensions) {
                                const pageHeight = pdfPageDimensions.heightPts;
                                const pdfYMin = pageHeight - svgBoundsY - finalHeight;
                                const pdfYMax = pageHeight - svgBoundsY;
                                
                                originalPdfBounds = {
                                  xMin: svgBoundsX,
                                  yMin: pdfYMin,
                                  xMax: svgBoundsX + finalWidth,
                                  yMax: pdfYMax,
                                  width: finalWidth,
                                  height: finalHeight,
                                  units: 'pt'
                                };
                                console.log(`📋 Updated PDF bounds: (${originalPdfBounds.xMin.toFixed(1)}, ${originalPdfBounds.yMin.toFixed(1)}) to (${originalPdfBounds.xMax.toFixed(1)}, ${originalPdfBounds.yMax.toFixed(1)})`);
                                
                                boundsResult = {
                                  success: true,
                                  method: 'inkscape-corrected',
                                  contentBounds: {
                                    xMin: 0,
                                    yMin: 0,
                                    xMax: finalWidth,
                                    yMax: finalHeight,
                                    width: finalWidth,
                                    height: finalHeight,
                                    units: 'pt'
                                  }
                                };
                              }
                            } else if (boundsSourceIsArtBox) {
                              console.log(`✅ ArtBox bounds preserved (designer's explicit artboard)`);
                            } else if (isBackgroundRect) {
                              console.log(`✅ Inkscape full-page bounds suppressed (GS coverage ${(gsPageCoverage * 100).toFixed(0)}% suggests background rect)`);
                            } else {
                              console.log(`✅ Inkscape confirms GS bounds (no significant difference)`);
                            }
                          }
                        } catch (queryError) {
                          console.log(`⚠️ Inkscape query failed, using Ghostscript bounds:`, queryError);
                        }
                        
                        console.log(`📐 Final content dimensions: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts (${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm)`);
                        
                        let svgContent = fs.readFileSync(svgPath, 'utf8');
                        
                        // Determine correct SVG-space translation for the content
                        // svgBoundsX/Y come from Inkscape all-elements analysis (root position or content union origin)
                        // For small logos on large pages, we need the CONTENT position, not root position
                        let normTranslateX = svgBoundsX;
                        let normTranslateY = svgBoundsY;
                        
                        // If root element is at (0,0) covering the full page but content is smaller,
                        // we need to use GS/PDF bounds converted to SVG coordinates for the translation
                        const rootIsFullPage = pdfPageDimensions && 
                          Math.abs(svgBoundsX) < 1 && Math.abs(svgBoundsY) < 1 &&
                          contentWidthPts < pdfPageDimensions.widthPts * 0.8 &&
                          contentHeightPts < pdfPageDimensions.heightPts * 0.8;
                        
                        if (rootIsFullPage && contentBoundsForNormalization) {
                          if ((contentBoundsForNormalization as any).__fromSvgCoords) {
                            normTranslateX = contentBoundsForNormalization.xMin;
                            normTranslateY = contentBoundsForNormalization.yMin;
                          } else {
                            normTranslateX = contentBoundsForNormalization.xMin;
                            normTranslateY = pdfPageDimensions!.heightPts - contentBoundsForNormalization.yMax;
                          }
                          console.log(`📐 Root element is full page but content is small — using PDF bounds for SVG translation`);
                          console.log(`   PDF bounds: (${contentBoundsForNormalization.xMin.toFixed(1)}, ${contentBoundsForNormalization.yMin.toFixed(1)}) → SVG translate: (${normTranslateX.toFixed(1)}, ${normTranslateY.toFixed(1)})`);
                        }
                        
                        console.log(`🎯 NORMALIZING SVG to zero-origin:`);
                        console.log(`   SVG content starts at: (${normTranslateX.toFixed(2)}, ${normTranslateY.toFixed(2)})`);
                        console.log(`   Size: ${contentWidthPts.toFixed(2)}×${contentHeightPts.toFixed(2)}pts`);
                        console.log(`   Translation needed: (-${normTranslateX.toFixed(2)}, -${normTranslateY.toFixed(2)})`);
                        
                        // CRITICAL: Set viewBox to ZERO-ORIGIN (0 0 width height)
                        // This matches the normalized contentBounds the frontend expects
                        const newViewBox = `viewBox="0 0 ${contentWidthPts.toFixed(2)} ${contentHeightPts.toFixed(2)}"`;
                        svgContent = svgContent.replace(/viewBox="[^"]*"/, newViewBox);
                        
                        // Update width/height to match content (unitless to match viewBox)
                        // Using unitless values ensures CSS width:100% works correctly
                        svgContent = svgContent.replace(/width="[^"]*"/, `width="${contentWidthPts.toFixed(2)}"`);
                        svgContent = svgContent.replace(/height="[^"]*"/, `height="${contentHeightPts.toFixed(2)}"`);
                        
                        const translateX = -normTranslateX;
                        const translateY = -normTranslateY;
                        
                        // Find the opening <svg> tag and wrap all content after it
                        svgContent = svgContent.replace(
                          /(<svg[^>]*>)/,
                          `$1\n<g transform="translate(${translateX.toFixed(2)}, ${translateY.toFixed(2)})">`
                        );
                        // Add closing </g> before </svg>
                        svgContent = svgContent.replace(/<\/svg>/, '</g>\n</svg>');
                        
                        // Mark as geometry-cropped and normalized
                        svgContent = svgContent.replace(/<svg\s/, '<svg data-geometry-cropped="true" data-normalized="true" ');

                        // ────────────────────────────────────────────────────────────────
                        // STRIP BROKEN PDF BLEND-MODE FILTERS
                        // Ghostscript's pdf2svg path emits <filter> elements with
                        // <feImage xlink:href="#compositing-group-N"/> references that
                        // point to elements that don't exist in the output SVG. Browsers
                        // silently produce nothing for these filters, which causes any
                        // path with filter="url(#filter-N)" to render as empty — visible
                        // symptom: blank canvas. Strip the broken filters and the
                        // attributes that reference them so the underlying paths render.
                        // ────────────────────────────────────────────────────────────────
                        try {
                          const brokenFilterIds = new Set<string>();
                          const filterRegex = /<filter\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/filter>/g;
                          let fm: RegExpExecArray | null;
                          while ((fm = filterRegex.exec(svgContent)) !== null) {
                            const [, id, body] = fm;
                            if (/xlink:href\s*=\s*"#compositing-group-/.test(body)) {
                              brokenFilterIds.add(id);
                            }
                          }
                          if (brokenFilterIds.size > 0) {
                            const before = svgContent.length;
                            // Remove the broken <filter> definitions entirely
                            svgContent = svgContent.replace(filterRegex, (full, id) =>
                              brokenFilterIds.has(id) ? '' : full
                            );
                            // Drop filter="url(#filter-N)" attributes pointing at them
                            for (const id of brokenFilterIds) {
                              const attrRegex = new RegExp(
                                `\\s+filter\\s*=\\s*"url\\(#${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\)"`,
                                'g'
                              );
                              svgContent = svgContent.replace(attrRegex, '');
                            }
                            console.log(`🧹 Stripped ${brokenFilterIds.size} broken PDF blend-mode filter(s) (compositing-group refs) — saved ${before - svgContent.length} bytes`);
                            // Even after cleanup, PDFs that relied on these filters use complex
                            // clip/mask/alpha compositing that browsers can't reliably render.
                            // Force a PNG fallback so the canvas shows the real artwork.
                            (file as any).__forcePngFallback = true;
                            // Mark on the metrics so the canvas renderer knows to ALWAYS use the PNG
                            // fallback (not just when path count exceeds the complexity threshold).
                            // The SVG itself is unrenderable on every browser, regardless of size.
                            const existingMetrics = (file as any).vectorComplexityMetrics || {};
                            (file as any).vectorComplexityMetrics = {
                              ...existingMetrics,
                              hasUnrenderableContent: true,
                              hasUnrenderableContentReason: 'stripped-broken-compositing-group-filters',
                            };
                          }
                        } catch (cleanupErr) {
                          console.warn(`⚠️ Filter cleanup skipped:`, (cleanupErr as Error).message);
                        }

                        fs.writeFileSync(svgPath, svgContent);
                        console.log(`✅ SVG normalized to zero-origin with content translation - centered correctly`);
                        
                        // CRITICAL: Regenerate PNG fallback AFTER normalization if one was created earlier
                        // The original PNG was generated from the full-page SVG before cropping.
                        // ALSO: if we just stripped broken PDF blend-mode filters, the SVG won't
                        // render correctly in browsers — force a PNG fallback so the canvas shows
                        // the real artwork instead of a blank/partial render.
                        const needsForcedFallback = (file as any).__forcePngFallback === true;
                        if ((file as any).canvasFallbackFilename || needsForcedFallback) {
                          try {
                            const pngFilename = (file as any).canvasFallbackFilename
                              || finalFilename.replace(/\.svg$/, '-canvas-fallback.png');
                            const pngPath = path.join(uploadDir, pngFilename);
                            const pngScale = 4;
                            const pngW = Math.round(contentWidthPts * pngScale);
                            const pngH = Math.round(contentHeightPts * pngScale);
                            // CRITICAL: When the SVG had its blend-mode filter chains stripped,
                            // rsvg-convert on that SVG produces wrong output (occluded layers,
                            // missing color compositing). Render the ORIGINAL PDF with Ghostscript
                            // instead — it natively handles PDF blend modes, transparency groups,
                            // and soft masks. Only fall back to rsvg-convert when no original PDF
                            // exists (e.g. native SVG uploads or PDFs that already lost the original).
                            const originalPdfFilename = (file as any).originalPdfFilename;
                            const originalPdfPath = originalPdfFilename
                              ? path.join(uploadDir, originalPdfFilename)
                              : null;
                            const useGhostscript = needsForcedFallback && originalPdfPath && fs.existsSync(originalPdfPath);
                            const renderer = useGhostscript ? 'Ghostscript→PDF' : 'rsvg-convert→SVG';
                            console.log(`🔄 ${needsForcedFallback && !(file as any).canvasFallbackFilename ? 'GENERATING' : 'REGENERATING'} PNG fallback via ${renderer}: ${contentWidthPts.toFixed(1)}×${contentHeightPts.toFixed(1)}pts → ${pngW}×${pngH}px${needsForcedFallback ? ' (forced — complex PDF compositing)' : ''}`);
                            // CRITICAL: Use async exec (NOT execSync) — synchronous spawn here was blocking
                            // the Node event loop for 15-30s on complex SVGs, causing platform health-check
                            // failures and SIGKILL in production. Use the module-scope execAsyncRaw.
                            if (useGhostscript) {
                              const dpi = pngScale * 72;
                              await execAsyncRaw(
                                `gs -dNOPAUSE -dBATCH -dSAFER -dQUIET -sDEVICE=pngalpha -r${dpi} -dFirstPage=1 -dLastPage=1 -dUseCropBox -dGraphicsAlphaBits=4 -dTextAlphaBits=4 -sOutputFile="${pngPath}" "${originalPdfPath}"`,
                                { timeout: 60000, killSignal: 'SIGKILL' as any, maxBuffer: 32 * 1024 * 1024 }
                              );
                            } else {
                              await execAsyncRaw(`rsvg-convert "${svgPath}" -o "${pngPath}" -w ${pngW} -h ${pngH}`, {
                                timeout: 30000,
                                killSignal: 'SIGKILL' as any,
                              });
                            }
                            // Only accept the PNG if it's actually valid (>1KB — 0-byte files mean rsvg failed silently)
                            const pngSize = fs.existsSync(pngPath) ? fs.statSync(pngPath).size : 0;
                            if (pngSize > 1024) {
                              (file as any).canvasFallbackFilename = pngFilename;
                              (file as any).isComplexVector = true;
                              console.log(`✅ PNG fallback ready: ${pngFilename} (${pngSize} bytes)`);
                            } else {
                              console.log(`⚠️ PNG fallback produced ${pngSize} bytes — not using`);
                              if (fs.existsSync(pngPath)) try { fs.unlinkSync(pngPath); } catch {}
                            }
                          } catch (pngRegenError) {
                            console.log(`⚠️ PNG fallback regeneration failed:`, (pngRegenError as Error).message);
                          }
                        }
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
              
              // SVG user units are points (1pt = 1/72 inch) — same for both native SVGs and PDF-converted ones
              // Adobe Illustrator, Inkscape, and browser SVG all use 72 DPI for CSS units in SVG
              const svgPxToMm = 25.4 / 72;
              
              // If PDF bounds extraction failed, use Inkscape for accurate content bounds
              if (!boundsResult) {
                try {
                  const { execSync: execSyncBounds } = await import('child_process');
                  // Use --query-x/y/width/height to get exact drawing bounds
                  const inkX = parseFloat(execSyncBounds(`inkscape --query-x "${svgPath}" 2>/dev/null`, { encoding: 'utf8', timeout: 30000 }).trim());
                  const inkY = parseFloat(execSyncBounds(`inkscape --query-y "${svgPath}" 2>/dev/null`, { encoding: 'utf8', timeout: 30000 }).trim());
                  const inkW = parseFloat(execSyncBounds(`inkscape --query-width "${svgPath}" 2>/dev/null`, { encoding: 'utf8', timeout: 30000 }).trim());
                  const inkH = parseFloat(execSyncBounds(`inkscape --query-height "${svgPath}" 2>/dev/null`, { encoding: 'utf8', timeout: 30000 }).trim());
                  if (inkW > 0 && inkH > 0) {
                    const inkWidthMm = inkW * svgPxToMm;
                    const inkHeightMm = inkH * svgPxToMm;
                    console.log(`✅ Inkscape SVG content bounds: x=${inkX.toFixed(2)} y=${inkY.toFixed(2)} ${inkW.toFixed(2)}×${inkH.toFixed(2)}px (${inkWidthMm.toFixed(1)}×${inkHeightMm.toFixed(1)}mm at 72 DPI)`);
                    
                    // Set display dimensions from Inkscape content bounds
                    displayWidth = inkWidthMm;
                    displayHeight = inkHeightMm;
                    
                    boundsResult = {
                      success: true,
                      method: 'inkscape-query' as any,
                      hasContent: true,
                      contentBounds: { xMin: inkX, yMin: inkY, xMax: inkX + inkW, yMax: inkY + inkH, width: inkW, height: inkH, units: 'px' as const }
                    };
                  }
                } catch (inkErr) {
                  console.log(`⚠️ Inkscape bounds query failed for direct SVG, falling back to SVG analyzer`);
                }
              }
              
              // Fallback: use SVG bounds analyzer if Inkscape failed
              if (!boundsResult) {
                boundsResult = await svgAnalyzer.extractSVGBounds(svgPath);
              }
              
              if (boundsResult.success && boundsResult.contentBounds) {
                console.log(`✅ PRECISE BOUNDS DETECTED: ${boundsResult.contentBounds.width.toFixed(1)}×${boundsResult.contentBounds.height.toFixed(1)}px using ${boundsResult.method}`);
                
                // Convert to millimeters using correct DPI (96 for native SVG, 72 for PDF-converted)
                const pxToMm = svgPxToMm;
                let detectedWidthMm = boundsResult.contentBounds.width * pxToMm;
                let detectedHeightMm = boundsResult.contentBounds.height * pxToMm;
                
                console.log(`📐 INITIAL BOUNDS: ${detectedWidthMm.toFixed(1)}×${detectedHeightMm.toFixed(1)}mm`);
                console.log(`✅ REASONABLE BOUNDS: Using detected bounds as-is`);
                
                
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
                
                // For standard sizes, use artboard dimensions ONLY when decorative elements
                // extend beyond the artboard (bleed marks, registration marks, etc.).
                // When content is smaller than the artboard (e.g., AI files where the page is the
                // template size but the actual artwork is smaller), we MUST tight-crop — otherwise
                // the SVG renders with the full-artboard viewBox into a content-sized canvas element
                // and the artwork gets squeezed by preserveAspectRatio="meet" (visibly clipped/scaled down).
                const shouldUseArtboard = isStandardCutSize && extendsBeyondViewBox && originalWidthDiff < 100 && originalHeightDiff < 50;
                
                // CRITICAL FIX: When Ghostscript bbox succeeds, use dimensions directly
                // WITHOUT creating a tight-content SVG (GS coords are in PDF space, not SVG space)
                const isGhostscriptSource = boundsResult.method === 'ghostscript-bbox';
                const isInkscapeQuerySource = boundsResult.method === 'inkscape-query';
                
                // Enable tight crop for direct SVG uploads (inkscape-query) to remove empty margins
                // Skip for Ghostscript (PDF-space coords) and standard artboard sizes
                const needsTightCrop = !isGhostscriptSource && !shouldUseArtboard && (originalWidthDiff > 5 || originalHeightDiff > 5);
                
                if (hasNegativeCoords) {
                  console.log(`🚨 NEGATIVE COORDINATES DETECTED: Content extends before origin (${contentBounds.xMin.toFixed(1)}, ${contentBounds.yMin.toFixed(1)})`);
                }
                if (extendsBeyondViewBox) {
                  console.log(`🚨 CONTENT EXTENDS BEYOND VIEWBOX: Content (${contentBounds.xMax.toFixed(1)}, ${contentBounds.yMax.toFixed(1)}) > viewBox (${viewBoxWidthPx.toFixed(1)}, ${viewBoxHeightPx.toFixed(1)})`);
                }
                
                if (isGhostscriptSource) {
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
                    
                    // Save normalized bounds for DB (hoisted variable accessible at save point)
                    normalizedBoundsForSave = normalizedContentBounds;
                    
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
                  displayWidth = contentWidthMm;
                  displayHeight = contentHeightMm;
                  console.log(`🎯 CANVAS DISPLAY: Using content bounds ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm`);
                } else {
                  console.log(`✅ GHOSTSCRIPT SOURCE: Keeping dimensions ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm`);
                }
              }
              
            } // End of if (needsTightCrop && !isGhostscriptSource) block
            
            // CRITICAL: When Ghostscript bbox succeeded, preserve those dimensions
            if (boundsResult?.method === 'ghostscript-bbox') {
              console.log(`✅ BOUNDS FINAL: displayWidth=${displayWidth.toFixed(2)}mm, displayHeight=${displayHeight.toFixed(2)}mm preserved from ${boundsResult.method}`);
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
            // BUT preserve dimensions if already set for complex file PNG fallback or direct raster upload
            if ((file as any).isComplexFilePngFallback && (file as any).originalPdfBounds) {
              console.log(`Large format complex file - using pre-extracted PDF bounds: ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm`);
              // displayWidth and displayHeight already set from originalPdfBounds
            } else if (isDirectRasterUpload && (file as any).imageDpi) {
              console.log(`Large format direct raster upload - preserving native DPI dimensions: ${displayWidth.toFixed(2)}×${displayHeight.toFixed(2)}mm @ ${(file as any).imageDpi} DPI`);
              // displayWidth and displayHeight already set from embedded DPI in isDirectRasterUpload block
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
        
        // CRITICAL: Always save content bounds - use normalized bounds if tight crop was done, or extracted bounds
        let contentBoundsToSave = null;
        if (boundsResult?.success && boundsResult.contentBounds) {
          // Use normalized bounds (0,0-based) if tight crop was performed, otherwise use original extracted bounds
          contentBoundsToSave = normalizedBoundsForSave || boundsResult.contentBounds;
          console.log(`✅ Using ${normalizedBoundsForSave ? 'normalized' : 'extracted'} content bounds: ${JSON.stringify(contentBoundsToSave)}`);
        } else {
          // Fallback: Create content bounds from display dimensions
          // This ensures ALL logos have content bounds for position warnings
          const fallbackPxToMm = 25.4 / 72;
          const mmToPixelRatio = 1 / fallbackPxToMm;
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
        
        // For direct raster uploads (JPEG/PNG), embed native DPI and pixel dimensions into svgColors
        // so the frontend can compute accurate effective resolution for the preflight check
        if (isDirectRasterUpload && (file as any).imageDpi) {
          const rasterMeta = {
            imageDpi: (file as any).imageDpi,
            imageWidthPx: (file as any).extractedPngWidth,
            imageHeightPx: (file as any).extractedPngHeight,
            nativePrintWidthMm: displayWidth,
            nativePrintHeightMm: displayHeight
          };
          analysisData = analysisData ? { ...analysisData, ...rasterMeta } : rasterMeta;
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
          ...(originalPdfBounds && { originalPdfBounds }),
          // CRITICAL: Persist late-set PNG fallback + complexity metrics produced during SVG normalization
          // (filter-stripping for compositing-group refs, forced PNG fallback for unrenderable SVGs).
          // Without these, the renderer cannot know to use the PNG instead of the broken SVG.
          ...((file as any).canvasFallbackFilename && { canvasFallbackFilename: (file as any).canvasFallbackFilename }),
          ...((file as any).vectorComplexityMetrics && { vectorComplexityMetrics: (file as any).vectorComplexityMetrics })
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
          console.log(`⚠️ Template size '${project.templateSize}' not found - using default dimensions for placement`);
        }

        // Calculate usable area (template minus 3mm safety margins on each side)
        const safetyMargin = 3; // 3mm safety margin
        const templateWidth = templateSize?.width ?? 1000;
        const templateHeight = templateSize?.height ?? 550;
        const usableWidth = templateWidth - (safetyMargin * 2);
        const usableHeight = templateHeight - (safetyMargin * 2);

        // For PDF-sourced content, preserve exact original dimensions (from MediaBox)
        // For direct raster uploads (PNG/JPEG), auto-scale to fit if they exceed the template
        let finalDisplayWidth = displayWidth;
        let finalDisplayHeight = displayHeight;
        let wasAutoScaled = false;
        
        const isDirectRasterFile = (finalMimeType === 'image/png' || finalMimeType === 'image/jpeg') && 
                                    file.mimetype !== 'application/pdf' && !(file as any).isPdfWithRasterOnly;
        
        if (displayWidth > usableWidth || displayHeight > usableHeight) {
          if (isDirectRasterFile) {
            // Auto-scale direct raster uploads to fit within usable area
            const scaleX = usableWidth / displayWidth;
            const scaleY = usableHeight / displayHeight;
            const scale = Math.min(scaleX, scaleY);
            finalDisplayWidth = displayWidth * scale;
            finalDisplayHeight = displayHeight * scale;
            wasAutoScaled = true;
            console.log(`📐 AUTO-SCALED RASTER: ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm → ${finalDisplayWidth.toFixed(1)}×${finalDisplayHeight.toFixed(1)}mm (scale: ${(scale * 100).toFixed(1)}%)`);
          } else {
            console.log(`📐 ORIGINAL SIZE PRESERVED: Content ${displayWidth.toFixed(1)}×${displayHeight.toFixed(1)}mm exceeds usable area ${usableWidth.toFixed(1)}×${usableHeight.toFixed(1)}mm`);
            console.log(`   ⚠️ Content will extend beyond template bounds - this is expected behavior`);
            console.log(`   ℹ️ User can manually scale via "Fit to Bounds" if needed`);
          }
        }

        // Use center-based coordinate system
        // Origin (0,0) is at the center of the template
        // Content is positioned by its center point
        let centerX = 0;  // Center of template
        let centerY = 0;  // Center of template
        
        console.log(`📐 Center-based positioning: content at (${centerX}, ${centerY}) - template center`);
        console.log(`📐 Template: ${templateWidth}×${templateHeight}mm, Content: ${finalDisplayWidth.toFixed(1)}×${finalDisplayHeight.toFixed(1)}mm${wasAutoScaled ? ' (auto-scaled)' : ''}`);

        // Set color overrides for single colour templates with ink color (works for both vector and raster)
        let colorOverrides = null;
        if (isSingleColourTemplate && project.inkColor) {
          console.log(`🎨 Setting colorOverrides for single colour template with ink: ${project.inkColor} (type: ${finalMimeType})`);
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
          zIndex: nextZIndex++,
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
      const ctxFiles = ((req.files as Express.Multer.File[]) || []).map(f => f.originalname).join(', ') || 'unknown';
      console.error(`Upload error [project=${req.params.projectId} files=[${ctxFiles}]]:`, error);
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

  app.post('/api/projects/:projectId/logos/from-chunked', async (req, res) => {
    try {
      const projectId = req.params.projectId;
      const { filename, originalName, mimetype, size } = req.body;
      
      if (!filename || !originalName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      const safeFilename = path.basename(filename);
      if (safeFilename !== filename || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      
      const filePath = path.join(uploadDir, safeFilename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Assembled file not found' });
      }
      
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      
      const allowedMimes = [
        'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'application/pdf',
        'application/postscript', 'application/illustrator', 'application/x-illustrator'
      ];
      const safeMimetype = allowedMimes.includes(mimetype) ? mimetype : 'application/pdf';
      
      console.log(`📦 Processing chunked upload: "${originalName}" → ${safeFilename} (${safeMimetype})`);
      
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('files', fs.createReadStream(filePath), {
        filename: originalName,
        contentType: safeMimetype,
      });
      
      const internalRes = await fetch(`http://localhost:${process.env.PORT || 5000}/api/projects/${projectId}/logos`, {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders(),
      });
      
      if (!internalRes.ok) {
        const errorText = await internalRes.text();
        console.error('Internal logo processing failed:', errorText);
        return res.status(internalRes.status).json({ error: 'Failed to process file', details: errorText });
      }
      
      const result = await internalRes.json();
      return res.json(result);
    } catch (error) {
      console.error('Chunked upload processing error:', error);
      res.status(500).json({ error: 'Failed to process uploaded file' });
    }
  });

  // Dropbox upload endpoint (disabled - Dropbox integration removed)
  app.post('/api/projects/:projectId/logos/dropbox-upload', async (_req, res) => {
    res.status(410).json({ error: 'Dropbox upload is no longer available. Please upload files directly (up to 500MB).' });
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
      console.log(`📋 Creating project with appliqueBadgesForm:`, projectData.appliqueBadgesForm ? JSON.stringify(projectData.appliqueBadgesForm).substring(0, 200) : 'NULL/UNDEFINED');
      const project = await storage.createProject(projectData);
      console.log(`📋 Created project ${project.id} - appliqueBadgesForm saved:`, !!project.appliqueBadgesForm);
      res.status(201).json(project);
    } catch (error) {
      console.error(`❌ Failed to create project:`, error);
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
      const rawCustomerCode = req.query.customerCode as string | undefined;
      const customerCode = rawCustomerCode?.trim().toLowerCase();
      const allAssignments = await storage.getAllCustomerTemplates();

      const restrictedTemplateIds = new Set<string>();
      for (const assignment of allAssignments) {
        restrictedTemplateIds.add(assignment.templateId);
      }

      const customerAllowedIds = new Set<string>();
      if (customerCode) {
        for (const assignment of allAssignments) {
          if (assignment.customerCode.toLowerCase() === customerCode) {
            customerAllowedIds.add(assignment.templateId);
          }
        }
      }

      const includeLandscape = req.query.includeLandscape === 'true';
      // For auto-generated `-landscape` orientation flips, check the customer's
      // assignment against EITHER the variant id OR its base portrait id, so a
      // single assignment unlocks both orientations (matches how non-exclusive
      // templates already behave — the landscape flip rides along with the base).
      const isAllowedById = (id: string): boolean => {
        if (customerAllowedIds.has(id)) return true;
        if (id.endsWith('-landscape')) {
          const baseId = id.slice(0, -'-landscape'.length);
          if (customerAllowedIds.has(baseId)) return true;
        }
        return false;
      };
      const filtered = templateSizes.filter(t => {
        if (!includeLandscape && t.id.endsWith('-landscape')) return false;
        // customerExclusive templates are hidden by default — only visible if the
        // requesting customer has an explicit assignment for them (or for the
        // base id of an auto-generated landscape flip).
        if ((t as any).customerExclusive) {
          return !!(customerCode && isAllowedById(t.id));
        }
        // Also honor the same base-id rule for restricted (non-exclusive) templates.
        const baseId = t.id.endsWith('-landscape')
          ? t.id.slice(0, -'-landscape'.length)
          : t.id;
        if (!restrictedTemplateIds.has(t.id) && !restrictedTemplateIds.has(baseId)) return true;
        if (customerCode && isAllowedById(t.id)) return true;
        return false;
      });

      res.json(filtered);
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

  app.get('/api/logos/:logoId/safari-png', guardRoute('safari-png'), async (req, res) => {
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
      
      const safariSvgContent = fs.readFileSync(svgToConvert, 'utf-8');
      // Same broken-compositing-group guard as the upload-time path — never let inkscape
      // attempt these SVGs; it will burn RAM with per-failed-href raster surfaces.
      const safariHasBrokenCompositingGroups = /compositing-group-\d+/.test(safariSvgContent);
      const safariWMatch = safariSvgContent.match(/width="([^"]+)"/);
      const safariHMatch = safariSvgContent.match(/height="([^"]+)"/);
      const safariW = safariWMatch ? parseFloat(safariWMatch[1]) : 200;
      const safariH = safariHMatch ? parseFloat(safariHMatch[1]) : 200;
      const safariScale = 4;
      const safariPngW = Math.round(safariW * safariScale);
      const safariPngH = Math.round(safariH * safariScale);
      const { exec: execAsyncImport2 } = await import('child_process');
      const { promisify: promisify2 } = await import('util');
      const execAsync2 = promisify2(execAsyncImport2);
      try {
        await execAsync2(`rsvg-convert "${svgToConvert}" -o "${pngPath}" -w ${safariPngW} -h ${safariPngH}`, { 
          timeout: 30000, killSignal: 'SIGKILL'
        });
      } catch (rsvgErr) {
        if (safariHasBrokenCompositingGroups) {
          console.log(`⏭️ Safari PNG: skipping inkscape fallback — broken PDF compositing-group refs present`);
          throw rsvgErr;
        }
        await execAsync2(`inkscape "${svgToConvert}" --export-filename="${pngPath}" --export-dpi=150`, {
          timeout: 15000, killSignal: 'SIGKILL'
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

  app.get('/api/logos/:logoId/colors', async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const logo = await storage.getLogo(logoId);
      if (!logo) return res.status(404).json({ error: 'Logo not found' });
      if (logo.mimeType !== 'image/svg+xml') return res.status(400).json({ error: 'Color extraction only works with SVG files' });

      const fsSync = await import('fs');
      const pathMod = await import('path');
      const filePath = pathMod.join('uploads', logo.filename);
      if (!fsSync.existsSync(filePath)) return res.status(404).json({ error: 'SVG file not found' });

      const svgContent = fsSync.readFileSync(filePath, 'utf-8');
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
      const doc = dom.window.document;
      const svgRoot = doc.documentElement;

      const colorMap = new Map<string, number[]>();
      let elementIndex = 0;

      const normalizeColor = (raw: string): string | null => {
        if (!raw || raw === 'none' || raw === 'transparent' || raw === 'inherit' || raw === 'currentColor') return null;
        raw = raw.trim().toLowerCase();
        if (raw.startsWith('#')) {
          if (raw.length === 4) {
            return '#' + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3];
          }
          return raw.slice(0, 7);
        }
        const rgbMatch = raw.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
        if (rgbMatch) {
          const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
          const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
          const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
          return `#${r}${g}${b}`;
        }
        const pctMatch = raw.match(/rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/);
        if (pctMatch) {
          const r = Math.round(parseFloat(pctMatch[1]) * 2.55).toString(16).padStart(2, '0');
          const g = Math.round(parseFloat(pctMatch[2]) * 2.55).toString(16).padStart(2, '0');
          const b = Math.round(parseFloat(pctMatch[3]) * 2.55).toString(16).padStart(2, '0');
          return `#${r}${g}${b}`;
        }
        const namedColors: Record<string, string> = {
          white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000',
          blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
        };
        return namedColors[raw] || null;
      };

      const processElement = (el: Element) => {
        if (el.tagName.toLowerCase() === 'defs') return;
        const currentIndex = elementIndex++;
        const tag = el.tagName.toLowerCase();
        if (tag !== 'svg') {
          const fill = el.getAttribute('fill');
          const stroke = el.getAttribute('stroke');
          const style = el.getAttribute('style') || '';
          const styleFill = style.match(/fill\s*:\s*([^;]+)/i)?.[1];
          const styleStroke = style.match(/stroke\s*:\s*([^;]+)/i)?.[1];

          const colors = [fill, stroke, styleFill, styleStroke]
            .map(c => c ? normalizeColor(c) : null)
            .filter(Boolean) as string[];

          const uniqueColors = [...new Set(colors)];
          for (const hex of uniqueColors) {
            if (!colorMap.has(hex)) colorMap.set(hex, []);
            colorMap.get(hex)!.push(currentIndex);
          }
        }

        Array.from(el.children).forEach(c => processElement(c));
      };
      processElement(svgRoot);

      const result = Array.from(colorMap.entries())
        .map(([hex, indices]) => ({
          color: hex,
          hex,
          count: indices.length,
          indices,
        }))
        .sort((a, b) => b.count - a.count);

      res.json(result);
    } catch (error) {
      console.error('Color extraction error:', error);
      res.status(500).json({ error: 'Failed to extract colors' });
    }
  });

  // Extract selected SVG elements into a new SVG file for embroidery canvas
  app.post('/api/logos/:logoId/extract-elements', guardRoute('extract-elements'), async (req, res) => {
    try {
      const logoId = req.params.logoId;
      const { selectedIndices, projectId, outlinesOnly, strokeWidth } = req.body;
      
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
          
          // Apply outlines-only if requested: remove fill, ensure stroke
          if (outlinesOnly) {
            const currentFill = el.getAttribute('fill') || el.style.fill;
            const currentStroke = el.getAttribute('stroke') || el.style.stroke;
            
            el.setAttribute('fill', 'none');
            el.style.fill = 'none';
            
            // If it had a fill and no stroke, use the fill color for the stroke
            if (currentFill && currentFill !== 'none' && (!currentStroke || currentStroke === 'none')) {
              el.setAttribute('stroke', currentFill);
            } else if (!currentStroke || currentStroke === 'none') {
              // Fallback to black if no color info at all
              el.setAttribute('stroke', '#000000');
            }
            
            // Apply adjustable stroke width (default to 1 if not provided)
            el.setAttribute('stroke-width', String(strokeWidth || '1'));
            el.style.strokeWidth = String(strokeWidth || '1');
          }
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
  app.post('/api/logos/:logoId/outline-fonts', guardRoute('outline-fonts'), async (req, res) => {
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

  // Order history endpoint - proxy to Odoo
  app.get('/api/order-history', async (req, res) => {
    try {
      const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
      const { page = '1', limit = '20', email = '', search = '' } = req.query;
      const clientCookies = req.headers.cookie || '';
      
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (email) {
        params.append('email', String(email));
      }
      const searchStr = String(search || '').trim();
      if (searchStr) {
        params.append('search', searchStr);
      }
      
      const odooUrl = `${odooBaseUrl}/artwork/api/order-history?${params.toString()}`;
      console.log(`📋 Fetching order history from Odoo: ${odooUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      
      let response;
      try {
        response = await fetch(odooUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Cookie': clientCookies,
          },
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          console.error('⏱️ Order history request timed out after 45s');
          return res.status(504).json({ 
            success: false, 
            error: 'Order history request timed out. Please try again.',
            orders: [], total: 0, page: 1, limit: 20, totalPages: 0 
          });
        }
        throw fetchErr;
      }
      clearTimeout(timeoutId);
      
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data.orders && Array.isArray(data.orders)) {
          const seen = new Map<number, any>();
          for (const o of data.orders) {
            const existing = seen.get(o.orderId);
            if (!existing) {
              seen.set(o.orderId, o);
            } else {
              if (o.deliveryStatus && !existing.deliveryStatus) {
                existing.deliveryStatus = o.deliveryStatus;
                existing.deliveryDate = o.deliveryDate;
                existing.carrierName = o.carrierName;
                existing.trackingRef = o.trackingRef;
              }
              if (o.artworkLines?.length) {
                const existingLineIds = new Set((existing.artworkLines || []).map((l: any) => l.lineId));
                for (const line of o.artworkLines) {
                  if (!existingLineIds.has(line.lineId)) {
                    existing.artworkLines.push(line);
                  }
                }
              }
            }
          }
          data.orders = Array.from(seen.values());
          for (const o of data.orders.slice(0, 3)) {
            console.log(`📋 Order ${o.orderName}: deliveryStatus=${o.deliveryStatus || 'MISSING'}, state=${o.state}`);
          }
        }
        res.status(response.status).json(data);
      } catch {
        console.error('❌ Non-JSON response from Odoo:', text.substring(0, 200));
        res.status(500).json({ success: false, error: 'Invalid response from order service' });
      }
    } catch (error) {
      console.error('❌ Order history fetch error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch order history' });
    }
  });
  
  // Order PDF download - proxy to Odoo
  app.get('/api/order-pdf/:lineId', async (req, res) => {
    try {
      const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
      const { lineId } = req.params;
      const { email = '' } = req.query;
      const clientCookies = req.headers.cookie || '';
      
      const params = email ? `?email=${encodeURIComponent(String(email))}` : '';
      const odooUrl = `${odooBaseUrl}/artwork/api/order-pdf/${lineId}${params}`;
      console.log(`📄 Downloading order PDF from Odoo: ${odooUrl}`);
      
      const response = await fetch(odooUrl, {
        method: 'GET',
        headers: {
          'Cookie': clientCookies,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).send(errorText);
      }
      
      const contentDisposition = response.headers.get('content-disposition');
      res.setHeader('Content-Type', 'application/pdf');
      if (contentDisposition) {
        res.setHeader('Content-Disposition', contentDisposition);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      console.error('❌ Order PDF download error:', error);
      res.status(500).send('Failed to download PDF');
    }
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

  const zipUpload = multer({
    dest: uploadDir,
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed' || 
          file.mimetype === 'application/x-zip' || file.originalname?.toLowerCase().endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('Only ZIP files are accepted'));
      }
    }
  });

  app.post('/api/projects/:id/attach-zip', zipUpload.single('zipFile'), async (req, res) => {
    try {
      const projectId = req.params.id;
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No ZIP file uploaded' });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        fs.unlinkSync(path.join(uploadDir, file.filename));
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.attachedZipPath) {
        const oldPath = path.join(uploadDir, path.basename(project.attachedZipPath));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const zipUrl = `/uploads/${file.filename}`;
      await storage.updateProject(projectId, {
        attachedZipPath: zipUrl,
        attachedZipName: file.originalname,
      });

      console.log(`📎 ZIP attached to project ${projectId}: ${file.originalname}`);
      res.json({
        success: true,
        zipPath: zipUrl,
        zipName: file.originalname,
        fileSize: file.size,
      });
    } catch (error) {
      console.error('❌ Attach ZIP error:', error);
      res.status(500).json({ error: 'Failed to attach ZIP file' });
    }
  });

  app.delete('/api/projects/:id/attach-zip', async (req, res) => {
    try {
      const projectId = req.params.id;
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.attachedZipPath) {
        const filePath = path.join(uploadDir, path.basename(project.attachedZipPath));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        await storage.updateProject(projectId, {
          attachedZipPath: null,
          attachedZipName: null,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Remove ZIP error:', error);
      res.status(500).json({ error: 'Failed to remove ZIP file' });
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

      // Always use server-side VITE_ODOO_URL to avoid proxying back to ourselves
      const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
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

      // Look up product code from template for inclusion in Odoo data
      let productCode: string | null = null;
      if (projectData.templateSize) {
        try {
          const templateSizes = await storage.getTemplateSizes();
          const matchedTemplate = templateSizes.find((t: any) => t.id === projectData.templateSize);
          if (matchedTemplate?.productCode) {
            productCode = matchedTemplate.productCode;
            console.log(`📋 Product code for template ${projectData.templateSize}: [${productCode}]`);
          }
        } catch (e) {
          console.warn('⚠️ Could not look up product code:', e);
        }
      }

      let zipBase64: string | undefined;
      let zipFileName: string | undefined;
      let isRepeatOrder = false;
      if (!isVectorizationOnly && projectId !== 'vector-service') {
        try {
          const proj = await storage.getProject(projectId);
          if (proj?.attachedZipPath) {
            isRepeatOrder = true;
            zipFileName = proj.attachedZipName || path.basename(proj.attachedZipPath) || 'repeat-order.zip';
            const zipFilePath = path.join('./uploads', path.basename(proj.attachedZipPath));
            if (fs.existsSync(zipFilePath)) {
              const zipStat = fs.statSync(zipFilePath);
              const zipSizeMB = (zipStat.size / 1024 / 1024).toFixed(1);
              console.log(`📎 ZIP file found (${zipSizeMB}MB): ${zipFileName}`);
              const zipBuffer = fs.readFileSync(zipFilePath);
              // Include ZIP inline in the add-to-cart body (same pattern as DTF quick upload).
              // Odoo's add-to-cart handler creates the ir.attachment on the order line
              // atomically, so _sync_zip_attachments_to_task reliably finds it when the
              // manufacturing task is created later.
              zipBase64 = zipBuffer.toString('base64');
              console.log(`📎 ZIP ready for inline add-to-cart (${zipSizeMB}MB → ${(zipBase64.length / 1024 / 1024).toFixed(1)}MB base64): ${zipFileName}`);
            } else {
              console.warn(`⚠️ Attached ZIP not found on disk: ${zipFilePath}`);
            }
          }
        } catch (e) {
          console.warn('⚠️ Could not process attached ZIP:', e);
        }
      }

      // Also treat order-history reorders (reorderLineId sent from frontend) as repeat orders
      if (projectData.reorderLineId) {
        isRepeatOrder = true;
        console.log(`🔁 Order-history reorder detected (source line: ${projectData.reorderLineId}) — marking as repeat`);
      }

      const isAppliqueTemplate = projectData.templateSize?.includes('applique');
      const includeDstProofing = isAppliqueTemplate && !isRepeatOrder;
      console.log(`🔍 DST proofing check: templateSize="${projectData.templateSize}", isApplique=${isAppliqueTemplate}, isRepeat=${isRepeatOrder}, includeDst=${includeDstProofing}`);
      if (includeDstProofing) {
        console.log(`📋 Applique order (new) - including DST proofing charge [DSTF]`);
      } else if (isAppliqueTemplate && isRepeatOrder) {
        console.log(`📋 Applique order (repeat) - skipping DST proofing charge`);
      }

      const ctWebsiteId = process.env.VITE_ODOO_CT_WEBSITE_ID || '2';
      // Replace generic defaults with a template-based name so Odoo tasks are identifiable
      let rawProjectName = (projectData.name || '').replace(/_/g, ' ').trim();
      if (!rawProjectName || rawProjectName.toLowerCase() === 'untitled project') {
        if (zipFileName) {
          // Use the ZIP filename as the project name
          rawProjectName = zipFileName.replace(/[-_]/g, ' ').trim();
        } else {
          const templateLabel = (() => {
            if (!projectData.templateSize) return '';
            const t = projectData.templateSize as string;
            if (t.startsWith('applique-')) return 'Applique Order';
            if (t.startsWith('dtf-')) return 'DTF Order';
            if (t.startsWith('single-')) return 'Single Colour Order';
            if (t.startsWith('metallic-')) return 'Metallic Transfer';
            if (t.startsWith('sublimation-')) return 'Sublimation Order';
            if (t.startsWith('woven-')) return 'Custom Badge Order';
            if (t.startsWith('reflective-')) return 'Reflective Transfer';
            if (t.startsWith('hd-')) return 'HD Transfer';
            return 'Artwork Order';
          })();
          rawProjectName = templateLabel || 'Artwork Order';
        }
      }
      const projectName = rawProjectName;
      // Read the project from the DB to get the authoritative quantity.
      // The frontend sends currentProject.quantity but that can be stale or defaulted to 1
      // if the user didn't go through the template selector (e.g. Odoo-launched projects).
      let dbProjectQty: number | null = null;
      if (projectId && projectId !== 'vector-service') {
        try {
          const dbProj = await storage.getProject(projectId);
          if (dbProj && dbProj.quantity && dbProj.quantity > 1) {
            dbProjectQty = dbProj.quantity;
          }
        } catch (_e) { /* non-critical */ }
      }
      const orderQty = dbProjectQty || projectData.totalQuantity || projectData.quantity || 1;
      const artworkFilename = `${projectName} qty${orderQty}.pdf`;

      // --- Large PDF replacement ---
      // pdf-lib (client-side) embeds the raw source file, which inflates the production PDF
      // to 50–70 MB for large artwork files. Odoo's nginx API endpoint rejects bodies above
      // ~40 MB (ECONNRESET). When the client PDF is too large we replace it with the
      // server-generated production PDF, which uses Ghostscript and produces a much smaller
      // file (~1–2 MB) while preserving the same layout, CMYK colours, and quality.
      const PDF_INLINE_MAX_CHARS = 40 * 1024 * 1024; // ~30 MB decoded ≈ ~40 MB base64
      let offloadedPdfBase64: string | undefined;
      let offloadedPdfFilename: string | undefined;

      // Compress a PDF buffer using Ghostscript. Defaults to /prepress (high quality, no
      // downsampling, safest for production print). Pass mode='ebook' or 'screen' as an
      // escalating fallback when the /prepress output is still too large for downstream
      // body limits (Odoo nginx ~40 MB) — these tiers permit raster downsampling and
      // shrink the file dramatically while still being acceptable for production proof.
      const compressPdfBuffer = async (
        buf: Buffer,
        mode: 'prepress' | 'ebook' | 'screen' = 'prepress',
      ): Promise<Buffer> => {
        const tmpIn  = `/tmp/compress_in_${Date.now()}_${mode}.pdf`;
        const tmpOut = `/tmp/compress_out_${Date.now()}_${mode}.pdf`;
        const noDownsample = mode === 'prepress'
          ? '-dDownsampleColorImages=false -dDownsampleGrayImages=false -dDownsampleMonoImages=false'
          : ''; // ebook/screen: let GS downsample images per its built-in defaults
        try {
          fs.writeFileSync(tmpIn, buf);
          await new Promise<void>((resolve, reject) => {
            exec(
              `gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/${mode} -dColorConversionStrategy=/LeaveColorUnchanged ${noDownsample} -sOutputFile=${tmpOut} ${tmpIn}`,
              { timeout: 60000 },
              (err: Error | null) => { if (err) reject(err); else resolve(); }
            );
          });
          if (fs.existsSync(tmpOut)) {
            const compressed = fs.readFileSync(tmpOut);
            const ratio = ((1 - compressed.length / buf.length) * 100).toFixed(0);
            console.log(`🗜️ GS compression (/${mode}): ${(buf.length/1024/1024).toFixed(1)}MB → ${(compressed.length/1024/1024).toFixed(1)}MB (${ratio}% reduction)`);
            return compressed.length < buf.length ? compressed : buf;
          }
        } catch (e: any) {
          console.warn(`⚠️ GS compression /${mode} failed (using original):`, e.message);
        } finally {
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
        }
        return buf;
      };

      const needsServerPdf = !isRepeatOrder
        && ((projectData.pdfBase64 && projectData.pdfBase64.length > PDF_INLINE_MAX_CHARS)
          || (!projectData.pdfBase64 && projectId && projectId !== 'vector-service'));

      if (isRepeatOrder && !projectData.pdfBase64) {
        console.log(`📦 Repeat order with ZIP — skipping server-side PDF generation`);
      }

      // Escalating in-line compression: /prepress → /ebook → /screen, returning
      // the smallest base64 string that fits under PDF_INLINE_MAX_CHARS, or the
      // smallest available payload if even /screen can't fit. Keeps the PDF in
      // the add-to-cart body whenever possible so we DON'T have to fall back
      // on /artwork/api/attach-pdf — observed in production (SO89393 / MMC DTF
      // / teemaster@serigraf.com) that attach-pdf 404s for some
      // iframe/customer combinations regardless of payload size, leaving the
      // order with no artwork. /ebook + /screen permit raster downsampling and
      // typically shrink DTF raster files by >99% (e.g. 123 MB → 0.4 MB),
      // which fits inline trivially.
      const compressUntilFits = async (buf: Buffer, label: string): Promise<{ b64: string; fits: boolean }> => {
        const tiers: Array<'prepress' | 'ebook' | 'screen'> = ['prepress', 'ebook', 'screen'];
        let best = buf;
        for (const tier of tiers) {
          const out = await compressPdfBuffer(best, tier);
          if (out.length < best.length) best = out;
          const b64 = best.toString('base64');
          if (b64.length <= PDF_INLINE_MAX_CHARS) {
            console.log(`✅ ${label} fits inline after /${tier}: ${(b64.length/1024/1024).toFixed(1)}MB base64`);
            return { b64, fits: true };
          }
          console.log(`📦 ${label} after /${tier}: ${(b64.length/1024/1024).toFixed(1)}MB base64 — still over inline cap, escalating`);
        }
        return { b64: best.toString('base64'), fits: false };
      };

      if (needsServerPdf) {
        const reason = projectData.pdfBase64
          ? `Client PDF too large (${(projectData.pdfBase64.length / 1024 / 1024).toFixed(1)}MB base64)`
          : 'No PDF sent by client (skipped large PDF)';
        console.log(`📦 ${reason} — generating server-side`);
        let serverPdfBuf: Buffer | undefined;
        try {
          const selfBase = `http://localhost:${process.env.PORT || 5000}`;
          const pdfGenController = new AbortController();
          // Generous timeout: 180 s. Large-format DTF imposition with 100+ elements
          // (e.g. SO89576 / Mayo co co — 180 elements × `dtf_next_day`) can take
          // ~60-65 s end-to-end. The previous 60 s cap aborted just as the render
          // was finishing — sourceBuf then ended up undefined and the order was
          // created with no artwork (silent failure: no attach-pdf attempted, no
          // EXHAUSTED warning). 180 s leaves comfortable headroom and is still
          // shorter than the customer-perceivable "stuck" threshold.
          const pdfGenTimeout = setTimeout(() => pdfGenController.abort(), 180000);
          const genRes = await fetch(`${selfBase}/api/projects/${projectId}/generate-pdf`, {
            headers: { cookie: req.headers.cookie || '' },
            signal: pdfGenController.signal,
          });
          clearTimeout(pdfGenTimeout);
          if (genRes.ok) {
            serverPdfBuf = Buffer.from(await genRes.arrayBuffer());
            console.log(`✅ Server PDF generated: ${(serverPdfBuf.length/1024/1024).toFixed(1)}MB raw`);
          } else {
            console.warn(`⚠️ Server PDF generation failed (${genRes.status}) — will fall back to client PDF`);
          }
        } catch (genErr) {
          console.warn(`⚠️ Server PDF generation error — will fall back to client PDF:`, genErr);
        }

        // Choose source: server PDF preferred (smaller layout), fall back to client PDF.
        // Then escalate compression until it fits inline; only offload if even /screen
        // can't get below the cap.
        const sourceBuf = serverPdfBuf
          ?? (projectData.pdfBase64 ? Buffer.from(projectData.pdfBase64, 'base64') : undefined);
        const sourceLabel = serverPdfBuf ? 'Server PDF' : 'Client PDF (fallback)';
        if (sourceBuf) {
          const { b64, fits } = await compressUntilFits(sourceBuf, sourceLabel);
          if (fits) {
            projectData.pdfBase64 = b64;
          } else {
            console.warn(`⚠️ ${sourceLabel} still ${(b64.length/1024/1024).toFixed(1)}MB after /screen — falling back to attach-pdf offload`);
            offloadedPdfBase64 = b64;
            offloadedPdfFilename = artworkFilename;
          }
        } else {
          // Defensive: should not happen now that the timeout is generous, but if
          // both server PDF gen and the client fallback are missing we'd otherwise
          // silently send an artwork-less add-to-cart (observed in production with
          // the previous 60 s abort: SO89576 / Mayo co co — order created with no
          // PDF, no attach-pdf attempted, no EXHAUSTED warning). Logging loudly so
          // the next regression is at least visible in deployment logs.
          console.error(`❌❌❌ NO PDF SOURCE for project ${projectId} (server gen failed AND no client PDF) — order will be created WITHOUT artwork. Project: "${projectName}", template: ${projectData.templateSize}, elements: ${projectData.canvasElements?.length ?? 'unknown'}`);
        }
      }

      if (projectData.pdfBase64) {
        const pdfSizeMB = (projectData.pdfBase64.length / 1024 / 1024).toFixed(1);
        console.log(`📄 Production PDF size: ${pdfSizeMB}MB base64 (inline: ${!offloadedPdfBase64})`);
      }

      const requestBody: any = {
        ...projectData,
        source: 'completetransfers',
        website_id: parseInt(ctWebsiteId, 10),
        artworkFilename,
        ...(productCode && { product_code: productCode }),
        ...(isVectorizationOnly && { template_id: 'vector-service' }),
        ...(includeDstProofing && { include_dst_proofing: true, dst_product_code: 'DSTF' }),
      };
      // Strip the large client PDF if we're falling back to separate attach-pdf
      if (offloadedPdfBase64) {
        delete requestBody.pdfBase64;
      }
      // For repeat orders with a ZIP: send the ZIP as pdfBase64 so Odoo stores it as
      // artwork_files_datas — exactly the same mechanism as DTF Quick Upload.
      // No Odoo module changes needed; the existing add-to-cart handler already handles pdfBase64.
      if (zipBase64 && zipFileName) {
        requestBody.pdfBase64 = zipBase64;
        requestBody.artworkFilename = zipFileName;
        console.log(`📎 ZIP sent as pdfBase64 (${(zipBase64.length/1024/1024).toFixed(1)}MB base64): ${zipFileName}`);
      }

      // Call Odoo add-to-cart API with one automatic retry on transient connection errors
      // (e.g. "socket hang up" caused by Odoo worker restarts or brief overload)
      const RETRYABLE = ['socket hang up', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'network timeout'];
      const isRetryable = (err: unknown) =>
        err instanceof Error && RETRYABLE.some(msg => err.message.toLowerCase().includes(msg.toLowerCase()));

      const fetchOdoo = () => fetch(odooApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': clientCookies,
          ...(requestBody.partnerEmail && { 'X-Partner-Email': requestBody.partnerEmail }),
        },
        body: JSON.stringify(requestBody),
      });

      let response: Awaited<ReturnType<typeof fetchOdoo>>;
      try {
        response = await fetchOdoo();
      } catch (firstErr) {
        if (isRetryable(firstErr)) {
          console.warn(`⚠️ Odoo connection dropped (${(firstErr as Error).message}) — retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
          response = await fetchOdoo(); // let second failure propagate naturally
        } else {
          throw firstErr;
        }
      }

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

      // --- Follow-up: attach large PDF via /artwork/api/attach-pdf ---
      // This sets artwork_files_datas on the order line (not just an ir.attachment),
      // which triggers the write hook that syncs artwork_image to the task.
      //
      // ROBUSTNESS: Odoo's nginx rejects bodies above ~40 MB (ECONNRESET). The primary
      // defence is the embedPdf dedup in robust-pdf-generator.ts which keeps imposition
      // outputs small. As belt-and-braces, we ALSO escalate compression here on failure:
      //  attempt 1: payload as built upstream (already /prepress compressed if it came
      //             through the offload path)
      //  attempt 2: same payload after a 1.5 s wait (covers transient ECONNRESET)
      //  attempt 3: re-compress with /ebook (allows raster downsampling) and retry
      //  attempt 4: re-compress with /screen (most aggressive) and retry
      // We never surface the failure to the customer — if every attempt fails we log
      // loudly so it shows up in monitoring, but the user just sees "Added to Cart"
      // (the cart line itself succeeded; warning the user would risk them re-adding
      // the item and producing a duplicate Odoo order).
      if (offloadedPdfBase64 && offloadedPdfFilename && data?.order_line_id) {
        const attachPdfUrl = `${odooBaseUrl}/artwork/api/attach-pdf`;
        let currentBase64 = offloadedPdfBase64;
        const buildPayload = (b64: string) => JSON.stringify({
          order_line_id: data.order_line_id,
          sale_order_id: data.website_sale_order,
          pdf_base64: b64,
          pdf_filename: offloadedPdfFilename,
        });
        const tryAttach = async (label: string): Promise<{ ok: boolean; status: number; body: any; err?: string }> => {
          const payload = buildPayload(currentBase64);
          console.log(`📄 attach-pdf [${label}] for order_line #${data.order_line_id} (${(payload.length / 1024 / 1024).toFixed(1)}MB body, ${(currentBase64.length / 1024 / 1024).toFixed(1)}MB pdf base64)`);
          try {
            const r = await fetch(attachPdfUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cookie': clientCookies,
                // Mirror add-to-cart: iframe sessions can't propagate cookies
                // cross-origin, so the partner email header is the only signal
                // Odoo has to identify the user/website. Observed in production
                // (SO89393 / teemaster@serigraf.com / MMC DTF): without this
                // header the route 404s with empty body even for tiny payloads,
                // because website/dispatch can't resolve the request context.
                ...((requestBody as any)?.partnerEmail && { 'X-Partner-Email': (requestBody as any).partnerEmail }),
              },
              body: payload,
            });
            const body = await r.json().catch(() => ({}));
            if (r.ok) {
              console.log(`✅ attach-pdf [${label}] succeeded:`, body.attached_to);
              return { ok: true, status: r.status, body };
            }
            const err = `HTTP ${r.status}: ${JSON.stringify(body).substring(0, 200)}`;
            console.warn(`⚠️ attach-pdf [${label}] failed: ${err}`);
            return { ok: false, status: r.status, body, err };
          } catch (e: any) {
            const err = `Network: ${e?.message || String(e)}`;
            console.warn(`⚠️ attach-pdf [${label}] network error: ${err}`);
            return { ok: false, status: 0, body: null, err };
          }
        };
        const recompress = async (mode: 'ebook' | 'screen'): Promise<boolean> => {
          try {
            const buf = Buffer.from(currentBase64, 'base64');
            const out = await compressPdfBuffer(buf, mode);
            if (out.length < buf.length) {
              currentBase64 = out.toString('base64');
              return true;
            }
            console.log(`ℹ️ /${mode} did not shrink payload — skipping retry at this tier`);
            return false;
          } catch (e: any) {
            console.warn(`⚠️ recompress /${mode} failed:`, e?.message || e);
            return false;
          }
        };
        const attempts: { label: string; err?: string }[] = [];
        const recordAttempt = (label: string, r: { ok: boolean; err?: string }) => {
          attempts.push({ label, err: r.ok ? undefined : r.err });
          return r.ok;
        };

        // Pre-emptive shrink: if the offloaded payload is already known to
        // approach Odoo's nginx body limit (~40 MB), do NOT burn attempts on
        // it. Observed in production (SO89393 / b34f2eee, MMC DTF 122 MB
        // source): attempts 1+2 with a 164 MB body got ECONNRESET at the
        // nginx layer, and that nginx-level drop INVALIDATED the Odoo
        // session — attempts 3+4 with a re-compressed 0.5 MB body then
        // returned HTTP 404 from `/artwork/api/attach-pdf` and the order
        // ended up with no artwork. Compressing up-front keeps the first
        // request landing with a payload nginx will forward, preserving
        // the authenticated session.
        //
        // Target ~32 MB base64 (well below the ~40 MB nginx cap) so the
        // JSON envelope (order_line_id, sale_order_id, pdf_filename,
        // quoting overhead) can never push us over. PDF_INLINE_MAX_CHARS
        // is at the cap and unsafe as a pre-shrink target.
        const ATTACH_PDF_SAFE_BASE64 = 32 * 1024 * 1024;
        if (currentBase64.length > ATTACH_PDF_SAFE_BASE64) {
          console.log(`📄 attach-pdf pre-shrink: offloaded payload ${(currentBase64.length / 1024 / 1024).toFixed(1)}MB exceeds safe cap (${ATTACH_PDF_SAFE_BASE64 / 1024 / 1024}MB) — running /ebook before attempt-1 to avoid nginx-kill + session invalidation`);
          await recompress('ebook');
          if (currentBase64.length > ATTACH_PDF_SAFE_BASE64) {
            console.log(`📄 attach-pdf pre-shrink: still ${(currentBase64.length / 1024 / 1024).toFixed(1)}MB after /ebook — escalating to /screen before attempt-1`);
            await recompress('screen');
          }
          if (currentBase64.length > ATTACH_PDF_SAFE_BASE64) {
            console.warn(`⚠️ attach-pdf pre-shrink: payload still ${(currentBase64.length / 1024 / 1024).toFixed(1)}MB after /ebook + /screen — proceeding anyway, but expect upstream rejection`);
          }
        }

        let attached = recordAttempt('attempt-1', await tryAttach('attempt-1'));
        if (!attached) {
          await new Promise(r => setTimeout(r, 1500));
          attached = recordAttempt('attempt-2-retry', await tryAttach('attempt-2-retry'));
        }
        if (!attached && await recompress('ebook')) {
          attached = recordAttempt('attempt-3-ebook', await tryAttach('attempt-3-ebook'));
        }
        if (!attached && await recompress('screen')) {
          attached = recordAttempt('attempt-4-screen', await tryAttach('attempt-4-screen'));
        }
        if (!attached) {
          // Last-ditch: order is in Odoo without artwork. Log loud + email ops (with
          // cooldown) so a stuck failure mode is visible. Do NOT surface to the user
          // (warning would tempt re-adding and produce a duplicate Odoo order).
          console.error(`❌❌❌ ATTACH-PDF EXHAUSTED for order_line #${data.order_line_id} — order in Odoo with NO artwork. Filename=${offloadedPdfFilename}, finalBase64=${(currentBase64.length / 1024 / 1024).toFixed(1)}MB`);
          // Fire-and-forget — don't block the response on the email; cooldown is per-process.
          alertAttachPdfExhausted({
            orderLineId: data.order_line_id,
            filename: offloadedPdfFilename,
            finalBase64Mb: currentBase64.length / 1024 / 1024,
            attempts,
            partnerEmail: (projectData as any)?.partnerEmail,
            projectName: (projectData as any)?.name,
          }).catch(e => console.error('[ATTACH-PDF-ALERT] dispatch failed:', e?.message || e));
        }
      } else if (offloadedPdfBase64 && !data?.order_line_id) {
        console.error(`❌ Large PDF ready but no order_line_id from Odoo — PDF not attached. Keys: ${Object.keys(data || {}).join(',')}`);
      }

      console.log(`✅ Successfully added to cart:`, { ...data, order_line_id: data?.order_line_id });
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

      let serviceType = req.body.serviceType || 'vectorization-with-product'; // Default to legacy behavior

      // Server-side enforcement: vectorisation-only customers can never submit
      // a transfer product alongside their vectorisation request. Override the
      // serviceType regardless of what the client sent.
      try {
        const customerEmail: string | undefined = req.body.customerCode || req.body.partnerEmail || req.body.email;
        if (customerEmail) {
          const assignments = await storage.getCustomerTemplates(customerEmail);
          const isVectorOnly = assignments.some((a: any) => a.templateId === '__vectorization_only__');
          if (isVectorOnly) {
            serviceType = 'vectorization-only';
          }
        }
      } catch (err) {
        console.warn('Could not enforce vectorization-only flag:', err);
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

      // Color name lookup for human-readable comments
      const GARMENT_COLOR_NAMES: Record<string, string> = {
        "#FFFFFF": "White", "#171816": "Black", "#D9D2AB": "Natural Cotton",
        "#F3F590": "Pastel Yellow", "#F0F42A": "Yellow", "#D7DA14": "Hi Viz",
        "#D98F17": "Hi Viz Orange", "#388032": "HiViz Green", "#BF0072": "HIViz Pink",
        "#767878": "Sports Grey", "#919393": "Light Grey Marl", "#A6A9A2": "Ash Grey",
        "#BCBFBB": "Light Grey", "#353330": "Charcoal Grey", "#B9DBEA": "Pastel Blue",
        "#5998D4": "Sky Blue", "#201C3A": "Navy", "#221866": "Royal Blue",
        "#B5D55E": "Pastel Green", "#90BF33": "Lime Green", "#3C8A35": "Kelly Green",
        "#E7BBD0": "Pastel Pink", "#D287A2": "Light Pink", "#C42469": "Fuchsia Pink",
        "#C02300": "Red", "#762009": "Burgundy", "#4C0A6A": "Purple",
      };
      const INK_COLOR_NAMES: Record<string, string> = {
        "#FFFFFF": "OT 91 White", "#201F1E": "OT 100 Black",
        "#C0C4C6": "OT 155 Pantone 428 C", "#515859": "OT 156 Pantone 445 C",
        "#5F58AD": "OT 10 Pantone 2102 C", "#294487": "OT 20 Pantone 7687 C",
        "#217B87": "OT 22 Pantone 7461 C", "#1F66A0": "OT 24 Pantone 4151 C",
        "#00A1DD": "OT 26 Pantone 2202 C", "#0099B6": "OT 27 Pantone 2229 C",
        "#132A3F": "OT 96 Pantone 2965 C", "#406044": "OT 30 Pantone 7734 C",
        "#4E926E": "OT 31 Pantone 7724 C", "#83A756": "OT 32 Pantone 7489 C",
        "#3E9B54": "OT 33 Pantone 7482 C", "#93BA1E": "OT 34 Pantone 376 C",
        "#F3DF41": "OT 40 Pantone 107 C", "#F3D83E": "OT 41 Pantone 115 C",
        "#F3C53F": "OT 42 Pantone 123 C", "#E66828": "OT 50 Pantone 165 C",
        "#DF4E10": "OT 51 Pantone 1655 C", "#C53F33": "OT 56 Pantone 179 C",
        "#B3363C": "OT 60 Pantone 1797 C", "#D02E39": "OT 61 Pantone 1788 C",
        "#B25796": "OT 70 Pantone 674 C", "#5B3637": "OT 80 Pantone 1817 C",
        "#A2832D": "OT 81 Pantone 1255 C", "#83754E": "OT 120 Pantone 871 C Gold",
        "#8C8E91": "OT 110 Pantone 877 C Silver",
      };
      const garmentLookup: Record<string, string> = {};
      for (const [k, v] of Object.entries(GARMENT_COLOR_NAMES)) {
        garmentLookup[k.toUpperCase()] = v;
      }
      const inkLookup: Record<string, string> = {};
      for (const [k, v] of Object.entries(INK_COLOR_NAMES)) {
        inkLookup[k.toUpperCase()] = v;
      }
      const getGarmentColorName = (hex: string | undefined | null): string => {
        if (!hex) return '';
        return garmentLookup[hex.toUpperCase()] || hex;
      };
      const getInkColorName = (hex: string | undefined | null): string => {
        if (!hex) return '';
        return inkLookup[hex.toUpperCase()] || hex;
      };
      const garmentColorName = getGarmentColorName(req.body.garmentColor);
      const inkColorName = getInkColorName(req.body.inkColor);

      // Add items to Odoo cart
      const cartResults = {
        vectorizationAdded: false,
        transferAdded: false,
        cartUrl: '/shop/cart'
      };

      try {
        // Always use server-side VITE_ODOO_URL to avoid proxying back to ourselves
        const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
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
        // IMPORTANT: Use a unique project UUID per request (vec-<id>) so each vectorization
        // order gets its own artwork.project record in Odoo. Using a shared ID (e.g. 'vector-service')
        // causes all requests to share one project — when comments update, they overwrite every
        // previously linked order line.
        const vecProjectUuid = `vec-${vectorizationRequest.id}`;
        const vectorServiceResponse = await fetch(`${odooBaseUrl}/artwork/api/projects/${vecProjectUuid}/add-to-cart`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': clientCookies,
          },
          body: JSON.stringify({
            name: `Vectorization - ${customerFileName}`,
            serviceType: 'vectorization-only',
            requestId: vectorizationRequest.id,
            source: 'completetransfers',
            website_id: parseInt(ctWebsiteId, 10),
            template_id: 'vector-service',
            partnerEmail: partnerEmail,
            pdfBase64: customerFileBase64,
            artworkFilename: customerFileName,
            comments: `Vectorization Request #${vectorizationRequest.id}\nFile: ${customerFileName}\nPrint Size: ${req.body.printSize}${req.body.garmentColor ? `\nGarment Colour: ${garmentColorName} (${req.body.garmentColor})` : ''}${req.body.inkColor ? `\nInk Colour: ${inkColorName} (${req.body.inkColor})` : ''}\nRequirements: ${req.body.comments}`,
            printSize: req.body.printSize || '',
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
          
          const sizePlaceholderMap: Record<string, string> = {
            '297x420': 'A3 Placeholder.pdf',
            '210x297': 'A4 Placeholder.pdf',
            '148x210': 'A5 Placeholder.pdf',
            '148x105': 'A6 Placeholder.pdf',
            '295x100': '295x100 Placeholder.pdf',
            '295x300': '295X300 Placeholder.pdf',
            '60x60': '60X60 Placeholder.pdf',
            '100x70': '70x100 Placeholder.pdf',
            '70x100': '70x100 Placeholder.pdf',
            '95x95': '95x95 Placeholder.pdf',
          };
          
          const findPlaceholder = async (templateId: string): Promise<string | null> => {
            const templateSizes = await storage.getTemplateSizes();
            const tmpl = templateSizes.find(t => t.id === templateId);
            if (tmpl) {
              const sizeKey = `${tmpl.width}x${tmpl.height}`;
              const file = sizePlaceholderMap[sizeKey];
              if (file) {
                const filePath = path.join(process.cwd(), 'server', 'placeholders', file);
                console.log(`🔍 Placeholder lookup: ${templateId} → ${sizeKey} → ${file}`);
                return filePath;
              }
              console.log(`⚠️ No placeholder for size ${sizeKey} (template: ${templateId})`);
            } else {
              console.log(`⚠️ Template not found: ${templateId}`);
            }
            const tid = templateId.toLowerCase();
            for (const [key, file] of Object.entries(sizePlaceholderMap)) {
              if (tid.includes(key.toLowerCase())) {
                return path.join(process.cwd(), 'server', 'placeholders', file);
              }
            }
            return null;
          };
          
          let pdfBase64 = '';
          const selectedPlaceholder = await findPlaceholder(req.body.transferProduct);
          const garmentColorHex = req.body.garmentColor || '';

          // Helper: try to read a file, return null on any I/O error (e.g. EIO from
          // a corrupted Nix-store snapshot). Never throws.
          const safeReadFile = (p: string): Buffer | null => {
            try {
              if (!fs.existsSync(p)) return null;
              return fs.readFileSync(p);
            } catch (readErr) {
              console.warn(`⚠️ Could not read ${p}:`, (readErr as Error).message);
              return null;
            }
          };

          try {
            const { PDFDocument, rgb } = await import('pdf-lib');

            let placeholderDoc: any;
            let pageWidth: number;
            let pageHeight: number;

            const placeholderBytes = selectedPlaceholder ? safeReadFile(selectedPlaceholder) : null;
            if (placeholderBytes) {
              placeholderDoc = await PDFDocument.load(placeholderBytes);
              const firstPage = placeholderDoc.getPage(0);
              const { width, height } = firstPage.getSize();
              pageWidth = width;
              pageHeight = height;
              console.log(`📄 Loaded sized placeholder: ${path.basename(selectedPlaceholder!)} (${pageWidth}×${pageHeight}pts)`);
            } else {
              const fallbackPath = path.join(process.cwd(), 'server', 'assets', 'Vector_Service.pdf');
              const fallbackBytes = safeReadFile(fallbackPath);
              if (fallbackBytes) {
                placeholderDoc = await PDFDocument.load(fallbackBytes);
                const firstPage = placeholderDoc.getPage(0);
                const { width, height } = firstPage.getSize();
                pageWidth = width;
                pageHeight = height;
                console.log(`📄 Using fallback placeholder (${pageWidth}×${pageHeight}pts)`);
              } else {
                placeholderDoc = await PDFDocument.create();
                pageWidth = 841.89;
                pageHeight = 1190.55;
                placeholderDoc.addPage([pageWidth, pageHeight]);
                console.log('⚠️ No placeholder file readable, created blank A3 page in-memory');
              }
            }

            if (garmentColorHex) {
              const hex = garmentColorHex.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16) / 255;
              const g = parseInt(hex.substring(2, 4), 16) / 255;
              const b = parseInt(hex.substring(4, 6), 16) / 255;

              const colorPage = placeholderDoc.addPage([pageWidth, pageHeight]);
              colorPage.drawRectangle({
                x: 0, y: 0,
                width: pageWidth, height: pageHeight,
                color: rgb(r, g, b),
              });
              console.log(`🎨 Added garment colour page: ${garmentColorHex} (${pageWidth}×${pageHeight}pts)`);
            }

            const pdfBytes = await placeholderDoc.save();
            pdfBase64 = Buffer.from(pdfBytes).toString('base64');
            console.log(`📄 Generated ${placeholderDoc.getPageCount()}-page placeholder PDF: ${(pdfBase64.length / 1024).toFixed(0)}KB base64`);
          } catch (pdfErr) {
            console.warn('⚠️ Placeholder PDF generation failed, falling back to minimal in-memory PDF:', pdfErr);
            // Final fallback: build a minimal blank A3 PDF in memory so the
            // transfer product line still gets posted to Odoo. We never want
            // a disk error to silently drop the transfer item from the cart.
            try {
              const { PDFDocument } = await import('pdf-lib');
              const minimalDoc = await PDFDocument.create();
              minimalDoc.addPage([841.89, 1190.55]);
              const minimalBytes = await minimalDoc.save();
              pdfBase64 = Buffer.from(minimalBytes).toString('base64');
              console.log(`📄 Generated minimal in-memory placeholder PDF: ${(pdfBase64.length / 1024).toFixed(0)}KB base64`);
            } catch (minimalErr) {
              console.error('❌ Even minimal PDF generation failed:', minimalErr);
              pdfBase64 = '';
            }
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
              comments: `Vectorization Request #${vectorizationRequest.id}\nOriginal File: ${vectorizationRequest.originalName}\nPrint Size: ${req.body.printSize}${req.body.garmentColor ? `\nGarment Colour: ${garmentColorName} (${req.body.garmentColor})` : ''}${req.body.inkColor ? `\nInk Colour: ${inkColorName} (${req.body.inkColor})` : ''}\nRequirements: ${req.body.comments}\nTemplate: ${req.body.transferProduct || 'N/A'}`,
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
      const odooBaseUrl = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
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

  // === REPEAT APPLIQUE ORDER (ZIP UPLOAD) ===
  app.post('/api/projects/repeat-applique-zip', zipUpload.single('zipFile'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No ZIP file uploaded' });
      }

      const AdmZip = (await import('adm-zip')).default;
      const zipPath = path.join(uploadDir, file.filename);
      
      let zip: InstanceType<typeof AdmZip>;
      try {
        zip = new AdmZip(zipPath);
      } catch (zipErr) {
        fs.unlinkSync(zipPath);
        return res.status(400).json({ error: 'Invalid or corrupted ZIP file' });
      }

      const entries = zip.getEntries();
      
      const artworkExts = ['.pdf', '.svg', '.ai', '.eps', '.png', '.jpg', '.jpeg'];
      const embroideryExts = ['.dst', '.emb', '.pes', '.jef', '.exp', '.xxx', '.vp3', '.art', '.ofm', '.hus', '.pcd', '.pcm', '.pcs', '.pec'];
      const maxEntrySize = 100 * 1024 * 1024;
      
      const artworkFiles: { name: string; data: Buffer }[] = [];
      const embroideryFiles: { name: string; data: Buffer }[] = [];
      const otherFiles: string[] = [];
      
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const fileName = path.basename(entry.entryName);
        if (fileName.startsWith('.') || fileName.startsWith('__MACOSX')) continue;
        if (entry.entryName.includes('__MACOSX/')) continue;
        
        const ext = path.extname(fileName).toLowerCase();
        
        if (artworkExts.includes(ext) || embroideryExts.includes(ext)) {
          if (entry.header.size > maxEntrySize) {
            console.log(`⚠️ Skipping oversized entry: ${fileName} (${(entry.header.size / 1024 / 1024).toFixed(1)}MB)`);
            continue;
          }
          const data = entry.getData();
          if (artworkExts.includes(ext)) {
            artworkFiles.push({ name: fileName, data });
          } else {
            embroideryFiles.push({ name: fileName, data });
          }
        } else {
          otherFiles.push(fileName);
        }
      }

      if (artworkFiles.length === 0) {
        fs.unlinkSync(zipPath);
        return res.status(400).json({ 
          error: 'No artwork files found in ZIP',
          details: 'ZIP must contain at least one artwork file (PDF, SVG, AI, EPS, PNG, or JPG)'
        });
      }

      console.log(`📦 Repeat applique ZIP: ${artworkFiles.length} artwork, ${embroideryFiles.length} embroidery, ${otherFiles.length} other files`);

      const templateSizeId = req.body?.templateSizeId;
      let selectedTemplate = null;

      if (templateSizeId) {
        const allTemplates = await storage.getTemplateSizes();
        selectedTemplate = allTemplates.find(t => t.id === templateSizeId);
      }

      if (!selectedTemplate) {
        const allTemplates = await storage.getTemplateSizes();
        selectedTemplate = allTemplates.find(t => t.name?.toLowerCase().includes('applique') || t.id?.startsWith('applique-'));
      }

      if (!selectedTemplate) {
        fs.unlinkSync(zipPath);
        return res.status(400).json({ error: 'No applique template found. Please contact support.' });
      }

      const projectName = req.body?.projectName || `Repeat Order - ${path.parse(file.originalname).name}`;
      const project = await storage.createProject({
        name: projectName,
        templateSize: selectedTemplate.id,
        garmentColor: '#929292',
        quantity: parseInt(req.body?.quantity) || 1,
        attachedZipPath: `/uploads/${file.filename}`,
        attachedZipName: file.originalname,
      });


      console.log(`📋 Created repeat applique project: ${project.id} (${projectName}) with zip: ${file.originalname}`);

      const savedArtwork: any[] = [];
      const savedEmbroidery: string[] = [];

      for (const artwork of artworkFiles) {
        const uniqueName = `${crypto.randomBytes(8).toString('hex')}_${artwork.name}`;
        const destPath = path.join(uploadDir, uniqueName);
        fs.writeFileSync(destPath, artwork.data);

        const ext = path.extname(artwork.name).toLowerCase();
        let mimeType = 'application/octet-stream';
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.svg') mimeType = 'image/svg+xml';
        else if (ext === '.png') mimeType = 'image/png';
        else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (['.ai', '.eps'].includes(ext)) mimeType = 'application/postscript';

        let finalFilename = uniqueName;
        let finalMimeType = mimeType;
        let finalUrl = `/uploads/${uniqueName}`;
        let originalFilename: string | undefined;
        let originalMimeType: string | undefined;
        let originalUrl: string | undefined;

        if (mimeType === 'application/pdf') {
          try {
            const svgFilename = `${uniqueName}.svg`;
            const svgDestPath = path.join(uploadDir, svgFilename);
            const pdf2svgCmd = `timeout 30 pdf2svg "${destPath}" "${svgDestPath}"`;
            await execAsync(pdf2svgCmd);
            
            if (fs.existsSync(svgDestPath) && fs.statSync(svgDestPath).size > 0) {
              originalFilename = uniqueName;
              originalMimeType = 'application/pdf';
              originalUrl = `/uploads/${uniqueName}`;
              finalFilename = svgFilename;
              finalMimeType = 'image/svg+xml';
              finalUrl = `/uploads/${svgFilename}`;
              console.log(`✅ Converted PDF to SVG for canvas display: ${artwork.name}`);
            }
          } catch (convErr) {
            console.log(`⚠️ PDF to SVG conversion failed for ${artwork.name}, keeping as PDF`);
            try {
              const pngFilename = `${uniqueName}.png`;
              const pngDestPath = path.join(uploadDir, pngFilename);
              await execAsync(`timeout 30 convert -density 150 "${destPath}[0]" -quality 90 "${pngDestPath}"`);
              if (fs.existsSync(pngDestPath) && fs.statSync(pngDestPath).size > 0) {
                originalFilename = uniqueName;
                originalMimeType = 'application/pdf';
                originalUrl = `/uploads/${uniqueName}`;
                finalFilename = pngFilename;
                finalMimeType = 'image/png';
                finalUrl = `/uploads/${pngFilename}`;
                console.log(`✅ Converted PDF to PNG fallback for canvas display: ${artwork.name}`);
              }
            } catch {
              console.log(`⚠️ PNG fallback also failed for ${artwork.name}`);
            }
          }
        }

        const logo = await storage.createLogo({
          projectId: project.id,
          filename: finalFilename,
          originalName: artwork.name,
          mimeType: finalMimeType,
          size: artwork.data.length,
          url: finalUrl,
          originalFilename,
          originalMimeType,
          originalUrl,
        });

        const existingElements = await storage.getCanvasElementsByProject(project.id);
        const nextZ = existingElements.length > 0 ? Math.max(...existingElements.map(el => el.zIndex ?? 0)) + 1 : 0;

        const canvasW = selectedTemplate.pixelWidth || 400;
        const canvasH = selectedTemplate.pixelHeight || 400;
        const logoW = Math.min(canvasW * 0.6, 200);
        const logoH = logoW;

        await storage.createCanvasElement({
          projectId: project.id,
          logoId: logo.id,
          elementType: 'logo',
          x: (canvasW - logoW) / 2,
          y: (canvasH - logoH) / 2,
          width: logoW,
          height: logoH,
          rotation: 0,
          zIndex: nextZ,
          isVisible: true,
          isLocked: false,
          canvasIndex: 0,
        });

        savedArtwork.push({ id: logo.id, name: artwork.name, type: ext });
        console.log(`🎨 Added artwork to project: ${artwork.name}`);
      }

      for (const embFile of embroideryFiles) {
        const uniqueName = `${crypto.randomBytes(8).toString('hex')}_${embFile.name}`;
        const destPath = path.join(uploadDir, uniqueName);
        fs.writeFileSync(destPath, embFile.data);

        await storage.createLogo({
          projectId: project.id,
          filename: uniqueName,
          originalName: embFile.name,
          mimeType: 'application/octet-stream',
          size: embFile.data.length,
          url: `/uploads/${uniqueName}`,
        });

        savedEmbroidery.push(embFile.name);
        console.log(`🧵 Added embroidery file to project: ${embFile.name}`);
      }

      res.status(201).json({
        project,
        artworkFiles: savedArtwork,
        embroideryFiles: savedEmbroidery,
        otherFilesSkipped: otherFiles,
        template: selectedTemplate,
      });

    } catch (error: any) {
      console.error('❌ Repeat applique ZIP upload error:', error);
      res.status(500).json({ error: 'Failed to process ZIP file', details: error?.message });
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

  // === CUSTOMER FEATURES ===
  // Returns feature flags for a customer (e.g. DTF Quick Upload button)
  app.get('/api/customer-features', async (req, res) => {
    const email = req.query.email as string;
    if (!email) {
      console.log('[customer-features] no email provided');
      return res.json({ dtfQuickUpload: false, vectorizationOnly: false, testFeature: false });
    }
    try {
      const assignments = await storage.getCustomerTemplates(email);
      const dtfQuickUpload = assignments.some((a: any) => a.templateId === '__dtf_quick_upload__');
      // When this flag is set, the DTF Quick Upload tile is hidden in the launcher
      // and special vectorisation-service pricing is applied in Odoo via pricelists.
      // It does NOT hide other product tiles — vector-only customers can still
      // browse and use any product type (e.g. seanbo@portwest.ie has this flag but
      // also needs DTF + every other product visible in the launcher).
      const vectorizationOnly = assignments.some((a: any) => a.templateId === '__vectorization_only__');
      // Diagnostic flag — when enabled, the launcher shows a visible banner.
      // Use this to verify end-to-end that the customer's email is reaching this
      // endpoint from the iframe. No effect on pricing or product visibility.
      const testFeature = assignments.some((a: any) => a.templateId === '__test_feature__');
      console.log(`[customer-features] ${email} → dtfQuickUpload=${dtfQuickUpload} vectorizationOnly=${vectorizationOnly} testFeature=${testFeature}`);
      res.json({ dtfQuickUpload, vectorizationOnly, testFeature });
    } catch (e) {
      console.warn('[customer-features] lookup failed:', e);
      res.json({ dtfQuickUpload: false, vectorizationOnly: false, testFeature: false });
    }
  });

  // === DTF QUICK UPLOAD ===
  // Bypasses the canvas and adds a customer-supplied PDF directly to Odoo cart
  app.post('/api/quick-upload-dtf', guardRoute('quick-dtf'), async (req, res) => {
    try {
      const { pdfBase64, quantity, partnerEmail, projectName } = req.body;
      if (!pdfBase64) return res.status(400).json({ error: 'PDF is required' });
      if (!quantity || quantity < 1) return res.status(400).json({ error: 'Valid quantity is required' });

      const { randomUUID } = await import('crypto');
      const projectId = randomUUID();
      const odooBase = process.env.VITE_ODOO_URL || 'https://www.completetransfers.com';
      const odooApiUrl = `${odooBase}/artwork/api/projects/${projectId}/add-to-cart`;

      const name = (projectName || `DTF Quick Upload`).replace(/_/g, ' ');
      const artworkFilename = `${name} qty${quantity}.pdf`;
      const ctWebsiteId = process.env.VITE_ODOO_CT_WEBSITE_ID || '2';

      // Compress the PDF with Ghostscript if it's large (>30MB decoded ≈ >40MB base64)
      const DTF_MAX_BASE64 = 40 * 1024 * 1024;
      let finalPdfBase64 = pdfBase64;
      if (pdfBase64.length > DTF_MAX_BASE64) {
        const rawMB = (pdfBase64.length / 1024 / 1024).toFixed(1);
        console.log(`📦 DTF Quick Upload PDF large (${rawMB}MB base64) — compressing with Ghostscript`);
        const tmpIn  = `/tmp/dtf_in_${Date.now()}.pdf`;
        const tmpOut = `/tmp/dtf_out_${Date.now()}.pdf`;
        try {
          fs.writeFileSync(tmpIn, Buffer.from(pdfBase64, 'base64'));
          await new Promise<void>((resolve, reject) => {
            exec(
              `gs -dBATCH -dNOPAUSE -q -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/prepress -dColorConversionStrategy=/LeaveColorUnchanged -dDownsampleColorImages=false -dDownsampleGrayImages=false -dDownsampleMonoImages=false -sOutputFile=${tmpOut} ${tmpIn}`,
              { timeout: 60000 },
              (err: Error | null) => { if (err) reject(err); else resolve(); }
            );
          });
          if (fs.existsSync(tmpOut)) {
            const compressed = fs.readFileSync(tmpOut);
            const compressedB64 = compressed.toString('base64');
            const newMB = (compressedB64.length / 1024 / 1024).toFixed(1);
            console.log(`🗜️ DTF GS compression: ${rawMB}MB → ${newMB}MB base64`);
            if (compressedB64.length < pdfBase64.length) finalPdfBase64 = compressedB64;
          }
        } catch (e: any) {
          console.warn(`⚠️ DTF GS compression failed (using original):`, e.message);
        } finally {
          try { fs.unlinkSync(tmpIn); } catch {}
          try { fs.unlinkSync(tmpOut); } catch {}
        }
      }

      const requestBody = {
        name,
        templateSize: 'dtf-large',
        quantity: Number(quantity),
        totalQuantity: Number(quantity),
        partnerEmail: partnerEmail || undefined,
        pdfBase64: finalPdfBase64,
        artworkFilename,
        product_code: 'CTDF1000',
        source: 'completetransfers',
        website_id: parseInt(ctWebsiteId, 10),
      };

      const clientCookies = req.headers.cookie || '';
      console.log(`🚀 DTF Quick Upload: proxying to ${odooApiUrl}`);

      const response = await fetch(odooApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': clientCookies,
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log(`📨 Odoo quick-upload response: ${response.status} — ${responseText.substring(0, 300)}`);

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to add to cart', details: responseText });
      }

      try {
        res.json(JSON.parse(responseText));
      } catch {
        res.send(responseText);
      }
    } catch (e: any) {
      console.error('❌ DTF quick-upload error:', e);
      res.status(500).json({ error: e.message || 'Internal error' });
    }
  });

  // === SANDBOXED ANALYTICS ===
  try {
    const { registerAnalyticsRoutes } = await import('./analytics-routes');
    registerAnalyticsRoutes(app, storage);
    console.log('📊 Analytics routes registered');
  } catch (e) {
    console.warn('⚠️ Analytics routes failed to load (non-critical):', e);
  }

  return app;
}