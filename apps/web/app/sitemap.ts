import type { MetadataRoute } from 'next';
import { SCENARIOS } from '../lib/calculator-scenarios';

const BASE_URL = 'https://bonimbait.com';

// Actual category slugs matching data/videos.json
const categorySlugs = [
  'planning-permits',
  'structure-construction',
  'finishes-design',
  'electrical-plumbing',
  'contractors-labor',
  'costs-pricing',
  'general-tips',
  'landscaping-yard',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/videos`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/categories`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/search`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  const categoryPages: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: `${BASE_URL}/category/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  // Generate video pages from local data
  let videoPages: MetadataRoute.Sitemap = [];
  try {
    // Dynamic import to avoid bundling in client
    const { getVideos } = await import('./api/_lib/data');
    const { videos } = getVideos({ limit: 1000 });
    videoPages = videos.map((v) => ({
      url: `${BASE_URL}/video/${v.id}`,
      lastModified: v.published_at ? new Date(v.published_at) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch {
    // Skip video pages if data unavailable
  }

  // Calculator main page + 20 scenario pages
  const calculatorPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/calculator`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    },
    ...SCENARIOS.map((scenario) => ({
      url: `${BASE_URL}/calculator/${scenario.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];

  return [...staticPages, ...categoryPages, ...calculatorPages, ...videoPages];
}
