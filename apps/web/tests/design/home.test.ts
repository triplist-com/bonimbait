import { describe, expect, it } from 'vitest';
import { computeVideoStats, formatKnowledgeLine, hebrewCount, knowledgeParts } from '@/lib/home/stats';
import { EXAMPLE_QUESTIONS, nextIndex } from '@/lib/home/questions';
import { BUDGET_TEASER, HERO_COPY, HUB_TEASER, VALUE_STRIP } from '@/lib/home/content';
import { calculateCost } from '@/lib/calculator';

describe('homepage knowledge stats', () => {
  it('counts only transcribed videos and sums their hours', () => {
    const stats = computeVideoStats([
      { duration_seconds: 3600, segment_count: 3, has_transcript: true },
      { duration_seconds: '1800', segment_count: '2' },
      { duration_seconds: 5400, segment_count: 0, has_transcript: 'True' },
      { duration_seconds: 9999, segment_count: 0, has_transcript: false },
      { duration_seconds: null, segment_count: 1 },
    ]);
    expect(stats).toEqual({ videos: 4, hours: 3 });
  });

  it('formats the hero line with Hebrew plurals and skips zeros', () => {
    expect(formatKnowledgeLine({ videos: 178, hours: 61, articles: 806 })).toBe('178 סרטונים · 61 שעות צפייה · 806 מאמרים');
    expect(formatKnowledgeLine({ videos: 1, hours: 1, articles: 0 })).toBe('1 סרטון · 1 שעת צפייה');
    expect(knowledgeParts({ videos: 0, hours: 0, articles: 2 })).toEqual([{ value: '2', label: 'מאמרים' }]);
    expect(hebrewCount(1, 'מאמר', 'מאמרים')).toBe('מאמר אחד');
    expect(hebrewCount(1200, 'מאמר', 'מאמרים')).toBe('1,200 מאמרים');
  });
});

describe('homepage copy (strategy update)', () => {
  it('keeps the owner\'s H1 and the agreed subline and placeholder', () => {
    expect(`${HERO_COPY.title.lead} ${HERO_COPY.title.highlight}`).toBe('אתכם עד המפתח');
    expect(HERO_COPY.subline).toBe('שאלו כל שאלה על בניית בית, בנו תקציב ראשוני וקבלו מפת דרך אישית — מהמגרש ועד הכניסה הביתה.');
    expect(HERO_COPY.placeholder).toBe('למשל: כמה עולה שלד לבית של 200 מ״ר?');
    expect(`למשל: ${EXAMPLE_QUESTIONS[0].text}`).toBe(HERO_COPY.placeholder);
  });

  it('has the six value-strip items', () => {
    expect(VALUE_STRIP.map((v) => v.text)).toEqual([
      'תשובה מהשטח תוך שניות — עם הרגע המדויק בסרטון',
      'מפת דרך אישית לפי השלב שלכם',
      'תקציב ראשוני ב-3 דקות',
      'בעלי מקצוע מומלצים, עם דירוג של בונים כמוכם',
      'קבוצות וואטסאפ אזוריות בכל הארץ',
      'פגישת ייעוץ תקציב ראשונה — ללא עלות',
    ]);
  });

  it('keeps "AI" out of builder-facing headlines', () => {
    const headlines = [HERO_COPY.title.lead, HERO_COPY.title.highlight, HERO_COPY.subline, ...VALUE_STRIP.map((v) => v.text), HUB_TEASER.title, HUB_TEASER.cta];
    for (const h of headlines) expect(h).not.toMatch(/\bAI\b|בינה מלאכותית/);
  });

  it('dates the cost example and runs it through the real calculator', () => {
    expect(BUDGET_TEASER.asOf).toBe('נכון ל-2026');
    const r = calculateCost({ ...BUDGET_TEASER.example.answers, special_features: [] });
    expect(r.total_min).toBeGreaterThan(1_000_000);
    expect(r.total_max).toBeGreaterThan(r.total_min);
  });

  it('points the hub teaser at /account/ with the agreed CTA', () => {
    expect(HUB_TEASER.href).toBe('/account/');
    expect(HUB_TEASER.cta).toBe('פתחו את הבית שלי — חינם');
    expect(HUB_TEASER.subtitle).toBe('שמרו, עקבו ותכננו את כל הבנייה במקום אחד');
  });

  it('rotates example questions with wrap-around', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(5, 0)).toBe(0);
  });
});
