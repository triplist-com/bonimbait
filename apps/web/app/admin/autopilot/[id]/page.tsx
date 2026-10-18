import Link from 'next/link';
import { notFound } from 'next/navigation';
import ActionForm, { SubmitButton } from '@/components/admin/ActionForm';
import FormField, { Section, Select, TextArea } from '@/components/admin/FormField';
import PageHeader from '@/components/admin/PageHeader';
import StatusBadge from '@/components/admin/StatusBadge';
import AudioUpload from '@/components/admin/autopilot/AudioUpload';
import SourceActions from '@/components/admin/autopilot/SourceActions';
import TranscriptForm from '@/components/admin/autopilot/TranscriptForm';
import TranscriptPanel from '@/components/admin/autopilot/TranscriptPanel';
import { saveSourceSummary } from '@/lib/admin/actions/autopilot';
import { formatDateTime } from '@/lib/admin/labels';
import { estimateAudioMicros, isAudioTranscriptionEnabled } from '@/lib/autopilot/audio';
import { asAutopilotDb } from '@/lib/autopilot/db';
import { formatUsd } from '@/lib/autopilot/pricing';
import { videoCategories } from '@/lib/autopilot/records';
import { STATUS_INFO, canReplaceTranscript, effectiveStatus } from '@/lib/autopilot/status';
import { listChunks, supabaseStore } from '@/lib/autopilot/store';
import { STAGES, chaptersToText, costsToText, keyPointsToText } from '@/lib/autopilot/summary';
import { formatClock } from '@/lib/autopilot/transcript';
import type { TranscriptSource } from '@/lib/autopilot/types';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'אוטופיילוט: פריט' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCE_LABEL: Record<TranscriptSource, string> = {
  captions_manual: 'כתוביות יוטיוב (ידניות)',
  captions_auto: 'כתוביות יוטיוב (אוטומטיות)',
  upload_vtt: 'קובץ VTT',
  upload_srt: 'קובץ SRT',
  upload_sbv: 'קובץ SBV',
  upload_json3: 'קובץ json3',
  upload_txt: 'טקסט שהודבק',
  audio_transcription: 'תמלול שמע (OpenAI)',
};

