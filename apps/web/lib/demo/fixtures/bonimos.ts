/**
 * Demo fixture for /platform/demo/bonimos/: a managed project in the owner's
 * Bonim.Os, "the turnkey plan's line 3.3, for real". A fictional family is
 * building 180 m² in the Shfela and is at the shell stage:
 *
 *   - budget: v1 from growth's planner (estimateFromProfile), v2 approved
 *     after the contractor tender, v3 after a design change; forecast +2.1%
 *     (levies and insurance, two frame change orders, aluminium quotes above plan)
 *   - schedule: the permit and the shell's first two milestones done, the
 *     ground-floor ceiling in progress (the next milestone, in 12 days)
 *   - approvals: two shell payments paid, one rejected extra, payment 4 reviewed
 *     by the manager (cut from ₪96K to ₪90K) and waiting for the client, and an
 *     electrician's request waiting for the manager
 *   - documents, six site photos (generated illustrations, public/bonimos/demo/)
 *     and the activity log those events produce
 *
 * People are generated (fictional). Plain JSON in the shapes the real UI
 * renders (lib/bonimos/types.ts), so the demo is the product, not a mock-up.
 */
import { estimateFromProfile } from '@/lib/planner/engine';
import { DEFAULT_PRICE_BOOK } from '@/lib/planner/defaults';
import type { BudgetCategoryId } from '@/lib/hub/budget';
import type { HubBudgetItemView, HubDocumentView } from '@/lib/hub/types';
import { planTotal, plannedFromStageRows } from '@/lib/bonimos/budget';
import { projectSummaryParts } from '@/lib/bonimos/mappers';
import type {
  ActivityView,
  BudgetVersionPlan,
  ManagedProjectData,
  ManagerProjectSummary,
  MilestoneView,
  PaymentEventView,
  PaymentRequestView,
  PersonView,
  PhotoView,
  ProjectRole,
} from '@/lib/bonimos/types';
import { addDays } from '../generator';
import { defineDemoFixture } from './define';

export const BONIMOS_DEMO_IDS = { manager: 'demo-manager', client: 'demo-client', project: 'demo-bonimos' } as const;

/** The approved budget after the design change (v3), whole shekels, ex-VAT. */
const APPROVED_V3: Partial<Record<BudgetCategoryId, number>> = {
  design: 150_000,
  fees: 112_000,
  frame: 768_000,
  systems: 262_000,
  envelope: 105_000,
  windows: 225_000,
  plaster: 140_000,
  flooring: 205_000,
  carpentry: 185_000,
  sanitary: 48_000,
  outdoor: 95_000,
  moving: 20_000,
};
/** v2, after the tender: the same, before the bigger safe room and living-room windows. */
const APPROVED_V2: Partial<Record<BudgetCategoryId, number>> = { ...APPROVED_V3, frame: 746_000, windows: 190_000 };

export interface BonimosDemoData {
  /** The project view, as the manager sees it (DemoBonimos swaps the viewer). */
  project: ManagedProjectData;
  viewers: Record<ProjectRole, { userId: string; role: ProjectRole }>;
  /** The manager's workspace: this project and three more. */
  workspace: ManagerProjectSummary[];
  /** "ISO now" the times are relative to. */
  now: string;
}

