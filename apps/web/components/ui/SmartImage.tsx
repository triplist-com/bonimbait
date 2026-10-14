import Image from 'next/image';
import { cn } from '@/lib/cn';
import { isOptimizableImage } from '@/lib/images';

export interface SmartImageProps {
  src: string;
  alt: string;
  /** Responsive sizes hint, e.g. "(min-width: 1024px) 64rem, 100vw". */
  sizes: string;
  /** LCP image: preload with high priority (otherwise lazy). */
  priority?: boolean;
  fit?: 'cover' | 'contain';
  quality?: number;
  className?: string;
}

/**
 * Fills its positioned parent. Uses next/image (resized AVIF/WebP, lazy by
 * default) when the host is configured in next.config.mjs, otherwise a plain
 * <img> with the same layout.
 */
export function SmartImage({ src, alt, sizes, priority, fit = 'cover', quality, className }: SmartImageProps) {
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  if (isOptimizableImage(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} quality={quality} className={cn(fitClass, className)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- host not configured for next/image
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : {})}
      className={cn('absolute inset-0 size-full', fitClass, className)}
    />
  );
}
