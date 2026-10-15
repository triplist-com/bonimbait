'use client';

import { useId, useRef, useState, useTransition } from 'react';
import { ExternalLink, FileText, FolderLock, ImageIcon, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { dayMonthLabel, fileSizeLabel } from '@/lib/hub/format';
import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, type DocumentCategory, type HubDocumentView } from '@/lib/hub/types';
import { cn } from '@/lib/cn';
import { useHubActions } from './HubActions';
import { HubSection, SignupPrompt } from './parts';

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  plans: 'תוכניות',
  permit: 'היתר ורישוי',
  quote: 'הצעת מחיר',
  contract: 'חוזה',
  receipt: 'קבלה או חשבונית',
  photo: 'תמונה מהשטח',
  other: 'אחר',
};

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Client-side check before uploading (the bucket and the server check again). */
export function checkDocumentFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) return 'אפשר להעלות PDF או תמונה (JPG, PNG, WEBP, HEIC).';
  if (file.size > DOCUMENT_MAX_BYTES) return 'הקובץ גדול מ-10MB. נסו לכווץ אותו או לצלם מחדש.';
  if (file.size === 0) return 'הקובץ ריק.';
  return null;
}

export function DocumentsPanel({ documents }: { documents: HubDocumentView[] }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [category, setCategory] = useState<DocumentCategory>('plans');
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

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
    <HubSection
      id="documents"
      icon={<FolderLock />}
      title="מסמכים"
      subtitle="תוכניות, היתרים, הצעות מחיר וחוזים. הקבצים פרטיים: רק לכם יש גישה אליהם."
    >
      {actions.needsAccount ? (
        <SignupPrompt
          title="כל המסמכים של הבית במקום אחד"
          description="תוכנית ההגשה, ההיתר, הצעות המחיר והחוזים. הירשמו, ויהיה לכם הכול ביד בפגישה עם הקבלן, עם המפקח ובבנק."
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-2xl bg-paper p-3 ring-1 ring-inset ring-ink-100 sm:flex-row sm:items-center">
            <label htmlFor={`${inputId}-cat`} className="shrink-0 text-body-sm font-semibold text-ink-800">
              סוג המסמך
            </label>
            <Select
              id={`${inputId}-cat`}
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              wrapperClassName="sm:w-52"
            >
              {(Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]).map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
              disabled={uploading}
            />
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

          {documents.length === 0 ? (
            <EmptyState
              className="mt-4 py-8"
              icon={<FolderLock />}
              title="התיק עוד ריק"
              description="התחילו מתוכנית ההגשה ומהצעות המחיר שקיבלתם. כשתשבו מול קבלן, מפקח או הבנק, הכול יהיה כאן."
            />
          ) : (
            <ul className="mt-4 divide-y divide-ink-100 rounded-2xl border border-ink-100" aria-busy={pending || uploading || undefined}>
              {documents.map((d) => (
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
                      <span>{dayMonthLabel(d.createdAt.slice(0, 10))}</span>
                    </p>
                  </div>
                  <IconButton label={`פתיחה: ${d.fileName}`} icon={<ExternalLink />} size="sm" variant="ghost" onClick={() => run(() => actions.openDocument(d.id))} />
                  <IconButton
                    label={`מחיקה: ${d.fileName}`}
                    icon={<Trash2 />}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(`למחוק את ${d.fileName}? אי אפשר לשחזר.`)) run(() => actions.deleteDocument(d.id), 'הקובץ נמחק');
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </HubSection>
  );
}
