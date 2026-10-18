/** Analytics constants shared by the browser tracker and the server. Client-safe. */

export const TRACK_ENDPOINT = '/api/track';

/** First-party visitor id (uuid), set by POST /api/track. httpOnly. */
export const ANON_COOKIE = 'bb_aid';
export const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** Session id (uuid), sliding: refreshed by every /api/track call. httpOnly. */
export const SESSION_COOKIE = 'bb_sid';
export const SESSION_COOKIE_MAX_AGE = 30 * 60; // 30 minutes of inactivity

/** Batch limits (the browser keeps keepalive bodies under 64KB). */
export const MAX_BATCH_EVENTS = 25;
export const MAX_BODY_BYTES = 32 * 1024;
