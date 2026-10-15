/**
 * WCAG 2.x contrast helpers (sRGB relative luminance). Pure and client-safe.
 * AA: 4.5:1 for body text, 3:1 for large text (>= 24px, or >= 18.66px bold)
 * and for UI components / graphics.
 */

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Invalid hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** True when `fg` on `bg` meets WCAG AA for the given text size. */
export function meetsAA(fg: string, bg: string, size: 'normal' | 'large' | 'ui' = 'normal'): boolean {
  return contrastRatio(fg, bg) >= (size === 'normal' ? 4.5 : 3);
}
