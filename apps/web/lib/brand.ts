/**
 * Brand facts in one place: community numbers, channels and contact details.
 * The proof bar, footer and pitch pages read from here, so updating a number
 * is a one-line change. Numbers are the live site's (bonimbayit.co.il footer,
 * 2026-10). Client-safe.
 */

export interface CommunityStat {
  id: 'whatsapp' | 'youtube' | 'spotify' | 'facebook';
  network: string;
  /** Display value, as published by the owner. */
  value: string;
  label: string;
  href: string;
}

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/channel/UCCehs0A1gUmOUtZIhvkXVJQ';
export const SPOTIFY_SHOW_URL = 'https://open.spotify.com/show/54ad9OeT6XsRf8ZtUtC4Su';
export const FACEBOOK_URL = 'https://www.facebook.com/bonimbayit/';
export const INSTAGRAM_URL = 'https://www.instagram.com/tomer.chen.rihana/';
export const TIKTOK_URL = 'https://www.tiktok.com/@tomer.chen.rihana';
export const WHATSAPP_COMMUNITY_PATH = '/הצטרפו-לקבוצות-הווטסאפ/';

export const COMMUNITY_STATS: CommunityStat[] = [
  { id: 'whatsapp', network: 'WhatsApp', value: '10,000', label: 'חברי קהילה', href: WHATSAPP_COMMUNITY_PATH },
  { id: 'youtube', network: 'YouTube', value: '24,000', label: 'מנויים', href: YOUTUBE_CHANNEL_URL },
  { id: 'spotify', network: 'Spotify', value: '50,000+', label: 'השמעות', href: SPOTIFY_SHOW_URL },
  { id: 'facebook', network: 'Facebook', value: '14,000', label: 'חברים', href: FACEBOOK_URL },
];

/** Media facts used in copy (owner's numbers). */
export const MEDIA_FACTS = {
  podcastEpisodes: 112,
  channelVideos: 900,
} as const;

/** The owner's channel trailer (hero facade on the live site). */
export const CHANNEL_TRAILER = {
  youtubeId: 'gUrvdx_xZjM',
  title: 'בונים בית: אתכם עד המפתח',
  poster: '/brand/tomer-trailer-poster.jpg',
  posterWidth: 726,
  posterHeight: 454,
} as const;

export const CONTACT_DETAILS = {
  phone: '03-9440467',
  address: 'שושנה דמארי 30, חולון',
} as const;

export const BRAND_TAGLINE = 'אתכם עד המפתח';
