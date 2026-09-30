import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const isHttpsPreview = Boolean(
    process.env.APP_URL?.startsWith('https://') ||
    process.env.K_SERVICE ||
    process.env.K_REVISION
  );
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon.png',
          'apple-touch-icon.png',
          'bujhchi-logo.png',
          'buchi-logo.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'manifest.webmanifest',
          'manifest.json',
        ],
        manifest: {
          id: '/',
          name: 'বুজ্জি',
          short_name: 'বুজ্জি',
          description: 'বাংলা স্মার্ট এআই পার্সোনাল অ্যাসিস্ট্যান্ট — বুজ্জি',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#031337',
          background_color: '#031337',
          lang: 'bn',
          categories: ['productivity', 'utilities', 'lifestyle'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,jpg}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: {
        clientPort: isHttpsPreview
          ? 443
          : (process.env.HMR_CLIENT_PORT ? parseInt(process.env.HMR_CLIENT_PORT, 10) : undefined),
      },
      watch: isHmrDisabled ? null : {},
    },
  };
});
