import type { ContentStatus } from '@/lib/db/types';
import { ActionError } from './errors';

export type StatusChoice = 'draft' | 'pending' | 'published' | 'scheduled' | 'archived';

/**
 * Map the editor's status choice to (status, published_at).
 * "scheduled" is stored as published with a future published_at: public RLS
 * hides it until then.
 */
export function resolvePublishState(
  choice: string,
  publishedAtIso: string | null,
  existing: { status: ContentStatus; published_at: string | null } | null,
  now = new Date(),
): { status: ContentStatus; published_at: string | null } {
  switch (choice as StatusChoice) {
    case 'scheduled': {
      if (!publishedAtIso) throw new ActionError('יש לבחור מועד פרסום', { published_at: 'שדה חובה לתזמון' });
      if (new Date(publishedAtIso).getTime() <= now.getTime()) {
        throw new ActionError('מועד התזמון חייב להיות בעתיד', { published_at: 'מועד שעבר' });
      }
      return { status: 'published', published_at: publishedAtIso };
    }
    case 'published': {
      // Keep the original date unless the editor changed it; never a future date here.
      let at = publishedAtIso ?? existing?.published_at ?? now.toISOString();
      if (new Date(at).getTime() > now.getTime()) at = now.toISOString();
      return { status: 'published', published_at: at };
    }
    case 'draft':
    case 'pending':
    case 'archived':
      return { status: choice as ContentStatus, published_at: publishedAtIso ?? existing?.published_at ?? null };
    default:
      throw new ActionError('סטטוס לא חוקי');
  }
}
