import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { valueHash } from './tooling/files';
import { loadEnvironment, loadProject, ownedIdentities } from './tooling/project';
import { applyCollection, collect, inspectCheckpoint, prepare } from './tooling/workflow';

function flags(args: string[]) {
  const parsed = new Map<string, string | true>();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--') || parsed.has(arg)) {
      throw new Error(`Unexpected or duplicate argument ${arg}`);
    }
    if (['--initial-baseline', '--help'].includes(arg)) {
      parsed.set(arg, true);
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Supply a value for ${arg}`);
    }
    parsed.set(arg, value);
  }
  const known = [
    '--root',
    '--environment',
    '--checkpoint',
    '--local-checkpoint',
    '--review',
    '--run',
    '--keys',
    '--initial-baseline',
    '--prepared',
    '--apply',
    '--reviewed-hash',
    '--help',
  ];
  for (const key of parsed.keys()) {
    if (!known.includes(key)) {
      throw new Error(`Unknown option ${key}`);
    }
  }
  return parsed;
}
function required(values: Map<string, string | true>, name: string) {
  const value = values.get(name);
  if (typeof value !== 'string') {
    throw new Error(`Supply ${name}`);
  }
  return value;
}
const HELP = `File-only GF9 authoring. These commands never call an application API.

bun content/gf9/authoring.ts validate
bun content/gf9/authoring.ts identities
bun content/gf9/authoring.ts inspect --environment local --checkpoint review/<run>/checkpoint.json
bun content/gf9/authoring.ts prepare --environment local --checkpoint review/<run>/checkpoint.json --run <key> [--initial-baseline] [--keys key,key]
bun content/gf9/authoring.ts collect --environment local --checkpoint review/<run>/checkpoint.json --run <key> [--prepared generated/local/<prepare-run>/report.json]
bun content/gf9/authoring.ts collect --apply generated/local/<collect-run>/report.json --reviewed-hash <printed-plan-hash>
bun content/gf9/authoring.ts prepare --environment production --checkpoint review/<run>/production.json --local-checkpoint review/<run>/local.json --review review/<run>/approval.json --run <key>

Use --root to select a GF9 content directory. Inputs must be saved normal exports and observed readbacks. Read authoring/README.md before initializing or applying a checkpoint.`;

async function main(args: string[]) {
  const operation = args[0],
    values = flags(args.slice(1)),
    root =
      typeof values.get('--root') === 'string'
        ? String(values.get('--root'))
        : fileURLToPath(new URL('.', import.meta.url));
  if (!operation || operation === '--help' || values.has('--help')) {
    console.log(HELP);
    return;
  }
  if (!['validate', 'identities', 'inspect', 'prepare', 'collect'].includes(operation)) {
    throw new Error(`Unknown operation ${operation}`);
  }
  if (operation === 'validate' || operation === 'identities') {
    const project = await loadProject(root, { inspectIdentities: operation === 'identities' });
    if (operation === 'identities') {
      console.log(
        JSON.stringify(
          {
            version: 1,
            records: [...project.values].map(([key, data]) => ({
              entityKey: key,
              owned: ownedIdentities(project.records.get(key)!, data),
            })),
          },
          null,
          2
        )
      );
    } else {
      if (values.has('--environment')) {
        await loadEnvironment(project, z.enum(['local', 'production']).parse(required(values, '--environment')));
      }
      console.log(
        JSON.stringify({ valid: true, authoringHash: project.authoringHash, records: project.records.size }, null, 2)
      );
    }
    return;
  }
  if (operation === 'collect' && values.has('--apply')) {
    console.log(
      JSON.stringify(
        await applyCollection({
          root,
          plan: required(values, '--apply'),
          reviewedHash: required(values, '--reviewed-hash'),
        }),
        null,
        2
      )
    );
    return;
  }
  const environment = z.enum(['local', 'production']).parse(required(values, '--environment'));
  const checkpoint = required(values, '--checkpoint');
  if (operation === 'inspect') {
    console.log(JSON.stringify(await inspectCheckpoint({ root, environment, checkpoint }), null, 2));
    return;
  }
  const run = z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .parse(required(values, '--run'));
  const options = {
    root,
    environment,
    checkpoint,
    run,
    keys: typeof values.get('--keys') === 'string' ? String(values.get('--keys')).split(',') : undefined,
    initialBaseline: values.has('--initial-baseline'),
    prepared: typeof values.get('--prepared') === 'string' ? String(values.get('--prepared')) : undefined,
    localCheckpoint:
      typeof values.get('--local-checkpoint') === 'string' ? String(values.get('--local-checkpoint')) : undefined,
    review: typeof values.get('--review') === 'string' ? String(values.get('--review')) : undefined,
  };
  if (operation === 'prepare') {
    const result = await prepare(options);
    console.log(JSON.stringify({ ...result, reportHash: valueHash(result.report) }, null, 2));
    if (result.report.entries.some((entry) => entry.status === 'blocked')) {
      process.exitCode = 1;
    }
    return;
  }
  if (operation === 'collect') {
    const result = await collect(options);
    console.log(JSON.stringify(result, null, 2));
    if (result.plan.blocked.length) {
      process.exitCode = 1;
    }
    return;
  }
  throw new Error(`Unknown operation ${operation}`);
}
if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
