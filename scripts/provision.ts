import type { SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { accessSync, constants as fsConstants, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import schema from '../convex/schema';
import { db as storybookDatabase } from '../src/app/db/storybook/database';
import { verifySnapshotFile } from './snapshot-anonymise';

/**
 * The unified provision pipeline (map #352, ticket #359).
 *
 * Every non-production environment is a derived value, rebuilt from (code, data source), never repaired.
 * The pipeline is five stages: backend → configure → code → data → users, parameterized per target:
 *
 * E2e: docker backend, fixture data (users: Playwright logins).
 * Local: docker backend, fixture data or the anonymised snapshot (users: A/B logins, fixture seeds and remap, via app-dev).
 * Dev: cloud dev deployment, the anonymised snapshot (users: none from production, so people sign in to dev afresh).
 *
 * Invariants: data flows prod → down only;
 * outside production only the anonymised snapshot is loaded, and no target imports a raw production export;
 * only the snapshot job exports production, with the production deploy key;
 * CI invokes this same script;
 * the e2e target must remain incapable of touching prod: its commands never receive Convex deployment credentials (see strippedConvexAdminCredentials).
 */

export type ProvisionTarget = 'e2e' | 'local' | 'dev';
export type ProvisionStage = 'backend' | 'configure' | 'code' | 'data';

const CONVEX_ADMIN_CREDENTIAL_KEYS = [
  'CONVEX_DEPLOY_KEY',
  'CONVEX_DEPLOYMENT_TOKEN',
  'CONVEX_DEV_DEPLOY_KEY',
  'CONVEX_PROD_DEPLOY_KEY',
] as const;

export type SelfHostedDeployment = {
  kind: 'self-hosted';
  url: string;
  adminKey: string;
};

export type CloudDevDeployment = {
  kind: 'cloud-dev';
  deployKey: string;
};

export type TargetDeployment = SelfHostedDeployment | CloudDevDeployment;

type CommandOptions = {
  env?: NodeJS.ProcessEnv;
  quiet?: boolean;
  timeout?: number;
};

const rootDirectory = path.resolve(import.meta.dirname, '..');
const composeFile = path.join(rootDirectory, 'docker-compose.convex-local.yml');
const dockerExecutableCandidates = [
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
  '/usr/bin/docker',
  '/Applications/Docker.app/Contents/Resources/bin/docker',
];

function isExecutableFile(candidate: string) {
  try {
    /* Sonar suppression: a fixed candidate or the developer's own checked absolute LOCAL_DEV_DOCKER_PATH, only probed. */
    accessSync(candidate, fsConstants.X_OK); /* NOSONAR */
    return statSync(candidate).isFile(); /* NOSONAR */
  } catch {
    return false;
  }
}

export function resolveDockerExecutable(environment: NodeJS.ProcessEnv) {
  const configured = environment.LOCAL_DEV_DOCKER_PATH?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new Error('LOCAL_DEV_DOCKER_PATH must be an absolute path');
    }
    if (!isExecutableFile(configured)) {
      throw new Error(`LOCAL_DEV_DOCKER_PATH is not an executable file: ${configured}`);
    }
    return configured;
  }

  const executable = dockerExecutableCandidates.find(isExecutableFile);
  if (!executable) {
    throw new Error('Could not find the Docker executable');
  }
  return executable;
}

