import withPWA from 'next-pwa';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
      },
      {
        protocol: 'http',
        hostname: '192.168.1.8',
        port: '3000',
      },
    ],
  },
  allowedDevOrigins: [
    'https://localhost:3000',
    'http://localhost:3000',
    'https://192.168.1.7:3000',
    'http://192.168.1.7:3000',
    'https://192.168.1.8:3000',
    'http://192.168.1.8:3000',
  ],
};

export default withPWA({
  register: true,
  skipWaiting: true,
  // Enable PWA in development as well
  disable: false,
})(nextConfig);