import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Image produksi (apps/web/Dockerfile) memakai server.js dari Next.
  // `output` tidak memengaruhi `next dev`/`next start` lokal.
  output: 'standalone',
  transpilePackages: ['@nexahome/types'],
};

export default nextConfig;
