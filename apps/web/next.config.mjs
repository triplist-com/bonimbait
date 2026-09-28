/** @type {import('next').NextConfig} */
const nextConfig = {
  // WordPress parity: pages are served at "/<slug>/". Next's own slash redirect
  // is disabled (it would 308 API routes, which breaks payment webhooks); the
  // middleware 301s page paths to the slash form instead. See
  // docs/ARCHITECTURE_PARITY.md#trailing-slashes.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "nfbasjadvakbsusupcoy.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Storage host of the parity Supabase project (derived from env so a
      // new project needs no code change).
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [
            {
              // http for the local stack (http://127.0.0.1:54321), https in production.
              protocol: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).protocol.replace(":", ""),
              hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
              port: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).port,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
  // SITE_NOINDEX=true keeps a temporary domain (bonimbait.com before the move to
  // bonimbayit.co.il) out of search results so it can't compete with the live
  // site. Crawling stays allowed so search engines see the noindex and drop any
  // pages they already indexed.
  async headers() {
    if (process.env.SITE_NOINDEX !== "true") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
