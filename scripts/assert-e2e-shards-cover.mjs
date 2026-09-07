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
 * `E2E_SHARDS_ROOT` names another root, which the test uses to point the gate at fixtures, as the CSS gates do with theirs.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const ANIMATION_SPEC = 'e2e/page-header-transition.spec.ts';
/** A list entry names a spec file directly under e2e, so nothing a list says can reach outside it. */
const SPEC_ENTRY = /^e2e\/[\w.-]+\.spec\.ts$/;
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

/** The only roots this gate reads: the repository, or a fixture the test wrote under the temporary directory. */
function resolveRoot(argument) {
  if (argument === undefined) {
    return REPOSITORY_ROOT;
  }
  const candidate = resolve(argument);
  const allowed = [REPOSITORY_ROOT, resolve(tmpdir())];
  if (!allowed.some((base) => candidate === base || candidate.startsWith(base + sep))) {
    console.error(`The root must be the repository or a directory under ${tmpdir()}; got ${argument}`);
    process.exit(2);
  }
  return candidate;
}

const root = resolveRoot(process.env.E2E_SHARDS_ROOT);

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

/** The keys are the shard numbers the workflow matrix hands the script, so they must be 1 through N in order. */
function keyProblems(shards) {
  const keys = Object.keys(shards);
  const expected = keys.map((_, index) => String(index + 1));
  const inOrder = keys.length > 0 && keys.every((key, index) => key === expected[index]);
  return inOrder
    ? []
    : [`shard keys must be "1" through "${keys.length || 1}" in order; found ${JSON.stringify(keys)}`];
}

/** A shard's entries, with the ones that do not name a spec file directly under e2e recorded as problems. */
function validEntries(shard, files, problems) {
  const entries = Array.isArray(files) ? files : [];
  if (entries.length === 0) {
    problems.push(`shard ${shard} lists no files`);
  }
  return entries.filter((file) => {
    const valid = SPEC_ENTRY.test(file);
    if (!valid) {
      problems.push(`shard ${shard} lists ${file}, which is not a spec file directly under e2e`);
    }
    return valid;
  });
}

/** Which shards list each file. */
function ownersOf(shards, problems) {
  const owners = new Map();
  for (const [shard, files] of Object.entries(shards)) {
    for (const file of validEntries(shard, files, problems)) {
      owners.set(file, [...(owners.get(file) ?? []), shard]);
    }
  }
  return owners;
}

/** The listed files that are not there. */
async function missingFiles(directory, owners) {
  const problems = [];
  for (const [file, shardsFor] of owners) {
    if (!(await exists(join(directory, file)))) {
      problems.push(`shard ${shardsFor.join(' and ')} lists ${file}, which does not exist`);
    }
  }
  return problems;
}

/** One shard owns a spec; the animation spec belongs to every shard already and may not be listed. */
function coverageProblem(spec, shardsFor) {
  switch (true) {
    case spec === ANIMATION_SPEC && shardsFor.length > 0:
      return `${spec} runs in every shard as the animation dependency and must not be listed`;
    case spec === ANIMATION_SPEC:
      return undefined;
    case shardsFor.length === 0:
      return `${spec} is assigned to no shard, so no CI run would execute it`;
    case shardsFor.length > 1:
      return `${spec} is assigned to shards ${shardsFor.join(' and ')}; one shard owns a file`;
    default:
      return undefined;
  }
}

/** Every problem in one pass, so a wrong list is fixed once rather than one message at a time. */
async function findProblems(directory) {
  const shards = JSON.parse(await readFile(join(directory, 'e2e', 'shards.json'), 'utf8'));
  const problems = keyProblems(shards);
  const owners = ownersOf(shards, problems);
  problems.push(...(await missingFiles(directory, owners)));
  const specs = await listSpecs(directory);
  problems.push(...specs.map((spec) => coverageProblem(spec, owners.get(spec) ?? [])).filter(Boolean));
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
