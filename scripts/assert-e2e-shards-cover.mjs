#!/usr/bin/env node
/**
 * Fails when an e2e spec file is assigned to no CI shard, or to more than one.
 *
 * CI runs the e2e suite as shards, each a machine of its own with one Playwright worker, because three files at once on one machine cost every test 2.5 times its uncontended time and put the longest at 87% of its kill (#1050).
 * Playwright's own `--shard` cuts by test count with whole files kept together, which left one of three shards empty here, so the lists are explicit in `e2e/shards.json`, balanced by measured cost.
 * A list that is written by hand can miss a file, and a spec that no shard runs is a green run that proves nothing, so this gate reads the directory and the lists together.
 *
 * The animation spec is the `userA` project's dependency and runs in every shard on its own;
 * it is never listed.
 * An optional first argument names the repository root, which the test uses to point the gate at fixtures.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ANIMATION_SPEC = 'e2e/page-header-transition.spec.ts';
const root = process.argv[2] ?? join(import.meta.dirname, '..');

/** Every specification file under e2e, as the repository-relative path the lists use. */
async function listSpecs(directory) {
  const names = await readdir(join(directory, 'e2e'));
  return names.filter((name) => name.endsWith('.spec.ts')).map((name) => `e2e/${name}`);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Every problem in one pass, so a wrong list is fixed once rather than one message at a time. */
async function findProblems(directory) {
  const shards = JSON.parse(await readFile(join(directory, 'e2e', 'shards.json'), 'utf8'));
  const problems = [];
  const keys = Object.keys(shards);
  const expectedKeys = keys.map((_, index) => String(index + 1));
  if (keys.length === 0 || keys.some((key, index) => key !== expectedKeys[index])) {
    problems.push(`shard keys must be "1" through "${keys.length || 1}" in order; found ${JSON.stringify(keys)}`);
  }
  const assignments = new Map();
  for (const [shard, files] of Object.entries(shards)) {
    if (!Array.isArray(files) || files.length === 0) {
      problems.push(`shard ${shard} lists no files`);
      continue;
    }
    for (const file of files) {
      assignments.set(file, [...(assignments.get(file) ?? []), shard]);
      if (!(await exists(join(directory, file)))) {
        problems.push(`shard ${shard} lists ${file}, which does not exist`);
      }
    }
  }
  const specs = await listSpecs(directory);
  for (const spec of specs) {
    const shardsFor = assignments.get(spec) ?? [];
    if (spec === ANIMATION_SPEC) {
      if (shardsFor.length > 0) {
        problems.push(`${spec} runs in every shard as the animation dependency and must not be listed`);
      }
      continue;
    }
    if (shardsFor.length === 0) {
      problems.push(`${spec} is assigned to no shard, so no CI run would execute it`);
    } else if (shardsFor.length > 1) {
      problems.push(`${spec} is assigned to shards ${shardsFor.join(' and ')}; one shard owns a file`);
    }
  }
  return problems;
}

const problems = await findProblems(root);
if (problems.length > 0) {
  console.error(
    'e2e/shards.json does not cover the e2e directory:\n' +
      problems.map((problem) => `  - ${problem}`).join('\n') +
      '\n\nEvery e2e/*.spec.ts except the animation spec belongs to exactly one shard. ' +
      'Add a new spec to the shard with the least measured cost (the costs are on #1049), ' +
      'or rebalance the lists and say so in the PR.'
  );
  process.exit(1);
}
