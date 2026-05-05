export function displayGarmentColor(color?: string | null, fallback = '#EAEAEA', isReflective = false): string {
  if (!color) return fallback;
  const c = color.toLowerCase().trim();
  if (c === '#ffffff' || c === '#fff' || c === 'white' || c === 'rgb(255,255,255)' || c === 'rgb(255, 255, 255)') {
    return '#E6E6E6';
  }
  // For reflective templates, the artwork is silver (~#929292) and the default
  // garment colour is also #929292, so the artwork blends into the canvas.
  // Lighten the displayed canvas tone so silver artwork stays visible. The
  // production garment colour stored on the project is unchanged.
  if (isReflective && (c === '#929292' || c === '#919191' || c === '#909090')) {
    return '#D5D5D5';
  }
  return color;
}
