// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import lockJson from '../../../media/raster.lock.json';
import { MEDIA_MAP } from './map.generated';
import { RASTER_SOURCE, buildMediaMap } from './rasterLock';
import type { RasterLock } from './rasterLock';

const lock = lockJson as RasterLock;
const mediaRoot = path.resolve(import.meta.dirname, '../../../media');
const fix = 'run `bun run media:sync`';

/*
 * The originals are not in git (#1888 step 8), so CI checks the lock alone.
 * Where originals are present locally, such as after `bun run media:sync`, each must be locked and match its entry.
 */
const localKeys = existsSync(mediaRoot)
  ? readdirSync(mediaRoot, { recursive: true })
      .map((file) => `/${String(file).split(path.sep).join('/')}`)
      .filter((key) => RASTER_SOURCE.test(key))
  : [];

describe('raster lock', () => {
  test('lists every raster original present under media/', () => {
    expect(
      localKeys.filter((key) => !lock[key]),
      fix
    ).toEqual([]);
  });

  test('records the bytes and dimensions of each original present', async () => {
    for (const key of localKeys) {
      const entry = lock[key];
      const bytes = readFileSync(path.join(mediaRoot, key));
      expect(createHash('sha256').update(bytes).digest('hex'), `${key}: ${fix}`).toBe(entry.sha256);
      expect(bytes.length, `${key}: ${fix}`).toBe(entry.bytes);
      const { width, height, format } = await sharp(bytes).metadata();
      expect({ width, height, format }, `${key}: ${fix}`).toEqual({
        width: entry.width,
        height: entry.height,
        format: entry.format,
      });
    }
  });

  test('is the only input of the committed media map', () => {
    expect(MEDIA_MAP, fix).toEqual(buildMediaMap(lock));
  });
});
