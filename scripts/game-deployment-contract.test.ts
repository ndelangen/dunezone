import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { readGameConfig, validateGameDeployContract, validateGameHealth } from './game-deployment-contract';

const SHA = 'a'.repeat(40);
const environment = {
  GITHUB_SHA: SHA,
  GITHUB_REF: 'refs/heads/main',
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32),
  CLOUDFLARE_API_TOKEN: 'not-a-real-token',
};

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

  test('requires isolated real Auth and service-binding integration in PR CI without deployment secrets', () => {
    const workflow = readFileSync('.github/workflows/reusable-verify.yml', 'utf8');
    const job = workflow.slice(workflow.indexOf('\n  hosted_play:'), workflow.indexOf('\n  tool_e2e:'));
    expect(job).toContain('bun --no-env-file scripts/verify-hosted-play-stack.ts');
    expect(job).toContain('test-results/hosted-play/verification.log');
    expect(job).not.toContain('secrets.');
    expect(job).not.toContain('.env');
    expect(job).not.toContain('admin-key');
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
});
