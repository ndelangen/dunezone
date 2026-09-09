import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { assertActiveDeployment } from './cloudflare-deployment';
import { checkGameWorkerLiveDrift } from './cloudflare-live-drift';

export const GAME_WORKER_NAME = 'dunezone-game';
const APPLICATION_ORIGIN = 'https://dune.zone';
const CONVEX_URL = 'https://exuberant-finch-263.eu-west-1.convex.cloud';
type JsonObject = Record<string, unknown>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function object(value: unknown, label: string): JsonObject {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonObject;
}

function exact(actual: unknown, expected: unknown, label: string): void {
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `Game ${label} differs from the reviewed contract`);
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  invariant(typeof value === 'string' && value.trim().length > 0, `${name} is required`);
  return value;
}

export function readGameConfig(): JsonObject {
  return object(JSON.parse(readFileSync(path.resolve('workers/game/wrangler.jsonc'), 'utf8')), 'Game configuration');
}

export function validateGameDeployContract(config: JsonObject, environment: NodeJS.ProcessEnv): void {
  invariant(/^[0-9a-f]{40}$/.test(required(environment, 'GITHUB_SHA')), 'GITHUB_SHA must be a full Git SHA');
  invariant(required(environment, 'GITHUB_REF') === 'refs/heads/main', 'Game deploys are restricted to main');
  invariant(/^[0-9a-f]{32}$/.test(required(environment, 'CLOUDFLARE_ACCOUNT_ID')), 'Cloudflare account ID is invalid');
  required(environment, 'CLOUDFLARE_API_TOKEN');
  exact(config.name, GAME_WORKER_NAME, 'Worker name');
  exact(config.main, './index.ts', 'entrypoint');
  exact(config.workers_dev, false, 'workers.dev ingress');
  exact(config.preview_urls, false, 'preview ingress');
  exact(config.routes, [], 'public ingress routes');
  invariant(
    !('route' in config) && !('env' in config),
    'Game production config must not add alternate ingress or environments'
  );
  exact(config.compatibility_date, '2026-08-11', 'compatibility date');
  exact(config.compatibility_flags, ['nodejs_compat'], 'compatibility flags');
  exact(config.vars, { CONVEX_URL, APPLICATION_ORIGIN, GIT_SHA: 'development' }, 'variables');
  exact(
    config.durable_objects,
    { bindings: [{ name: 'GAME_ROOMS', class_name: 'GameRoom' }] },
    'Durable Object binding'
  );
  exact(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['GameRoom'] }], 'SQLite migration');
  exact(config.version_metadata, { binding: 'CF_VERSION_METADATA' }, 'version metadata');
  exact(config.limits, { cpu_ms: 30_000 }, 'CPU bound');
  for (const binding of [
    'assets',
    'browser',
    'images',
    'r2_buckets',
    'queues',
    'kv_namespaces',
    'd1_databases',
    'services',
    'secrets',
    'triggers',
  ]) {
    invariant(!(binding in config), `Game Worker must not acquire ${binding}`);
  }
}

export function validateGameHealth(
  value: unknown,
  expected: { gitSha: string; versionId: string },
  response: Pick<Response, 'url' | 'headers'>
): void {
  const health = object(value, 'Game health');
  const identity = object(health.identity, 'Game deployment identity');
  invariant(new URL(response.url).origin === APPLICATION_ORIGIN, 'Game health came from an unexpected origin');
  invariant(response.headers.get('Cache-Control') === 'no-store', 'Game health must not be cacheable');
  invariant(health.ok === true, 'Game health is not ready');
  invariant(
    identity.gitSha === expected.gitSha && identity.workerVersionTag === expected.gitSha,
    'Game health source SHA or tag differs'
  );
  invariant(identity.workerVersionId === expected.versionId, 'Game health version differs from the active deployment');
}

async function smokeGame(expected: Parameters<typeof validateGameHealth>[1]): Promise<void> {
  const response = await fetch(`${APPLICATION_ORIGIN}/__play/health`, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  invariant(response.status === 200, `Game health returned HTTP ${response.status}`);
  validateGameHealth(await response.json(), expected, response);
  console.log(`Bound game Worker health passed for ${expected.gitSha}, version ${expected.versionId}.`);
}

function exactCheckout(sha: string): void {
  const revision = spawnSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  invariant(
    revision.status === 0 && revision.stdout.trim() === sha,
    'Game deployment checkout does not match GITHUB_SHA'
  );
  const status = spawnSync('/usr/bin/git', ['status', '--porcelain'], { encoding: 'utf8' });
  invariant(
    status.status === 0 && status.stdout.trim() === '',
    'Source changed after checkout; refusing game deployment'
  );
}

if (import.meta.main) {
  const [command] = process.argv.slice(2);
  const sha = required(process.env, 'GITHUB_SHA');
  if (command === 'preflight') {
    validateGameDeployContract(readGameConfig(), process.env);
    exactCheckout(sha);
    console.log(`Game deployment preflight passed for ${sha}.`);
  } else if (command === 'active') {
    const version = await assertActiveDeployment({ workerName: GAME_WORKER_NAME, gitSha: sha }, process.env);
    const drift = await checkGameWorkerLiveDrift({
      accountId: required(process.env, 'CLOUDFLARE_ACCOUNT_ID'),
      apiToken: required(process.env, 'CLOUDFLARE_API_TOKEN'),
    });
    console.log(`Private game Worker and SQLite namespace ${drift.namespaceId} passed the live contract.`);
    invariant(/^[0-9a-f-]{36}$/.test(version), 'Active game Worker version ID is invalid');
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `version_id=${version}\n`);
    }
  } else if (command === 'smoke') {
    await smokeGame({ gitSha: sha, versionId: required(process.env, 'GAME_WORKER_VERSION_ID') });
  } else {
    throw new Error('Expected game deployment command: preflight, active or smoke');
  }
}
