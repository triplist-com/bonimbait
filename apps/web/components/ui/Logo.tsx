import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The owner's wordmark ("בּוֹנִים בַּית" lettering from bonimbayit.co.il,
 * public/brand/logo.svg) drawn with currentColor, so it can be ink on light
 * surfaces and white on dark ones. `accent` paints the first letter magenta,
 * like the owner's favicon.
 */
export function Logo({
  className,
  accent = false,
  title = 'בונים בית',
}: {
  className?: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 222 53" role="img" aria-label={title} className={cn('h-8 w-auto', className)} fill="currentColor">
      <path d="M142.14 20.58V14.36H150.36V28.32H136.79V20.59H142.14Z" />
      <path d="M42.46 22.57H36.77V14.35H50.67V28.24H42.45V22.57Z" />
      <path d="M156.14 34.18H162.25V26.14C162.25 23.33 161.33 22.57 158.63 22.57H156.51V14.35H158.63C167.66 14.35 170.47 17.05 170.47 26.14L170.54 42.3H156.14V34.18Z" />
      <g className={accent ? 'text-primary-600' : undefined} fill={accent ? 'currentColor' : undefined}>
        <path d="M192.42 34.18H210.6V26.14C210.6 23.33 209.68 22.57 206.98 22.57H193.07V14.35H206.98C216.01 14.35 218.82 17.05 218.82 26.14V34.18H221.25V42.3H192.42V34.18Z" />
        <path d="M201.94 30.01C202.99 30.01 203.84 29.16 203.84 28.11C203.84 27.06 202.99 26.21 201.94 26.21C200.89 26.21 200.04 27.06 200.04 28.11C200.04 29.16 200.89 30.01 201.94 30.01Z" />
      </g>
      <path d="M55.89 34.2H74.07V26.07C74.07 23.26 73.15 22.5 70.45 22.5H56.54V14.35H70.45C79.48 14.35 82.29 17.05 82.29 26.14V34.2H84.72V42.31H55.89V34.2Z" />
      <path d="M162.86 52.12C163.91 52.12 164.76 51.27 164.76 50.22C164.76 49.17 163.91 48.32 162.86 48.32C161.81 48.32 160.96 49.17 160.96 50.22C160.96 51.27 161.81 52.12 162.86 52.12Z" />
      <path d="M64.86 30.01C65.91 30.01 66.76 29.16 66.76 28.11C66.76 27.06 65.91 26.21 64.86 26.21C63.81 26.21 62.96 27.06 62.96 28.11C62.96 29.16 63.81 30.01 64.86 30.01Z" />
      <path d="M185.29 0H177.6V7.94H185.29V0Z" />
      <path d="M107.7 34.18V22.49H119.71C121.55 22.49 122.52 23.25 122.52 25.19V28.31H130.74V25.32C130.74 17.1 127.82 14.35 119.71 14.35H99.48V42.3H130.74V34.17H107.7V34.18Z" />
      <path d="M19.62 14.35H5.71V22.57H19.62C22.32 22.57 23.24 23.33 23.24 26.14V42.3H31.46V26.14C31.46 17.06 28.65 14.35 19.62 14.35Z" />
      <path d="M5.69 34.16H0V42.29H13.34V27.89H5.69V34.16Z" />
      <path d="M185.68 14.23H177.19V42.3H185.68V14.23Z" />
    </svg>
  );
}

/** Logo linking home, with the accessible name of the destination. */
export function LogoLink({ className, accent = true, inverse }: { className?: string; accent?: boolean; inverse?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="בונים בית: לדף הבית"
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600',
        inverse ? 'text-white' : 'text-ink-900',
        className,
      )}
    >
      <Logo accent={accent} title="בונים בית" className="h-7 sm:h-8" />
    </Link>
  );
}
