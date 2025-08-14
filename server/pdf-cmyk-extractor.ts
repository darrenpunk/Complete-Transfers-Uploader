/**
 * PDF CMYK Color Extractor
 * Extracts actual CMYK values directly from PDF files using Ghostscript
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export interface PDFCMYKColor {
  c: number;
  m: number;
  y: number;
  k: number;
  frequency: number;
}

export class PDFCMYKExtractor {
  /**
   * Extract actual CMYK colors directly from PDF using Ghostscript
   */
  static async extractCMYKFromPDF(pdfPath: string): Promise<PDFCMYKColor[]> {
    try {
      console.log('🎯 Attempting direct CMYK extraction from PDF...');
      
      // Method 1: Convert PDF to PostScript and extract CMYK operators
      const { stdout: postscriptContent } = await execAsync(`gs -dNODISPLAY -dBATCH -dNOPAUSE -sDEVICE=ps2write -sOutputFile=- "${pdfPath}" 2>/dev/null`);
      
      console.log('📄 PostScript content length:', postscriptContent.length);
      
      const cmykColors: Map<string, PDFCMYKColor> = new Map();
      
      // Look for CMYK operators in PostScript output
      const cmykPatterns = [
        // Standard CMYK fill operators
        /([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+k/g,
        /([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+K/g,
        // setcmykcolor operators  
        /([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+setcmykcolor/g,
      ];
      
      for (const pattern of cmykPatterns) {
        let match;
        while ((match = pattern.exec(postscriptContent)) !== null) {
          const [, c, m, y, k] = match;
          const cmykKey = `${c}-${m}-${y}-${k}`;
          
          // Parse and convert to percentages
          const cVal = parseFloat(c);
          const mVal = parseFloat(m);
          const yVal = parseFloat(y);
          const kVal = parseFloat(k);
          
          // PostScript CMYK values are typically 0-1, convert to percentages
          const cPercent = cVal <= 1 ? cVal * 100 : cVal;
          const mPercent = mVal <= 1 ? mVal * 100 : mVal; 
          const yPercent = yVal <= 1 ? yVal * 100 : yVal;
          const kPercent = kVal <= 1 ? kVal * 100 : kVal;
          
          // Only include valid CMYK values
          if (cPercent >= 0 && cPercent <= 100 && 
              mPercent >= 0 && mPercent <= 100 && 
              yPercent >= 0 && yPercent <= 100 && 
              kPercent >= 0 && kPercent <= 100) {
            
            if (cmykColors.has(cmykKey)) {
              cmykColors.get(cmykKey)!.frequency++;
            } else {
              cmykColors.set(cmykKey, {
                c: Math.round(cPercent),
                m: Math.round(mPercent),
                y: Math.round(yPercent),
                k: Math.round(kPercent),
                frequency: 1
              });
            }
          }
        }
      }
      
      // Convert to array and sort by frequency, filter duplicates
      const colors = Array.from(cmykColors.values())
        .sort((a, b) => b.frequency - a.frequency)
        .filter(color => {
          // Filter out pure white and pure black unless they're the only colors
          const isWhite = color.c === 0 && color.m === 0 && color.y === 0 && color.k === 0;
          const isBlack = color.c === 0 && color.m === 0 && color.y === 0 && color.k === 100;
          return !isWhite && !isBlack;
        })
        .slice(0, 10); // Limit to top 10 colors
      
      console.log(`✅ Direct PDF extraction: Found ${colors.length} unique CMYK colors`);
      if (colors.length > 0) {
        colors.forEach((color, i) => {
          console.log(`   Direct Color ${i+1}: C:${color.c} M:${color.m} Y:${color.y} K:${color.k} (${color.frequency}x)`);
        });
      } else {
        console.log('⚠️ No CMYK operators found in PostScript output');
      }
      
      return colors;
      
    } catch (error) {
      console.log('⚠️ Direct PDF CMYK extraction failed:', error);
      return [];
    }
  }

  /**
   * Extract CMYK colors using alternative method - analyzing PDF content stream
   */
  static async extractCMYKFromPDFContent(pdfPath: string): Promise<PDFCMYKColor[]> {
    try {
      // Extract PDF content stream and look for CMYK color operators
      const { stdout } = await execAsync(`gs -dNODISPLAY -dBATCH -dNOPAUSE -q -c "/${path.basename(pdfPath)} run quit" -f "${pdfPath}" 2>&1 || echo ""`);
      
      const cmykPattern = /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+k/g;
      const colors: Map<string, PDFCMYKColor> = new Map();
      
      let match;
      while ((match = cmykPattern.exec(stdout)) !== null) {
        const [, c, m, y, k] = match;
        const cmykKey = `${c}-${m}-${y}-${k}`;
        
        if (colors.has(cmykKey)) {
          colors.get(cmykKey)!.frequency++;
        } else {
          colors.set(cmykKey, {
            c: parseFloat(c) * 100,
            m: parseFloat(m) * 100,
            y: parseFloat(y) * 100,
            k: parseFloat(k) * 100,
            frequency: 1
          });
        }
      }
      
      return Array.from(colors.values()).sort((a, b) => b.frequency - a.frequency);
      
    } catch (error) {
      console.log('⚠️ Alternative CMYK extraction failed:', error);
      return [];
    }
  }
}