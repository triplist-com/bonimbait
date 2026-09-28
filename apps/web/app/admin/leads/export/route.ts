import { NextResponse, type NextRequest } from 'next/server';
import { checkRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { listLeads } from '@/lib/db/leads';
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { LEAD_STATUS, NOTIFY_STATUS } from '@/lib/admin/labels';
import { leadFilterFromQuery } from '@/lib/admin/lead-filters';
import { toCsv } from '@/lib/admin/csv';
import type { LeadRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 20_000;

/** CSV export of the lead inbox with the same filters as /admin/leads/. Editors and admins. */
export async function GET(request: NextRequest) {
  const auth = await checkRole('editor');
  if (!auth.ok) return new NextResponse(auth.status === 401 ? 'Unauthorized' : 'Forbidden', { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const filter = leadFilterFromQuery({
    type: sp.get('type') ?? undefined,
    status: sp.get('status') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    business: sp.get('business') ?? undefined,
    q: sp.get('q') ?? undefined,
  });

  const db = createClient();
  const rows: LeadRow[] = [];
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const res = await listLeads(db, { ...filter, page, pageSize: 100 });
    rows.push(...res.items);
    if (res.items.length < 100) break;
  }
  const { data: businesses } = await db.from('businesses').select('id, name');
  const biz = new Map((businesses ?? []).map((b) => [b.id, b.name]));

  const csv = toCsv(
    ['תאריך', 'סוג', 'סטטוס', 'שם', 'טלפון', 'מייל', 'הודעה', 'עסק', 'עמוד מקור', 'שלב בנייה', 'שדות נוספים', 'התראה', 'הועבר אל', 'הערות', 'מזהה'],
    rows.map((l) => [
      new Date(l.created_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
      LEAD_TYPE_LABELS[l.type],
      LEAD_STATUS[l.status]?.label ?? l.status,
      l.full_name,
      l.phone,
      l.email,
      l.message,
      l.business_id ? biz.get(l.business_id) ?? l.business_id : '',
      l.source_url,
      l.construction_stage,
      l.payload,
      NOTIFY_STATUS[l.notify_status]?.label ?? l.notify_status,
      l.forwarded_to,
      l.notes,
      l.id,
    ]),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
