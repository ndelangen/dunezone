import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

const scriptDirectory = import.meta.dirname;
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'worktree-freshness-'));
  directories.push(directory);
  const upstream = join(directory, 'upstream');
  const checkout = join(directory, 'checkout');
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'commit.gpgSign=false', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    }).trim();
  mkdirSync(upstream);
  git(upstream, 'init', '-b', 'main');
  git(upstream, 'config', 'user.name', 'Worktree test');
  git(upstream, 'config', 'user.email', 'worktree@example.invalid');
  writeFileSync(join(upstream, 'tracked.txt'), 'base\n');
  mkdirSync(join(upstream, 'scripts'));
  for (const name of ['codex-worktree-setup.sh', 'paperclip-worktree-setup.sh']) {
    copyFileSync(join(scriptDirectory, name), join(upstream, 'scripts', name));
  }
  git(upstream, 'add', '.');
  git(upstream, 'commit', '-m', 'The fixture has a base');
  git(directory, 'clone', upstream, checkout);
  git(checkout, 'config', 'user.name', 'Worktree test');
  git(checkout, 'config', 'user.email', 'worktree@example.invalid');
  const advance = (cwd: string, text: string) => {
    writeFileSync(join(cwd, 'tracked.txt'), `${text}\n`);
    git(cwd, 'add', 'tracked.txt');
    git(cwd, 'commit', '-m', 'The fixture advances');
    return git(cwd, 'rev-parse', 'HEAD');
  };
  const preflight = () =>
    spawnSync('bash', [join(scriptDirectory, 'codex-worktree-setup.sh')], {
      cwd: checkout,
      encoding: 'utf8',
    });
  return { directory, upstream, checkout, git, advance, preflight };
}

describe('freshly fetched worktree bases', () => {
  test('preserves task commits and dirty edits when the branch contains the current base', () => {
    const { checkout, git, advance, preflight } = fixture();
    git(checkout, 'switch', '-c', 'norbert/paperclip-test');
    const taskHead = advance(checkout, 'task');
    writeFileSync(join(checkout, 'tracked.txt'), 'unfinished task\n');

    expect(preflight().status).toBe(0);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(taskHead);
    expect(readFileSync(join(checkout, 'tracked.txt'), 'utf8')).toBe('unfinished task\n');
  });

  test('fetches new remote commits and refuses a stale dirty task without moving it', () => {
    const { upstream, checkout, git, advance, preflight } = fixture();
    git(checkout, 'switch', '-c', 'norbert/paperclip-test');
    const taskHead = advance(checkout, 'task');
    const upstreamHead = advance(upstream, 'upstream');
    writeFileSync(join(checkout, 'tracked.txt'), 'unfinished task\n');

    expect(preflight().status).not.toBe(0);
    expect(git(checkout, 'rev-parse', 'origin/main')).toBe(upstreamHead);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(taskHead);
    expect(readFileSync(join(checkout, 'tracked.txt'), 'utf8')).toBe('unfinished task\n');
  });

  test('advances a clean detached checkout after fetching, but preserves an attached stale branch', () => {
    const { upstream, checkout, git, advance, preflight } = fixture();
    const originalHead = git(checkout, 'rev-parse', 'HEAD');
    const upstreamHead = advance(upstream, 'upstream');
    expect(preflight().status).not.toBe(0);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(originalHead);

    git(checkout, 'switch', '--detach');
    expect(preflight().status).toBe(0);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(upstreamHead);
  });

  test('refuses divergent detached history even when it is clean', () => {
    const { upstream, checkout, git, advance, preflight } = fixture();
    git(checkout, 'switch', '--detach');
    const taskHead = advance(checkout, 'task');
    advance(upstream, 'upstream');

    expect(preflight().status).not.toBe(0);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(taskHead);
  });

  test('refuses a failed fetch even when its cached remote ref matches HEAD', () => {
    const { directory, checkout, git, preflight } = fixture();
    const originalHead = git(checkout, 'rev-parse', 'HEAD');
    git(checkout, 'remote', 'set-url', 'origin', join(directory, 'missing-upstream'));

    expect(preflight().status).not.toBe(0);
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(originalHead);
  });
});

describe('Paperclip provisioning', () => {
  test('checks task identity and freshness before installing anything, and preserves work on resume', () => {
    const { directory, upstream, checkout, git, advance } = fixture();
    git(checkout, 'switch', '-c', 'norbert/paperclip-test');
    const taskHead = advance(checkout, 'task');
    writeFileSync(join(checkout, 'tracked.txt'), 'unfinished task\n');
    const bin = join(directory, 'bin');
    const log = join(directory, 'bun-calls');
    mkdirSync(bin);
    writeFileSync(join(bin, 'bun'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$BUN_CALL_LOG"\n');
    chmodSync(join(bin, 'bun'), 0o755);
    const run = (branch = 'norbert/paperclip-test', expectedPath = checkout) =>
      spawnSync('bash', [resolve(scriptDirectory, 'paperclip-worktree-setup.sh')], {
        cwd: checkout,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          BUN_CALL_LOG: log,
          PAPERCLIP_WORKSPACE_WORKTREE_PATH: expectedPath,
          PAPERCLIP_WORKSPACE_BRANCH: branch,
        },
      });

    expect(run('norbert/paperclip-other').status).not.toBe(0);
    expect(run('norbert/paperclip-test', upstream).status).not.toBe(0);
    expect(run().status).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('install --frozen-lockfile');
    expect(git(checkout, 'rev-parse', 'HEAD')).toBe(taskHead);
    expect(readFileSync(join(checkout, 'tracked.txt'), 'utf8')).toBe('unfinished task\n');

    const acceptedCalls = readFileSync(log, 'utf8');
    advance(upstream, 'upstream');
    expect(run().status).not.toBe(0);
    expect(readFileSync(log, 'utf8')).toBe(acceptedCalls);
    expect(readFileSync(join(checkout, 'tracked.txt'), 'utf8')).toBe('unfinished task\n');
  });
});
