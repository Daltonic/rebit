import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone output bundles the app and all its dependencies into a
  // single directory (`.next/standalone`) that can be copied into a
  // Docker image without node_modules. The minimal runtime only needs
  // Node.js and the `public/` + `.next/static/` folders alongside it.
  output: 'standalone',

  // Allow images from any remote host. Without this, Next.js blocks
  // external images in production with a 403. The double-wildcard
  // pattern matches any protocol, any hostname, any port, any path.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },

  // Large file uploads (videos up to 5 GB) must not be truncated by
  // the middleware. The /api/upload route is also excluded from the
  // middleware matcher in proxy.ts, but this acts as a safety net.
  experimental: {
    proxyClientMaxBodySize: '5gb',
  },
};

export default nextConfig;