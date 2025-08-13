// SVG recoloring utility for Single Colour Transfer templates

export function recolorSVG(svgContent: string, inkColor: string): string {
  // Convert the ink color to RGB values for consistent replacement
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  const rgbColor = hexToRgb(inkColor);
  if (!rgbColor) {
    console.warn('Invalid ink color format:', inkColor);
    return svgContent;
  }
  
  // Create RGB string for replacement
  const newRgbString = `rgb(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b})`;
  const newRgbPercentString = `rgb(${(rgbColor.r/255*100).toFixed(6)}%, ${(rgbColor.g/255*100).toFixed(6)}%, ${(rgbColor.b/255*100).toFixed(6)}%)`;
  
  console.log(`Recoloring to: ${newRgbString} / ${newRgbPercentString}`);
  
  // Replace all fill colors except white/transparent
  let recoloredContent = svgContent;
  
  // Replace fill attributes with hex colors (but preserve white)
  recoloredContent = recoloredContent.replace(/fill="([^"]+)"/g, (match, color) => {
    // Keep white colors, none, and transparent
    if (color === '#ffffff' || color === '#FFFFFF' || color === 'white' || 
        color === 'none' || color === 'transparent' || color.startsWith('url(')) {
      return match;
    }
    return `fill="${inkColor}"`;
  });
  
  // Replace fill attributes with rgb() colors (but preserve white)
  recoloredContent = recoloredContent.replace(/fill="rgb\(([^)]+)\)"/g, (match, rgbValues) => {
    // Check if it's white (255, 255, 255 or 100%, 100%, 100%)
    if (rgbValues === '255, 255, 255' || rgbValues === '100%, 100%, 100%' || 
        rgbValues.includes('255') && rgbValues.split(',').every((v: string) => parseInt(v.trim()) >= 250)) {
      return match; // Keep white
    }
    return `fill="${inkColor}"`;
  });
  
  // Replace stroke colors (but preserve white and none)
  recoloredContent = recoloredContent.replace(/stroke="([^"]+)"/g, (match, color) => {
    if (color === '#ffffff' || color === '#FFFFFF' || color === 'white' || 
        color === 'none' || color === 'transparent') {
      return match;
    }
    return `stroke="${inkColor}"`;
  });
  
  // Replace CSS fill properties in style attributes
  recoloredContent = recoloredContent.replace(/style="([^"]*)"/g, (match, styleContent) => {
    let newStyle = styleContent.replace(/fill:\s*([^;]+)/g, (fillMatch: string, fillColor: string) => {
      const cleanColor = fillColor.trim();
      if (cleanColor === '#ffffff' || cleanColor === '#FFFFFF' || cleanColor === 'white' || 
          cleanColor === 'none' || cleanColor === 'transparent') {
        return fillMatch;
      }
      return `fill:${inkColor}`;
    });
    
    newStyle = newStyle.replace(/stroke:\s*([^;]+)/g, (strokeMatch: string, strokeColor: string) => {
      const cleanColor = strokeColor.trim();
      if (cleanColor === '#ffffff' || cleanColor === '#FFFFFF' || cleanColor === 'white' || 
          cleanColor === 'none' || cleanColor === 'transparent') {
        return strokeMatch;
      }
      return `stroke:${inkColor}`;
    });
    
    return `style="${newStyle}"`;
  });
  
  console.log('SVG recolored for Single Colour Transfer');
  return recoloredContent;
}