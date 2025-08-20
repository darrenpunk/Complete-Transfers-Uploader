/**
 * Test script to verify bounds integration is working properly
 */

const fs = require('fs');
const path = require('path');

// Import the bounds analyzers
const { SVGBoundsAnalyzer } = require('./server/svg-bounds-analyzer.js');

async function testBoundsIntegration() {
  console.log('🔧 Testing bounds integration...');
  
  const testSvg = 'uploads/dd7d1eeaa1f1a43d931f639c5ca811d6.svg';
  
  if (!fs.existsSync(testSvg)) {
    console.log('❌ Test SVG file not found');
    return;
  }
  
  try {
    const analyzer = new SVGBoundsAnalyzer();
    const result = await analyzer.extractSVGBounds(testSvg);
    
    console.log('✅ Bounds extraction result:', {
      success: result.success,
      method: result.method,
      contentBounds: result.contentBounds ? {
        width: result.contentBounds.width.toFixed(2),
        height: result.contentBounds.height.toFixed(2),
        xMin: result.contentBounds.xMin.toFixed(2),
        yMin: result.contentBounds.yMin.toFixed(2)
      } : null
    });
    
    if (result.success && result.contentBounds) {
      // Convert to mm like the upload system does
      const pxToMm = 25.4 / 96;
      const widthMm = result.contentBounds.width * pxToMm;
      const heightMm = result.contentBounds.height * pxToMm;
      
      console.log(`📐 Converted dimensions: ${widthMm.toFixed(2)}×${heightMm.toFixed(2)}mm`);
      console.log('✅ Integration test successful!');
    } else {
      console.log('❌ Integration test failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testBoundsIntegration();