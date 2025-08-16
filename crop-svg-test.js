const fs = require('fs');

// Read the SVG file
const svgPath = 'uploads/8c082bc6504e57a01b47ad2f8d78100f.svg';
const originalContent = fs.readFileSync(svgPath, 'utf8');

console.log('Original viewBox:', originalContent.match(/viewBox="[^"]+"/)?.[0]);

// Extract the content between <svg> and </svg>
const svgMatch = originalContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
if (!svgMatch) {
  console.log('Could not extract SVG content');
  process.exit(1);
}

const innerContent = svgMatch[1];

// Create a cropped version focused on the center content area
// A3 is 841×1191px, typical logo content is in the center area
const contentX = 150;  
const contentY = 200;  
const contentWidth = 541;  
const contentHeight = 591; 

const croppedSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- CONTENT_CROPPED -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
     width="${contentWidth}" height="${contentHeight}" viewBox="${contentX} ${contentY} ${contentWidth} ${contentHeight}">
${innerContent}
</svg>`;

// Write the cropped SVG
fs.writeFileSync(svgPath, croppedSVG, 'utf8');
console.log(`✂️ CROPPED: Created focused content area ${contentWidth}×${contentHeight}px`);
console.log('New viewBox:', croppedSVG.match(/viewBox="[^"]+"/)?.[0]);