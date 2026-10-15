/**
 * Calendly helpers for the consult booking sheet. Client-safe and pure.
 *
 * The embed URL carries the live site's display params, the lead's ref in
 * utm_content (so every Calendly booking names its project file), and the
 * visitor's name and email as prefill.
 */

export type CalendlyPrefill = { name?: string | null; email?: string | null; leadRef?: string | null };

const LEAD_REF_RE = /^BB-\d{2}-\d{6}$/;

/** The inline-embed URL, or null without a (valid) Calendly base URL. */
export function calendlyBookingUrl(base: string, source: string, prefill: CalendlyPrefill = {}): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:') return null;
    url.searchParams.set('hide_event_type_details', '1');
    url.searchParams.set('hide_gdpr_banner', '1');
    url.searchParams.set('primary_color', 'e61559');
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'website');
    url.searchParams.set('utm_campaign', 'management');
    if (prefill.leadRef && LEAD_REF_RE.test(prefill.leadRef)) url.searchParams.set('utm_content', prefill.leadRef);
    const name = prefill.name?.trim();
    if (name) url.searchParams.set('name', name.slice(0, 120));
    const email = prefill.email?.trim();
    if (email && email.includes('@')) url.searchParams.set('email', email.slice(0, 254));
    return url.toString();
  } catch {
    return null;
  }
}

const CALENDLY_API_URI = /^https:\/\/api\.calendly\.com\/[A-Za-z0-9_/-]{1,250}$/;

/** The scheduled event and invitee URIs from Calendly's `calendly.event_scheduled` message. */
export function calendlyScheduledDetails(data: unknown): { event?: string; invitee?: string } {
  const payload = data && typeof data === 'object' ? (data as { payload?: unknown }).payload : undefined;
  if (!payload || typeof payload !== 'object') return {};
  const uri = (v: unknown) => {
    const u = v && typeof v === 'object' ? (v as { uri?: unknown }).uri : undefined;
    return typeof u === 'string' && CALENDLY_API_URI.test(u) ? u : undefined;
  };
  const p = payload as { event?: unknown; invitee?: unknown };
  return { event: uri(p.event), invitee: uri(p.invitee) };
}
