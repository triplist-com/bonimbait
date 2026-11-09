import 'server-only';

import { revalidatePath } from 'next/cache';
import { forgetRuntimeVideo } from './registry';
import { clearRuntimeListCache } from './video-list';

/**
 * ISR invalidation when a runtime video is published, unpublished or edited:
 * its /video/<id>/ page (both slash forms, see lib/admin/revalidate.ts), the
 * other /video/* pages (a legacy page that embeds the video links to its AI
 * page; same as the legacy video editor), the lists that show it (homepage
 * rails and the video hub, whose Hebrew path is cached under both forms) and
 * the sitemap. Search and /videos need nothing: they query the store live.
 */
const HUB = '/בונים-בית-tv/';

export function revalidateRuntimeVideo(youtubeId: string): void {
  forgetRuntimeVideo(youtubeId);
  clearRuntimeListCache();
  for (const p of [
    `/video/${youtubeId}/`,
    `/video/${youtubeId}`,
    '/',
    HUB,
    HUB.replace(/\/$/, ''),
    encodeURI(HUB),
    encodeURI(HUB).replace(/\/$/, ''),
    '/sitemap.xml',
  ])
    revalidatePath(p);
  revalidatePath('/video/[id]', 'page');
}
