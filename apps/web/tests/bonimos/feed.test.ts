/**
 * The site-photo feed, the activity log lines and the row -> view mappers.
 */
import { describe, expect, it } from 'vitest';
import { activityLines, describeActivity } from '@/lib/bonimos/activity';
import { budgetItemViews, paymentViews, projectSummaryParts, versionPlans } from '@/lib/bonimos/mappers';
import { checkPhotoSource, fitWithin, groupPhotos, photosInLastWeek } from '@/lib/bonimos/photos';
import type { HubBudgetItemRow, HubBudgetVersionRow } from '@/lib/hub/types';
import type { ActivityView, BonimosPaymentEventRow, BonimosPaymentRequestRow, PersonView, PhotoView } from '@/lib/bonimos/types';

const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');

describe('site photos', () => {
  it('fits the long edge without upscaling', () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032, 480)).toEqual({ width: 360, height: 480 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 600, 1600)).toEqual({ width: 0, height: 0 });
  });

  const photo = (id: string, takenOn: string, stage: PhotoView['stage'], createdAt: string): PhotoView => ({
    id,
    url: `/x/${id}.jpg`,
    thumbUrl: `/x/${id}-t.jpg`,
    width: 1600,
    height: 1200,
    caption: null,
    stage,
    takenOn,
    uploadedBy: 'm',
    createdAt,
  });

  it('groups by the day on site (newest first) with that day\'s stages', () => {
    const groups = groupPhotos([
      photo('a', '2026-10-02', 'frame', '2026-10-02T08:00:00Z'),
      photo('b', '2026-10-13', 'infrastructure', '2026-10-13T08:00:00Z'),
      photo('c', '2026-10-13', 'frame', '2026-10-13T09:00:00Z'),
    ]);
    expect(groups.map((g) => [g.date, g.stages, g.photos.map((p) => p.id)])).toEqual([
      ['2026-10-13', ['frame', 'infrastructure'], ['c', 'b']],
      ['2026-10-02', ['frame'], ['a']],
    ]);
    expect(photosInLastWeek([{ takenOn: '2026-10-09' }, { takenOn: '2026-10-08' }, { takenOn: '2026-10-15' }, { takenOn: '2026-10-16' }], '2026-10-15')).toBe(2);
  });

  it('accepts images only, up to 40 MB', () => {
    expect(checkPhotoSource({ type: 'image/jpeg', size: 5_000_000, name: 'IMG_1.jpg' })).toBeNull();
    expect(checkPhotoSource({ type: '', size: 5_000_000, name: 'IMG_2.HEIC' })).toBeNull();
    expect(checkPhotoSource({ type: 'application/pdf', size: 5_000, name: 'x.pdf' })).toMatch(/רק תמונות/);
    expect(checkPhotoSource({ type: 'image/png', size: 0, name: 'x.png' })).toMatch(/ריק/);
    expect(checkPhotoSource({ type: 'image/png', size: 41 * 1024 * 1024, name: 'x.png' })).toMatch(/40MB/);
  });
});

