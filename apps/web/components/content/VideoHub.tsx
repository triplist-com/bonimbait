import Link from 'next/link';
import StructuredData from '@/components/StructuredData';
import { STAGE_CATEGORY_SLUGS } from '@/lib/content/queries';
import { legacyCategories, loadAllVideoPages, type VideoHubItem } from '@/lib/content/videos';
import { absoluteUrl } from '@/lib/site';
import Breadcrumbs from './Breadcrumbs';
import CommunityCTA from './CommunityCTA';
import VideoPageCard from './VideoPageCard';

const YOUTUBE_CHANNEL = 'https://www.youtube.com/channel/UCCehs0A1gUmOUtZIhvkXVJQ?sub_confirmation=1';

const CHANNEL_FEATURES = [
  'רעיונות, טיפים והכרות עם בעלי מקצוע',
  'סיורי שטח מצולמים',
  'יותר מ-700 סרטונים',
  'וידאו פודקאסטים',
  'מפגשים עם בעלי מקצוע מובחרים',
  'לייבים',
];

function Grid({ items }: { items: VideoHubItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {items.map((v) => (
        <VideoPageCard key={v.id} video={v} />
      ))}
    </div>
  );
}

async function VideoHubContent() {
  const all = await loadAllVideoPages();
  const podcasts = all.filter((v) => v.kind === 'podcast');

  // Group by the live video categories (construction stages), 4 per stage.
  const byStage = new Map<string, { name: string; items: VideoHubItem[] }>();
  for (const v of all) {
    for (const c of legacyCategories(v.legacy_categories)) {
      const slug = c.slug.normalize('NFC');
      if (!(STAGE_CATEGORY_SLUGS as readonly string[]).includes(slug)) continue;
      const entry = byStage.get(slug) ?? { name: c.name, items: [] };
      entry.items.push(v);
      byStage.set(slug, entry);
    }
  }
  const stages = STAGE_CATEGORY_SLUGS.flatMap((slug) => {
    const e = byStage.get(slug);
    return e && e.items.length ? [{ slug, ...e }] : [];
  });

  return (
    <div className="pb-16">
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'בונים בית TV',
          url: absoluteUrl('/בונים-בית-tv/'),
          inLanguage: 'he-IL',
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: all.length,
            itemListElement: all.slice(0, 50).map((v, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: absoluteUrl(`/video/${v.legacy_slug}/`),
              name: v.title,
            })),
          },
        }}
      />

      <header className="bg-gradient-to-br from-gray-900 via-gray-900 to-primary-900 text-white pt-6 sm:pt-10 pb-12">
        <div className="container-page">
          <div className="[&_a]:text-gray-300 [&_a:hover]:text-white [&_span]:text-gray-200">
            <Breadcrumbs
              crumbs={[
                { label: 'ראשי', href: '/' },
                { label: 'בונים בית TV', href: '/בונים-בית-tv/' },
              ]}
            />
          </div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold mb-4">בונים בית TV</h1>
              <p className="text-lg text-gray-300 max-w-2xl leading-relaxed">
                ערוץ הבניה המוביל בישראל: סיורי שטח, פודקאסטים ומפגשים עם בעלי מקצוע, מסודרים לפי שלבי הבניה.
              </p>
              <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-200">
                {CHANNEL_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white/10 backdrop-blur p-6 text-center">
              <p className="text-4xl font-bold">21,000</p>
              <p className="text-gray-300 mb-4">עוקבים בערוץ היוטיוב שלנו</p>
              <a
                href={YOUTUBE_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 transition-colors"
              >
                הצטרפו גם אתם
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="container-page">
        {stages.length > 0 && (
          <nav aria-label="מצא סרטון לפי שלב בניה" className="py-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">מצא סרטון לפי שלב בניה</h2>
            <ul className="flex flex-wrap gap-2">
              {stages.map((s) => (
                <li key={s.slug}>
                  <a
                    href={`#stage-${s.slug}`}
                    className="inline-block rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-primary hover:text-primary transition-colors"
                  >
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {all.length === 0 && <p className="py-16 text-center text-gray-500">הסרטונים יתעדכנו בקרוב.</p>}

        {stages.map((s) => (
          <section key={s.slug} id={`stage-${s.slug}`} className="py-8 scroll-mt-24" aria-labelledby={`h-${s.slug}`}>
            <div className="flex items-center justify-between mb-5">
              <h2 id={`h-${s.slug}`} className="text-2xl font-bold text-gray-900">
                {s.name}
              </h2>
              <Link href={`/category/${s.slug}/`} className="text-sm font-medium text-primary hover:text-primary-700">
                לכל המדריכים
              </Link>
            </div>
            <Grid items={s.items.slice(0, 4)} />
          </section>
        ))}

        {podcasts.length > 0 && (
          <section className="py-8" aria-labelledby="h-podcasts">
            <h2 id="h-podcasts" className="text-2xl font-bold text-gray-900 mb-5">
              פודקאסט בונים בית
            </h2>
            <Grid items={podcasts.slice(0, 8)} />
          </section>
        )}

        {all.length > 0 && (
          <section className="py-8" aria-labelledby="h-all">
            <h2 id="h-all" className="text-2xl font-bold text-gray-900 mb-5">
              כל הסרטונים <span className="text-gray-400 font-normal text-lg">({all.length})</span>
            </h2>
            <Grid items={all} />
          </section>
        )}

        <div className="mt-8">
          <CommunityCTA />
        </div>
      </div>
    </div>
  );
}

/** /בונים-בית-tv/: the live video hub (registered in lib/special-pages/content.ts). */
export default function VideoHub() {
  return <VideoHubContent />;
}
