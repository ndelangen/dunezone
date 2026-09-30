/**
 * Runs one CI shard of the story suite: `bun run storybook:test:shard <shard> [vitest arguments]`.
 *
 * It resolves the shard's files from `.storybook/shards.json` and hands them to Vitest as file filters, followed by whatever came after the shard name, such as the coverage and reporter flags the workflow passes.
 * Vitest matches a filter as a case-insensitive substring of the file path, so a complete repository-relative path selects itself, and the guard test holds that no story path is a substring of another.
 */
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

import { assignShards, listStoryFiles, readShardRules, SHARDS_FILE } from './lib/storybook-shards';

const root = resolve(import.meta.dirname, '..');
const [shard, ...vitestArguments] = process.argv.slice(2);

const rules = await readShardRules(root);
if (shard === undefined || !Object.hasOwn(rules, shard)) {
  console.error(`Usage: bun run storybook:test:shard <${Object.keys(rules).join('|')}> [vitest arguments]`);
  process.exit(2);
}

const { shards, problems } = assignShards(await listStoryFiles(root), rules);
if (problems.length > 0) {
  console.error(
    `${SHARDS_FILE} does not cover the story files:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`
  );
  process.exit(1);
}

const files = shards.get(shard);
if (files === undefined) {
  console.error(`shard ${shard} resolved to no file list`);
  process.exit(1);
}
console.log(`storybook shard ${shard}: ${files.length} of ${[...shards.values()].flat().length} story files`);

const vitest = spawn(
  join(root, 'node_modules', '.bin', 'vitest'),
  ['run', '--config', 'vitest.storybook.config.ts', ...files, ...vitestArguments],
  { cwd: root, stdio: 'inherit' }
);
vitest.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
vitest.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
