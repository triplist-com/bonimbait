import { describe, expect, it, vi } from 'vitest';
import {
  CaptionsUnavailableError,
  captionsMissMessage,
  fetchYoutubeCaptions,
  json3Url,
  pickHebrewTrack,
} from '@/lib/autopilot/captions';

const BASE = 'https://www.youtube.com/api/timedtext?v=EeMos4VM2oU&caps=asr&sparams=ip,ipbits,expire&signature=AB.CD&lang=iw';

function player(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

const JSON3 = { events: [{ tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: 'שלום' }] }] };

/** fetch stand-in: player API answers in order, timedtext answers with `captions`. */
function fakeFetch(players: unknown[], captions: Response | (() => Response) = () => player(JSON3)) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/youtubei/v1/player')) return player(players.shift() ?? {});
    return typeof captions === 'function' ? captions() : captions;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const ok = (tracks: unknown[]) => ({
  playabilityStatus: { status: 'OK' },
  videoDetails: { lengthSeconds: '308', title: 'חיפוי אבן' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks } },
});

describe('YouTube captions', () => {
  it('prefers manual Hebrew over auto captions and keeps the signed URL intact', async () => {
    const { fn, calls } = fakeFetch([
      ok([
        { languageCode: 'en', kind: 'asr', baseUrl: BASE.replace('lang=iw', 'lang=en') },
        { languageCode: 'iw', kind: 'asr', baseUrl: BASE },
        { languageCode: 'iw', baseUrl: `${BASE}&name=manual` },
      ]),
    ]);
    const res = await fetchYoutubeCaptions('EeMos4VM2oU', { fetchFn: fn });
    expect(res).toMatchObject({ source: 'captions_manual', durationS: 308, client: 'ANDROID', cues: [{ start: 0, end: 2, text: 'שלום' }] });
    expect(calls[1]).toBe(`${BASE}&name=manual&fmt=json3`);
  });

  it('falls back to auto-generated Hebrew captions', async () => {
    const { fn } = fakeFetch([ok([{ languageCode: 'iw', kind: 'asr', baseUrl: BASE }])]);
    expect((await fetchYoutubeCaptions('EeMos4VM2oU', { fetchFn: fn })).source).toBe('captions_auto');
  });

  it('reports a bot check as blocked after trying every client', async () => {
    const blocked = { playabilityStatus: { status: 'LOGIN_REQUIRED', reason: "Sign in to confirm you're not a bot" } };
    const { fn, calls } = fakeFetch([blocked, blocked]);
    const err = await fetchYoutubeCaptions('EeMos4VM2oU', { fetchFn: fn }).catch((e) => e);
    expect(err).toBeInstanceOf(CaptionsUnavailableError);
    expect(err.reason).toBe('blocked');
    expect(calls.filter((c) => c.includes('/player')).length).toBe(2);
    expect(captionsMissMessage(err)).toContain('YouTube Studio');
  });

  it('reports a video without Hebrew captions as no_captions', async () => {
    const { fn } = fakeFetch([ok([{ languageCode: 'en', kind: 'asr', baseUrl: BASE }])]);
    const err = await fetchYoutubeCaptions('EeMos4VM2oU', { fetchFn: fn }).catch((e) => e);
    expect(err.reason).toBe('no_captions');
  });

  it('treats an empty captions body (proof-of-origin wall) as a miss', async () => {
    const { fn } = fakeFetch([ok([{ languageCode: 'iw', kind: 'asr', baseUrl: BASE }]), ok([{ languageCode: 'iw', kind: 'asr', baseUrl: BASE }])], () => new Response('', { status: 200 }));
    const err = await fetchYoutubeCaptions('EeMos4VM2oU', { fetchFn: fn }).catch((e) => e);
    expect(err.reason).toBe('empty');
  });

  it('maps network failures to http_error', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const err = await fetchYoutubeCaptions('EeMos4VM2oU', { fetchFn: fn }).catch((e) => e);
    expect(err).toBeInstanceOf(CaptionsUnavailableError);
    expect(err.reason).toBe('http_error');
  });

  it('builds json3 URLs without re-encoding signed parameters', () => {
    expect(json3Url(`${BASE}&fmt=srv3`)).toBe(`${BASE}&fmt=json3`);
    expect(json3Url(BASE.replace('?v=', '?fmt=srv3&v='))).toBe(`${BASE}&fmt=json3`);
    expect(json3Url(BASE)).toContain('sparams=ip,ipbits,expire');
  });

  it('picks no track when none is Hebrew', () => {
    expect(pickHebrewTrack([{ languageCode: 'en', baseUrl: 'x' }])).toBeNull();
  });
});
