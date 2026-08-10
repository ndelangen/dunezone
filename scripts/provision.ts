import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The unified provision pipeline (map #352, ticket #359).
 *
 * Every non-production environment is a derived value — rebuilt from (code, data source), never
 * repaired. The pipeline is five stages: backend → configure → code → data → users, parameterized
 * per target:
 *
 * E2e docker backend, fixture data (users: Playwright logins) local docker backend, prod clone
 * (users: A/B logins + remap, via app-dev) dev cloud dev deployment, prod clone (users: replicated
 * prod identities)
 *
 * Invariants: data flows prod → down only; CI invokes this same script; the e2e target must remain
 * incapable of touching prod — its commands never receive production credentials (see
 * strippedProductionCredentials).
 */

export type ProvisionTarget = 'e2e' | 'local' | 'dev';
export type ProvisionStage = 'backend' | 'configure' | 'code' | 'data';

/**
 * Tables the prod clone never keeps (decided on ticket #355): the auth session/token tables are
 * bound to the source deployment's signing keys, and cloned publication-queue rows are work-claims
 * that must never be acted on outside prod. Everything else in the snapshot stays.
 */
export const CLEARED_AFTER_CLONE = [
  'authSessions',
  'authRefreshTokens',
  'authVerificationCodes',
  'authVerifiers',
  'authRateLimits',
  'publication_jobs',
  'publication_assets',
] as const;

const PRODUCTION_CREDENTIAL_KEYS = ['CONVEX_DEPLOY_KEY', 'CONVEX_PROD_DEPLOY_KEY'] as const;

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
};

const rootDirectory = path.resolve(import.meta.dirname, '..');
const composeFile = path.join(rootDirectory, 'docker-compose.convex-local.yml');

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

export function commandEnvironment(
  base: NodeJS.ProcessEnv,
  overrides: Record<string, string | undefined>
) {
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

function strippedProductionCredentials(): Record<string, undefined> {
  return Object.fromEntries(PRODUCTION_CREDENTIAL_KEYS.map((key) => [key, undefined]));
}

/** Environment for commands against a self-hosted (docker) deployment. */
export function selfHostedEnvironment(
  base: NodeJS.ProcessEnv,
  deployment: SelfHostedDeployment
): NodeJS.ProcessEnv {
  return commandEnvironment(base, {
    CONVEX_DEPLOYMENT: '',
    CONVEX_URL: '',
    CONVEX_CLOUD_URL: '',
    CONVEX_SELF_HOSTED_URL: deployment.url,
    CONVEX_SELF_HOSTED_ADMIN_KEY: deployment.adminKey,
    ...strippedProductionCredentials(),
  });
}

/**
 * Environment for commands against the long-lived cloud dev deployment. The deployment-scoped dev
 * key pins every command to that deployment; CONVEX_DEPLOYMENT stays unset because `convex deploy`
 * would otherwise silently target production (see ticket #353).
 */
export function cloudDevEnvironment(
  base: NodeJS.ProcessEnv,
  deployment: CloudDevDeployment
): NodeJS.ProcessEnv {
  return commandEnvironment(base, {
    CONVEX_DEPLOYMENT: undefined,
    CONVEX_URL: undefined,
    CONVEX_CLOUD_URL: undefined,
    CONVEX_SELF_HOSTED_URL: undefined,
    CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    CONVEX_DEPLOY_KEY: deployment.deployKey,
    CONVEX_PROD_DEPLOY_KEY: undefined,
  });
}

/**
 * Environment for the read-only prod snapshot export. Uses the dedicated CONVEX_PROD_DEPLOY_KEY
 * when set (CI); otherwise the logged-in CLI plus `--prod` resolves production from the checked-out
 * project config.
 */
function productionExportEnvironment(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return commandEnvironment(base, {
    CONVEX_SELF_HOSTED_URL: undefined,
    CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
    CONVEX_DEPLOY_KEY: base.CONVEX_PROD_DEPLOY_KEY ?? undefined,
    CONVEX_PROD_DEPLOY_KEY: undefined,
  });
}

function run(command: string, args: string[], options: CommandOptions = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = options.quiet ? (result.stderr ?? '').trim() : '';
    const suffix = details.length > 0 ? `: ${details}` : '';
    throw new Error(`${command} ${args.join(' ')} failed${suffix}`);
  }
  return result.stdout;
}

