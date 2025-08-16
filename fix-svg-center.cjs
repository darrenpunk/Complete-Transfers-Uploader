const fs = require('fs');

// Fix the most recent SVG file to center content
const svgPath = 'uploads/245e65e314e8773cccc26fae387066b1.svg';
let svgContent = fs.readFileSync(svgPath, 'utf8');

console.log('Original SVG viewBox:', svgContent.match(/viewBox="[^"]+"/)?.[0]);

// Simply change the viewBox to show a centered smaller area
// The content appears to be around coordinates 200-600 horizontally and 300-700 vertically
svgContent = svgContent.replace(
  /viewBox="0 0 841\.89 1190\.55"/,
  'viewBox="150 250 500 400"'
);

// Also update width and height to match the new viewBox
svgContent = svgContent.replace(
  /width="841\.89" height="1190\.55"/,
  'width="500" height="400"'
);

fs.writeFileSync(svgPath, svgContent, 'utf8');
console.log('✅ Fixed SVG - new viewBox: viewBox="150 250 500 400"');
console.log('✅ Fixed SVG - new size: 500×400');