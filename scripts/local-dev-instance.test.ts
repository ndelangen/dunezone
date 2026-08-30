import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  localDevelopmentEnvironmentOverrides,
  normalizeConvexDeploymentSelection,
  resolveGitCommonDirectory,
  resolveLocalDevelopmentEnvFile,
  resolveLocalDevelopmentInstance,
  resolveLocalDevelopmentProjectEnvFile,
} from './local-dev-instance';
import { commandEnvironment } from './provision';

const temporaryDirectoryRoot = path.resolve(
  import.meta.dirname,
  '..',
  'node_modules',
  '.cache',
  'local-instance-tests'
);

function createTemporaryDirectory(prefix: string) {
  mkdirSync(temporaryDirectoryRoot, { recursive: true, mode: 0o700 });
  chmodSync(temporaryDirectoryRoot, 0o700);
  return mkdtempSync(path.join(temporaryDirectoryRoot, prefix));
}

describe('local development instance', () => {
  test('reads Convex generated deployment selections without their annotation', () => {
    expect(normalizeConvexDeploymentSelection('dev:tame-raccoon-541 # team: example, project: dunezone')).toBe(
      'dev:tame-raccoon-541'
    );
  });

  test('gives each same-named worktree a stable isolated topology', () => {
    const firstPath = '/projects/worktrees/alpha/dunezone';
    const secondPath = '/projects/worktrees/bravo/dunezone';
    const inheritedEnvironment = { COMPOSE_PROJECT_NAME: 'dunezone' };
    const first = resolveLocalDevelopmentInstance(firstPath, inheritedEnvironment);
    const firstAgain = resolveLocalDevelopmentInstance(firstPath, inheritedEnvironment);
    const second = resolveLocalDevelopmentInstance(secondPath, inheritedEnvironment);

    expect(firstAgain).toEqual(first);
    expect(first.composeProjectName).toMatch(/^dunezone-local-[a-f0-9]{12}$/);
    expect(second.composeProjectName).toMatch(/^dunezone-local-[a-f0-9]{12}$/);
    expect(second.composeProjectName).not.toBe(first.composeProjectName);
    const firstPorts = [first.appPort, first.backendPort, first.sitePort, first.dashboardPort];
    const secondPorts = [second.appPort, second.backendPort, second.sitePort, second.dashboardPort];
    expect(new Set(firstPorts).size).toBe(4);
    expect(new Set(secondPorts).size).toBe(4);
    expect(secondPorts.filter((port) => firstPorts.includes(port))).toEqual([]);
    expect(first.appUrl).toBe(`http://127.0.0.1:${first.appPort}`);
    expect(first.backendUrl).toBe(`http://127.0.0.1:${first.backendPort}`);
    expect(first.siteUrl).toBe(`http://127.0.0.1:${first.sitePort}`);
  });

  test('replaces shared E2E topology while preserving credential values', () => {
    const instance = resolveLocalDevelopmentInstance('/projects/worktrees/alpha/dunezone', {});
    const effectiveEnvironment = commandEnvironment(
      {
        COMPOSE_PROJECT_NAME: 'dunezone',
        CONVEX_BACKEND_PORT: '3210',
        CONVEX_SITE_PORT: '3211',
        CONVEX_DASHBOARD_PORT: '6791',
        CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3210',
        CONVEX_SITE_URL: 'http://127.0.0.1:3211',
        PLAYWRIGHT_USER_A_EMAIL: 'reviewer@example.com',
      },
      localDevelopmentEnvironmentOverrides(instance)
    );

    expect(effectiveEnvironment.COMPOSE_PROJECT_NAME).toBe(instance.composeProjectName);
    expect(effectiveEnvironment.COMPOSE_PROFILES).toBe('worktree-local');
    expect(effectiveEnvironment.CONVEX_BACKEND_PORT).toBe(String(instance.backendPort));
    expect(effectiveEnvironment.CONVEX_SITE_PORT).toBe(String(instance.sitePort));
    expect(effectiveEnvironment.CONVEX_DASHBOARD_PORT).toBe(String(instance.dashboardPort));
    expect(effectiveEnvironment.CONVEX_SELF_HOSTED_URL).toBe(instance.backendUrl);
    expect(effectiveEnvironment.CONVEX_SITE_URL).toBe(instance.siteUrl);
    expect(effectiveEnvironment.NEXT_PUBLIC_DEPLOYMENT_URL).toBe(instance.backendUrl);
    expect(effectiveEnvironment.CONVEX_CLOUD_ORIGIN).toBe(instance.backendUrl);
    expect(effectiveEnvironment.CONVEX_SITE_ORIGIN).toBe(instance.siteUrl);
    expect(effectiveEnvironment.CONVEX_SELF_HOSTED_ADMIN_KEY).toBeUndefined();
    expect(effectiveEnvironment.PLAYWRIGHT_USER_A_EMAIL).toBe('reviewer@example.com');
  });

  test('accepts process-level port overrides and rejects ambiguous ports', () => {
    const instance = resolveLocalDevelopmentInstance('/projects/worktrees/alpha/dunezone', {
      PORT: '41000',
      CONVEX_BACKEND_PORT: '41001',
      CONVEX_SITE_PORT: '41002',
      CONVEX_DASHBOARD_PORT: '41003',
    });

    expect(instance.appPort).toBe(41_000);
    expect(instance.backendPort).toBe(41_001);
    expect(instance.sitePort).toBe(41_002);
    expect(instance.dashboardPort).toBe(41_003);
    expect(() =>
      resolveLocalDevelopmentInstance('/projects/worktrees/alpha/dunezone', {
        APP_DEV_PORT: '41000',
        CONVEX_BACKEND_PORT: '41000',
      })
    ).toThrow('CONVEX_BACKEND_PORT and APP_DEV_PORT both resolve to port 41000');
    expect(() =>
      resolveLocalDevelopmentInstance('/projects/worktrees/alpha/dunezone', {
        CONVEX_SITE_PORT: '3210',
      })
    ).toThrow('CONVEX_SITE_PORT cannot be 3210');
  });

  test('finds the main checkout credentials without copying them into a worktree', () => {
    const temporaryDirectory = createTemporaryDirectory('env-');
    const mainCheckout = path.join(temporaryDirectory, 'main');
    const worktree = path.join(temporaryDirectory, 'worktrees', 'task', 'dunezone');
    const commonGitDirectory = path.join(mainCheckout, '.git');
    const sharedEnvFile = path.join(mainCheckout, '.env.e2e.local');
    const sharedProjectEnvFile = path.join(mainCheckout, '.env.local');
    mkdirSync(commonGitDirectory, { recursive: true });
    mkdirSync(worktree, { recursive: true });
    writeFileSync(sharedEnvFile, 'PLAYWRIGHT_USER_A_EMAIL=reviewer@example.com\n');
    writeFileSync(sharedProjectEnvFile, 'CONVEX_DEPLOYMENT=dev:shared-project\n');

    try {
      expect(resolveLocalDevelopmentEnvFile(worktree, {}, commonGitDirectory)).toBe(sharedEnvFile);
      expect(resolveLocalDevelopmentProjectEnvFile(worktree, commonGitDirectory)).toBe(sharedProjectEnvFile);
      expect(resolveLocalDevelopmentEnvFile(worktree, { LOCAL_DEV_ENV_FILE: './custom.env' }, commonGitDirectory)).toBe(
        path.join(worktree, 'custom.env')
      );
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  test('resolves the shared Git directory without a PATH executable lookup', () => {
    const temporaryDirectory = createTemporaryDirectory('git-');
    const mainCheckout = path.join(temporaryDirectory, 'main');
    const commonGitDirectory = path.join(mainCheckout, '.git');
    const worktree = path.join(temporaryDirectory, 'worktree');
    const worktreeGitDirectory = path.join(commonGitDirectory, 'worktrees', 'task');
    mkdirSync(commonGitDirectory, { recursive: true });
    mkdirSync(worktree, { recursive: true });
    mkdirSync(worktreeGitDirectory, { recursive: true });
    writeFileSync(path.join(worktree, '.git'), `gitdir: ${worktreeGitDirectory}\n`);
    writeFileSync(path.join(worktreeGitDirectory, 'commondir'), '../..\n');

    try {
      expect(resolveGitCommonDirectory(mainCheckout)).toBe(commonGitDirectory);
      expect(resolveGitCommonDirectory(worktree)).toBe(commonGitDirectory);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
