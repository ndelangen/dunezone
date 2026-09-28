import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { backendCacheDirectory, cachedBackendArchive, spawnFailure } from './verify-hosted-backend-cache';

const contents = 'pinned backend';
const digest = createHash('sha256').update(contents).digest('hex');

function counted(write: (target: string) => void) {
  const calls: string[] = [];
  return {
    calls,
    download: (target: string) => {
      calls.push(target);
      write(target);
    },
  };
}

test('the first run downloads and keeps the archive, and a later run reuses it without downloading', () => {
  const directory = path.join(mkdtempSync(path.join(tmpdir(), 'backend-cache-')), 'nested');
  const first = counted((target) => writeFileSync(target, contents));
  const archive = cachedBackendArchive({ directory, digest, download: first.download });
  expect(archive).toBe(path.join(directory, `${digest}.zip`));
  expect(first.calls).toHaveLength(1);
  expect(first.calls[0]).not.toBe(archive);
  const second = counted(() => {
    throw new Error('downloaded again');
  });
  expect(cachedBackendArchive({ directory, digest, download: second.download })).toBe(archive);
  expect(second.calls).toHaveLength(0);
});

test('a download whose digest differs is refused and leaves nothing to reuse', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'backend-cache-'));
  const corrupt = counted((target) => writeFileSync(target, 'truncated'));
  expect(() => cachedBackendArchive({ directory, digest, download: corrupt.download })).toThrow(
    'Pinned backend archive checksum differs.'
  );
  expect(readdirSync(directory)).toEqual([]);
});

test('an interrupted download leaves no partial file behind', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'backend-cache-'));
  const interrupted = counted((target) => {
    writeFileSync(target, 'half');
    throw new Error('Pinned backend download timed out after 540 s.');
  });
  expect(() => cachedBackendArchive({ directory, digest, download: interrupted.download })).toThrow('timed out');
  expect(readdirSync(directory)).toEqual([]);
});

test('a cached archive whose digest differs is replaced by a fresh download', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'backend-cache-'));
  writeFileSync(path.join(directory, `${digest}.zip`), 'stale');
  const fresh = counted((target) => writeFileSync(target, contents));
  const archive = cachedBackendArchive({ directory, digest, download: fresh.download });
  expect(fresh.calls).toHaveLength(1);
  expect(existsSync(archive)).toBe(true);
  expect(readdirSync(directory)).toEqual([`${digest}.zip`]);
});

test('the cache lives under XDG_CACHE_HOME when set, else under the home cache', () => {
  expect(backendCacheDirectory({ XDG_CACHE_HOME: '/x', HOME: '/h' })).toBe('/x/dunezone/convex-backend');
  expect(backendCacheDirectory({ HOME: '/h' })).toBe('/h/.cache/dunezone/convex-backend');
});

test.each([
  [
    {
      status: null,
      signal: 'SIGTERM',
      error: Object.assign(new Error('spawnSync curl ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    },
    'Pinned backend download timed out after 540 s.',
  ],
  [
    { status: null, signal: null, error: Object.assign(new Error('spawnSync curl ENOENT'), { code: 'ENOENT' }) },
    'Pinned backend download could not run (ENOENT).',
  ],
  [{ status: null, signal: 'SIGKILL' }, 'Pinned backend download was stopped by SIGKILL.'],
  [{ status: 22, signal: null }, 'Pinned backend download failed (22).'],
] as const)('a failed step is named by its cause: %o', (result, message) => {
  expect(spawnFailure('Pinned backend download', result, 540_000)).toBe(message);
});