function stripMatchedQuotes(value: string): string {
  const isQuotedWith = (quote: string) => value.startsWith(quote) && value.endsWith(quote);
  if (isQuotedWith('"') || isQuotedWith("'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseEnvFile(contents: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const sourceLine of contents.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    values[key] = stripMatchedQuotes(line.slice(separator + 1).trim());
  }
  return values;
}

export function commandEnvironment(base: NodeJS.ProcessEnv, overrides: Record<string, string | undefined>) {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete result[key];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function strippedConvexAdminCredentials(): Record<string, undefined> {
  return Object.fromEntries(CONVEX_ADMIN_CREDENTIAL_KEYS.map((key) => [key, undefined]));
}

/** Environment for commands against a self-hosted (docker) deployment. */
export function selfHostedEnvironment(base: NodeJS.ProcessEnv, deployment: SelfHostedDeployment): NodeJS.ProcessEnv {
  return commandEnvironment(base, {
    CONVEX_DEPLOYMENT: '',
    CONVEX_URL: '',
    CONVEX_CLOUD_URL: '',
    CONVEX_SELF_HOSTED_URL: deployment.url,
    CONVEX_SELF_HOSTED_ADMIN_KEY: deployment.adminKey,
    ...strippedConvexAdminCredentials(),
  });
}

/** Environment for branch application code that may target local Convex but never administer a deployment. */
export function localApplicationEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return commandEnvironment(base, {
    CONVEX_DEPLOYMENT: undefined,
    CONVEX_URL: undefined,
    CONVEX_CLOUD_URL: undefined,
    CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    PLAYWRIGHT_USER_A_EMAIL: undefined,
    PLAYWRIGHT_USER_B_EMAIL: undefined,
    PLAYWRIGHT_USER_PASSWORD: undefined,
    ...strippedConvexAdminCredentials(),
  });
}

/**
 * Environment for commands against the long-lived cloud dev deployment.
 * The deployment-scoped dev key pins every command to that deployment;
 * CONVEX_DEPLOYMENT stays unset because `convex deploy` would otherwise silently target production (see ticket #353).
 */
export function cloudDevEnvironment(base: NodeJS.ProcessEnv, deployment: CloudDevDeployment): NodeJS.ProcessEnv {
  return commandEnvironment(base, {
    CONVEX_DEPLOYMENT: undefined,
    CONVEX_URL: undefined,
    CONVEX_CLOUD_URL: undefined,
    CONVEX_SELF_HOSTED_URL: undefined,
    CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    CONVEX_DEV_DEPLOY_KEY: undefined,
    CONVEX_DEPLOY_KEY: deployment.deployKey,
    CONVEX_DEPLOYMENT_TOKEN: undefined,
    CONVEX_PROD_DEPLOY_KEY: undefined,
  });
}

/**
 * Environment for the read-only production export, which only the snapshot job runs.
 * It takes the key from CONVEX_PROD_DEPLOY_KEY alone and never falls back to another key or a logged-in Convex CLI, so no command here exports production with a developer's login.
 */
function productionExportEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const deployKey = base.CONVEX_PROD_DEPLOY_KEY;
  if (!deployKey) {
    throw new Error('Exporting production needs CONVEX_PROD_DEPLOY_KEY, which only the snapshot job holds');
  }
  return commandEnvironment(base, {
    CONVEX_SELF_HOSTED_URL: undefined,
    CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    CONVEX_DEV_DEPLOY_KEY: undefined,
    CONVEX_DEPLOY_KEY: deployKey,
    CONVEX_DEPLOYMENT_TOKEN: undefined,
    CONVEX_PROD_DEPLOY_KEY: undefined,
  });
}

