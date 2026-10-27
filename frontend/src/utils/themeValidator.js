// frontend/src/utils/themeValidator.js
// Strict color validation and contrast computations to prevent CSS injection.

/**
 * Validates hex colors strictly against /^#[0-9a-fA-F]{6}$/ to prevent CSS injection.
 */
export function isValidHexColor(color) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim());
}

/**
 * Converts 6-digit hex string (#RRGGBB) to RGB object
 */
export function hexToRgb(hex) {
  if (!isValidHexColor(hex)) return null;
  const num = parseInt(hex.trim().slice(1), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Calculates WCAG 2.2 relative luminance
 */
export function getRelativeLuminance(rgb) {
  if (!rgb) return 0;
  const [rs, gs, bs] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Computes WCAG 2.2 contrast ratio between two hex colors (e.g. 4.5:1)
 */
export function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 21; // Safe fallback
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
