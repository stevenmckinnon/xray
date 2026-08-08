import type { NextConfig } from 'next';

const config: NextConfig = {
  // The xray repo root has its own lockfile; be explicit so Next stops guessing.
  outputFileTracingRoot: import.meta.dirname,
  // A single static page; export it so it can be hosted anywhere.
  output: 'export',
  images: { unoptimized: true },
};

export default config;
