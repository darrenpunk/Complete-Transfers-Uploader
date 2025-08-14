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
      
      // Method 1: Extract PostScript operators with better pattern
      const { stdout: postscriptOut } = await execAsync(`gs -dNODISPLAY -dBATCH -dNOPAUSE -q -c "(${pdfPath}) (r) file runpdfbegin 1 1 pdfpagecount { pdfgetpage pdfshowpage } for quit" 2>&1 | head -200`);
      
      console.log('📄 PostScript output preview:', postscriptOut.substring(0, 500));
      
      const cmykColors: Map<string, PDFCMYKColor> = new Map();
      
      // Look for CMYK operators in PostScript
      const patterns = [
        // Standard CMYK operators
        /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+k\s/gi,
        /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+K\s/gi,
        // setcmykcolor operators
        /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+setcmykcolor/gi,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(postscriptOut)) !== null) {
          const [, c, m, y, k] = match;
          const cmykKey = `${c}-${m}-${y}-${k}`;
          
          // Convert to percentages and validate
          const cPercent = parseFloat(c) * 100;
          const mPercent = parseFloat(m) * 100; 
          const yPercent = parseFloat(y) * 100;
          const kPercent = parseFloat(k) * 100;
          
          // Only include valid CMYK values (0-100%)
          if (cPercent >= 0 && cPercent <= 100 && 
              mPercent >= 0 && mPercent <= 100 && 
              yPercent >= 0 && yPercent <= 100 && 
              kPercent >= 0 && kPercent <= 100) {
            
            if (cmykColors.has(cmykKey)) {
              cmykColors.get(cmykKey)!.frequency++;
            } else {
              cmykColors.set(cmykKey, {
                c: cPercent,
                m: mPercent,
                y: yPercent,
                k: kPercent,
                frequency: 1
              });
            }
          }
        }
      }
      
      // Convert to array and sort by frequency
      const colors = Array.from(cmykColors.values()).sort((a, b) => b.frequency - a.frequency);
      
      console.log(`✅ Direct PDF extraction: Found ${colors.length} unique CMYK colors`);
      if (colors.length > 0) {
        colors.slice(0, 5).forEach((color, i) => {
          console.log(`   Color ${i+1}: C:${color.c.toFixed(0)} M:${color.m.toFixed(0)} Y:${color.y.toFixed(0)} K:${color.k.toFixed(0)} (${color.frequency}x)`);
        });
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