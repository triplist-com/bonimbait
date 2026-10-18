import { describe, expect, it } from 'vitest';
import { describeConditions, describeTarget, parseRuleForm } from '@/lib/revenue/routing-form';

const BIZ = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN = '22222222-2222-4222-8222-222222222222';

describe('parseRuleForm', () => {
  it('builds a rule row from the editor form', () => {
    const res = parseRuleForm({
      name: '  לידים חמים מהשרון  ',
      is_active: 'on',
      priority: '10',
      lead_types: ['consultation', 'consultation', 'nope'],
      region_slugs: ['sharon', 'atlantis'],
      stages: ['permit', 'frame', 'later'],
      specialty_slugs: ['קבלני-אלומיניום'],
      min_score: '70',
      max_score: '',
      target: 'business',
      target_business_id: BIZ,
      target_campaign_id: CAMPAIGN, // ignored for a business target
      note: '',
    });
    expect(res).toEqual({
      ok: true,
      rule: {
        name: 'לידים חמים מהשרון',
        is_active: true,
        priority: 10,
        lead_types: ['consultation'],
        specialty_slugs: ['קבלני-אלומיניום'],
        region_slugs: ['sharon'],
        stages: ['permit', 'frame'],
        min_score: 70,
        max_score: null,
        target: 'business',
        target_business_id: BIZ,
        target_campaign_id: null,
        note: null,
      },
    });
  });

  it('defaults the priority and leaves an unchecked rule inactive', () => {
    const res = parseRuleForm({ name: 'כלל', target: 'owner_inbox' });
    expect(res.ok && res.rule).toMatchObject({ priority: 100, is_active: false, lead_types: [], target_business_id: null });
  });

  it('reports every problem in Hebrew', () => {
    const res = parseRuleForm({
      name: 'x',
      priority: '-3',
      min_score: '90',
      max_score: '40',
      target: 'partner_campaign',
      target_campaign_id: 'nope',
      note: 'y'.repeat(501),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(Object.keys(res.fieldErrors).sort()).toEqual(['max_score', 'name', 'note', 'priority', 'target_campaign_id']);
      expect(res.fieldErrors.max_score).toBe('הציון המקסימלי קטן מהמינימלי');
    }
    const noTarget = parseRuleForm({ name: 'כלל', target: 'somewhere' });
    expect(!noTarget.ok && noTarget.fieldErrors.target).toBe('יש לבחור יעד');
    const noBiz = parseRuleForm({ name: 'כלל', target: 'business' });
    expect(!noBiz.ok && noBiz.fieldErrors.target_business_id).toBe('יש לבחור בעל מקצוע');
  });
});

describe('rule descriptions', () => {
  it('summarizes the conditions in one Hebrew line', () => {
    expect(
      describeConditions(
        {
          lead_types: ['consultation'],
          specialty_slugs: ['קבלני-אלומיניום'],
          region_slugs: ['sharon', 'center', 'shfela', 'south'],
          stages: ['permit'],
          min_score: 70,
          max_score: null,
        },
        { specialties: new Map([['קבלני-אלומיניום', 'קבלני אלומיניום']]) },
      ),
    ).toBe('ייעוץ תקציב בניה · קבלני אלומיניום · אזור השרון, מרכז, שפלה ועוד 1 · היתר/מכרז · ציון 70 ומעלה');
    expect(describeConditions({ lead_types: [], specialty_slugs: [], region_slugs: [], stages: [], min_score: null, max_score: 30 })).toBe('ציון עד 30');
    expect(describeConditions({ lead_types: [], specialty_slugs: [], region_slugs: [], stages: [], min_score: null, max_score: null })).toBe('כל ליד');
  });

  it('names the target', () => {
    expect(describeTarget({ target: 'business', target_business_id: BIZ, target_campaign_id: null }, { businesses: new Map([[BIZ, 'עמיאל']]) })).toBe(
      'העברה לבעל מקצוע: עמיאל',
    );
    expect(describeTarget({ target: 'owner_inbox', target_business_id: null, target_campaign_id: null })).toBe('תיבת הלידים של בונים בית');
  });
});
