import { resolveAsset } from '@shared/media/resolveAsset';

/*
 * A tutorial's social card shows its tile still beside the title (Norbert, 2026-11-10).
 * The card renderer reads only media-pipeline JPEGs, so each committed tile WebP under `public/tutorial/` has a JPEG copy under `media/web/tutorial/`.
 * Routes import this from their loader, as the blog post route resolves its cover, so the media map stays out of the eager route tree.
 */
export function tutorialSocialImage(tileArt: string): string {
  const key = tileArt.replace(/^\/tutorial\//, '/web/tutorial/').replace(/\.webp$/, '.jpg');
  return resolveAsset(key, 'small');
}
