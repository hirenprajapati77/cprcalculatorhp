import type { NextConfig } from 'next';
import { resolveBuildId } from './src/lib/build-id';

const nextConfig: NextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    return resolveBuildId();
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/market-tools',
        destination: '/market-tools/breadth',
        permanent: true,
      },
      {
        source: '/market-tools/heatmap',
        destination: '/heatmap',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
