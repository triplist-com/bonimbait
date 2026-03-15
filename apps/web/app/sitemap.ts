import type { MetadataRoute } from 'next';

const BASE_URL = 'https://bonimbait.com';

const categorySlugs = [
  'planning',
  'costs',
  'construction',
  'electrical',
  'finishing',
  'contractors',
  'regulations',
  'tips',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  const categoryPages: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: `${BASE_URL}/category/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Placeholder for video pages - in production, fetch video IDs from the API
  // const videoPages: MetadataRoute.Sitemap = videoIds.map((id) => ({
  //   url: `${BASE_URL}/video/${id}`,
  //   lastModified: now,
  //   changeFrequency: 'monthly' as const,
  //   priority: 0.6,
  // }));

  return [...staticPages, ...categoryPages];
}
