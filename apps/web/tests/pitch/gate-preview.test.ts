import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isMetadataImagePath, isPreviewFetcher, pitchGate } from '@/lib/platform/gate';

const CODE = 'tour-2026';
const BASE = 'http://localhost:3116';
const WHATSAPP = 'WhatsApp/2.23.20.0 A';
const BROWSER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1';

const req = (path: string, userAgent?: string) =>
  new NextRequest(new URL(path, BASE), userAgent ? { headers: { 'user-agent': userAgent } } : undefined);

describe('pitch gate: shared links keep their preview', () => {
  it('serves OG images under /platform without the code', async () => {
    expect(await pitchGate(req('/platform/opengraph-image?e6494095978fa47b'), CODE)).toBeNull();
    expect(await pitchGate(req('/platform/tour/opengraph-image'), CODE)).toBeNull();
    expect(await pitchGate(req('/platform/tour/twitter-image'), CODE)).toBeNull();
  });

  it('does not open pages that merely look like image routes', async () => {
    expect(isMetadataImagePath('/platform/opengraph-image')).toBe(true);
    expect(isMetadataImagePath('/platform/opengraph-images/')).toBe(false);
    expect(isMetadataImagePath('/platform/tour/')).toBe(false);
    expect((await pitchGate(req('/platform/tour/'), CODE))?.status).toBe(401);
  });

  it('lets a preview fetcher with the right code read the page itself', async () => {
    expect(isPreviewFetcher(WHATSAPP)).toBe(true);
    expect(isPreviewFetcher('facebookexternalhit/1.1')).toBe(true);
    expect(await pitchGate(req(`/platform/?code=${CODE}`, WHATSAPP), CODE)).toBeNull();
  });

  it('still refuses a preview fetcher with a wrong code or none', async () => {
    expect((await pitchGate(req('/platform/?code=nope', WHATSAPP), CODE))?.status).toBe(401);
    expect((await pitchGate(req('/platform/', WHATSAPP), CODE))?.status).toBe(401);
  });

  it('keeps the cookie redirect for people', async () => {
    expect(isPreviewFetcher(BROWSER)).toBe(false);
    const res = await pitchGate(req(`/platform/?code=${CODE}`, BROWSER), CODE);
    expect(res?.status).toBe(303);
  });
});
