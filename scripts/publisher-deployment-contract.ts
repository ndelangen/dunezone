import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PUBLICATION_MAX_PICKUP } from '../src/shared/asset-publishing/publication';
import { PUBLISHER_RENDERER_CONTRACT } from '../workers/publisher/renderer-contract';
import { rendererManifest } from '../workers/publisher/renderer-manifest.generated';

export const PUBLISHER_WORKER_NAME = 'faction-sheet-asset-publisher';
export const PUBLISHER_BUCKET_NAME = 'tanstack-start-faction-sheet-assets';
export const PUBLISHER_ORIGIN = 'https://faction-sheet-asset-publisher.ndelangen.workers.dev';
export const APPLICATION_ORIGIN = 'https://dune.zone';
export const PUBLISHER_PRODUCTION_CONVEX_URL = 'https://exuberant-finch-263.eu-west-1.convex.cloud';

const CONFIG_PATH = path.resolve(process.cwd(), 'workers/publisher/wrangler.jsonc');
const PUBLISHER_CONVEX_SITE_ORIGIN = 'https://exuberant-finch-263.eu-west-1.convex.site';
const PUBLISHER_CRON = '*/5 * * * *';
const REQUIRED_SECRETS = ['ASSET_PUBLISHER_CACHE_TOKEN_SECRET', 'ASSET_PUBLISHER_EXECUTOR_SECRET'];
const STORYBOOK_STORY_ID = 'game-assets-composition-background--radial-token';

type JsonObject = Record<string, unknown>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function object(value: unknown, name: string): JsonObject {
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
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
  invariant(!url.username && !url.password && !url.hash, `${name} must not contain credentials or a fragment`);
  return url;
}

export function readPublisherConfig(): JsonObject {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as JsonObject;
}

export function validatePublisherDeployContract(config: JsonObject, environment: NodeJS.ProcessEnv): void {
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
  const convexUrl = absoluteHttpsUrl(requiredEnvironment(environment, 'VITE_CONVEX_URL'), 'VITE_CONVEX_URL');
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
  exactJson(
    config.assets,
    {
      directory: './dist',
      binding: 'ASSETS',
      html_handling: 'none',
      not_found_handling: 'single-page-application',
      run_worker_first: [
        '/__asset-publisher',
        '/__asset-publisher/*',
        '/published',
        '/published/*',
        '/publisher-capture',
        '/publisher-capture.html',
        '/publisher-capture/*',
        '/__storybook',
        '/__storybook/',
      ],
    },
    'Static Assets routing'
  );

  const vars = object(config.vars, 'vars');
  exactJson(
    vars,
    {
      CAPTURE_BASE_URL: PUBLISHER_ORIGIN,
      CONVEX_EXECUTOR_BASE_URL: `${PUBLISHER_CONVEX_SITE_ORIGIN}/asset-publishing/executor`,
      CONVEX_RENDER_URL: `${PUBLISHER_CONVEX_SITE_ORIGIN}/asset-publishing/render`,
      GIT_SHA: 'development',
      WORK_WINDOW_MS: '240000',
      BROWSER_CAPTURE_TIMEOUT_MS: '45000',
      BROWSER_CLEANUP_GRACE_MS: '15000',
      PDF_MAX_BYTES: '8000000',
    },
    'scheduled Worker variables'
  );
  exactJson(config.triggers, { crons: [PUBLISHER_CRON] }, 'Cron configuration');
  exactJson(config.r2_buckets, [{ binding: 'ASSET_BUCKET', bucket_name: PUBLISHER_BUCKET_NAME }], 'R2 binding');
  invariant(!('queues' in config), 'Queue bindings are not used');
  exactJson(config.limits, { cpu_ms: 30_000 }, 'Worker CPU limit');
  exactJson(config.browser, { binding: 'BROWSER' }, 'Browser binding');
  exactJson(config.version_metadata, { binding: 'CF_VERSION_METADATA' }, 'Worker version metadata binding');
  exactJson(config.secrets, { required: REQUIRED_SECRETS }, 'required Worker secret names');

  invariant(rendererManifest.schemaVersion === 2, 'Renderer manifest schema changed unexpectedly');
  invariant(
    Object.keys(rendererManifest.components).sort().join(',') === 'code,contract,sources,toolchain' &&
      Object.values(rendererManifest.components).every((component) => /^[0-9a-f]{64}$/.test(component)),
    'Renderer identity components are invalid'
  );
  invariant(
    /^[0-9a-f]{64}$/.test(rendererManifest.digest) &&
      rendererManifest.rendererIdentity === `faction-sheet/sha256:${rendererManifest.digest}`,
    'Renderer source identity is invalid'
  );
  exactJson(rendererManifest.contract, PUBLISHER_RENDERER_CONTRACT, 'Renderer source contract');

  const origin = absoluteHttpsUrl(PUBLISHER_ORIGIN, 'publisher origin');
  invariant(origin.pathname === '/', 'Publisher origin must not contain a path');
  invariant(
    origin.hostname === `${PUBLISHER_WORKER_NAME}.ndelangen.workers.dev`,
    'Publisher origin must be the reviewed workers.dev hostname'
  );
}

