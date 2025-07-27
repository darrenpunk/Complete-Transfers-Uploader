import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class ColorManagement {
  private static iccProfilePath: string | null = null;

  static getICCProfilePath(): string | null {
    if (!this.iccProfilePath) {
      // Check for uploaded ICC profile first
      const uploadedICCPath = path.join(process.cwd(), 'attached_assets', 'PSO Coated FOGRA51 (EFI)_1753573621935.icc');
      const fallbackICCPath = path.join(process.cwd(), 'server', 'fogra51.icc');
      
      if (fs.existsSync(uploadedICCPath)) {
        this.iccProfilePath = uploadedICCPath;
      } else if (fs.existsSync(fallbackICCPath)) {
        this.iccProfilePath = fallbackICCPath;
      }
    }
    return this.iccProfilePath;
  }

  static async generateColorManagedPreview(inputPath: string, outputPath: string): Promise<boolean> {
    try {
      const iccProfile = this.getICCProfilePath();
      if (!iccProfile) {
        console.log('Color Management: No ICC profile available, skipping color management');
        return false;
      }

      // Use ImageMagick to convert colors using the ICC profile while preserving transparency
      // Key parameters:
      // -background transparent: Preserve transparent backgrounds
      // -alpha unchanged: Keep alpha channel intact  
      // -intent perceptual: Use perceptual rendering intent for natural color appearance
      // -quality 100: Maintain maximum quality
      // -colorspace sRGB: Ensure proper colorspace for web display
      const command = `convert "${inputPath}" -background transparent -alpha unchanged -profile "${iccProfile}" -intent perceptual -colorspace sRGB -quality 100 "${outputPath}"`;
      
      console.log(`Color Management: Generating color-managed preview using ${path.basename(iccProfile)}`);
      await execAsync(command);
      
      if (fs.existsSync(outputPath)) {
        console.log('Color Management: Successfully generated color-managed preview with transparency preserved');
        return true;
      }
      
      return false;
      
    } catch (error) {
      console.error('Color Management: Failed to generate color-managed preview:', error);
      return false;
    }
  }

  static async generateColorManagedImage(logoId: string, originalPath: string): Promise<string | null> {
    try {
      const iccProfile = this.getICCProfilePath();
      if (!iccProfile) {
        return null;
      }

      const uploadsDir = path.join(process.cwd(), 'uploads');
      const colorManagedPath = path.join(uploadsDir, `${logoId}_color_managed.png`);
      
      // Check if color-managed version already exists
      if (fs.existsSync(colorManagedPath)) {
        return colorManagedPath;
      }

      const success = await this.generateColorManagedPreview(originalPath, colorManagedPath);
      return success ? colorManagedPath : null;
      
    } catch (error) {
      console.error('Color Management: Error generating color-managed image:', error);
      return null;
    }
  }

  static getColorManagedUrl(logoId: string): string | null {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const colorManagedPath = path.join(uploadsDir, `${logoId}_color_managed.png`);
    
    if (fs.existsSync(colorManagedPath)) {
      return `/uploads/${logoId}_color_managed.png`;
    }
    
    return null;
  }

  static async cleanupColorManagedFiles(logoId: string): Promise<void> {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const colorManagedPath = path.join(uploadsDir, `${logoId}_color_managed.png`);
      
      if (fs.existsSync(colorManagedPath)) {
        fs.unlinkSync(colorManagedPath);
        console.log(`Color Management: Cleaned up color-managed file for logo ${logoId}`);
      }
    } catch (error) {
      console.error('Color Management: Error cleaning up color-managed files:', error);
    }
  }
}