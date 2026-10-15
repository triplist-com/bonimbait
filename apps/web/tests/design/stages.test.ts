import { describe, expect, it } from 'vitest';
import { BUILD_STAGES, getStage, stageForCategory, stageForProfile, stageHref } from '@/lib/stages';

describe('build stages (owner\'s 7)', () => {
  it('lists the owner\'s stages in order', () => {
    expect(BUILD_STAGES.map((s) => s.label)).toEqual(['רכישה', 'תכנון', 'היתר/מכרז', 'שלד', 'תשתיות', 'גמרים', 'אכלוס']);
    expect(BUILD_STAGES.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(BUILD_STAGES.map((s) => s.id)).size).toBe(7);
  });

  it('maps each stage to a live post category', () => {
    expect(BUILD_STAGES.map((s) => s.categorySlug)).toEqual([
      'שלב-רכישה',
      'שלב-תכנון',
      'שלב-היתר',
      'שלב-שלד',
      'שלב-תשתיות',
      'שלב-גמרים',
      'כניסה-לבית',
    ]);
    expect(stageHref(BUILD_STAGES[3])).toBe('/category/שלב-שלד/');
    for (const s of BUILD_STAGES) expect(s.icon).toMatch(/^\/brand\/stages\/[a-z-]+\.svg$/);
  });

  it('finds a stage by category slug, encoded or not', () => {
    expect(stageForCategory('שלב-גמרים')?.id).toBe('finishing');
    expect(stageForCategory(encodeURIComponent('כניסה-לבית'))?.id).toBe('moving-in');
    expect(stageForCategory('פודקאסט')).toBeUndefined();
  });

  it('maps member profile stages where the enum has one', () => {
    expect(stageForProfile('tender')?.id).toBe('permit');
    expect(stageForProfile('moving_in')?.label).toBe('אכלוס');
    expect(stageForProfile('renovation')).toBeUndefined();
    expect(stageForProfile(null)).toBeUndefined();
    expect(getStage('infrastructure')?.profileStage).toBeNull();
  });
});