export const bonimosDemo = defineDemoFixture('bonimos', ({ gen, today }): BonimosDemoData => {
  const day = (offset: number) => addDays(today, offset);
  /** An ISO time `daysAgo` days ago at Israel `hh:mm` (UTC+3 in the build season). */
  const at = (daysAgo: number, hh = 9, mm = 0) => `${day(-daysAgo)}T${String(hh - 3).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`;
  const now = `${today}T10:00:00.000Z`;

  const clientPerson = gen.fork('client').person();
  // The demo copy says "מנהלת הפרויקט": take the first generated woman who shares no name with the client.
  let managerPerson = gen.fork('manager').person();
  const clash = () =>
    managerPerson.gender !== 'f' || managerPerson.lastName === clientPerson.lastName || managerPerson.firstName === clientPerson.firstName;
  for (let i = 2; i < 40 && clash(); i += 1) {
    managerPerson = gen.fork(`manager-${i}`).person();
  }
  const M = BONIMOS_DEMO_IDS.manager;
  const C = BONIMOS_DEMO_IDS.client;
  const people: PersonView[] = [
    {
      userId: M,
      role: 'manager',
      name: managerPerson.fullName,
      title: 'מנהלת פרויקט ופיקוח',
      phone: managerPerson.phone,
      email: null,
    },
    { userId: C, role: 'owner', name: clientPerson.fullName, title: null, phone: clientPerson.phone, email: clientPerson.email },
  ];
  const shell = gen.fork('shell').business('skeleton');
  const electrician = gen.fork('electric').business('electricians');
  const architect = gen.fork('architect').business('architects');
  const aluminium = gen.fork('aluminium').businesses(2, 'aluminium');

  // --- Budget: v1 (planner), v2 (tender), v3 (design change) ----------------
  const estimate = estimateFromProfile({ sizeM2: 180, regionSlug: 'shfela' }, DEFAULT_PRICE_BOOK);
  const v1Plan = plannedFromStageRows(estimate.stages);
  const versions: BudgetVersionPlan[] = [
    {
      id: 'demo-v1',
      versionNo: 1,
      label: 'הערכה ממתכנן התקציב',
      basis: 'planner',
      note: null,
      createdAt: at(240, 21, 12),
      createdBy: C,
      isCurrent: false,
      totalMin: estimate.total.min,
      totalMax: estimate.total.max,
      planned: v1Plan,
    },
    {
      id: 'demo-v2',
      versionNo: 2,
      label: 'תקציב מאושר',
      basis: 'manual',
      note: 'אחרי מכרז הקבלנים: נבחר קבלן השלד, והכמויות לפי כתב הכמויות המלא. נוספו פיתוח וחיבורים.',
      createdAt: at(120, 17, 40),
      createdBy: M,
      isCurrent: false,
      totalMin: planTotal(APPROVED_V2),
      totalMax: planTotal(APPROVED_V2),
      planned: APPROVED_V2,
    },
    {
      id: 'demo-v3',
      versionNo: 3,
      label: 'תקציב מאושר',
      basis: 'manual',
      note: 'שינוי בתכנון לבקשת המשפחה: ממ״ד מוגדל וחלונות גדולים בסלון.',
      createdAt: at(35, 16, 5),
      createdBy: M,
      isCurrent: true,
      totalMin: planTotal(APPROVED_V3),
      totalMax: planTotal(APPROVED_V3),
      planned: APPROVED_V3,
    },
  ];

  const item = (
    id: string,
    kind: 'actual' | 'quote',
    category: BudgetCategoryId,
    amount: number,
    daysAgo: number,
    label: string,
    vendor: string,
    status: HubBudgetItemView['status'],
  ): HubBudgetItemView => ({ id, kind, category, label, vendor, amount, status, occurredOn: day(-daysAgo), createdAt: at(daysAgo, 12) });
  const budgetItems: HubBudgetItemView[] = [
    item('demo-i13', 'quote', 'windows', 251_000, 8, 'הצעת מחיר אלומיניום', aluminium[1].name, 'open'),
    item('demo-i12', 'quote', 'windows', 238_000, 12, 'הצעת מחיר אלומיניום', aluminium[0].name, 'open'),
    item('demo-i11', 'actual', 'frame', 112_800, 30, 'בקשת תשלום #3: רצפה וקורות יסוד (15%)', shell.name, 'paid'),
    item('demo-i10', 'quote', 'frame', 18_000, 44, 'תוספת: ברזל לפי דרישת הקונסטרוקטור', shell.name, 'accepted'),
    item('demo-i9', 'actual', 'frame', 150_400, 52, 'בקשת תשלום #1: חפירה ויסודות (20%)', shell.name, 'paid'),
    item('demo-i8', 'quote', 'frame', 24_000, 36, 'תוספת: הגדלת הממ״ד', shell.name, 'accepted'),
    item('demo-i7', 'quote', 'frame', 752_000, 121, 'חוזה קבלן השלד', shell.name, 'accepted'),
    item('demo-i6', 'actual', 'fees', 9_800, 95, 'ביטוח עבודות קבלניות', 'סוכנות ביטוח', 'paid'),
    item('demo-i5', 'actual', 'fees', 112_000, 150, 'אגרות והיטלי פיתוח', 'הוועדה המקומית', 'paid'),
    item('demo-i4', 'actual', 'design', 30_000, 170, 'אדריכל, תשלום שלישי', architect.name, 'paid'),
    item('demo-i3', 'actual', 'design', 18_000, 200, 'קונסטרוקטור', 'משרד הנדסה', 'paid'),
    item('demo-i2', 'actual', 'design', 35_000, 250, 'אדריכל, תשלום שני', architect.name, 'paid'),
    item('demo-i1', 'actual', 'design', 60_000, 300, 'אדריכל, מקדמה', architect.name, 'paid'),
  ];

  // --- Schedule (from the permit; earlier stages were done before Bonim.Os) --
  const done = (d: Omit<MilestoneView, 'note' | 'sortOrder'>, sortOrder: number, note: string | null = null): MilestoneView => ({ ...d, note, sortOrder });
  const plan = (id: string, stage: MilestoneView['stage'], title: string, from: number, to: number, sortOrder: number): MilestoneView => ({
    id,
    stage,
    title,
    plannedStart: day(from),
    plannedEnd: day(to),
    actualStart: null,
    actualEnd: null,
    note: null,
    sortOrder,
  });
  const milestones: MilestoneView[] = [
    done({ id: 'demo-m1', stage: 'permit', title: 'מכרז קבלנים וחוזה', plannedStart: day(-160), plannedEnd: day(-122), actualStart: day(-158), actualEnd: day(-121) }, 10),
    done({ id: 'demo-m2', stage: 'permit', title: 'היתר בנייה', plannedStart: day(-130), plannedEnd: day(-100), actualStart: day(-130), actualEnd: day(-96) }, 20),
    done({ id: 'demo-m3', stage: 'frame', title: 'חפירה ויסודות', plannedStart: day(-90), plannedEnd: day(-60), actualStart: day(-88), actualEnd: day(-57) }, 30, 'בדיקת מעבדה לבטון היסודות: תקינה'),
    done({ id: 'demo-m4', stage: 'frame', title: 'רצפה וקורות יסוד', plannedStart: day(-59), plannedEnd: day(-35), actualStart: day(-56), actualEnd: day(-35) }, 40),
    { ...plan('demo-m5', 'frame', 'קומת קרקע ותקרה', -34, 12, 50), actualStart: day(-33) },
    plan('demo-m6', 'frame', 'קומה א׳ ותקרה עליונה', 13, 55, 60),
    plan('demo-m7', 'frame', 'גג ומעקות', 56, 75, 70),
    plan('demo-m8', 'infrastructure', 'חשמל ותקשורת', 76, 105, 80),
    plan('demo-m9', 'infrastructure', 'אינסטלציה וביוב', 80, 110, 90),
    plan('demo-m10', 'infrastructure', 'איטום ובידוד', 106, 135, 100),
    plan('demo-m11', 'finishing', 'טיח פנים וחוץ', 136, 170, 110),
    plan('demo-m12', 'finishing', 'ריצוף וחיפוי', 171, 205, 120),
    plan('demo-m13', 'finishing', 'אלומיניום וזכוכית', 190, 215, 130),
    plan('demo-m14', 'finishing', 'מטבח, נגרות וגמר', 206, 245, 140),
    plan('demo-m15', 'moving-in', 'פיתוח חוץ, חיבורים וטופס 4', 246, 290, 150),
    plan('demo-m16', 'moving-in', 'מסירה ובדק בית', 291, 305, 160),
  ];

  // --- Documents --------------------------------------------------------------
  const doc = (id: string, fileName: string, category: HubDocumentView['category'], daysAgo: number, sizeBytes: number): HubDocumentView => ({
    id,
    fileName,
    mimeType: 'application/pdf',
    sizeBytes,
    category,
    stage: daysAgo > 100 ? 'permit' : 'frame',
    note: null,
    createdAt: at(daysAgo, 11, 20),
  });
  const documents: HubDocumentView[] = [
    doc('demo-d8', 'חשבון קבלן השלד מס׳ 4.pdf', 'receipt', 3, 412_000),
    doc('demo-d7', 'הצעת מחיר אלומיניום ב.pdf', 'quote', 8, 1_204_000),
    doc('demo-d6', 'הצעת מחיר אלומיניום א.pdf', 'quote', 12, 988_000),
    doc('demo-d5', 'דוח מעבדה: בטון רצפה.pdf', 'other', 31, 356_000),
    doc('demo-d4', 'חוזה קבלן השלד, חתום.pdf', 'contract', 121, 2_870_000),
    doc('demo-d3', 'היתר בנייה.pdf', 'permit', 96, 1_640_000),
    doc('demo-d2', 'תוכניות קונסטרוקציה.pdf', 'plans', 110, 6_120_000),
    doc('demo-d1', 'כתב כמויות שלד.pdf', 'plans', 140, 2_310_000),
  ];

  // --- Payment approvals (each with its audit trail) ---------------------------
  let eventSeq = 0;
  const ev = (
    action: PaymentEventView['action'],
    fromStatus: PaymentEventView['fromStatus'],
    toStatus: PaymentEventView['toStatus'],
    actor: string,
    createdAt: string,
    amount: number | null,
    note: string | null = null,
  ): PaymentEventView => ({ id: `demo-e${(eventSeq += 1)}`, action, fromStatus, toStatus, actorId: actor, actorRole: actor === M ? 'manager' : 'owner', amount, note, createdAt });
  const request = (r: Omit<PaymentRequestView, 'updatedAt'>): PaymentRequestView => ({ ...r, updatedAt: r.events.at(-1)?.createdAt ?? r.createdAt });

  const payments: PaymentRequestView[] = [
    request({
      id: 'demo-p5',
      number: 5,
      contractor: electrician.name,
      title: 'צנרת חשמל בתקרה לפני היציקה',
      category: 'systems',
      stage: 'infrastructure',
      milestoneId: 'demo-m5',
      attachment: null,
      requested: 14_500,
      approved: null,
      status: 'pending_review',
      dueOn: day(10),
      paidOn: null,
      note: 'החשמלאי שלח את החשבון אלינו ישירות.',
      createdBy: C,
      createdAt: at(1, 21, 15),
      events: [ev('requested', null, 'pending_review', C, at(1, 21, 15), 14_500, 'החשמלאי שלח את החשבון אלינו ישירות.')],
    }),
    request({
      id: 'demo-p4',
      number: 4,
      contractor: shell.name,
      title: 'תשלום 4: עמודים וקירות קומת קרקע',
      category: 'frame',
      stage: 'frame',
      milestoneId: 'demo-m5',
      attachment: { id: 'demo-d8', fileName: 'חשבון קבלן השלד מס׳ 4.pdf', mimeType: 'application/pdf' },
      requested: 96_000,
      approved: 90_000,
      status: 'pending_client',
      dueOn: day(7),
      paidOn: null,
      note: 'לפי סעיף 4 בלוח התשלומים שבחוזה.',
      createdBy: M,
      createdAt: at(3, 10, 5),
      events: [
        ev('requested', null, 'pending_review', M, at(3, 10, 5), 96_000, 'לפי סעיף 4 בלוח התשלומים שבחוזה.'),
        ev('review_approve', 'pending_review', 'pending_client', M, at(2, 16, 40), 90_000, 'ביקרתי באתר: חסרים שני עמודים בצד המזרחי. אישרתי 90,000 ₪ עד שישלימו, והיתרה תשולם בבקשה הבאה.'),
      ],
    }),
    request({
      id: 'demo-p3',
      number: 3,
      contractor: shell.name,
      title: 'תשלום 3: רצפה וקורות יסוד (15%)',
      category: 'frame',
      stage: 'frame',
      milestoneId: 'demo-m4',
      attachment: null,
      requested: 112_800,
      approved: 112_800,
      status: 'paid',
      dueOn: null,
      paidOn: day(-30),
      note: null,
      createdBy: M,
      createdAt: at(34, 9, 30),
      events: [
        ev('requested', null, 'pending_review', M, at(34, 9, 30), 112_800),
        ev('review_approve', 'pending_review', 'pending_client', M, at(33, 15, 0), 112_800, 'הרצפה נוצקה לפי התוכנית. דוח המעבדה תקין.'),
        ev('client_approve', 'pending_client', 'approved', C, at(32, 20, 10), 112_800),
        ev('mark_paid', 'approved', 'paid', C, at(30, 11, 0), 112_800),
      ],
    }),
    request({
      id: 'demo-p2',
      number: 2,
      contractor: shell.name,
      title: 'תוספת: עבודות לילה ביציקת היסודות',
      category: 'frame',
      stage: 'frame',
      milestoneId: null,
      attachment: null,
      requested: 6_400,
      approved: null,
      status: 'rejected',
      dueOn: null,
      paidOn: null,
      note: null,
      createdBy: M,
      createdAt: at(41, 8, 50),
      events: [
        ev('requested', null, 'pending_review', M, at(41, 8, 50), 6_400),
        ev('review_reject', 'pending_review', 'rejected', M, at(40, 14, 20), null, 'לא סוכם מראש ולא מופיע בחוזה. היציקה נדחתה ליום אחר בגלל הקבלן.'),
      ],
    }),
    request({
      id: 'demo-p1',
      number: 1,
      contractor: shell.name,
      title: 'תשלום 1: חפירה ויסודות (20%)',
      category: 'frame',
      stage: 'frame',
      milestoneId: 'demo-m3',
      attachment: null,
      requested: 150_400,
      approved: 150_400,
      status: 'paid',
      dueOn: null,
      paidOn: day(-52),
      note: null,
      createdBy: M,
      createdAt: at(56, 9, 0),
      events: [
        ev('requested', null, 'pending_review', M, at(56, 9, 0), 150_400),
        ev('review_approve', 'pending_review', 'pending_client', M, at(55, 13, 30), 150_400, 'היסודות לפי התוכנית, הברזל נבדק לפני היציקה.'),
        ev('client_approve', 'pending_client', 'approved', C, at(54, 19, 45), 150_400),
        ev('mark_paid', 'approved', 'paid', C, at(52, 10, 15), 150_400),
      ],
    }),
  ];

  // --- Site photos (generated illustrations) --------------------------------------
  const photo = (id: string, file: string, daysAgo: number, caption: string, by: string, minute: number): PhotoView => ({
    id,
    url: `/bonimos/demo/${file}.svg`,
    thumbUrl: `/bonimos/demo/${file}.svg`,
    width: 800,
    height: 600,
    caption,
    stage: 'frame',
    takenOn: day(-daysAgo),
    uploadedBy: by,
    createdAt: at(daysAgo, 16, minute),
  });
  const photos: PhotoView[] = [
    photo('demo-ph6', 'ceiling-formwork', 2, 'טפסנות ותמיכות לתקרת קומת הקרקע. לפני היציקה בודקים שכל תומכה יציבה.', M, 12),
    photo('demo-ph5', 'column-rebar', 2, 'ברזל העמודים לפני היציקה, עם כובעי בטיחות על הקוצים.', M, 10),
    photo('demo-ph4', 'concrete-cubes', 37, 'קוביות בטון מהיציקה נשלחו למעבדה לבדיקת חוזק.', M, 41),
    photo('demo-ph3', 'slab-pour', 37, 'יציקת רצפת קומת הקרקע.', M, 40),
    photo('demo-ph2', 'foundation-rebar', 62, 'ברזל ליסודות: נבדק ואושר לפני היציקה.', M, 5),
    photo('demo-ph1', 'excavation', 86, 'חפירה ליסודות לפי הסימון של המודד.', C, 30),
  ];

  // --- The activity log those events produce ---------------------------------------
  let actSeq = 0;
  const act = (kind: ActivityView['kind'], action: string, actor: string | null, createdAt: string, meta: Record<string, unknown> = {}, body: string | null = null, refId: string | null = null): ActivityView => ({
    id: `demo-a${(actSeq += 1)}`,
    kind,
    action,
    actorId: actor,
    body,
    refId,
    meta,
    createdAt,
  });
  const activity: ActivityView[] = [
    act('note', 'note.added', C, at(0, 9, 10), {}, 'אפשר לתאם סיור באתר ביום שישי בבוקר? רוצים לראות את הקומה לפני היציקה.'),
    act('note', 'note.added', M, at(2, 12, 5), {}, 'ביקור באתר: הברזל בעמודים תקין. ביקשתי מהקבלן להוסיף ספייסרים לפני היציקה ולהשלים את שני העמודים בצד המזרחי.'),
    act('photo', 'photo.uploaded', M, at(2, 16, 10), { count: 2, stage: 'frame' }),
    act('document', 'document.uploaded', M, at(3, 11, 20), { file_name: 'חשבון קבלן השלד מס׳ 4.pdf', category: 'receipt' }),
    act('document', 'document.uploaded', C, at(8, 11, 20), { file_name: 'הצעת מחיר אלומיניום ב.pdf', category: 'quote' }),
    act('document', 'document.uploaded', C, at(12, 11, 20), { file_name: 'הצעת מחיר אלומיניום א.pdf', category: 'quote' }),
    act('note', 'note.added', M, at(12, 18, 30), {}, 'שתי הצעות אלומיניום מעל התכנון. נבקש הצעה שלישית ונשווה מפרט לפני שמחליטים.'),
    act('milestone', 'milestone.started', M, at(33, 8, 0), { title: 'קומת קרקע ותקרה', stage: 'frame' }, null, 'demo-m5'),
    act('milestone', 'milestone.completed', M, at(35, 17, 0), { title: 'רצפה וקורות יסוד', stage: 'frame', slip_days: 0 }, null, 'demo-m4'),
    act('budget', 'budget.version_created', M, at(35, 16, 5), { version_no: 3, label: 'תקציב מאושר', note: versions[2].note }, null, 'demo-v3'),
    act('photo', 'photo.uploaded', M, at(37, 16, 40), { count: 2, stage: 'frame' }),
    act('milestone', 'milestone.completed', M, at(57, 17, 30), { title: 'חפירה ויסודות', stage: 'frame', slip_days: 3 }, null, 'demo-m3'),
    act('photo', 'photo.uploaded', M, at(62, 16, 5), { count: 1, stage: 'frame' }),
    act('stage', 'stage.changed', M, at(88, 7, 30), { from: 'permit', to: 'frame' }),
    act('photo', 'photo.uploaded', C, at(86, 16, 30), { count: 1, stage: 'frame', caption: 'חפירה ליסודות לפי הסימון של המודד.' }),
    act('milestone', 'milestone.completed', M, at(96, 12, 0), { title: 'היתר בנייה', stage: 'permit', slip_days: 4 }, null, 'demo-m2'),
    act('document', 'document.uploaded', M, at(96, 11, 20), { file_name: 'היתר בנייה.pdf', category: 'permit' }),
    act('milestone', 'milestone.completed', M, at(121, 15, 0), { title: 'מכרז קבלנים וחוזה', stage: 'permit', slip_days: -1 }, null, 'demo-m1'),
    act('budget', 'budget.version_created', M, at(120, 17, 40), { version_no: 2, label: 'תקציב מאושר', note: versions[1].note }, null, 'demo-v2'),
    ...milestones.map((m, i) => act('milestone', 'milestone.added', M, at(124, 10, 20 + (i % 5)), { title: m.title, stage: m.stage }, null, m.id)),
    act('team', 'team.manager_assigned', null, at(125, 9, 5), { name: managerPerson.fullName }),
    act('team', 'team.managed_started', null, at(125, 9, 0)),
  ];
  for (const p of payments) {
    for (const e of p.events) {
      activity.push(
        act('payment', `payment.${e.action}`, e.actorId, e.createdAt, {
          number: p.number,
          title: p.title,
          contractor: p.contractor,
          category: p.category,
          amount_agorot: e.amount == null ? undefined : e.amount * 100,
          to_status: e.toStatus,
          note: e.note ?? undefined,
        }, null, p.id),
      );
    }
  }
  activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const project: ManagedProjectData = {
    mode: 'demo',
    viewer: { userId: M, role: 'manager' },
    today,
    now,
    project: {
      id: BONIMOS_DEMO_IDS.project,
      title: `הבית של משפחת ${clientPerson.lastName}`,
      stage: 'frame',
      regionSlug: 'shfela',
      regionName: 'שפלה',
      sizeM2: 180,
      targetMoveIn: day(320).slice(0, 7),
      budgetRangeNis: [2_300_000, 2_500_000],
      mode: 'managed',
    },
    people,
    versions,
    budgetItems,
    milestones,
    payments,
    documents,
    photos,
    activity,
    baseline: { plan: v1Plan, total: planTotal(v1Plan), validAsOf: DEFAULT_PRICE_BOOK.validAsOf },
  };

  // --- The manager's workspace: this project and three more ---------------------------
  const others = gen.fork('others');
  const otherClients = [others.person(), others.person(), others.person()];
  const parts = projectSummaryParts({ versions, items: budgetItems, milestones, payments, today });
  const workspace: ManagerProjectSummary[] = [
    {
      id: BONIMOS_DEMO_IDS.project,
      title: project.project.title,
      clientName: clientPerson.fullName,
      regionName: 'שפלה',
      sizeM2: 180,
      stage: 'frame',
      ...parts,
      lastActivityAt: activity[0].createdAt,
    },
    {
      id: 'demo-bonimos-2',
      title: `הבית של משפחת ${otherClients[0].lastName}`,
      clientName: otherClients[0].fullName,
      regionName: 'אזור השרון',
      sizeM2: 240,
      stage: 'infrastructure',
      budget: { versionNo: 2, approved: 3_050_000, forecast: 3_012_000, variance: -38_000, variancePct: -38_000 / 3_050_000, status: 'on' },
      nextMilestone: { id: 'x2', title: 'איטום ובידוד', stage: 'infrastructure', plannedEnd: day(-2), daysLeft: -2, late: true },
      approvals: { pendingReview: 1, pendingClient: 0, approvedUnpaid: 1 },
      lastActivityAt: at(1, 17, 30),
    },
    {
      id: 'demo-bonimos-3',
      title: `הבית של משפחת ${otherClients[1].lastName}`,
      clientName: otherClients[1].fullName,
      regionName: 'מרכז',
      sizeM2: 210,
      stage: 'finishing',
      budget: { versionNo: 4, approved: 2_960_000, forecast: 2_871_000, variance: -89_000, variancePct: -89_000 / 2_960_000, status: 'under' },
      nextMilestone: { id: 'x3', title: 'מטבח, נגרות וגמר', stage: 'finishing', plannedEnd: day(19), daysLeft: 19, late: false },
      approvals: { pendingReview: 0, pendingClient: 1, approvedUnpaid: 0 },
      lastActivityAt: at(3, 9, 45),
    },
    {
      id: 'demo-bonimos-4',
      title: `הבית של משפחת ${otherClients[2].lastName}`,
      clientName: otherClients[2].fullName,
      regionName: 'אזור ירושלים',
      sizeM2: 165,
      stage: 'permit',
      budget: { versionNo: 1, approved: 2_150_000, forecast: 2_150_000, variance: 0, variancePct: null, status: 'none' },
      nextMilestone: { id: 'x4', title: 'מכרז קבלנים וחוזה', stage: 'permit', plannedEnd: day(33), daysLeft: 33, late: false },
      approvals: { pendingReview: 0, pendingClient: 0, approvedUnpaid: 0 },
      lastActivityAt: at(6, 13, 0),
    },
  ];
  workspace.sort(
    (a, b) =>
      b.approvals.pendingReview - a.approvals.pendingReview ||
      Number(Boolean(b.nextMilestone?.late)) - Number(Boolean(a.nextMilestone?.late)) ||
      (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
  );

  return { project, viewers: { manager: { userId: M, role: 'manager' }, owner: { userId: C, role: 'owner' } }, workspace, now };
});
