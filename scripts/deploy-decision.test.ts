import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Reading } from './deploy-decision';
import { decide, position } from './deploy-decision';

const GAME = 'https://dune.zone/__play/health';
const PUBLISHER = 'https://dune.zone/__asset-publisher/health';
const EARLIER = 'e'.repeat(40);
const LATER = 'f'.repeat(40);
const THIS = 'a'.repeat(40);

describe('production deploy decision', () => {
  test('deploys over an earlier release and hands its commit to the dev rebuild', () => {
    const readings: Reading[] = [
      { endpoint: GAME, sha: EARLIER, position: 'older' },
      { endpoint: PUBLISHER, sha: EARLIER, position: 'older' },
    ];
    expect(decide(readings, 1)).toMatchObject({ deploy: true, base: EARLIER });
  });

  test('stops a late run when a Worker is on a later commit, and a duplicate when every Worker has this one', () => {
    const late: Reading[] = [
      { endpoint: GAME, sha: LATER, position: 'newer' },
      { endpoint: PUBLISHER, position: 'unknown', note: 'no answer' },
    ];
    expect(decide(late, 1)).toEqual({
      deploy: false,
      base: '',
      reason: `${GAME} already reports ${LATER}, a later commit`,
    });
    const duplicate: Reading[] = [
      { endpoint: GAME, sha: THIS, position: 'same' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(decide(duplicate, 1).deploy).toBe(false);
  });

  test('a rerun deploys a commit every Worker already has, and still stops when a Worker is on a later one', () => {
    const released: Reading[] = [
      { endpoint: GAME, sha: THIS, position: 'same' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(decide(released, 2)).toMatchObject({ deploy: true, base: '' });
    const late: Reading[] = [
      { endpoint: GAME, sha: LATER, position: 'newer' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(decide(late, 2).deploy).toBe(false);
  });

  test('deploys, with no base, when production cannot be read or only part of it has this commit', () => {
    const unreadable: Reading[] = [
      { endpoint: GAME, position: 'unknown', note: 'HTTP 503' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(decide(unreadable, 1)).toMatchObject({ deploy: true, base: '' });
    const halfReleased: Reading[] = [
      { endpoint: GAME, sha: THIS, position: 'same' },
      { endpoint: PUBLISHER, sha: EARLIER, position: 'older' },
    ];
    expect(decide(halfReleased, 1)).toMatchObject({ deploy: true, base: '' });
  });
});

/*
 * A throwaway repository holding one commit and its child, so git itself answers which one comes first.
 * Swapping the two ancestry checks in position turns newer into older and back, and fails this test.
 */
describe('where production sits in git history', () => {
  let repository = '';
  let parent = '';
  let child = '';

  beforeAll(() => {
    repository = mkdtempSync(join(tmpdir(), 'deploy-decision-'));
    const git = (args: string[]) =>
      execFileSync('/usr/bin/git', ['-c', 'commit.gpgSign=false', ...args], {
        cwd: repository,
        // mktree reads its entries from stdin, and an empty list is the empty tree.
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Deploy decision test',
          GIT_AUTHOR_EMAIL: 'deploy-decision@example.invalid',
          GIT_COMMITTER_NAME: 'Deploy decision test',
          GIT_COMMITTER_EMAIL: 'deploy-decision@example.invalid',
        },
      }).trim();
    git(['init', '--quiet']);
    const tree = git(['mktree']);
    parent = git(['commit-tree', tree, '-m', 'parent']);
    child = git(['commit-tree', tree, '-p', parent, '-m', 'child']);
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  test('reads a child as newer and a parent as older than the commit a run deploys', () => {
    expect(position(child, child, repository)).toBe('same');
    expect(position(parent, child, repository)).toBe('newer');
    expect(position(child, parent, repository)).toBe('older');
  });

  test('leaves a commit git does not have unknown', () => {
    expect(position(child, '1'.repeat(40), repository)).toBe('unknown');
  });
});
