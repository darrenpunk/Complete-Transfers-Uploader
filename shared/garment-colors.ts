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

export const manufacturerColors = {
  "Gildan": gildanColors
};