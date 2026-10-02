import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import {
  APPLICATION_ASSET_MANIFEST,
  APPLICATION_ASSET_RETENTION_MS,
  retainApplicationAssets,
  writeApplicationAssetManifest,
} from './lib/application-assets';

const directories: string[] = [];
function release(name: string, now: number) {
  const directory = mkdtempSync(path.join(tmpdir(), 'application-release-'));
  directories.push(directory);
  mkdirSync(path.join(directory, 'public'));
  writeFileSync(path.join(directory, 'public', `${name}-abcd.js`), name);
  return { directory, manifest: writeApplicationAssetManifest(directory, now) };
}
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

test('keeps a replaced release for seven days even when it was deployed months ago', async () => {
  const first = release('first', 1);
  const now = APPLICATION_ASSET_RETENTION_MS * 20;
  const second = release('second', now);
  expect(
    await retainApplicationAssets(
      second.directory,
      first.manifest,
      async (file) => readFileSync(path.join(first.directory, file)),
      now
    )
  ).toBe(1);
  expect(readFileSync(path.join(second.directory, 'public/first-abcd.js'), 'utf8')).toBe('first');
  const third = release('third', now + APPLICATION_ASSET_RETENTION_MS + 1);
  const readPrevious = vi.fn(async (file: string) => readFileSync(path.join(second.directory, file)));
  expect(
    await retainApplicationAssets(
      third.directory,
      JSON.parse(readFileSync(path.join(second.directory, APPLICATION_ASSET_MANIFEST), 'utf8')),
      readPrevious,
      now + APPLICATION_ASSET_RETENTION_MS + 1
    )
  ).toBe(1);
  expect(readPrevious).toHaveBeenCalledExactlyOnceWith('public/second-abcd.js');
});

test('rejects corrupted downloads and reused paths instead of deploying broken older pages', async () => {
  const first = release('first', 1);
  const second = release('second', 2);
  await expect(
    retainApplicationAssets(second.directory, first.manifest, async () => new Uint8Array(), 2)
  ).rejects.toThrow('digest check');
  const conflict = release('first', 2);
  writeFileSync(path.join(conflict.directory, 'public/first-abcd.js'), 'changed');
  writeApplicationAssetManifest(conflict.directory, 2);
  await expect(retainApplicationAssets(conflict.directory, first.manifest, vi.fn(), 2)).rejects.toThrow('path reused');
});

test('rejects paths outside the hashed browser bundle directory', async () => {
  const first = release('first', 1);
  const second = release('second', 2);
  first.manifest.files[0]!.path = '../server.js';
  const readPrevious = vi.fn();
  await expect(retainApplicationAssets(second.directory, first.manifest, readPrevious, 2)).rejects.toThrow();
  expect(readPrevious).not.toHaveBeenCalled();
});
