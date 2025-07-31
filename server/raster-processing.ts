import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export interface RasterAnalysis {
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  actualDPI: number;
  colorSpace: 'RGB' | 'CMYK' | 'GRAYSCALE';
  hasTransparency: boolean;
  fileSize: number;
  quality: 'high' | 'medium' | 'low';
  printReady: boolean;
}

/**
 * Analyze raster image properties using ImageMagick
 */
export async function analyzeRasterImage(imagePath: string): Promise<RasterAnalysis> {
  try {
    console.log(`🔍 Analyzing raster image: ${path.basename(imagePath)}`);
    
    // Get comprehensive image information using ImageMagick identify
    const identifyCommand = `identify -verbose "${imagePath}"`;
    const { stdout } = await execAsync(identifyCommand);
    
    // Parse image information
    const lines = stdout.split('\n');
    let widthPx = 0;
    let heightPx = 0;
    let dpi = 72; // Default DPI
    let colorSpace = 'RGB' as 'RGB' | 'CMYK' | 'GRAYSCALE';
    let hasTransparency = false;
    
    // Extract dimensions
    const geometryMatch = stdout.match(/Geometry:\s*(\d+)x(\d+)/);
    if (geometryMatch) {
      widthPx = parseInt(geometryMatch[1]);
      heightPx = parseInt(geometryMatch[2]);
    }
    
    // Extract DPI/resolution
    const resolutionMatch = stdout.match(/Resolution:\s*(\d+\.?\d*)x(\d+\.?\d*)/);
    if (resolutionMatch) {
      dpi = Math.round(parseFloat(resolutionMatch[1]));
    }
    
    // Extract color space
    const colorSpaceMatch = stdout.match(/Colorspace:\s*(\w+)/);
    if (colorSpaceMatch) {
      const space = colorSpaceMatch[1].toUpperCase();
      if (space === 'CMYK') {
        colorSpace = 'CMYK';
      } else if (space === 'GRAY' || space === 'GRAYSCALE') {
        colorSpace = 'GRAYSCALE';
      } else {
        colorSpace = 'RGB';
      }
    }
    
    // Check for transparency
    hasTransparency = stdout.includes('Matte: True') || stdout.includes('Alpha:');
    
    // Calculate actual DPI at print size (assuming 300 DPI target)
    const actualDPI = Math.min(widthPx, heightPx) > 0 ? 
      Math.round(Math.min(widthPx, heightPx) / Math.max(widthPx / 300, heightPx / 300)) : dpi;
    
    // Convert to mm using standard 300 DPI reference
    const mmPerPixel = 25.4 / 300; // 300 DPI = 11.811 pixels/mm
    const widthMm = widthPx * mmPerPixel;
    const heightMm = heightPx * mmPerPixel;
    
    // Get file size
    const stats = fs.statSync(imagePath);
    const fileSize = stats.size;
    
    // Determine quality based on DPI
    let quality: 'high' | 'medium' | 'low' = 'low';
    if (actualDPI >= 300) {
      quality = 'high';
    } else if (actualDPI >= 150) {
      quality = 'medium';
    }
    
    const printReady = actualDPI >= 150 && (colorSpace === 'CMYK' || colorSpace === 'RGB');
    
    console.log(`📊 Raster analysis: ${widthPx}×${heightPx}px, ${dpi} DPI (actual: ${actualDPI}), ${colorSpace}, quality: ${quality}`);
    
    return {
      widthPx,
      heightPx,
      widthMm,
      heightMm,
      dpi,
      actualDPI,
      colorSpace,
      hasTransparency,
      fileSize,
      quality,
      printReady
    };
    
  } catch (error) {
    console.error(`❌ Raster analysis failed for ${path.basename(imagePath)}:`, error);
    
    // Fallback analysis using basic file info
    const stats = fs.statSync(imagePath);
    return {
      widthPx: 0,
      heightPx: 0,
      widthMm: 0,
      heightMm: 0,
      dpi: 72,
      actualDPI: 72,
      colorSpace: 'RGB',
      hasTransparency: false,
      fileSize: stats.size,
      quality: 'low',
      printReady: false
    };
  }
}

/**
 * Convert raster image to CMYK with ICC profile during import
 */
export async function convertRasterToCMYK(
  inputPath: string, 
  outputPath: string,
  iccProfilePath?: string
): Promise<boolean> {
  try {
    console.log(`🎨 Converting raster to CMYK: ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
    
    let convertCommand;
    if (iccProfilePath && fs.existsSync(iccProfilePath)) {
      // Convert with ICC profile
      convertCommand = `convert "${inputPath}" -profile "${iccProfilePath}" -colorspace CMYK -intent perceptual -quality 100 "${outputPath}"`;
      console.log(`✅ Using ICC profile: ${path.basename(iccProfilePath)}`);
    } else {
      // Standard CMYK conversion
      convertCommand = `convert "${inputPath}" -colorspace CMYK -intent perceptual -quality 100 "${outputPath}"`;
      console.log(`⚡ Standard CMYK conversion (no ICC profile)`);
    }
    
    await execAsync(convertCommand);
    
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`✅ CMYK conversion successful: ${stats.size} bytes`);
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error(`❌ CMYK conversion failed for ${path.basename(inputPath)}:`, error);
    return false;
  }
}

/**
 * Process raster image during import: analyze + optional CMYK conversion
 */
export async function processRasterImageImport(
  imagePath: string,
  uploadDir: string,
  filename: string,
  shouldConvertToCMYK: boolean = true
): Promise<{ analysis: RasterAnalysis; cmykPath?: string }> {
  
  // Analyze the original image
  const analysis = await analyzeRasterImage(imagePath);
  
  // If already CMYK or conversion not requested, return analysis only
  if (analysis.colorSpace === 'CMYK' || !shouldConvertToCMYK) {
    console.log(`📋 Raster processing complete: ${filename} (${analysis.colorSpace}, no conversion needed)`);
    return { analysis };
  }
  
  // Convert to CMYK if it's RGB
  const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
  const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
  
  let iccProfilePath = uploadedICCPath;
  if (!fs.existsSync(uploadedICCPath)) {
    iccProfilePath = fallbackICCPath;
  }
  
  const useICC = fs.existsSync(iccProfilePath);
  const cmykFilename = filename.replace(/\.(png|jpg|jpeg)$/i, '_cmyk.$1');
  const cmykPath = path.join(uploadDir, cmykFilename);
  
  const conversionSuccess = await convertRasterToCMYK(
    imagePath, 
    cmykPath, 
    useICC ? iccProfilePath : undefined
  );
  
  if (conversionSuccess) {
    // Update analysis for CMYK version
    const cmykAnalysis = await analyzeRasterImage(cmykPath);
    console.log(`✅ Raster import processing complete: ${filename} → CMYK conversion successful`);
    
    return { 
      analysis: {
        ...analysis,
        colorSpace: 'CMYK',
        printReady: true
      }, 
      cmykPath 
    };
  } else {
    console.log(`⚠️ Raster import processing complete: ${filename} (CMYK conversion failed, using original)`);
    return { analysis };
  }
}