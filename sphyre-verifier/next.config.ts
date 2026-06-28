import type { NextConfig } from "next";
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone',
};

const pwaConfig = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development'
});

// Use a more specific type assertion to resolve type incompatibility
// between Next.js and next-pwa without using 'any'
export default pwaConfig(nextConfig as unknown as Parameters<typeof pwaConfig>[0]);
