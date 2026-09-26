# Third-party notices

Nopload is built on the open source projects below. Each licence was checked against the
package's `package.json` `license` field and the LICENSE file it ships.

| Component | Version | Licence | Source |
|---|---|---|---|
| astro | 7.4.13 | MIT | https://www.npmjs.com/package/astro · https://github.com/withastro/astro/blob/main/LICENSE |
| @astrojs/preact | 6.1.6 | MIT | https://www.npmjs.com/package/@astrojs/preact · https://github.com/withastro/astro/blob/main/LICENSE |
| @astrojs/sitemap | 3.7.6 | MIT | https://www.npmjs.com/package/@astrojs/sitemap · https://github.com/withastro/astro/blob/main/LICENSE |
| preact | 11.2.0 | MIT | https://www.npmjs.com/package/preact · https://github.com/preactjs/preact/blob/main/LICENSE |
| tailwindcss | 4.3.5 | MIT | https://www.npmjs.com/package/tailwindcss · https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE |
| @tailwindcss/vite | 4.3.5 | MIT | https://www.npmjs.com/package/@tailwindcss/vite · https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE |
| comlink | 4.4.2 | Apache-2.0 | https://www.npmjs.com/package/comlink · https://github.com/GoogleChromeLabs/comlink/blob/main/LICENSE |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 (Inter font by Rasmus Andersson) | https://www.npmjs.com/package/@fontsource-variable/inter · https://github.com/rsms/inter/blob/master/LICENSE.txt |
| fflate | 0.8.3 | MIT | https://www.npmjs.com/package/fflate · https://github.com/101arrowz/fflate/blob/master/LICENSE |
| exifr | 7.1.3 | MIT | https://www.npmjs.com/package/exifr · https://github.com/MikeKovarik/exifr/blob/master/LICENSE |
| @jsquash/avif | 2.1.1 | Apache-2.0 (bundles its codec's wasm: mozjpeg, oxipng, libwebp, libavif, libjxl; their licences are permissive) | https://www.npmjs.com/package/@jsquash/avif · https://github.com/jamsinclair/jSquash/blob/main/LICENSE
| @jsquash/jpeg | 1.6.0 | Apache-2.0 (bundles its codec's wasm: mozjpeg, oxipng, libwebp, libavif, libjxl; their licences are permissive) | https://www.npmjs.com/package/@jsquash/jpeg · https://github.com/jamsinclair/jSquash/blob/main/LICENSE
| @jsquash/jxl | 1.3.0 | Apache-2.0 (bundles its codec's wasm: mozjpeg, oxipng, libwebp, libavif, libjxl; their licences are permissive) | https://www.npmjs.com/package/@jsquash/jxl · https://github.com/jamsinclair/jSquash/blob/main/LICENSE
| @jsquash/png | 3.1.1 | Apache-2.0 (bundles its codec's wasm: mozjpeg, oxipng, libwebp, libavif, libjxl; their licences are permissive) | https://www.npmjs.com/package/@jsquash/png · https://github.com/jamsinclair/jSquash/blob/main/LICENSE
| @jsquash/webp | 1.5.0 | Apache-2.0 (bundles its codec's wasm: mozjpeg, oxipng, libwebp, libavif, libjxl; their licences are permissive) | https://www.npmjs.com/package/@jsquash/webp · https://github.com/jamsinclair/jSquash/blob/main/LICENSE
| libheif-js (HEIC decoder, wasm build of libheif) | 1.23.5 | LGPL-3.0 (disclosed: loaded as a separate, unmodified wasm module in a worker; source at the link, so it can be replaced) | https://www.npmjs.com/package/libheif-js · https://github.com/catdad-experiments/libheif-js · https://github.com/strukturag/libheif |
| workbox (via vite-plugin-pwa 2.0.0) | 7.4.1 | MIT | https://www.npmjs.com/package/workbox-precaching · https://github.com/GoogleChrome/workbox/blob/v7/LICENSE |
| onnxruntime-web | 1.31.1 | MIT | https://www.npmjs.com/package/onnxruntime-web · https://github.com/microsoft/onnxruntime/blob/main/LICENSE |
| MODNet (portrait matting model, ONNX export by Xenova; `public/models/modnet/`) | MODNet @28165a451e4610c9d77cfdf925a94610bb2810fb, Xenova/modnet @fa2fa546052fba4c08921230a26cc69a333fca12 | Apache-2.0 | https://github.com/ZHKKKe/MODNet/blob/28165a451e4610c9d77cfdf925a94610bb2810fb/LICENSE · https://huggingface.co/Xenova/modnet |
| U-2-Net (u2netp weights; `public/models/u2netp/`) | @ac7e1c817ecab7c7dff5ce6b1abba61cd213ff29 | Apache-2.0 | https://github.com/xuebinqin/U-2-Net/blob/ac7e1c817ecab7c7dff5ce6b1abba61cd213ff29/LICENSE |
| rembg (ONNX export of u2netp, release v0.0.0) | 7fb6683169d588f653281d53c3c258838194c950 | MIT | https://github.com/danielgatis/rembg/blob/7fb6683169d588f653281d53c3c258838194c950/LICENSE.txt |
| Sample photos (`public/samples/`, sources in `public/samples/SOURCES.md`) | - | CC0-1.0 | https://commons.wikimedia.org (see SOURCES.md) |
| Lucide icons (paths inlined in src/components/ui/Icon.tsx) | - | ISC | https://lucide.dev · https://github.com/lucide-icons/lucide/blob/main/LICENSE |

Full licence texts ship with each package in `node_modules/<package>/LICENSE`.
