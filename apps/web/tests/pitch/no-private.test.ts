/**
 * The repo is public. The pitch site may show the owner's public facts and
 * measured platform facts, never private sales material (pricing, the offer,
 * revenue estimates, negotiation notes). Those live in the gitignored sales/
 * folder, and so do the markers this guard looks for: they are themselves
 * private, so they're read from sales/private-markers.json at test time.
 * Without that file (CI, other checkouts) the scan is skipped.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB = fileURLToPath(new URL('../../', import.meta.url));
const REPO = path.resolve(WEB, '..', '..');

const ROOTS = [
  path.join(WEB, 'lib', 'pitch'),
  path.join(WEB, 'components', 'pitch'),
  path.join(WEB, 'app', 'platform', 'page.tsx'),
  path.join(WEB, 'app', 'platform', 'layout.tsx'),
  path.join(WEB, 'app', 'platform', 'opengraph-image.tsx'),
  path.join(WEB, 'app', 'platform', 'tour'),
  path.join(WEB, 'data', 'pitch'),
  path.join(REPO, 'scripts', 'pitch'),
];

/** Looks in the main checkout too, since worktrees don't carry gitignored files. */
function markersFile(): string | null {
  const candidates = [path.join(REPO, 'sales', 'private-markers.json')];
  const mainCheckout = REPO.split(`${path.sep}.claude${path.sep}worktrees${path.sep}`)[0];
  if (mainCheckout !== REPO) candidates.push(path.join(mainCheckout, 'sales', 'private-markers.json'));
  return candidates.find((f) => existsSync(f)) ?? null;
}

function loadMarkers(): Array<[string, RegExp]> {
  const file = markersFile();
  if (!file) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { markers: Array<[string, string, string]> };
  return parsed.markers.map(([label, source, flags]) => [label, new RegExp(source, flags)]);
}

function files(root: string): string[] {
  const stat = statSync(root, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [root];
  return readdirSync(root).flatMap((name) => files(path.join(root, name)));
}

const MARKERS = loadMarkers();

describe.skipIf(MARKERS.length === 0)('public pitch files carry no private sales material', () => {
  const all = ROOTS.flatMap(files).filter((f) => /\.(tsx?|json|py|mjs|md)$/.test(f));

  it('finds the pitch files to scan', () => {
    expect(all.length).toBeGreaterThan(10);
  });

  for (const [label, pattern] of MARKERS) {
    it(`has no ${label}`, () => {
      const hits = all.filter((f) => pattern.test(readFileSync(f, 'utf8'))).map((f) => path.relative(REPO, f));
      expect(hits).toEqual([]);
    });
  }
});
