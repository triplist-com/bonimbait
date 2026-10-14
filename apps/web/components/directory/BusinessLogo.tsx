import Image from 'next/image';
import { isOptimizableImage } from '@/lib/images';

/**
 * Business logo with an initial-letter fallback. Storage logos go through
 * next/image (many are large PNGs shown at 64px); other hosts use <img>.
 */
export default function BusinessLogo({
  name,
  src,
  className = 'h-16 w-16',
}: {
  name: string;
  src: string | null;
  className?: string;
}) {
  if (src) {
    const cls = `${className} shrink-0 rounded-xl border border-ink-100 bg-white object-contain`;
    if (isOptimizableImage(src)) {
      return <Image src={src} alt={`לוגו ${name}`} width={160} height={160} sizes="80px" className={cls} />;
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={`לוגו ${name}`} loading="lazy" decoding="async" className={cls} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-primary-50 text-2xl font-bold text-primary-700`}
    >
      {name.trim().charAt(0)}
    </span>
  );
}
