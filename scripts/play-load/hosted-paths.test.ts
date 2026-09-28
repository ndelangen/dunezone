import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { privateInputFile } from './hosted-paths';

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'dunezone-hosted-paths-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

function inputFile(name: string, mode = 0o600) {
  const filename = path.join(directory, name);
  writeFileSync(filename, '{}', { mode });
  chmodSync(filename, mode);
  return filename;
}

test('a private file in a private temporary directory yields its canonical path', async () => {
  await expect(privateInputFile(inputFile('input.json'))).resolves.toBe(
    path.join(realpathSync(directory), 'input.json')
  );
});

test.each([
  ['a file others can read', () => inputFile('input.json', 0o644), 'Hosted input files must be private regular files.'],
  [
    'a symlink to a private file',
    () => {
      const alias = path.join(directory, 'alias.json');
      symlinkSync(inputFile('input.json'), alias);
      return alias;
    },
    'Hosted input files must be private regular files.',
  ],
  [
    'a file reached through a symlinked parent directory',
    () => {
      inputFile('input.json');
      const alias = path.join(directory, 'alias');
      symlinkSync(directory, alias, 'dir');
      return path.join(alias, 'input.json');
    },
    'Hosted files need a private parent directory.',
  ],
  ['parent traversal', () => `${directory}/missing/../input.json`, 'Hosted paths must not contain parent traversal.'],
  [
    'a file outside the temporary directory',
    () => path.join(path.parse(tmpdir()).root, 'dunezone-hosted-input.json'),
    'Hosted files must stay in the operating system temporary directory.',
  ],
])('refuses %s', async (_, requested, message) => {
  await expect(privateInputFile(requested())).rejects.toThrow(message);
});

test('a missing file passes only when the caller allows it', async () => {
  const missing = path.join(directory, 'accounts.json');
  await expect(privateInputFile(missing, { allowMissing: true })).resolves.toBe(
    path.join(realpathSync(directory), 'accounts.json')
  );
  await expect(privateInputFile(missing)).rejects.toThrow('ENOENT');
});

test('allowing a missing file still refuses an existing file others can read', async () => {
  await expect(privateInputFile(inputFile('accounts.json', 0o644), { allowMissing: true })).rejects.toThrow(
    'Hosted input files must be private regular files.'
  );
});
