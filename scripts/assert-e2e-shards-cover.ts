#!/usr/bin/env node
/**
 * Fails when an e2e spec file is assigned to no CI shard, or to more than one.
 *
 * CI runs the e2e suite as shards, each a machine of its own with one Playwright worker, because three files at once on one machine cost every test 2.5 times its uncontended time and put the longest at 87% of its kill (#1050).
 * Playwright's own `--shard` cuts by test count with whole files kept together, which left one of three shards empty here, so the lists are explicit in `e2e/shards.json`, balanced by measured cost.
 * A shard is named for the journey that anchors it, with the small specs that fill it out listed after;
 * a name reads in the Actions UI where a number would not.
 * A list that is written by hand can miss a file, and a spec that no shard runs is a green run that proves nothing, so this gate reads the directory and the lists together.
 *
 * it is never listed.
 * `E2E_SHARDS_ROOT` names another root, which the test uses to point the gate at fixtures, as the CSS gates do with theirs.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/** A list entry names a spec file directly under e2e, so nothing a list says can reach outside it. */
const SPEC_ENTRY = /^e2e\/[\w.-]+\.spec\.ts$/;
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..');

/** The only roots this gate reads: the repository, or a fixture the test wrote under the temporary directory. */
function resolveRoot(argument: string | undefined) {
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

/** Playwright's default `testMatch`, which `playwright.config.ts` leaves in place, so a file it matches anywhere under e2e is a test file. */
const PLAYWRIGHT_TEST_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

/** Every file Playwright would collect under e2e, nested ones included, as the repository-relative path the lists use. */
async function listSpecs(directory: string) {
  const names = await readdir(join(directory, 'e2e'), { recursive: true });
  return names
    .filter((name) => PLAYWRIGHT_TEST_FILE.test(name))
    .map((name) => `e2e/${name.split(sep).join('/')}`)
    .toSorted();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** A shard's name is what the workflow matrix hands the script and what the Actions UI shows: lowercase, letters, digits and dashes. */
const SHARD_NAME = /^[a-z][a-z0-9-]*$/;

function keyProblems(shards: Record<string, unknown>) {
  const keys = Object.keys(shards);
  if (keys.length === 0) {
    return ['e2e/shards.json names no shard'];
  }
  return keys
    .filter((key) => !SHARD_NAME.test(key))
    .map((key) => `shard name ${JSON.stringify(key)} is not lowercase letters, digits and dashes`);
}

/** A shard's entries, with the ones that do not name a spec file directly under e2e recorded as problems. */
function validEntries(shard: string, files: unknown, problems: string[]) {
  const entries: unknown[] = Array.isArray(files) ? files : [];
  if (entries.length === 0) {
    problems.push(`shard ${shard} lists no files`);
  }
  return entries.filter((file): file is string => {
    const valid = typeof file === 'string' && SPEC_ENTRY.test(file);
    if (!valid) {
      problems.push(
        `shard ${shard} lists ${typeof file === 'string' ? file : JSON.stringify(file)}, which is not a spec file directly under e2e`
      );
    }
    return valid;
  });
}

/** Which shards list each file. */
function ownersOf(shards: Record<string, unknown>, problems: string[]) {
  const owners = new Map<string, string[]>();
  for (const [shard, files] of Object.entries(shards)) {
    for (const file of validEntries(shard, files, problems)) {
      owners.set(file, [...(owners.get(file) ?? []), shard]);
    }
  }
  return owners;
}

/** The listed files that are not there. */
async function missingFiles(directory: string, owners: Map<string, string[]>) {
  const problems = [];
  for (const [file, shardsFor] of owners) {
    if (!(await exists(join(directory, file)))) {
      problems.push(`shard ${shardsFor.join(' and ')} lists ${file}, which does not exist`);
    }
  }
  return problems;
}

/** One shard owns a spec. */
function coverageProblem(spec: string, shardsFor: string[]) {
  switch (true) {
    case !SPEC_ENTRY.test(spec):
      return `${spec} is a test file Playwright collects, but a shard can only list a .spec.ts file directly under e2e, so no CI run would execute it`;
    case shardsFor.length === 0:
      return `${spec} is assigned to no shard, so no CI run would execute it`;
    case shardsFor.length > 1:
      return `${spec} is assigned to shards ${shardsFor.join(' and ')}; one shard owns a file`;
    default:
      return undefined;
  }
}

/** Every problem in one pass, so a wrong list is fixed once rather than one message at a time. */
async function findProblems(directory: string) {
  const shards: Record<string, unknown> = JSON.parse(await readFile(join(directory, 'e2e', 'shards.json'), 'utf8'));
  const problems = keyProblems(shards);
  const owners = ownersOf(shards, problems);
  problems.push(...(await missingFiles(directory, owners)));
  const specs = await listSpecs(directory);
  problems.push(
    ...specs
      .map((spec) => coverageProblem(spec, owners.get(spec) ?? []))
      .filter((problem): problem is string => problem !== undefined)
  );
  return problems;
}

const problems = await findProblems(root);
if (problems.length > 0) {
  console.error(
    'e2e/shards.json does not cover the e2e directory:\n' +
      problems.map((problem) => `  - ${problem}`).join('\n') +
      '\n\nEvery e2e/*.spec.ts belongs to exactly one shard, and Playwright test files live nowhere else under e2e. ' +
      'Add a new spec to the shard with the least measured cost (the costs are on #1049), ' +
      'or rebalance the lists and say so in the PR.'
  );
  process.exit(1);
}
