'use client';

import { useId, useMemo, useRef, useState, useTransition } from 'react';
import { ExternalLink, FileText, FolderLock, ImageIcon, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { buttonClasses } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { DOCUMENT_CATEGORY_LABELS, checkDocumentFile } from '@/components/hub/DocumentsPanel';
import { fileSizeLabel } from '@/lib/hub/format';
import type { DocumentCategory } from '@/lib/hub/types';
import type { ManagedProjectData } from '@/lib/bonimos/types';
import { cn } from '@/lib/cn';
import { useBonimosActions } from './BonimosActions';
import { OsSection, dateLabel } from './parts';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';
/** The order a managed project's documents are usually asked for. */
const ORDER: readonly DocumentCategory[] = ['plans', 'permit', 'contract', 'quote', 'receipt', 'photo', 'other'];

/**
 * מסמכים: plans, permits, contracts, quotes and invoices, in the project's
 * private folder (hub-docs). The client and their managers see the same files.
 */
export function DocumentsSection({ data }: { data: ManagedProjectData }) {
  const actions = useBonimosActions();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [filter, setFilter] = useState<DocumentCategory | 'all'>('all');
  const [category, setCategory] = useState<DocumentCategory>('plans');
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const counts = useMemo(() => {
    const c = new Map<DocumentCategory, number>();
    for (const d of data.documents) c.set(d.category, (c.get(d.category) ?? 0) + 1);
    return c;
  }, [data.documents]);
  const shown = filter === 'all' ? data.documents : data.documents.filter((d) => d.category === filter);
  const manager = data.people.find((p) => p.role === 'manager');

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const problem = checkDocumentFile(file);
    if (problem) {
      toast({ title: problem, tone: 'error' });
      return;
    }
    setUploading(true);
    const res = await actions.uploadDocument(file, category);
    setUploading(false);
    if (!res.ok) toast({ title: res.message ?? 'ההעלאה נכשלה. נסו שוב.', tone: 'error' });
    else toast({ title: 'הקובץ נשמר בתיק', description: file.name, tone: 'success' });
  }

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו. נסו שוב.', tone: 'error' });
      else if (success) toast({ title: success, tone: 'success' });
    });

  return (
    <OsSection
      id="documents"
      icon={<FolderLock />}
      title="מסמכים"
      subtitle={
        data.viewer.role === 'manager'
          ? 'תוכניות, היתרים, חוזים, הצעות מחיר וחשבונות. הלקוח רואה כל מסמך שתעלו.'
          : `תוכניות, היתרים, חוזים, הצעות מחיר וחשבונות. פרטיים: רק לכם${manager ? ` ול${manager.name}` : ' ולמנהל הפרויקט'} יש גישה.`
      }
    >
      <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3 ring-1 ring-inset ring-ink-100 sm:flex-row sm:items-center">
        <label htmlFor={`${inputId}-cat`} className="shrink-0 text-body-sm font-semibold text-ink-800">
          סוג המסמך
        </label>
        <Select id={`${inputId}-cat`} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)} wrapperClassName="sm:w-52">
          {ORDER.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <input ref={inputRef} id={inputId} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFiles(e.target.files)} disabled={uploading} />
        <label
          htmlFor={inputId}
          aria-disabled={uploading || undefined}
          className={cn(buttonClasses({ variant: 'secondary', size: 'md' }), 'cursor-pointer sm:ms-auto', uploading && 'pointer-events-none opacity-60')}
        >
          <Upload aria-hidden="true" />
          {uploading ? 'מעלים…' : 'העלאת קובץ'}
        </label>
      </div>
      <p className="mt-2 text-caption text-ink-500">PDF או תמונה, עד 10MB לקובץ.</p>

      {data.documents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="סינון לפי סוג">
          <Chip size="sm" selected={filter === 'all'} onClick={() => setFilter('all')} count={data.documents.length}>
            הכול
          </Chip>
          {ORDER.filter((c) => counts.get(c)).map((c) => (
            <Chip key={c} size="sm" selected={filter === c} onClick={() => setFilter(c)} count={counts.get(c)}>
              {DOCUMENT_CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
      )}

      {data.documents.length === 0 ? (
        <EmptyState
          className="mt-4 py-8"
          icon={<FolderLock />}
          title="התיק עוד ריק"
          description="התחילו מהתוכניות, ההיתר והחוזים. כשתשבו מול קבלן, מפקח או הבנק, הכול יהיה כאן."
        />
      ) : (
        <ul className="mt-3 divide-y divide-ink-100 rounded-2xl border border-ink-100" aria-busy={pending || uploading || undefined}>
          {shown.map((d) => (
            <li key={d.id} className="flex items-center gap-3 p-3">
              <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-sand-800">
                {d.mimeType === 'application/pdf' ? <FileText className="size-5" /> : <ImageIcon className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body-sm font-semibold text-ink-900" dir="auto">
                  {d.fileName}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-caption text-ink-500">
                  <Badge tone="sand" size="sm">
                    {DOCUMENT_CATEGORY_LABELS[d.category]}
                  </Badge>
                  <span className="num">{fileSizeLabel(d.sizeBytes)}</span>
                  <span>{dateLabel(d.createdAt.slice(0, 10), data.today)}</span>
                </p>
              </div>
              <IconButton label={`פתיחה: ${d.fileName}`} icon={<ExternalLink />} size="sm" variant="ghost" onClick={() => run(() => actions.openDocument(d.id))} />
              <IconButton
                label={`מחיקה: ${d.fileName}`}
                icon={<Trash2 />}
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`למחוק את ${d.fileName}? אי אפשר לשחזר, והמחיקה נרשמת ביומן.`)) run(() => actions.deleteDocument(d.id), 'הקובץ נמחק');
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </OsSection>
  );
}
