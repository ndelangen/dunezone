import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  createLocalDevelopmentInstance,
  localDevelopmentEnvironmentOverrides,
  normalizeConvexDeploymentSelection,
  resolveGitCommonDirectory,
  resolveLocalDevelopmentEnvFile,
  resolveLocalDevelopmentProjectEnvFile,
} from './local-dev-instance';
import { commandEnvironment } from './provision';

describe('local development instance', () => {
  test('reads the project selection without the generated annotation', () => {
    expect(normalizeConvexDeploymentSelection('dev:tame-raccoon-541 # team: example')).toBe('dev:tame-raccoon-541');
    expect(normalizeConvexDeploymentSelection('  ')).toBeUndefined();
  });

  test('gives each launch its own project and loopback topology', () => {
    const environment = { COMPOSE_PROJECT_NAME: 'dunezone' };
    const first = createLocalDevelopmentInstance(environment);
    const second = createLocalDevelopmentInstance(environment);
    expect(first.composeProjectName).toMatch(/^dunezone-local-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
    expect(second.composeProjectName).not.toBe(first.composeProjectName);
    expect(first.appPort).toBeGreaterThanOrEqual(12_000);
    expect(first.dashboardPort).toBeLessThan(40_000);
    expect(new Set([first.appPort, first.backendPort, first.sitePort, first.dashboardPort]).size).toBe(4);
    expect(first.appUrl).toBe(`http://127.0.0.1:${first.appPort}`);
    expect(first.backendUrl).toBe(`http://127.0.0.1:${first.backendPort}`);
    expect(first.siteUrl).toBe(`http://127.0.0.1:${first.sitePort}`);
    expect(first.dashboardUrl).toBe(`http://127.0.0.1:${first.dashboardPort}`);
  });

  test('replaces inherited E2E topology and admin keys while keeping credentials', () => {
    const instance = createLocalDevelopmentInstance({});
    const effective = commandEnvironment(
      {
        COMPOSE_PROJECT_NAME: 'dunezone',
        CONVEX_SELF_HOSTED_ADMIN_KEY: 'old-key',
        PLAYWRIGHT_USER_A_EMAIL: 'a@example.com',
      },
      localDevelopmentEnvironmentOverrides(instance)
    );
    expect(effective.COMPOSE_PROJECT_NAME).toBe(instance.composeProjectName);
    expect(effective.COMPOSE_PROFILES).toBe('worktree-local');
    expect([effective.APP_DEV_PORT, effective.PORT]).toEqual([String(instance.appPort), String(instance.appPort)]);
    expect(effective.CONVEX_BACKEND_PORT).toBe(String(instance.backendPort));
    expect(effective.CONVEX_SITE_PORT).toBe(String(instance.sitePort));
    expect(effective.CONVEX_DASHBOARD_PORT).toBe(String(instance.dashboardPort));
    for (const key of [
      'CONVEX_SELF_HOSTED_URL',
      'CONVEX_CLOUD_ORIGIN',
      'NEXT_PUBLIC_DEPLOYMENT_URL',
      'VITE_CONVEX_URL',
    ]) {
      expect(effective[key]).toBe(instance.backendUrl);
    }
    expect(effective.CONVEX_SITE_ORIGIN).toBe(instance.siteUrl);
    expect(effective.CONVEX_SITE_URL).toBe(instance.siteUrl);
    expect(effective.SITE_URL).toBe(instance.appUrl);
    expect(effective.CONVEX_SELF_HOSTED_ADMIN_KEY).toBeUndefined();
    expect(effective.PLAYWRIGHT_USER_A_EMAIL).toBe('a@example.com');
  });

  test('accepts process port overrides with APP_DEV_PORT taking precedence over PORT', () => {
    const instance = createLocalDevelopmentInstance({
      APP_DEV_PORT: '41000',
      PORT: '42000',
      CONVEX_BACKEND_PORT: '41001',
      CONVEX_SITE_PORT: '41002',
      CONVEX_DASHBOARD_PORT: '41003',
    });
    expect([instance.appPort, instance.backendPort, instance.sitePort, instance.dashboardPort]).toEqual([
      41_000, 41_001, 41_002, 41_003,
    ]);
    expect(createLocalDevelopmentInstance({ PORT: '42000' }).appPort).toBe(42_000);
  });

  test.each(['0', '65536', '1.5', '12abc'])('rejects invalid port %s', (port) => {
    expect(() => createLocalDevelopmentInstance({ APP_DEV_PORT: port })).toThrow('integer from 1 through 65535');
  });

  test('rejects duplicate ports and the backend-internal proxy port', () => {
    expect(() => createLocalDevelopmentInstance({ APP_DEV_PORT: '41000', CONVEX_BACKEND_PORT: '41000' })).toThrow(
      'both resolve to port 41000'
    );
    expect(() => createLocalDevelopmentInstance({ CONVEX_SITE_PORT: '3210' })).toThrow(
      'CONVEX_SITE_PORT cannot be 3210'
    );
  });

  test('finds main-checkout credentials, prefers worktree files, and accepts an explicit file', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-local-instance-'));
    const main = path.join(directory, 'main');
    const worktree = path.join(directory, 'worktree');
    const commonGitDirectory = path.join(main, '.git');
    const worktreeGitDirectory = path.join(commonGitDirectory, 'worktrees', 'task');
    mkdirSync(worktreeGitDirectory, { recursive: true });
    mkdirSync(worktree);
    writeFileSync(path.join(worktree, '.git'), `gitdir: ${worktreeGitDirectory}\n`);
    writeFileSync(path.join(worktreeGitDirectory, 'commondir'), '../..\n');
    try {
      expect(resolveGitCommonDirectory(main)).toBe(commonGitDirectory);
      expect(resolveGitCommonDirectory(worktree)).toBe(commonGitDirectory);
      for (const name of ['.env.e2e.local', '.env.local']) {
        writeFileSync(path.join(main, name), '');
      }
      expect(resolveLocalDevelopmentEnvFile(worktree, {}, commonGitDirectory)).toBe(path.join(main, '.env.e2e.local'));
      expect(resolveLocalDevelopmentProjectEnvFile(worktree, commonGitDirectory)).toBe(path.join(main, '.env.local'));
      for (const name of ['.env.e2e.local', '.env.local']) {
        writeFileSync(path.join(worktree, name), '');
      }
      expect(resolveLocalDevelopmentEnvFile(worktree, {}, commonGitDirectory)).toBe(
        path.join(worktree, '.env.e2e.local')
      );
      expect(resolveLocalDevelopmentProjectEnvFile(worktree, commonGitDirectory)).toBe(
        path.join(worktree, '.env.local')
      );
      expect(resolveLocalDevelopmentEnvFile(worktree, { LOCAL_DEV_ENV_FILE: './custom.env' }, commonGitDirectory)).toBe(
        path.join(worktree, 'custom.env')
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
