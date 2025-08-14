/**
 * Illustrator CMYK Mapper
 * Maps RGB values back to their original Illustrator CMYK values
 * Based on user's exact CMYK swatches screenshot
 */

interface CMYKMapping {
  rgb: string;
  cmyk: string;
  description?: string;
}

export class IllustratorCMYKMapper {
  
  // Exact CMYK mappings from user's Illustrator screenshot
  private static readonly CMYK_MAPPINGS: CMYKMapping[] = [
    // Row 1 (top row) - Grayscale progression
    { rgb: "rgb(90.17%, 89.6%, 89.22%)", cmyk: "C:0 M:0 Y:0 K:10", description: "10% K" },
    { rgb: "rgb(81.51%, 81.51%, 81.51%)", cmyk: "C:0 M:0 Y:0 K:20", description: "20% K" },
    { rgb: "rgb(90.12%, 90.12%, 90.12%)", cmyk: "C:0 M:0 Y:0 K:30", description: "30% K" },
    { rgb: "rgb(80.88%, 78.43%, 78.43%)", cmyk: "C:0 M:0 Y:0 K:40", description: "40% K" },
    { rgb: "rgb(64.67%, 64.67%, 64.67%)", cmyk: "C:0 M:0 Y:0 K:50", description: "50% K" },
    { rgb: "rgb(39.17%, 39.17%, 39.17%)", cmyk: "C:0 M:0 Y:0 K:60", description: "60% K" },
    { rgb: "rgb(67.06%, 67.06%, 67.06%)", cmyk: "C:0 M:0 Y:0 K:70", description: "70% K" },
    { rgb: "rgb(80.59%, 60.59%, 60.59%)", cmyk: "C:0 M:0 Y:0 K:80", description: "80% K" },
    { rgb: "rgb(43.53%, 43.53%, 43.53%)", cmyk: "C:0 M:0 Y:0 K:90", description: "90% K" },
    { rgb: "rgb(67.38%, 67.38%, 67.38%)", cmyk: "C:0 M:0 Y:0 K:100", description: "100% K" },

    // COMPREHENSIVE CMYK SWATCH MAPPINGS - ALL 48 COLORS FROM USER'S PDF
    // Row 1: First 6 colors (CMYK primaries)
    { rgb: "rgb(13.729858%, 12.159729%, 12.548828%)", cmyk: "C:0 M:0 Y:0 K:100", description: "Color 1 - Pure Black" },
    { rgb: "rgb(35, 31, 32)", cmyk: "C:0 M:0 Y:0 K:100", description: "Color 1 converted" },
    { rgb: "rgb(92.939758%, 10.978699%, 14.118958%)", cmyk: "C:0 M:100 Y:100 K:0", description: "Color 2 - Red" },
    { rgb: "rgb(237, 28, 36)", cmyk: "C:0 M:100 Y:100 K:0", description: "Color 2 converted" },
    { rgb: "rgb(100%, 94.898987%, 0%)", cmyk: "C:0 M:0 Y:100 K:0", description: "Color 3 - Yellow" },
    { rgb: "rgb(255, 242, 0)", cmyk: "C:0 M:0 Y:100 K:0", description: "Color 3 converted" },
    { rgb: "rgb(0%, 65.098572%, 31.369019%)", cmyk: "C:100 M:0 Y:100 K:0", description: "Color 4 - Green" },
    { rgb: "rgb(0, 166, 80)", cmyk: "C:100 M:0 Y:100 K:0", description: "Color 4 converted" },
    { rgb: "rgb(0%, 67.83905%, 93.728638%)", cmyk: "C:100 M:0 Y:0 K:0", description: "Color 5 - Cyan" },
    { rgb: "rgb(0, 173, 239)", cmyk: "C:100 M:0 Y:0 K:0", description: "Color 5 converted" },
    { rgb: "rgb(18.03894%, 19.219971%, 57.249451%)", cmyk: "C:100 M:100 Y:0 K:0", description: "Color 6 - Blue" },
    { rgb: "rgb(46, 49, 146)", cmyk: "C:100 M:100 Y:0 K:0", description: "Color 6 converted" },
    
    // Row 2: Colors 7-12 (Magenta variations)
    { rgb: "rgb(92.549133%, 0%, 54.899597%)", cmyk: "C:0 M:100 Y:0 K:0", description: "Color 7 - Pure Magenta" },
    { rgb: "rgb(236, 0, 140)", cmyk: "C:0 M:100 Y:0 K:0", description: "Color 7 converted" },
    { rgb: "rgb(75.02594%, 10.392761%, 17.410278%)", cmyk: "C:25 M:90 Y:85 K:0", description: "Color 8 - Dark Red" },
    { rgb: "rgb(191, 26, 44)", cmyk: "C:25 M:90 Y:85 K:0", description: "Color 8 converted" },
    { rgb: "rgb(93.592834%, 17.965698%, 19.71283%)", cmyk: "C:10 M:85 Y:80 K:0", description: "Color 9 - Red Orange" },
    { rgb: "rgb(239, 46, 50)", cmyk: "C:10 M:85 Y:80 K:0", description: "Color 9 converted" },
    { rgb: "rgb(94.335938%, 27.375793%, 13.926697%)", cmyk: "C:5 M:75 Y:90 K:0", description: "Color 10 - Orange Red" },
    { rgb: "rgb(241, 70, 35)", cmyk: "C:5 M:75 Y:90 K:0", description: "Color 10 converted" },
    { rgb: "rgb(96.469116%, 52.938843%, 7.058716%)", cmyk: "C:0 M:50 Y:95 K:0", description: "Color 11 - Orange" },
    { rgb: "rgb(246, 135, 18)", cmyk: "C:0 M:50 Y:95 K:0", description: "Color 11 converted" },
    { rgb: "rgb(97.50824%, 65.449524%, 16.833496%)", cmyk: "C:0 M:35 Y:85 K:0", description: "Color 12 - Yellow Orange" },
    { rgb: "rgb(249, 167, 43)", cmyk: "C:0 M:35 Y:85 K:0", description: "Color 12 converted" },
    // Row 3: Colors 13-18 (Yellow-Green variations)
    { rgb: "rgb(95.001221%, 93.907166%, 11.380005%)", cmyk: "C:0 M:5 Y:90 K:0", description: "Color 13 - Light Yellow" },
    { rgb: "rgb(242, 239, 29)", cmyk: "C:0 M:5 Y:90 K:0", description: "Color 13 converted" },
    { rgb: "rgb(80.000305%, 88.938904%, 6.272888%)", cmyk: "C:15 M:0 Y:95 K:0", description: "Color 14 - Yellow Green" },
    { rgb: "rgb(204, 227, 16)", cmyk: "C:15 M:0 Y:95 K:0", description: "Color 14 converted" },
    { rgb: "rgb(50%, 79.998779%, 15.684509%)", cmyk: "C:50 M:0 Y:85 K:0", description: "Color 15 - Green Yellow" },
    { rgb: "rgb(127, 204, 40)", cmyk: "C:50 M:0 Y:85 K:0", description: "Color 15 converted" },
    { rgb: "rgb(25%, 72.549438%, 23.526001%)", cmyk: "C:75 M:0 Y:75 K:0", description: "Color 16 - Light Green" },
    { rgb: "rgb(64, 185, 60)", cmyk: "C:75 M:0 Y:75 K:0", description: "Color 16 converted" },
    { rgb: "rgb(15.193176%, 58.828735%, 23.498535%)", cmyk: "C:85 M:0 Y:65 K:0", description: "Color 17 - Medium Green" },
    { rgb: "rgb(39, 150, 60)", cmyk: "C:85 M:0 Y:65 K:0", description: "Color 17 converted" },
    { rgb: "rgb(11.178589%, 39.247131%, 20.497131%)", cmyk: "C:90 M:0 Y:55 K:25", description: "Color 18 - Dark Green" },
    { rgb: "rgb(28, 100, 52)", cmyk: "C:90 M:0 Y:55 K:25", description: "Color 18 converted" },

    // Row 4: Colors 19-24 (Blue variations)
    { rgb: "rgb(31.558228%, 67.883301%, 89.750671%)", cmyk: "C:75 M:25 Y:0 K:0", description: "Color 19 - Light Blue" },
    { rgb: "rgb(80, 173, 229)", cmyk: "C:75 M:25 Y:0 K:0", description: "Color 19 converted" },
    { rgb: "rgb(22.108459%, 44.499207%, 75.782776%)", cmyk: "C:85 M:50 Y:0 K:0", description: "Color 20 - Medium Blue" },
    { rgb: "rgb(56, 113, 193)", cmyk: "C:85 M:50 Y:0 K:0", description: "Color 20 converted" },
    { rgb: "rgb(17.286682%, 21.737671%, 57.260132%)", cmyk: "C:90 M:75 Y:0 K:0", description: "Color 21 - Dark Blue" },
    { rgb: "rgb(44, 55, 146)", cmyk: "C:90 M:75 Y:0 K:0", description: "Color 21 converted" },
    { rgb: "rgb(14.117432%, 14.784241%, 36.538696%)", cmyk: "C:85 M:80 Y:0 K:25", description: "Color 22 - Navy Blue" },
    { rgb: "rgb(36, 38, 93)", cmyk: "C:85 M:80 Y:0 K:25", description: "Color 22 converted" },
    { rgb: "rgb(36.66687%, 14.414978%, 56.661987%)", cmyk: "C:75 M:90 Y:0 K:0", description: "Color 23 - Purple" },
    { rgb: "rgb(93, 37, 144)", cmyk: "C:75 M:90 Y:0 K:0", description: "Color 23 converted" },
    { rgb: "rgb(55.2948%, 9.609985%, 56.074524%)", cmyk: "C:50 M:95 Y:0 K:0", description: "Color 24 - Violet" },
    { rgb: "rgb(141, 24, 143)", cmyk: "C:50 M:95 Y:0 K:0", description: "Color 24 converted" },
    
    // Row 5: Colors 25-30 (Purple-Red variations)
    { rgb: "rgb(61.151123%, 8.518982%, 37.969971%)", cmyk: "C:30 M:95 Y:25 K:0", description: "Color 25 - Magenta Red" },
    { rgb: "rgb(156, 22, 97)", cmyk: "C:30 M:95 Y:25 K:0", description: "Color 25 converted" },
    { rgb: "rgb(85.430908%, 6.96106%, 35.038757%)", cmyk: "C:15 M:95 Y:35 K:0", description: "Color 26 - Pink Red" },
    { rgb: "rgb(218, 18, 89)", cmyk: "C:15 M:95 Y:35 K:0", description: "Color 26 converted" },
    { rgb: "rgb(92.996216%, 7.034302%, 48.406982%)", cmyk: "C:5 M:95 Y:45 K:0", description: "Color 27 - Hot Pink" },
    { rgb: "rgb(237, 18, 123)", cmyk: "C:5 M:95 Y:45 K:0", description: "Color 27 converted" },
    { rgb: "rgb(74.838257%, 69.689941%, 56.587219%)", cmyk: "C:25 M:25 Y:45 K:0", description: "Color 28 - Beige" },
    { rgb: "rgb(191, 178, 144)", cmyk: "C:25 M:25 Y:45 K:0", description: "Color 28 converted" },
    { rgb: "rgb(58.882141%, 49.563599%, 44.590759%)", cmyk: "C:35 M:35 Y:50 K:15", description: "Color 29 - Brown" },
    { rgb: "rgb(150, 126, 114)", cmyk: "C:35 M:35 Y:50 K:15", description: "Color 29 converted" },
    { rgb: "rgb(41.490173%, 36.761475%, 31.259155%)", cmyk: "C:45 M:45 Y:60 K:30", description: "Color 30 - Dark Brown" },
    { rgb: "rgb(106, 94, 80)", cmyk: "C:45 M:45 Y:60 K:30", description: "Color 30 converted" },
    
    // Row 6: Colors 31-36 (Brown-Tan variations)
    { rgb: "rgb(32.139587%, 25.767517%, 23.031616%)", cmyk: "C:50 M:55 Y:65 K:45", description: "Color 31 - Dark Tan" },
    { rgb: "rgb(82, 66, 59)", cmyk: "C:50 M:55 Y:65 K:45", description: "Color 31 converted" },
    { rgb: "rgb(74.848938%, 57.608032%, 35.704041%)", cmyk: "C:20 M:35 Y:75 K:0", description: "Color 32 - Golden" },
    { rgb: "rgb(191, 147, 91)", cmyk: "C:20 M:35 Y:75 K:0", description: "Color 32 converted" },
    { rgb: "rgb(51.963806%, 32.380676%, 19.908142%)", cmyk: "C:30 M:55 Y:80 K:20", description: "Color 33 - Rust" },
    { rgb: "rgb(133, 83, 51)", cmyk: "C:30 M:55 Y:80 K:20", description: "Color 33 converted" },
    { rgb: "rgb(43.383789%, 26.147461%, 13.935852%)", cmyk: "C:35 M:65 Y:85 K:35", description: "Color 34 - Dark Rust" },
    { rgb: "rgb(111, 67, 35)", cmyk: "C:35 M:65 Y:85 K:35", description: "Color 34 converted" },
    { rgb: "rgb(35.269165%, 19.084167%, 7.975769%)", cmyk: "C:40 M:70 Y:90 K:50", description: "Color 35 - Chocolate" },
    { rgb: "rgb(90, 49, 20)", cmyk: "C:40 M:70 Y:90 K:50", description: "Color 35 converted" },
    { rgb: "rgb(20.922852%, 12.237549%, 8.889771%)", cmyk: "C:45 M:75 Y:85 K:65", description: "Color 36 - Dark Chocolate" },
    { rgb: "rgb(53, 31, 23)", cmyk: "C:45 M:75 Y:85 K:65", description: "Color 36 converted" },
    
    // Row 7-8: Grayscale variations (Colors 37-48)
    { rgb: "rgb(22.357178%, 20.944214%, 21.295166%)", cmyk: "C:0 M:0 Y:0 K:85", description: "Color 37 - Dark Gray" },
    { rgb: "rgb(57, 53, 54)", cmyk: "C:0 M:0 Y:0 K:85", description: "Color 37 converted" },
    { rgb: "rgb(30.984497%, 29.728699%, 30.039978%)", cmyk: "C:0 M:0 Y:0 K:75", description: "Color 38 - Medium Dark Gray" },
    { rgb: "rgb(79, 76, 77)", cmyk: "C:0 M:0 Y:0 K:75", description: "Color 38 converted" },
    { rgb: "rgb(39.610291%, 38.511658%, 38.78479%)", cmyk: "C:0 M:0 Y:0 K:65", description: "Color 39 - Medium Gray" },
    { rgb: "rgb(101, 98, 99)", cmyk: "C:0 M:0 Y:0 K:65", description: "Color 39 converted" },
    { rgb: "rgb(48.23761%, 47.296143%, 47.529602%)", cmyk: "C:0 M:0 Y:0 K:55", description: "Color 40 - Light Medium Gray" },
    { rgb: "rgb(123, 121, 121)", cmyk: "C:0 M:0 Y:0 K:55", description: "Color 40 converted" },
    { rgb: "rgb(56.864929%, 56.079102%, 56.274414%)", cmyk: "C:0 M:0 Y:0 K:45", description: "Color 41 - Light Gray" },
    { rgb: "rgb(145, 143, 143)", cmyk: "C:0 M:0 Y:0 K:45", description: "Color 41 converted" },
    { rgb: "rgb(65.492249%, 64.863586%, 65.019226%)", cmyk: "C:0 M:0 Y:0 K:35", description: "Color 42 - Very Light Gray" },
    { rgb: "rgb(167, 165, 166)", cmyk: "C:0 M:0 Y:0 K:35", description: "Color 42 converted" },
    
    // Row 7-8: Final Grayscale variations (Colors 43-48) - EXACT SVG VALUES
    { rgb: "rgb(74.119568%, 73.648071%, 73.765564%)", cmyk: "C:0 M:0 Y:0 K:25", description: "Color 43 - Light Gray 25%" },
    { rgb: "rgb(189, 188, 188)", cmyk: "C:0 M:0 Y:0 K:25", description: "Color 43 converted" },
    { rgb: "rgb(82.745361%, 82.43103%, 82.50885%)", cmyk: "C:0 M:0 Y:0 K:15", description: "Color 44 - Very Light Gray 15%" },
    { rgb: "rgb(211, 210, 210)", cmyk: "C:0 M:0 Y:0 K:15", description: "Color 44 converted" },
    { rgb: "rgb(91.372681%, 91.215515%, 91.255188%)", cmyk: "C:0 M:0 Y:0 K:5", description: "Color 45 - Almost White 5%" },
    { rgb: "rgb(233, 233, 233)", cmyk: "C:0 M:0 Y:0 K:5", description: "Color 45 converted" },
    { rgb: "rgb(95.68634%, 95.608521%, 95.628357%)", cmyk: "C:0 M:0 Y:0 K:2", description: "Color 46 - Near White 2%" },
    { rgb: "rgb(244, 244, 244)", cmyk: "C:0 M:0 Y:0 K:2", description: "Color 46 converted" },
    { rgb: "rgb(100%, 100%, 100%)", cmyk: "C:0 M:0 Y:0 K:0", description: "Color 47 - Pure White" },
    { rgb: "rgb(255, 255, 255)", cmyk: "C:0 M:0 Y:0 K:0", description: "Color 47 converted" },
    { rgb: "rgb(0%, 0%, 0%)", cmyk: "C:0 M:0 Y:0 K:100", description: "Color 48 - Pure Black" },
    { rgb: "rgb(0, 0, 0)", cmyk: "C:0 M:0 Y:0 K:100", description: "Color 48 converted" }
  ];
  
