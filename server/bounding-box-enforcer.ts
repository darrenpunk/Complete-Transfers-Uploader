/**
 * Bounding Box Enforcer - Production Flow Requirement 4
 * Ensures bounding boxes are calculated from content, NOT viewBox
 */

import fs from 'fs';
import { calculateSVGContentBounds } from './dimension-utils';

export interface ContentBounds {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class BoundingBoxEnforcer {
  /**
   * PRODUCTION FLOW REQUIREMENT 4: Calculate content-based bounds
   * Never use viewBox - always calculate from actual content
   */
  static calculateContentBounds(filePath: string, mimeType: string): ContentBounds | null {
    console.log('📐 Production Flow Requirement 4: Calculating content-based bounding box');
    
    if (mimeType === 'image/svg+xml') {
      const svgContent = fs.readFileSync(filePath, 'utf8');
      const contentBounds = calculateSVGContentBounds(svgContent);
      
      if (contentBounds) {
        console.log('✅ Content-based bounds calculated:', contentBounds);
        console.log('📋 Production Flow: Using content bounds NOT viewBox (Requirement 4)');
        return contentBounds;
      }
    }
    
    console.warn('⚠️ Could not calculate content bounds - may fall back to viewBox');
    return null;
  }

  /**
   * Validate that bounds were calculated from content, not viewBox
   */
  static validateContentBasedBounds(bounds: ContentBounds | null, viewBoxBounds?: any): boolean {
    if (!bounds) {
      console.warn('❌ Production Flow: No content bounds available');
      return false;
    }

    // If viewBox bounds are provided, ensure we're not just using them
    if (viewBoxBounds) {
      const contentArea = bounds.width * bounds.height;
      const viewBoxArea = viewBoxBounds.width * viewBoxBounds.height;
      
      // If areas are identical, we might be using viewBox instead of content
      if (Math.abs(contentArea - viewBoxArea) < 1) {
        console.warn('⚠️ Production Flow: Bounds may be from viewBox instead of content');
        return false;
      }
    }

    console.log('✅ Production Flow: Content-based bounds validated');
    return true;
  }

  /**
   * Extract viewBox for comparison purposes only
   */
  static extractViewBoxBounds(svgContent: string): { width: number; height: number } | null {
    const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
    if (viewBoxMatch) {
      const values = viewBoxMatch[1].trim().split(/\s+/).map(Number);
      if (values.length >= 4) {
        return {
          width: values[2],
          height: values[3]
        };
      }
    }
    return null;
  }
}