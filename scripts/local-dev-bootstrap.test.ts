import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { provisionPersistentBackend } from './local-dev-bootstrap';
import type { PersistentBootstrap } from './local-dev-bootstrap';
import { createPersistentManifest } from './local-dev-persistence';

const state = vi.hoisted(() => ({ calls: [] as string[], failImport: false, failAuth: false, failVolume: false }));
vi.mock('./provision', () => ({
  assertLocalVolumeExists: () => {
    state.calls.push('volume');
    if (state.failVolume) {
      throw new Error('missing volume');
    }
  },
  backendUp: async (_env: unknown, options: { preserve: boolean; url: string }) => {
    if (!options.preserve) {
      throw new Error('bootstrap must preserve retained data');
    }
    state.calls.push('backend');
    return { url: options.url, adminKey: 'private-local-test-key' };
  },
  commandEnvironment: (base: NodeJS.ProcessEnv, overrides: NodeJS.ProcessEnv) => ({ ...base, ...overrides }),
  importSnapshotData: () => {
    state.calls.push('import');
    if (state.failImport) {
      throw new Error('import failed');
    }
  },
  configureLocalAuth: () => {
    state.calls.push('auth');
    if (state.failAuth) {
      throw new Error('auth failed');
    }
  },
  pushCode: () => state.calls.push('push'),
  finishSnapshotData: () => state.calls.push('seed'),
  runMigrationGuards: () => state.calls.push('migrations'),
}));
vi.mock('./local-snapshot', () => ({ discardDownloadedSnapshot: () => state.calls.push('discard') }));

const directories: string[] = [];
function fixture(status: PersistentBootstrap['manifest']['status'] = 'initializing'): PersistentBootstrap {
  const directory = mkdtempSync(path.join(tmpdir(), 'persistent-bootstrap-'));
  directories.push(directory);
  const manifest = createPersistentManifest(directory, 'test-source');
  manifest.status = status;
  return {
    manifest,
    secrets: {
      adminKey: 'private-local-test-key',
      executorSecret: 'x'.repeat(32),
      ownerEmail: 'local@example.invalid',
      collaboratorEmail: 'peer@example.invalid',
      password: 'test-password',
    },
    environment: {},
    fresh: status === 'initializing',
    snapshot: status === 'initializing' ? { file: '/verified-snapshot.zip', downloadDirectory: null } : null,
  };
}
function checkpoint(input: PersistentBootstrap) {
  return JSON.parse(readFileSync(path.join(input.manifest.stateDirectory, 'manifest.json'), 'utf8'));
}

beforeEach(() => {
  state.calls.length = 0;
  state.failImport = false;
  state.failAuth = false;
  state.failVolume = false;
});
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('persistent backend checkpoints', () => {
  test('imports the verified snapshot before pushing schema and records completed stages privately', async () => {
    const input = fixture();
    await provisionPersistentBackend(input);
    expect(state.calls).toEqual(['backend', 'import', 'discard', 'auth', 'push', 'seed', 'migrations']);
    expect(checkpoint(input).status).toBe('provisioned');
    expect(statSync(path.join(input.manifest.stateDirectory, 'secrets.json')).mode & 0o777).toBe(0o600);
  });

  test('ordinary ready resume preserves authored bytes without importing, configuring auth or seeding', async () => {
    const input = fixture('ready');
    const authored = path.join(input.manifest.stateDirectory, 'authored.json');
    writeFileSync(authored, 'saved authoring');
    const before = structuredClone(input.manifest);
    await provisionPersistentBackend(input);
    expect(state.calls).toEqual(['volume', 'backend', 'push', 'migrations']);
    expect(input.manifest).toEqual(before);
    expect(readFileSync(authored, 'utf8')).toBe('saved authoring');
  });

  test.each([
    ['imported', ['volume', 'backend', 'auth', 'push', 'seed', 'migrations']],
    ['configured', ['volume', 'backend', 'push', 'seed', 'migrations']],
    ['seeded', ['volume', 'backend', 'push', 'migrations']],
    ['provisioned', ['volume', 'backend', 'push', 'migrations']],
  ] as const)('resumes %s without replaying earlier stages', async (status, calls) => {
    await provisionPersistentBackend(fixture(status));
    expect(state.calls).toEqual(calls);
  });

  test('rejects a supplied snapshot on resume before starting or writing anything', async () => {
    const input = fixture('ready');
    input.snapshot = { file: '/unrequested.zip', downloadDirectory: null };
    await expect(provisionPersistentBackend(input)).rejects.toThrow('resume keeps authored data');
    expect(state.calls).toEqual([]);
    expect(existsSync(path.join(input.manifest.stateDirectory, 'secrets.json'))).toBe(false);
  });

  test('an interrupted initial import refuses resume before backend startup', async () => {
    const input = fixture();
    input.fresh = false;
    input.snapshot = null;
    await expect(provisionPersistentBackend(input)).rejects.toThrow('requires explicit reset');
    expect(state.calls).toEqual([]);
  });

  test('a missing retained volume refuses resume before backend startup', async () => {
    const input = fixture('ready');
    state.failVolume = true;
    await expect(provisionPersistentBackend(input)).rejects.toThrow('missing volume');
    expect(state.calls).toEqual(['volume']);
  });

  test('a failed import discards the download but never pushes code or advances the checkpoint', async () => {
    const input = fixture();
    state.failImport = true;
    await expect(provisionPersistentBackend(input)).rejects.toThrow('import failed');
    expect(state.calls).toEqual(['backend', 'import', 'discard']);
    expect(input.manifest.status).toBe('initializing');
  });

  test('an auth interruption resumes from imported, without reimporting the snapshot', async () => {
    const input = fixture();
    state.failAuth = true;
    await expect(provisionPersistentBackend(input)).rejects.toThrow('auth failed');
    expect(checkpoint(input).status).toBe('imported');
    state.calls.length = 0;
    state.failAuth = false;
    input.fresh = false;
    input.snapshot = null;
    await provisionPersistentBackend(input);
    expect(state.calls).toEqual(['volume', 'backend', 'auth', 'push', 'seed', 'migrations']);
  });
});
