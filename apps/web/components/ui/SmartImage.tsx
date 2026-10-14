import Image from 'next/image';
import { cn } from '@/lib/cn';
import { isOptimizableImage } from '@/lib/images';

export interface SmartImageProps {
  src: string;
  alt: string;
  /** Responsive sizes hint, e.g. "(min-width: 1024px) 64rem, 100vw". */
  sizes: string;
  /** LCP image: preload with high priority. */
  priority?: boolean;
  className?: string;
}

/**
 * Fills its positioned parent. Uses next/image (responsive AVIF/WebP) when the
 * host is configured, otherwise a plain <img> with the same layout.
 */
export function SmartImage({ src, alt, sizes, priority, className }: SmartImageProps) {
  if (isOptimizableImage(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={cn('object-cover', className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- host not configured for next/image
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      className={cn('absolute inset-0 size-full object-cover', className)}
    />
  );
}
