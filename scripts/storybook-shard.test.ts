import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

import { assignShards, byCodeUnit, listStoryFiles, readShardRules, shardOf } from './lib/storybook-shards';

const root = resolve(import.meta.dirname, '..');

/** The storybook job of the verify workflow, from its key to the next job's key, as the contract tests read jobs. */
function storybookJob(): string {
  const workflow = readFileSync(resolve(root, '.github/workflows/reusable-verify.yml'), 'utf8');
  const start = workflow.indexOf('\n  storybook:\n');
  expect(start, 'reusable-verify.yml has no storybook job').toBeGreaterThan(0);
  const length = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return length === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + length);
}

/*
 * A tree property no type can say (ADR-0001's narrow exception): every story file the repository holds runs in one CI shard.
 * The rules are prefixes with a catch-all, so a new story file lands somewhere by construction, and this suite is what says so when the catch-all is edited away.
 */
describe('storybook shards', () => {
  test('every story file in the repository belongs to exactly one shard, and no shard is empty', async () => {
    const rules = await readShardRules(root);
    const files = await listStoryFiles(root);
    const { shards, problems } = assignShards(files, rules);
    expect(problems).toEqual([]);
    expect([...shards.values()].flat().sort(byCodeUnit)).toEqual(files);
  });

  test('every Storybook stories directory sits under src, which is the tree the shards walk', () => {
    const main = readFileSync(resolve(root, '.storybook/main.ts'), 'utf8');
    const directories = [...main.matchAll(/directory: '([^']+)'/g)].map(([, directory]) => directory);
    expect(directories.length).toBeGreaterThan(0);
    expect(directories.filter((directory) => !directory.startsWith('../src/'))).toEqual([]);
  });

  test('no story path is a substring of another, since Vitest selects a file by substring match on the filters', async () => {
    const files = await listStoryFiles(root);
    const lower = files.map((file) => file.toLowerCase());
    const collisions = lower.filter((file, index) => lower.some((other, at) => at !== index && other.includes(file)));
    expect(collisions).toEqual([]);
  });

  test('the workflow matrix names exactly the shards the rules define, so a shard added to one is added to the other', async () => {
    const rules = await readShardRules(root);
    const matrix = /\n {8}shard: \[([^\]]+)\]\n/.exec(storybookJob())?.[1];
    expect(matrix, 'the storybook job has no shard matrix').toBeDefined();
    expect(matrix?.split(',').map((shard) => shard.trim())).toEqual(Object.keys(rules));
  });

  test('the first matching shard owns a file, a directory prefix owns its subtree, and a file prefix owns that file alone', () => {
    const rules = { first: ['a/b/one.stories.tsx'], second: ['a/b/'], rest: ['a/'] };
    expect(shardOf('a/b/one.stories.tsx', rules)).toBe('first');
    expect(shardOf('a/b/two.stories.tsx', rules)).toBe('second');
    expect(shardOf('a/b/deeper/three.stories.tsx', rules)).toBe('second');
    expect(shardOf('a/c/four.stories.ts', rules)).toBe('rest');
    expect(shardOf('a/bc/five.stories.tsx', rules)).toBe('rest');
    expect(shardOf('b/six.stories.tsx', rules)).toBeUndefined();
  });

  test('a file no shard owns, a shard that owns nothing and a rule that owns nothing are all reported', () => {
    const { shards, problems } = assignShards(['b/x.stories.tsx', 'a/y.stories.tsx'], {
      only: ['a/gone.stories.tsx', 'a/'],
      idle: ['c/'],
    });
    expect(shards.get('only')).toEqual(['a/y.stories.tsx']);
    expect(problems).toEqual([
      'b/x.stories.tsx matches no shard in .storybook/shards.json, so no CI run would execute it',
      'rule a/gone.stories.tsx in shard only owns no story file',
      'shard idle owns no story file',
      'rule c/ in shard idle owns no story file',
    ]);
  });
});
