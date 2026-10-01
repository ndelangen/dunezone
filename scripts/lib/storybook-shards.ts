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

/** True for a JSON object, which is neither null nor an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True for a list of one or more strings, the only shape a shard's prefix list may take. */
function isPrefixList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((prefix) => typeof prefix === 'string');
}

/** The prefixes of one shard entry, once its name and its list have passed. */
function readShard(shard: string, prefixes: unknown): string[] {
  if (!SHARD_NAME.test(shard)) {
    throw new Error(`${SHARDS_FILE}: shard name ${JSON.stringify(shard)} is not lowercase letters, digits and dashes`);
  }
  if (!isPrefixList(prefixes)) {
    throw new Error(`${SHARDS_FILE}: shard ${shard} must list at least one prefix`);
  }
  return prefixes;
}

export async function readShardRules(root: string): Promise<ShardRules> {
  const parsed: unknown = JSON.parse(await readFile(join(root, SHARDS_FILE), 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`${SHARDS_FILE} must be an object of shard name to prefix list`);
  }
  return Object.fromEntries(Object.entries(parsed).map(([shard, prefixes]) => [shard, readShard(shard, prefixes)]));
}

/**
 * Code-unit order, which `Array.prototype.sort` uses when no compare function is given, made explicit.
 * No locale takes part, so a story list is the same on every machine that walks the same tree.
 */
export function byCodeUnit(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Every story file under `src`, as the repository-relative POSIX path the rules use, in code-unit order. */
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
  return files.sort(byCodeUnit);
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
 * The problems of one shard given the files it owns.
 * A shard that would run nothing is a problem, because a green run of an empty shard proves nothing.
 * A rule that owns no file is a problem too: a renamed story file would otherwise fall through to a later shard and unbalance it without a word.
 */
function shardProblems(shard: string, prefixes: string[], owned: string[]): string[] {
  const idle = prefixes.filter((prefix) => !owned.some((file) => owns(prefix, file)));
  return [
    ...(owned.length === 0 ? [`shard ${shard} owns no story file`] : []),
    ...idle.map((prefix) => `rule ${prefix} in shard ${shard} owns no story file`),
  ];
}

/**
 * The files each shard runs, plus every problem in one pass.
 * A file no shard owns is a problem rather than a silent skip, and so is each problem of a shard.
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
    } else {
      shards.get(shard)?.push(file);
    }
  }
  for (const [shard, prefixes] of Object.entries(rules)) {
    problems.push(...shardProblems(shard, prefixes, shards.get(shard) ?? []));
  }
  return { shards, problems };
}
