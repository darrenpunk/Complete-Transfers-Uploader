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
    // Row 1 (top row)
    { rgb: "rgb(7.000732%, 7.241821%, 7.885742%)", cmyk: "C:5 M:45 Y:42 K:47", description: "Dark Gray" },
    { rgb: "rgb(92.76886%, 12.489319%, 15.208435%)", cmyk: "C:60 M:51 Y:45 K:67", description: "Red" },
    { rgb: "rgb(99.172974%, 94.563293%, 4.981995%)", cmyk: "C:52 M:71 Y:82 K:66", description: "Yellow" },
    { rgb: "rgb(1.985168%, 65.284729%, 31.750488%)", cmyk: "C:35 M:68 Y:98 K:53", description: "Green" },
    { rgb: "rgb(9.204102%, 67.147827%, 91.900635%)", cmyk: "C:46 M:64 Y:95 K:25", description: "Light Blue" },
    { rgb: "rgb(18.777466%, 19.741821%, 56.468201%)", cmyk: "C:46 M:66 Y:87 K:7", description: "Blue" },
    
    // Row 2 (second row)
    { rgb: "rgb(91.989136%, 5.14679%, 54.139709%)", cmyk: "C:24 M:40 Y:94 K:0", description: "Magenta" },
    { rgb: "rgb(76.013184%, 10.501099%, 17.29126%)", cmyk: "C:55 M:60 Y:23", description: "Dark Red" },
    { rgb: "rgb(93.722534%, 27.560425%, 13.729858%)", cmyk: "C:51 M:59 Y:40 K:23", description: "Red Orange" },
    { rgb: "rgb(96.157837%, 53.038025%, 8.100891%)", cmyk: "C:39 M:41 Y:49 K:7", description: "Orange" },
    
    // Row 3 (third row)
    { rgb: "rgb(80.500793%, 89.163208%, 7.598877%)", cmyk: "C:24 M:25 Y:40 K:0", description: "Light Green" },
    { rgb: "rgb(50.401306%, 80.181885%, 16.859436%)", cmyk: "C:49 M:59 Y:21 K:0", description: "Green" },
    { rgb: "rgb(15.246582%, 59.060669%, 24.139404%)", cmyk: "C:6 M:60 Y:47 K:0", description: "Dark Green" },
    { rgb: "rgb(11.767578%, 40.049744%, 20.759583%)", cmyk: "C:27 M:68 Y:28 K:16", description: "Forest Green" },
    { rgb: "rgb(25.106812%, 72.935486%, 41.372681%)", cmyk: "C:49 M:38 Y:0 K:2", description: "Teal" },
    { rgb: "rgb(21.728516%, 67.240906%, 61.758423%)", cmyk: "C:73 M:37 Y:0 K:5", description: "Blue Green" },
    
    // Row 4 (fourth row)
    { rgb: "rgb(31.607056%, 68.200684%, 89.131165%)", cmyk: "C:31 M:68 Y:0 K:7", description: "Light Blue" },
    { rgb: "rgb(22.070312%, 44.40918%, 75.183105%)", cmyk: "C:91 M:85 Y:0 K:7", description: "Blue" },
    { rgb: "rgb(17.375183%, 21.658325%, 56.292725%)", cmyk: "C:85 M:50 Y:0 K:51", description: "Navy Blue" },
    { rgb: "rgb(12.612915%, 13.807678%, 34.046936%)", cmyk: "C:70 M:14 Y:0 K:0", description: "Purple Blue" },
    
    // Row 5 (fifth row)
    { rgb: "rgb(61.289978%, 7.833862%, 37.254333%)", cmyk: "C:80 M:10 Y:4 K:0", description: "Cyan" },
    { rgb: "rgb(85.559082%, 7.225037%, 34.786987%)", cmyk: "C:75 M:1 Y:5 K:0", description: "Light Cyan" },
    { rgb: "rgb(92.704773%, 7.263184%, 48.147583%)", cmyk: "C:90 M:31 Y:96 K:20", description: "Green" },
    { rgb: "rgb(75.588989%, 70.179749%, 56.771851%)", cmyk: "C:85 M:9 Y:99 K:10", description: "Yellow Green" },
    { rgb: "rgb(58.828735%, 49.867249%, 44.384766%)", cmyk: "C:50 M:0 Y:98 K:0", description: "Lime" },
    { rgb: "rgb(41.706848%, 37.181091%, 31.791687%)", cmyk: "C:20 M:0 Y:98 K:0", description: "Yellow" },
    
    // Row 6 (sixth row)
    { rgb: "rgb(32.249451%, 25.645447%, 22.967529%)", cmyk: "C:5 M:0 Y:0 K:0", description: "Light Yellow" },
    { rgb: "rgb(75.561523%, 57.865906%, 35.968018%)", cmyk: "C:0 M:35 Y:85 K:0", description: "Orange" },
    { rgb: "rgb(53.799438%, 35.357666%, 22.257996%)", cmyk: "C:0 M:50 Y:98 K:0", description: "Red Orange" },
    { rgb: "rgb(45.056152%, 28.410339%, 14.622498%)", cmyk: "C:0 M:80 Y:95 K:0", description: "Red" },
    
    // Bottom rows (grayscale)
    { rgb: "rgb(18.185425%, 17.901611%, 19.056702%)", cmyk: "C:9 M:98 Y:87 K:14", description: "Dark Gray" },
    { rgb: "rgb(28.578186%, 29.006958%, 30.264282%)", cmyk: "C:1 M:6 Y:6 K:0", description: "Gray" },
    { rgb: "rgb(38.821411%, 39.189148%, 41.027832%)", cmyk: "C:97 M:6 Y:0 K:0", description: "Light Gray" },
    { rgb: "rgb(48.703003%, 49.708557%, 51.428223%)", cmyk: "C:92 M:6 Y:0 K:0", description: "Medium Gray" },
    { rgb: "rgb(57.907104%, 59.997559%, 60.600281%)", cmyk: "C:98 M:0 Y:98 K:1", description: "Light Gray" },
    { rgb: "rgb(66.914368%, 68.496704%, 69.17572%)", cmyk: "C:1 M:40 Y:95 K:0", description: "Very Light Gray" },
    
    // Final row
    { rgb: "rgb(75.480652%, 77.346802%, 77.163696%)", cmyk: "C:0 M:98 Y:0 K:0", description: "White Pink" },
    { rgb: "rgb(83.642578%, 84.518433%, 84.983826%)", cmyk: "C:27 M:58 Y:48 K:59", description: "Light Gray" },
    { rgb: "rgb(91.902161%, 91.970825%, 91.525269%)", cmyk: "C:72 M:58 Y:48 K:89", description: "Very Light Gray" },
    { rgb: "rgb(100%, 100%, 100%)", cmyk: "C:0 M:0 Y:0 K:0", description: "White" },
    { rgb: "rgb(3.903198%, 4.464722%, 5.921936%)", cmyk: "C:0 M:0 Y:0 K:100", description: "Black" },
  ];
  
  /**
   * Get the exact CMYK value for an RGB color from Illustrator
   */
  static getCMYKFromRGB(rgbValue: string): string | null {
    // Direct mapping lookup
    const mapping = this.CMYK_MAPPINGS.find(m => m.rgb === rgbValue);
    if (mapping) {
      console.log(`🎨 Exact CMYK mapping found: ${rgbValue} → ${mapping.cmyk}`);
      return mapping.cmyk;
    }
    
    // Try with normalized spacing
    const normalizedRgb = rgbValue.replace(/\s+/g, ' ').trim();
    const mappingNormalized = this.CMYK_MAPPINGS.find(m => 
      m.rgb.replace(/\s+/g, ' ').trim() === normalizedRgb
    );
    if (mappingNormalized) {
      console.log(`🎨 Normalized CMYK mapping found: ${rgbValue} → ${mappingNormalized.cmyk}`);
      return mappingNormalized.cmyk;
    }
    
    console.log(`⚠️ No exact CMYK mapping found for: ${rgbValue}`);
    return null;
  }
  
  /**
   * Process all SVG colors to use exact Illustrator CMYK values
   */
  static processSVGColors(colors: any[]): any[] {
    return colors.map((color, index) => {
      const exactCMYK = this.getCMYKFromRGB(color.originalFormat || color.originalColor);
      
      if (exactCMYK) {
        return {
          ...color,
          cmykColor: exactCMYK,
          isCMYK: true,
          isExactMatch: true
        };
      }
      
      // Keep original if no exact match found
      return color;
    });
  }
}