/**
 * E2E global setup (local stack only):
 * 1. Reset the DB rate-limit counters the suite would trip from one IP.
 * 2. Remove leftovers of earlier runs (leads, signups).
 * 3. Ensure the fixture accounts (fresh random passwords every run, never
 *    stored) and their data: a pro's business, a partner's business with an
 *    active tier and a live campaign, and a client's managed project with a
 *    project manager.
 * 4. Sign each role in once through the real /login/ page and keep its
 *    storage state in e2e/.auth/ (gitignored), so the specs never hit the
 *    auth rate limit (30 sign-ins per 5 minutes per IP).
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type FullConfig } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertLocalStack, serviceDb } from './helpers/env';
import { AUTH_DIR, RUN_FILE, ROLES, storageStatePath, type Role, type RunState } from './helpers/state';
import { cleanE2eData } from './helpers/cleanup';

type Account = { id: string; email: string; password: string };

const ACCOUNTS: Record<Role, { email: string; role: 'member' | 'pro' | 'admin'; name: string }> = {
  admin: { email: 'e2e-admin@bonimbait.test', role: 'admin', name: 'מנהלת אתר לבדיקות' },
  pro: { email: 'e2e-pro@bonimbait.test', role: 'pro', name: 'בעל מקצוע לבדיקות' },
  partner: { email: 'e2e-partner@bonimbait.test', role: 'pro', name: 'שותף לבדיקות' },
  manager: { email: 'e2e-manager@bonimbait.test', role: 'member', name: 'מנהלת פרויקט לבדיקות' },
  client: { email: 'e2e-client@bonimbait.test', role: 'member', name: 'לקוח ליווי לבדיקות' },
};

async function ensureAccount(db: SupabaseClient, role: Role): Promise<Account> {
  const spec = ACCOUNTS[role];
  const password = randomBytes(18).toString('base64url');
  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u) => u.email === spec.email);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: spec.email, password, email_confirm: true, user_metadata: { full_name: spec.name } });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await db.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
  }
  await db.from('profiles').upsert({ id: user.id, email: spec.email }, { onConflict: 'id' });
  const { error } = await db.from('profiles').update({ role: spec.role, full_name: spec.name }).eq('id', user.id);
  if (error) throw error;
  return { id: user.id, email: spec.email, password };
}

async function ensureBusiness(db: SupabaseClient, slug: string, name: string, ownerId: string): Promise<{ id: string; slug: string; name: string }> {
  const { data: existing } = await db.from('businesses').select('id').eq('slug', slug).maybeSingle();
  if (existing) {
    const { error } = await db.from('businesses').update({ name, status: 'published', owner_member_id: ownerId }).eq('id', existing.id);
    if (error) throw error;
    return { id: existing.id as string, slug, name };
  }
  const { data, error } = await db.from('businesses').insert({ slug, name, status: 'published', owner_member_id: ownerId }).select('id').single();
  if (error) throw error;
  return { id: data.id as string, slug, name };
}

async function ensureManagedProject(db: SupabaseClient, clientId: string, managerId: string): Promise<string> {
  const { data: roster, error: rosterError } = await db
    .from('bonimos_managers')
    .upsert({ user_id: managerId, display_name: ACCOUNTS.manager.name, title: 'מנהלת פרויקט', phone: '050-0000000', active: true }, { onConflict: 'user_id' })
    .select('user_id');
  if (rosterError || !roster) throw rosterError ?? new Error('roster');
  const { data: existing } = await db.from('hub_projects').select('id').eq('created_by', clientId).eq('status', 'active').limit(1).maybeSingle();
  let projectId = (existing?.id as string | undefined) ?? '';
  if (!projectId) {
    const { data, error } = await db
      .from('hub_projects')
      .insert({ created_by: clientId, title: 'הבית בשפלה (בדיקות)', stage: 'frame', size_m2: 180, onboarded_at: new Date().toISOString(), source: 'bonimos' })
      .select('id')
      .single();
    if (error) throw error;
    projectId = data.id as string;
  }
  const { error: modeError } = await db.from('hub_projects').update({ mode: 'managed' }).eq('id', projectId);
  if (modeError) throw modeError;
  const { error: memberError } = await db
    .from('hub_project_members')
    .upsert({ project_id: projectId, user_id: managerId, role: 'manager', added_by: clientId }, { onConflict: 'project_id,user_id', ignoreDuplicates: true });
  if (memberError) throw memberError;
  return projectId;
}

async function signIn(baseURL: string, account: Account, out: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL, locale: 'he-IL' });
    const page = await context.newPage();
    await page.goto('/login/?next=%2Faccount%2F');
    await page.getByLabel('אימייל').fill(account.email);
    await page.getByLabel('סיסמה').fill(account.password);
    await page.getByRole('button', { name: 'התחברות' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
    await context.storageState({ path: out });
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  assertLocalStack();
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3121';
  const ping = await fetch(baseURL).catch(() => null);
  if (!ping || ping.status >= 500) throw new Error(`The app isn't answering on ${baseURL}. Build and start it first (see e2e/README section in docs/platform/QA_REPORT.md).`);

  const db = serviceDb();
  // Counters the suite trips from one IP: lead/booking/quote/share/answer limits (local only).
  for (const prefix of ['consult_booked:', 'quote:', 'form:', 'ai_answer:']) {
    await db.from('rate_limits').delete().like('key', `${prefix}%`);
  }
  await cleanE2eData(db);

  const accounts = {} as Record<Role, Account>;
  for (const role of ROLES) accounts[role] = await ensureAccount(db, role);

  const proBusiness = await ensureBusiness(db, 'e2e-pro-shell', 'שלד לבדיקות בע״מ', accounts.pro.id);
  // A fresh start for the upsell: no live or pending tier on the pro's business.
  await db.from('partner_subscriptions').delete().eq('business_id', proBusiness.id);

  const partnerBusiness = await ensureBusiness(db, 'e2e-partner-windows', 'חלונות לבדיקות', accounts.partner.id);
  const { data: tier } = await db.from('partner_tiers').select('id, price_agorot').eq('slug', 'partners').single();
  if (!tier) throw new Error('partner tier "partners" is missing (seeded by 20261014122100_revenue_partners.sql)');
  const { data: live } = await db.from('partner_subscriptions').select('id').eq('business_id', partnerBusiness.id).eq('status', 'active').maybeSingle();
  if (!live) {
    const { error } = await db.from('partner_subscriptions').insert({ business_id: partnerBusiness.id, tier_id: tier.id, status: 'active', price_agorot: tier.price_agorot });
    if (error) throw error;
  }
  const { data: campaign } = await db.from('partner_campaigns').select('id').eq('business_id', partnerBusiness.id).maybeSingle();
  if (!campaign) {
    const { error } = await db.from('partner_campaigns').insert({
      business_id: partnerBusiness.id,
      name: 'קמפיין חלונות לבדיקות',
      status: 'active',
      topics: ['windows'],
      headline: 'חלונות לבית פרטי (בדיקות)',
      target_url: `/business/${partnerBusiness.slug}/`,
    });
    if (error) throw error;
  }

  const managedProjectId = await ensureManagedProject(db, accounts.client.id, accounts.manager.id);

  mkdirSync(AUTH_DIR, { recursive: true });
  for (const role of ROLES) await signIn(baseURL, accounts[role], storageStatePath(role));

  const state: RunState = {
    runId: randomBytes(4).toString('hex'),
    startedAt: new Date().toISOString(),
    users: Object.fromEntries(ROLES.map((r) => [r, { id: accounts[r].id, email: accounts[r].email }])) as RunState['users'],
    proBusiness,
    partnerBusiness,
    managedProjectId,
  };
  writeFileSync(RUN_FILE, JSON.stringify(state, null, 2));
}
