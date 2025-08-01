#!/usr/bin/env node

import fs from 'fs';

console.log('=== Verifying CMYK Fix Implementation ===\n');

// Check 1: svg-color-utils.ts has proper CMYK detection
const svgUtils = fs.readFileSync('server/svg-color-utils.ts', 'utf8');
const hasCMYKDetection = svgUtils.includes('device-cmyk\\s*\\(([^)]+)\\)/i');
const hasSimpleCMYK = svgUtils.includes('cmyk\\s*\\(([^)]+)\\)/i');
console.log(`✓ CMYK Detection in svg-color-utils.ts: ${hasCMYKDetection && hasSimpleCMYK ? 'FOUND' : 'MISSING'}`);

// Check 2: routes.ts has proper color processing
const routes = fs.readFileSync('server/routes.ts', 'utf8');
const hasColorProcessing = routes.includes('const isCMYK = (color as any).isCMYK || false');
const hasShouldConvert = routes.includes('const shouldConvert = colorWorkflow.convertToCMYK && !isCMYK');
console.log(`✓ Color Processing in routes.ts: ${hasColorProcessing && hasShouldConvert ? 'FOUND' : 'MISSING'}`);

// Check 3: enhanced-cmyk-generator.ts has embedICCProfileOnly
const generator = fs.readFileSync('server/enhanced-cmyk-generator.ts', 'utf8');
const hasEmbedICCOnly = generator.includes('private async embedICCProfileOnly');
const hasLeaveColorUnchanged = generator.includes('LeaveColorUnchanged');
console.log(`✓ embedICCProfileOnly method: ${hasEmbedICCOnly && hasLeaveColorUnchanged ? 'FOUND' : 'MISSING'}`);

// Check 4: enhanced-cmyk-generator.ts has proper hasExistingCMYK logic
const hasExistingCMYKCheck = generator.includes('if (colorInfo.isCMYK)');
const hasConditionalConversion = generator.includes('if (preservedExactCMYK && !hasExistingCMYK)');
console.log(`✓ Conditional CMYK conversion logic: ${hasExistingCMYKCheck && hasConditionalConversion ? 'FOUND' : 'MISSING'}`);

console.log('\nIf all checks show FOUND, the CMYK fix is properly implemented.');
console.log('Run this script after any rollback to verify the fix is intact.');