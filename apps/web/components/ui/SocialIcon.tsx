import type { SocialId } from '@/lib/nav';

/**
 * Simplified social network glyphs (lucide v1 ships no brand icons).
 * Decorative: the link around them carries the accessible name.
 */
export function SocialIcon({ id, className = 'size-5' }: { id: SocialId | 'whatsapp'; className?: string }) {
  const common = { className, 'aria-hidden': true as const, viewBox: '0 0 24 24' };
  switch (id) {
    case 'youtube':
      return (
        <svg {...common} fill="currentColor">
          <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.27 5 12 5 12 5s-6.27 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.73 19 12 19 12 19s6.27 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15.1V8.9l5.2 3.1Z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.86.24-1.45 1.48-1.45h1.58V4.37A21 21 0 0 0 14.27 4.2c-2.28 0-3.84 1.39-3.84 3.95v2.24H7.85v3h2.58V21Z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
          <circle cx="12" cy="12" r="3.8" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg {...common} fill="currentColor">
          <path d="M16.6 3h-3.1v11.9a2.7 2.7 0 1 1-2.7-2.7c.27 0 .53.04.78.11V9.15a5.8 5.8 0 1 0 5.02 5.75V8.9a7.4 7.4 0 0 0 4.3 1.37V7.2a4.3 4.3 0 0 1-4.3-4.2Z" />
        </svg>
      );
    case 'spotify':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.2" strokeWidth="1.8" />
          <path d="M7.4 9.6c3.2-1 6.9-.75 9.6.9" strokeWidth="1.9" />
          <path d="M8 12.6c2.6-.75 5.5-.5 7.6.75" strokeWidth="1.7" />
          <path d="M8.6 15.4c2-.5 4.1-.33 5.7.55" strokeWidth="1.5" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg {...common} fill="currentColor">
          <path d="M12.04 2.5a9.45 9.45 0 0 0-8.18 14.2L2.5 21.5l4.93-1.3a9.46 9.46 0 1 0 4.6-17.7Zm0 17.3a7.86 7.86 0 0 1-4-1.1l-.29-.17-2.93.77.78-2.86-.19-.3a7.85 7.85 0 1 1 6.63 3.66Zm4.3-5.88c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06a6.4 6.4 0 0 1-1.9-1.17 7.1 7.1 0 0 1-1.31-1.64c-.14-.24 0-.37.1-.49.11-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.41h-.46a.88.88 0 0 0-.64.3 2.68 2.68 0 0 0-.84 2c0 1.17.86 2.31.98 2.47.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.58.19 1.1.16 1.51.1.46-.07 1.4-.57 1.6-1.13.2-.56.2-1.04.14-1.13-.06-.1-.22-.16-.46-.28Z" />
        </svg>
      );
    default:
      return null;
  }
}
