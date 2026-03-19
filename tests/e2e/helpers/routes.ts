// Every prerendered route of the MVP (the 404 page is checked separately).
export const TOOL_ROUTES = [
  '/remove-background',
  '/remove-bg-alternative',
  '/remove-background-without-account',
  '/compress-image',
  '/convert-image',
  '/resize-image',
  '/heic-to-jpg',
  '/remove-exif',
] as const;

export const BATCH_ROUTES = ['/compress-image', '/convert-image', '/resize-image', '/heic-to-jpg', '/remove-exif'] as const;

export const BG_ROUTES = ['/remove-background', '/remove-bg-alternative', '/remove-background-without-account'] as const;

export const ROUTES = ['/', ...TOOL_ROUTES, '/privacy', '/about'] as const;

export const MISSING_ROUTE = '/this-page-does-not-exist';
