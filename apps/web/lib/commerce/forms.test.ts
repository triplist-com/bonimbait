import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizePhone, validateContact } from './forms';

describe('form validation', () => {
  it('normalizes Israeli phones', () => {
    expect(normalizePhone('054-430-0202')).toBe('0544300202');
    expect(normalizePhone('+972 54 430 0202')).toBe('0544300202');
    expect(normalizePhone('03-9440467')).toBe('039440467');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });

  it('validates email', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
  });

  it('collects contact errors', () => {
    const form = new FormData();
    form.set('full_name', 'א');
    form.set('phone', '1');
    form.set('email', 'x');
    const errors = {};
    validateContact(form, errors);
    expect(Object.keys(errors).sort()).toEqual(['email', 'full_name', 'phone']);
  });
});