export function validatePublisherHealth(
  healthValue: unknown,
  expectedGitSha: string,
  responseUrl: string,
  cacheControl: string | null,
  expectedOrigin = PUBLISHER_ORIGIN
): void {
  invariant(/^[0-9a-f]{40}$/.test(expectedGitSha), 'Expected deployment SHA must be a full Git SHA');
  const health = object(healthValue, 'health response');
  const identity = object(health.identity, 'health identity');
  invariant(
    new URL(responseUrl).origin === new URL(expectedOrigin).origin,
    'Health response came from an unexpected origin'
  );
  invariant(cacheControl === 'no-store', 'Health response must be non-cacheable');
  invariant(health.ok === true, 'Health response is not ok');
  invariant(health.maxItems === PUBLICATION_MAX_PICKUP, 'Publisher maxItems must match the Publication contract');
  invariant(health.schedule === PUBLISHER_CRON, 'Publisher schedule must match configuration');
  invariant(
    health.rendererIdentity === rendererManifest.rendererIdentity &&
      identity.rendererIdentity === rendererManifest.rendererIdentity &&
      identity.rendererManifestDigest === rendererManifest.digest,
    'Worker health does not report the current Renderer identity'
  );
  invariant(identity.gitSha === expectedGitSha, 'Deployed Worker Git SHA does not match GITHUB_SHA');
  invariant(identity.workerVersionTag === expectedGitSha, 'Deployed Worker tag does not match GITHUB_SHA');
}

function jsonArray(value: unknown, name: string): unknown[] {
  invariant(Array.isArray(value), `${name} must be an array`);
  return value;
}

async function cloudflareApiResult(url: string, apiToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  const pathname = new URL(url).pathname;
  const payload: unknown = await response.json().catch(() => undefined);
  const body = payload === undefined ? undefined : object(payload, 'Cloudflare API response');
  invariant(
    body !== undefined && response.status === 200 && body.success === true,
    `Cloudflare API request failed for ${pathname} (HTTP ${response.status}): ${
      body === undefined ? 'unreadable body' : JSON.stringify(body.errors ?? [])
    }`
  );
  return body.result;
}

/**
 * The authoritative deploy gate: Cloudflare's control plane must report the version tagged with GITHUB_SHA as the active deployment.
 * Edge propagation is Cloudflare's promise and is deliberately not gated on (#330).
 */
