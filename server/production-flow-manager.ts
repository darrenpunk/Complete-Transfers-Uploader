/**
 * Production Flow Manager - Enforces production workflow requirements
 * 1. No color conversion (preserved exactly as uploaded unless explicitly changed)
 * 2. Original content maintained in output PDFs 
 * 3. Accurate color detection for preflight
 * 4. Content-based bounding boxes (not viewBox)
 * 5. Raster file vectorization triggers
 * 6. Mixed content warnings
 */

import fs from 'fs';
import path from 'path';
import { MixedContentDetector } from './mixed-content-detector';
import { calculateSVGContentBounds } from './dimension-utils';
import { analyzeSVG } from './svg-color-utils';

export interface ProductionFlowConfig {
  preserveOriginalColors: boolean; // Always true in production
  contentBasedBounds: boolean;     // Always true in production  
  triggerVectorizationForRaster: boolean; // Always true in production
  warnOnMixedContent: boolean;     // Always true in production
}

export interface PreflightResult {
  colorSpaceDetected: 'RGB' | 'CMYK' | 'Mixed';
  hasRasterContent: boolean;
  hasVectorContent: boolean;
  isMixedContent: boolean;
  contentBounds: { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } | null;
  colorsDetected: Array<{
    original: string;
    format: string; 
    isCMYK: boolean;
    elementType: string;
  }>;
  requiresVectorization: boolean;
  warnings: string[];
}

export class ProductionFlowManager {
  private config: ProductionFlowConfig = {
    preserveOriginalColors: true,    // CRITICAL: Never convert colors
    contentBasedBounds: true,        // CRITICAL: Use content bounds not viewBox
    triggerVectorizationForRaster: true, // CRITICAL: Always trigger for raster
    warnOnMixedContent: true         // CRITICAL: Always warn on mixed content
  };

