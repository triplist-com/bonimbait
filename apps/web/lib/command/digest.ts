/**
 * The weekly digest e-mail (/admin/digest/ previews it; nothing is sent).
 * Pure: a 7-day CommandCenterData plus the latest insight topics in,
 * { subject, preheader, html } out. E-mail-safe HTML: tables, inline styles,
 * no scripts or external CSS, RTL, every dynamic string escaped. No contact
 * details: leads appear by ref, stage and region only.
 */
import { agoHe } from '@/lib/demo/format';
import { primary, ink, success, danger, warning } from '@/lib/design/tokens';
import { formatCount, formatDeltaPct, formatNis, formatUsd } from './format';
import type { CommandCenterData, Delta, InsightTopic } from './types';
import { PARTNER_STATUS_LABELS } from './partners';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "Heebo, 'Segoe UI', Arial, sans-serif";

/** "▲ +12%" in words-safe colours (green up, red down; arrow and sign carry it too). */
function deltaHtml(d: Delta, good: 'up' | 'down' = 'up'): string {
  if (d.pct == null) return `<span style="color:${ink[500]};font-size:12px;">חדש השבוע</span>`;
  const better = d.direction === 'flat' ? null : (d.direction === 'up') === (good === 'up');
  const color = better == null ? ink[600] : better ? success[700] : danger[700];
  const arrow = d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '•';
  return `<span style="color:${color};font-size:12px;font-weight:700;" dir="ltr">${arrow} ${escapeHtml(formatDeltaPct(d.pct))}</span> <span style="color:${ink[500]};font-size:12px;">מהשבוע שעבר</span>`;
}

function kpi(label: string, value: string, delta: string): string {
  return `<td width="50%" style="padding:12px 14px;border:1px solid ${ink[100]};border-radius:12px;background:#ffffff;vertical-align:top;">
    <div style="font-size:13px;color:${ink[600]};">${escapeHtml(label)}</div>
    <div style="font-size:26px;font-weight:800;color:${ink[900]};line-height:1.2;margin:4px 0;" dir="ltr">${escapeHtml(value)}</div>
    <div>${delta}</div>
  </td>`;
}

export type Digest = { subject: string; preheader: string; html: string };