function run(command: string, args: string[], options: CommandOptions = {}) {
  const displayedArgs = args
    .map((value, index) => (args[index - 1] === '--admin-key' ? '[redacted]' : value))
    .join(' ');
  /* Sonar suppression: no shell, and the executable is a fixed path or a checked absolute LOCAL_DEV_DOCKER_PATH. */
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = {
    cwd: rootDirectory,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: options.timeout,
    killSignal: 'SIGKILL',
  };
  const result = spawnSync(command, args, spawnOptions); /* NOSONAR */
  if (result.error) {
    throw new Error(`${command} ${displayedArgs} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = options.quiet ? (result.stderr ?? '').trim() : '';
    const suffix = details.length > 0 ? `: ${details}` : '';
    throw new Error(`${command} ${displayedArgs} failed${suffix}`);
  }
  return result.stdout;
}

function compose(args: string[], env: NodeJS.ProcessEnv, options: Omit<CommandOptions, 'env'> = {}) {
  return run(resolveDockerExecutable(env), ['compose', '--env-file', '/dev/null', '-f', composeFile, ...args], {
    ...options,
    env: localApplicationEnvironment(env),
  });
}

function targetConvex(deployment: TargetDeployment, args: string[], env: NodeJS.ProcessEnv, quiet = false) {
  const convexEnv =
    deployment.kind === 'self-hosted' ? selfHostedEnvironment(env, deployment) : cloudDevEnvironment(env, deployment);
  /* Explicit local targets bypass Convex's own dotenv loading, which otherwise prefers hosted keys. */
  const targetArgs =
    deployment.kind === 'self-hosted' ? ['--url', deployment.url, '--admin-key', deployment.adminKey] : [];
  return run(process.execPath, ['--no-env-file', 'x', 'convex', ...args, ...targetArgs], { env: convexEnv, quiet });
}

async function waitForBackendHealth(url: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/version`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        return;
      }
    } catch {
      // The backend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Local Convex did not become healthy at ${url}`);
}

export type BackendOptions = {
  url: string;
  adminKey?: string;
  /** When set, the generated admin key is persisted for later phases (e2e). */
  adminKeyPersistPath?: string;
  /** Capture compose's output instead of inheriting it, for a launch the caller expects to be refused. */
  quiet?: boolean;
};

/** Backend stage: reset and start the disposable docker backend. */
export async function backendUp(env: NodeJS.ProcessEnv, options: BackendOptions): Promise<SelfHostedDeployment> {
  compose(['down', '-v'], env, { quiet: true });
  compose(['up', '-d'], env, { quiet: options.quiet === true });
  await waitForBackendHealth(options.url);

  let adminKey = options.adminKey;
  if (!adminKey || adminKey === 'replace-me') {
    adminKey = compose(['exec', '-T', 'backend', './generate_admin_key.sh'], env, { quiet: true })
      .trim()
      .replaceAll('\r', '');
  }
  if (!adminKey) {
    throw new Error('Failed to obtain a self-hosted admin key');
  }
  if (options.adminKeyPersistPath) {
    mkdirSync(path.dirname(options.adminKeyPersistPath), { recursive: true });
    writeFileSync(options.adminKeyPersistPath, adminKey);
  }
  return { kind: 'self-hosted', url: options.url, adminKey };
}

export function composeDown(env: NodeJS.ProcessEnv, quiet = true) {
  compose(['down', '-v', '--remove-orphans'], env, { quiet, timeout: 30_000 });
}

export type AuthConfiguration = {
  siteUrl: string;
  /** Directory that receives the generated JWT material files. */
  artifactsDirectory: string;
};

/**
 * Configure stage: local auth env vars + fresh JWT material for the disposable deployment.
 * The cloud dev deployment keeps its own env vars (they survive snapshot imports and are set once, ticket #354).
 */
export function configureLocalAuth(
  deployment: SelfHostedDeployment,
  env: NodeJS.ProcessEnv,
  options: AuthConfiguration
) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyValue = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const jwksValue = JSON.stringify({ keys: [publicKey.export({ format: 'jwk' })] });
  mkdirSync(options.artifactsDirectory, { recursive: true });
  const privateKeyPath = path.join(options.artifactsDirectory, 'jwt-private-key.pem');
  const jwksPath = path.join(options.artifactsDirectory, 'jwks.json');
  writeFileSync(privateKeyPath, privateKeyValue);
  writeFileSync(jwksPath, jwksValue);

  const settings: Array<[string, ...string[]]> = [
    ['SITE_URL', options.siteUrl],
    ['E2E_LOCAL_AUTH', 'true'],
    ['IS_TEST', 'true'],
    ['JWT_PRIVATE_KEY', '--from-file', privateKeyPath],
    ['JWKS', '--from-file', jwksPath],
    ['JWT_PRIVATE_KEY_B64', Buffer.from(privateKeyValue).toString('base64')],
    ['JWKS_B64', Buffer.from(jwksValue).toString('base64')],
  ];
  for (const [key, ...value] of settings) {
    targetConvex(deployment, ['env', 'set', key, ...value], env);
  }
}

/** Code stage: push the checked-out functions and schema to the target. */
export function pushCode(deployment: TargetDeployment, env: NodeJS.ProcessEnv) {
  if (deployment.kind === 'self-hosted') {
    targetConvex(deployment, ['deploy'], env);
    return;
  }
  /*
   * `convex deploy` targets production even with CONVEX_DEPLOYMENT set;
   * `dev --once` is the headless push to a cloud dev deployment (#353).
   */
  targetConvex(deployment, ['dev', '--once'], env);
}

