import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vite-plus/test';

import {
  APPLICATION_ASSET_MANIFEST,
  bootstrapApplicationAssets,
  APPLICATION_ASSET_RETENTION_MS,
  retainApplicationAssets,
  writeApplicationAssetManifest,
} from './lib/application-assets';

const directories: string[] = [];
function release(name: string, now: number, count = 1) {
  const directory = mkdtempSync(path.join(tmpdir(), 'application-release-'));
  directories.push(directory);
  mkdirSync(path.join(directory, 'public'));
  for (let index = 0; index < count; index++) {
    writeFileSync(path.join(directory, 'public', `${name}${count === 1 ? '' : index}-abcd.js`), name);
  }
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

test('downloads at most 32 files at once and keeps manifest order when downloads finish out of order', async () => {
  const first = release('first', 1, 65);
  const second = release('second', 2);
  const responses = first.manifest.files.map(() => Promise.withResolvers<Uint8Array>());
  let active = 0;
  let peak = 0;
  const completed: string[] = [];
  const readPrevious = vi.fn(async (file: string) => {
    const index = first.manifest.files.findIndex((entry) => entry.path === file);
    active++;
    peak = Math.max(peak, active);
    const bytes = await responses[index]!.promise;
    active--;
    completed.push(file);
    return bytes;
  });
  const run = retainApplicationAssets(second.directory, first.manifest, readPrevious, 2);
  expect(readPrevious).toHaveBeenCalledTimes(32);
  for (let index = responses.length - 1; index >= 0; index--) {
    responses[index]!.resolve(readFileSync(path.join(first.directory, first.manifest.files[index]!.path)));
  }
  expect(await run).toBe(65);
  expect(peak).toBe(32);
  expect(readPrevious).toHaveBeenCalledTimes(65);
  expect(completed[0]).toBe(first.manifest.files[31]!.path);
  expect(JSON.parse(readFileSync(path.join(second.directory, APPLICATION_ASSET_MANIFEST), 'utf8'))).toEqual({
    version: 1,
    files: [
      ...second.manifest.files,
      ...first.manifest.files.map((file) => ({ ...file, current: false, lastUsedAt: 2 })),
    ],
  });
  for (const file of first.manifest.files) {
    expect(readFileSync(path.join(second.directory, file.path), 'utf8')).toBe('first');
  }
});

test.each(['size', 'digest', 'transport'] as const)(
  'a permanent %s failure stops the queue and prevents writes after rejection',
  async (failure) => {
    const first = release('first', 1, 33);
    const second = release('second', 2);
    const responses = first.manifest.files.map(() => Promise.withResolvers<Uint8Array>());
    const readPrevious = vi.fn(
      (file: string) => responses[first.manifest.files.findIndex((entry) => entry.path === file)]!.promise
    );
    const run = retainApplicationAssets(second.directory, first.manifest, readPrevious, 2);
    const refused = expect(run).rejects.toThrow(failure === 'transport' ? 'HTTP 404' : 'digest check');
    if (failure === 'transport') {
      responses[0]!.reject(new Error('HTTP 404'));
    } else {
      responses[0]!.resolve(Buffer.from(failure === 'size' ? '' : 'wrong'));
    }
    await refused;
    for (const response of responses.slice(1)) {
      response.resolve(Buffer.from('first'));
    }
    await Promise.all(responses.slice(1).map((response) => response.promise));
    expect(readPrevious).toHaveBeenCalledTimes(32);
    expect(readdirSync(path.join(second.directory, 'public'))).toEqual(['second-abcd.js']);
    expect(JSON.parse(readFileSync(path.join(second.directory, APPLICATION_ASSET_MANIFEST), 'utf8'))).toEqual(
      second.manifest
    );
  }
);

test('checks every reused path before downloading any eligible files', async () => {
  const first = release('first', 1);
  const second = release('second', 2);
  first.manifest.files.push({ ...second.manifest.files[0]!, bytes: 0 });
  const readPrevious = vi.fn();
  await expect(retainApplicationAssets(second.directory, first.manifest, readPrevious, 2)).rejects.toThrow(
    'path reused'
  );
  expect(readPrevious).not.toHaveBeenCalled();
});

test('keeps retained files at the seven-day cutoff without extending their last use', async () => {
  const first = release('first', 1, 2);
  first.manifest.files[0]!.current = false;
  first.manifest.files[1]!.current = false;
  first.manifest.files[1]!.lastUsedAt = 0;
  const now = APPLICATION_ASSET_RETENTION_MS + 1;
  const second = release('second', now);
  const readPrevious = vi.fn(async (file: string) => readFileSync(path.join(first.directory, file)));
  expect(await retainApplicationAssets(second.directory, first.manifest, readPrevious, now)).toBe(1);
  expect(readPrevious).toHaveBeenCalledExactlyOnceWith(first.manifest.files[0]!.path);
  expect(JSON.parse(readFileSync(path.join(second.directory, APPLICATION_ASSET_MANIFEST), 'utf8'))).toEqual({
    version: 1,
    files: [...second.manifest.files, first.manifest.files[0]],
  });
});

test('rejects paths outside the hashed browser bundle directory', async () => {
  const first = release('first', 1);
  const second = release('second', 2);
  first.manifest.files[0]!.path = '../server.js';
  const readPrevious = vi.fn();
  await expect(retainApplicationAssets(second.directory, first.manifest, readPrevious, 2)).rejects.toThrow();
  expect(readPrevious).not.toHaveBeenCalled();
});

test('bootstraps transitive Vite imports, preload maps and CSS font URLs', async () => {
  const files: Record<string, string> = {
    'public/index-abcd.js': `import './shared-abcd.js';const lazy=["public/editor-abcd.js", "public/page-abcd.css"];`,
    'public/shared-abcd.js': `import './index-abcd.js';`,
    'public/editor-abcd.js': 'import(`./leaf-abcd.js`)',
    'public/leaf-abcd.js': 'leaf',
    'public/page-abcd.css': `@font-face{src:url(/public/font-abcd.woff2)}`,
    'public/font-abcd.woff2': 'font bytes',
  };
  const read = vi.fn(async (file: string) => new TextEncoder().encode(files[file]));
  /* The script tag and byte reader are fixed fixtures; this test never executes HTML. */
  /* nosemgrep: javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag */
  const result = await bootstrapApplicationAssets('<script src="/public/index-abcd.js"></script>', read, 1);
  expect(result.manifest.files.map((file) => file.path).sort()).toEqual(Object.keys(files).sort());
  expect(read).toHaveBeenCalledTimes(6);
  await expect(bootstrapApplicationAssets('<html>unavailable</html>', read)).rejects.toThrow(
    'no hashed application entry'
  );
});
