'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import FormField, { Checkbox, Select, TextArea } from '@/components/admin/FormField';
import { saveTranscript } from '@/lib/admin/actions/autopilot';
import { requestProcess } from './SourceActions';

/**
 * Transcript strategy (b): upload a captions file (VTT/SRT/SBV/TXT/json3) or
 * paste text, then optionally continue straight to processing.
 */
export default function TranscriptForm({ id }: { id: string }) {
  const [processAfter, setProcessAfter] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  async function processNow() {
    setProcessing(true);
    setNote('מעבד: סיכום, פרקים ואינדוקס לחיפוש… (עד דקה)');
    try {
      let data = await requestProcess(id);
      if (data?.ok && data.next === 'index') data = await requestProcess(id);
      setNote(data?.ok ? (data.message ?? 'העיבוד הסתיים.') : (data?.error ?? 'העיבוד נכשל.'));
    } catch {
      setNote('החיבור נקטע. רעננו את הדף כדי לראות את המצב.');
    } finally {
      setProcessing(false);
      router.refresh();
    }
  }

  return (
    <ActionForm action={saveTranscript} className="space-y-4" resetOnSuccess onSuccess={() => processAfter && processNow()}>
      <input type="hidden" name="id" value={id} />
      <FormField label="קובץ כתוביות" htmlFor={`file-${id}`} hint="VTT / SRT / SBV מ-YouTube Studio, או קובץ טקסט. עד 900KB.">
        <input
          id={`file-${id}`}
          name="file"
          type="file"
          accept=".vtt,.srt,.sbv,.txt,.json,text/vtt,text/plain,application/x-subrip"
          className="block w-full text-sm text-gray-700 file:me-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
        />
      </FormField>
      <FormField label="או הדביקו את התמליל" htmlFor={`text-${id}`} hint="טקסט רגיל בלי חותמות זמן יקבל זמנים משוערים לפי אורך הסרטון.">
        <TextArea id={`text-${id}`} name="text" rows={6} dir="rtl" placeholder="הדביקו כאן כתוביות או תמליל…" />
      </FormField>
      <div className="flex flex-wrap items-end gap-4">
        <FormField label="פורמט" htmlFor={`format-${id}`} className="w-40">
          <Select id={`format-${id}`} name="format" defaultValue="">
            <option value="">זיהוי אוטומטי</option>
            <option value="vtt">VTT</option>
            <option value="srt">SRT</option>
            <option value="sbv">SBV</option>
            <option value="json3">YouTube json3</option>
            <option value="txt">טקסט רגיל</option>
          </Select>
        </FormField>
        <Checkbox
          name="process_after"
          checked={processAfter}
          onChange={(e) => setProcessAfter(e.currentTarget.checked)}
          label="להמשיך מיד לעיבוד"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{processing ? 'מעבד…' : 'שמירת התמליל'}</SubmitButton>
        <p aria-live="polite" className="text-sm text-gray-600 empty:hidden">
          {note ?? ''}
        </p>
      </div>
    </ActionForm>
  );
}
