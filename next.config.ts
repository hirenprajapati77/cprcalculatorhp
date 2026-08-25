import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  generateBuildId: async () => {
    return 'cpr-platform-prod';
  },
};

export default nextConfig;
