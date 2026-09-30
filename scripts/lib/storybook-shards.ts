/**
 * The story suite's CI shards: which shard runs which story files.
 *
 * `.storybook/shards.json` lists each shard's prefixes in order.
 * A story file belongs to the first shard with a prefix that matches it: a prefix ending in `/` owns every file under that directory, and any other prefix owns exactly that file.
 * The last shard's prefix is `src/`, so every story file lands somewhere and a new file cannot fall out of CI;
 * the guard test proves both on the real tree.
 * Prefixes rather than Vitest's own `--shard`, because that cuts the sorted file list into ranges, and the seven slowest Play page files, 58% of the suite's measured time, sit together in that order (#1588).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export type ShardRules = Record<string, string[]>;

export const SHARDS_FILE = '.storybook/shards.json';

/** The extensions `.storybook/main.ts` accepts for a story file, so a story the suite loads is a story the shards know. */
const STORY_FILE = /\.stories\.(?:js|jsx|mjs|ts|tsx)$/;

/** A shard's name is what the workflow matrix hands the runner and what the Actions UI shows: lowercase letters, digits and dashes. */
const SHARD_NAME = /^[a-z][a-z0-9-]*$/;

export async function readShardRules(root: string): Promise<ShardRules> {
  const parsed: unknown = JSON.parse(await readFile(join(root, SHARDS_FILE), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${SHARDS_FILE} must be an object of shard name to prefix list`);
  }
  const rules: ShardRules = {};
  for (const [shard, prefixes] of Object.entries(parsed)) {
    if (!SHARD_NAME.test(shard)) {
      throw new Error(
        `${SHARDS_FILE}: shard name ${JSON.stringify(shard)} is not lowercase letters, digits and dashes`
      );
    }
    if (!Array.isArray(prefixes) || prefixes.length === 0 || !prefixes.every((prefix) => typeof prefix === 'string')) {
      throw new Error(`${SHARDS_FILE}: shard ${shard} must list at least one prefix`);
    }
    rules[shard] = prefixes;
  }
  return rules;
}

/** Every story file under `src`, as the repository-relative POSIX path the rules use, sorted. */
export async function listStoryFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && STORY_FILE.test(entry.name)) {
        files.push(relative(root, full).split(sep).join('/'));
      }
    }
  }
  await walk(join(root, 'src'));
  return files.sort();
}

/** True when the prefix owns the file: a directory prefix owns its subtree, any other prefix owns that file alone. */
function owns(prefix: string, file: string): boolean {
  return prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix;
}

/** The first shard whose prefix matches the file, or undefined when none does. */
export function shardOf(file: string, rules: ShardRules): string | undefined {
  for (const [shard, prefixes] of Object.entries(rules)) {
    if (prefixes.some((prefix) => owns(prefix, file))) {
      return shard;
    }
  }
  return undefined;
}

/**
 * The files each shard runs, plus every problem in one pass.
 * A file no shard owns is a problem rather than a silent skip, and so is a shard that would run nothing, because a green run of an empty shard proves nothing.
 * A rule that owns no file is a problem too: a renamed story file would otherwise fall through to a later shard and unbalance it without a word.
 */
export function assignShards(
  files: string[],
  rules: ShardRules
): { shards: Map<string, string[]>; problems: string[] } {
  const shards = new Map<string, string[]>(Object.keys(rules).map((shard) => [shard, []]));
  const problems: string[] = [];
  for (const file of files) {
    const shard = shardOf(file, rules);
    if (shard === undefined) {
      problems.push(`${file} matches no shard in ${SHARDS_FILE}, so no CI run would execute it`);
      continue;
    }
    shards.get(shard)?.push(file);
  }
  for (const [shard, owned] of shards) {
    if (owned.length === 0) {
      problems.push(`shard ${shard} owns no story file`);
    }
    for (const prefix of rules[shard] ?? []) {
      if (!owned.some((file) => owns(prefix, file))) {
        problems.push(`rule ${prefix} in shard ${shard} owns no story file`);
      }
    }
  }
  return { shards, problems };
}