/** Data stage, fixtures flavor: reset the application tables, which the users stage then seeds. */
export function loadFixtureData(deployment: SelfHostedDeployment, env: NodeJS.ProcessEnv) {
  targetConvex(deployment, ['run', 'e2e:clearAll', '{}'], env);
}

/**
 * Data stage, snapshot flavor: the anonymised snapshot, atomically imported over the target.
 * The file is checked first, so a raw export never loads by mistake, and neither does a snapshot the rebuild contract would reject after the import.
 * `--replace-all` empties every table the snapshot leaves out.
 * The load then seeds the Rulebook drafts the snapshot leaves out, and the rebuild contract checks the emptied tables and the seeded drafts.
 */
export function loadSnapshotData(deployment: TargetDeployment, env: NodeJS.ProcessEnv, snapshotFile: string) {
  verifySnapshotFile(snapshotFile);
  console.log('Importing the anonymised snapshot into the target deployment...');
  targetConvex(deployment, ['import', '--replace-all', '-y', snapshotFile], env);
  seedSnapshotRulebookDrafts(deployment, env);
  assertRebuildContract(deployment, env);
}

/**
 * Rebuilding a long-lived deployment cannot go straight from a code push to an import: a schema push is validated against the data already there, and an import is validated against the schema already there, so a narrowing change breaks the first order and a widening change breaks the second.
 * Clearing first escapes both, because empty tables satisfy every schema.
 * That is also what lets a deployment whose data went stale recover instead of deadlocking on its own failed push.
 * The snapshot is checked before anything is cleared, so a refused file leaves the deployment as it was.
 * That check includes what the rebuild contract reads after the import, so a file the contract would reject is refused while dev still holds its data.
 * The snapshot carries no migration state or aggregates, so the migration guards run last and rebuild both.
 */
export function rebuildFromSnapshot(
  deployment: CloudDevDeployment,
  env: NodeJS.ProcessEnv,
  snapshotFile: string,
  workDirectory: string
) {
  verifySnapshotFile(snapshotFile);
  clearAllTables(deployment, env, workDirectory);
  console.log('Pushing code to the target deployment...');
  pushCode(deployment, env);
  loadSnapshotData(deployment, env, snapshotFile);
  console.log('Running the required migrations, which also rebuild the aggregates...');
  runMigrationGuards(deployment, env);
}

/**
 * Starts the required migrations on the target and waits for them.
 * A deployment loaded from fixtures or the snapshot has no migration state, so every required migration runs.
 */
