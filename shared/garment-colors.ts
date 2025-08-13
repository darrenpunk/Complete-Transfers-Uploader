// Manufacturer garment colors with CMYK values
export interface ManufacturerColor {
  code: string;
  name: string;
  hex: string;
  cmyk: {
    c: number;
    m: number;
    y: number;
    k: number;
  };
  pantone?: string;
  pantoneTextile?: string;
}

export interface ManufacturerColorGroup {
  name: string;
  colors: ManufacturerColor[];
}

export const gildanColors: ManufacturerColorGroup[] = [
  {
    name: "Basic Colors",
    colors: [
      { code: "030", name: "White", hex: "#FFFFFF", cmyk: { c: 0, m: 0, y: 0, k: 0 }, pantoneTextile: "11-0601 TCX" },
      { code: "036", name: "Black", hex: "#25282A", cmyk: { c: 94, m: 77, y: 53, k: 94 }, pantone: "426", pantoneTextile: "19-4005 TCX" },
      { code: "093", name: "Ash Grey", hex: "#C8C9C7", cmyk: { c: 8, m: 5, y: 7, k: 16 }, pantone: "Cool Grey 3", pantoneTextile: "14-4201 TCX" },
      { code: "custom4", name: "Charcoal Black", hex: "#171816", cmyk: { c: 78, m: 68, y: 62, k: 91 }, pantone: "Custom" },
      { code: "042", name: "Charcoal", hex: "#66676C", cmyk: { c: 40, m: 30, y: 20, k: 66 }, pantone: "Cool Grey 10", pantoneTextile: "18-0201 TCX" },
      { code: "032", name: "Navy", hex: "#263147", cmyk: { c: 95, m: 72, y: 15, k: 67 }, pantone: "533", pantoneTextile: "19-3921 TCX" },
    ]
  },
  {
    name: "Red Colors",
    colors: [
      { code: "040", name: "Red", hex: "#D50032", cmyk: { c: 0, m: 100, y: 72, k: 0 }, pantone: "199", pantoneTextile: "18-1660 TCX" },
      { code: "011", name: "Cardinal Red", hex: "#8A1538", cmyk: { c: 0, m: 100, y: 54, k: 43 }, pantone: "1955", pantoneTextile: "19-1940 TCX" },
      { code: "194", name: "Cherry Red", hex: "#AC2B37", cmyk: { c: 0, m: 100, y: 82, k: 26 }, pantone: "187", pantoneTextile: "19-1764 TCX" },
      { code: "246", name: "Antique Cherry Red", hex: "#971B2F", cmyk: { c: 0, m: 100, y: 70, k: 33 }, pantone: "7427", pantoneTextile: "19-1862 TCX" },
      { code: "219", name: "Garnet", hex: "#7D2935", cmyk: { c: 16, m: 100, y: 65, k: 58 }, pantone: "188", pantoneTextile: "19-1650 TCX" },
      { code: "083", name: "Maroon", hex: "#5B2B42", cmyk: { c: 0, m: 81, y: 0, k: 79 }, pantone: "7644", pantoneTextile: "19-1522 TCX" },
      { code: "custom1", name: "Dark Burgundy", hex: "#762009", cmyk: { c: 18, m: 95, y: 68, k: 56 }, pantone: "Custom" },
    ]
  },
  {
    name: "Blue Colors",
    colors: [
      { code: "051", name: "Royal", hex: "#224D8F", cmyk: { c: 100, m: 73, y: 0, k: 10 }, pantone: "7686", pantoneTextile: "19-4050 TX" },
      { code: "026", name: "Sapphire", hex: "#0077B5", cmyk: { c: 100, m: 23, y: 0, k: 19 }, pantone: "641", pantoneTextile: "17-4247 TCX" },
      { code: "254", name: "Antique Sapphire", hex: "#006A8E", cmyk: { c: 100, m: 16, y: 10, k: 44 }, pantone: "7706", pantoneTextile: "18-4432 TCX" },
      { code: "109", name: "Carolina Blue", hex: "#7ba4db", cmyk: { c: 59, m: 27, y: 0, k: 0 }, pantone: "659", pantoneTextile: "16-4020 TCX" },
      { code: "069", name: "Light Blue", hex: "#A4C8E1", cmyk: { c: 37, m: 9, y: 0, k: 1 }, pantone: "543", pantoneTextile: "14-4317 TCX" },
      { code: "187", name: "Sky", hex: "#71c5e8", cmyk: { c: 52, m: 0, y: 1, k: 0 }, pantone: "297", pantoneTextile: "14-4516 TCX" },
      { code: "080", name: "Indigo Blue", hex: "#486D87", cmyk: { c: 68, m: 35, y: 17, k: 40 }, pantone: "5405", pantoneTextile: "18-4025 TCX" },
      { code: "056", name: "Iris", hex: "#3975B7", cmyk: { c: 88, m: 50, y: 0, k: 0 }, pantone: "660", pantoneTextile: "18-4039 TCX" },
    ]
  },
  {
    name: "Green Colors",
    colors: [
      { code: "167", name: "Irish Green", hex: "#00A74A", cmyk: { c: 88, m: 0, y: 86, k: 0 }, pantone: "2252", pantoneTextile: "15-5534 TCX" },
      { code: "248", name: "Antique Irish Green", hex: "#00843D", cmyk: { c: 96, m: 2, y: 100, k: 12 }, pantone: "348", pantoneTextile: "17-6153 TCX" },
      { code: "017", name: "Kelly Green", hex: "#00805E", cmyk: { c: 97, m: 6, y: 69, k: 19 }, pantone: "335", pantoneTextile: "18-5642 TCX" },
      { code: "033", name: "Forest Green", hex: "#273B33", cmyk: { c: 79, m: 34, y: 62, k: 84 }, pantone: "5535", pantoneTextile: "19-6110 TCX" },
      { code: "106", name: "Military Green", hex: "#5E7461", cmyk: { c: 52, m: 16, y: 52, k: 54 }, pantone: "5615", pantoneTextile: "17-5912 TCX" },
      { code: "455", name: "Mint Green", hex: "#A0CFA8", cmyk: { c: 43, m: 0, y: 41, k: 0 }, pantone: "345", pantoneTextile: "13-0117 TCX" },
      { code: "012", name: "Lime", hex: "#92BF55", cmyk: { c: 52, m: 0, y: 82, k: 0 }, pantone: "7488", pantoneTextile: "15-0146 TCX" },
      { code: "279", name: "Electric Green", hex: "#43B02A", cmyk: { c: 77, m: 0, y: 100, k: 0 }, pantone: "361", pantoneTextile: "16-6339 TCX" },
      { code: "188", name: "Safety Green", hex: "#C6D219", cmyk: { c: 28, m: 0, y: 100, k: 0 }, pantone: "382", pantoneTextile: "13-0550 TCX" },
    ]
  },
  {
    name: "Orange Colors",
    colors: [
      { code: "037", name: "Orange", hex: "#F4633A", cmyk: { c: 0, m: 68, y: 76, k: 0 }, pantone: "2026", pantoneTextile: "16-1362 TCX" },
      { code: "252", name: "Antique Orange", hex: "#B33D26", cmyk: { c: 0, m: 85, y: 98, k: 20 }, pantone: "7599", pantoneTextile: "18-1354 TCX" },
      { code: "193", name: "S Orange", hex: "#E5801C", cmyk: { c: 0, m: 65, y: 100, k: 0 }, pantone: "Orange 021", pantoneTextile: "16-1364 TCX" },
      { code: "035", name: "Tangerine", hex: "#FF8A3D", cmyk: { c: 0, m: 50, y: 71, k: 0 }, pantone: "2025", pantoneTextile: "16-1357 TCX" },
      { code: "025", name: "T. Orange", hex: "#B65A30", cmyk: { c: 0, m: 69, y: 85, k: 24 }, pantone: "7592", pantoneTextile: "18-1248 TCX" },
      { code: "285", name: "Sunset", hex: "#DC6B2F", cmyk: { c: 0, m: 67, y: 100, k: 0 }, pantone: "7578", pantoneTextile: "16-1440 TCX" },
      { code: "custom2", name: "Golden Orange", hex: "#D98F17", cmyk: { c: 8, m: 38, y: 95, k: 2 }, pantone: "Custom" },
    ]
  },
  {
    name: "Yellow Colors",
    colors: [
      { code: "098", name: "Daisy", hex: "#fed141", cmyk: { c: 0, m: 18, y: 74, k: 0 }, pantone: "122", pantoneTextile: "13-0758 TCX" },
      { code: "024", name: "Gold", hex: "#EEAD1A", cmyk: { c: 0, m: 31, y: 98, k: 0 }, pantone: "1235", pantoneTextile: "14-1064 TCX" },
      { code: "222", name: "Old Gold", hex: "#C39367", cmyk: { c: 18, m: 41, y: 62, k: 6 }, pantone: "2313", pantoneTextile: "15-1425 TCX" },
      { code: "019", name: "Vegas Gold", hex: "#F4D1A1", cmyk: { c: 0, m: 13, y: 35, k: 0 }, pantone: "7507", pantoneTextile: "12-0822 TCX" },
      { code: "475", name: "Cornsilk", hex: "#F0EC74", cmyk: { c: 0, m: 0, y: 55, k: 0 }, pantone: "393", pantoneTextile: "12-0740 TCX" },
      { code: "003", name: "Yellow Haze", hex: "#F5E1A4", cmyk: { c: 0, m: 4, y: 27, k: 0 }, pantone: "7401", pantoneTextile: "12-0720 TCX" },
      { code: "custom3", name: "Light Yellow", hex: "#F3F590", cmyk: { c: 5, m: 0, y: 45, k: 0 }, pantone: "Custom" },
    ]
  },
  {
    name: "Purple Colors",
    colors: [
      { code: "081", name: "Purple", hex: "#464E7E", cmyk: { c: 86, m: 65, y: 21, k: 26 }, pantone: "2112", pantoneTextile: "19-3936 TCX" },
      { code: "087", name: "Violet", hex: "#8094DD", cmyk: { c: 55, m: 37, y: 0, k: 0 }, pantone: "7452", pantoneTextile: "16-3929 TCX" },
      { code: "191", name: "Orchid", hex: "#c5b4e3", cmyk: { c: 24, m: 29, y: 0, k: 0 }, pantone: "2635", pantoneTextile: "14-3612 TCX" },
      { code: "284", name: "Lilac", hex: "#563D82", cmyk: { c: 0, m: 0, y: 0, k: 0 }, pantone: "7679", pantoneTextile: "19-3642 TCX" },
    ]
  },
  {
    name: "Pink Colors",
    colors: [
      { code: "020", name: "Light Pink", hex: "#E4C6D4", cmyk: { c: 0, m: 22, y: 2, k: 1 }, pantone: "684", pantoneTextile: "13-3405 TCX" },
      { code: "071", name: "Azalea", hex: "#DD74A1", cmyk: { c: 0, m: 67, y: 5, k: 0 }, pantone: "2045", pantoneTextile: "16-2120 TCX" },
      { code: "010", name: "Heliconia", hex: "#DB3E79", cmyk: { c: 0, m: 92, y: 18, k: 0 }, pantone: "213", pantoneTextile: "17-2036 TCX" },
      { code: "247", name: "Antique Heliconia", hex: "#AA0061", cmyk: { c: 0, m: 100, y: 10, k: 21 }, pantone: "227", pantoneTextile: "18-2336 TCX" },
      { code: "263", name: "Safety Pink", hex: "#E16F8F", cmyk: { c: 0, m: 75, y: 21, k: 0 }, pantone: "1915", pantoneTextile: "16-2126 TCX" },
      { code: "256", name: "Coral Silk", hex: "#FB637E", cmyk: { c: 0, m: 66, y: 29, k: 0 }, pantone: "1777", pantoneTextile: "17-1736 TCX" },
    ]
  },
  {
    name: "Heather Colors",
    colors: [
      { code: "169", name: "Heather Cardinal", hex: "#9B2743", cmyk: { c: 8, m: 100, y: 55, k: 37 }, pantone: "194", pantoneTextile: "19-1850 TCX" },
      { code: "173", name: "Heather Indigo", hex: "#4D6995", cmyk: { c: 79, m: 49, y: 17, k: 15 }, pantone: "2139", pantoneTextile: "17-4028 TCX" },
      { code: "215", name: "Heather Irish Green", hex: "#5CAA7F", cmyk: { c: 73, m: 0, y: 62, k: 0 }, pantone: "2249", pantoneTextile: "16-5930 TCX" },
      { code: "170", name: "Heather Navy", hex: "#333F48", cmyk: { c: 65, m: 43, y: 26, k: 78 }, pantone: "432", pantoneTextile: "19-4110 TCX" },
      { code: "232", name: "Heather Purple", hex: "#614B79", cmyk: { c: 70, m: 77, y: 7, k: 23 }, pantone: "668", pantoneTextile: "18-3615 TCX" },
      { code: "234", name: "Heather Red", hex: "#BF0D3E", cmyk: { c: 2, m: 99, y: 62, k: 11 }, pantone: "193", pantoneTextile: "18-1761 TCX" },
      { code: "218", name: "Heather Royal", hex: "#307FE2", cmyk: { c: 70, m: 47, y: 0, k: 0 }, pantone: "2727", pantoneTextile: "17-4037 TCX" },
    ]
  },
  {
    name: "Sport Colors",
    colors: [
      { code: "095", name: "Sport Grey", hex: "#97999B", cmyk: { c: 20, m: 14, y: 12, k: 40 }, pantone: "Cool Grey 7", pantoneTextile: "16-3801 TCX" },
      { code: "771", name: "Sport Dark Green", hex: "#205C40", cmyk: { c: 84, m: 22, y: 77, k: 60 }, pantone: "554", pantoneTextile: "19-6026 TCX" },
      { code: "777", name: "Sport Dark Navy", hex: "#00263A", cmyk: { c: 100, m: 65, y: 22, k: 80 }, pantone: "289", pantoneTextile: "19-3933 TCX" },
      { code: "762", name: "Sport Orange", hex: "#FC4C02", cmyk: { c: 0, m: 70, y: 99, k: 1 }, pantone: "1655", pantoneTextile: "17-1464 TCX" },
      { code: "765", name: "Sport Royal", hex: "#002D72", cmyk: { c: 100, m: 80, y: 6, k: 32 }, pantone: "288", pantoneTextile: "19-3952 TCX" },
      { code: "774", name: "Sport Scarlet Red", hex: "#BA0C2F", cmyk: { c: 0, m: 100, y: 70, k: 12 }, pantone: "200", pantoneTextile: "19-1557 TCX" },
    ]
  }
];

