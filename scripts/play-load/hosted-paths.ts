import assert from 'node:assert/strict';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

async function privatePath(requested: string) {
  assert.ok(path.isAbsolute(requested), 'Hosted files need an absolute path.');
  assert.ok(!requested.split(path.sep).includes('..'), 'Hosted paths must not contain parent traversal.');
  const parentPath = path.dirname(requested);
  const parent = await lstat(parentPath);
  assert.ok(parent.isDirectory() && (parent.mode & 0o077) === 0, 'Hosted files need a private parent directory.');
  const base = await realpath(parentPath);
  const filename = path.resolve(base, path.basename(requested));
  assert.ok(filename.startsWith(`${base}${path.sep}`), 'Hosted paths must stay in their parent directory.');
  return filename;
}

export async function privateInputFile(requested: string) {
  const filename = await privatePath(requested);
  const file = await lstat(filename);
  assert.ok(file.isFile() && (file.mode & 0o077) === 0, 'Hosted input files must be private regular files.');
  assert.ok(file.size <= 8192, 'The hosted input file is too large.');
  return filename;
}

export async function privateOutputDirectory(requested: string) {
  const directory = await privatePath(requested);
  await mkdir(directory, { recursive: false, mode: 0o700 });
  return directory;
}
