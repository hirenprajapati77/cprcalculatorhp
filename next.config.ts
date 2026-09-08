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
};

export default nextConfig;
