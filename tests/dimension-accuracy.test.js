/**
 * DIMENSION ACCURACY TESTS
 * 
 * Critical tests to ensure dimension calculations remain accurate.
 * These tests prevent regressions in the core dimension functionality.
 */

const { calculatePreciseDimensions, detectDimensionsFromSVG, validateDimensionAccuracy } = require('../server/dimension-utils');

describe('Dimension Accuracy Tests', () => {
  
  test('Known logo dimensions should be exact', () => {
    // User's specific logo: 600×595px = 210×208.249mm
    const result = calculatePreciseDimensions(600, 595, 'content_bounds');
    
    expect(result.widthPx).toBe(600);
    expect(result.heightPx).toBe(595);
    expect(result.widthMm).toBeCloseTo(210, 2);
    expect(result.heightMm).toBeCloseTo(208.25, 2);
    expect(result.accuracy).toBe('perfect');
    expect(result.conversionFactor).toBe(0.35);
  });
  
  test('Close dimensions should snap to exact values', () => {
    // Floating point variations should snap to exact values
    const result1 = calculatePreciseDimensions(600.7, 595.0, 'content_bounds');
    const result2 = calculatePreciseDimensions(599.8, 594.9, 'content_bounds');
    
    expect(result1.widthPx).toBe(600);
    expect(result1.heightPx).toBe(595);
    expect(result2.widthPx).toBe(600);
    expect(result2.heightPx).toBe(595);
    expect(result1.accuracy).toBe('high');
    expect(result2.accuracy).toBe('high');
  });
  
  test('Dimension validation should catch errors', () => {
    const goodResult = calculatePreciseDimensions(600, 595, 'content_bounds');
    const badResult = calculatePreciseDimensions(500, 400, 'content_bounds');
    
    expect(validateDimensionAccuracy(goodResult, 210, 208.25)).toBe(true);
    expect(validateDimensionAccuracy(badResult, 210, 208.25)).toBe(false);
  });
  
  test('SVG viewBox extraction should work correctly', () => {
    const svgWithViewBox = `<svg viewBox="0 0 600 595" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="595" fill="red"/>
    </svg>`;
    
    const result = detectDimensionsFromSVG(svgWithViewBox);
    
    expect(result.widthPx).toBe(600);
    expect(result.heightPx).toBe(595);
    expect(result.source).toBe('exact_match');
    expect(result.accuracy).toBe('perfect');
  });
  
  test('Conversion factor consistency', () => {
    // Ensure all calculations use the same conversion factor
    const results = [
      calculatePreciseDimensions(100, 100, 'content_bounds'),
      calculatePreciseDimensions(200, 150, 'content_bounds'),
      calculatePreciseDimensions(600, 595, 'content_bounds')
    ];
    
    results.forEach(result => {
      expect(result.conversionFactor).toBe(0.35);
      expect(result.widthMm).toBe(result.widthPx * 0.35);
      expect(result.heightMm).toBe(result.heightPx * 0.35);
    });
  });
  
});

// Manual test runner for development
if (require.main === module) {
  console.log('🧪 Running dimension accuracy tests...\n');
  
  // Test 1: Known dimensions
  console.log('Test 1: Known logo dimensions');
  const knownResult = calculatePreciseDimensions(600, 595, 'content_bounds');
  console.log(`Result: ${knownResult.widthPx}×${knownResult.heightPx}px = ${knownResult.widthMm}×${knownResult.heightMm}mm`);
  console.log(`Accuracy: ${knownResult.accuracy}, Source: ${knownResult.source}\n`);
  
  // Test 2: Floating point precision
  console.log('Test 2: Floating point precision');
  const floatResult = calculatePreciseDimensions(600.7, 595.0, 'content_bounds');
  console.log(`Result: ${floatResult.widthPx}×${floatResult.heightPx}px = ${floatResult.widthMm}×${floatResult.heightMm}mm`);
  console.log(`Accuracy: ${floatResult.accuracy}, Source: ${floatResult.source}\n`);
  
  // Test 3: Validation
  console.log('Test 3: Validation');
  const isValid = validateDimensionAccuracy(knownResult, 210, 208.25);
  console.log(`Validation passed: ${isValid}\n`);
  
  console.log('✅ All tests completed');
}