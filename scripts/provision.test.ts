import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test, vi } from 'vitest';

import {
  cloudDevEnvironment,
  exportProductionSnapshot,
  localApplicationEnvironment,
  parseConvexRunResult,
  parseEnvFile,
  parseProvisionArgs,
  selfHostedEnvironment,
} from './provision';

describe('provision pipeline', () => {
  test('reads the simple local environment file format', () => {
    expect(
      parseEnvFile(`
        # local settings
        CONVEX_BACKEND_PORT=3210
        PLAYWRIGHT_USER_A_EMAIL="user-a@example.com"
        PLAYWRIGHT_USER_PASSWORD='secret'
      `)
    ).toEqual({
      CONVEX_BACKEND_PORT: '3210',
      PLAYWRIGHT_USER_A_EMAIL: 'user-a@example.com',
      PLAYWRIGHT_USER_PASSWORD: 'secret',
    });
  });

  test('selects the stages that fit each target', () => {
    expect(parseProvisionArgs(['e2e'])).toEqual({
      target: 'e2e',
      stages: ['backend', 'configure', 'code', 'data'],
      stagesExplicit: false,
      snapshotFile: null,
    });
    expect(parseProvisionArgs(['e2e', '--stage', 'backend'])).toEqual({
      target: 'e2e',
      stages: ['backend'],
      stagesExplicit: true,
      snapshotFile: null,
    });
    expect(parseProvisionArgs(['dev', '--stage', 'code'])).toEqual({
      target: 'dev',
      stages: ['code'],
      stagesExplicit: true,
      snapshotFile: null,
    });
    expect(() => parseProvisionArgs(['prod'])).toThrow('Usage: provision');
    expect(() => parseProvisionArgs(['dev', '--stage', 'backend'])).toThrow('Invalid stage for target dev');
  });

  test('rebuilds dev data only from an anonymised snapshot file', () => {
    expect(parseProvisionArgs(['dev', '--stage', 'data', '--snapshot-file', '/runner/snapshot.zip'])).toEqual({
      target: 'dev',
      stages: ['data'],
      stagesExplicit: true,
      snapshotFile: '/runner/snapshot.zip',
    });
    expect(() => parseProvisionArgs(['dev'])).toThrow('never production: pass --snapshot-file');
    expect(() => parseProvisionArgs(['dev', '--stage', 'data'])).toThrow('never production: pass --snapshot-file');
    expect(() => parseProvisionArgs(['local', '--stage', 'data', '--snapshot-file', 'snapshot.zip'])).toThrow(
      '--snapshot-file belongs to the dev data stage alone'
    );
  });

  test('parses pretty-printed multi-line convex run results', () => {
    expect(parseConvexRunResult('{\n  "isDone": true,\n  "continueCursor": "c1"\n}\n', 'f')).toEqual({
      isDone: true,
      continueCursor: 'c1',
    });
    expect(() => parseConvexRunResult('', 'provisioning:x')).toThrow('produced no output');
    expect(() => parseConvexRunResult('not json', 'provisioning:x')).toThrow('unparseable output');
  });

  test('exports production only with the production deploy key, never with another key or a login', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const workDirectory = mkdtempSync(path.join(tmpdir(), 'provision-export-'));
    try {
      for (const env of [{}, { CONVEX_DEPLOY_KEY: 'prod-key' }, { CONVEX_DEPLOYMENT: 'prod:someone' }]) {
        expect(() => exportProductionSnapshot(env, workDirectory)).toThrow('needs CONVEX_PROD_DEPLOY_KEY');
      }
      expect(readdirSync(workDirectory)).toEqual([]);
    } finally {
      rmSync(workDirectory, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  test('self-hosted commands never receive production credentials', () => {
    const env = selfHostedEnvironment(
      {
        CONVEX_DEPLOY_KEY: 'prod-key',
        CONVEX_DEPLOYMENT_TOKEN: 'hosted-token',
        CONVEX_DEV_DEPLOY_KEY: 'shared-dev-key',
        CONVEX_PROD_DEPLOY_KEY: 'prod-key',
        CONVEX_DEPLOYMENT: 'dev:someone',
      },
      { kind: 'self-hosted', url: 'http://127.0.0.1:3210', adminKey: 'admin' }
    );
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_DEPLOYMENT_TOKEN).toBeUndefined();
    expect(env.CONVEX_DEV_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_PROD_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_DEPLOYMENT).toBe('');
    expect(env.CONVEX_SELF_HOSTED_URL).toBe('http://127.0.0.1:3210');
  });

  test('local application code receives no deployment credentials', () => {
    const env = localApplicationEnvironment({
      CONVEX_DEPLOYMENT: 'dev:shared',
      CONVEX_URL: 'https://shared.convex.cloud',
      CONVEX_CLOUD_URL: 'https://shared.convex.cloud',
      CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:12001',
      CONVEX_SELF_HOSTED_ADMIN_KEY: 'local-admin',
      CONVEX_DEPLOY_KEY: 'prod-key',
      CONVEX_DEPLOYMENT_TOKEN: 'hosted-token',
      CONVEX_DEV_DEPLOY_KEY: 'shared-dev-key',
      CONVEX_PROD_DEPLOY_KEY: 'prod-key',
      PLAYWRIGHT_USER_A_EMAIL: 'owner@example.com',
      PLAYWRIGHT_USER_B_EMAIL: 'collaborator@example.com',
      PLAYWRIGHT_USER_PASSWORD: 'local-password',
      VITE_CONVEX_URL: 'http://127.0.0.1:12001',
    });
    expect(env.CONVEX_DEPLOYMENT).toBeUndefined();
    expect(env.CONVEX_URL).toBeUndefined();
    expect(env.CONVEX_CLOUD_URL).toBeUndefined();
    expect(env.CONVEX_SELF_HOSTED_ADMIN_KEY).toBeUndefined();
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_DEPLOYMENT_TOKEN).toBeUndefined();
    expect(env.CONVEX_DEV_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_PROD_DEPLOY_KEY).toBeUndefined();
    expect(env.PLAYWRIGHT_USER_A_EMAIL).toBeUndefined();
    expect(env.PLAYWRIGHT_USER_B_EMAIL).toBeUndefined();
    expect(env.PLAYWRIGHT_USER_PASSWORD).toBeUndefined();
    expect(env.CONVEX_SELF_HOSTED_URL).toBe('http://127.0.0.1:12001');
    expect(env.VITE_CONVEX_URL).toBe('http://127.0.0.1:12001');
  });

  test('cloud dev commands pin to the dev deploy key without CONVEX_DEPLOYMENT', () => {
    const env = cloudDevEnvironment(
      {
        CONVEX_DEPLOYMENT: 'dev:someone',
        CONVEX_PROD_DEPLOY_KEY: 'prod-key',
        CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3210',
      },
      { kind: 'cloud-dev', deployKey: 'dev-scoped-key' }
    );
    expect(env.CONVEX_DEPLOY_KEY).toBe('dev-scoped-key');
    expect(env.CONVEX_DEPLOYMENT).toBeUndefined();
    expect(env.CONVEX_PROD_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_SELF_HOSTED_URL).toBeUndefined();
  });
});
