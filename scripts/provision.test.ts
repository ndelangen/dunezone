import type * as ChildProcess from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test, vi } from 'vitest';

import type { CloudDevDeployment, SelfHostedDeployment } from './provision';
import {
  cloudDevEnvironment,
  exportProductionSnapshot,
  loadSnapshotData,
  localApplicationEnvironment,
  parseConvexRunResult,
  parseEnvFile,
  parseProvisionArgs,
  rebuildFromSnapshot,
  selfHostedEnvironment,
} from './provision';
import { writtenSnapshot } from './snapshot-anonymise.test.fixture';

/*
 * Every command the pipeline starts, in order.
 * The zip tools run for real, because they write and read the tests' own files.
 * Every other command is recorded and answered with success, so no test here reaches a deployment.
 * The draft seed's batches answer as one finished batch, because the load reads their results.
 */
const started = vi.hoisted((): string[][] => []);
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  const spawnSync = (command: string, args: readonly string[], options?: ChildProcess.SpawnSyncOptions) => {
    started.push([command, ...args]);
    const stdout = args.includes('provisioning:seedSnapshotRulebookDraftsBatch')
      ? JSON.stringify({ isDone: true, continueCursor: '', seeded: 1 })
      : '';
    return command.startsWith('/usr/bin/')
      ? actual.spawnSync(command, args, options)
      : { pid: 0, output: [], stdout, stderr: '', status: 0, signal: null };
  };
  return { ...actual, spawnSync };
});

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

describe('snapshot loads', () => {
  const cloudDev: CloudDevDeployment = { kind: 'cloud-dev', deployKey: 'not-a-key' };
  const local: SelfHostedDeployment = { kind: 'self-hosted', url: 'http://127.0.0.1:9', adminKey: 'not-a-key' };
  const isConvex = ([command]: string[]) => command === process.execPath;
  /** The recorded commands up to the first that could touch the target: only the zip tool reading the file may come before it. */
  const beforeTarget = () => started.slice(0, Math.max(started.findIndex(isConvex), 0));

  test('check the file before clearing or importing, so a refused snapshot leaves cloud dev and local Convex as they were', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const directory = mkdtempSync(path.join(tmpdir(), 'provision-snapshot-'));
    try {
      const refused = writtenSnapshot(path.join(directory, 'refused.zip'), 0);
      const loadable = writtenSnapshot(path.join(directory, 'loadable.zip'), 1);
      const refusal = 'tables that must hold rows, which the file leaves empty';

      for (const load of [
        () => rebuildFromSnapshot(cloudDev, {}, refused, directory),
        () => loadSnapshotData(local, {}, refused),
      ]) {
        started.length = 0;
        expect(load).toThrow(refusal);
        expect(started.length).toBeGreaterThan(0);
        expect(started.filter(isConvex)).toEqual([]);
      }

      const loads: Array<[() => void, string[]]> = [
        [() => rebuildFromSnapshot(cloudDev, {}, loadable, directory), ['import', '--replace', '--table']],
        [() => loadSnapshotData(local, {}, loadable), ['import', '--replace-all', loadable]],
      ];
      for (const [load, firstTargetCommand] of loads) {
        started.length = 0;
        load();
        expect(beforeTarget().length).toBeGreaterThan(0);
        expect(beforeTarget().every(([command]) => command === '/usr/bin/unzip')).toBe(true);
        expect(started.find(isConvex)).toEqual(expect.arrayContaining(firstTargetCommand));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });

  test('seed the Rulebook drafts after the import, so the rebuild contract and the migration guards find them', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const directory = mkdtempSync(path.join(tmpdir(), 'provision-snapshot-'));
    /* What each target command does: the snapshot import, a function it runs, or the migration guard script. */
    const step = (command: string[]) =>
      command.includes('--replace-all') ? 'import' : command[command.indexOf('run') + 1];
    try {
      const loadable = writtenSnapshot(path.join(directory, 'loadable.zip'), 1);
      const loads: Array<[() => void, string[]]> = [
        [() => rebuildFromSnapshot(cloudDev, {}, loadable, directory), ['./scripts/migration-guards.ts']],
        [() => loadSnapshotData(local, {}, loadable), []],
      ];
      for (const [load, after] of loads) {
        started.length = 0;
        load();
        const steps = started.filter(isConvex).map(step);
        expect(steps.slice(steps.indexOf('import'))).toEqual([
          'import',
          'provisioning:seedSnapshotRulebookDraftsBatch',
          'provisioningChecks:assertRebuildContract',
          ...after,
        ]);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  });
});