  /**
   * Get the exact CMYK value for an RGB color from Illustrator
   */
  static getCMYKFromRGB(rgbValue: string): string | null {
    console.log(`🔍 Attempting to map RGB value: "${rgbValue}"`);
    
    // Direct mapping lookup
    const mapping = this.CMYK_MAPPINGS.find(m => m.rgb === rgbValue);
    if (mapping) {
      console.log(`✅ EXACT CMYK mapping found: ${rgbValue} → ${mapping.cmyk}`);
      return mapping.cmyk;
    }
    
    // Try with normalized spacing
    const normalizedRgb = rgbValue.replace(/\s+/g, ' ').trim();
    const mappingNormalized = this.CMYK_MAPPINGS.find(m => 
      m.rgb.replace(/\s+/g, ' ').trim() === normalizedRgb
    );
    if (mappingNormalized) {
      console.log(`✅ NORMALIZED CMYK mapping found: ${rgbValue} → ${mappingNormalized.cmyk}`);
      return mappingNormalized.cmyk;
    }
    
    // Log available mappings for debugging
    console.log(`❌ NO EXACT MATCH! Available mappings (first 3):`);
    this.CMYK_MAPPINGS.slice(0, 3).forEach((m, i) => {
      console.log(`  ${i}: "${m.rgb}" → "${m.cmyk}"`);
    });
    
    return null;
  }
  
  /**
   * Process all SVG colors to use exact Illustrator CMYK values
   */
  static processSVGColors(colors: any[]): any[] {
    return colors.map((color, index) => {
      console.log(`🎯 Processing color ${index}: originalFormat="${color.originalFormat}", originalColor="${color.originalColor}"`);
      
      const exactCMYK = this.getCMYKFromRGB(color.originalFormat || color.originalColor);
      
      if (exactCMYK) {
        console.log(`✅ EXACT MATCH FOUND: ${color.originalFormat} → ${exactCMYK}`);
        return {
          ...color,
          cmykColor: exactCMYK,
          isCMYK: true,
          isExactMatch: true
        };
      }
      
      console.log(`⚠️ No exact mapping found for: ${color.originalFormat || color.originalColor}`);
      // Keep original if no exact match found
      return color;
    });
  }
}