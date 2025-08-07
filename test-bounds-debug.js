// Quick test to verify position calculations are fixed
const pageWidth = 841.698; // A3 width
const pageHeight = 1190.28; // A3 height
const elementWidthMm = 102.66; // element width in mm
const elementHeightMm = 145.34; // element height in mm  
const scale = 2.834645669; // mm to points conversion

console.log('Page dimensions:', pageWidth, 'x', pageHeight, 'pts');
console.log('Element dimensions:', elementWidthMm, 'x', elementHeightMm, 'mm');
console.log('Element dimensions in points:', (elementWidthMm * scale).toFixed(2), 'x', (elementHeightMm * scale).toFixed(2), 'pts');

// Calculate center position  
const centerX = (pageWidth - (elementWidthMm * scale)) / 2;
const centerY = (pageHeight - (elementHeightMm * scale)) / 2;

console.log('CENTER position would be:', centerX.toFixed(2), ',', centerY.toFixed(2));
console.log('This places artwork in MIDDLE of page, which should be VISIBLE');

// Previous problematic position was (50, 728) - too high up
console.log('Previous position (50, 728) was', (728/pageHeight*100).toFixed(1), '% from bottom = too high!');
console.log('New center position', (centerY/pageHeight*100).toFixed(1), '% from bottom = MIDDLE');