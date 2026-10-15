import { describe, expect, it } from 'vitest';
import { PITCH_WHATSAPP_MESSAGE, hasContact, pitchContact, whatsAppDigits } from '@/lib/pitch/contact';

describe('whatsAppDigits', () => {
  it('turns local and international formats into wa.me digits', () => {
    expect(whatsAppDigits('050-123-4567')).toBe('972501234567');
    expect(whatsAppDigits('+972 50 123 4567')).toBe('972501234567');
    expect(whatsAppDigits('00972501234567')).toBe('972501234567');
    expect(whatsAppDigits('972501234567')).toBe('972501234567');
  });

  it('rejects what is not a phone number', () => {
    expect(whatsAppDigits(undefined)).toBeNull();
    expect(whatsAppDigits('')).toBeNull();
    expect(whatsAppDigits('12345')).toBeNull();
    expect(whatsAppDigits('not a phone')).toBeNull();
  });
});

describe('pitchContact', () => {
  it('hides every channel when the env vars are unset', () => {
    const c = pitchContact({});
    expect(c).toEqual({ name: null, whatsapp: null, email: null });
    expect(hasContact(c)).toBe(false);
  });

  it('builds a wa.me link with the prefilled Hebrew message', () => {
    const c = pitchContact({ whatsapp: '050-123-4567' });
    expect(c.whatsapp?.href).toBe(`https://wa.me/972501234567?text=${encodeURIComponent(PITCH_WHATSAPP_MESSAGE)}`);
    expect(hasContact(c)).toBe(true);
  });

  it('builds a mailto link and ignores an invalid address', () => {
    expect(pitchContact({ email: 'someone@example.com' }).email?.href).toMatch(/^mailto:someone@example\.com\?subject=/);
    expect(pitchContact({ email: 'not-an-email' }).email).toBeNull();
    expect(pitchContact({ email: 'a@b.c"><script>' }).email).toBeNull();
  });

  it('uses the optional name for the button', () => {
    expect(pitchContact({ name: '  דנה ' }).name).toBe('דנה');
    expect(pitchContact({ name: ' ' }).name).toBeNull();
  });
});
