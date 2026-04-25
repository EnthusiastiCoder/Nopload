// The single source of the tool list. Each tool's status lives in its own
// src/tools/<id>/meta.ts so tool workstreams never edit this shared file.
import { status as compressImage } from './compress-image/meta';
import { status as convertImage } from './convert-image/meta';
import { status as heicToJpg } from './heic-to-jpg/meta';
import { status as removeBackground } from './remove-background/meta';
import { status as removeExif } from './remove-exif/meta';
import { status as resizeImage } from './resize-image/meta';

export type ToolStatus = 'live' | 'soon';

export interface Tool {
  id: string;
  slug: string;
  /** Page <title> (<= 60 chars, unique). */
  title: string;
  /** Meta description (<= 155 chars, unique). */
  description: string;
  /** Short name for nav and cards. */
  name: string;
  /** One-line card blurb. */
  blurb: string;
  keywords: string[];
  status: ToolStatus;
  /** Icon id from src/components/ui/Icon.tsx. */
  icon: string;
  /** File types the tool accepts (for drop routing). */
  accepts: string[];
  /** For alias landing pages: the id of the tool they render. */
  alias?: string;
}

const IMAGES = ['jpeg', 'png', 'webp', 'avif', 'heic', 'jxl', 'gif', 'bmp'];

export const tools: Tool[] = [
  {
    id: 'remove-background',
    slug: 'remove-background',
    name: 'Remove background',
    title: 'Remove Background from Images Free, No Upload | Nopload',
    description:
      'Remove the background from any photo in your browser. Full resolution, free, no signup and no upload: the AI runs on your device.',
    blurb: 'Cut out people and objects. Full resolution, transparent PNG.',
    keywords: ['remove background', 'background remover', 'transparent png', 'cut out image'],
    status: removeBackground,
    icon: 'eraser',
    accepts: ['jpeg', 'png', 'webp', 'avif', 'heic'],
  },
  {
    id: 'remove-bg-alternative',
    slug: 'remove-bg-alternative',
    name: 'remove.bg alternative',
    title: 'Free remove.bg Alternative That Never Uploads | Nopload',
    description:
      'Looking for a remove.bg alternative? Nopload removes backgrounds at full resolution in your browser, free, with no account and no upload.',
    blurb: 'A free, private alternative to remove.bg.',
    keywords: ['remove.bg alternative', 'free background remover', 'remove bg'],
    status: removeBackground,
    icon: 'eraser',
    accepts: ['jpeg', 'png', 'webp', 'avif', 'heic'],
    alias: 'remove-background',
  },
  {
    id: 'remove-background-without-account',
    slug: 'remove-background-without-account',
    name: 'Remove background, no account',
    title: 'Remove Image Background Without an Account | Nopload',
    description:
      'Remove image backgrounds with no account, no email and no credits. Unlimited and free, processed privately on your own device.',
    blurb: 'No signup, no credits, no limits.',
    keywords: ['remove background without account', 'no signup background remover'],
    status: removeBackground,
    icon: 'eraser',
    accepts: ['jpeg', 'png', 'webp', 'avif', 'heic'],
    alias: 'remove-background',
  },
  {
    id: 'compress-image',
    slug: 'compress-image',
    name: 'Compress',
    title: 'Compress Images Online Free, Batch and Private | Nopload',
    description:
      'Shrink JPG, PNG, WebP and AVIF files in bulk with MozJPEG and OxiPNG, right in your browser. No upload, no limits, ZIP download.',
    blurb: 'Make JPG, PNG and WebP files smaller, in bulk.',
    keywords: ['compress image', 'image compressor', 'reduce image size', 'compress jpg', 'compress png'],
    status: compressImage,
    icon: 'shrink',
    accepts: IMAGES,
  },
  {
    id: 'convert-image',
    slug: 'convert-image',
    name: 'Convert',
    title: 'Convert Images to JPG, PNG, WebP or AVIF | Nopload',
    description:
      'Convert images between JPG, PNG, WebP, AVIF and JPEG XL in batches. Free and private: every file is converted on your device.',
    blurb: 'Switch between JPG, PNG, WebP, AVIF and JXL.',
    keywords: ['convert image', 'png to jpg', 'jpg to webp', 'image to avif', 'image converter'],
    status: convertImage,
    icon: 'repeat',
    accepts: IMAGES,
  },
  {
    id: 'resize-image',
    slug: 'resize-image',
    name: 'Resize',
    title: 'Resize Images in Bulk, Free and Private | Nopload',
    description:
      'Resize many images at once by percent, width, height or exact size, or crop to 1:1, 4:5 or 16:9. High-quality Lanczos, no upload.',
    blurb: 'Change dimensions or crop to a ratio, in bulk.',
    keywords: ['resize image', 'image resizer', 'bulk resize', 'crop to square'],
    status: resizeImage,
    icon: 'scaling',
    accepts: IMAGES,
  },
  {
    id: 'heic-to-jpg',
    slug: 'heic-to-jpg',
    name: 'HEIC to JPG',
    title: 'HEIC to JPG Converter, Free and Offline | Nopload',
    description:
      'Turn iPhone HEIC photos into JPG or PNG in your browser. Batch convert with the right orientation, no upload and no install.',
    blurb: 'Open iPhone photos anywhere: HEIC to JPG or PNG.',
    keywords: ['heic to jpg', 'heic converter', 'iphone photo to jpg', 'heif to jpg'],
    status: heicToJpg,
    icon: 'smartphone',
    accepts: ['heic'],
  },
  {
    id: 'remove-exif',
    slug: 'remove-exif',
    name: 'Remove EXIF',
    title: 'Remove EXIF and GPS Data from Photos | Nopload',
    description:
      'See and strip hidden photo metadata like GPS location, camera and dates. Lossless, in bulk, and nothing ever leaves your device.',
    blurb: 'Strip GPS location and camera data, losslessly.',
    keywords: ['remove exif', 'remove gps from photo', 'strip metadata', 'exif remover'],
    status: removeExif,
    icon: 'map-pin-off',
    accepts: ['jpeg', 'png', 'webp'],
  },
];

/** Tools shown in nav and the home grid (aliases excluded). */
export const mainTools = (): Tool[] => tools.filter((t) => !t.alias);

export const toolBySlug = (slug: string): Tool | undefined => tools.find((t) => t.slug === slug);
