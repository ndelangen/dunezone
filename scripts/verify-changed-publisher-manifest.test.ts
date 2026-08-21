import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

const scriptPath = path.join(import.meta.dirname, 'verify-changed-publisher-manifest.ts');
const bunExecutable = spawnSync('which', ['bun'], { encoding: 'utf8' }).stdout.trim();
const temporaryDirectories: string[] = [];

function git(root: string, ...arguments_: string[]) {
  const result = spawnSync('git', arguments_, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr);
  }
  return result.stdout.trim();
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'publisher-manifest-check-'));
  const fakeBin = path.join(root, 'fake-bin');
  const callLog = path.join(root, 'publisher-dry-run.log');
  temporaryDirectories.push(root);

  mkdirSync(path.join(root, 'docs'), { recursive: true });
  mkdirSync(path.join(root, 'src', 'shared'), { recursive: true });
  mkdirSync(path.join(root, 'workers', 'publisher'), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(path.join(root, 'docs', 'README.md'), 'base documentation\n');
  writeFileSync(path.join(root, 'src', 'shared', 'contract.ts'), 'export const contract = 1;\n');
  writeFileSync(
    path.join(root, 'workers', 'publisher', 'renderer-manifest.generated.ts'),
    'export const digest = "base";\n'
  );
  writeFileSync(
    path.join(fakeBin, 'bun'),
    [
      '#!/bin/sh',
      'printf "%s\\n" "$*" >> "$PUBLISHER_VERIFY_CALL_LOG"',
      'if [ "$PUBLISHER_VERIFY_STALE" = "1" ]; then',
      '  printf "\\n// regenerated\\n" >> workers/publisher/renderer-manifest.generated.ts',
      'fi',
      '',
    ].join('\n')
  );
  chmodSync(path.join(fakeBin, 'bun'), 0o755);

  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'publisher-check@example.com');
  git(root, 'config', 'user.name', 'Publisher check');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Base fixture');
  git(root, 'switch', '-c', 'feature');

  return { root, fakeBin, callLog };
}

function commitChange(root: string, filePath: string, contents: string) {
  const absolutePath = path.join(root, filePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
  git(root, 'add', filePath);
  git(root, 'commit', '-m', `Change ${filePath}`);
}

function runCheck(current: ReturnType<typeof fixture>, stale = false) {
  return spawnSync(bunExecutable, [scriptPath, '--base', 'main'], {
    cwd: current.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${current.fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      PUBLISHER_VERIFY_CALL_LOG: current.callLog,
      PUBLISHER_VERIFY_STALE: stale ? '1' : '0',
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('changed publisher manifest check', () => {
  test('skips the publisher build when the branch changes no capture-bundle source', () => {
    const current = fixture();
    commitChange(current.root, 'docs/README.md', 'changed documentation\n');

    const result = runCheck(current);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no capture-bundle changes');
    expect(existsSync(current.callLog)).toBe(false);
  });

  test('skips application source outside the capture entry import closure', () => {
    const current = fixture();
    commitChange(current.root, 'src/app/routes/example.tsx', 'export const route = true;\n');

    const result = runCheck(current);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no capture-bundle changes');
    expect(existsSync(current.callLog)).toBe(false);
  });

  test('accepts a capture-bundle change whose generated manifest stays current', () => {
    const current = fixture();
    commitChange(current.root, 'src/app/styles/fonts.css', '@font-face { font-family: Renderer; }\n');

    const result = runCheck(current);

    expect(result.status).toBe(0);
    expect(readFileSync(current.callLog, 'utf8')).toBe('run publisher:dry-run\n');
  });

  test('fails with the repair command when code generation changes the tracked manifest', () => {
    const current = fixture();
    commitChange(current.root, 'workers/publisher/capture.ts', 'export const capture = true;\n');

    const result = runCheck(current, true);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bun run publisher:dry-run');
    expect(result.stderr).toContain('workers/publisher/renderer-manifest.generated.ts');
    expect(readFileSync(current.callLog, 'utf8')).toBe('run publisher:dry-run\n');
  });
});
