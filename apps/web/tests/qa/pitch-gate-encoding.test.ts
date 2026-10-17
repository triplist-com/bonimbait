/**
 * The /platform pitch gate decides on the path the router will actually match:
 * Next's server also matches the percent-decoded path, so "/%70latform/" or
 * "/platform%2Fdemo%2Fpartner/" rendered the gated pages without the code.
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { gatePath, pitchGate } from '@/lib/platform/gate';

const CODE = 'qa-code';
const req = (path: string) => new NextRequest(new URL(path, 'http://localhost:3121'));

describe('pitch gate on encoded paths', () => {
  it('normalises the path the way the router reads it', () => {
    expect(gatePath('/%70latform/')).toBe('/platform/');
    expect(gatePath('/platform%2Fdemo%2Fpartner/')).toBe('/platform/demo/partner/');
    expect(gatePath('/PLATFORM/tour/')).toBe('/platform/tour/');
    expect(gatePath('/%E0%A4%A/')).toBe('/%e0%a4%a/');
  });

  it('gates the encoded spellings of /platform without the code', async () => {
    for (const path of ['/%70latform/', '/%70%6c%61%74%66%6f%72%6d/', '/platform%2Fdemo%2Fpartner/', '/%70latform/tour/']) {
      const res = await pitchGate(req(path), CODE);
      expect(res, path).not.toBeNull();
      expect(res!.status, path).toBe(401);
    }
  });

  it('still leaves the rest of the site and the OG images alone', async () => {
    expect(await pitchGate(req('/'), CODE)).toBeNull();
    expect(await pitchGate(req('/ask/'), CODE)).toBeNull();
    expect(await pitchGate(req('/%70latform/opengraph-image'), CODE)).toBeNull();
  });
});
