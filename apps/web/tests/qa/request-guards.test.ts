/**
 * QA security fixes, unit level:
 * - leads.source_url only ever becomes an http(s) or same-site link (it was a
 *   stored javascript: link on /admin/leads/<id>/);
 * - safeNextPath() refuses the control-character and backslash tricks that
 *   browsers turn into "//evil.example";
 * - the AI routes refuse cross-site browser requests and non-JSON bodies, and
 *   key rate limits by IPv6 /64.
 */
import { describe, expect, it } from 'vitest';
import { cleanSourceUrl, sourceLink } from '@/lib/leads/source';
import { safeNextPath } from '@/lib/auth/roles';
import { ipv6Prefix64, isCrossSiteRequest, isJsonRequest, rateLimitKey } from '@/lib/guard/request';

const h = (init: Record<string, string>) => new Headers(init);

describe('cleanSourceUrl / sourceLink', () => {
  it('keeps http(s) URLs and site paths', () => {
    expect(cleanSourceUrl('https://bonimbait.com/business/א/')).toBe('https://bonimbait.com/business/%D7%90/');
    expect(cleanSourceUrl('http://localhost:3121/calculator/')).toBe('http://localhost:3121/calculator/');
    expect(cleanSourceUrl('/recommended/?specialty=x')).toBe('/recommended/?specialty=x');
  });

  it('drops script URLs, protocol-relative hosts and control characters', () => {
    for (const bad of [
      "javascript:fetch('/admin/leads/export/')",
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      '//evil.example/',
      '/\\evil.example',
      '/\t/evil.example',
      'https://evil.example/\u0000',
      'ftp://example.com/',
      '',
    ]) {
      expect(cleanSourceUrl(bad), bad).toBeNull();
    }
  });

  it('never throws on a malformed escape, and shows it as stored', () => {
    expect(sourceLink('/%E0%A4%A/')).toEqual({ href: '/%E0%A4%A/', label: '/%E0%A4%A/' });
    expect(sourceLink("javascript:alert('x')")).toBeNull();
    expect(sourceLink('/%D7%90/')?.label).toBe('/א/');
  });
});

describe('safeNextPath', () => {
  it('keeps same-site paths as they are', () => {
    for (const ok of ['/my-home/', '/ask/?q=%D7%A9%D7%9C%D7%93', '/הבית-שלי/', '/partner-portal/?b=1#tiers', '/']) {
      expect(safeNextPath(ok), ok).toBe(ok);
    }
  });

  it('falls back for anything that could leave the site', () => {
    for (const bad of [
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r//evil.example',
      '/%09/evil.example'.replace('%09', '\t'),
      'https://evil.example/',
      'javascript:alert(1)',
      'evil.example',
      '',
      null,
      undefined,
    ]) {
      expect(safeNextPath(bad as string | null | undefined, '/fallback/'), String(bad)).toBe('/fallback/');
    }
  });
});

describe('isCrossSiteRequest / isJsonRequest', () => {
  it('trusts Sec-Fetch-Site when the browser sends it', () => {
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'cross-site', host: 'bonimbait.com' }))).toBe(true);
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'same-origin', host: 'bonimbait.com' }))).toBe(false);
    expect(isCrossSiteRequest(h({ 'sec-fetch-site': 'same-site', host: 'bonimbait.com' }))).toBe(false);
  });

  it('compares Origin with the host otherwise, and lets non-browser clients through', () => {
    expect(isCrossSiteRequest(h({ origin: 'https://evil.example', host: 'bonimbait.com' }))).toBe(true);
    expect(isCrossSiteRequest(h({ origin: 'https://bonimbait.com', host: 'bonimbait.com' }))).toBe(false);
    expect(isCrossSiteRequest(h({ origin: 'https://bonimbait.com', 'x-forwarded-host': 'bonimbait.com', host: 'internal:3000' }))).toBe(false);
    expect(isCrossSiteRequest(h({ origin: 'null', host: 'bonimbait.com' }))).toBe(true);
    expect(isCrossSiteRequest(h({ host: 'bonimbait.com' }))).toBe(false);
  });

  it('accepts only application/json bodies', () => {
    expect(isJsonRequest(h({ 'content-type': 'application/json' }))).toBe(true);
    expect(isJsonRequest(h({ 'content-type': 'Application/JSON; charset=utf-8' }))).toBe(true);
    expect(isJsonRequest(h({ 'content-type': 'text/plain;charset=UTF-8' }))).toBe(false);
    expect(isJsonRequest(h({}))).toBe(false);
  });
});

describe('rate-limit keys', () => {
  it('collapses IPv6 to its /64, and leaves IPv4 alone', () => {
    expect(ipv6Prefix64('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(ipv6Prefix64('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(ipv6Prefix64('2001:0db8:0001:0002::ffff')).toBe('2001:db8:1:2::/64');
    expect(ipv6Prefix64('[2001:db8::1]')).toBe('2001:db8:0:0::/64');
    expect(ipv6Prefix64('203.0.113.7')).toBeNull();
    expect(ipv6Prefix64('::ffff:203.0.113.7')).toBeNull();
    expect(ipv6Prefix64('not:an:ip:::')).toBeNull();
  });

  it('gives every address of one /64 the same key', () => {
    const a = rateLimitKey(h({ 'x-forwarded-for': '2001:db8:1:2::a' }));
    const b = rateLimitKey(h({ 'x-forwarded-for': '2001:db8:1:2:ffff::b, 10.0.0.1' }));
    const c = rateLimitKey(h({ 'x-forwarded-for': '2001:db8:1:3::a' }));
    expect(a).toBeTruthy();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(rateLimitKey(h({}))).toBeNull();
  });
});
