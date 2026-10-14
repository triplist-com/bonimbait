import 'server-only';

import { revalidatePath } from 'next/cache';
import { forgetRuntimeVideo } from './registry';

/**
 * ISR invalidation when a runtime video is published, unpublished or edited:
 * its /video/<id>/ page (both slash forms, see lib/admin/revalidate.ts), the
 * other /video/* pages (a legacy page that embeds the video links to its AI
 * page; same as the legacy video editor) and the sitemap. Search needs
 * nothing: it queries the store live.
 */
export function revalidateRuntimeVideo(youtubeId: string): void {
  forgetRuntimeVideo(youtubeId);
  for (const p of [`/video/${youtubeId}/`, `/video/${youtubeId}`, '/sitemap.xml']) revalidatePath(p);
  revalidatePath('/video/[id]', 'page');
}