describe('the activity log', () => {
  const people: PersonView[] = [
    { userId: 'm', role: 'manager', name: 'נועה ברק', title: 'מנהלת פרויקט', phone: null, email: null },
    { userId: 'c', role: 'owner', name: 'רון אלון', title: null, phone: null, email: null },
  ];
  const a = (id: string, action: string, at: string, over: Partial<ActivityView> = {}): ActivityView => ({
    id,
    kind: action.split('.')[0] as ActivityView['kind'],
    action,
    actorId: 'm',
    body: null,
    refId: null,
    meta: {},
    createdAt: at,
    ...over,
  });

  it('says each event in neutral Hebrew', () => {
    expect(strip(describeActivity({ action: 'payment.requested', body: null, meta: { number: 3, contractor: 'קבלן שלד', amount_agorot: 9_600_000, title: 'תשלום 3' } }).text)).toBe(
      'נרשמה בקשת תשלום #3 של קבלן שלד: 96,000 ₪',
    );
    expect(strip(describeActivity({ action: 'payment.review_approve', body: null, meta: { number: 3, amount_agorot: 9_000_000, note: 'חסרים 2 עמודים' } }).text)).toBe(
      'בקשה #3 נבדקה ועברה לאישור הלקוח (90,000 ₪)',
    );
    expect(describeActivity({ action: 'payment.review_approve', body: null, meta: { number: 3, note: 'חסרים 2 עמודים' } }).detail).toBe('חסרים 2 עמודים');
    expect(describeActivity({ action: 'milestone.completed', body: null, meta: { title: 'רצפה', slip_days: 3 } })).toEqual({
      text: 'הושלמה אבן דרך: רצפה',
      detail: 'באיחור של 3 ימים',
    });
    expect(describeActivity({ action: 'milestone.completed', body: null, meta: { title: 'רצפה', slip_days: 0 } }).detail).toBe('בדיוק בזמן');
    expect(describeActivity({ action: 'photo.uploaded', body: null, meta: { count: 4, stage: 'frame' } }).text).toBe('4 תמונות חדשות מהשטח · שלד');
    expect(describeActivity({ action: 'budget.version_created', body: null, meta: { label: 'תקציב מאושר', version_no: 2, note: 'אחרי המכרז' } })).toEqual({
      text: 'תקציב מאושר · גרסה 2',
      detail: 'אחרי המכרז',
    });
    expect(describeActivity({ action: 'stage.changed', body: null, meta: { from: 'permit', to: 'frame' } }).text).toBe('הפרויקט עבר לשלב שלד');
    expect(describeActivity({ action: 'team.manager_assigned', body: null, meta: { name: 'נועה ברק' } }).text).toBe('נועה ברק מלווה את הפרויקט');
    expect(describeActivity({ action: 'note.added', body: 'שאלה על הברזל', meta: {} }).text).toBe('שאלה על הברזל');
  });

  it('folds a burst from one person into one line, newest first', () => {
    const lines = activityLines(
      [
        a('n1', 'note.added', '2026-10-15T09:00:00Z', { actorId: 'c', body: 'מתי יוצקים?' }),
        ...Array.from({ length: 5 }, (_, i) => a(`m${i}`, 'milestone.added', `2026-10-14T08:0${i}:00Z`, { meta: { title: `אבן ${i}` } })),
        a('t', 'team.manager_assigned', '2026-10-13T08:00:00Z', { actorId: null, meta: { name: 'נועה ברק' } }),
      ],
      people,
      'c',
    );
    expect(lines.map((l) => [l.id, l.count, l.text])).toEqual([
      ['n1', 1, 'מתי יוצקים?'],
      ['m4', 5, 'נוספו 5 אבני דרך ללוח הזמנים'],
      ['t', 1, 'נועה ברק מלווה את הפרויקט'],
    ]);
    expect(lines[0]).toMatchObject({ actorName: 'רון אלון', actorRole: 'owner', deletable: true });
    expect(lines[1]).toMatchObject({ actorName: 'נועה ברק', actorRole: 'manager', deletable: false });
    expect(lines[2].actorName).toBe('צוות בונים בית');
  });
});

