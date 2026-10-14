/**
 * Which image URLs next/image may optimise. Mirrors images.remotePatterns in
 * next.config.mjs; anything else (e.g. a future media CDN host) falls back to
 * a plain <img> instead of a broken optimised one. Client-safe.
 */

interface Pattern {
  protocol?: string;
  hostname: string;
  port?: string;
  pathPrefix: string;
}

function supabasePattern(): Pattern | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { protocol: u.protocol, hostname: u.hostname, port: u.port, pathPrefix: '/storage/v1/object/public/' };
  } catch {
    return null;
  }
}

export function remoteImagePatterns(): Pattern[] {
  const list: Pattern[] = [
    { protocol: 'https:', hostname: 'img.youtube.com', pathPrefix: '/vi/' },
    { protocol: 'https:', hostname: 'i.ytimg.com', pathPrefix: '/vi/' },
    { protocol: 'https:', hostname: 'nfbasjadvakbsusupcoy.supabase.co', pathPrefix: '/storage/v1/object/public/' },
  ];
  const sb = supabasePattern();
  if (sb) list.push(sb);
  return list;
}

/** True for local paths ("/brand/x.jpg") and URLs next/image is configured for. */
export function isOptimizableImage(src: string | null | undefined, patterns: Pattern[] = remoteImagePatterns()): boolean {
  if (!src) return false;
  if (src.startsWith('/') && !src.startsWith('//')) return true;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  return patterns.some(
    (p) =>
      (!p.protocol || p.protocol === u.protocol) &&
      p.hostname === u.hostname &&
      (p.port === undefined || p.port === u.port) &&
      u.pathname.startsWith(p.pathPrefix),
  );
}
