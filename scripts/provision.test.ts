import { describe, expect, test } from 'vitest';

import {
  cloudDevEnvironment,
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
    });
    expect(parseProvisionArgs(['e2e', '--stage', 'backend'])).toEqual({
      target: 'e2e',
      stages: ['backend'],
      stagesExplicit: true,
    });
    expect(parseProvisionArgs(['dev'])).toEqual({
      target: 'dev',
      stages: ['code', 'data'],
      stagesExplicit: false,
    });
    expect(() => parseProvisionArgs(['prod'])).toThrow('Usage: provision');
    expect(() => parseProvisionArgs(['dev', '--stage', 'backend'])).toThrow(
      'Invalid stage for target dev'
    );
  });

  test('parses pretty-printed multi-line convex run results', () => {
    expect(
      parseConvexRunResult('{\n  "isDone": true,\n  "continueCursor": "c1"\n}\n', 'f')
    ).toEqual({ isDone: true, continueCursor: 'c1' });
    expect(() => parseConvexRunResult('', 'provisioning:x')).toThrow('produced no output');
    expect(() => parseConvexRunResult('not json', 'provisioning:x')).toThrow('unparseable output');
  });

  test('self-hosted commands never receive production credentials', () => {
    const env = selfHostedEnvironment(
      {
        CONVEX_DEPLOY_KEY: 'prod-key',
        CONVEX_PROD_DEPLOY_KEY: 'prod-key',
        CONVEX_DEPLOYMENT: 'dev:someone',
      },
      { kind: 'self-hosted', url: 'http://127.0.0.1:3210', adminKey: 'admin' }
    );
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_PROD_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_DEPLOYMENT).toBe('');
    expect(env.CONVEX_SELF_HOSTED_URL).toBe('http://127.0.0.1:3210');
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
