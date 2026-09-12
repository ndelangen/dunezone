import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';

const root = path.resolve(import.meta.dirname, '../..');

export async function readEnvironment(filename) {
  assert.equal(path.basename(filename), '.env.local', 'Use the stack-owned environment file.');
  const parent = await realpath(path.dirname(filename));
  assert.equal(path.dirname(parent), await realpath(tmpdir()), 'Credentials must be in the stack temporary directory.');
  assert.match(path.basename(parent), /^dunezone-hosted-proof-[a-zA-Z0-9]+$/);
  const parentStat = await lstat(parent);
  assert.equal(parentStat.mode & 0o077, 0, 'The credential directory must be private.');
  const candidate = path.join(parent, '.env.local');
  const info = await lstat(candidate);
  assert.ok(info.isFile(), 'Credentials must be a regular file, not a symbolic link.');
  assert.equal(info.mode & 0o077, 0, 'Credentials must be private.');
  return parseEnv(await readFile(candidate, 'utf8'));
}

export async function prepareDirectory(requested) {
  const name = path.basename(requested);
  assert.match(
    name,
    /^(baseline|stacked|separated)-(probe|peak|reconnect|trace|multitab|steady|slow|browser)-[0-9]{13}$/
  );
  const base = path.join(root, 'test-results', 'play-load');
  const directory = path.join(base, name);
  assert.equal(path.resolve(requested), directory, 'Reports must stay under test-results/play-load.');
  await mkdir(directory, { recursive: true });
  assert.equal(await realpath(directory), directory, 'Report directories must not be symbolic links.');
  return directory;
}

export async function captureSource(directory) {
  const git = (args) => execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' });
  const source = {
    revision: git(['rev-parse', 'HEAD']).trim(),
    trackedDiff: git(['diff', 'HEAD']),
    untrackedSources: Object.create(null),
  };
  const names = git(['ls-files', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean).sort();
  for (const name of names) {
    if (!/\.(mjs|ts|tsx|json|md)$/.test(name)) {
      continue;
    }
    const filename = path.join(root, name);
    if (!(await lstat(filename)).isFile()) {
      continue;
    }
    source.untrackedSources[name] = await readFile(filename, 'utf8');
  }
  await writeFile(path.join(directory, 'source-state.json'), JSON.stringify(source, null, 2), { flag: 'wx' });
  return source;
}
