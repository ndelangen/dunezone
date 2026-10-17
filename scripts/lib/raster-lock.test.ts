import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type * as Fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { lockKeys, readRasterLock } from './raster-lock';

/** While a root is set, listing media/ lists that fixture root instead, so a test decides which originals are on disk. */
const mediaFixture = vi.hoisted((): { root?: string } => ({}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  const readdirSync = ((directory: Fs.PathLike, options?: unknown) =>
    actual.readdirSync(mediaFixture.root ?? directory, options as never)) as typeof actual.readdirSync;
  return { ...actual, readdirSync };
});

describe('lockKeys', () => {
  const lock = readRasterLock();

  afterEach(() => {
    if (mediaFixture.root) {
      rmSync(mediaFixture.root, { recursive: true, force: true });
    }
    mediaFixture.root = undefined;
  });

  it('lists exactly the committed lock, so an ignored checkout and an empty one write the same lock', () => {
    expect(lockKeys(lock).sort()).toEqual(Object.keys(lock).sort());
  });

  it('lists a key the previous lock lacks exactly when its original is on disk', () => {
    mediaFixture.root = mkdtempSync(path.join(tmpdir(), 'raster-lock-'));
    mkdirSync(path.join(mediaFixture.root, 'image/texture'), { recursive: true });
    writeFileSync(path.join(mediaFixture.root, 'image/texture/present.jpg'), '');
    /* `/image/texture/absent.jpg` has no original in the fixture root, so it stays out. */
    const keys = lockKeys({});
    expect(keys).toEqual(['/image/texture/present.jpg']);
    expect(keys).not.toContain('/image/texture/absent.jpg');
  });
});
