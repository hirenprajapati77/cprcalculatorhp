import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
