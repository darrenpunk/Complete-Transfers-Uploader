/**
 * Raster CMYK Converter
 * Safely converts raster images (PNG/JPEG) to CMYK for print output
 * Isolated from vector workflow to prevent contamination
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class RasterCMYKConverter {
  /**
   * Convert raster image to CMYK using ImageMagick
   * This is separate from vector conversion to prevent workflow issues
   */
  static async convertRasterToCMYK(
    inputPath: string, 
    outputPath: string,
    mimeType: string
  ): Promise<boolean> {
    try {
      console.log(`🎨 Converting raster image to CMYK: ${inputPath}`);
      
      // Ensure we're dealing with a raster file
      if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
        console.log('⚠️ Not a raster file, skipping CMYK conversion');
        return false;
      }

      // Get the ICC profile path
      const iccProfilePath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
      
      if (!fs.existsSync(iccProfilePath)) {
        console.error('❌ ICC profile not found, cannot convert to CMYK');
        return false;
      }

      // Use ImageMagick to convert to CMYK with proper profile
      // For PNG files, we need special handling to preserve transparency
      let command;
      if (mimeType === 'image/png') {
        // For PNG: Use a simpler approach that preserves both color and transparency
        // Convert to CMYK while preserving the alpha channel
        command = `convert "${inputPath}" -profile "${iccProfilePath}" -colorspace CMYK -alpha set "${outputPath}"`;
        
        console.log('🔧 Running ImageMagick command for PNG CMYK conversion with transparency');
      } else {
        // For JPEG: standard conversion
        command = `convert "${inputPath}" -profile "${iccProfilePath}" -colorspace CMYK "${outputPath}"`;
      }
      
      console.log('🔧 Running ImageMagick command for raster CMYK conversion');
      console.log('📋 Command:', command);
      await execAsync(command);
      
      // Verify the output file was created
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          console.log('✅ Raster image successfully converted to CMYK');
          return true;
        }
      }
      
      console.error('❌ Raster CMYK conversion failed - output file not created');
      return false;
      
    } catch (error) {
      console.error('❌ Error converting raster to CMYK:', error);
      // Don't throw - just return false to indicate conversion failed
      // This prevents breaking the upload workflow
      return false;
    }
  }

  /**
   * Get CMYK values from a raster image for display purposes
   * This doesn't modify the file, just reads color information
   */
  static async analyzeRasterColors(imagePath: string): Promise<any[]> {
    try {
      // Use ImageMagick to get dominant colors
      const command = `convert "${imagePath}" -resize 50x50 -colors 10 -depth 8 -format "%c" histogram:info:`;
      const { stdout } = await execAsync(command);
      
      const colors = [];
      const lines = stdout.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        // Parse ImageMagick histogram output
        const match = line.match(/:\s*\(\s*(\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          const r = parseInt(match[1]);
          const g = parseInt(match[2]);
          const b = parseInt(match[3]);
          
          // Convert RGB to CMYK using our Adobe-matching algorithm
          const { adobeRgbToCmyk } = await import('./adobe-cmyk-profile');
          const cmyk = adobeRgbToCmyk({ r, g, b });
          
          colors.push({
            originalColor: `rgb(${r}, ${g}, ${b})`,
            cmykColor: `C:${cmyk.c} M:${cmyk.m} Y:${cmyk.y} K:${cmyk.k}`,
            converted: true
          });
        }
      }
      
      return colors.slice(0, 5); // Return top 5 colors
      
    } catch (error) {
      console.error('Error analyzing raster colors:', error);
      return [];
    }
  }

  /**
   * Check if a raster file is already in CMYK color space
   */
  static async isAlreadyCMYK(imagePath: string): Promise<boolean> {
    try {
      const command = `identify -format "%[colorspace]" "${imagePath}"`;
      const { stdout } = await execAsync(command);
      return stdout.trim().toUpperCase() === 'CMYK';
    } catch (error) {
      console.error('Error checking color space:', error);
      return false;
    }
  }
}