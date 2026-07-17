import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  // Large file uploads (videos up to 5 GB) must not be truncated by
  // the middleware. The /api/upload route is also excluded from the
  // middleware matcher in proxy.ts, but this acts as a safety net.
  experimental: {
    proxyClientMaxBodySize: '5gb',
  },
};

export default nextConfig;
