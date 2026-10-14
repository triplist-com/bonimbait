import { cn } from '@/lib/cn';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, string> = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
};

/** First letters of the first two words: "תומר חן" -> "תח". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join('');
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  shape?: 'circle' | 'rounded';
  /** White ring, for avatars overlapping images or each other. */
  ring?: boolean;
  /** `contain` for logos, `cover` (default) for photos. */
  fit?: 'cover' | 'contain';
  className?: string;
}

/** Person or business avatar; falls back to initials on a brand tint. */
export function Avatar({ name, src, size = 'md', shape = 'circle', ring, fit = 'cover', className }: AvatarProps) {
  const classes = cn(
    'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-primary-50 font-bold text-primary-700',
    shape === 'circle' ? 'rounded-full' : 'rounded-xl',
    ring && 'ring-2 ring-white',
    SIZES[size],
    className,
  );
  if (src) {
    return (
      <span className={cn(classes, fit === 'contain' && 'bg-white')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote logos of many hosts; tiny images */}
        <img src={src} alt={name} loading="lazy" decoding="async" className={cn('size-full', fit === 'contain' ? 'object-contain p-1' : 'object-cover')} />
      </span>
    );
  }
  return (
    <span className={classes} role="img" aria-label={name}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
