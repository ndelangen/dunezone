import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { getCompressedSize, normalizeOptions, normalizePath, Output } from '@codecov/bundler-plugin-core';
import type { Options } from '@codecov/bundler-plugin-core';

/** The six CI bundles include all regular files; none needs the analyzer CLI's glob filtering. */
async function filesIn(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesIn(filename)));
    } else if (entry.isFile()) {
      files.push(filename);
    }
  }
  return files;
}

/** Preserve Codecov's compression, name normalization and upload format through its public core. */
export async function createBundleReport(directories: string[], options: Options, pattern = ''): Promise<string> {
  const normalized = normalizeOptions(options);
  if (!normalized.success) {
    throw new Error(`Invalid Codecov options: ${normalized.errors.join(' ')}`);
  }
  const report = new Output(normalized.options, { metaFramework: 'bundle-analyzer' });
  report.start();
  report.setPlugin('dunezone-bundle-report', '1');
  report.assets = [];
  report.chunks = [];
  report.modules = [];
  for (const directory of directories) {
    const root = path.resolve(directory);
    for (const filename of await filesIn(root)) {
      const name = path.relative(root, filename);
      const code = await readFile(filename);
      report.assets.push({
        name,
        size: code.byteLength,
        gzipSize: await getCompressedSize({ fileName: name, code }),
        normalized: normalizePath(name, pattern, 'bundle-analyzer'),
      });
    }
  }
  report.end();
  if (!options.dryRun) {
    await report.write(true);
  }
  return report.bundleStatsToJson();
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'bundle-name': { type: 'string' },
      'upload-token': { type: 'string' },
      'normalize-assets-pattern': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (!positionals.length || !values['bundle-name']) {
    throw new Error('A bundle name and at least one directory are required');
  }
  const report = await createBundleReport(
    positionals,
    { bundleName: values['bundle-name'], uploadToken: values['upload-token'], dryRun: values['dry-run'] },
    values['normalize-assets-pattern']
  );
  if (values['dry-run']) {
    console.log(report);
  }
}
