import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the svg-color-utils module
import { analyzeSVGWithStrokeWidths } from './server/svg-color-utils.js';

// Test the SVG that's showing the issue
const svgPath = path.join(__dirname, 'uploads', 'c5dc37b9cb4610c1e79671e8193ce817.svg');

if (!fs.existsSync(svgPath)) {
  console.error('SVG file not found:', svgPath);
  process.exit(1);
}

console.log('Testing SVG analysis for Pantone detection bug...\n');

const analysis = analyzeSVGWithStrokeWidths(svgPath);

console.log(`Total colors found: ${analysis.colors.length}\n`);

// Check first 5 colors
analysis.colors.slice(0, 5).forEach((color, index) => {
  console.log(`Color ${index + 1}:`);
  console.log(`  Original: ${color.originalColor}`);
  console.log(`  CMYK: ${color.cmykColor}`);
  console.log(`  Pantone Match: ${color.pantoneMatch || 'None'}`);
  console.log(`  Pantone Distance: ${color.pantoneDistance || 'N/A'}`);
  console.log('');
});

// Check if all colors have "Pantone 3"
const pantone3Count = analysis.colors.filter(c => c.pantoneMatch === 'Pantone 3').length;
console.log(`\nColors with "Pantone 3": ${pantone3Count} out of ${analysis.colors.length}`);

// Check SVG content for any "Pantone 3" text
const svgContent = fs.readFileSync(svgPath, 'utf8');
const hasPantone3InFile = svgContent.includes('Pantone 3') || svgContent.includes('pantone 3');
console.log(`\nSVG file contains "Pantone 3" text: ${hasPantone3InFile}`);

// Check for any pantone references at all
const pantoneMatches = svgContent.match(/pantone/gi) || [];
console.log(`Total pantone references in SVG: ${pantoneMatches.length}`);