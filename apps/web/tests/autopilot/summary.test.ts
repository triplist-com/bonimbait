import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY,
  normalizePrice,
  chaptersFromText,
  chaptersToText,
  costsFromText,
  costsToText,
  keyPointsFromText,
  keyPointsToText,
  normalizeSummary,
} from '@/lib/autopilot/summary';

const slugs = ['finishes-design', 'general-tips', 'costs-pricing'];

describe('normalizeSummary', () => {
  it('clamps times into the video, sorts chapters and starts them at 0:00', () => {
    const s = normalizeSummary(
      {
        summary: '  סיכום   קצר  ',
        key_points: [
          { text: 'מחיר למ"ר', start_s: 95.7 },
          { text: 'מחיר למ"ר', start_s: 10 },
          { text: 'אחרי הסוף', start_s: 9999 },
          { text: 'בלי זמן', start_s: -4 },
        ],
        chapters: [
          { title: 'סיכום', start_s: 250 },
          { title: 'פתיחה', start_s: 3 },
          { title: 'כפול', start_s: 250 },
          { title: '', start_s: 100 },
        ],
        costs: [{ item: 'אבן פראית', price: '250 ש"ח', unit: 'למ"ר', context: 'כולל עבודה' }, { item: '', price: '1' }],
        category_slug: 'finishes-design',
        stage: 'finishing',
        tips: ['טיפ', 'טיפ', ''],
        warnings: [],
        suggested_questions: ['כמה עולה חיפוי אבן?', 'ש1', 'ש2', 'ש3', 'ש4'],
      },
      { durationS: 308, categorySlugs: slugs },
    );
    expect(s.summary).toBe('סיכום קצר');
    expect(s.key_points).toEqual([
      { text: 'מחיר למ"ר', start_s: 95 },
      { text: 'אחרי הסוף', start_s: 307 },
      { text: 'בלי זמן', start_s: null },
    ]);
    expect(s.chapters).toEqual([
      { title: 'פתיחה', start_s: 0 },
      { title: 'סיכום', start_s: 250 },
    ]);
    expect(s.costs).toEqual([{ item: 'אבן פראית', price: '250', unit: 'למ"ר', context: 'כולל עבודה' }]);
    expect(s.stage).toBe('finishing');
    expect(s.tips).toEqual(['טיפ']);
    expect(s.suggested_questions).toHaveLength(4);
  });

  it('orders key points along the video and drops costs without a stated number', () => {
    const s = normalizeSummary(
      {
        summary: 'x',
        key_points: [
          { text: 'שלישית', start_s: 380 },
          { text: 'בלי זמן', start_s: null },
          { text: 'ראשונה', start_s: 60 },
          { text: 'שנייה', start_s: 375 },
        ],
        costs: [
          { item: 'גוף תאורה', price: '1000 שקל', unit: 'לגוף', context: '' },
          { item: 'מסנן מים', price: 'לא נאמר', unit: '', context: '' },
        ],
      },
      { durationS: 948, categorySlugs: slugs },
    );
    expect(s.key_points.map((k) => k.text)).toEqual(['ראשונה', 'שנייה', 'שלישית', 'בלי זמן']);
    expect(s.costs.map((c) => c.item)).toEqual(['גוף תאורה']);
  });

  it('restricts category and stage to known values', () => {
    const s = normalizeSummary({ summary: 'x', category_slug: 'made-up', stage: 'none' }, { durationS: null, categorySlugs: slugs });
    expect(s.category_slug).toBe(DEFAULT_CATEGORY);
    expect(s.stage).toBeNull();
    expect(s.key_points).toEqual([]);
    expect(s.chapters).toEqual([]);
  });
});

describe('normalizePrice', () => {
  it('reduces spoken shekel amounts to the amount', () => {
    expect(normalizePrice('180 שק')).toBe('180');
    expect(normalizePrice('1,000 שקלים')).toBe('1,000');
    expect(normalizePrice('200-220 ש"ח')).toBe('200-220');
    expect(normalizePrice('200 – 220 ₪')).toBe('200-220');
    expect(normalizePrice('15 אלף שקל')).toBe('15 אלף שקל');
    expect(normalizePrice('כ-500 ש"ח לחודש')).toBe('כ-500 ש"ח לחודש');
  });
});

describe('summary editor text format', () => {
  it('round-trips key points, chapters and costs', () => {
    const kp = [
      { text: 'נקודה עם זמן', start_s: 75 },
      { text: 'נקודה בלי זמן', start_s: null },
    ];
    expect(keyPointsFromText(keyPointsToText(kp))).toEqual(kp);

    const ch = [
      { title: 'פתיחה', start_s: 0 },
      { title: 'מחירים | הצעות', start_s: 3725 },
    ];
    expect(chaptersFromText(chaptersToText(ch))).toEqual(ch);

    const costs = [{ item: 'שליכט', price: '120-150 ש"ח', unit: 'למ"ר', context: 'צבעוני' }];
    expect(costsFromText(costsToText(costs))).toEqual(costs);
  });

  it('drops chapter lines without a valid time', () => {
    expect(chaptersFromText('פתיחה בלי זמן\n1:30 | שלד\n\n')).toEqual([{ title: 'שלד', start_s: 90 }]);
  });
});
