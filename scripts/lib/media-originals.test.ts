import { describe, expect, test } from 'vitest';

import type { RasterLock, RasterLockEntry } from '../../src/shared/media/rasterLock';
import { distinctOriginals, eachWithCounts } from './media-originals';
import { lockChanges } from './raster-lock';

function entry(sha256: string): RasterLockEntry {
  return { sha256, bytes: 1, width: 1, height: 1, format: 'png', isOpaque: true, color: '#000000' };
}

const lock: RasterLock = {
  '/image/a.png': entry('a'.repeat(64)),
  '/image/b.png': entry('b'.repeat(64)),
  '/image/b-copy.png': entry('b'.repeat(64)),
};

describe('distinctOriginals', () => {
  test('names each original once, under the first key that lists it', () => {
    expect(distinctOriginals(lock).map(({ key, hash }) => [key, hash[0]])).toEqual([
      ['/image/a.png', 'a'],
      ['/image/b.png', 'b'],
    ]);
  });

  test('limits itself to the keys asked for', () => {
    expect(distinctOriginals(lock, ['/image/b-copy.png']).map(({ key }) => key)).toEqual(['/image/b-copy.png']);
  });
});

describe('lockChanges', () => {
  test('lists new and changed keys, and keys the new lock drops', () => {
    const next: RasterLock = {
      '/image/a.png': entry('c'.repeat(64)),
      '/image/b.png': lock['/image/b.png'],
      '/image/new.png': entry('d'.repeat(64)),
    };
    expect(lockChanges(lock, next)).toEqual({
      changed: ['/image/a.png', '/image/new.png'],
      removed: ['/image/b-copy.png'],
    });
  });
});

describe('eachWithCounts', () => {
  test('counts each outcome and each failure without stopping the run', async () => {
    const counts = await eachWithCounts([1, 2, 3, 4], async (item) => {
      if (item === 3) {
        throw new Error('three failed');
      }
      return item % 2 === 0 ? 'even' : 'odd';
    });
    expect(counts).toEqual({ odd: 1, even: 2, failed: 1 });
  });
});
