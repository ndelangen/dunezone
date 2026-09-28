import assert from 'node:assert/strict';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function privatePath(requested: string) {
  assert.ok(path.isAbsolute(requested), 'Hosted files need an absolute path.');
  assert.ok(!requested.split(path.sep).includes('..'), 'Hosted paths must not contain parent traversal.');
  const temporaryRoot = path.resolve(tmpdir());
  const resolved = path.resolve(requested);
  if (!resolved.startsWith(`${temporaryRoot}${path.sep}`)) {
    throw new Error('Hosted files must stay in the operating system temporary directory.');
  }
  const parentPath = path.dirname(resolved);
  const parent = await lstat(parentPath);
  assert.ok(parent.isDirectory() && (parent.mode & 0o077) === 0, 'Hosted files need a private parent directory.');
  const base = await realpath(temporaryRoot);
  const parentReal = await realpath(parentPath);
  const filename = path.resolve(parentReal, path.basename(resolved));
  if (!filename.startsWith(`${base}${path.sep}`)) {
    throw new Error('Hosted files must stay in the operating system temporary directory.');
  }
  return filename;
}

/**
 * Returns the canonical path of a private regular file in the temporary directory, refusing a symlink, a file others can read and one over 8 KiB.
 * With `allowMissing`, a file that does not exist yet passes, for an input the caller writes back later, such as the browser verifier's synthetic accounts.
 */
export async function privateInputFile(requested: string, { allowMissing = false } = {}) {
  const filename = await privatePath(requested);
  const file = await lstat(filename).catch((error: unknown) => {
    if (allowMissing && error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  });
  if (!file) {
    return filename;
  }
  assert.ok(file.isFile() && (file.mode & 0o077) === 0, 'Hosted input files must be private regular files.');
  assert.ok(file.size <= 8192, 'The hosted input file is too large.');
  return filename;
}

export async function privateOutputDirectory(requested: string) {
  const directory = await privatePath(requested);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  return directory;
}
