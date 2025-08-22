import * as fs from 'fs';
import * as path from 'path';

/**
 * Fix SVG namespace issues that prevent browser loading
 */
export function fixSVGNamespaces(svgPath: string): void {
  try {
    console.log(`🔧 FIXING SVG namespaces: ${path.basename(svgPath)}`);
    
    let svgContent = fs.readFileSync(svgPath, 'utf8');
    
    // Add missing xlink namespace if xlink:href is used but namespace not declared
    if (svgContent.includes('xlink:href') && !svgContent.includes('xmlns:xlink')) {
      svgContent = svgContent.replace(
        '<svg',
        '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
      );
      console.log(`✅ Added missing xlink namespace`);
    }
    
    // Ensure main SVG namespace is present
    if (!svgContent.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgContent = svgContent.replace(
        '<svg',
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
      console.log(`✅ Added main SVG namespace`);
    }
    
    // Write fixed content back
    fs.writeFileSync(svgPath, svgContent);
    console.log(`✅ SVG namespaces fixed: ${path.basename(svgPath)}`);
    
  } catch (error) {
    console.error(`❌ Failed to fix SVG namespaces: ${error}`);
  }
}