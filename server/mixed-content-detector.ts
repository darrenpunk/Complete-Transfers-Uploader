/**
 * Mixed Content Detector
 * Analyzes PDFs and SVGs to detect if they contain both raster and vector content
 * This is critical for proper color workflow handling
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ContentAnalysis {
  hasRasterContent: boolean;
  hasVectorContent: boolean;
  isMixedContent: boolean;
  rasterImages: {
    count: number;
    formats: string[];
  };
  vectorElements: {
    count: number;
    types: string[];
  };
  recommendation: 'vector-workflow' | 'raster-workflow' | 'mixed-workflow';
}

export class MixedContentDetector {
  /**
   * Analyze PDF content using Ghostscript or pdfimages
   */
  static async analyzePDF(pdfPath: string): Promise<ContentAnalysis> {
    console.log('🔍 MixedContentDetector: Starting PDF analysis for:', pdfPath);
    const analysis: ContentAnalysis = {
      hasRasterContent: false,
      hasVectorContent: false,
      isMixedContent: false,
      rasterImages: { count: 0, formats: [] },
      vectorElements: { count: 0, types: [] },
      recommendation: 'vector-workflow'
    };

    try {
      // Method 1: Use pdfimages to detect raster images
      try {
        const { stdout } = await execAsync(`pdfimages -list "${pdfPath}" 2>/dev/null || true`);
        const lines = stdout.split('\n');
        
        // Skip header lines
        const imageLines = lines.slice(2).filter(line => line.trim());
        
        if (imageLines.length > 0) {
          analysis.hasRasterContent = true;
          analysis.rasterImages.count = imageLines.length;
          
          // Extract image formats
          const formats = new Set<string>();
          imageLines.forEach(line => {
            const parts = line.split(/\s+/);
            if (parts.length > 4) {
              formats.add(parts[2]); // Image type column
            }
          });
          analysis.rasterImages.formats = Array.from(formats);
        }
      } catch (error) {
        console.log('pdfimages not available, trying alternative method');
      }

      // Method 2: Use Ghostscript to analyze PDF content
      const gsCommand = `gs -dNODISPLAY -q -dNOSAFER -c "${pdfPath}" (r) file runpdfbegin 1 1 pdfpagecount {pdfgetpage /Page exch def Page /Resources get /XObject .knownget {dup {exch pop dup /Subtype get /Image eq {(IMAGE) print} {pop} ifelse} forall} if} for quit 2>/dev/null || true`;
      
      try {
        const { stdout: gsOutput } = await execAsync(gsCommand);
        if (gsOutput.includes('IMAGE')) {
          analysis.hasRasterContent = true;
          if (analysis.rasterImages.count === 0) {
            analysis.rasterImages.count = (gsOutput.match(/IMAGE/g) || []).length;
          }
        }
      } catch (error) {
        console.log('Ghostscript analysis failed:', error);
      }

      // Method 3: Convert PDF to text to check for vector content
      try {
        const { stdout: textOutput } = await execAsync(`pdftotext -q "${pdfPath}" - 2>/dev/null || true`);
        if (textOutput.trim().length > 0) {
          analysis.hasVectorContent = true;
          analysis.vectorElements.types.push('text');
        }
      } catch (error) {
        console.log('pdftotext not available');
      }

      // Method 4: Check for vector graphics using pdf2svg
      try {
        const tempSvg = `/tmp/temp_${Date.now()}.svg`;
        const pdf2svgCommand = `pdf2svg "${pdfPath}" "${tempSvg}" 1`;
        console.log('🔍 Running pdf2svg command:', pdf2svgCommand);
        await execAsync(`${pdf2svgCommand} 2>/dev/null || true`);
        
        if (fs.existsSync(tempSvg)) {
          const svgContent = fs.readFileSync(tempSvg, 'utf8');
          console.log('🔍 SVG conversion successful, checking for vector elements...');
          console.log('🔍 SVG content length:', svgContent.length);
          console.log('🔍 Contains paths:', svgContent.includes('<path'));
          console.log('🔍 Contains rects:', svgContent.includes('<rect'));
          console.log('🔍 Contains circles:', svgContent.includes('<circle'));
          console.log('🔍 Contains polygons:', svgContent.includes('<polygon'));
          
          // Check for vector elements in SVG (more comprehensive check)
          const hasPath = svgContent.includes('<path');
          const hasRect = svgContent.includes('<rect');
          const hasCircle = svgContent.includes('<circle');
          const hasPolygon = svgContent.includes('<polygon');
          const hasLine = svgContent.includes('<line');
          const hasEllipse = svgContent.includes('<ellipse');
          const hasText = svgContent.includes('<text');
          
          // Check if it's just an image embedded in SVG (which would be raster)
          const hasImage = svgContent.includes('<image');
          const hasUse = svgContent.includes('<use');
          const hasDefs = svgContent.includes('<defs');
          
          // Check for clipping paths which are structural, not vector graphics
          const hasClipPath = svgContent.includes('clip-path=') || svgContent.includes('<clipPath');
          
          // Count actual vector elements vs structural elements
          const pathCount = (svgContent.match(/<path/g) || []).length;
          const clipPathCount = (svgContent.match(/clip-rule=/g) || []).length;
          
          // If we only have clipping paths (rectangular boundaries), it's likely raster
          const onlyClippingPaths = hasPath && pathCount <= clipPathCount + 1 && hasClipPath;
          
          // Check if this is just embedded raster content
          const isEmbeddedRaster = (hasImage || hasUse) && hasDefs && onlyClippingPaths;
          
          console.log('🔍 SVG element analysis:', {
            hasPath, hasRect, hasCircle, hasPolygon, hasLine, hasEllipse, hasText, 
            hasImage, hasUse, hasDefs, hasClipPath, onlyClippingPaths, isEmbeddedRaster,
            pathCount, clipPathCount
          });
          
          if (isEmbeddedRaster) {
            console.log('❌ SVG contains only embedded raster with clipping paths - treating as raster content');
            analysis.hasRasterContent = true;
            analysis.rasterImages.count = 1;
            analysis.rasterImages.formats.push('embedded');
          } else if ((hasPath && !onlyClippingPaths) || hasRect || hasCircle || hasPolygon || hasLine || hasEllipse) {
            analysis.hasVectorContent = true;
            console.log('✅ Vector content detected in PDF via pdf2svg');
            
            if (hasPath && !onlyClippingPaths) analysis.vectorElements.types.push('paths');
            if (hasRect) analysis.vectorElements.types.push('rectangles');
            if (hasCircle) analysis.vectorElements.types.push('circles');
            if (hasLine) analysis.vectorElements.types.push('lines');
            if (hasEllipse) analysis.vectorElements.types.push('ellipses');
            if (hasText) analysis.vectorElements.types.push('text');
          } else {
            console.log('❌ No actual vector elements found - only structural/clipping elements');
          }
          
          // Clean up temp file
          fs.unlinkSync(tempSvg);
        } else {
          console.log('❌ pdf2svg did not create output file');
        }
      } catch (error) {
        console.log('pdf2svg analysis failed:', error);
      }

      // If we couldn't detect content types, check if we found any raster images
      // If we found raster images but no vector content, it's likely a raster-only PDF
      if (!analysis.hasRasterContent && !analysis.hasVectorContent) {
        console.log('⚠️ No content type detected - this may be an empty or corrupted PDF');
        // Default to raster workflow for safety since we can't determine content type
        analysis.hasRasterContent = true;
        analysis.rasterImages.count = 1;
        analysis.rasterImages.formats.push('unknown');
      }

    } catch (error) {
      console.error('PDF analysis error:', error);
      // Default to raster workflow if analysis fails - safer assumption
      analysis.hasRasterContent = true;
      analysis.rasterImages.count = 1;
      analysis.rasterImages.formats.push('unknown');
    }

    // Determine if mixed content and recommendation
    analysis.isMixedContent = analysis.hasRasterContent && analysis.hasVectorContent;
    
    if (analysis.isMixedContent) {
      // For mixed content, prefer vector workflow to preserve CMYK in vector elements
      // Raster images will maintain their original color space
      analysis.recommendation = 'mixed-workflow';
    } else if (analysis.hasRasterContent && !analysis.hasVectorContent) {
      analysis.recommendation = 'raster-workflow';
    } else {
      analysis.recommendation = 'vector-workflow';
    }

    console.log('🔍 MixedContentDetector: Final analysis results:', {
      hasRasterContent: analysis.hasRasterContent,
      hasVectorContent: analysis.hasVectorContent,
      isMixedContent: analysis.isMixedContent,
      recommendation: analysis.recommendation,
      rasterCount: analysis.rasterImages.count,
      vectorTypes: analysis.vectorElements.types
    });

    return analysis;
  }

  /**
   * Analyze SVG content for embedded raster images
   */
  static async analyzeSVG(svgPath: string): Promise<ContentAnalysis> {
    const analysis: ContentAnalysis = {
      hasRasterContent: false,
      hasVectorContent: false,
      isMixedContent: false,
      rasterImages: { count: 0, formats: [] },
      vectorElements: { count: 0, types: [] },
      recommendation: 'vector-workflow'
    };

    try {
      const svgContent = fs.readFileSync(svgPath, 'utf8');
      
      // Check for embedded raster images
      const imagePattern = /<image[^>]*>/gi;
      const imageMatches = svgContent.match(imagePattern) || [];
      
      if (imageMatches.length > 0) {
        analysis.hasRasterContent = true;
        analysis.rasterImages.count = imageMatches.length;
        
        // Check for different image formats
        const formats = new Set<string>();
        imageMatches.forEach(match => {
          if (match.includes('data:image/png')) formats.add('png');
          if (match.includes('data:image/jpeg') || match.includes('data:image/jpg')) formats.add('jpeg');
          if (match.includes('data:image/gif')) formats.add('gif');
          if (match.includes('.png')) formats.add('png');
          if (match.includes('.jpg') || match.includes('.jpeg')) formats.add('jpeg');
        });
        analysis.rasterImages.formats = Array.from(formats);
      }
      
      // Check for vector elements
      const vectorPatterns = [
        { pattern: /<path[^>]*>/gi, type: 'paths' },
        { pattern: /<rect[^>]*>/gi, type: 'rectangles' },
        { pattern: /<circle[^>]*>/gi, type: 'circles' },
        { pattern: /<ellipse[^>]*>/gi, type: 'ellipses' },
        { pattern: /<polygon[^>]*>/gi, type: 'polygons' },
        { pattern: /<polyline[^>]*>/gi, type: 'polylines' },
        { pattern: /<text[^>]*>/gi, type: 'text' },
        { pattern: /<line[^>]*>/gi, type: 'lines' }
      ];
      
      vectorPatterns.forEach(({ pattern, type }) => {
        const matches = svgContent.match(pattern) || [];
        if (matches.length > 0) {
          analysis.hasVectorContent = true;
          analysis.vectorElements.types.push(type);
          analysis.vectorElements.count += matches.length;
        }
      });
      
    } catch (error) {
      console.error('SVG analysis error:', error);
      // Default to vector workflow if analysis fails
      analysis.hasVectorContent = true;
      analysis.vectorElements.types.push('unknown');
    }

    // Determine if mixed content and recommendation
    analysis.isMixedContent = analysis.hasRasterContent && analysis.hasVectorContent;
    
    if (analysis.isMixedContent) {
      analysis.recommendation = 'mixed-workflow';
    } else if (analysis.hasRasterContent && !analysis.hasVectorContent) {
      analysis.recommendation = 'raster-workflow';
    } else {
      analysis.recommendation = 'vector-workflow';
    }

    return analysis;
  }

  /**
   * Get detailed content analysis for any supported file
   */
  static async analyzeFile(filePath: string, mimeType: string): Promise<ContentAnalysis> {
    if (mimeType === 'application/pdf') {
      return this.analyzePDF(filePath);
    } else if (mimeType === 'image/svg+xml') {
      return this.analyzeSVG(filePath);
    } else {
      // For other file types, return appropriate defaults
      const isRaster = mimeType === 'image/png' || mimeType === 'image/jpeg';
      
      return {
        hasRasterContent: isRaster,
        hasVectorContent: !isRaster,
        isMixedContent: false,
        rasterImages: isRaster ? { count: 1, formats: [mimeType.split('/')[1]] } : { count: 0, formats: [] },
        vectorElements: !isRaster ? { count: 1, types: ['unknown'] } : { count: 0, types: [] },
        recommendation: isRaster ? 'raster-workflow' : 'vector-workflow'
      };
    }
  }
}