function compose(args: string[], env: NodeJS.ProcessEnv, quiet = false) {
  return run('docker', ['compose', '-f', composeFile, ...args], { env, quiet });
}

function targetConvex(
  deployment: TargetDeployment,
  args: string[],
  env: NodeJS.ProcessEnv,
  quiet = false
) {
  const convexEnv =
    deployment.kind === 'self-hosted'
      ? selfHostedEnvironment(env, deployment)
      : cloudDevEnvironment(env, deployment);
  return run('bunx', ['convex', ...args], { env: convexEnv, quiet });
}

async function waitForBackendHealth(url: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/version`);
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
};

/** Backend stage: reset and start the disposable docker backend. */
export async function backendUp(
  env: NodeJS.ProcessEnv,
  options: BackendOptions
): Promise<SelfHostedDeployment> {
  compose(['down', '-v'], env, true);
  compose(['up', '-d'], env);
  await waitForBackendHealth(options.url);

  let adminKey = options.adminKey;
  if (!adminKey || adminKey === 'replace-me') {
    adminKey = compose(['exec', '-T', 'backend', './generate_admin_key.sh'], env, true)
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
  compose(['down', '-v'], env, quiet);
}

export type AuthConfiguration = {
  siteUrl: string;
  /** Directory that receives the generated JWT material files. */
  artifactsDirectory: string;
};

/**
 * Configure stage: local auth env vars + fresh JWT material for the disposable deployment. The
 * cloud dev deployment keeps its own env vars (they survive snapshot imports and are set once —
 * ticket #354).
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

/** Data stage, fixtures flavor: reset the pure e2e database. */
export function loadFixtureData(deployment: SelfHostedDeployment, env: NodeJS.ProcessEnv) {
  targetConvex(deployment, ['run', 'e2e:clearAll', '{}'], env);
}

/**
 * Data stage, clone flavor: point-in-time prod snapshot, atomically imported over the target, then
 * the non-replicated tables are cleared with the documented empty-import pattern.
 */
export function cloneProductionData(
  deployment: TargetDeployment,
  env: NodeJS.ProcessEnv,
  workDirectory: string
) {
  mkdirSync(workDirectory, { recursive: true });
  const snapshotPath = path.join(workDirectory, 'prod-snapshot.zip');
  console.log('Exporting the production snapshot...');
  run('bunx', ['convex', 'export', '--prod', '--path', snapshotPath], {
    env: productionExportEnvironment(env),
  });
  console.log('Importing the snapshot into the target deployment...');
  targetConvex(deployment, ['import', '--replace-all', '-y', snapshotPath], env);
  clearClonedTables(deployment, env, workDirectory);
}

function clearClonedTables(
  deployment: TargetDeployment,
  env: NodeJS.ProcessEnv,
  workDirectory: string
) {
  const emptyPath = path.join(workDirectory, 'empty.jsonl');
  writeFileSync(emptyPath, '');
  for (const table of CLEARED_AFTER_CLONE) {
    console.log(`Clearing cloned table ${table}...`);
    targetConvex(deployment, ['import', '--replace', '-y', '--table', table, emptyPath], env);
  }
}

type RemapBatchResult = { isDone: boolean; continueCursor: string };

/**
 * Runs an internal provisioning mutation through the CLI (admin-key authorized) and returns its
 * result, parsed from the last output line.
 */
function runProvisioningMutation<Result>(
  deployment: SelfHostedDeployment,
  env: NodeJS.ProcessEnv,
  functionName: string,
  args: Record<string, unknown>
): Result {
  const output = targetConvex(deployment, ['run', functionName, JSON.stringify(args)], env, true);
  const lines = output.split('\n').filter((line) => line.trim().length > 0);
  const resultLine = lines.at(-1);
  if (!resultLine) {
    throw new Error(`${functionName} produced no output`);
  }
  return JSON.parse(resultLine) as Result;
}

function drainRemapBatches(fetchBatch: (cursor: string | null) => RemapBatchResult) {
  let cursor: string | null = null;
  let batch = fetchBatch(cursor);
  while (!batch.isDone) {
    cursor = batch.continueCursor;
    batch = fetchBatch(cursor);
  }
}

/**
 * Users stage, local flavor: after the two local accounts exist, hand the cloned factions and
 * groups to reviewer A (B stays a member) so the local review workflow keeps working on prod-shaped
 * data (ticket #357).
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
  drainRemapBatches((cursor) =>
    runProvisioningMutation(deployment, env, 'provisioning:remapFactionOwnershipBatch', {
      ownerEmail,
      cursor,
    })
  );
  drainRemapBatches((cursor) =>
    runProvisioningMutation(deployment, env, 'provisioning:remapGroupOwnershipBatch', {
      ownerEmail,
      collaboratorEmail,
      cursor,
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
};

const PROVISION_TARGETS: readonly ProvisionTarget[] = ['e2e', 'local', 'dev'];

function isProvisionTarget(value: string | undefined): value is ProvisionTarget {
  return PROVISION_TARGETS.includes(value as ProvisionTarget);
}

function parseStageFlags(rest: string[], target: ProvisionTarget): ProvisionStage[] {
  const allowed = stagesForTarget(target);
  const stages: ProvisionStage[] = [];
  for (let index = 0; index < rest.length; index += 2) {
    if (rest[index] !== '--stage') {
      throw new Error(`Unknown provision argument: ${rest[index]}`);
    }
    const stage = rest[index + 1] as ProvisionStage | undefined;
    if (!stage || !allowed.includes(stage)) {
      throw new Error(`Invalid stage for target ${target}: ${stage ?? '(missing)'}`);
    }
    stages.push(stage);
  }
  return stages.length > 0 ? stages : allowed;
}

export function parseProvisionArgs(argv: string[]): ProvisionArgs {
  const [target, ...rest] = argv;
  if (!isProvisionTarget(target)) {
    throw new Error(`Usage: provision <e2e|local|dev> [--stage <backend|configure|code|data>]...`);
  }
  return { target, stages: parseStageFlags(rest, target) };
}

function provisionCloudDev(
  stages: ProvisionStage[],
  env: NodeJS.ProcessEnv,
  workDirectory: string
) {
  const deployKey = env.CONVEX_DEV_DEPLOY_KEY;
  if (!deployKey) {
    throw new Error('Set CONVEX_DEV_DEPLOY_KEY (a deployment-scoped dev deploy key)');
  }
  const deployment: CloudDevDeployment = { kind: 'cloud-dev', deployKey };
  if (stages.includes('code')) {
    console.log('Pushing code to the cloud dev deployment...');
    pushCode(deployment, env);
  }
  if (stages.includes('data')) {
    cloneProductionData(deployment, env, workDirectory);
  }
  console.log('Cloud dev deployment rebuilt from production.');
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

async function provisionSelfHosted(
  target: 'e2e' | 'local',
  stages: ProvisionStage[],
  env: NodeJS.ProcessEnv,
  workDirectory: string
) {
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
  if (!stages.includes('data')) {
    return;
  }
  if (target === 'e2e') {
    console.log('Resetting e2e fixture data...');
    loadFixtureData(deployment, env);
    return;
  }
  cloneProductionData(deployment, env, workDirectory);
}

async function runCli(args: ProvisionArgs) {
  const workDirectory = path.join(rootDirectory, '.playwright');
  if (args.target === 'dev') {
    provisionCloudDev(args.stages, process.env, workDirectory);
    return;
  }
  await provisionSelfHosted(args.target, args.stages, process.env, workDirectory);
}

if (import.meta.main) {
  try {
    await runCli(parseProvisionArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
