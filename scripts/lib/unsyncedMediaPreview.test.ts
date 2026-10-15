import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import type { RasterLock, RasterLockEntry } from '../../src/shared/media/rasterLock';
import { unsyncedOriginal } from './unsyncedMediaPreview';

function mediaWith(...keys: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'unsynced-media-'));
  for (const key of keys) {
    mkdirSync(path.dirname(path.join(root, key)), { recursive: true });
    writeFileSync(path.join(root, key), '');
  }
  return root;
}

test('finds the original a not yet synced variant path stands for', () => {
  const root = mediaWith('/web/blog/post/photo.png');
  expect(unsyncedOriginal('/web/blog/post/photo-large.jpg', root, {})).toEqual({
    key: '/web/blog/post/photo.png',
    file: path.join(root, 'web/blog/post/photo.png'),
    tier: 'large',
  });
});

test('leaves a locked original to the generated files', () => {
  const root = mediaWith('/web/blog/post/photo.jpg');
  const lock: RasterLock = { '/web/blog/post/photo.jpg': {} as RasterLockEntry };
  expect(unsyncedOriginal('/web/blog/post/photo-small.jpg', root, lock)).toBeNull();
});

test('ignores paths with no original, the wrong extension for the category, or outside media', () => {
  const root = mediaWith('/web/blog/post/photo.jpg');
  expect(unsyncedOriginal('/web/blog/post/other-small.jpg', root, {})).toBeNull();
  expect(unsyncedOriginal('/web/blog/post/photo-small.webp', root, {})).toBeNull();
  expect(unsyncedOriginal('/web/../../etc/passwd-small.jpg', root, {})).toBeNull();
  expect(unsyncedOriginal('/web/blog/post/photo.jpg', root, {})).toBeNull();
});
