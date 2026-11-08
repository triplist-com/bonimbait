/**
 * Client IP for rate limits and lead hashing (lib/leads/spam.ts): on Render the
 * edge's own headers win over a client-supplied X-Forwarded-For.
 */
import { describe, expect, it } from 'vitest';
import { clientIpFromHeaders } from '@/lib/leads/spam';

const h = (headers: Record<string, string>) => new Headers(headers);

describe('clientIpFromHeaders', () => {
  it('uses the first X-Forwarded-For entry off Render', () => {
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), {})).toBe('203.0.113.7');
    expect(clientIpFromHeaders(h({ 'x-real-ip': '203.0.113.8' }), {})).toBe('203.0.113.8');
    expect(clientIpFromHeaders(h({ 'cf-connecting-ip': '198.51.100.1', 'x-forwarded-for': '203.0.113.7' }), {})).toBe('203.0.113.7');
  });

  it("prefers the edge's headers on Render over a spoofable X-Forwarded-For", () => {
    const render = { RENDER: 'true' };
    expect(clientIpFromHeaders(h({ 'true-client-ip': '198.51.100.2', 'x-forwarded-for': '1.2.3.4, 198.51.100.2' }), render)).toBe('198.51.100.2');
    expect(clientIpFromHeaders(h({ 'cf-connecting-ip': '198.51.100.3', 'x-forwarded-for': '1.2.3.4' }), render)).toBe('198.51.100.3');
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '198.51.100.4' }), render)).toBe('198.51.100.4');
  });
});