// Function to convert hexadecimal to approximate HEX for missing hex values
function convertCMYKToHex(c: number, m: number, y: number, k: number): string {
  // Convert CMYK to RGB
  const r = Math.round(255 * (1 - c / 100) * (1 - k / 100));
  const g = Math.round(255 * (1 - m / 100) * (1 - k / 100));
  const b = Math.round(255 * (1 - y / 100) * (1 - k / 100));
  
  // Convert RGB to HEX
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export const fruitOfTheLoomColors: ManufacturerColorGroup[] = [
  {
    name: "Basic Colors",
    colors: [
      { code: "030", name: "White", hex: "#FFFFFF", cmyk: { c: 0, m: 0, y: 0, k: 0 }, pantone: "1-0601-TCX" },
      { code: "036", name: "Black", hex: "#000000", cmyk: { c: 0, m: 0, y: 0, k: 100 }, pantone: "9-4007-TCX" },
      { code: "093", name: "Natural", hex: "#F5F0E8", cmyk: { c: 4, m: 9, y: 25, k: 0 }, pantone: "1-0606-TCX" },
      { code: "042", name: "Charcoal", hex: convertCMYKToHex(10, 0, 10, 85), cmyk: { c: 10, m: 0, y: 10, k: 85 }, pantone: "9-0508-TCX" },
      { code: "032", name: "Navy", hex: convertCMYKToHex(100, 65, 0, 60), cmyk: { c: 100, m: 65, y: 0, k: 60 }, pantone: "9-3925-TCX" },
      { code: "ZN", name: "Zinc", hex: convertCMYKToHex(33, 21, 25, 7), cmyk: { c: 33, m: 21, y: 25, k: 7 }, pantone: "4-4103-TCX" },
    ]
  },
  {
    name: "Red Colors", 
    colors: [
      { code: "RD", name: "Red", hex: convertCMYKToHex(0, 100, 82, 0), cmyk: { c: 0, m: 100, y: 82, k: 0 }, pantone: "8-1763-TCX" },
      { code: "BR", name: "Brick Red", hex: convertCMYKToHex(6, 100, 78, 27), cmyk: { c: 6, m: 100, y: 78, k: 27 }, pantone: "9-1862-TCX" },
      { code: "BU", name: "Burgundy", hex: convertCMYKToHex(28, 89, 29, 53), cmyk: { c: 28, m: 89, y: 29, k: 53 }, pantone: "9-2024-TCX" },
      { code: "CR", name: "Cranberry", hex: convertCMYKToHex(0, 0, 0, 0), cmyk: { c: 0, m: 0, y: 0, k: 0 } }, // Missing CMYK data
      { code: "FL", name: "Flame", hex: convertCMYKToHex(0, 87, 85, 0), cmyk: { c: 0, m: 87, y: 85, k: 0 }, pantone: "7-1558 TCX" },
      { code: "HB", name: "Heather Burgundy", hex: convertCMYKToHex(24, 89, 5, 37), cmyk: { c: 24, m: 89, y: 5, k: 37 }, pantone: "9-2431 TCX" },
      { code: "HR", name: "Heather Red", hex: convertCMYKToHex(18, 100, 45, 67), cmyk: { c: 18, m: 100, y: 45, k: 67 }, pantone: "8-1633 TCX" },
    ]
  },
  {
    name: "Blue Colors",
    colors: [
      { code: "AB", name: "Azure Blue", hex: convertCMYKToHex(100, 12, 0, 2), cmyk: { c: 100, m: 12, y: 0, k: 2 }, pantone: "7-4440-TCX" },
      { code: "CB", name: "Cobalt Blue", hex: convertCMYKToHex(100, 95, 5, 39), cmyk: { c: 100, m: 95, y: 5, k: 39 }, pantone: "9-3953 TCX" },
      { code: "DN", name: "Deep Navy", hex: convertCMYKToHex(100, 70, 0, 80), cmyk: { c: 100, m: 70, y: 0, k: 80 }, pantone: "9-3920-TCX" },
      { code: "HN", name: "Heather Navy", hex: convertCMYKToHex(95, 72, 15, 67), cmyk: { c: 95, m: 72, y: 15, k: 67 }, pantone: "9-3933 TCX" },
      { code: "HRO", name: "Heather Royal", hex: convertCMYKToHex(65, 45, 0, 0), cmyk: { c: 65, m: 45, y: 0, k: 0 }, pantone: "9-4050 TCX" },
      { code: "MB", name: "Mineral Blue", hex: "#96a4c2", cmyk: { c: 47, m: 28, y: 11, k: 4 }, pantone: "17-4021-TCX" },
      { code: "MT", name: "Mountain Blue", hex: convertCMYKToHex(0, 0, 0, 0), cmyk: { c: 0, m: 0, y: 0, k: 0 } }, // Missing CMYK data
      { code: "RB", name: "Royal Blue", hex: convertCMYKToHex(91, 64, 0, 0), cmyk: { c: 91, m: 64, y: 0, k: 0 }, pantone: "9-4056-TCX" },
      { code: "SB", name: "Sky Blue", hex: convertCMYKToHex(43, 11, 0, 0), cmyk: { c: 43, m: 11, y: 0, k: 0 }, pantone: "4-4121-TCX" },
    ]
  },
  {
    name: "Green Colors",
    colors: [
      { code: "BG", name: "Bottle Green", hex: convertCMYKToHex(80, 36, 76, 58), cmyk: { c: 80, m: 36, y: 76, k: 58 }, pantone: "9-6311-TCX" },
      { code: "CG", name: "College Green", hex: convertCMYKToHex(0, 0, 0, 0), cmyk: { c: 0, m: 0, y: 0, k: 0 } }, // Missing CMYK data
      { code: "EM", name: "Emerald", hex: convertCMYKToHex(93, 7, 49, 28), cmyk: { c: 93, m: 7, y: 49, k: 28 }, pantone: "7-5029-TCX" },
      { code: "FG", name: "Forest Green", hex: convertCMYKToHex(86, 36, 73, 63), cmyk: { c: 86, m: 36, y: 73, k: 63 }, pantone: "9-4906-TCX" },
      { code: "HG", name: "Heather Green", hex: convertCMYKToHex(99, 0, 84, 0), cmyk: { c: 99, m: 0, y: 84, k: 0 }, pantone: "7-5937 TCX" },
      { code: "KG", name: "Kelly Green", hex: convertCMYKToHex(92, 1, 85, 0), cmyk: { c: 92, m: 1, y: 85, k: 0 }, pantone: "6-5938-TCX" },
      { code: "LI", name: "Lime", hex: convertCMYKToHex(57, 0, 100, 0), cmyk: { c: 57, m: 0, y: 100, k: 0 }, pantone: "5-0146-TCX" },
      { code: "NM", name: "Neo Mint", hex: convertCMYKToHex(38, 0, 41, 0), cmyk: { c: 38, m: 0, y: 41, k: 0 }, pantone: "3-0117 TCX" },
    ]
  },
  {
    name: "Yellow/Orange Colors",
    colors: [
      { code: "BY", name: "Bright Yellow", hex: convertCMYKToHex(7, 0, 83, 0), cmyk: { c: 7, m: 0, y: 83, k: 0 }, pantone: "3-0650-TCX" },
      { code: "OR", name: "Orange", hex: convertCMYKToHex(0, 72, 100, 0), cmyk: { c: 0, m: 72, y: 100, k: 0 }, pantone: "6-1364-TCX" },
      { code: "SF", name: "Sunflower", hex: convertCMYKToHex(0, 22, 100, 0), cmyk: { c: 0, m: 22, y: 100, k: 0 }, pantone: "3-0859-TCX" },
      { code: "YE", name: "Yellow", hex: convertCMYKToHex(0, 0, 100, 0), cmyk: { c: 0, m: 0, y: 100, k: 0 }, pantone: "3-0858-TCX" },
    ]
  },
  {
    name: "Purple/Pink Colors",
    colors: [
      { code: "FU", name: "Fuchsia", hex: convertCMYKToHex(0, 88, 24, 0), cmyk: { c: 0, m: 88, y: 24, k: 0 }, pantone: "7-2036-TCX" },
      { code: "HP", name: "Heather Purple", hex: convertCMYKToHex(80, 98, 5, 27), cmyk: { c: 80, m: 98, y: 5, k: 27 }, pantone: "9-3638 TCX" },
      { code: "LP", name: "Light Pink", hex: convertCMYKToHex(0, 34, 5, 0), cmyk: { c: 0, m: 34, y: 5, k: 0 }, pantone: "4-2808-TCX" },
      { code: "PR", name: "Powder Rose", hex: "#dcc6c4", cmyk: { c: 11, m: 26, y: 19, k: 0 }, pantone: "13-1504-TCX" },
      { code: "PU", name: "Purple", hex: convertCMYKToHex(90, 100, 4, 16), cmyk: { c: 90, m: 100, y: 4, k: 16 }, pantone: "9-3731-TCX" },
      { code: "SL", name: "Soft Lavender", hex: "#c5c1e0", cmyk: { c: 25, m: 24, y: 0, k: 0 }, pantone: "14-3812-TCX" },
    ]
  },
  {
    name: "Grey/Neutral Colors",
    colors: [
      { code: "AH", name: "Athletic Heather", hex: convertCMYKToHex(35, 29, 28, 0), cmyk: { c: 35, m: 29, y: 28, k: 0 }, pantone: "15-4703 TCX" },
      { code: "CO", name: "Classic Olive", hex: convertCMYKToHex(51, 37, 60, 33), cmyk: { c: 51, m: 37, y: 60, k: 33 }, pantone: "8-0521-TCX" },
      { code: "CH", name: "Chocolate", hex: convertCMYKToHex(52, 62, 68, 58), cmyk: { c: 52, m: 62, y: 68, k: 58 }, pantone: "9-0912-TCX" },
      { code: "DH", name: "Dark Heather Grey", hex: convertCMYKToHex(65, 43, 26, 78), cmyk: { c: 65, m: 43, y: 26, k: 78 }, pantone: "9-4110 TCX" },
      { code: "DP", name: "Dark Plum", hex: convertCMYKToHex(65, 74, 51, 47), cmyk: { c: 65, m: 74, y: 51, k: 47 }, pantone: "19-3316 TCX" },
      { code: "DS", name: "Desert Sand", hex: convertCMYKToHex(0, 0, 0, 0), cmyk: { c: 0, m: 0, y: 0, k: 0 } }, // Missing CMYK data
      { code: "HG", name: "Heather Grey", hex: convertCMYKToHex(23, 15, 14, 2), cmyk: { c: 23, m: 15, y: 14, k: 2 }, pantone: "4-4102-TCX" },
      { code: "KH", name: "Khaki", hex: convertCMYKToHex(28, 31, 45, 14), cmyk: { c: 28, m: 31, y: 45, k: 14 }, pantone: "7-1009-TCX" },
      { code: "LG", name: "Light Graphite", hex: convertCMYKToHex(62, 53, 53, 51), cmyk: { c: 62, m: 53, y: 53, k: 51 }, pantone: "9-3906-TCX" },
      { code: "OT", name: "Ocean Teal", hex: convertCMYKToHex(75, 41, 49, 14), cmyk: { c: 75, m: 41, y: 49, k: 14 }, pantone: "18-4936 TCX" },
      { code: "SA", name: "Sage", hex: "#85a4a1", cmyk: { c: 56, m: 17, y: 35, k: 8 }, pantone: "16-5304-TCX" },
      { code: "TR", name: "Truffle", hex: convertCMYKToHex(54, 57, 70, 41), cmyk: { c: 54, m: 57, y: 70, k: 41 }, pantone: "19-0916 TCX" },
    ]
  }
];

export const manufacturerColors = {
  "Gildan": gildanColors,
  "Fruit of the Loom": fruitOfTheLoomColors
};