export function buildDigest(
  data: CommandCenterData,
  topics: readonly InsightTopic[],
  opts: { siteUrl: string; weekLabel: string; isDemo?: boolean },
): Digest {
  const site = opts.siteUrl.replace(/\/+$/, '');
  const gaps = topics.filter((t) => t.level !== 'covered').sort((a, b) => b.asks - a.asks).slice(0, 3);
  const hot = data.hotLeads.slice(0, 5);
  const atRisk = data.partners.rows.filter((r) => r.status === 'at_risk' || r.status === 'behind').slice(0, 3);
  const subject = `השבוע בבונים בית: ${formatCount(data.leads.total.current)} לידים, ${formatCount(data.consults.booked.current)} פגישות ייעוץ, צבר ${formatNis(data.pipeline.openAgorot, { compact: true })}`;
  const preheader = gaps[0]
    ? `הנושא שהכי שואלים עליו בלי תשובה טובה: ${gaps[0].label} (${gaps[0].asks} שאלות)`
    : 'הלידים החמים, הצבר ועלות ה-AI של השבוע';

  const leadsRows = hot.length
    ? hot
        .map((l) => {
          const details = [l.stageLabel, l.regionName, l.sizeM2 ? `${l.sizeM2} מ״ר` : null].filter(Boolean).join(' · ');
          return `<tr>
            <td style="padding:8px 0;border-bottom:1px solid ${ink[100]};width:44px;vertical-align:top;">
              <span style="display:inline-block;min-width:32px;padding:4px 6px;border-radius:8px;background:${primary[800]};color:#ffffff;font-weight:700;font-size:13px;text-align:center;" dir="ltr">${escapeHtml(l.score ?? '—')}</span>
            </td>
            <td style="padding:8px 8px 8px 0;border-bottom:1px solid ${ink[100]};font-size:14px;color:${ink[900]};">
              <strong dir="ltr" style="font-family:Menlo,Consolas,monospace;">${escapeHtml(l.ref)}</strong> · ${escapeHtml(l.typeLabel)}
              <div style="font-size:12px;color:${ink[600]};">${escapeHtml(details || 'עוד אין פרטי פרויקט')} · ${escapeHtml(agoHe(l.minutesAgo))}</div>
            </td>
          </tr>`;
        })
        .join('')
    : `<tr><td style="padding:8px 0;font-size:14px;color:${ink[600]};">אין השבוע לידים פתוחים.</td></tr>`;

  const gapsRows = gaps.length
    ? gaps
        .map(
          (t, i) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${ink[100]};font-size:14px;color:${ink[900]};">
            <strong>${i + 1}. ${escapeHtml(t.suggestedTitle ?? t.label)}</strong>
            <div style="font-size:12px;color:${ink[600]};">${escapeHtml(t.label)} · <span dir="ltr">${escapeHtml(formatCount(t.asks))}</span> שאלות${t.examples[0] ? ` · ״${escapeHtml(t.examples[0].q)}״` : ''}</div>
          </td></tr>`,
        )
        .join('')
    : `<tr><td style="padding:8px 0;font-size:14px;color:${ink[600]};">${topics.length ? 'כל מה ששאלו השבוע מכוסה בתוכן הקיים.' : 'עוד לא נותחו שאלות. רעננו את התובנות בחדר הבקרה.'}</td></tr>`;

  const partnersBlock = atRisk.length
    ? `<p style="margin:0 0 6px;font-size:14px;color:${ink[900]};">${atRisk
        .map((p) => `<span style="color:${p.status === 'at_risk' ? danger[700] : warning[700]};font-weight:700;">${escapeHtml(PARTNER_STATUS_LABELS[p.status])}:</span> ${escapeHtml(p.name)}${p.pace != null ? ` (<span dir="ltr">${Math.round(p.pace * 100)}%</span> מהיעד)` : ''}`)
        .join('<br>')}</p>`
    : `<p style="margin:0;font-size:14px;color:${ink[700]};">${
        data.partners.rows.length === 0
          ? 'עוד אין נתוני שותפים.'
          : data.partners.rows.every((r) => r.status === 'no_tier')
            ? `<span dir="ltr">${escapeHtml(formatCount(data.partners.impressions.current))}</span> חשיפות נצפות השבוע. עוד אין מסלולי שותפים מוגדרים, אז אין יעד להשוות אליו.`
            : 'כל השותפים בקצב.'
      }</p>`;

  const capColor = data.ai.capStatus === 'reached' ? danger[700] : data.ai.capStatus === 'near' ? warning[700] : success[700];
  const capText = data.ai.capStatus === 'reached' ? 'הגיע לתקרה' : data.ai.capStatus === 'near' ? 'קרוב לתקרה' : data.ai.capStatus === 'off' ? 'כבוי' : 'בטווח התקרה';

  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${ink[50]};font-family:${FONT};" dir="rtl">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ink[50]};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;" dir="rtl">
  <tr><td style="background:${primary[600]};padding:18px 24px;color:#ffffff;">
    <div style="font-size:13px;opacity:0.9;">בונים בית · חדר הבקרה${opts.isDemo ? ' · נתוני הדגמה' : ''}</div>
    <div style="font-size:22px;font-weight:800;margin-top:2px;">הסיכום השבועי</div>
    <div style="font-size:13px;opacity:0.9;margin-top:2px;">${escapeHtml(opts.weekLabel)}</div>
  </td></tr>
  <tr><td style="padding:20px 24px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="border-collapse:separate;">
      <tr>${kpi('לידים חדשים', formatCount(data.leads.total.current), deltaHtml(data.leads.total))}${kpi('פגישות ייעוץ שנקבעו', formatCount(data.consults.booked.current), deltaHtml(data.consults.booked))}</tr>
      <tr>${kpi('צבר פוטנציאלי (לידים פתוחים)', formatNis(data.pipeline.openAgorot, { compact: true }), deltaHtml(data.pipeline.createdDelta))}${kpi('עלות AI השבוע', formatUsd(data.ai.cost.current), `<span style="color:${capColor};font-size:12px;font-weight:700;">${capText}</span> <span style="color:${ink[500]};font-size:12px;">· תקרה <span dir="ltr">${escapeHtml(formatUsd(data.ai.budgetUsd))}</span> ליום</span>`)}</tr>
    </table>
  </td></tr>
  <tr><td style="padding:12px 24px 0;">
    <h2 style="margin:0 0 4px;font-size:17px;color:${ink[900]};">לידים חמים לטיפול</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${leadsRows}</table>
  </td></tr>
  <tr><td style="padding:18px 24px 0;">
    <h2 style="margin:0 0 4px;font-size:17px;color:${ink[900]};">הסרטונים הבאים</h2>
    <p style="margin:0 0 4px;font-size:13px;color:${ink[600]};">נושאים שבונים שואלים עליהם ואין עליהם עדיין סרטון או מאמר מספיק טוב.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${gapsRows}</table>
  </td></tr>
  <tr><td style="padding:18px 24px 0;">
    <h2 style="margin:0 0 6px;font-size:17px;color:${ink[900]};">שותפים</h2>
    ${partnersBlock}
  </td></tr>
  <tr><td align="center" style="padding:24px;">
    <a href="${escapeHtml(`${site}/admin/`)}" style="display:inline-block;background:${primary[600]};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px;">לחדר הבקרה</a>
  </td></tr>
  <tr><td style="padding:14px 24px;background:${ink[50]};font-size:11px;color:${ink[500]};text-align:center;">
    נשלח מחדר הבקרה של בונים בית. המספרים מתייחסים ל-7 הימים האחרונים לעומת 7 הימים שלפניהם.
  </td></tr>
</table>
</td></tr></table>
</body>
</html>`;
  return { subject, preheader, html };
}
