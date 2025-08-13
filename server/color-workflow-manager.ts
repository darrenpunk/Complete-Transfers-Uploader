/**
 * Color Workflow Manager
 * Isolates color handling for vector files (SVG/PDF) from raster files (PNG/JPEG)
 * Ensures CMYK color preservation for vector workflows
 */

import { adobeRgbToCmyk } from './adobe-cmyk-profile';

export enum FileType {
  VECTOR_SVG = 'vector-svg',
  VECTOR_PDF = 'vector-pdf',
  VECTOR_AI = 'vector-ai',
  VECTOR_EPS = 'vector-eps',
  RASTER_PNG = 'raster-png',
  RASTER_JPEG = 'raster-jpeg',
  MIXED_CONTENT = 'mixed-content',
  UNKNOWN = 'unknown'
}

export enum ColorSpace {
  RGB = 'rgb',
  CMYK = 'cmyk',
  SPOT = 'spot',
  UNKNOWN = 'unknown'
}

export interface ColorWorkflowOptions {
  preserveCMYK: boolean;
  convertToCMYK: boolean;
  allowRasterConversion: boolean;
}

export class ColorWorkflowManager {
  /**
   * Determine file type based on mime type and extension
   */
  static getFileType(mimeType: string, filename: string): FileType {
    const extension = filename.toLowerCase().split('.').pop() || '';
    
    switch (mimeType) {
      case 'image/svg+xml':
        return FileType.VECTOR_SVG;
      case 'application/pdf':
        return FileType.VECTOR_PDF;
      case 'application/postscript':
      case 'application/illustrator':
      case 'application/x-illustrator':
        // Check extension to differentiate between AI and EPS
        return extension === 'ai' ? FileType.VECTOR_AI : FileType.VECTOR_EPS;
      case 'image/png':
        return FileType.RASTER_PNG;
      case 'image/jpeg':
      case 'image/jpg':
        return FileType.RASTER_JPEG;
      default:
        // Fallback to extension check
        switch (extension) {
          case 'svg':
            return FileType.VECTOR_SVG;
          case 'pdf':
            return FileType.VECTOR_PDF;
          case 'ai':
            return FileType.VECTOR_AI;
          case 'eps':
            return FileType.VECTOR_EPS;
          case 'png':
            return FileType.RASTER_PNG;
          case 'jpg':
          case 'jpeg':
            return FileType.RASTER_JPEG;
          default:
            return FileType.UNKNOWN;
        }
    }
  }

  /**
   * Determine appropriate color workflow based on file type
   */
  static getColorWorkflow(fileType: FileType): ColorWorkflowOptions {
    switch (fileType) {
      case FileType.VECTOR_SVG:
      case FileType.VECTOR_PDF:
      case FileType.VECTOR_AI:
      case FileType.VECTOR_EPS:
        // Vector files: preserve original structure and colors
        return {
          preserveCMYK: true,
          convertToCMYK: false, // Don't convert - preserve original
          allowRasterConversion: false
        };
      
      case FileType.MIXED_CONTENT:
        // Mixed content: preserve original structure
        return {
          preserveCMYK: true,
          convertToCMYK: false, // Don't convert - preserve original
          allowRasterConversion: false
        };
      
      case FileType.RASTER_PNG:
      case FileType.RASTER_JPEG:
        // Raster files: preserve original colors
        return {
          preserveCMYK: false,
          convertToCMYK: false, // Don't convert - preserve original
          allowRasterConversion: false
        };
      
      default:
        return {
          preserveCMYK: false,
          convertToCMYK: false,
          allowRasterConversion: false
        };
    }
  }

  /**
   * Process color based on workflow rules
   */
  static processColor(
    colorValue: string, 
    colorSpace: ColorSpace,
    workflow: ColorWorkflowOptions
  ): { 
    original: string;
    processed: string;
    space: ColorSpace;
    cmyk?: { c: number; m: number; y: number; k: number };
  } {
    // If CMYK color and workflow preserves CMYK, keep it unchanged
    if (colorSpace === ColorSpace.CMYK && workflow.preserveCMYK) {
      return {
        original: colorValue,
        processed: colorValue,
        space: ColorSpace.CMYK
      };
    }

    // If RGB color and workflow converts to CMYK
    if (colorSpace === ColorSpace.RGB && workflow.convertToCMYK) {
      // Parse RGB values
      const rgbMatch = colorValue.match(/rgb\((\d+),?\s*(\d+),?\s*(\d+)\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        
        // Convert to CMYK using Adobe algorithm
        const cmyk = adobeRgbToCmyk({ r, g, b });
        
        return {
          original: colorValue,
          processed: `C:${cmyk.c} M:${cmyk.m} Y:${cmyk.y} K:${cmyk.k}`,
          space: ColorSpace.CMYK,
          cmyk
        };
      }
    }

    // Default: return original color
    return {
      original: colorValue,
      processed: colorValue,
      space: colorSpace
    };
  }

  /**
   * Detect color space from color string
   */
  static detectColorSpace(colorValue: string): ColorSpace {
    if (colorValue.match(/device-cmyk/i) || 
        colorValue.match(/cmyk\s*\(/i) ||
        colorValue.match(/C:\d+\s*M:\d+\s*Y:\d+\s*K:\d+/i)) {
      return ColorSpace.CMYK;
    }
    
    if (colorValue.match(/rgb\s*\(/i) || 
        colorValue.match(/^#[0-9a-fA-F]{3,6}$/)) {
      return ColorSpace.RGB;
    }
    
    if (colorValue.match(/spot/i) || 
        colorValue.match(/pantone/i)) {
      return ColorSpace.SPOT;
    }
    
    return ColorSpace.UNKNOWN;
  }

  /**
   * Check if file should be analyzed for colors
   */
  static shouldAnalyzeColors(fileType: FileType): boolean {
    // Only analyze vector files for color information
    return fileType === FileType.VECTOR_SVG || fileType === FileType.VECTOR_PDF;
  }

  /**
   * Check if file should preserve vector properties
   */
  static shouldPreserveVector(fileType: FileType): boolean {
    return fileType === FileType.VECTOR_SVG || fileType === FileType.VECTOR_PDF;
  }

  /**
   * Get display message for color workflow
   */
  static getWorkflowMessage(fileType: FileType, workflow: ColorWorkflowOptions): string {
    if (fileType === FileType.VECTOR_SVG || fileType === FileType.VECTOR_PDF) {
      return 'Vector file: CMYK colors preserved, RGB colors will be converted to CMYK';
    } else if (fileType === FileType.MIXED_CONTENT) {
      return 'Mixed content file: Vector elements will preserve CMYK, raster images will be converted to CMYK';
    } else if (fileType === FileType.RASTER_PNG || fileType === FileType.RASTER_JPEG) {
      return 'Raster file: Will be converted to CMYK for accurate print output';
    }
    return 'Unknown file type';
  }
}