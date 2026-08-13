import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // pdfjs-dist ships an optional Node-only `canvas` binding that must never be
  // pulled into the client bundle. The library is only ever imported from
  // client components, so aliasing it away keeps the browser build clean.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
