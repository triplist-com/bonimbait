import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listReviewsForModeration, REVIEW_SCORE_LABELS } from '@/lib/db/reviews';
import type { ReviewStatus } from '@/lib/db/types';
import { editReview, setReviewStatus } from '@/lib/admin/actions/directory';
import { REVIEW_STATUS, formatDateTime } from '@/lib/admin/labels';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { TextArea, TextInput } from '@/components/admin/FormField';
import AdminPagination, { pageParam, param } from '@/components/admin/AdminPagination';

export const metadata = { title: 'ביקורות' };

const TABS: Array<{ key: ReviewStatus | 'all'; label: string }> = [
  { key: 'pending', label: 'ממתינות לאישור' },
  { key: 'approved', label: 'מאושרות' },
  { key: 'rejected', label: 'נדחו' },
  { key: 'all', label: 'הכול' },
];

export default async function ReviewsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const db = createClient();
  const statusParam = param(searchParams.status) ?? 'pending';
  const status = (TABS.some((t) => t.key === statusParam) ? statusParam : 'pending') as ReviewStatus | 'all';
  const businessId = param(searchParams.business);
  const page = pageParam(searchParams.page);
  const pageSize = 20;
  const result = await listReviewsForModeration(db, { status, businessId, page, pageSize });
  const bizIds = Array.from(new Set(result.items.map((r) => r.business_id)));
  const { data: businesses } = bizIds.length
    ? await db.from('businesses').select('id, name, slug').in('id', bizIds)
    : { data: [] as Array<{ id: string; name: string; slug: string }> };
  const biz = new Map((businesses ?? []).map((b) => [b.id, b]));
  const { count: pendingCount } = await db.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending');

  return (
    <div className="max-w-5xl">
      <PageHeader title="ביקורות על עסקים" description={`${pendingCount ?? 0} ממתינות לאישור. ביקורת מאושרת מופיעה מיד בעמוד העסק.`} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="סינון לפי סטטוס">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/directory/reviews/?status=${t.key}${businessId ? `&business=${businessId}` : ''}`}
            aria-current={status === t.key ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-sm ${status === t.key ? 'bg-primary text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'}`}
          >
            {t.label}
          </Link>
        ))}
        {businessId && (
          <Link href={`/admin/directory/reviews/?status=${status}`} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
            ✕ {biz.get(businessId)?.name ?? 'עסק'}
          </Link>
        )}
      </nav>
      {result.items.length === 0 && <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">אין ביקורות להצגה.</p>}
      <ul className="space-y-4">
        {result.items.map((r) => {
          const b = biz.get(r.business_id);
          return (
            <li key={r.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge info={REVIEW_STATUS[r.status]} />
                  <span className="font-semibold text-gray-900">{b?.name ?? 'עסק לא ידוע'}</span>
                  <span className="text-gray-500">· {formatDateTime(r.created_at)}</span>
                  <span className="text-gray-500">· {r.source === 'migrated' ? 'יובא מהאתר הישן' : 'חבר קהילה'}</span>
                  <span className="rounded bg-gray-100 px-1.5 text-gray-700">ציון {r.rating}/10</span>
                </div>
                <div className="flex gap-2">
                  {r.status !== 'approved' && (
                    <ConfirmDialog
                      trigger="אישור ופרסום"
                      triggerClassName="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      title="לאשר ולפרסם את הביקורת?"
                      body={`הביקורת תופיע בעמוד של "${b?.name ?? ''}".`}
                      confirmLabel="אישור"
                      tone="primary"
                      onConfirm={setReviewStatus.bind(null, r.id, 'approved')}
                    />
                  )}
                  {r.status !== 'rejected' && (
                    <ConfirmDialog trigger="דחייה" title="לדחות את הביקורת?" body="הביקורת לא תוצג באתר." confirmLabel="דחייה" onConfirm={setReviewStatus.bind(null, r.id, 'rejected')} />
                  )}
                  {b && r.status === 'approved' && (
                    <a href={`/business/${encodeURIComponent(b.slug)}/`} target="_blank" rel="noopener" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      בעמוד העסק
                    </a>
                  )}
                </div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">{r.author_name ?? 'אנונימי'}</span>
                  {r.title && <span className="text-gray-700"> — {r.title}</span>}
                  <p className="mt-1 whitespace-pre-line text-gray-700">{r.body}</p>
                  <span className="mt-1 inline-block text-xs text-primary">עריכה ›</span>
                </summary>
                <ActionForm action={editReview} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="mb-1 block text-gray-600">שם הכותב</span>
                      <TextInput name="author_name" defaultValue={r.author_name ?? ''} />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-gray-600">כותרת</span>
                      <TextInput name="title" defaultValue={r.title ?? ''} />
                    </label>
                  </div>
                  <label className="block text-sm">
                    <span className="mb-1 block text-gray-600">תוכן</span>
                    <TextArea name="body" defaultValue={r.body ?? ''} rows={4} />
                  </label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {(Object.keys(REVIEW_SCORE_LABELS) as Array<keyof typeof REVIEW_SCORE_LABELS>).map((k) => (
                      <label key={k} className="text-sm">
                        <span className="mb-1 block text-gray-600">{REVIEW_SCORE_LABELS[k]}</span>
                        <TextInput name={k} type="number" min={0} max={10} step={0.5} defaultValue={r[k] ?? r.rating} required />
                      </label>
                    ))}
                  </div>
                  <SubmitButton>שמירת הביקורת</SubmitButton>
                </ActionForm>
              </details>
            </li>
          );
        })}
      </ul>
      <AdminPagination basePath="/admin/directory/reviews/" params={{ status, business: businessId }} page={page} pageSize={pageSize} total={result.total} />
    </div>
  );
}
