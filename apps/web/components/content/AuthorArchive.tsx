import { notFound } from 'next/navigation';
import StructuredData from '@/components/StructuredData';
import type { AuthorRow } from '@/lib/db/types';
import { loadPostsPage, totalPagesOf } from '@/lib/content/archives';
import { htmlToText } from '@/lib/content/sanitize';
import { absoluteUrl } from '@/lib/site';
import PostArchive from './PostArchive';

/** /author/<slug>/ and /author/<slug>/page/<n>/. */
export default async function AuthorArchive({ author, page }: { author: AuthorRow; page: number }) {
  const result = await loadPostsPage(page, undefined, author.id);
  const totalPages = totalPagesOf(result);
  if (page > totalPages) notFound();
  const bio = htmlToText(author.bio_html, 1000);

  return (
    <>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          url: absoluteUrl(`/author/${author.slug}/`),
          mainEntity: {
            '@type': 'Person',
            name: author.name,
            description: bio || undefined,
            image: author.avatar_url || undefined,
          },
        }}
      />
      <PostArchive
        title={author.name}
        intro={
          bio || author.avatar_url ? (
            <div className="flex items-start gap-4">
              {author.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={author.avatar_url} alt="" width={64} height={64} className="w-16 h-16 rounded-full flex-shrink-0" />
              )}
              {bio && <p>{bio}</p>}
            </div>
          ) : undefined
        }
        crumbs={[
          { label: 'ראשי', href: '/' },
          { label: 'מרכז הידע', href: '/blog/' },
          { label: author.name, href: `/author/${author.slug}/` },
        ]}
        basePath={`/author/${author.slug}/`}
        page={page}
        totalPages={totalPages}
        posts={result.items}
      />
    </>
  );
}
