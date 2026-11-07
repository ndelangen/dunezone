import { matchPublishedPath, PUBLICATION_TARGETS } from './publicationTargets';

/**
 * The widths a published image is served at besides its own, as `?w=` on its public URL.
 * The publisher resizes on request and keeps the result at the edge, so a list of 74 leaders drawn at 40px downloads 74 small files instead of 74 full captures.
 * A short fixed list keeps the number of distinct resized files, which Cloudflare bills by, to a few per publication.
 */
const PUBLISHED_THUMBNAIL_WIDTHS = [160, 320, 640] as const;
export type PublishedThumbnailWidth = (typeof PUBLISHED_THUMBNAIL_WIDTHS)[number];

/** The query parameter that asks for a resized copy. */
export const PUBLISHED_THUMBNAIL_PARAM = 'w';

/** The width a request asks for, or null when it asks for none or for one outside the list. */
export function publishedThumbnailWidth(value: string | null): PublishedThumbnailWidth | null {
  return PUBLISHED_THUMBNAIL_WIDTHS.find((width) => String(width) === value) ?? null;
}

/** The image publication a public path names, with the width it was captured at; null for anything else, PDFs included. */
export function publishedImageTarget(pathname: string) {
  const route = matchPublishedPath(pathname);
  const capture = route && PUBLICATION_TARGETS[route.assetType].capture;
  return route && capture?.output === 'image' ? { ...route, widthPx: capture.widthPx } : null;
}

/**
 * The URL to draw a published image from, for a slot `pixels` device pixels wide.
 * Relative and absolute URLs both work, and keep their form.
 * It asks for the smallest listed width that covers the slot, and keeps the original when no listed width is both large enough and smaller than the capture, or when `src` is not an image publication.
 */
export function publishedThumbnailSrc(src: string, pixels: number): string {
  if (!(pixels > 0) || !URL.canParse(src, 'https://published.invalid')) {
    return src;
  }
  const url = new URL(src, 'https://published.invalid');
  const captured = publishedImageTarget(url.pathname)?.widthPx ?? 0;
  /* Only a copy smaller than the capture is worth asking for. */
  const width = PUBLISHED_THUMBNAIL_WIDTHS.find((candidate) => candidate >= pixels && candidate < captured);
  if (width === undefined) {
    return src;
  }
  url.searchParams.set(PUBLISHED_THUMBNAIL_PARAM, String(width));
  return /^[a-z][a-z\d+.-]*:/i.test(src) ? url.toString() : `${url.pathname}${url.search}`;
}
