/**
 * Demo fixture for /platform/demo/hub/: "משפחת לוי", a fictional family
 * building 220 m² in the Sharon, at the היתר/מכרז stage, with a ₪2.6M budget.
 * They ran the budget planner, paid the architect and the levies, have three
 * shell-contractor quotes on the table, a shortlist, documents and tasks.
 *
 * Pros are generated (fictional); the content picks are real videos and
 * guides from the static index (hub-picks.json, picked by lib/hub/picks.ts).
 * Plain JSON in the HubViewData shape, so the real dashboard renders it.
 */
import { plannedFromEstimate } from '@/lib/hub/budget';
import { STAGE_CONTENT } from '@/lib/hub/content';
import { addMonths } from '@/lib/hub/onboarding';
import { savedHref, savedThumbnail } from '@/lib/hub/saved';
import type { HubViewData, StagePicksMap } from '@/lib/hub/types';
import { addDays } from '../generator';
import { defineDemoFixture } from './define';
import picks from './hub-picks.json';

/** The owner's 2026 figure: planning plus build, 12–14K ₪/m² ex-VAT, for 220 m². */
const ESTIMATE = { totalMin: 2_640_000, totalMax: 3_080_000 };

export const hubDemo = defineDemoFixture('hub', ({ gen, today }): HubViewData => {
  const at = (daysAgo: number) => `${addDays(today, -daysAgo)}T09:30:00.000Z`;
  const day = (offset: number) => addDays(today, offset);

  const shell = gen.fork('shell').businesses(3, 'skeleton');
  const supervisor = gen.fork('supervisor').business('supervision');
  const architect = gen.fork('architect').business('architects');
  const shortlist = [shell[0], shell[1], supervisor];

  const plannerAt = at(9);
  const done = [
    ...STAGE_CONTENT.purchase.checklist.map((i) => i.id),
    ...STAGE_CONTENT.planning.checklist.map((i) => i.id),
    'permit.submit',
    'permit.fees',
    'permit.tender',
  ];

  const project = {
    id: 'demo-levi',
    title: 'הבית של משפחת לוי',
    stage: 'permit' as const,
    regionSlug: 'sharon',
    regionName: 'אזור השרון',
    sizeM2: 220,
    budgetRangeNis: [2_400_000, 2_600_000] as [number, number],
    targetMoveIn: addMonths(today.slice(0, 7), 23),
    onboarded: true,
    mode: 'self' as const,
  };

  const saved = [
    { kind: 'video' as const, ref: 'ethKoDXkxR8', title: 'פודקאסט פרק 75 - קבלן מפתח או מפקח בניה? איך לבחור נכון וטיפים נוספים על דרכי תשלום לקבלנים (2023)', days: 3 },
    { kind: 'post' as const, ref: 'איך-לפענח-הצעת-מחיר-ולזהות-מה-חסר', title: 'מכרז קבלנים: איך לפענח הצעת מחיר ולזהות מה חסר', days: 5 },
    { kind: 'answer' as const, ref: 'כמה עולה שלד לבית של 220 מ״ר ב-2026?', title: 'כמה עולה שלד לבית של 220 מ״ר ב-2026?', days: 6 },
    { kind: 'post' as const, ref: 'structural-contractor-golden-rules', title: '11 כללי זהב לפני חתימת חוזה עם קבלן שלד', days: 8 },
    { kind: 'video' as const, ref: 'H6VbxYeGqT8', title: 'פודקאסט פרק 79 - מדברים על אגרות בניה והיטלים בית פרטי ב-2024', days: 20 },
  ].map((s) => ({
    kind: s.kind,
    ref: s.ref,
    title: s.title,
    href: savedHref(s.kind, s.ref),
    thumbnail: savedThumbnail(s.kind, s.ref),
    savedAt: at(s.days),
  }));

  return {
    mode: 'demo',
    today,
    project,
    checklistDone: done,
    estimate: { ...ESTIMATE, basis: 'planner', at: plannerAt, inputs: { size_m2: 220, region: 'sharon', finish: 'standard_high' } },
    budgetVersion: {
      id: 'demo-v1',
      versionNo: 1,
      label: 'הערכה ממתכנן התקציב',
      basis: 'planner',
      ...ESTIMATE,
      createdAt: plannerAt,
      planned: plannedFromEstimate(ESTIMATE.totalMin, ESTIMATE.totalMax),
    },
    budgetItems: [
      { id: 'demo-b8', kind: 'quote', category: 'frame', label: 'הצעת מחיר לשלד', vendor: shell[2].name, amount: 905_000, status: 'open', occurredOn: day(-2), createdAt: at(2) },
      { id: 'demo-b7', kind: 'quote', category: 'frame', label: 'הצעת מחיר לשלד', vendor: shell[1].name, amount: 869_000, status: 'open', occurredOn: day(-4), createdAt: at(4) },
      { id: 'demo-b6', kind: 'quote', category: 'frame', label: 'הצעת מחיר לשלד', vendor: shell[0].name, amount: 812_000, status: 'open', occurredOn: day(-6), createdAt: at(6) },
      { id: 'demo-b5', kind: 'actual', category: 'fees', label: 'ביטוח עבודות קבלניות', vendor: 'סוכנות ביטוח', amount: 9_800, status: 'paid', occurredOn: day(-11), createdAt: at(11) },
      { id: 'demo-b4', kind: 'actual', category: 'fees', label: 'אגרות והיטלי פיתוח', vendor: 'הוועדה המקומית', amount: 142_000, status: 'paid', occurredOn: day(-19), createdAt: at(19) },
      { id: 'demo-b3', kind: 'actual', category: 'design', label: 'קונסטרוקטור', vendor: 'משרד הנדסה', amount: 18_000, status: 'paid', occurredOn: day(-48), createdAt: at(48) },
      { id: 'demo-b2', kind: 'actual', category: 'design', label: 'אדריכל, תשלום שני', vendor: architect.name, amount: 35_000, status: 'paid', occurredOn: day(-75), createdAt: at(75) },
      { id: 'demo-b1', kind: 'actual', category: 'design', label: 'אדריכל, מקדמה', vendor: architect.name, amount: 60_000, status: 'paid', occurredOn: day(-160), createdAt: at(160) },
    ],
    saved,
    shortlist: shortlist.map((b) => ({
      id: b.id,
      slug: '',
      name: b.name,
      specialty: b.specialty.name,
      logoUrl: null,
      ratingPercent: b.ratingPercent,
      reviewCount: b.reviewCount,
    })),
    contacts: [
      { ref: 'BB-26-000412', type: 'business_contact', businessName: shell[0].name, businessSlug: null, createdAt: at(7) },
      { ref: 'BB-26-000398', type: 'business_contact', businessName: supervisor.name, businessSlug: null, createdAt: at(12) },
    ],
    documents: [
      { id: 'demo-d5', fileName: 'הצעת מחיר שלד - קבלן ב.pdf', mimeType: 'application/pdf', sizeBytes: 982_000, category: 'quote', stage: 'permit', note: null, createdAt: at(4) },
      { id: 'demo-d4', fileName: 'הצעת מחיר שלד - קבלן א.pdf', mimeType: 'application/pdf', sizeBytes: 1_140_000, category: 'quote', stage: 'permit', note: null, createdAt: at(6) },
      { id: 'demo-d3', fileName: 'כתב כמויות שלד.pdf', mimeType: 'application/pdf', sizeBytes: 2_310_000, category: 'plans', stage: 'permit', note: null, createdAt: at(14) },
      { id: 'demo-d2', fileName: 'שומת אגרות והיטלים.pdf', mimeType: 'application/pdf', sizeBytes: 388_000, category: 'permit', stage: 'permit', note: null, createdAt: at(21) },
      { id: 'demo-d1', fileName: 'תוכנית הגשה להיתר.pdf', mimeType: 'application/pdf', sizeBytes: 4_260_000, category: 'plans', stage: 'permit', note: null, createdAt: at(30) },
    ],
    tasks: [
      { id: 'demo-t1', title: 'לשלוח כתב כמויות לקבלן שלד רביעי', dueOn: day(2), done: false, stage: 'permit' },
      { id: 'demo-t2', title: 'פגישה עם המפקח: תדירות ביקורים ואישור חשבונות', dueOn: day(6), done: false, stage: 'permit' },
      { id: 'demo-t3', title: 'לבדוק ערבות ביצוע וסעיף קנסות בחוזה השלד', dueOn: day(12), done: false, stage: 'permit' },
      { id: 'demo-t4', title: 'לחדש את ביטוח העבודות לפני היציקה הראשונה', dueOn: day(41), done: false, stage: 'frame' },
      { id: 'demo-t5', title: 'להעביר תשלום שומת היטלים', dueOn: day(-19), done: true, stage: 'permit' },
    ],
    picks: picks as StagePicksMap,
    file: {
      version: 1,
      stage: project.stage,
      regionSlug: project.regionSlug,
      sizeM2: project.sizeM2,
      budgetRangeNis: project.budgetRangeNis,
      targetMoveIn: project.targetMoveIn,
      plannerEstimate: { ...ESTIMATE, at: plannerAt, inputs: { size_m2: 220, region: 'sharon', finish: 'standard_high' } },
      savedCount: saved.length,
      shortlistBusinessIds: shortlist.map((b) => b.id),
    },
    advisorQuestions: 4,
  };
});

export type HubDemoData = ReturnType<typeof hubDemo.build>;
