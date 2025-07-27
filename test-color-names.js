// Test the getColorName function
const manufacturerColors = {
  "gildan": [
    {
      "name": "Basic Colors",
      "colors": [
        { "name": "White", "code": "G000", "hex": "#FFFFFF", "cmyk": { "c": 0, "m": 0, "y": 0, "k": 0 }, "inkType": "Process" },
        { "name": "Black", "code": "G200", "hex": "#171816", "cmyk": { "c": 75, "m": 68, "y": 67, "k": 74 }, "inkType": "Process" },
        { "name": "Kelly Green", "code": "G020", "hex": "#3C8A35", "cmyk": { "c": 77, "m": 10, "y": 95, "k": 5 }, "inkType": "Spot" }
      ]
    }
  ]
};

// Copy of the getColorName function
function getColorName(hex) {
  // Quick colors first
  const quickColors = [
    { name: "White", hex: "#FFFFFF" },
    { name: "Black", hex: "#171816" },
    { name: "Kelly Green", hex: "#3C8A35" }
  ];
  
  const quickColor = quickColors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
  if (quickColor) {
    return quickColor.name;
  }

  // Check manufacturer colors
  for (const [manufacturerName, colorGroups] of Object.entries(manufacturerColors)) {
    for (const group of colorGroups) {
      const manufacturerColor = group.colors.find(color => color.hex.toLowerCase() === hex.toLowerCase());
      if (manufacturerColor) {
        return `${manufacturerColor.name} (${manufacturerColor.code})`;
      }
    }
  }

  // Convert hex to RGB for color analysis
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    
    // Determine the dominant color family
    if (r > g && r > b) {
      if (g > 100 && b < 50) return "Orange";
      if (g < 100 && b < 100) return "Red";
      if (g > 150 && b > 150) return "Pink";
    } else if (g > r && g > b) {
      if (r < 100 && b < 100) return "Green";
      if (r > 150 && b < 100) return "Yellow";
    } else if (b > r && b > g) {
      if (r < 100 && g < 100) return "Blue";
      if (r > 150 && g > 150) return "Purple";
    } else if (r === g && g === b) {
      if (r < 50) return "Black";
      if (r > 200) return "White";
      return "Gray";
    }
  }
  
  return hex; // Fallback to hex value
}

// Test various colors
const testColors = [
  "#FFFFFF", // White
  "#171816", // Black
  "#3C8A35", // Kelly Green
  "#FF0000", // Red
  "#00FF00", // Green
  "#0000FF", // Blue
  "#FFFF00", // Yellow
  "#ABCDEF"  // Unknown color
];

console.log("Testing getColorName function:");
testColors.forEach(color => {
  const name = getColorName(color);
  console.log(`${color} -> "${name}"`);
});