  /**
   * Run comprehensive preflight check for production workflow
   */
  async runPreflightCheck(filePath: string, mimeType: string): Promise<PreflightResult> {
    console.log('🔍 Production Flow: Running preflight check for:', path.basename(filePath));
    
    const result: PreflightResult = {
      colorSpaceDetected: 'RGB',
      hasRasterContent: false,
      hasVectorContent: false,
      isMixedContent: false,
      contentBounds: null,
      colorsDetected: [],
      requiresVectorization: false,
      warnings: []
    };

    try {
      // 1. Analyze file content type (raster, vector, mixed)
      const contentAnalysis = await MixedContentDetector.analyzeFile(filePath, mimeType);
      result.hasRasterContent = contentAnalysis.hasRasterContent;
      result.hasVectorContent = contentAnalysis.hasVectorContent;
      result.isMixedContent = contentAnalysis.isMixedContent;

      // 2. Determine vectorization requirements
      if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
        result.requiresVectorization = true;
        result.warnings.push('Raster file detected - vectorization recommended for best print quality');
      } else if (mimeType === 'application/pdf' && contentAnalysis.hasRasterContent && !contentAnalysis.hasVectorContent) {
        result.requiresVectorization = true;
        result.warnings.push('PDF contains only raster content - vectorization recommended');
      } else if (contentAnalysis.isMixedContent) {
        // Mixed content PDFs should NOT require vectorization - preserve as-is
        result.requiresVectorization = false;
        result.warnings.push('Mixed content detected - vector elements will be preserved, raster elements maintained as embedded');
      }

      // 3. Analyze colors and determine color space (for SVG and PDF)
      if (mimeType === 'image/svg+xml') {
        const svgAnalysis = analyzeSVG(filePath);
        result.colorsDetected = svgAnalysis.colors.map(color => ({
          original: color.originalColor,
          format: color.originalFormat || 'unknown',
          isCMYK: color.isCMYK || false,
          elementType: color.elementType
        }));

        // Determine color space
        const hasCMYK = result.colorsDetected.some(c => c.isCMYK);
        const hasRGB = result.colorsDetected.some(c => !c.isCMYK);
        if (hasCMYK && hasRGB) {
          result.colorSpaceDetected = 'Mixed';
        } else if (hasCMYK) {
          result.colorSpaceDetected = 'CMYK';
        } else {
          result.colorSpaceDetected = 'RGB';
        }

        // 4. Calculate content-based bounding box (NOT viewBox)
        const svgContent = fs.readFileSync(filePath, 'utf8');
        result.contentBounds = calculateSVGContentBounds(svgContent);
        
        if (!result.contentBounds) {
          result.warnings.push('Could not calculate content bounds - may affect sizing accuracy');
        } else {
          console.log('📐 Content bounds calculated:', result.contentBounds);
        }
      }

      console.log('✅ Production Flow: Preflight check completed');
      console.log('📊 Preflight Summary:', {
        colorSpace: result.colorSpaceDetected,
        hasRaster: result.hasRasterContent,
        hasVector: result.hasVectorContent,
        requiresVectorization: result.requiresVectorization,
        warningCount: result.warnings.length
      });

      return result;

    } catch (error) {
      console.error('❌ Production Flow: Preflight check failed:', error);
      result.warnings.push(`Preflight check failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Validate that original colors will be preserved in output
   */
  validateColorPreservation(logoFile: any, colorChanges?: Record<string, string>): boolean {
    if (!this.config.preserveOriginalColors) {
      console.warn('⚠️ Production Flow: Color preservation is disabled');
      return false;
    }

    // If no color changes are specified, colors will be preserved exactly
    if (!colorChanges || Object.keys(colorChanges).length === 0) {
      console.log('✅ Production Flow: No color changes - original colors will be preserved');
      return true;
    }

    // If color changes are specified, they are intentional overrides
    console.log('📝 Production Flow: Color changes detected - will apply user-specified overrides only');
    console.log('🎨 Color overrides:', colorChanges);
    return true;
  }

  /**
   * Check if file should trigger vectorization modal
   */
  shouldTriggerVectorization(mimeType: string, contentAnalysis?: any): boolean {
    if (!this.config.triggerVectorizationForRaster) {
      return false;
    }

    // Pure raster files
    if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      console.log('🎯 Production Flow: Raster file detected - vectorization modal required');
      return true;
    }

    // PDFs with only raster content
    if (mimeType === 'application/pdf' && contentAnalysis) {
      if (contentAnalysis.hasRasterContent && !contentAnalysis.hasVectorContent) {
        console.log('🎯 Production Flow: Raster-only PDF detected - vectorization modal required');
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file should show mixed content warning
   */
  shouldWarnMixedContent(contentAnalysis: any): boolean {
    if (!this.config.warnOnMixedContent) {
      return false;
    }

    if (contentAnalysis.isMixedContent) {
      console.log('⚠️ Production Flow: Mixed content detected - warning required');
      return true;
    }

    return false;
  }

  /**
   * Generate production-ready filename for PDF output
   */
  generateProductionFilename(projectName: string, templateSize: string, quantity: number): string {
    const sanitizedName = projectName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `${sanitizedName}_${templateSize}_qty${quantity}_${timestamp}.pdf`;
  }

  /**
   * Validate production readiness
   */
  validateProductionReadiness(logoData: any, projectData: any): { ready: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for required project information
    if (!projectData.name || projectData.name.trim() === '') {
      issues.push('Project name is required for production');
    }

    if (!projectData.templateSize) {
      issues.push('Template size must be selected');
    }

    if (!projectData.quantity || projectData.quantity < 1) {
      issues.push('Quantity must be specified (minimum 1)');
    }

    // Check for logo content
    if (!logoData || !logoData.filename) {
      issues.push('At least one logo file is required');
    }

    // Check for color space issues
    if (logoData && logoData.colorSpace === 'Mixed') {
      issues.push('Mixed color spaces detected - verify color consistency');
    }

    const ready = issues.length === 0;
    
    console.log(ready ? '✅ Production ready' : '❌ Production issues detected:', issues);
    
    return { ready, issues };
  }
}

export const productionFlow = new ProductionFlowManager();