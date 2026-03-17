# Test fixtures

Every fixture used by the tests, with its source and licence.

## Synthetic (generated in code, no third-party content)

Built at test time by `tests/helpers/images.ts`, so no binary is committed:

| Fixture (plan name) | Builder | What it contains |
|---|---|---|
| `gps.jpg` | `buildGpsJpeg()` | Baseline JPEG (jpeg-js) + APP0 JFIF, APP1 Exif (Make `NoploadCam`, Model, Orientation 6, Software, DateTimeOriginal, GPS 52.37 N / 4.89 E), APP1 XMP, APP2 ICC, APP13 IPTC, COM |
| `photo.png` | `buildMetaPng()` | RGB PNG + iCCP, tEXt, iTXt, zTXt, eXIf, tRNS, tIME |
| `photo.webp` | `buildMetaWebp()` | RIFF/WEBP structure: VP8X (alpha + EXIF + XMP flags), VP8L, odd-length EXIF, XMP |
| `transparent.png` | `makePng(w, h, { transparent: true })` | RGBA PNG with a fully transparent border |
| `large-12mp.jpg` | `makeJpeg(4000, 3000)` | 12 MP gradient + noise JPEG |
| compress batch | `makeJpeg` / `makePng` | 15 JPEG (q100) + 15 PNG, 320x240 |

Licence: written for this repo (© Arpan Mandal).

## Real files (to be added by the owning workstream)

| File | Owner | Required properties | Source | Licence |
|---|---|---|---|---|
| `portrait.jpg` | WS2 | A person on a distinct background | _TBD_ | must be CC0 / public domain / permissive |
| `portrait.mask.json` | WS2 | `{"subject": {"x", "y", "w", "h"}}`: a hand-marked box fully inside the subject, in `portrait.jpg` pixels | hand-made | © Arpan Mandal |
| `product.jpg` | WS2 | A product / object photo | _TBD_ | must be CC0 / public domain / permissive |
| `sample.heic` | WS3 | A redistributable HEIC (or one generated with a permissively licensed encoder, documented here) | _TBD_ | must be redistributable |
| `sample.heic.json` | WS3 | `{"width", "height"}` of `sample.heic` after orientation | hand-made | © Arpan Mandal |

The e2e specs fail with `fixture tests/fixtures/<name> is missing (added by <owner>…)` until these exist.
