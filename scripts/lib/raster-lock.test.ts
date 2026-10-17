import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vite-plus/test';

import { lockKeys, readRasterLock, sourcePath } from './raster-lock';

describe('lockKeys', () => {
  const lock = readRasterLock();

  it('lists exactly the committed lock, so an ignored checkout and an empty one write the same lock', () => {
    expect(lockKeys(lock).sort()).toEqual(Object.keys(lock).sort());
  });

  it('lists a key the previous lock lacks exactly when its original is on disk', () => {
    const [first, ...rest] = Object.keys(lock);
    const keys = lockKeys(Object.fromEntries(rest.map((key) => [key, lock[key]])));
    expect(keys.includes(first)).toBe(existsSync(sourcePath(first)));
  });
});
