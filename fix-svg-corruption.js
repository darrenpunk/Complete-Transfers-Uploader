import fs from 'fs';

function fixSVGCorruption(filePath) {
  console.log('🔧 Fixing SVG corruption in:', filePath);
  
  let svgContent = fs.readFileSync(filePath, 'utf8');
  let originalLength = svgContent.length;
  
  // Fix 1: Remove invalid fill attributes from clipPath elements
  svgContent = svgContent.replace(
    /<path clip-rule="[^"]*" d="[^"]*"\s*\/\s*fill="#[0-9A-Fa-f]{6}">/g, 
    function(match) {
      // Extract the d attribute
      const dMatch = match.match(/d="([^"]*)"/);
      if (dMatch) {
        return `<path clip-rule="nonzero" d="${dMatch[1]}"/>`;
      }
      return '<path clip-rule="nonzero" d=""/>';
    }
  );
  
  // Fix 2: Remove any remaining fill attributes from clipPath path elements
  svgContent = svgContent.replace(
    /<path ([^>]*) fill="#[0-9A-Fa-f]{6}"([^>]*?)>/g,
    function(match, before, after) {
      if (match.includes('clip-rule')) {
        return `<path ${before}${after}>`;
      }
      return match; // Keep fill for non-clipPath elements
    }
  );
  
  // Fix 3: Ensure all path elements in clipPath are properly closed
  svgContent = svgContent.replace(
    /<path clip-rule="[^"]*" d="[^"]*">/g,
    function(match) {
      if (!match.endsWith('/>')) {
        const dMatch = match.match(/d="([^"]*)"/);
        if (dMatch) {
          return `<path clip-rule="nonzero" d="${dMatch[1]}"/>`;
        }
      }
      return match;
    }
  );
  
  console.log(`📊 Content length: ${originalLength} -> ${svgContent.length}`);
  
  fs.writeFileSync(filePath, svgContent);
  console.log('✅ SVG corruption fixes applied');
}

// Fix the corrupted SVG
fixSVGCorruption('./uploads/2fdd6f2da48b60bc1e28d58d513b09a3.svg');