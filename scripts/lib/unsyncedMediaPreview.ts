import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import type { Plugin } from 'vite';

import { FORMAT_EXTENSION, ruleForKey } from '../../src/shared/assetRules.ts';
import type { AssetSize } from '../../src/shared/assetRules.ts';
import type { RasterLock } from '../../src/shared/media/rasterLock.ts';

/* The legacy variant path `resolveAsset` gives a raster the lock does not list, such as `/web/blog/why-dune/photo-small.jpg`. */
const VARIANT = /^(\/.+)-(small|large|print)\.(jpg|webp|png)$/;
const ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/** The original in `media/` that a variant path stands for, when the lock does not list it yet. */
export function unsyncedOriginal(
  url: string,
  mediaRoot: string,
  lock: RasterLock
): { key: string; file: string; tier: AssetSize } | null {
  const match = VARIANT.exec(url);
  if (!match) {
    return null;
  }
  const [, base, tier, extension] = match;
  for (const originalExtension of ORIGINAL_EXTENSIONS) {
    const key = `${base}${originalExtension}`;
    const rule = ruleForKey(key);
    if (!rule || FORMAT_EXTENSION[rule.format] !== extension || lock[key]) {
      continue;
    }
    const file = path.join(mediaRoot, key);
    if (file.startsWith(`${mediaRoot}${path.sep}`) && existsSync(file)) {
      return { key, file, tier: tier as AssetSize };
    }
  }
  return null;
}

/** A quick encode of one tier, close enough to judge an image by: the deployed bytes come from `generate-images.ts` once the original is synced. */
async function encodePreview(file: string, key: string, tier: AssetSize): Promise<Buffer> {
  const rule = ruleForKey(key)!;
  const width = tier === 'print' ? (rule.sizes.print ?? rule.sizes.large) : rule.sizes[tier];
  let pipeline = sharp(file);
  if (width) {
    pipeline = pipeline.resize(width, null, { withoutEnlargement: true });
  }
  if (rule.grayscale) {
    pipeline = pipeline.grayscale();
  }
  if (rule.format === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: rule.quality, progressive: true });
  } else if (rule.format === 'webp') {
    pipeline = pipeline.webp({ quality: rule.quality });
  } else {
    pipeline = pipeline.png();
  }
  return await pipeline.toBuffer();
}

/**
 * Lets the dev server show art dropped into `media/` before it is synced, so an image can be tried on a page and swapped freely without uploading it.
 * A raster the lock does not list resolves to its legacy path, and nothing writes that file locally (`generate-images.ts` encodes only locked originals), so this answers those paths from the original itself.
 * It never touches the lock, R2 or `public/`, and builds never load it;
 * `postBodies.test.tsx` keeps a post with an unsynced image from shipping.
 */
export function unsyncedMediaPreview(repoRoot: string): Plugin {
  const mediaRoot = path.join(repoRoot, 'media');
  const lockFile = path.join(mediaRoot, 'raster.lock.json');
  let lockCache: { mtimeMs: number; lock: RasterLock } | null = null;
  const encoded = new Map<string, { mtimeMs: number; bytes: Buffer }>();

  function currentLock(): RasterLock {
    const { mtimeMs } = statSync(lockFile);
    if (lockCache?.mtimeMs !== mtimeMs) {
      lockCache = { mtimeMs, lock: JSON.parse(readFileSync(lockFile, 'utf8')) as RasterLock };
    }
    return lockCache.lock;
  }

  return {
    name: 'dunezone:unsynced-media-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          next();
          return;
        }
        let url: string;
        try {
          url = decodeURIComponent((request.url ?? '').split('?')[0]);
        } catch {
          next();
          return;
        }
        const original = unsyncedOriginal(url, mediaRoot, currentLock());
        if (!original) {
          next();
          return;
        }
        const { mtimeMs } = statSync(original.file);
        const cached = encoded.get(url);
        const bytes =
          cached?.mtimeMs === mtimeMs
            ? Promise.resolve(cached.bytes)
            : encodePreview(original.file, original.key, original.tier).then((fresh) => {
                encoded.set(url, { mtimeMs, bytes: fresh });
                return fresh;
              });
        bytes.then(
          (body) => {
            response.setHeader('Content-Type', `image/${ruleForKey(original.key)!.format}`);
            response.setHeader('Content-Length', body.byteLength);
            /* Not synced, so it may change any moment: a reload always shows the file as it is now. */
            response.setHeader('Cache-Control', 'no-store');
            response.end(request.method === 'HEAD' ? undefined : body);
          },
          (error: unknown) => next(error)
        );
      });
    },
  };
}
