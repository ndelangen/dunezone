import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import type { Sharp } from 'sharp';
import type { Plugin } from 'vite';

import { FORMAT_EXTENSION, ruleForKey } from '../../src/shared/assetRules.ts';
import type { AssetFormat, AssetSize } from '../../src/shared/assetRules.ts';
import type { RasterLock } from '../../src/shared/media/rasterLock.ts';

/* The legacy variant path `resolveAsset` gives a raster the lock does not list, such as `/web/blog/why-dune/photo-small.jpg`. */
const VARIANT = /^(\/.+)-(small|large|print)\.(jpg|webp|png)$/;
const ORIGINAL_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

/** Whether a variant with this extension is one the key's category produces. */
function producesExtension(key: string, extension: string): boolean {
  const rule = ruleForKey(key);
  return rule !== undefined && FORMAT_EXTENSION[rule.format] === extension;
}

/** The original in `media/` that a variant path stands for, when the lock does not list it yet. */
export function unsyncedOriginal(
  url: string,
  mediaRoot: string,
  lock: RasterLock
): { key: string; file: string; tier: AssetSize } | null {
  const match = VARIANT.exec(url);
  /* A path with `.` or `..` segments would be checked against the lock under a key other than the file it reaches. */
  if (!match || path.posix.normalize(url) !== url) {
    return null;
  }
  const [, base, tier, extension] = match;
  for (const originalExtension of ORIGINAL_EXTENSIONS) {
    const key = `${base}${originalExtension}`;
    if (lock[key] || !producesExtension(key, extension)) {
      continue;
    }
    const file = path.join(mediaRoot, key);
    const insideMedia = file.startsWith(`${mediaRoot}${path.sep}`);
    if (insideMedia && existsSync(file)) {
      return { key, file, tier: tier as AssetSize };
    }
  }
  return null;
}

const ENCODERS: Record<AssetFormat, (pipeline: Sharp, quality: number) => Sharp> = {
  jpeg: (pipeline, quality) => pipeline.jpeg({ quality, progressive: true }),
  webp: (pipeline, quality) => pipeline.webp({ quality }),
  png: (pipeline) => pipeline.png(),
};

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
  return await ENCODERS[rule.format](pipeline, rule.quality).toBuffer();
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

  /* Only variant paths read the lock. A malformed path, a lock caught mid-write by `media:sync`, or an original swapped out mid-request falls through rather than failing. */
  function lookup(requestUrl = '') {
    try {
      const url = decodeURIComponent(requestUrl.split('?')[0]);
      const original = VARIANT.test(url) ? unsyncedOriginal(url, mediaRoot, currentLock()) : null;
      return original ? { url, original, mtimeMs: statSync(original.file).mtimeMs } : null;
    } catch {
      return null;
    }
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
        const found = lookup(request.url);
        if (!found) {
          next();
          return;
        }
        const { url, original, mtimeMs } = found;
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
