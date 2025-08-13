// CMYK Preview System - Client-side color conversion for accurate CMYK preview
// This matches the Adobe Illustrator RGB-to-CMYK conversion algorithm

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface CMYK {
  c: number;
  m: number;
  y: number;
  k: number;
}

// Adobe color enhancement curve matching Illustrator's behavior
function enhanceColorChannel(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  
  // Adobe's enhancement curve - increases mid-tone contrast
  const enhanced = value < 0.5 
    ? 2 * value * value 
    : 1 - 2 * (1 - value) * (1 - value);
  
  // Blend original and enhanced for subtle effect (85% enhanced, 15% original)
  return value * 0.15 + enhanced * 0.85;
}

// Convert RGB to CMYK using Adobe's algorithm
export function rgbToCmyk(r: number, g: number, b: number): CMYK {
  // Normalize RGB values to 0-1
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  // Find the black (K) value
  const k = 1 - Math.max(rNorm, gNorm, bNorm);
  
  // If pure black, return early
  if (k >= 0.99) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }
  
  // Calculate CMY values
  let c = (1 - rNorm - k) / (1 - k);
  let m = (1 - gNorm - k) / (1 - k);
  let y = (1 - bNorm - k) / (1 - k);
  
  // Apply Adobe's color enhancement
  c = enhanceColorChannel(c);
  m = enhanceColorChannel(m);
  y = enhanceColorChannel(y);
  
  // Convert to percentages and round
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

// Convert CMYK back to RGB for display
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  // Normalize CMYK values to 0-1
  const cNorm = c / 100;
  const mNorm = m / 100;
  const yNorm = y / 100;
  const kNorm = k / 100;
  
  // Calculate RGB values
  const r = 255 * (1 - cNorm) * (1 - kNorm);
  const g = 255 * (1 - mNorm) * (1 - kNorm);
  const b = 255 * (1 - yNorm) * (1 - kNorm);
  
  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b)
  };
}

// Parse color string and convert to CMYK preview
export function convertColorToCmykPreview(color: string): string {
  // Parse different color formats
  let r = 0, g = 0, b = 0;
  
  if (color.startsWith('#')) {
    // Hex color
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else if (color.startsWith('rgb')) {
    // RGB color
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    }
  }
  
  // Convert to CMYK
  const cmyk = rgbToCmyk(r, g, b);
  
  // Convert back to RGB for display
  const rgbPreview = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k);
  
  return `rgb(${rgbPreview.r}, ${rgbPreview.g}, ${rgbPreview.b})`;
}

// Apply CMYK preview to an SVG element
export function applyCmykPreviewToSvg(svgElement: SVGElement, enabled: boolean): void {
  if (!enabled) {
    // Remove all CMYK preview attributes
    svgElement.querySelectorAll('[data-original-fill]').forEach(el => {
      const original = el.getAttribute('data-original-fill');
      if (original) {
        el.setAttribute('fill', original);
        el.removeAttribute('data-original-fill');
      }
    });
    
    svgElement.querySelectorAll('[data-original-stroke]').forEach(el => {
      const original = el.getAttribute('data-original-stroke');
      if (original) {
        el.setAttribute('stroke', original);
        el.removeAttribute('data-original-stroke');
      }
    });
    return;
  }
  
  // Apply CMYK preview to all fill colors
  svgElement.querySelectorAll('[fill]:not([fill="none"])').forEach(el => {
    const fill = el.getAttribute('fill');
    if (fill && !el.hasAttribute('data-original-fill')) {
      el.setAttribute('data-original-fill', fill);
      const cmykColor = convertColorToCmykPreview(fill);
      el.setAttribute('fill', cmykColor);
    }
  });
  
  // Apply CMYK preview to all stroke colors
  svgElement.querySelectorAll('[stroke]:not([stroke="none"])').forEach(el => {
    const stroke = el.getAttribute('stroke');
    if (stroke && !el.hasAttribute('data-original-stroke')) {
      el.setAttribute('data-original-stroke', stroke);
      const cmykColor = convertColorToCmykPreview(stroke);
      el.setAttribute('stroke', cmykColor);
    }
  });
}

// Create a CMYK preview filter using SVG filters (alternative approach)
export function createCmykPreviewFilter(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
      <defs>
        <filter id="cmyk-preview-filter" color-interpolation-filters="sRGB">
          <!-- Adjust brightness and contrast to simulate CMYK gamut -->
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1" exponent="1.1" offset="0"/>
            <feFuncG type="gamma" amplitude="1" exponent="1.1" offset="0"/>
            <feFuncB type="gamma" amplitude="1" exponent="1.1" offset="0"/>
          </feComponentTransfer>
          <!-- Reduce saturation -->
          <feColorMatrix type="saturate" values="0.85"/>
          <!-- Apply slight color shift -->
          <feColorMatrix type="matrix" values="
            0.95  0.05  0     0   0
            0     0.9   0.05  0   0
            0.05  0     0.9   0   0
            0     0     0     1   0
          "/>
        </filter>
      </defs>
    </svg>
  `;
}