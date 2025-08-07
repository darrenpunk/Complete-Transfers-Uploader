import fs from 'fs';
import path from 'path';

function fixSVGCorruption(filePath) {
  console.log('🔧 Fixing SVG corruption in:', filePath);
  
  let svgContent = fs.readFileSync(filePath, 'utf8');
  let originalLength = svgContent.length;
  let fixed = false;
  
  // Fix 1: Remove invalid fill attributes from clipPath elements with malformed XML
  const beforeFix1 = svgContent.length;
  svgContent = svgContent.replace(
    /<path clip-rule="[^"]*" d="[^"]*"\s*\/\s*fill="#[0-9A-Fa-f]{6}">/g, 
    function(match) {
      fixed = true;
      const dMatch = match.match(/d="([^"]*)"/);
      if (dMatch) {
        return `<path clip-rule="nonzero" d="${dMatch[1]}"/>`;
      }
      return '<path clip-rule="nonzero" d=""/>';
    }
  );
  if (svgContent.length !== beforeFix1) console.log('  ✓ Fixed malformed clipPath elements');
  
  // Fix 2: Remove any remaining fill attributes from clipPath path elements
  const beforeFix2 = svgContent.length;
  svgContent = svgContent.replace(
    /<path ([^>]*) fill="#[0-9A-Fa-f]{6}"([^>]*?)>/g,
    function(match, before, after) {
      if (match.includes('clip-rule')) {
        fixed = true;
        return `<path ${before}${after}>`;
      }
      return match; // Keep fill for non-clipPath elements
    }
  );
  if (svgContent.length !== beforeFix2) console.log('  ✓ Removed invalid fill attributes from clipPath elements');
  
  // Fix 3: Ensure all self-closing path elements are properly formatted
  const beforeFix3 = svgContent.length;
  svgContent = svgContent.replace(
    /<path clip-rule="[^"]*" d="[^"]*">/g,
    function(match) {
      if (!match.endsWith('/>') && match.includes('clip-rule')) {
        fixed = true;
        const dMatch = match.match(/d="([^"]*)"/);
        if (dMatch) {
          return `<path clip-rule="nonzero" d="${dMatch[1]}"/>`;
        }
      }
      return match;
    }
  );
  if (svgContent.length !== beforeFix3) console.log('  ✓ Fixed self-closing path elements');
  
  // Fix 4: Remove any trailing "/" before fill attributes that cause XML errors
  const beforeFix4 = svgContent.length;
  svgContent = svgContent.replace(/"\s*\/\s*fill="/g, '" fill="');
  if (svgContent.length !== beforeFix4) {
    fixed = true;
    console.log('  ✓ Fixed trailing slash before fill attributes');
  }
  
  if (fixed) {
    console.log(`📊 Content length: ${originalLength} -> ${svgContent.length}`);
    fs.writeFileSync(filePath, svgContent);
    console.log('✅ SVG corruption fixes applied');
  } else {
    console.log('  ℹ️ No corruption found');
  }
  
  return fixed;
}

// Find and fix all SVG files in uploads directory
const uploadsDir = './uploads';
let totalFixed = 0;

try {
  const files = fs.readdirSync(uploadsDir);
  const svgFiles = files.filter(file => file.endsWith('.svg'));
  
  console.log(`🔍 Found ${svgFiles.length} SVG files to check`);
  
  for (const svgFile of svgFiles) {
    const filePath = path.join(uploadsDir, svgFile);
    const wasFixed = fixSVGCorruption(filePath);
    if (wasFixed) totalFixed++;
  }
  
  console.log(`\n📋 Summary: Fixed ${totalFixed} out of ${svgFiles.length} SVG files`);
  
} catch (error) {
  console.error('❌ Error processing SVG files:', error.message);
}