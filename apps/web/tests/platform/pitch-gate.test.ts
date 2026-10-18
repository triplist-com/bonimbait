import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mw = vi.hoisted(() => ({ redirect: null as null | { to: string; code: 301 | 302 } }));
vi.mock('@/lib/redirects/lookup', () => ({ findRedirect: vi.fn(async () => mw.redirect) }));
vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(async (request: NextRequest) => ({ response: NextResponse.next({ request }), user: null })),
}));

import { PITCH_COOKIE, pitchGate } from '@/lib/platform/gate';
import { isDemoRequest, isPlatformPath } from '@/lib/platform/paths';
import { middleware } from '@/middleware';

const CODE = 'tour-2026';
const BASE = 'http://localhost:3103';

const req = (path: string, cookie?: string) => {
  const r = new NextRequest(new URL(path, BASE));
  if (cookie) r.cookies.set(PITCH_COOKIE, cookie);
  return r;
};

/** Unlock with ?code= and return the cookie value the gate set. */
async function unlock(path = `/platform/demo/?${new URLSearchParams({ code: CODE })}`) {
  const res = (await pitchGate(req(path), CODE))!;
  return { res, token: res.cookies.get(PITCH_COOKIE)?.value };
}

describe('pitchGate', () => {
  it('is open when PITCH_ACCESS_CODE is unset or blank', async () => {
    expect(await pitchGate(req('/platform/demo/'), undefined)).toBeNull();
    expect(await pitchGate(req('/platform/demo/'), '  ')).toBeNull();
  });

  it('only guards /platform', async () => {
    expect(await pitchGate(req('/'), CODE)).toBeNull();
    expect(await pitchGate(req('/platformer/'), CODE)).toBeNull();
    expect(await pitchGate(req('/blog/?code=x'), CODE)).toBeNull();
  });

  it('asks for the code with a 401 noindex page', async () => {
    const res = (await pitchGate(req('/platform/demo/foundation/'), CODE))!;
    expect(res.status).toBe(401);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('name="code"');
    expect(html).toContain('action="/platform/demo/foundation/"');
    expect(html).not.toContain(CODE);
  });

  it('a correct ?code= sets an httpOnly cookie once and strips the code from the URL', async () => {
    const { res, token } = await unlock(`/platform/demo/foundation/?code=${CODE}&tab=leads`);
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/platform/demo/foundation/');
    expect(location.searchParams.get('code')).toBeNull();
    expect(location.searchParams.get('tab')).toBe('leads');
    const cookie = res.cookies.get(PITCH_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.path).toBe('/platform');
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.maxAge).toBe(60 * 60 * 24 * 30);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain(CODE); // a hash, never the code itself
  });

  it('lets the cookie through on later visits', async () => {
    const { token } = await unlock();
    expect(await pitchGate(req('/platform/', token), CODE)).toBeNull();
    expect(await pitchGate(req('/platform/demo/foundation/', token), CODE)).toBeNull();
  });

  it('rejects a wrong code, and a cookie from an older code', async () => {
    const wrong = (await pitchGate(req('/platform/?code=nope'), CODE))!;
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain('הקוד שגוי');
    expect(wrong.cookies.get(PITCH_COOKIE)).toBeUndefined();

    const { token } = await unlock();
    const rotated = (await pitchGate(req('/platform/', token), 'new-code-2027'))!;
    expect(rotated.status).toBe(401);
    expect((await pitchGate(req('/platform/', 'forged-value'), CODE))!.status).toBe(401);
  });

  it('with a valid cookie, a stray ?code= is just stripped', async () => {
    const { token } = await unlock();
    const res = (await pitchGate(req('/platform/demo/?code=whatever', token), CODE))!;
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).search).toBe('');
    expect(res.cookies.get(PITCH_COOKIE)).toBeUndefined();
  });
});

describe('middleware with the gate', () => {
  beforeEach(() => {
    process.env.PITCH_ACCESS_CODE = CODE;
    mw.redirect = null;
  });
  afterEach(() => {
    delete process.env.PITCH_ACCESS_CODE;
  });

  it('still 301s to the trailing slash first, keeping ?code=', async () => {
    const res = await middleware(req(`/platform?code=${CODE}`));
    expect(res.status).toBe(301);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/platform/');
    expect(loc.searchParams.get('code')).toBe(CODE);
  });

  it('gates /platform/ and passes everything else', async () => {
    expect((await middleware(req('/platform/demo/'))).status).toBe(401);
    const unlocked = await middleware(req(`/platform/demo/?code=${CODE}`));
    expect(unlocked.status).toBe(303);
    const home = await middleware(req('/'));
    expect(home.status).toBe(200);
    expect(home.headers.get('x-middleware-next')).toBe('1');
  });

  it('keeps legacy redirects ahead of everything', async () => {
    mw.redirect = { to: '/new-path/', code: 301 };
    const res = await middleware(req('/old-path/'));
    expect(res.status).toBe(301);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/new-path/');
  });

  it('leaves /api alone (no slash redirect, no gate)', async () => {
    const res = await middleware(req('/api/track'));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('is fully open without PITCH_ACCESS_CODE', async () => {
    delete process.env.PITCH_ACCESS_CODE;
    expect((await middleware(req('/platform/demo/'))).headers.get('x-middleware-next')).toBe('1');
  });
});

describe('platform paths', () => {
  it('recognises /platform and demo referers', () => {
    expect(isPlatformPath('/platform')).toBe(true);
    expect(isPlatformPath('/platform/design-system/')).toBe(true);
    expect(isPlatformPath('/platforms/')).toBe(false);
    expect(isPlatformPath(null)).toBe(false);
    const headers = (referer?: string) => ({ headers: new Headers(referer ? { referer } : {}) });
    expect(isDemoRequest(headers('https://bonimbait.com/platform/demo/advisor/'))).toBe(true);
    expect(isDemoRequest(headers('https://bonimbait.com/search/'))).toBe(false);
    expect(isDemoRequest(headers())).toBe(false);
    expect(isDemoRequest(headers('not a url'))).toBe(false);
  });
});
