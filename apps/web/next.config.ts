import { withSentryConfig } from '@sentry/nextjs';
import { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'path';
import pkg from './package.json' with { type: 'json' };

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n.ts',
  experimental: {
    createMessagesDeclaration: './src/locales/en.json',
  },
});

const nextConfig: NextConfig = {
  reactStrictMode: false, // TODO: Enable, fixes react-leaflet for nextjs 15
  output: 'standalone',
  typedRoutes: true,
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  env: {
    version: pkg.version,
  },
  experimental: {
    clientTraceMetadata: ['sentry-trace', 'baggage'],
  },
  images: {
    remotePatterns: [
      {
        hostname: 'storage.lukittu.com',
        protocol: 'https',
      },
      {
        hostname: 'cdn.discordapp.com',
        protocol: 'https',
      },
    ],
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'lukittu',
  project: 'lukittu-next',

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    enabled: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: {
    disable: false, // Enable source maps (default: false)
    ignore: [
      '**/node_modules/**',
      '**/coverage/**',
      '**/syncTranslations.js',
      '**/checkTranslations.js',
    ], // Files to exclude
    deleteSourcemapsAfterUpload: true, // Security: delete after upload
  },

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