export function runMigrationGuards(deployment: TargetDeployment, env: NodeJS.ProcessEnv) {
  const [guardEnv, timeoutMs] =
    deployment.kind === 'self-hosted'
      ? [selfHostedEnvironment(env, deployment), 300_000]
      : [cloudDevEnvironment(env, deployment), 600_000];
  const result = spawnSync(
    process.execPath,
    ['--no-env-file', 'run', './scripts/migration-guards.ts', 'dev-strict', String(timeoutMs), '2000'],
    { cwd: rootDirectory, env: guardEnv, stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error('The migration guards failed');
  }
}

/**
 * Exports production into a new directory under `workDirectory` and returns the zip's path.
 * Only the snapshot job calls it, and the caller deletes that directory once it has read the export.
 */
export function exportProductionSnapshot(env: NodeJS.ProcessEnv, workDirectory: string) {
  mkdirSync(workDirectory, { recursive: true });
  const exportDirectory = mkdtempSync(path.join(workDirectory, 'prod-export-'));
  const snapshotPath = path.join(exportDirectory, 'prod-snapshot.zip');
  console.log('Exporting the production snapshot...');
  try {
    run(process.execPath, ['x', 'convex', 'export', '--prod', '--path', snapshotPath], {
      env: productionExportEnvironment(env),
    });
    return snapshotPath;
  } catch (error) {
    rmSync(exportDirectory, { recursive: true, force: true });
    throw error;
  }
}

/** Empties every table the schema declares so the next schema push cannot be rejected by data. */
function clearAllTables(deployment: TargetDeployment, env: NodeJS.ProcessEnv, workDirectory: string) {
  console.log('Clearing the target deployment before pushing the new schema...');
  clearTables(deployment, env, workDirectory, Object.keys(schema.tables));
}

/**
 * A load that fails its contract is not a completed load, so the assertion is part of the data stage rather than a separate caller's responsibility.
 * The query throws on violation, which exits `convex run` non-zero and fails whoever invoked the pipeline.
 */
function assertRebuildContract(deployment: TargetDeployment, env: NodeJS.ProcessEnv) {
  console.log('Verifying the rebuild contract...');
  targetConvex(deployment, ['run', 'provisioningChecks:assertRebuildContract', '{}'], env);
}

function clearTables(
  deployment: TargetDeployment,
  env: NodeJS.ProcessEnv,
  workDirectory: string,
  tables: readonly string[]
) {
  mkdirSync(workDirectory, { recursive: true });
  const emptyPath = path.join(workDirectory, 'empty.jsonl');
  writeFileSync(emptyPath, '');
  for (const table of tables) {
    console.log(`Clearing table ${table}...`);
    targetConvex(deployment, ['import', '--replace', '-y', '--table', table, emptyPath], env);
  }
}

type BatchResult = { isDone: boolean; continueCursor: string };

const REMAP_BATCH_SIZE = 50;
const DRAFT_SEED_BATCH_SIZE = 10;

/**
 * Parses a `convex run` result: non-TTY output is pretty-printed JSON spanning multiple lines, so the whole output is one JSON value.
 */
export function parseConvexRunResult<Result>(output: string, functionName: string): Result {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    throw new Error(`${functionName} produced no output`);
  }
  try {
    return JSON.parse(trimmed) as Result;
  } catch {
    throw new Error(`${functionName} returned unparseable output:\n${output}`);
  }
}

/** Runs an internal provisioning mutation through the CLI (admin-key authorized) and returns its parsed result. */
function runProvisioningMutation<Result>(
  deployment: TargetDeployment,
  env: NodeJS.ProcessEnv,
  functionName: string,
  args: Record<string, unknown>
): Result {
  const output = targetConvex(deployment, ['run', functionName, JSON.stringify(args)], env, true);
  return parseConvexRunResult<Result>(output, functionName);
}

function drainBatches(fetchBatch: (cursor: string | null) => BatchResult) {
  let cursor: string | null = null;
  let batch = fetchBatch(cursor);
  while (!batch.isDone) {
    cursor = batch.continueCursor;
    batch = fetchBatch(cursor);
  }
}

/**
 * Each draft holds its Rulebook's current Edition as the public reader shows it, since the snapshot drops the private drafts (#1559).
 * A batch reads an Edition's Contents and writes a draft of the same size for each Rulebook, and either can come near a document's size limit, so batches stay small.
 */
function seedSnapshotRulebookDrafts(deployment: TargetDeployment, env: NodeJS.ProcessEnv) {
  console.log('Seeding a draft for each Rulebook from its current Edition...');
  let seeded = 0;
  drainBatches((cursor) => {
    const batch = runProvisioningMutation<BatchResult & { seeded: number }>(
      deployment,
      env,
      'provisioning:seedSnapshotRulebookDraftsBatch',
      { paginationOpts: { numItems: DRAFT_SEED_BATCH_SIZE, cursor } }
    );
    seeded += batch.seeded;
    return batch;
  });
  console.log(`Seeded ${seeded} Rulebook ${seeded === 1 ? 'draft' : 'drafts'}.`);
}

type SeedBaselineResult = { seeded: true } | { seeded: false; reason: string };

/**
 * Users stage, local fixture flavor: once the two local accounts exist, seed the e2e baseline for reviewer A, the Storybook page-story baseline, and the synthetic Play catalogues.
 * The e2e baseline clears every application table before it seeds, so it runs first.
 * It reports a missing owner instead of throwing, so its result is checked here.
 */
