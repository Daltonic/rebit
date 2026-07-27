import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow all origins in development (needed for GitHub Codespaces,
  // where the app is accessed via a *.preview.app.github.dev URL).
  // In production, this option has no effect.
  allowedDevOrigins: ['127.0.0.1', '.preview.app.github.dev', 'manufacturers-transaction-features-guam.trycloudflare.com'],
  // Large file uploads (videos up to 5 GB) must not be truncated by
  // the middleware. The /api/upload route is also excluded from the
  // middleware matcher in proxy.ts, but this acts as a safety net.
  experimental: {
    proxyClientMaxBodySize: '5gb',
  },
};

export default nextConfig;