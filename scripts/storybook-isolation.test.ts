import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

const sourceExtensions = new Set(['.css', '.html', '.js', '.jsx', '.ts', '.tsx']);
const forbiddenAssetRoot = `/${'generated'}/`;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(entryPath);
    }
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

describe('Storybook source isolation', () => {
  test('never treats generated output as an input asset', () => {
    const roots = ['src', '.storybook'].map((directory) => path.resolve(process.cwd(), directory));
    const offenders = roots
      .flatMap(sourceFiles)
      .filter((file) => readFileSync(file, 'utf8').includes(forbiddenAssetRoot))
      .map((file) => path.relative(process.cwd(), file));

    expect(offenders).toEqual([]);
  });
});
