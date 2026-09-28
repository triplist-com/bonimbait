import Link from 'next/link';
import { formatHebrewDate } from '@/lib/content/seo';
import { htmlToText } from '@/lib/content/sanitize';

export interface PostCardData {
  slug: string;
  title: string;
  excerpt: string | null;
  featured_image: string | null;
  featured_image_alt: string | null;
  published_at: string | null;
  categoryName?: string | null;
}

/** Article card for archives, related posts and the homepage. */
export default function PostCard({ post, priority = false }: { post: PostCardData; priority?: boolean }) {
  const href = `/${post.slug}/`;
  const excerpt = htmlToText(post.excerpt, 140);
  return (
    <article className="group relative flex flex-col bg-white rounded-2xl border border-gray-100 shadow-card hover:shadow-card-hover transition-shadow overflow-hidden">
      <div className="aspect-[16/9] bg-gradient-to-br from-primary-50 to-secondary-50 overflow-hidden">
        {post.featured_image ? (
          // Remote WordPress/blogspot images: plain <img> (hosts are not in next/image remotePatterns).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.featured_image}
            alt={post.featured_image_alt || post.title}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary-300" aria-hidden="true">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
            </svg>
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 p-5">
        {post.categoryName && (
          <span className="self-start mb-2 text-xs font-semibold text-primary bg-primary-50 px-2.5 py-1 rounded-full">
            {post.categoryName}
          </span>
        )}
        <h3 className="font-bold text-gray-900 leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          <Link href={href} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>
        {excerpt && <p className="text-sm text-gray-500 leading-relaxed line-clamp-3 mb-3">{excerpt}</p>}
        {post.published_at && (
          <time dateTime={post.published_at} className="mt-auto text-xs text-gray-400">
            {formatHebrewDate(post.published_at)}
          </time>
        )}
      </div>
    </article>
  );
}

export function PostGrid({ posts, priorityCount = 0 }: { posts: PostCardData[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {posts.map((p, i) => (
        <PostCard key={p.slug} post={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