describe('row -> view mappers', () => {
  const version = (id: string, no: number, current: boolean): HubBudgetVersionRow => ({
    id,
    project_id: 'p',
    version_no: no,
    label: no === 1 ? 'הערכה ראשונית' : 'תקציב מאושר',
    basis: no === 1 ? 'planner' : 'manual',
    total_min_agorot: 200_000_000,
    total_max_agorot: 260_000_000,
    inputs: {},
    note: null,
    is_current: current,
    created_by: 'm',
    created_at: `2026-0${no}-01T00:00:00Z`,
  });
  const item = (id: string, over: Partial<HubBudgetItemRow>): HubBudgetItemRow => ({
    id,
    project_id: 'p',
    version_id: null,
    kind: 'actual',
    category: 'frame',
    label: null,
    amount_agorot: 10_000_000,
    vendor: null,
    business_id: null,
    status: 'paid',
    occurred_on: '2026-10-01',
    note: null,
    created_by: 'm',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  });
  const items = [
    item('pl1', { kind: 'planned', version_id: 'v1', category: 'frame', amount_agorot: 72_500_000, status: null }),
    item('pl2', { kind: 'planned', version_id: 'v2', category: 'frame', amount_agorot: 76_800_000, status: null }),
    item('pl3', { kind: 'planned', version_id: 'v2', category: 'systems', amount_agorot: 22_800_000, status: null }),
    item('q1', { kind: 'quote', category: 'frame', amount_agorot: 79_200_000, status: 'accepted', occurred_on: '2026-08-01' }),
    item('a1', { kind: 'actual', category: 'frame', amount_agorot: 15_000_000 }),
  ];

  it('builds each version\'s plan in whole shekels, oldest first', () => {
    const plans = versionPlans([version('v2', 2, true), version('v1', 1, false)], items);
    expect(plans.map((p) => [p.versionNo, p.planned, p.isCurrent])).toEqual([
      [1, { frame: 725_000 }, false],
      [2, { frame: 768_000, systems: 228_000 }, true],
    ]);
    expect(plans[0]).toMatchObject({ totalMin: 2_000_000, totalMax: 2_600_000 });
  });

  it('keeps quotes and actuals (newest first), never the planned lines', () => {
    expect(budgetItemViews(items).map((i) => [i.id, i.amount])).toEqual([
      ['a1', 150_000],
      ['q1', 792_000],
    ]);
  });

  it('attaches audit events (oldest first) and the attachment to each request', () => {
    const req = (id: string, number: number): BonimosPaymentRequestRow => ({
      id,
      project_id: 'p',
      number,
      contractor: 'קבלן',
      title: `תשלום ${number}`,
      category: 'frame',
      stage: 'frame',
      milestone_id: null,
      attachment_id: number === 2 ? 'd1' : null,
      requested_agorot: 9_600_000,
      approved_agorot: number === 2 ? 9_000_000 : null,
      status: number === 2 ? 'pending_client' : 'paid',
      due_on: null,
      paid_on: number === 2 ? null : '2026-09-01',
      budget_item_id: null,
      note: null,
      created_by: 'm',
      created_at: `2026-0${number + 7}-01T00:00:00Z`,
      updated_at: `2026-0${number + 7}-01T00:00:00Z`,
    });
    const ev = (id: string, request: string, action: BonimosPaymentEventRow['action'], at: string): BonimosPaymentEventRow => ({
      id,
      request_id: request,
      project_id: 'p',
      action,
      from_status: null,
      to_status: 'pending_review',
      actor_id: 'm',
      actor_role: 'manager',
      amount_agorot: 9_000_000,
      note: null,
      created_at: at,
    });
    const views = paymentViews(
      [req('r1', 1), req('r2', 2)],
      [ev('e2', 'r2', 'review_approve', '2026-10-02T00:00:00Z'), ev('e1', 'r2', 'requested', '2026-10-01T00:00:00Z')],
      [{ id: 'd1', file_name: 'חשבון 2.pdf', mime_type: 'application/pdf' }],
    );
    expect(views.map((v) => v.number)).toEqual([2, 1]);
    expect(views[0]).toMatchObject({ requested: 96_000, approved: 90_000, attachment: { id: 'd1', fileName: 'חשבון 2.pdf' } });
    expect(views[0].events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(views[1]).toMatchObject({ attachment: null, approved: null, events: [] });
  });

  it('summarises a project for the manager\'s list', () => {
    const parts = projectSummaryParts({
      versions: versionPlans([version('v2', 2, true), version('v1', 1, false)], items),
      items: budgetItemViews(items),
      milestones: [
        { id: 'x', stage: 'frame', title: 'תקרה', plannedStart: '2026-10-01', plannedEnd: '2026-10-27', actualStart: '2026-10-03', actualEnd: null, note: null, sortOrder: 1 },
      ],
      payments: [{ status: 'pending_client' }, { status: 'pending_review' }, { status: 'paid' }],
      today: '2026-10-15',
    });
    expect(parts.budget).toMatchObject({ versionNo: 2, approved: 996_000, forecast: 1_020_000, variance: 24_000, status: 'over' });
    expect(parts.nextMilestone).toMatchObject({ id: 'x', daysLeft: 12, late: false });
    expect(parts.approvals).toEqual({ pendingReview: 1, pendingClient: 1, approvedUnpaid: 0 });
  });
});
