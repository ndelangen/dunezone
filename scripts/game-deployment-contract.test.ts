import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import {
  GAME_HEALTH_INTERVAL_MS,
  GAME_HEALTH_READS,
  readGameConfig,
  smokeGame,
  validateGameDeployContract,
  validateGameHealth,
} from './game-deployment-contract';
import { browserFlows } from './verify-hosted-flows';

const SHA = 'a'.repeat(40);
const RELEASED = { gitSha: SHA, versionId: 'b2caef52-f9dc-4be6-a427-8a93ff8b687c' };
const PREVIOUS = { gitSha: 'c'.repeat(40), versionId: '48813235-0000-4000-8000-000000000000' };

/** A /__play/health that answers each read with the next release in the list, repeating the last one. */
function bindingServing(releases: (typeof RELEASED)[]) {
  const slept: number[] = [];
  let reads = 0;
  const fetcher = async (url: string) => {
    const release = releases[Math.min(reads, releases.length - 1)]!;
    reads += 1;
    const response = Response.json(
      {
        ok: true,
        identity: { gitSha: release.gitSha, workerVersionTag: release.gitSha, workerVersionId: release.versionId },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
    Object.defineProperty(response, 'url', { value: url });
    return response;
  };
  const dependencies = {
    fetcher,
    sleep: async (ms: number) => {
      slept.push(ms);
    },
    log: () => {},
  };
  return { dependencies, slept, reads: () => reads };
}
const environment = {
  GITHUB_SHA: SHA,
  GITHUB_REF: 'refs/heads/main',
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'not-a-real-token',
};

/**
 * One job of the verify workflow, from its key to the next job's key.
 * The next key may hold any character a job id can: a letter, a digit, `_` or `-`, as in `tool_e2e`.
 */
function verifyJob(id: string): string {
  const workflow = readFileSync('.github/workflows/reusable-verify.yml', 'utf8');
  const start = workflow.indexOf(`\n  ${id}:\n`);
  expect(start, `reusable-verify.yml has no ${id} job`).toBeGreaterThan(0);
  const length = workflow.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return length === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + length);
}

describe('game deployment contract', () => {
  test('accepts the reviewed private Worker and refuses public ingress', () => {
    expect(() => validateGameDeployContract(readGameConfig(), environment)).not.toThrow();
    expect(() => validateGameDeployContract({ ...readGameConfig(), workers_dev: true }, environment)).toThrow(
      /ingress/
    );
  });

  test('deploys and verifies the private game service before exposing it through the publisher', () => {
    const workflow = readFileSync('.github/workflows/deploy-main.yml', 'utf8');
    const gameDeploy = workflow.indexOf('name: Deploy exact game Worker release');
    const privateAudit = workflow.indexOf('name: Require active game Worker before binding publisher');
    const callbackOrigin = workflow.indexOf(
      'node_modules/convex/bin/main.js env set PLAY_SERVICE_URL https://dune.zone --prod'
    );
    const publisherDeploy = workflow.indexOf('name: Deploy exact Worker release');
    const gameSmoke = workflow.indexOf('name: Smoke game Worker through the canonical publisher binding');
    expect(gameDeploy).toBeGreaterThan(0);
    expect(privateAudit).toBeGreaterThan(gameDeploy);
    expect(callbackOrigin).toBeGreaterThan(privateAudit);
    expect(publisherDeploy).toBeGreaterThan(callbackOrigin);
    expect(gameSmoke).toBeGreaterThan(publisherDeploy);
    expect(workflow).toContain('GAME_WORKER_VERSION_ID: ${{ steps.game_active.outputs.version_id }}');
  });

  test.each(['hosted_play', 'hosted_play_webgpu'])(
    '%s requires isolated real Auth and service-binding integration in PR CI without deployment secrets',
    (id) => {
      const job = verifyJob(id);
      expect(job).toContain('bun --no-env-file scripts/verify-hosted-play-stack.ts');
      expect(job).toContain('test-results/hosted-play/*.log');
      expect(job).not.toContain('secrets.');
      expect(job).not.toContain('.env');
      expect(job).not.toContain('admin-key');
    }
  );

  test('gives every shard a hosted browser flow names exactly one hosted_play job', () => {
    const job = verifyJob('hosted_play');
    const shards = [...job.matchAll(/^ +- shard: (\S+)$/gm)].map(([, shard]) => shard);
    const named = new Set(Object.values(browserFlows).map(({ shard }) => shard));
    expect(shards.sort()).toEqual([...named].sort());
  });

  test('draws the regular flow with WebGPU on a free macOS runner, within a timeout above its budget', () => {
    const job = verifyJob('hosted_play_webgpu');
    /* Standard runners cost nothing on a public repository, and a larger one such as macos-26-xlarge is billed there too. */
    expect(job).toMatch(/\n {4}runs-on: macos-\d+\n/);
    expect(job).toContain('--shard regular');
    expect(job).toContain('--expect-renderer webgpu');
    /* Setup, build and boot took about two minutes before the flow started. */
    const minutes = Number(/\n {4}timeout-minutes: (\d+)\n/.exec(job)?.[1]);
    expect(minutes * 60_000).toBeGreaterThan(browserFlows.regular.timeoutMs + 2 * 60_000);
  });

  test('health proves the exact bound deployment without cached or alternate-origin responses', () => {
    const expected = { gitSha: SHA, versionId: 'b2caef52-f9dc-4be6-a427-8a93ff8b687c' };
    const health = { ok: true, identity: { gitSha: SHA, workerVersionTag: SHA, workerVersionId: expected.versionId } };
    const url = 'https://dune.zone/__play/health';
    const response = { url, headers: new Headers({ 'Cache-Control': 'no-store' }) };
    expect(() => validateGameHealth(health, expected, response)).not.toThrow();
    expect(() => validateGameHealth(health, { ...expected, versionId: 'other-version' }, response)).toThrow(/version/);
    expect(() =>
      validateGameHealth(health, expected, { ...response, url: 'https://other.example/__play/health' })
    ).toThrow(/origin/);
    expect(() =>
      validateGameHealth(health, expected, {
        ...response,
        headers: new Headers({ 'Cache-Control': 'public, max-age=60' }),
      })
    ).toThrow(/cache/);
  });

  test('reads the health again while the publisher binding still reaches the previous release', async () => {
    const binding = bindingServing([PREVIOUS, PREVIOUS, RELEASED]);
    await expect(smokeGame(RELEASED, binding.dependencies)).resolves.toBeUndefined();
    expect(binding.reads()).toBe(3);
    expect(binding.slept).toEqual([GAME_HEALTH_INTERVAL_MS, GAME_HEALTH_INTERVAL_MS]);
  });

  test('fails on the last read when the bound release never answers', async () => {
    const binding = bindingServing([PREVIOUS]);
    await expect(smokeGame(RELEASED, binding.dependencies)).rejects.toThrow(
      `Game health did not report the bound release after ${GAME_HEALTH_READS} reads; last: Game health source SHA or tag differs`
    );
    expect(binding.reads()).toBe(GAME_HEALTH_READS);
  });
});
