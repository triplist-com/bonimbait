import './article.css';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { LEAD_FORM_SLOT } from '@/lib/content/sanitize';
import LeadPopupBridge from './LeadPopupBridge';

interface ArticleBodyProps {
  /** Already sanitized by lib/content/sanitize.ts (prepareContentHtml). */
  html: string;
  className?: string;
  /** CTA source label (utm / lead payload), e.g. "post-inline". */
  ctaSource?: string;
}

/**
 * Long-form Hebrew content body with the site's prose typography. Migrated
 * lead-form placeholders become <ConsultationCTA> cards (rendered between prose
 * blocks so prose styles don't leak into them); popup links open its modal.
 */
export default function ArticleBody({ html, className = '', ctaSource = 'post-inline' }: ArticleBodyProps) {
  if (!html.trim()) return null;
  const parts = html.split(LEAD_FORM_SLOT);
  const hasPopupLinks = html.includes('data-bb-cta="consultation"');

  const body = (
    <div className={className}>
      {parts.map((part, i) => (
        <div key={i}>
          {part.trim() && <div className="bb-prose" dangerouslySetInnerHTML={{ __html: part }} />}
          {i < parts.length - 1 && (
            <div className="my-8">
              <ConsultationCTA variant="card" source={ctaSource} />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return hasPopupLinks ? <LeadPopupBridge source={ctaSource}>{body}</LeadPopupBridge> : body;
}
