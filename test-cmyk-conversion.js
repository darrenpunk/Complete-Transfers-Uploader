// Test CMYK conversion functions
function rgbToCmyk(rgb) {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const k = 1 - Math.max(r, Math.max(g, b));
  const c = k === 1 ? 0 : (1 - r - k) / (1 - k);
  const m = k === 1 ? 0 : (1 - g - k) / (1 - k);
  const y = k === 1 ? 0 : (1 - b - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100)
  };
}

function cmykToRgb(cmyk) {
  const c = cmyk.c / 100;
  const m = cmyk.m / 100;
  const y = cmyk.y / 100;
  const k = cmyk.k / 100;

  const r = Math.round(255 * (1 - c) * (1 - k));
  const g = Math.round(255 * (1 - m) * (1 - k));
  const b = Math.round(255 * (1 - y) * (1 - k));

  return { r, g, b };
}

// Test with rgb(150, 197, 40)
const testRgb = { r: 150, g: 197, b: 40 };
console.log('Original RGB:', testRgb);

const cmyk = rgbToCmyk(testRgb);
console.log('Converted CMYK:', cmyk);

const backToRgb = cmykToRgb(cmyk);
console.log('Back to RGB:', backToRgb);

// Test if conversion is accurate
const accurate = Math.abs(testRgb.r - backToRgb.r) <= 1 && 
                Math.abs(testRgb.g - backToRgb.g) <= 1 && 
                Math.abs(testRgb.b - backToRgb.b) <= 1;
console.log('Conversion accurate:', accurate);

// Compare with expected server values
console.log('Expected from server: C:20 M:0 Y:78 K:24');
console.log('Actual from function: C:' + cmyk.c + ' M:' + cmyk.m + ' Y:' + cmyk.y + ' K:' + cmyk.k);