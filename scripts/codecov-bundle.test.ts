import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { expect, test, vi } from 'vitest';

import { createBundleReport } from './codecov-bundle';

test('dry reports retain nested and hidden files, byte sizes and Vite name normalization without uploading', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'codecov-bundle-'));
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Dry runs cannot upload'));
  try {
    await mkdir(path.join(directory, 'nested'));
    const script = 'export const answer = 42;\n';
    await writeFile(path.join(directory, 'nested', 'entry-ABcd_12.js'), script);
    await writeFile(path.join(directory, '.hidden'), 'present');
    await symlink(path.join(directory, '.hidden'), path.join(directory, 'skip-link'));
    const report = JSON.parse(
      await createBundleReport([directory], { dryRun: true, bundleName: 'dunezone-app' }, '[name]-[hash].js')
    );
    expect(report.bundleName).toBe('dunezone-app');
    expect(report.assets).toHaveLength(2);
    expect(report.assets).toContainEqual({
      name: path.join('nested', 'entry-ABcd_12.js'),
      normalized: 'nested/entry-*.js',
      size: Buffer.byteLength(script),
      gzipSize: gzipSync(script).byteLength,
    });
    expect(report.assets.find((asset: { name: string }) => asset.name === '.hidden').size).toBe(7);
    expect(report.chunks).toEqual([]);
    expect(report.modules).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
