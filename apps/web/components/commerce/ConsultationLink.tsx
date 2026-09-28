/**
 * "Book a consultation" CTA -> Calendly (NEXT_PUBLIC_CALENDLY_URL), as the
 * live site's popup does. The Leads workstream owns the richer consultation
 * component (embedded Calendly); swap this link for it at merge if desired.
 */
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL || '';

export function calendlyHref(campaign = 'management'): string {
  if (!CALENDLY_URL) return '/צור-קשר/';
  try {
    const url = new URL(CALENDLY_URL);
    url.searchParams.set('hide_gdpr_banner', '1');
    url.searchParams.set('utm_source', 'website');
    url.searchParams.set('utm_medium', 'membership-tiers');
    url.searchParams.set('utm_campaign', campaign);
    return url.toString();
  } catch {
    return CALENDLY_URL;
  }
}

export default function ConsultationLink({
  children,
  className,
  campaign,
}: {
  children: React.ReactNode;
  className?: string;
  campaign?: string;
}) {
  const href = calendlyHref(campaign);
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
