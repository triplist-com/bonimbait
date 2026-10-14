import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { formatHebrewDate } from '@/lib/content/seo';
import { htmlToText } from '@/lib/content/sanitize';
import { stageForCategory } from '@/lib/stages';
import { Badge } from '@/components/ui/Badge';

export interface PostCardData {
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt: string | null;
  published_at: string | null;
  categoryName?: string | null;
  /** Primary category slug: posts without an image show their stage icon. */
  categorySlug?: string | null;
}

/** Article card for archives, related posts and the homepage. */
export default function PostCard({ post, priority = false }: { post: PostCardData; priority?: boolean }) {
  const href = `/${post.slug}/`;
  const excerpt = htmlToText(post.excerpt, 140);
  const stage = post.categorySlug ? stageForCategory(post.categorySlug) : undefined;
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="relative aspect-[16/10] overflow-hidden bg-sand-100">
        {post.featured_image ? (
          // Storage images through plain <img> (lazy, many hosts); priority cards load eagerly.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featured_image}
            alt={post.featured_image_alt || ''}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            {...(priority ? { fetchPriority: 'high' as const } : {})}
            className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="bg-blueprint flex size-full items-center justify-center" aria-hidden="true">
            <span className="inline-flex size-24 items-center justify-center rounded-[1.75rem] bg-white shadow-card ring-1 ring-sand-200">
              {/* eslint-disable-next-line @next/next/no-img-element -- owner's stage icon */}
              <img src={stage?.icon ?? '/brand/monogram.svg'} alt="" className={stage ? 'h-10 w-14 object-contain' : 'size-12'} />
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {post.categoryName && (
          <Badge tone="brand" size="sm" className="mb-3 self-start">
            {post.categoryName}
          </Badge>
        )}
        <h3 className="mb-2 line-clamp-2 text-title leading-snug text-ink-900 transition-colors group-hover:text-primary-700">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {post.title}
          </Link>
        </h3>
        {excerpt && <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-ink-600">{excerpt}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 text-xs text-ink-500">
          {post.published_at ? <time dateTime={post.published_at}>{formatHebrewDate(post.published_at)}</time> : <span />}
          <span className="inline-flex items-center gap-1 font-semibold text-ink-700 transition-colors group-hover:text-primary-700">
            לקריאה
            <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
          </span>
        </div>
      </div>
    </article>
  );
}

export function PostGrid({ posts, priorityCount = 0 }: { posts: PostCardData[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((p, i) => (
        <PostCard key={p.slug} post={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
