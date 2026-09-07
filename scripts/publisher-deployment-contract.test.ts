import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { rendererManifest } from '../workers/publisher/renderer-manifest.generated';
import {
  ACTIVE_DEPLOYMENT_DEADLINE_MS,
  ACTIVE_DEPLOYMENT_INTERVAL_MS,
  APPLICATION_ORIGIN,
  PUBLISHER_ORIGIN,
  PUBLISHER_PRODUCTION_CONVEX_URL,
  assertActiveDeployment,
  readPublisherConfig,
  validatePublisherDeployContract,
  validatePublisherHealth,
} from './publisher-deployment-contract';

function ciEnvironment(): NodeJS.ProcessEnv {
  return {
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_REF: 'refs/heads/main',
    CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32),
    CLOUDFLARE_API_TOKEN: 'not-a-real-token',
    VITE_CONVEX_URL: PUBLISHER_PRODUCTION_CONVEX_URL,
  };
}

function health() {
  return {
    ok: true,
    maxItems: 20,
    schedule: '*/5 * * * *',
    rendererIdentity: rendererManifest.rendererIdentity,
    identity: {
      workerVersionTag: 'a'.repeat(40),
      gitSha: 'a'.repeat(40),
      rendererIdentity: rendererManifest.rendererIdentity,
      rendererManifestDigest: rendererManifest.digest,
    },
  };
}

describe('publisher CI deployment contract', () => {
  test('accepts the reviewed scheduled source-controlled configuration', () => {
    expect(() => validatePublisherDeployContract(readPublisherConfig(), ciEnvironment())).not.toThrow();
  });

  test('requires only the executor credential from the Worker secret store', () => {
    const missingExecutor = structuredClone(readPublisherConfig());
    missingExecutor.secrets = { required: [] };
    expect(() => validatePublisherDeployContract(missingExecutor, ciEnvironment())).toThrow(
      /required Worker secret names/
    );

    const retiredSigningSecret = structuredClone(readPublisherConfig());
    retiredSigningSecret.secrets = {
      required: ['ASSET_PUBLISHER_EXECUTOR_SECRET', 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET'],
    };
    expect(() => validatePublisherDeployContract(retiredSigningSecret, ciEnvironment())).toThrow(
      /required Worker secret names/
    );
  });

  test.each([
    ['WORK_WINDOW_MS', '239999'],
    ['PDF_MAX_BYTES', '8000001'],
    ['CONVEX_EXECUTOR_BASE_URL', 'https://replacement.convex.site/asset-publishing/executor'],
  ])('fails closed when %s changes', (name, value) => {
    const config = structuredClone(readPublisherConfig());
    (config.vars as Record<string, unknown>)[name] = value;
    expect(() => validatePublisherDeployContract(config, ciEnvironment())).toThrow();
  });

  test('fails closed when the exact Cron or a resource name changes', () => {
    const cronConfig = structuredClone(readPublisherConfig());
    cronConfig.triggers = { crons: [] };
    expect(() => validatePublisherDeployContract(cronConfig, ciEnvironment())).toThrow();

    const bucketConfig = structuredClone(readPublisherConfig());
    (bucketConfig.r2_buckets as Array<Record<string, unknown>>)[0].bucket_name = 'replacement';
    expect(() => validatePublisherDeployContract(bucketConfig, ciEnvironment())).toThrow();
  });

  test('fails closed unless VITE_CONVEX_URL is the exact production deployment', () => {
    expect(() =>
      validatePublisherDeployContract(readPublisherConfig(), {
        ...ciEnvironment(),
        VITE_CONVEX_URL: 'https://example.convex.cloud',
      })
    ).toThrow(/exact production Convex deployment URL/);
  });

  test.each([PUBLISHER_ORIGIN, APPLICATION_ORIGIN])('accepts current Renderer health at %s', (origin) => {
    expect(() =>
      validatePublisherHealth(health(), 'a'.repeat(40), `${origin}/__asset-publisher/health`, 'no-store', origin)
    ).not.toThrow();
  });

  test.each([
    ['maxItems', 1],
    ['schedule', '*/15 * * * *'],
    ['rendererIdentity', `faction-sheet/sha256:${'c'.repeat(64)}`],
  ])('rejects mismatched health field %s', (name, value) => {
    const response = health() as Record<string, unknown>;
    response[name] = value;
    expect(() =>
      validatePublisherHealth(response, 'a'.repeat(40), `${PUBLISHER_ORIGIN}/__asset-publisher/health`, 'no-store')
    ).toThrow();
  });

  test('rejects alternate origins, cached responses, and wrong source tags', () => {
    expect(() =>
      validatePublisherHealth(
        health(),
        'a'.repeat(40),
        'https://alternate.workers.dev/__asset-publisher/health',
        'no-store'
      )
    ).toThrow();
    expect(() =>
      validatePublisherHealth(
        health(),
        'a'.repeat(40),
        `${PUBLISHER_ORIGIN}/__asset-publisher/health`,
        'public, max-age=60'
      )
    ).toThrow();
    expect(() =>
      validatePublisherHealth(health(), 'd'.repeat(40), `${PUBLISHER_ORIGIN}/__asset-publisher/health`, 'no-store')
    ).toThrow();
  });
});

/* The two releases of the 2026-09-03 failures: the list still reported the previous one. */
const PREVIOUS = { versionId: 'cbe4507e-7bcf-4282-8757-5f06a261554f', tag: 'a2292d89ad612c10869803de327eba733026c585' };
const RELEASED = { versionId: 'a16e8a1f-3562-4264-a096-5db3d675de62', tag: '6a847cf61ee3693b8f8087a10d68e587d2c10491' };

type Answer = { active: typeof PREVIOUS } | { status: number } | 'unreachable';

/* A control plane whose deployments list answers in the given order and repeats the last answer. */
function controlPlane(answers: Answer[]) {
  const log: string[] = [];
  const slept: number[] = [];
  let clock = 1_000_000;
  let reads = 0;
  const fetcher = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/versions')) {
      return Response.json({
        success: true,
        result: [RELEASED, PREVIOUS].map((version) => ({
          id: version.versionId,
          annotations: { 'workers/tag': version.tag },
        })),
      });
    }
    if (!url.pathname.endsWith('/deployments')) {
      throw new Error(`Unexpected request: ${url.pathname}`);
    }
    const answer = answers[Math.min(reads, answers.length - 1)] ?? 'unreachable';
    reads += 1;
    if (answer === 'unreachable') {
      throw new Error('The socket connection was closed unexpectedly');
    }
    if ('status' in answer) {
      return Response.json({ success: false, errors: [{ message: 'upstream' }] }, { status: answer.status });
    }
    return Response.json({
      success: true,
      result: { deployments: [{ versions: [{ version_id: answer.active.versionId, percentage: 100 }] }] },
    });
  };
  const dependencies = {
    fetcher,
    sleep: async (ms: number) => {
      slept.push(ms);
      clock += ms;
    },
    now: () => clock,
    log: (line: string) => log.push(line),
  };
  return { dependencies, log, slept, reads: () => reads };
}

