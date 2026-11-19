# Launch checklist

Status: **not launched.** Nothing below has been deployed or posted. The posts at the end are drafts for Arpan to review and publish himself.

## 1. Before deploying

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint`, `pnpm check`, `pnpm test`, `pnpm run licenses` are all clean
- [ ] `pnpm build`, then `pnpm test:e2e` passes (Chromium; Firefox is run separately)
- [ ] `node scripts/ui-audit.mjs --base http://localhost:4321` prints `no issues`
- [ ] `THIRD_PARTY_NOTICES.md` and `models.lock.json` match what ships in `dist/`

## 2. Cloudflare Pages

Create the project in the Cloudflare dashboard: Workers & Pages, then Create, then Pages, then connect the Git repository.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | Astro (or None) |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Environment variable `SITE_URL` | `https://<domain>` (canonical URLs, sitemap and Open Graph; defaults to `https://nopload.pages.dev`) |
| Environment variable `NODE_VERSION` | `24` (developed on Node 24.5.0) |
| Environment variable `PNPM_VERSION` | the local `pnpm --version` (no `packageManager` field is set) |

Notes:

- `public/_headers` is copied to `dist/_headers`, and Cloudflare Pages applies it: COOP/COEP (cross-origin isolation for multithreaded WASM), CSP with `connect-src 'self'`, and long cache lifetimes for `/models/*`, `/ort/*`, `/codecs/*` and `/_astro/*`. The build step `scripts/csp-hashes.mjs` adds the inline-script hashes to it. Do not add headers in the dashboard that would override these.
- The largest single file must stay under the Pages limit of 25 MiB per file. Check with `find dist -size +20M`.
- Add the custom domain under the project's Custom domains tab, then set `SITE_URL` to it and redeploy.

## 3. After deploying

Replace `<domain>` with the live host.

- [ ] Headers:
  ```sh
  curl -sI https://<domain>/ | grep -iE 'cross-origin|content-security|x-content-type|referrer'
  ```
  Expect `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and a `Content-Security-Policy` containing `connect-src 'self'` and `sha256-` hashes.
- [ ] `curl -sI https://<domain>/models/modnet/model_quantized.onnx` returns 200 with `Cache-Control: public, max-age=31536000, immutable`.
- [ ] In the browser console on the live site: `crossOriginIsolated === true`.
- [ ] `https://<domain>/sitemap-index.xml` and `https://<domain>/robots.txt` load, and the sitemap URLs use `<domain>` (not `localhost` or `nopload.pages.dev`).
- [ ] Remove a background from a real photo on desktop Chrome, Firefox and a phone. The "0 uploads" panel shows 0 third-party requests.
- [ ] Turn the network off after one run and repeat: it still works.
- [ ] Lighthouse, mobile, on the live URL (`npx lighthouse https://<domain>/ --form-factor=mobile`): Performance >= 90, Accessibility >= 95, Best Practices >= 95, SEO = 100. Repeat for `/remove-background`.
- [ ] Submit the sitemap in Google Search Console and Bing Webmaster Tools.

## 4. Launch posts (DRAFTS, NOT POSTED)

> **DRAFT.** Nothing here has been posted. Arpan reviews, edits and posts these himself, from his own accounts.

### Show HN (DRAFT)

**Title:** Show HN: Nopload – remove backgrounds and compress images without uploading them

**Text:**

> I built Nopload, a set of image tools (background remover, compressor, converter, resizer, HEIC to JPG, EXIF remover) that run entirely in the browser. Your images never leave your device.
>
> The background remover runs MODNet with onnxruntime-web, on WebGPU when available and WASM otherwise, at full resolution. The codecs are jSquash (MozJPEG, OxiPNG, WebP, AVIF, JXL) and libheif in Web Workers.
>
> You can check the privacy claim yourself: the CSP is `connect-src 'self'`, so the page cannot send data to another origin, and a "0 uploads" panel lists every request the page has made. It also works offline after the first visit.
>
> No account, no ads, no limits. I'd love feedback on cutout quality and on speed on low-end devices.
>
> https://<domain>

### r/SideProject (DRAFT)

**Title:** I made a free background remover and image toolkit that never uploads your photos

**Text:**

> Most "free" image tools upload your photos to a server, add watermarks or ask for credits. Nopload does everything in your browser instead:
>
> - Remove backgrounds at full resolution, with an erase/restore brush and custom backgrounds
> - Compress, convert (JPG/PNG/WebP/AVIF/JXL), resize, HEIC to JPG, strip EXIF/GPS
> - Batch processing with ZIP download
> - Works offline, no signup, no ads
>
> Open DevTools, then Network, while you use it: no request carries your image. Feedback welcome!
>
> https://<domain>

### AlternativeTo listing (DRAFT)

Add Nopload as an alternative to **remove.bg** (remove.bg's standalone site closes on 1 December 2026, so its users are looking for a replacement).

- **Name:** Nopload
- **URL:** https://<domain>
- **Licence:** Free (proprietary)
- **Platforms:** Online / Web, works offline as a PWA
- **Tags:** background-remover, image-compressor, privacy, offline, no-signup
- **Short description:** Free, private remove.bg alternative. Removes image backgrounds at full resolution in your browser, with no upload, no account and no credits. Also compresses, converts, resizes and strips EXIF.
- **Alternative to:** remove.bg, also Adobe Express background remover, TinyPNG, Squoosh, iLoveIMG
- **Landing page to link:** `https://<domain>/remove-bg-alternative`
