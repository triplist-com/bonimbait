import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * DESIGN_SYSTEM.md §3: "Never hard-code hex or Tailwind palette colours
 * (blue-*, amber-*, emerald-*). If a colour is missing, add a token first."
 * The semantic scales are success / warning / danger / info; the brand is
 * primary / ink / sand. This guard keeps the default Tailwind palette (which
 * is off-brand and, for some steps, below AA) out of the markup.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIRS = ['app', 'components', 'lib'];

const PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|shadow|placeholder|accent|caret)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|zinc|stone)-\d{2,3}\b/;
const ARBITRARY_HEX = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|shadow)-\[#[0-9a-fA-F]{3,8}\]/;

function sources(dir: string, out: string[] = []): string[] {
  readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) sources(path, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(path);
    }
  });
  return out;
}

describe('palette guard', () => {
  it('uses design tokens, not the default Tailwind palette or hex classes', () => {
    const offenders: string[] = [];
    DIRS.flatMap((dir) => sources(join(ROOT, dir))).forEach((file) => {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const hit = line.match(PALETTE) ?? line.match(ARBITRARY_HEX);
          if (hit) offenders.push(`${relative(ROOT, file)}:${i + 1} ${hit[0]}`);
        });
    });
    expect(offenders, `Use success/warning/danger/info, primary, ink or sand tokens:\n${offenders.join('\n')}`).toEqual([]);
  });
});
