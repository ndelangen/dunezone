import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  PUBLISHER_RENDERER_CONTRACT,
  PUBLISHER_RENDERER_VERSION,
  PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
} from '../workers/publisher/renderer-contract';
import { rendererManifest } from '../workers/publisher/renderer-manifest.generated';

export const PUBLISHER_WORKER_NAME = 'faction-sheet-asset-publisher';
export const PUBLISHER_BUCKET_NAME = 'tanstack-start-faction-sheet-assets';
export const PUBLISHER_ORIGIN = 'https://faction-sheet-asset-publisher.ndelangen.workers.dev';
export const APPLICATION_ORIGIN = 'https://dune.zone';
export const PUBLISHER_PRODUCTION_CONVEX_URL = 'https://exuberant-finch-263.eu-west-1.convex.cloud';
export { PUBLISHER_RENDERER_VERSION, PUBLISHER_SUPPORTED_RENDERER_VERSIONS };

const CONFIG_PATH = path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc');
const PUBLISHER_CONVEX_SITE_ORIGIN = 'https://exuberant-finch-263.eu-west-1.convex.site';
const PUBLISHER_CRON = '*/5 * * * *';
const REQUIRED_SECRETS = ['ASSET_PUBLISHER_CACHE_TOKEN_SECRET', 'ASSET_PUBLISHER_EXECUTOR_SECRET'];

type JsonObject = Record<string, unknown>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, name: string): JsonObject {
  invariant(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${name} must be an object`
  );
  return value as JsonObject;
}

function exactJson(actual: unknown, expected: unknown, name: string): void {
  invariant(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${name} does not match the reviewed production contract`
  );
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  invariant(typeof value === 'string' && value.trim().length > 0, `${name} is required`);
  return value;
}

function absoluteHttpsUrl(value: string, name: string): URL {
  const url = new URL(value);
  invariant(url.protocol === 'https:', `${name} must use HTTPS`);
  invariant(
    !url.username && !url.password && !url.hash,
    `${name} must not contain credentials or a fragment`
  );
  return url;
}

export function readPublisherConfig(): JsonObject {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as JsonObject;
}

export function validatePublisherDeployContract(
  config: JsonObject,
  environment: NodeJS.ProcessEnv
): void {
  const githubSha = requiredEnvironment(environment, 'GITHUB_SHA');
  invariant(/^[0-9a-f]{40}$/.test(githubSha), 'GITHUB_SHA must be a full lowercase Git commit SHA');
  invariant(
    requiredEnvironment(environment, 'GITHUB_REF') === 'refs/heads/main',
    'Publisher deploys are restricted to refs/heads/main'
  );
  invariant(
    /^[0-9a-f]{32}$/.test(requiredEnvironment(environment, 'CLOUDFLARE_ACCOUNT_ID')),
    'CLOUDFLARE_ACCOUNT_ID must be a 32-character account ID'
  );
  requiredEnvironment(environment, 'CLOUDFLARE_API_TOKEN');
  const convexUrl = absoluteHttpsUrl(
    requiredEnvironment(environment, 'VITE_CONVEX_URL'),
    'VITE_CONVEX_URL'
  );
  invariant(
    convexUrl.href === `${PUBLISHER_PRODUCTION_CONVEX_URL}/`,
    'VITE_CONVEX_URL must be the exact production Convex deployment URL'
  );

  invariant(config.name === PUBLISHER_WORKER_NAME, 'Worker name changed unexpectedly');
  invariant(config.main === './index.ts', 'Worker entrypoint changed unexpectedly');
  invariant(config.workers_dev === true, 'workers.dev must remain enabled');
  invariant(config.preview_urls === false, 'preview URLs must remain disabled');
  exactJson(
    config.routes,
    [{ pattern: new URL(APPLICATION_ORIGIN).hostname, custom_domain: true }],
    'application Custom Domain'
  );
  invariant(!('route' in config), 'The singular route form is not allowed');

  const vars = object(config.vars, 'vars');
  exactJson(
    vars,
    {
      CAPTURE_BASE_URL: PUBLISHER_ORIGIN,
      CONVEX_EXECUTOR_BASE_URL: `${PUBLISHER_CONVEX_SITE_ORIGIN}/asset-publishing/executor`,
      CONVEX_RENDER_URL: `${PUBLISHER_CONVEX_SITE_ORIGIN}/asset-publishing/render`,
      SUPPORTED_RENDERER_VERSION: PUBLISHER_RENDERER_VERSION,
      WORK_WINDOW_MS: '240000',
      BROWSER_CAPTURE_TIMEOUT_MS: '45000',
      BROWSER_CLEANUP_GRACE_MS: '15000',
      PDF_MAX_BYTES: '8000000',
    },
    'scheduled Worker variables'
  );
  exactJson(config.triggers, { crons: [PUBLISHER_CRON] }, 'Cron configuration');
  exactJson(
    config.r2_buckets,
    [{ binding: 'ASSET_BUCKET', bucket_name: PUBLISHER_BUCKET_NAME }],
    'R2 binding'
  );
  invariant(!('queues' in config), 'Queue bindings are retired from the item-list executor');
  exactJson(config.limits, { cpu_ms: 30_000 }, 'Worker CPU limit');
  exactJson(config.browser, { binding: 'BROWSER' }, 'Browser binding');
  exactJson(
    config.version_metadata,
    { binding: 'CF_VERSION_METADATA' },
    'Worker version metadata binding'
  );
  exactJson(config.secrets, { required: REQUIRED_SECRETS }, 'required Worker secret names');

  invariant(rendererManifest.schemaVersion === 1, 'Renderer manifest schema changed unexpectedly');
  invariant(
    rendererManifest.rendererVersion === PUBLISHER_RENDERER_VERSION &&
      vars.SUPPORTED_RENDERER_VERSION === rendererManifest.rendererVersion,
    'Configured renderer version does not match the source manifest'
  );
  exactJson(
    rendererManifest.supportedRendererVersions,
    PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
    'renderer manifest support list'
  );
  invariant(
    /^[0-9a-f]{64}$/.test(rendererManifest.digest) &&
      rendererManifest.rendererId === `faction-sheet/sha256:${rendererManifest.digest}`,
    'Renderer source identity is invalid'
  );
  exactJson(rendererManifest.contract, PUBLISHER_RENDERER_CONTRACT, 'renderer source contract');

  const origin = absoluteHttpsUrl(PUBLISHER_ORIGIN, 'publisher origin');
  invariant(origin.pathname === '/', 'Publisher origin must not contain a path');
  invariant(
    origin.hostname === `${PUBLISHER_WORKER_NAME}.ndelangen.workers.dev`,
    'Publisher origin must be the reviewed workers.dev hostname'
  );
}

