/**
 * revenue_business_metrics() runs regexes over every visitor's question text
 * (answer_completed.query) and every lead's project-file questions, and
 * returns counts. With caller-supplied patterns that is a counting oracle:
 * anyone who owns a business (any signed-in user can submit one) could read
 * other people's questions out, a character at a time.
 *
 *   QA_RLS_TEST=1 npx vitest run tests/qa/revenue-metrics-oracle.test.ts
 *
 * The fix: only the service role executes it; the portal and the partner
 * report call it after their own ownership / staff check, with patterns built
 * on the server.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, isForbidden, QA_STACK_ENABLED, serviceClient, signedInUser, type Db } from './stack';

const FROM = new Date(Date.now() - 30 * 86_400_000).toISOString();
const TO = new Date(Date.now() + 86_400_000).toISOString();

describe.skipIf(!QA_STACK_ENABLED)('revenue_business_metrics is not callable from the browser', () => {
  let admin: Db;
  let member: { id: string; db: Db };
  let staff: { id: string; db: Db };
  let businessId = '';

  beforeAll(async () => {
    admin = serviceClient();
    member = await signedInUser(admin, 'qa-oracle-member@bonimbait.test', 'member');
    staff = await signedInUser(admin, 'qa-oracle-staff@bonimbait.test', 'editor');
    await admin.from('businesses').delete().eq('owner_member_id', member.id);
    // Any signed-in user may submit a business (it starts pending, owned by them).
    const biz = await member.db.from('businesses').insert({ slug: `qa-oracle-${Date.now()}`, name: 'עסק לבדיקת הרשאות' }).select('id, status, owner_member_id').single();
    if (biz.error) throw biz.error;
    expect(biz.data).toMatchObject({ status: 'pending', owner_member_id: member.id });
    businessId = biz.data.id as string;
  });

  afterAll(async () => {
    if (businessId) await admin.from('businesses').delete().eq('id', businessId);
  });

  const args = () => ({ p_business_id: businessId, p_from: FROM, p_to: TO, p_patterns: ['.'] });

  it('refuses the owner of a (pending) business', async () => {
    const res = await member.db.rpc('revenue_business_metrics', args());
    expect(isForbidden(res.error)).toBe(true);
    expect(res.data).toBeNull();
  });

  it('refuses staff sessions and anonymous visitors too', async () => {
    expect(isForbidden((await staff.db.rpc('revenue_business_metrics', args())).error)).toBe(true);
    expect((await anonClient().rpc('revenue_business_metrics', args())).error).not.toBeNull();
  });

  it('still answers the service role (the portal and the report, after their own checks)', async () => {
    const res = await admin.rpc('revenue_business_metrics', args());
    expect(res.error).toBeNull();
    expect(res.data).toHaveProperty('category_questions');
  });
});

describe.skipIf(!QA_STACK_ENABLED)('revenue_peer_rank keeps small cohorts anonymous', () => {
  let admin: Db;
  let owner: { id: string; db: Db };
  let specialtyId = '';
  const created: string[] = [];
  const range = { p_from: FROM, p_to: TO };

  async function business(slug: string, status: 'pending' | 'published', ownerId: string | null): Promise<string> {
    const { data, error } = await admin
      .from('businesses')
      .insert({ slug: `${slug}-${Date.now().toString(36)}`, name: `עסק לבדיקת השוואה ${slug}`, status, owner_member_id: ownerId, primary_specialty_id: specialtyId })
      .select('id')
      .single();
    if (error) throw error;
    created.push(data.id as string);
    return data.id as string;
  }

  beforeAll(async () => {
    admin = serviceClient();
    owner = await signedInUser(admin, 'qa-peer-owner@bonimbait.test', 'pro');
    // A fresh specialty, so the cohort is exactly what this suite builds.
    const s = await admin.from('specialties').insert({ slug: `qa-peer-${Date.now().toString(36)}`, name: 'תחום לבדיקת השוואה' }).select('id').single();
    if (s.error) throw s.error;
    specialtyId = s.data.id as string;
  });

  afterAll(async () => {
    if (created.length) await admin.from('businesses').delete().in('id', created);
    if (specialtyId) await admin.from('specialties').delete().eq('id', specialtyId);
  });

  it('benchmarks nothing for a pending business (it could have picked any specialty)', async () => {
    const pending = await business('pending', 'pending', owner.id);
    await business('rival', 'published', null);
    const res = await owner.db.rpc('revenue_peer_rank', { p_business_id: pending, ...range });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ peers: 0 });
  });

  it('returns only the business\'s own numbers while fewer than 5 others share the specialty', async () => {
    const mine = await business('mine', 'published', owner.id);
    const res = await owner.db.rpc('revenue_peer_rank', { p_business_id: mine, ...range });
    expect(res.error).toBeNull();
    expect(res.data).toMatchObject({ views: 0, leads: 0 });
    for (const k of ['median_views', 'median_leads', 'view_rank', 'lead_rank']) expect(res.data).not.toHaveProperty(k);
  });

  it('adds medians and ranks once the cohort is large enough', async () => {
    const mine = created[created.length - 1];
    for (let i = 0; i < 5; i++) await business(`peer${i}`, 'published', null);
    const res = await owner.db.rpc('revenue_peer_rank', { p_business_id: mine, ...range });
    expect(res.error).toBeNull();
    expect(res.data).toHaveProperty('median_views');
    expect(res.data).toHaveProperty('view_rank');
  });
});
