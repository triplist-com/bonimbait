import { describe, expect, it } from 'vitest';
import { hasAuthCookie } from '@/lib/auth/cookie';

describe('hasAuthCookie (header sign-in hint)', () => {
  it('detects whole and chunked Supabase auth cookies', () => {
    expect(hasAuthCookie('sb-127-auth-token=base64-abc')).toBe(true);
    expect(hasAuthCookie('theme=light; sb-nfbasjadvakbsusupcoy-auth-token.0=base64-abc; x=1')).toBe(true);
    expect(hasAuthCookie('a=1;sb-xyz-auth-token.1=part')).toBe(true);
  });

  it('is false for anonymous visitors and cleared cookies', () => {
    expect(hasAuthCookie('')).toBe(false);
    expect(hasAuthCookie(null)).toBe(false);
    expect(hasAuthCookie('theme=light; _ga=GA1.1')).toBe(false);
    expect(hasAuthCookie('sb-127-auth-token=')).toBe(false);
    expect(hasAuthCookie('sb-127-auth-token=deleted')).toBe(false);
    expect(hasAuthCookie('sb-127-auth-token-code-verifier=abc')).toBe(false);
  });
});
