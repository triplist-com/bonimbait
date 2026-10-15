import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COLOR_SCALES,
  brandHex,
  cssVariables,
  dataViz,
  hexToChannels,
  ink,
  primary,
  sand,
  semantic,
  success,
  warning,
  danger,
  info,
} from '@/lib/design/tokens';
import { contrastRatio, meetsAA, relativeLuminance } from '@/lib/design/contrast';
import tailwindConfig from '@/tailwind.config';

const globalsCss = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

function cssVarsFromGlobals(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(--bb-[a-z0-9-]+):\s*(\d{1,3} \d{1,3} \d{1,3});/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(globalsCss))) out.set(m[1], m[2]);
  return out;
}

describe('design tokens', () => {
  it('keeps app/globals.css in sync with lib/design/tokens.ts', () => {
    const css = cssVarsFromGlobals();
    const expected = cssVariables();
    for (const [name, hex] of Object.entries(expected)) {
      expect(css.get(name), `${name} missing or different in globals.css`).toBe(hexToChannels(hex));
    }
    // No stray colour variables that the TS mirror does not know about.
    for (const name of Array.from(css.keys())) expect(expected[name], `${name} is not in tokens.ts`).toBeDefined();
  });

  it('anchors the scales on the exact live brand hexes', () => {
    expect(primary[600]).toBe(brandHex.magenta);
    expect(primary[700]).toBe(brandHex.hover);
    expect(primary[800]).toBe(brandHex.pressed);
    expect(primary[500]).toBe(brandHex.accent);
    expect(ink[900]).toBe(brandHex.ink);
  });

  it('converts hex to space-separated channels', () => {
    expect(hexToChannels('#E61559')).toBe('230 21 89');
    expect(hexToChannels('ffffff')).toBe('255 255 255');
    expect(() => hexToChannels('#fff')).toThrow();
  });

  it('defines monotone light-to-dark scales', () => {
    for (const scale of Object.values(COLOR_SCALES)) {
      const lums = Object.values(scale).map(relativeLuminance);
      for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeLessThan(lums[i - 1]);
    }
  });

  it('meets WCAG AA for the documented text pairings', () => {
    expect(meetsAA('#FFFFFF', primary[600])).toBe(true); // primary button label
    expect(meetsAA(primary[700], semantic.paper)).toBe(true); // magenta link on paper
    expect(meetsAA(primary[600], '#FFFFFF')).toBe(true); // magenta text on white
    expect(meetsAA(ink[500], '#FFFFFF')).toBe(true); // muted text
    expect(meetsAA(ink[500], semantic.paper)).toBe(true);
    expect(meetsAA(ink[600], sand[100])).toBe(true);
    expect(meetsAA(sand[700], '#FFFFFF')).toBe(true);
    for (const s of [success, warning, danger, info]) expect(meetsAA(s[700], s[50])).toBe(true);
    // ink-400 is for icons and placeholders: UI contrast only.
    expect(meetsAA(ink[400], '#FFFFFF', 'ui')).toBe(true);
  });

  it('computes contrast like the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#FFFFFF', primary[600])).toBeCloseTo(4.55, 1);
  });

  it('ships a validated data-viz palette led by the brand magenta', () => {
    expect(dataViz.categorical).toHaveLength(8);
    expect(new Set(dataViz.categorical).size).toBe(8);
    expect(dataViz.categorical[0]).toBe(brandHex.magenta);
    // Slots 1, 2 and 4-8 are >= 3:1 on white; slot 3 (amber) needs labels.
    dataViz.categorical.forEach((hex, i) => {
      if (i === 2) expect(contrastRatio(hex, dataViz.surface)).toBeLessThan(3);
      else expect(contrastRatio(hex, dataViz.surface)).toBeGreaterThanOrEqual(3);
    });
    const seqLums = dataViz.sequential.map(relativeLuminance);
    for (let i = 1; i < seqLums.length; i++) expect(seqLums[i]).toBeLessThan(seqLums[i - 1]);
  });

  it('maps Tailwind colours to the CSS variables (legacy names reskin)', () => {
    const colors = (tailwindConfig.theme?.extend?.colors ?? {}) as Record<string, Record<string, string>>;
    expect(colors.primary.DEFAULT).toBe('rgb(var(--bb-primary-600) / <alpha-value>)');
    expect(colors.secondary.DEFAULT).toBe('rgb(var(--bb-ink-900) / <alpha-value>)');
    expect(colors.gray[500]).toBe('rgb(var(--bb-ink-500) / <alpha-value>)');
    expect(colors.ink[50]).toBe('rgb(var(--bb-ink-50) / <alpha-value>)');
    expect(colors.sand[900]).toBe('rgb(var(--bb-sand-900) / <alpha-value>)');
  });
});
