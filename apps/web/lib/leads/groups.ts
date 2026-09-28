import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { listWhatsappGroupsPublic } from '@/lib/db/leads';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/supabase/env';

export type WhatsappGroupOption = { slug: string; name: string };

/**
 * The 11 live area groups (names/slugs only; invite links are NEVER here —
 * they live in whatsapp_groups and are revealed server-side after a lead).
 * Used when the DB is unreachable so the page still renders.
 */
export const WHATSAPP_GROUPS_FALLBACK: readonly WhatsappGroupOption[] = [
  { slug: 'golan-galil', name: 'גולן וגליל תחתון' },
  { slug: 'galil-upper', name: 'גליל עליון ומערבי' },
  { slug: 'valleys', name: 'עמקים' },
  { slug: 'haifa', name: 'חיפה והקריות' },
  { slug: 'jerusalem', name: 'ירושלים וסביבה' },
  { slug: 'center-sharon', name: 'מרכז והשרון' },
  { slug: 'shfela', name: 'השפלה' },
  { slug: 'south-2', name: 'דרום - ב״ש/שדרות/נתיבות' },
  { slug: 'south-1', name: 'דרום - דימונה/ערד/אילת' },
  { slug: 'yehuda-shomron', name: 'יהודה ושומרון' },
  { slug: 'ashkelon-ashdod', name: 'אשקלון/אשדוד/יבנה' },
];

/** Public group list (anon, cookie-less so pages can stay static). */
export async function getWhatsappGroups(): Promise<WhatsappGroupOption[]> {
  if (!isSupabaseConfigured()) return [...WHATSAPP_GROUPS_FALLBACK];
  try {
    const db = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const rows = await listWhatsappGroupsPublic(db);
    return rows.length ? rows.map((r) => ({ slug: r.slug, name: r.name })) : [...WHATSAPP_GROUPS_FALLBACK];
  } catch (e) {
    console.error('[leads] could not load WhatsApp groups', e);
    return [...WHATSAPP_GROUPS_FALLBACK];
  }
}
