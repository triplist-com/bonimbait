/**
 * Remove what the suite creates on the local stack: leads sent with the E2E
 * e-mail domain or name, and the throwaway signup accounts (with their hub
 * projects). The fixture accounts and businesses stay, for the next run.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { E2E_NAME } from './state';

/** Signup accounts the specs create: e2e-signup-<tag>@bonimbait.test. */
export const SIGNUP_PREFIX = 'e2e-signup-';

export async function cleanE2eData(db: SupabaseClient): Promise<void> {
  await db.from('leads').delete().ilike('email', 'e2e-%@bonimbait.test');
  await db.from('leads').delete().like('full_name', `${E2E_NAME}%`);
  // Mock-paid test orders (their lines and payments go with them, or stay harmlessly if not cascaded).
  const { data: orders } = await db.from('orders').select('id').ilike('customer_email', 'e2e-%@bonimbait.test');
  for (const o of orders ?? []) {
    await db.from('payments').delete().eq('order_id', o.id);
    await db.from('order_items').delete().eq('order_id', o.id);
    await db.from('orders').delete().eq('id', o.id);
  }

  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const signups = (list?.users ?? []).filter((u) => u.email?.startsWith(SIGNUP_PREFIX) && u.email.endsWith('@bonimbait.test'));
  for (const u of signups) {
    await db.from('leads').delete().eq('member_id', u.id);
    await db.from('hub_projects').delete().eq('created_by', u.id);
    await db.auth.admin.deleteUser(u.id);
  }
}