export function seedLocalFixtureData(deployment: SelfHostedDeployment, env: NodeJS.ProcessEnv, ownerEmail: string) {
  const baseline = runProvisioningMutation<SeedBaselineResult>(deployment, env, 'e2e:seedBaseline', { ownerEmail });
  if (!baseline.seeded) {
    throw new Error(`The e2e baseline was not seeded: ${baseline.reason}`);
  }
  runProvisioningMutation(deployment, env, 'provisioning:insertSeedDocuments', {
    documents: JSON.stringify(storybookDatabase(() => undefined).create()),
  });
  runProvisioningMutation(deployment, env, 'playTesting:seedRealGameCatalogue', {});
  runProvisioningMutation(deployment, env, 'playTesting:seedPublicCatalogue', {});
}

/**
 * Users stage, local flavor: after the two local accounts exist, hand every faction and group to reviewer A (B stays a member) so the local review workflow keeps working on fixture or snapshot data (ticket #357).
 */
export function remapOwnershipToLocalUsers(
  deployment: SelfHostedDeployment,
  env: NodeJS.ProcessEnv,
  ownerEmail: string,
  collaboratorEmail: string
) {
  runProvisioningMutation(deployment, env, 'provisioning:prepareLocalUsers', {
    ownerEmail,
    collaboratorEmail,
  });
  drainBatches((cursor) =>
    runProvisioningMutation(deployment, env, 'provisioning:remapFactionOwnershipBatch', {
      ownerEmail,
      paginationOpts: { numItems: REMAP_BATCH_SIZE, cursor },
    })
  );
  drainBatches((cursor) =>
    runProvisioningMutation(deployment, env, 'provisioning:remapGroupOwnershipBatch', {
      ownerEmail,
      collaboratorEmail,
      paginationOpts: { numItems: REMAP_BATCH_SIZE, cursor },
    })
  );
}

export function stagesForTarget(target: ProvisionTarget): ProvisionStage[] {
  if (target === 'dev') {
    // The cloud deployment always exists and keeps its env vars.
    return ['code', 'data'];
  }
  return ['backend', 'configure', 'code', 'data'];
}

export type ProvisionArgs = {
  target: ProvisionTarget;
  stages: ProvisionStage[];
  /** True when the caller named stages with --stage flags rather than taking the default set. */
  stagesExplicit: boolean;
  /** The anonymised snapshot the dev target's data stage loads, and null for every other stage and target. */
  snapshotFile: string | null;
};

const PROVISION_TARGETS: readonly ProvisionTarget[] = ['e2e', 'local', 'dev'];

const USAGE =
  'Usage: provision <e2e|local|dev> [--stage <backend|configure|code|data>]... [--snapshot-file <zip>, dev data stage only]';

const SNAPSHOT_FILE_REQUIRED =
  'The dev data stage loads the anonymised snapshot, never production: pass --snapshot-file <zip>';

function isProvisionTarget(value: string | undefined): value is ProvisionTarget {
  return PROVISION_TARGETS.includes(value as ProvisionTarget);
}

function parseFlags(rest: string[], target: ProvisionTarget) {
  const allowed = stagesForTarget(target);
  const stages: ProvisionStage[] = [];
  let snapshotFile: string | null = null;
  for (let index = 0; index < rest.length; index += 2) {
    const value = rest[index + 1];
    switch (rest[index]) {
      case '--stage':
        if (!value || !allowed.includes(value as ProvisionStage)) {
          throw new Error(`Invalid stage for target ${target}: ${value ?? '(missing)'}`);
        }
        stages.push(value as ProvisionStage);
        break;
      case '--snapshot-file':
        if (!value || snapshotFile !== null) {
          throw new Error(USAGE);
        }
        snapshotFile = value;
        break;
      default:
        throw new Error(`Unknown provision argument: ${rest[index]}`);
    }
  }
  return { stages, snapshotFile };
}

