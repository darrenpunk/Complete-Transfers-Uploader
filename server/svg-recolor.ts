// SVG recoloring utility for Single Colour Transfer templates

// Only skip true "non-colors" — anything that isn't an actual paint:
//   - none / transparent          → element is intentionally invisible
//   - currentColor                → inherits from CSS (let cascade handle it)
//   - url(#…)                     → gradient / pattern reference
// White fills are NOT skipped: many uploaded vector logos are reverse-out
// designs (white-on-dark) and the user expects them to recolour to the
// chosen ink on a single-colour transfer (printing white-on-grey would
// be invisible). If a customer genuinely wants a white "knock-out" area
// they can use opacity:0 / fill:none instead.
const isNonPaintSkip = (color: string): boolean => {
  const c = color.trim().toLowerCase().replace(/\s+/g, '');
  if (c === 'none' || c === 'transparent' || c === 'currentcolor' || c.startsWith('url(')) return true;
  return false;
};

export function recolorSVG(svgContent: string, inkColor: string): string {
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

  console.log(`Recoloring SVG to: ${inkColor}`);

  let recoloredContent = svgContent;

  // 1. Replace colors inside <style>...</style> blocks (CSS rules from Illustrator/Inkscape)
  recoloredContent = recoloredContent.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, css) => {
    let newCss = css;
    // fill: <color>;  and  stroke: <color>;
    newCss = newCss.replace(/(fill|stroke)\s*:\s*([^;}\s]+)/gi, (m: string, prop: string, color: string) => {
      if (isNonPaintSkip(color)) return m;
      return `${prop}:${inkColor}`;
    });
    return match.replace(css, newCss);
  });

  // 2. Replace fill="..." attributes
  recoloredContent = recoloredContent.replace(/fill="([^"]+)"/g, (match, color) => {
    if (isNonPaintSkip(color)) return match;
    return `fill="${inkColor}"`;
  });

  // 3. Replace stroke="..." attributes
  recoloredContent = recoloredContent.replace(/stroke="([^"]+)"/g, (match, color) => {
    if (isNonPaintSkip(color)) return match;
    return `stroke="${inkColor}"`;
  });

  // 4. Replace fill/stroke inside style="..." attributes
  recoloredContent = recoloredContent.replace(/style="([^"]*)"/g, (match, styleContent) => {
    let newStyle = styleContent.replace(/(fill|stroke)\s*:\s*([^;]+)/gi, (m: string, prop: string, color: string) => {
      if (isNonPaintSkip(color)) return m;
      return `${prop}:${inkColor}`;
    });
    return `style="${newStyle}"`;
  });

  // 5. Add fill="<inkColor>" to drawable elements that have no fill attribute, no fill in style,
  // and no class attribute (since class might apply a fill via CSS we already processed).
  // Default SVG fill is black, so these elements would render as black without an explicit fill.
  const drawableTags = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text'];
  for (const tag of drawableTags) {
    const tagRegex = new RegExp(`<${tag}\\b([^>]*?)(/?>)`, 'gi');
    recoloredContent = recoloredContent.replace(tagRegex, (match, attrs, close) => {
      if (/\bfill\s*=/.test(attrs)) return match;
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"/);
      if (styleMatch && /\bfill\s*:/i.test(styleMatch[1])) return match;
      // Has a class — let CSS-rule rewrite handle it
      if (/\bclass\s*=/.test(attrs)) return match;
      return `<${tag}${attrs} fill="${inkColor}"${close}`;
    });
  }

  console.log('SVG recolored for Single Colour Transfer');
  return recoloredContent;
}
