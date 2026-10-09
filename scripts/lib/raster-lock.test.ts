import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { lockKeys, readRasterLock, sourcePath } from './raster-lock';

describe('lockKeys', () => {
  const lock = readRasterLock();

  it('keeps every locked key whether or not its original is on disk', () => {
    const keys = new Set(lockKeys(lock));
    expect(Object.keys(lock).filter((key) => !keys.has(key))).toEqual([]);
  });

  it('lists exactly the committed lock, so an ignored checkout and an empty one write the same lock', () => {
    expect(lockKeys(lock).sort()).toEqual(Object.keys(lock).sort());
  });

  it('lists a key the previous lock lacks exactly when its original is on disk', () => {
    const [first, ...rest] = Object.keys(lock);
    const keys = lockKeys(Object.fromEntries(rest.map((key) => [key, lock[key]])));
    expect(keys.includes(first)).toBe(existsSync(sourcePath(first)));
  });
});
