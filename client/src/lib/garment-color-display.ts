export function displayGarmentColor(color?: string | null, fallback = '#EAEAEA'): string {
  if (!color) return fallback;
  const c = color.toLowerCase().trim();
  if (c === '#ffffff' || c === '#fff' || c === 'white' || c === 'rgb(255,255,255)' || c === 'rgb(255, 255, 255)') {
    return '#E6E6E6';
  }
  return color;
}