export function validatePublisherHealth(
  config: JsonObject,
  healthValue: unknown,
  expectedGitSha: string,
  responseUrl: string,
  cacheControl: string | null,
  expectedOrigin = PUBLISHER_ORIGIN
): void {
  invariant(
    /^[0-9a-f]{40}$/.test(expectedGitSha),
    'Expected deployment SHA must be a full Git SHA'
  );
  const vars = object(config.vars, 'vars');
  const health = object(healthValue, 'health response');
  const rendererSupport = object(health.rendererSupport, 'health rendererSupport');
  const identity = object(health.identity, 'health identity');
  const configuredOrigin = new URL(expectedOrigin).origin;
  invariant(
    new URL(responseUrl).origin === configuredOrigin,
    'Health response came from an unexpected origin'
  );
  invariant(cacheControl === 'no-store', 'Health response must be non-cacheable');
  invariant(health.ok === true, 'Health response is not ok');
  invariant(health.maxItems === 20, 'Publisher maxItems must match the fixed item-list contract');
  invariant(health.schedule === PUBLISHER_CRON, 'Publisher schedule must match configuration');
  invariant(
    health.supportedRendererVersion === vars.SUPPORTED_RENDERER_VERSION,
    'Health renderer version does not match checked-in configuration'
  );
  exactJson(
    rendererSupport.supportedRendererVersions,
    PUBLISHER_SUPPORTED_RENDERER_VERSIONS,
    'renderer support list'
  );
  invariant(
    rendererSupport.configuredRendererVersion === vars.SUPPORTED_RENDERER_VERSION &&
      rendererSupport.configurationMatchesManifest === true,
    'Renderer support does not match the embedded manifest'
  );
  invariant(
    typeof rendererSupport.rendererId === 'string' &&
      /^faction-sheet\/sha256:[0-9a-f]{64}$/.test(rendererSupport.rendererId),
    'Renderer identity is invalid'
  );
  const rendererDigest = rendererSupport.rendererId.slice('faction-sheet/sha256:'.length);
  invariant(
    identity.rendererId === rendererSupport.rendererId &&
      identity.rendererManifestDigest === rendererDigest,
    'Worker identity and renderer support describe different release bytes'
  );
  invariant(
    identity.workerVersionTag === expectedGitSha,
    'Deployed Worker tag does not match GITHUB_SHA'
  );
  invariant(
    identity.configuredRendererVersion === vars.SUPPORTED_RENDERER_VERSION &&
      identity.rendererConfigurationMatchesManifest === true,
    'Deployed Worker identity reports a renderer mismatch'
  );
}

function assertExactCheckout(githubSha: string): void {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  invariant(revision.status === 0, 'Unable to read the checked-out Git revision');
  invariant(revision.stdout.trim() === githubSha, 'Checked-out revision does not match GITHUB_SHA');
  const status = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  });
  invariant(status.status === 0, 'Unable to inspect the Git worktree');
  invariant(
    status.stdout.trim() === '',
    'Tracked source changed after checkout; refusing to deploy'
  );
}

async function run(): Promise<void> {
  const [command] = process.argv.slice(2);
  const config = readPublisherConfig();
  if (command === 'preflight') {
    validatePublisherDeployContract(config, process.env);
    assertExactCheckout(requiredEnvironment(process.env, 'GITHUB_SHA'));
    console.log(`Publisher CI preflight passed for ${process.env.GITHUB_SHA}.`);
    return;
  }
  if (command === 'smoke') {
    const githubSha = requiredEnvironment(process.env, 'GITHUB_SHA');
    for (const origin of [PUBLISHER_ORIGIN, APPLICATION_ORIGIN]) {
      let lastFailure: unknown;
      for (let attempt = 1; attempt <= 12; attempt += 1) {
        try {
          const response = await fetch(`${origin}/__asset-publisher/health`, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(5_000),
          });
          invariant(response.status === 200, `Publisher health returned HTTP ${response.status}`);
          const health = await response.json();
          validatePublisherHealth(
            config,
            health,
            githubSha,
            response.url,
            response.headers.get('Cache-Control'),
            origin
          );
          console.log(`Publisher health smoke passed for ${githubSha} at ${origin}.`);
          lastFailure = undefined;
          break;
        } catch (error) {
          lastFailure = error;
          if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
      if (lastFailure) {
        throw new Error(`Publisher health did not become ready at ${origin}`, {
          cause: lastFailure,
        });
      }
    }
    return;
  }
  throw new Error('Expected command: preflight or smoke');
}

if (import.meta.main) await run();
