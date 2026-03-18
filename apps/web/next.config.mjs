/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
};

export default nextConfig;
