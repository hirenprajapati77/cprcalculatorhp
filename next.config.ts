import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    return 'cpr-platform-prod';
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
