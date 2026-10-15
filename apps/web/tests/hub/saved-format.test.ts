import { describe, expect, it } from 'vitest';
import { dueLabel, formatMoneyRange, moneyParts, moneyRangeParts, monthLabel, varianceParts } from '@/lib/hub/format';
import { savedHref, savedThumbnail, validateSaveInput } from '@/lib/hub/saved';

describe('validateSaveInput', () => {
  it('accepts each kind with its own ref format', () => {
    expect(validateSaveInput({ kind: 'video', ref: 'gUrvdx_xZjM', title: 'טריילר' })).toMatchObject({ ok: true });
    expect(validateSaveInput({ kind: 'post', ref: 'bill-of-quantities', title: 'כתב כמויות' })).toMatchObject({ ok: true });
    expect(validateSaveInput({ kind: 'video_page', ref: 'איך-בוחרים-אדריכל', title: 'x' })).toMatchObject({ ok: true });
    expect(
      validateSaveInput({ kind: 'business', ref: '11111111-1111-4111-8111-111111111111', title: 'x', meta: { slug: 'studio' } }),
    ).toMatchObject({ ok: true, value: { meta: { slug: 'studio' } } });
    expect(validateSaveInput({ kind: 'answer', ref: 'כמה עולה שלד?', title: '' })).toMatchObject({
      ok: true,
      value: { title: 'כמה עולה שלד?' },
    });
  });

  it('refuses bad refs and kinds', () => {
    expect(validateSaveInput({ kind: 'video', ref: 'javascript:alert(1)' })).toEqual({ ok: false, error: 'ref' });
    expect(validateSaveInput({ kind: 'post', ref: '../admin' })).toEqual({ ok: false, error: 'ref' });
    expect(validateSaveInput({ kind: 'business', ref: 'acme' })).toEqual({ ok: false, error: 'ref' });
    expect(validateSaveInput({ kind: 'lead', ref: 'x' })).toEqual({ ok: false, error: 'kind' });
    expect(validateSaveInput(null)).toEqual({ ok: false, error: 'invalid' });
  });

  it('keeps only safe display meta', () => {
    const v = validateSaveInput({
      kind: 'business',
      ref: '11111111-1111-4111-8111-111111111111',
      title: 'x',
      meta: { slug: 'a/b', thumbnail: 'http://insecure', specialty: 'אדריכלות', evil: '<script>' },
    });
    expect(v.ok && v.value.meta).toEqual({ specialty: 'אדריכלות' });
  });
});

describe('saved item links', () => {
  it('derives in-site hrefs from kind + ref', () => {
    expect(savedHref('video', 'gUrvdx_xZjM')).toBe('/video/gUrvdx_xZjM/');
    expect(savedHref('post', 'bill-of-quantities')).toBe('/bill-of-quantities/');
    expect(savedHref('business', 'id', { slug: 'studio' })).toBe('/business/studio/');
    expect(savedHref('business', 'id')).toBe('/recommended/');
    expect(savedHref('answer', 'כמה עולה שלד?')).toMatch(/^\/[a-z]+\/\?q=/);
    expect(savedThumbnail('video', 'gUrvdx_xZjM')).toBe('https://i.ytimg.com/vi/gUrvdx_xZjM/mqdefault.jpg');
    expect(savedThumbnail('post', 'x')).toBeNull();
  });
});

describe('money and dates', () => {
  it('formats compact shekel amounts and ranges', () => {
    expect(moneyParts(2_600_000)).toEqual({ value: '2.6', unit: 'מיליון ₪' });
    expect(moneyParts(820_000)).toEqual({ value: '820', unit: 'אלף ₪' });
    expect(moneyParts(6_900)).toEqual({ value: '6,900', unit: '₪' });
    expect(moneyRangeParts(2_400_000, 2_800_000)).toEqual({ value: '2.4–2.8', unit: 'מיליון ₪' });
    expect(formatMoneyRange(0, 1_500_000)).toBe('עד ⁦1.5⁩ מיליון ₪');
    expect(varianceParts(-30_000)).toEqual({ value: '30', unit: 'אלף ₪', sign: '−' });
  });

  it('labels months and due dates in Hebrew', () => {
    expect(monthLabel('2027-09')).toBe('ספטמבר 2027');
    expect(dueLabel('2026-10-15', '2026-10-15')).toEqual({ label: 'היום', tone: 'today' });
    expect(dueLabel('2026-10-16', '2026-10-15')).toEqual({ label: 'מחר', tone: 'soon' });
    expect(dueLabel('2026-10-13', '2026-10-15')).toEqual({ label: 'באיחור של יומיים', tone: 'overdue' });
    expect(dueLabel('2026-11-20', '2026-10-15')).toEqual({ label: '20 בנובמבר', tone: 'later' });
    expect(dueLabel(null, '2026-10-15').tone).toBe('none');
  });
});
