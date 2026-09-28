import type { MetadataRoute } from 'next';
import { SITE_URL, absoluteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/auth/',
          '/account/',
          '/cart/',
          '/checkout/',
          '/partner-portal/',
          '/partner-portal-2/',
          // WordPress leftovers that no longer exist.
          '/wp-admin/',
          '/wp-login.php',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  };
}
