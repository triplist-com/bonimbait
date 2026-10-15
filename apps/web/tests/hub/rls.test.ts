/**
 * Builder Hub RLS against the LOCAL Supabase stack: anonymous, member A,
 * member B, a manager of A's project, and staff (an editor).
 *
 *   HUB_RLS_TEST=1 npx vitest run tests/hub/rls.test.ts
 *
 * Opt-in (it writes to the shared local DB) and local-only: it refuses any
 * URL that isn't http://127.0.0.1:54321 or localhost. Test users live on the
 * @bonimbait.test domain with a fresh random password per run; their hub
 * data, leads and files are removed afterwards.
 */
import { randomBytes } from 'node:crypto';
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
const ENABLED = process.env.HUB_RLS_TEST === '1' && LOCAL && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

type Db = SupabaseClient;
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

const USERS = {
  a: 'hub-rls-a@bonimbait.test',
  b: 'hub-rls-b@bonimbait.test',
  manager: 'hub-rls-manager@bonimbait.test',
  staff: 'hub-rls-staff@bonimbait.test',
} as const;
type Who = keyof typeof USERS;

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x45, 0x4f, 0x46]); // "%PDF-1.4\n%EOF"

describe.skipIf(!ENABLED)('hub RLS on the local stack', () => {
  let admin: Db;
  const ids = {} as Record<Who, string>;
  const as = {} as Record<Who, Db>;
  let anon: Db;
  let projectA = '';
  let docPath = '';
  const leadIds: string[] = [];

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
    await admin.from('profiles').update({ role: who === 'staff' ? 'editor' : 'member' }).eq('id', user.id);
    const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    as[who] = client;
  }

  async function cleanup() {
    const owners = Object.values(ids).filter(Boolean);
    if (!owners.length) return;
    const { data: projects } = await admin.from('hub_projects').select('id').in('created_by', owners);
    for (const p of projects ?? []) {
      const { data: files } = await admin.storage.from('hub-docs').list(p.id);
      if (files?.length) await admin.storage.from('hub-docs').remove(files.map((f) => `${p.id}/${f.name}`));
    }
    await admin.from('hub_projects').delete().in('created_by', owners);
    if (leadIds.length) await admin.from('leads').delete().in('id', leadIds);
  }

  beforeAll(async () => {
    admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, opts);
    anon = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
    for (const who of Object.keys(USERS) as Who[]) await ensureUser(who);
    await cleanup();

    // Member A builds a project the way the app does (as A, under RLS).
    const { data: project, error } = await as.a
      .from('hub_projects')
      .insert({ created_by: ids.b, mode: 'managed', stage: 'permit', size_m2: 220, budget_min_agorot: 240_000_000, budget_max_agorot: 260_000_000 })
      .select('id, created_by, mode')
      .single();
    if (error) throw error;
    projectA = project.id;
    expect(project.created_by).toBe(ids.a); // spoofed creator forced back to A
    expect(project.mode).toBe('self'); // members can't self-declare managed mode

    const v = await as.a.rpc('hub_new_budget_version', {
      p_project: projectA,
      p_label: 'הערכה ראשונית',
      p_basis: 'calculator',
      p_total_min: 264_000_000,
      p_total_max: 308_000_000,
      p_planned: [{ category: 'frame', amount_agorot: 88_700_000 }],
    });
    if (v.error) throw v.error;
    for (const [table, row] of [
      ['hub_checklist_state', { project_id: projectA, item_id: 'permit.fees', done: true }],
      ['hub_budget_items', { project_id: projectA, kind: 'quote', category: 'frame', amount_agorot: 81_200_000, status: 'open' }],
      ['hub_saved_items', { project_id: projectA, kind: 'video', ref: 'ethKoDXkxR8', title: 'קבלן מפתח או מפקח' }],
      ['hub_tasks', { project_id: projectA, title: 'לשלוח כתב כמויות' }],
    ] as const) {
      const { error: e } = await as.a.from(table).insert(row);
      if (e) throw new Error(`${table}: ${e.message}`);
    }
    docPath = `${projectA}/${crypto.randomUUID()}.pdf`;
    const up = await as.a.storage.from('hub-docs').upload(docPath, new Blob([PDF], { type: 'application/pdf' }), { contentType: 'application/pdf' });
    if (up.error) throw up.error;
    const doc = await as.a.from('hub_documents').insert({
      project_id: projectA,
      storage_path: docPath,
      file_name: 'תוכנית הגשה.pdf',
      mime_type: 'application/pdf',
      size_bytes: PDF.length,
      category: 'plans',
    });
    if (doc.error) throw doc.error;

    // P7: the service assigns a manager to A's project.
    const m = await admin.from('hub_project_members').insert({ project_id: projectA, user_id: ids.manager, role: 'manager', added_by: ids.a });
    if (m.error) throw m.error;

    // Contact history: one lead each for A and B.
    const { data: leads, error: leadError } = await admin
      .from('leads')
      .insert([
        { type: 'consultation', member_id: ids.a, full_name: 'בדיקת RLS', payload: {} },
        { type: 'consultation', member_id: ids.b, full_name: 'בדיקת RLS', payload: {} },
      ])
      .select('id');
    if (leadError) throw leadError;
    leadIds.push(...(leads ?? []).map((l) => l.id));
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  const tables = ['hub_projects', 'hub_project_members', 'hub_checklist_state', 'hub_budget_versions', 'hub_budget_items', 'hub_saved_items', 'hub_documents', 'hub_tasks'];

  async function counts(client: Db) {
    const out: Record<string, number | string> = {};
    for (const t of tables) {
      const { data, error } = await client.from(t).select('*').eq(t === 'hub_projects' ? 'id' : 'project_id', projectA);
      out[t] = error ? `error:${error.code ?? error.message}` : (data ?? []).length;
    }
    return out;
  }

  it('anonymous visitors get nothing: no rows, no writes, no files, no aggregates', async () => {
    const c = await counts(anon);
    for (const t of tables) expect(c[t] === 0 || String(c[t]).startsWith('error'), `${t}: ${c[t]}`).toBe(true);
    const insert = await anon.from('hub_projects').insert({ created_by: ids.a });
    expect(insert.error).not.toBeNull();
    expect((await anon.rpc('hub_staff_aggregates', {})).error).not.toBeNull();
    expect((await anon.storage.from('hub-docs').download(docPath)).error).not.toBeNull();
  });

  it('member A sees and edits their own project', async () => {
    const c = await counts(as.a);
    expect(c).toMatchObject({ hub_projects: 1, hub_project_members: 2, hub_checklist_state: 1, hub_budget_versions: 1, hub_budget_items: 2, hub_saved_items: 1, hub_documents: 1, hub_tasks: 1 });
    const upd = await as.a.from('hub_projects').update({ stage: 'frame' }).eq('id', projectA).select('stage');
    expect(upd.data?.[0]?.stage).toBe('frame');
    expect((await as.a.from('hub_projects').update({ mode: 'managed' }).eq('id', projectA)).error).not.toBeNull();
    const file = await as.a.storage.from('hub-docs').download(docPath);
    expect(file.error).toBeNull();
    const contacts = await as.a.rpc('hub_my_contacts', { p_limit: 20 });
    expect(contacts.error).toBeNull();
    expect((contacts.data ?? []).filter((r: { lead_type: string }) => r.lead_type === 'consultation').length).toBeGreaterThanOrEqual(1);
    expect((await as.a.rpc('hub_staff_aggregates', {})).error?.code).toBe('42501');
  });

  it('member B (and an unassigned manager) sees nothing of A and cannot write into it', async () => {
    const c = await counts(as.b);
    for (const t of tables) expect(c[t], t).toBe(0);
    const upd = await as.b.from('hub_projects').update({ stage: 'finishing' }).eq('id', projectA).select('id');
    expect(upd.data ?? []).toHaveLength(0);
    expect((await as.b.from('hub_tasks').insert({ project_id: projectA, title: 'פריצה' })).error).not.toBeNull();
    expect((await as.b.from('hub_saved_items').insert({ project_id: projectA, kind: 'post', ref: 'x' })).error).not.toBeNull();
    const del = await as.b.from('hub_budget_items').delete().eq('project_id', projectA).select('id');
    expect(del.data ?? []).toHaveLength(0);
    expect((await as.b.storage.from('hub-docs').download(docPath)).error).not.toBeNull();
    const intrude = await as.b.storage
      .from('hub-docs')
      .upload(`${projectA}/${crypto.randomUUID()}.pdf`, new Blob([PDF], { type: 'application/pdf' }), { contentType: 'application/pdf' });
    expect(intrude.error).not.toBeNull();
    // B's own contact history holds B's lead only.
    const contacts = await as.b.rpc('hub_my_contacts', { p_limit: 50 });
    expect((contacts.data ?? []).length).toBe(1);
    // Members can't grant themselves access.
    expect((await as.b.from('hub_project_members').insert({ project_id: projectA, user_id: ids.b, role: 'manager' })).error).not.toBeNull();
  });

  it('the assigned manager works the project but cannot delete it, change its mode or add members', async () => {
    const c = await counts(as.manager);
    expect(c).toMatchObject({ hub_projects: 1, hub_budget_items: 2, hub_documents: 1, hub_tasks: 1 });
    const task = await as.manager.from('hub_tasks').insert({ project_id: projectA, title: 'סיור פיקוח לפני יציקה' }).select('created_by').single();
    expect(task.error).toBeNull();
    expect(task.data?.created_by).toBe(ids.manager);
    expect((await as.manager.storage.from('hub-docs').download(docPath)).error).toBeNull();
    const del = await as.manager.from('hub_projects').delete().eq('id', projectA).select('id');
    expect(del.data ?? []).toHaveLength(0);
    expect((await as.manager.from('hub_projects').update({ mode: 'self' }).eq('id', projectA).select('id')).error).toBeNull();
    expect((await as.manager.from('hub_projects').update({ mode: 'managed' }).eq('id', projectA)).error).not.toBeNull();
    expect((await as.manager.from('hub_project_members').insert({ project_id: projectA, user_id: ids.b, role: 'manager' })).error).not.toBeNull();
  });

  it('staff get aggregates only: no rows and no documents', async () => {
    const c = await counts(as.staff);
    for (const t of tables) expect(c[t], t).toBe(0);
    expect((await as.staff.storage.from('hub-docs').download(docPath)).error).not.toBeNull();
    const agg = await as.staff.rpc('hub_staff_aggregates', { p_days: 30 });
    expect(agg.error).toBeNull();
    expect(agg.data.projects).toBeGreaterThanOrEqual(1);
    expect(agg.data.by_stage).toHaveLength(8);
    expect(JSON.stringify(agg.data)).not.toContain(projectA);
  });
});