describe('active deployment gate', () => {
  const environment = { CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), CLOUDFLARE_API_TOKEN: 'not-a-real-token' };
  const waiting = (secondsLeft: number) =>
    `Deployments list reports tag ${PREVIOUS.tag} (version ${PREVIOUS.versionId}); waiting for GITHUB_SHA ${RELEASED.tag}, ${secondsLeft} s left`;

  test('reads the list again until it reports the tagged version, logging each observation', async () => {
    const plane = controlPlane([{ active: PREVIOUS }, { active: PREVIOUS }, { active: RELEASED }]);
    await expect(assertActiveDeployment(RELEASED.tag, environment, plane.dependencies)).resolves.toBeUndefined();
    expect(plane.reads()).toBe(3);
    expect(plane.slept).toEqual([ACTIVE_DEPLOYMENT_INTERVAL_MS, ACTIVE_DEPLOYMENT_INTERVAL_MS]);
    expect(plane.log).toEqual([
      waiting(1200),
      waiting(1190),
      `Cloudflare reports version ${RELEASED.versionId} (tag ${RELEASED.tag}) as the active deployment.`,
    ]);
  });

  test('refuses a list that never reports the tag once the deadline passes, naming the last observation', async () => {
    const plane = controlPlane([{ active: PREVIOUS }]);
    await expect(assertActiveDeployment(RELEASED.tag, environment, plane.dependencies)).rejects.toThrow(
      `Active deployment did not become GITHUB_SHA ${RELEASED.tag} within 20 min; last observation: tag ${PREVIOUS.tag} (version ${PREVIOUS.versionId})`
    );
    expect(plane.reads()).toBe(ACTIVE_DEPLOYMENT_DEADLINE_MS / ACTIVE_DEPLOYMENT_INTERVAL_MS + 1);
    expect(plane.slept.reduce((sum, ms) => sum + ms, 0)).toBe(ACTIVE_DEPLOYMENT_DEADLINE_MS);
  });

  test('counts a closed socket and a 503 as observations but refuses a 403 at once', async () => {
    const lagging = controlPlane(['unreachable', { status: 503 }, { active: RELEASED }]);
    await expect(assertActiveDeployment(RELEASED.tag, environment, lagging.dependencies)).resolves.toBeUndefined();
    expect(lagging.reads()).toBe(3);
    expect(lagging.log[0]).toContain('The socket connection was closed unexpectedly; waiting for GITHUB_SHA');
    expect(lagging.log[1]).toContain('(HTTP 503)');

    const denied = controlPlane([{ status: 403 }]);
    await expect(assertActiveDeployment(RELEASED.tag, environment, denied.dependencies)).rejects.toThrow(/HTTP 403/);
    expect(denied.reads()).toBe(1);
    expect(denied.slept).toEqual([]);
  });

  test('the deploy job timeout holds the deadline and the rest of the deploy', () => {
    const workflow = readFileSync(path.resolve(process.cwd(), '.github/workflows/deploy-main.yml'), 'utf8');
    const job = /\n  deploy:\n(?:.*\n)*?\s+timeout-minutes: (\d+)\n/.exec(workflow);
    /* Three minutes of healthy steps around the gate, and the narrow check's bounded retries before it (#1053). */
    const restOfDeployMs = 7 * 60_000;
    expect(Number(job?.[1]) * 60_000).toBeGreaterThan(ACTIVE_DEPLOYMENT_DEADLINE_MS + restOfDeployMs);
  });
});
