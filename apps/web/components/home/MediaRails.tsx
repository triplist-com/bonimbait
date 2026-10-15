import Link from 'next/link';
import type { ReactNode } from 'react';
import { Section } from '@/components/ui/Section';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { SocialIcon } from '@/components/ui/SocialIcon';
import { MEDIA_FACTS, SPOTIFY_SHOW_URL, YOUTUBE_CHANNEL_URL } from '@/lib/brand';
import type { HomeMediaItem } from '@/lib/home/data';

function MediaCard({ item }: { item: HomeMediaItem }) {
  return (
    <li className="w-[78%] sm:w-[46%] lg:w-auto">
      <article className="group relative">
        <VideoThumb
          src={item.thumb}
          duration={item.durationSeconds}
          badge={
            item.kind === 'podcast' ? (
              <Badge tone="glass" size="sm">
                {item.episode ? `פרק ${item.episode}` : 'פודקאסט'}
              </Badge>
            ) : undefined
          }
          size="sm"
        />
        <h3 className="mt-3 line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-white/90 transition-colors group-hover:text-white">
          <Link href={item.href} prefetch={false} className="after:absolute after:inset-0 after:content-['']">
            {item.title}
          </Link>
        </h3>
      </article>
    </li>
  );
}

function Rail({ title, items, action }: { title: string; items: HomeMediaItem[]; action: ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-title-lg text-white">{title}</h3>
        {action}
      </div>
      <ul className="rail -mx-4 scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
        {items.slice(0, 4).map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

/** "בונים בית TV": podcast and video rails on a dark band. */
export default function MediaRails({ podcasts, videos }: { podcasts: HomeMediaItem[]; videos: HomeMediaItem[] }) {
  if (podcasts.length === 0 && videos.length === 0) return null;
  return (
    <Section tone="ink" labelledBy="media-title" className="isolate overflow-hidden">
      <span aria-hidden="true" className="bg-blueprint-dark mask-fade-b absolute inset-0 -z-10" />
      <span aria-hidden="true" className="absolute -top-40 end-[-8rem] -z-10 size-[30rem] rounded-full bg-primary-600/20 blur-3xl" />
      <SectionHeader
        id="media-title"
        inverse
        eyebrow="בונים בית TV"
        title="ערוץ הבנייה המוביל בישראל"
        highlight="ערוץ הבנייה"
        description={`סיורי שטח, טיפים מבעלי מקצוע ו-${MEDIA_FACTS.podcastEpisodes} פרקי פודקאסט. הכול מהשטח, בגובה העיניים.`}
        action={{ href: '/videos/', label: 'לכל הסרטונים' }}
      />
      <div className="space-y-12">
        <Rail
          title="פודקאסט בונים בית"
          items={podcasts}
          action={
            <ButtonLink href={SPOTIFY_SHOW_URL} external variant="inverse" size="sm" iconStart={<SocialIcon id="spotify" />}>
              האזינו בספוטיפיי
            </ButtonLink>
          }
        />
        <Rail
          title="סרטונים מהשטח"
          items={videos}
          action={
            <ButtonLink href={`${YOUTUBE_CHANNEL_URL}?sub_confirmation=1`} external variant="inverse" size="sm" iconStart={<SocialIcon id="youtube" />}>
              הירשמו לערוץ
            </ButtonLink>
          }
        />
      </div>
    </Section>
  );
}
