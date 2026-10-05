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
      // Keeps the precached shell small: a bigger file fails the build until it is added to globIgnores.
      maximumFileSizeToCacheInBytes: 512 * 1024,
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
        // Install precaches only the small shell (HTML pages, CSS, the latin font, icons): ~20 entries,
        // so the worker (registered early from /theme.js) is active before a tool's first run ends.
        // JS chunks and codec wasm are cached at runtime: by these CacheFirst rules once the worker
        // controls the page, and before that by the page and tool workers themselves
        // (src/lib/offline-cache.ts writes into the same caches). A tool that ran once on a page
        // works offline on reload.
        globPatterns: ['**/*.{html,css,woff2,svg,png,ico}', 'theme.js'],
        clientsClaim: true,
        parallel: { enabled: true, concurrency: 64 },
        // Non-latin font subsets load only when a page needs them (runtime rule below); the manifest
        // icons are added to the precache by the plugin itself, so the glob skips their PNG copies.
        globIgnores: ['models/**', 'ort/**', 'codecs/**', 'og/**', '_astro/w/**', '_astro/inter-{cyrillic,greek,vietnamese,latin-ext}*.woff2', 'icons/*.png'],
        navigateFallback: null,
        cleanURLs: true,
        runtimeCaching: [
          {
            // Non-latin Inter subsets (the latin one is precached).
            urlPattern: /\/_astro\/inter-[^/]+\.woff2$/,
            handler: 'CacheFirst',
            options: { cacheName: 'nopload-fonts', expiration: { maxEntries: 20 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: /\/(models|ort|codecs)\//,
            handler: 'CacheFirst',
            options: { cacheName: 'nopload-heavy', expiration: { maxEntries: 200 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // Codec wasm emitted by Vite for the batch tools.
            urlPattern: /\/_astro\/[^/]+\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'nopload-wasm', expiration: { maxEntries: 40 }, cacheableResponse: { statuses: [200] } },
          },
          {
            // Hashed JS chunks (none are precached; worker-only ones, incl. libheif, live in _astro/w/).
            urlPattern: /\/_astro\/(w\/)?[^/]+\.m?js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'nopload-js', expiration: { maxEntries: 60 }, cacheableResponse: { statuses: [200] } },
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
    worker: {
      format: 'es',
      // Worker-only chunks (codec glue, ORT) go to their own folder so the service worker can leave
      // them out of the precached shell; the worker caches them at runtime (src/lib/offline-cache.ts).
      rollupOptions: { output: { chunkFileNames: '_astro/w/[name]-[hash].js' } },
    },
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