const STEP_LABEL = { embed: 'אינדוקס לחיפוש', summarize: 'סיכום', transcribe_audio: 'תמלול שמע' } as const;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export default async function AutopilotSourcePage({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) notFound();
  const db = asAutopilotDb(createClient());
  const src = await supabaseStore(db).get(params.id);
  if (!src) notFound();
  const chunks = src.chunk_count > 0 ? await listChunks(db, src.id, 40) : [];
  const status = effectiveStatus(src.status, src.updated_at);
  const info = STATUS_INFO[status];
  const s = src.summary;
  const categories = videoCategories();
  const transcriptPreview = src.transcript_text ? src.transcript_text.slice(0, 1600) : null;
  const publicPath = src.kind === 'youtube' ? `/video/${src.external_id}/` : null;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader
        back={{ href: '/admin/autopilot/', label: 'חזרה לתור' }}
        title={src.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge label={info.label} tone={info.tone} />
            <span>{info.hint}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {src.status === 'published' && publicPath && (
              <Link href={publicPath} target="_blank" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                צפייה באתר ↗
              </Link>
            )}
            {src.url && (
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                {src.kind === 'youtube' ? 'ביוטיוב ↗' : 'מקור ↗'}
              </a>
            )}
          </div>
        }
      />

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
            <Fact label="עלה ליוטיוב">{formatDateTime(src.published_at)}</Fact>
            <Fact label="אורך">{src.duration_s ? <span dir="ltr">{formatClock(src.duration_s)}</span> : '—'}</Fact>
            <Fact label="מקור התמליל">{src.transcript_source ? SOURCE_LABEL[src.transcript_source] : '—'}</Fact>
            <Fact label="מקטעי חיפוש">{src.chunk_count || '—'}</Fact>
            <Fact label="עלות עד כה">
              <span dir="ltr">{formatUsd(src.cost_usd_micros)}</span>
            </Fact>
            <Fact label="ניסיונות עיבוד">{src.attempts}</Fact>
            <Fact label="עובד לאחרונה">{formatDateTime(src.processed_at)}</Fact>
            <Fact label="פורסם באתר">{formatDateTime(src.site_published_at)}</Fact>
          </dl>
          <SourceActions id={src.id} status={src.status} updatedAt={src.updated_at} title={src.title} showTranscriptLink={false} />
        </div>
        {src.error && (status === 'failed' || status === 'needs_transcript' || src.status === 'transcribed') && (
          <p role="status" className="mt-4 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-800">
            {src.error.replace(/\s*\[[a-z_]+\]$/, '')}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div id="transcript" className="scroll-mt-6">
          <Section title="תמליל" aside={src.transcript_cues ? <span className="text-xs text-gray-500">{src.transcript_cues.length} שורות</span> : undefined}>
            {transcriptPreview ? (
              <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">
                {transcriptPreview}
                {src.transcript_text && src.transcript_text.length > transcriptPreview.length && <span className="text-gray-400"> …</span>}
              </div>
            ) : (
              <p className="text-sm text-gray-500">עוד אין תמליל. לחצו &quot;עיבוד&quot; כדי לשלוף כתוביות מיוטיוב, או העלו תמליל כאן.</p>
            )}
            {canReplaceTranscript(src.status, src.updated_at) ? (
              <TranscriptPanel
                title={transcriptPreview ? 'החלפת התמליל' : 'העלאה או הדבקה של תמליל'}
                initialOpen={status === 'needs_transcript' || !transcriptPreview}
              >
                <TranscriptForm id={src.id} />
                {isAudioTranscriptionEnabled() && (
                  <AudioUpload id={src.id} estimate={formatUsd(estimateAudioMicros(src.duration_s, 10 * 1024 * 1024))} />
                )}
              </TranscriptPanel>
            ) : (
              src.status === 'published' && <p className="text-xs text-gray-500">כדי להחליף תמליל, הסירו קודם את הסרטון מהאתר.</p>
            )}
          </Section>
        </div>

        <Section title="מקטעי חיפוש" aside={<span className="text-xs text-gray-500">מקטעים של 2-5 דקות, כמו באינדקס הקיים</span>}>
          {chunks.length > 0 ? (
            <ol className="max-h-80 space-y-2 overflow-y-auto">
              {chunks.map((c) => (
                <li key={c.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold text-primary" dir="ltr">
                    {formatClock(c.start_s)}–{formatClock(c.end_s)}
                    {c.tokens ? <span className="ms-2 font-normal text-gray-400">{c.tokens.toLocaleString('he-IL')} טוקנים</span> : null}
                  </p>
                  <p className="line-clamp-3 text-gray-700">{c.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">המקטעים נוצרים בשלב העיבוד.</p>
          )}
          {src.usage?.length > 0 && (
            <table className="w-full text-sm">
              <caption className="mb-1 text-start text-xs font-semibold text-gray-600">עלות לפי שלב</caption>
              <thead>
                <tr className="text-xs text-gray-500">
                  <th scope="col" className="py-1 pe-3 text-start font-medium">שלב</th>
                  <th scope="col" className="py-1 pe-3 text-start font-medium">מודל</th>
                  <th scope="col" className="py-1 pe-3 text-start font-medium">טוקנים</th>
                  <th scope="col" className="py-1 pe-3 text-start font-medium">עלות</th>
                </tr>
              </thead>
              <tbody>
                {src.usage.map((u, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1.5 pe-3">{STEP_LABEL[u.step] ?? u.step}</td>
                    <td className="py-1.5 pe-3 text-xs" dir="ltr">{u.model}</td>
                    <td className="py-1.5 pe-3 text-xs">
                      {u.audio_seconds !== undefined
                        ? `${formatClock(u.audio_seconds)} דקות שמע`
                        : u.output_tokens !== undefined
                          ? `${(u.input_tokens ?? 0).toLocaleString('he-IL')} קלט / ${u.output_tokens.toLocaleString('he-IL')} פלט`
                          : `${(u.input_tokens ?? 0).toLocaleString('he-IL')} טוקנים`}
                    </td>
                    <td className="py-1.5" dir="ltr">{formatUsd(u.usd_micros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="הסיכום שיופיע באתר" aside={s?.edited_at ? <span className="text-xs text-gray-500">נערך {formatDateTime(s.edited_at)}</span> : undefined}>
        {s && (src.status === 'indexed' || src.status === 'published') ? (
          <ActionForm action={saveSourceSummary} className="space-y-4" successMessage="הסיכום נשמר.">
            <input type="hidden" name="id" value={src.id} />
            <FormField label="סיכום" htmlFor="summary" required>
              <TextArea id="summary" name="summary" rows={4} defaultValue={s.summary} required />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="קטגוריה" htmlFor="category_slug">
                <Select id="category_slug" name="category_slug" defaultValue={s.category_slug}>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name_he}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="שלב בנייה" htmlFor="stage">
                <Select id="stage" name="stage" defaultValue={s.stage ?? 'none'}>
                  <option value="none">לא קשור לשלב מסוים</option>
                  {STAGES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="פרקים" htmlFor="chapters" hint="שורה לכל פרק: 1:30 | כותרת. הפרק הראשון מתחיל ב-0:00.">
                <TextArea id="chapters" name="chapters" rows={6} defaultValue={chaptersToText(s.chapters)} />
              </FormField>
              <FormField label="נקודות עיקריות" htmlFor="key_points" hint="שורה לכל נקודה. אפשר להתחיל בזמן: 2:15 | טקסט.">
                <TextArea id="key_points" name="key_points" rows={6} defaultValue={keyPointsToText(s.key_points)} />
              </FormField>
            </div>
            <FormField label="עלויות שהוזכרו" htmlFor="costs" hint="שורה לכל עלות: פריט | מחיר | יחידה | הקשר.">
              <TextArea id="costs" name="costs" rows={3} defaultValue={costsToText(s.costs)} />
            </FormField>
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="טיפים" htmlFor="tips" hint="שורה לכל טיפ.">
                <TextArea id="tips" name="tips" rows={4} defaultValue={s.tips.join('\n')} />
              </FormField>
              <FormField label="אזהרות" htmlFor="warnings" hint="שורה לכל אזהרה.">
                <TextArea id="warnings" name="warnings" rows={4} defaultValue={s.warnings.join('\n')} />
              </FormField>
              <FormField label="שאלות לדוגמה" htmlFor="suggested_questions" hint='מוצגות תחת "שאלו על הסרטון".'>
                <TextArea id="suggested_questions" name="suggested_questions" rows={4} defaultValue={s.suggested_questions.join('\n')} />
              </FormField>
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton>שמירת הסיכום</SubmitButton>
              {src.status === 'published' && <span className="text-xs text-gray-500">השינוי יעודכן מיד בעמוד הסרטון.</span>}
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-gray-500">
            הסיכום, הנקודות העיקריות, העלויות והפרקים ייווצרו בשלב העיבוד ויופיעו כאן לעריכה לפני הפרסום.
          </p>
        )}
      </Section>
    </div>
  );
}
