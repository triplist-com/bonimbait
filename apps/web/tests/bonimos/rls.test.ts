/**
 * Bonim.Os RLS against the LOCAL Supabase stack. The matrix:
 *
 *   anonymous · client A · client B · the manager of A · a manager not assigned to A · staff
 *
 *   BONIMOS_RLS_TEST=1 npx vitest run tests/bonimos/rls.test.ts
 *
 * Opt-in (it writes to the shared local DB) and local-only: it refuses any
 * URL that isn't http://127.0.0.1:54321 or localhost. Test users live on the
 * @bonimbait.test domain with a fresh random password per run; their
 * projects, files and roster rows are removed afterwards.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENV_FILE = fileURLToPath(new URL('../../.env.local', import.meta.url));
const env: Record<string, string> = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(URL_);
const ENABLED = process.env.BONIMOS_RLS_TEST === '1' && LOCAL && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

type Db = SupabaseClient;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

const USERS = {
  a: 'bonimos-rls-a@bonimbait.test',
  b: 'bonimos-rls-b@bonimbait.test',
  mgr: 'bonimos-rls-mgr@bonimbait.test',
  other: 'bonimos-rls-mgr2@bonimbait.test',
  staff: 'bonimos-rls-staff@bonimbait.test',
} as const;
type Who = keyof typeof USERS;

// A 16x16 white JPEG (the bucket takes JPEG/WebP).
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

describe.skipIf(!ENABLED)('Bonim.Os RLS on the local stack', () => {
  let admin: Db;
  let anon: Db;
  const ids = {} as Record<Who, string>;
  const as = {} as Record<Who, Db>;
  let projectA = '';
  let projectB = '';
  let milestoneA = '';
  let requestA = '';
  let photoA = '';
  let photoPath = '';
  let managerNoteId = '';

  async function ensureUser(who: Who): Promise<void> {
    const email = USERS[who];
    const password = randomBytes(18).toString('base64url');
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    let user = list.users.find((u) => u.email === email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      user = data.user;
    } else {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
    }
    ids[who] = user.id;
    await admin.from('profiles').upsert({ id: user.id, email }, { onConflict: 'id' });
    await admin.from('profiles').update({ role: who === 'staff' ? 'editor' : 'member', full_name: `בדיקה ${who}` }).eq('id', user.id);
    const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    as[who] = client;
  }

  async function cleanup() {
    const people = Object.values(ids).filter(Boolean);
    if (!people.length) return;
    const { data: projects } = await admin.from('hub_projects').select('id').in('created_by', people);
    for (const p of projects ?? []) {
      for (const bucket of ['hub-docs', 'bonimos-photos']) {
        const { data: files } = await admin.storage.from(bucket).list(p.id, { limit: 1000 });
        if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${p.id}/${f.name}`));
      }
    }
    await admin.from('hub_projects').delete().in('created_by', people);
    await admin.from('bonimos_managers').delete().in('user_id', people);
  }

  /** A client's own hub project, created as the client (RLS), then made managed by the service. */
  async function managedProject(owner: Who, manager: Who): Promise<string> {
    const { data, error } = await as[owner].from('hub_projects').insert({ created_by: ids[owner], stage: 'frame', size_m2: 180 }).select('id, mode').single();
    if (error) throw error;
    expect(data.mode).toBe('self');
    const up = await admin.from('hub_projects').update({ mode: 'managed' }).eq('id', data.id);
    if (up.error) throw up.error;
    const m = await admin.from('hub_project_members').insert({ project_id: data.id, user_id: ids[manager], role: 'manager', added_by: ids[owner] });
    if (m.error) throw m.error;
    return data.id as string;
  }

  beforeAll(async () => {
    admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts);
    anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    for (const who of Object.keys(USERS) as Who[]) await ensureUser(who);
    await cleanup();

    const roster = await admin.from('bonimos_managers').insert([
      { user_id: ids.mgr, display_name: 'מנהלת א', title: 'מנהלת פרויקט', phone: '050-1111111' },
      { user_id: ids.other, display_name: 'מנהל ב', title: 'מפקח בנייה', phone: '050-2222222' },
    ]);
    if (roster.error) throw roster.error;
    projectA = await managedProject('a', 'mgr');
    projectB = await managedProject('b', 'other');

    // The manager works A: a milestone, an approved budget, a payment request and its review.
    const ms = await as.mgr
      .from('bonimos_milestones')
      .insert({ project_id: projectA, stage: 'frame', title: 'קומת קרקע ותקרה', planned_start: '2026-10-01', planned_end: '2026-10-27' })
      .select('id, created_by')
      .single();
    if (ms.error) throw ms.error;
    expect(ms.data.created_by).toBe(ids.mgr);
    milestoneA = ms.data.id;
    const v = await as.mgr.rpc('hub_new_budget_version', {
      p_project: projectA,
      p_label: 'תקציב מאושר',
      p_basis: 'manual',
      p_total_min: 231_500_000,
      p_total_max: 231_500_000,
      p_note: 'אחרי מכרז הקבלנים',
      p_planned: [{ category: 'frame', amount_agorot: 76_800_000 }],
    });
    if (v.error) throw v.error;
    const req = await as.mgr.rpc('bonimos_request_payment', {
      p_project: projectA,
      p_contractor: 'קבלן שלד לבדיקה',
      p_title: 'תשלום 4: עמודים וקירות',
      p_category: 'frame',
      p_amount_agorot: 9_600_000,
      p_milestone: milestoneA,
    });
    if (req.error) throw req.error;
    requestA = req.data as string;
    const review = await as.mgr.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'review_approve', p_amount_agorot: 9_000_000, p_note: 'חסרים שני עמודים' });
    if (review.error) throw review.error;
    expect(review.data).toBe('pending_client');

    // The client uploads a site photo (storage + row) and the manager writes a note.
    const id = randomUUID();
    photoPath = `${projectA}/${id}.jpg`;
    for (const path of [photoPath, `${projectA}/${id}-t.jpg`]) {
      const up = await as.a.storage.from('bonimos-photos').upload(path, new Blob([JPEG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
    }
    const ph = await as.a
      .from('bonimos_photos')
      .insert({ id, project_id: projectA, storage_path: photoPath, thumb_path: `${projectA}/${id}-t.jpg`, width: 16, height: 16, size_bytes: JPEG.length, caption: 'ברזל לפני יציקה', stage: 'frame' })
      .select('id, uploaded_by')
      .single();
    if (ph.error) throw ph.error;
    expect(ph.data.uploaded_by).toBe(ids.a);
    photoA = ph.data.id;
    const note = await as.mgr.from('bonimos_activity').insert({ project_id: projectA, body: 'ביקור באתר: הברזל תקין' }).select('id, actor_id, kind').single();
    if (note.error) throw note.error;
    expect(note.data).toMatchObject({ actor_id: ids.mgr, kind: 'note' });
    managerNoteId = note.data.id;
  }, 90_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  const TABLES = ['bonimos_milestones', 'bonimos_payment_requests', 'bonimos_payment_events', 'bonimos_photos', 'bonimos_activity'] as const;

  async function counts(client: Db, project = projectA) {
    const out: Record<string, number | string> = {};
    for (const t of TABLES) {
      const { data, error } = await client.from(t).select('*').eq('project_id', project);
      out[t] = error ? `error:${error.code ?? error.message}` : (data ?? []).length;
    }
    return out;
  }

  const denied = (c: number | string) => c === 0 || String(c).startsWith('error');

  it('anonymous: nothing at all', async () => {
    const c = await counts(anon);
    for (const t of TABLES) expect(denied(c[t]), `${t}: ${c[t]}`).toBe(true);
    const roster = await anon.from('bonimos_managers').select('*');
    expect(roster.error !== null || (roster.data ?? []).length === 0).toBe(true);
    expect((await anon.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'client_approve' })).error).not.toBeNull();
    expect((await anon.rpc('bonimos_request_payment', { p_project: projectA, p_contractor: 'x', p_title: 'xx', p_category: 'frame', p_amount_agorot: 100_000 })).error).not.toBeNull();
    expect((await anon.rpc('bonimos_project_people', { p_projects: [projectA] })).error).not.toBeNull();
    expect((await anon.storage.from('bonimos-photos').download(photoPath)).error).not.toBeNull();
  });

  it('client A: sees the whole project and approves, but never reviews or edits the log', async () => {
    const c = await counts(as.a);
    expect(c).toMatchObject({ bonimos_milestones: 1, bonimos_payment_requests: 1, bonimos_photos: 1 });
    expect(Number(c.bonimos_payment_events)).toBe(2);
    expect(Number(c.bonimos_activity)).toBeGreaterThanOrEqual(5); // assigned, milestone, budget, 2 payment events, photo, note
    // The manager's roster card is visible (shared project); the other manager's is not.
    const roster = await as.a.from('bonimos_managers').select('user_id');
    expect((roster.data ?? []).map((r) => r.user_id)).toEqual([ids.mgr]);
    const people = await as.a.rpc('bonimos_project_people', { p_projects: [projectA] });
    expect(people.error).toBeNull();
    const mgrCard = (people.data ?? []).find((p: { role: string }) => p.role === 'manager');
    expect(mgrCard).toMatchObject({ name: 'מנהלת א', title: 'מנהלת פרויקט', phone: '050-1111111', email: null });
    // Separation of duties: the client can't review, can't write milestones, can't touch the log directly.
    expect((await as.a.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'review_reject', p_note: 'x' })).error?.code).toBe('42501');
    expect((await as.a.from('bonimos_milestones').insert({ project_id: projectA, stage: 'frame', title: 'פריצה', planned_start: '2026-10-01', planned_end: '2026-10-02' })).error).not.toBeNull();
    const upd = await as.a.from('bonimos_milestones').update({ title: 'פריצה' }).eq('id', milestoneA).select('id');
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    expect((await as.a.from('bonimos_payment_requests').update({ status: 'paid' }).eq('id', requestA)).error).not.toBeNull();
    expect((await as.a.from('bonimos_payment_events').delete().eq('request_id', requestA)).error).not.toBeNull();
    expect((await as.a.from('bonimos_activity').insert({ project_id: projectA, kind: 'payment', action: 'payment.mark_paid', body: 'x' })).error).not.toBeNull();
    const del = await as.a.from('bonimos_activity').delete().eq('id', managerNoteId).select('id');
    expect(del.data ?? []).toHaveLength(0); // not their note
    // In a managed project the approved budget is the manager's to version.
    expect((await as.a.rpc('hub_new_budget_version', { p_project: projectA, p_label: 'שלי', p_basis: 'planner', p_total_min: 1, p_total_max: 2 })).error?.code).toBe('42501');
    // The client approves the reviewed amount and marks it paid: a budget actual appears.
    const ok = await as.a.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'client_approve' });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe('approved');
    const paid = await as.a.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'mark_paid' });
    expect(paid.data).toBe('paid');
    const { data: actual } = await as.a.from('hub_budget_items').select('kind, amount_agorot, created_by').eq('project_id', projectA).eq('kind', 'actual');
    expect(actual).toEqual([{ kind: 'actual', amount_agorot: 9_000_000, created_by: ids.a }]);
    expect((await as.a.storage.from('bonimos-photos').download(photoPath)).error).toBeNull();
  });

  it('client B: sees nothing of A and cannot act on it', async () => {
    const c = await counts(as.b);
    for (const t of TABLES) expect(c[t], t).toBe(0);
    expect((await as.b.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'cancel' })).error?.code).toBe('42501');
    expect((await as.b.rpc('bonimos_request_payment', { p_project: projectA, p_contractor: 'קבלן', p_title: 'פריצה', p_category: 'frame', p_amount_agorot: 100_000 })).error?.code).toBe('42501');
    expect(((await as.b.rpc('bonimos_project_people', { p_projects: [projectA] })).data ?? []).length).toBe(0);
    expect((await as.b.storage.from('bonimos-photos').download(photoPath)).error).not.toBeNull();
    const intrude = await as.b.storage
      .from('bonimos-photos')
      .upload(`${projectA}/${randomUUID()}.jpg`, new Blob([JPEG], { type: 'image/jpeg' }), { contentType: 'image/jpeg' });
    expect(intrude.error).not.toBeNull();
    expect((await as.b.from('bonimos_activity').insert({ project_id: projectA, body: 'פריצה' })).error).not.toBeNull();
    const roster = await as.b.from('bonimos_managers').select('user_id');
    expect((roster.data ?? []).map((r) => r.user_id)).toEqual([ids.other]); // only B's own manager
  });

  it('the manager of A: works the project, but never approves for the client or adds members', async () => {
    const c = await counts(as.mgr);
    expect(c).toMatchObject({ bonimos_milestones: 1, bonimos_payment_requests: 1, bonimos_photos: 1 });
    const people = await as.mgr.rpc('bonimos_project_people', { p_projects: [projectA] });
    const client = (people.data ?? []).find((p: { role: string }) => p.role === 'owner');
    expect(client?.email).toBe(USERS.a);
    // A second request: the manager reviews it, but the client's step is the client's.
    const req = await as.mgr.rpc('bonimos_request_payment', { p_project: projectA, p_contractor: 'חשמלאי', p_title: 'צנרת בתקרה', p_category: 'systems', p_amount_agorot: 1_450_000 });
    expect(req.error).toBeNull();
    const second = req.data as string;
    expect((await as.mgr.rpc('bonimos_payment_transition', { p_request: second, p_action: 'review_approve', p_amount_agorot: 2_000_000 })).error?.code).toBe('22023');
    expect((await as.mgr.rpc('bonimos_payment_transition', { p_request: second, p_action: 'review_approve' })).data).toBe('pending_client');
    expect((await as.mgr.rpc('bonimos_payment_transition', { p_request: second, p_action: 'client_approve' })).error?.code).toBe('42501');
    expect((await as.mgr.rpc('bonimos_payment_transition', { p_request: second, p_action: 'cancel', p_note: 'הקבלן ביטל' })).data).toBe('cancelled');
    const { data: events } = await as.mgr.from('bonimos_payment_events').select('action, actor_role').eq('request_id', second).order('created_at');
    expect((events ?? []).map((e) => `${e.action}:${e.actor_role}`)).toEqual(['requested:manager', 'review_approve:manager', 'cancel:manager']);
    // Milestones are the manager's to write; the schedule moves.
    const done = await as.mgr.from('bonimos_milestones').update({ actual_start: '2026-10-02', actual_end: '2026-10-14' }).eq('id', milestoneA).select('updated_by');
    expect(done.data?.[0]?.updated_by).toBe(ids.mgr);
    // The manager versions the approved budget, but can't change the mode or the team.
    expect((await as.mgr.from('hub_projects').update({ mode: 'self' }).eq('id', projectA)).error).not.toBeNull();
    expect((await as.mgr.from('hub_project_members').insert({ project_id: projectA, user_id: ids.other, role: 'manager' })).error).not.toBeNull();
    expect((await as.mgr.from('bonimos_managers').update({ title: 'מנכ״לית' }).eq('user_id', ids.mgr)).error).not.toBeNull();
    // A manager may take down a client's photo; the trigger logged the work.
    const del = await as.mgr.from('bonimos_photos').delete().eq('id', photoA).select('id');
    expect(del.data ?? []).toHaveLength(1);
    const { data: log } = await as.mgr.from('bonimos_activity').select('action').eq('project_id', projectA);
    const actions = new Set((log ?? []).map((l) => l.action));
    for (const a of ['team.manager_assigned', 'milestone.added', 'milestone.completed', 'budget.version_created', 'payment.requested', 'payment.client_approve', 'payment.mark_paid', 'photo.uploaded', 'note.added']) {
      expect(actions.has(a), a).toBe(true);
    }
  });

  it('a manager not assigned to A: sees nothing of A (only their own client)', async () => {
    const c = await counts(as.other);
    for (const t of TABLES) expect(c[t], t).toBe(0);
    expect((await as.other.from('hub_projects').select('id').eq('id', projectA)).data ?? []).toHaveLength(0);
    expect((await as.other.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'cancel' })).error?.code).toBe('42501');
    expect((await as.other.from('bonimos_milestones').insert({ project_id: projectA, stage: 'frame', title: 'פריצה', planned_start: '2026-10-01', planned_end: '2026-10-02' })).error).not.toBeNull();
    expect(((await as.other.rpc('bonimos_project_people', { p_projects: [projectA] })).data ?? []).length).toBe(0);
    expect((await as.other.storage.from('bonimos-photos').list(projectA)).data ?? []).toHaveLength(0);
    // Their own assignment still works.
    expect((await as.other.from('hub_projects').select('id').eq('id', projectB)).data ?? []).toHaveLength(1);
    expect(Number((await counts(as.other, projectB)).bonimos_activity)).toBeGreaterThanOrEqual(1);
  });

  it('staff (an editor): no Bonim.Os rows, no files, no roster', async () => {
    const c = await counts(as.staff);
    for (const t of TABLES) expect(c[t], t).toBe(0);
    expect((await as.staff.from('bonimos_managers').select('user_id')).data ?? []).toHaveLength(0);
    expect((await as.staff.rpc('bonimos_payment_transition', { p_request: requestA, p_action: 'cancel' })).error?.code).toBe('42501');
    expect(((await as.staff.rpc('bonimos_project_people', { p_projects: [projectA] })).data ?? []).length).toBe(0);
    expect((await as.staff.storage.from('bonimos-photos').list(projectA)).data ?? []).toHaveLength(0);
    // The hub's aggregates stay the staff view, and they count managed projects.
    const agg = await as.staff.rpc('hub_staff_aggregates', { p_days: 30 });
    expect(agg.error).toBeNull();
    expect(agg.data.managed).toBeGreaterThanOrEqual(2);
  });
});
