import Link from 'next/link';
import type { ProductRow } from '@/lib/db/types';
import { effectivePrice, formatPrice } from '@/lib/db/commerce';
import { htmlToText } from '@/lib/commerce/seo';

/** Benefit card as on /הטבות-לקהילה/ and the stage archives ("לעמוד הטבה"). */
export default function ProductCard({
  product,
  showExcerpt = true,
  children,
}: {
  product: ProductRow;
  showExcerpt?: boolean;
  /** Extra actions under the card (e.g. add-to-cart on the product_cat archive). */
  children?: React.ReactNode;
}) {
  const href = `/product/${product.slug}/`;
  const price = effectivePrice(product);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card transition hover:shadow-card-hover">
      <Link href={href} className="relative block aspect-[16/9] overflow-hidden bg-gray-100" tabIndex={-1} aria-hidden="true">
        {product.featured_image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.featured_image}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        {product.tag_label && (
          <span className="w-fit rounded-full bg-primary-50 px-3 py-0.5 text-xs font-medium text-primary-700">
            {product.tag_label}
          </span>
        )}
        <h3 className="text-lg font-bold leading-snug text-gray-900">
          <Link href={href} className="hover:text-primary">
            {product.name}
          </Link>
        </h3>
        {price > 0 && <p className="text-xl font-bold text-gray-900">{formatPrice(price)}</p>}
        <p className="text-sm font-medium text-secondary-700">לחברי קהילת בונים בית</p>
        {showExcerpt && product.description_html && (
          <p className="line-clamp-3 text-sm text-gray-600">{htmlToText(product.description_html, 160)}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          <Link
            href={href}
            className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary hover:text-white"
          >
            לעמוד הטבה
          </Link>
          {children}
        </div>
      </div>
    </article>
  );
}
