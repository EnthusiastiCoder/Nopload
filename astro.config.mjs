// @ts-check

import { fileURLToPath } from 'node:url';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { AstroPWAIntegration as AstroPWA } from '@vite-pwa/astro';
import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || 'https://nopload.pages.dev';

// Dev server gets the same isolation headers as production (public/_headers).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  output: 'static',
  site,
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'auto' },
  integrations: [
    preact(),
    sitemap({ filter: (page) => !/\/(404|offline)$/.test(page.replace(/\/$/, '')) }),
    AstroPWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Nopload',
        short_name: 'Nopload',
        description: 'Edit images without uploading them. Background remover, compressor, converter and more, all in your browser.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b0d12',
        theme_color: '#5b3df5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,woff2,svg,png,ico}'],
        globIgnores: ['models/**', 'ort/**', 'codecs/**', 'og/**'],
        navigateFallback: null,
        cleanURLs: true,
        runtimeCaching: [
          {
            urlPattern: /\/(models|ort|codecs)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'nopload-heavy', expiration: { maxEntries: 200 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  server: { port: 4321, headers: isolation },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      // ORT's default entries inline the glue and reference the .wasm via import.meta.url, so Vite
      // would emit a second copy of each wasm into dist/_astro. The "extern wasm" builds load both
      // from ort.env.wasm.wasmPaths (/ort/, copied by scripts/copy-runtime-assets.mjs) instead.
      alias: [
        {
          find: /^onnxruntime-web\/(wasm|jspi)$/,
          replacement: fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.$1.min.mjs', import.meta.url)),
        },
      ],
    },
    server: { headers: isolation },
    preview: { headers: isolation },
    worker: { format: 'es' },
    optimizeDeps: {
      exclude: [
        'onnxruntime-web',
        '@jsquash/jpeg',
        '@jsquash/png',
        '@jsquash/oxipng',
        '@jsquash/webp',
        '@jsquash/avif',
        '@jsquash/jxl',
        '@jsquash/resize',
      ],
    },
  },
});
