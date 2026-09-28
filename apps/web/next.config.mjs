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
              protocol: "https",
              hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
  },
};

export default nextConfig;