export function parseProvisionArgs(argv: string[]): ProvisionArgs {
  const [target, ...rest] = argv;
  if (!isProvisionTarget(target)) {
    throw new Error(USAGE);
  }
  const { stages: explicit, snapshotFile } = parseFlags(rest, target);
  const stages = explicit.length > 0 ? explicit : stagesForTarget(target);
  const loadsSnapshot = target === 'dev' && stages.includes('data');
  if (loadsSnapshot && snapshotFile === null) {
    throw new Error(SNAPSHOT_FILE_REQUIRED);
  }
  if (!loadsSnapshot && snapshotFile !== null) {
    throw new Error('--snapshot-file belongs to the dev data stage alone');
  }
  return { target, stages, stagesExplicit: explicit.length > 0, snapshotFile };
}

function provisionCloudDev(
  stages: ProvisionStage[],
  snapshotFile: string | null,
  env: NodeJS.ProcessEnv,
  workDirectory: string
) {
  const deployKey = env.CONVEX_DEV_DEPLOY_KEY;
  if (!deployKey) {
    throw new Error('Set CONVEX_DEV_DEPLOY_KEY (a deployment-scoped dev deploy key)');
  }
  const deployment: CloudDevDeployment = { kind: 'cloud-dev', deployKey };
  /*
   * A data rebuild carries its own code push: the two are ordered against each other (clear, push,
   * import), so asking for data means asking for the code that data has to satisfy.
   */
  if (stages.includes('data')) {
    if (snapshotFile === null) {
      throw new Error(SNAPSHOT_FILE_REQUIRED);
    }
    rebuildFromSnapshot(deployment, env, path.resolve(snapshotFile), workDirectory);
    console.log('Cloud dev deployment rebuilt from the anonymised snapshot.');
    return;
  }
  console.log('Pushing code to the cloud dev deployment...');
  pushCode(deployment, env);
}

async function resolveSelfHostedDeployment(
  stages: ProvisionStage[],
  env: NodeJS.ProcessEnv,
  workDirectory: string
): Promise<SelfHostedDeployment> {
  const url = env.CONVEX_SELF_HOSTED_URL ?? 'http://127.0.0.1:3210';
  if (stages.includes('backend')) {
    console.log('Resetting the disposable local Convex backend...');
    return await backendUp(env, {
      url,
      adminKey: env.CONVEX_SELF_HOSTED_ADMIN_KEY,
      adminKeyPersistPath: path.join(workDirectory, 'admin-key'),
    });
  }
  const adminKey = env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  if (!adminKey || adminKey === 'replace-me') {
    throw new Error('CONVEX_SELF_HOSTED_ADMIN_KEY is required when skipping the backend stage');
  }
  return { kind: 'self-hosted', url, adminKey };
}

async function provisionSelfHosted(stages: ProvisionStage[], env: NodeJS.ProcessEnv, workDirectory: string) {
  const deployment = await resolveSelfHostedDeployment(stages, env, workDirectory);
  if (stages.includes('configure')) {
    console.log('Configuring local auth env vars...');
    configureLocalAuth(deployment, env, {
      siteUrl: env.SITE_URL ?? 'http://localhost:6001',
      artifactsDirectory: workDirectory,
    });
  }
  if (stages.includes('code')) {
    console.log('Deploying functions to the local backend...');
    pushCode(deployment, env);
  }
  if (stages.includes('data')) {
    /* The local target's snapshot load belongs to `app:dev --local` alone. */
    console.log('Resetting fixture data...');
    loadFixtureData(deployment, env);
  }
}

async function runCli(args: ProvisionArgs) {
  const workDirectory = path.join(rootDirectory, '.playwright');
  if (args.target === 'dev') {
    provisionCloudDev(args.stages, args.snapshotFile, process.env, workDirectory);
    return;
  }
  if (args.target === 'local' && !args.stagesExplicit) {
    /*
     * The local users stage (A/B accounts + ownership remap) needs the
     * running app, so this CLI alone cannot produce a complete local
     * environment. Refuse rather than report a half-provisioned success.
     */
    throw new Error(
      "The local target is provisioned by 'bun run app:dev --local' (its users stage needs the running app). Pass explicit --stage flags for partial provisioning."
    );
  }
  await provisionSelfHosted(args.stages, process.env, workDirectory);
}

if (import.meta.main) {
  try {
    await runCli(parseProvisionArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