async function assertActiveDeployment(githubSha: string, environment: NodeJS.ProcessEnv): Promise<void> {
  const accountId = requiredEnvironment(environment, 'CLOUDFLARE_ACCOUNT_ID');
  const apiToken = requiredEnvironment(environment, 'CLOUDFLARE_API_TOKEN');
  const scriptApi = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${PUBLISHER_WORKER_NAME}`;

  const deploymentsResult = object(
    await cloudflareApiResult(`${scriptApi}/deployments`, apiToken),
    'deployments result'
  );
  // Documented ordering: the first deployment is the latest actively serving traffic.
  const deployments = jsonArray(deploymentsResult.deployments, 'deployments');
  invariant(deployments.length > 0, 'No deployments exist for the publisher Worker');
  const active = object(deployments[0], 'active deployment');
  const activeVersions = jsonArray(active.versions, 'active deployment versions');
  invariant(activeVersions.length === 1, 'Active deployment must serve exactly one version');
  const activeVersion = object(activeVersions[0], 'active deployment version');
  invariant(activeVersion.percentage === 100, 'Active version must serve 100% of traffic');
  const versionId = activeVersion.version_id;
  invariant(typeof versionId === 'string' && versionId.length > 0, 'Active version id is missing');

  /*
   * The versions list result shape is under-documented (bare array vs {items});
   * both are accepted, each fully validated. Newest-first and unpaginated for
   * our volume — the active version is expected on the first page.
   */
  const versionsResult = await cloudflareApiResult(`${scriptApi}/versions`, apiToken);
  const versionItems = Array.isArray(versionsResult)
    ? versionsResult
    : jsonArray(object(versionsResult, 'versions result').items, 'version items');
  const activeItem = versionItems.map((item) => object(item, 'version item')).find((item) => item.id === versionId);
  invariant(activeItem, `Active version ${versionId} is missing from the versions list`);
  const tag = object(activeItem.annotations ?? {}, 'version annotations')['workers/tag'];
  invariant(
    tag === githubSha,
    `Active deployment tag ${String(tag ?? '(unset)')} does not match GITHUB_SHA ${githubSha} (version ${versionId})`
  );
  console.log(`Cloudflare reports version ${versionId} (tag ${githubSha}) as the active deployment.`);
}

/**
 * Thrown when an origin returns a healthy body for a different release.
 * Only this error — as the FINAL poll outcome — takes the advisory path;
 * any later non-stale failure (5xx, timeout, bad body) must win and fail the deploy.
 */
class StaleEdgeError extends Error {
  constructor(
    readonly observedSha: string,
    expectedSha: string
  ) {
    super(`Edge still serving ${observedSha} instead of ${expectedSha}`);
  }
}

/**
 * Couples to the PREVIOUS release's health payload shape: if identity.gitSha moves, slow propagation on the deploy that moves it hard-fails again (safe direction, but worth knowing when editing the health shape).
 */
function readObservedGitSha(healthValue: unknown): string | undefined {
  try {
    const identity = object(object(healthValue, 'health response').identity, 'health identity');
    const sha = identity.gitSha;
    return typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

function assertExactCheckout(githubSha: string): void {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  invariant(revision.status === 0, 'Unable to read the checked-out Git revision');
  invariant(revision.stdout.trim() === githubSha, 'Checked-out revision does not match GITHUB_SHA');
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  invariant(status.status === 0, 'Unable to inspect the Git worktree');
  invariant(status.stdout.trim() === '', 'Tracked source changed after checkout; refusing to deploy');
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
    await assertActiveDeployment(githubSha, process.env);
    for (const origin of [PUBLISHER_ORIGIN, APPLICATION_ORIGIN]) {
      let lastFailure: unknown;
      for (let attempt = 1; attempt <= 12; attempt += 1) {
        try {
          const response = await fetch(`${origin}/__asset-publisher/health`, {
            headers: { Accept: 'application/json' },
            redirect: 'error',
            signal: AbortSignal.timeout(5000),
          });
          invariant(response.status === 200, `Publisher health returned HTTP ${response.status}`);
          const health: unknown = await response.json();
          const observedSha = readObservedGitSha(health);
          if (observedSha !== undefined && observedSha !== githubSha) {
            throw new StaleEdgeError(observedSha, githubSha);
          }
          validatePublisherHealth(health, githubSha, response.url, response.headers.get('Cache-Control'), origin);
          console.log(`Publisher health smoke passed for ${githubSha} at ${origin}.`);
          lastFailure = undefined;
          break;
        } catch (error) {
          lastFailure = error;
          if (attempt < 12) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      }
      if (lastFailure) {
        if (lastFailure instanceof StaleEdgeError) {
          /*
           * Propagation lag, not a wrong deploy: the control plane already
           * confirmed the tagged version is active, so this is advisory (#330).
           */
          console.log(
            `::warning::Cloudflare confirms ${githubSha} is the active deployment, but ${origin} still served ${lastFailure.observedSha} on the final check; trusting the control plane on propagation.`
          );
        } else {
          throw new Error(`Publisher health did not become ready at ${origin}`, {
            cause: lastFailure,
          });
        }
      }
    }

    const noSlashUrl = `${APPLICATION_ORIGIN}/__storybook?path=/story/${STORYBOOK_STORY_ID}`;
    const redirect = await fetch(noSlashUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    invariant(redirect.status === 308, `Storybook redirect returned HTTP ${redirect.status}`);
    invariant(
      redirect.headers.get('Location') === `${APPLICATION_ORIGIN}/__storybook/?path=/story/${STORYBOOK_STORY_ID}`,
      'Storybook redirect did not preserve the manager query'
    );

    const managerResponse = await fetch(`${APPLICATION_ORIGIN}/__storybook/?path=/story/${STORYBOOK_STORY_ID}`, {
      signal: AbortSignal.timeout(5000),
    });
    invariant(managerResponse.status === 200, `Storybook manager returned HTTP ${managerResponse.status}`);
    const managerHtml = await managerResponse.text();
    invariant(
      managerHtml.includes('sb-manager/runtime.js') && managerHtml.includes('Dune Zone Storybook'),
      'Storybook manager response is not the published Dune Zone Storybook shell'
    );

    const indexResponse = await fetch(`${APPLICATION_ORIGIN}/__storybook/index.json`, {
      signal: AbortSignal.timeout(5000),
    });
    invariant(indexResponse.status === 200, `Storybook index returned HTTP ${indexResponse.status}`);
    const index = object(await indexResponse.json(), 'Storybook index');
    const entries = object(index.entries, 'Storybook index entries');
    invariant(STORYBOOK_STORY_ID in entries, `Storybook index is missing ${STORYBOOK_STORY_ID}`);

    for (const path of [
      `/__storybook/iframe.html?id=${STORYBOOK_STORY_ID}&viewMode=story`,
      '/__storybook/sb-manager/runtime.js',
      '/image/texture/054.jpg',
    ]) {
      const response = await fetch(`${APPLICATION_ORIGIN}${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      invariant(response.status === 200, `${path} returned HTTP ${response.status}`);
    }

    const rootResponse = await fetch(`${APPLICATION_ORIGIN}/`, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(5000),
    });
    invariant(rootResponse.status === 200, `Application root returned HTTP ${rootResponse.status}`);
    invariant(
      !(await rootResponse.text()).includes('sb-manager/runtime.js'),
      'Application root was replaced by the Storybook manager'
    );
    console.log(`Storybook release smoke passed for ${STORYBOOK_STORY_ID} at ${APPLICATION_ORIGIN}/__storybook/.`);
    return;
  }
  throw new Error('Expected command: preflight or smoke');
}

if (import.meta.main) {
  await run();
}
