import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import { parseAppDevMode } from './app-dev';
import {
  assertPersistentDiskBudget,
  assertLoopbackUrl,
  createPersistentManifest,
  readPersistentManifest,
  resolvePersistentDirectory,
  writePrivateJson,
} from './local-dev-persistence';
import { localPublisherConfiguration } from './local-dev-publisher';

function withDirectory(action: (directory: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-persistent-'));
  try {
    action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function lockFixture(worktree: string, supervisor = `printf '%s\\n' "$LOCAL_DEV_OS_LOCK"`) {
  const scripts = path.join(worktree, 'scripts');
  mkdirSync(scripts, { recursive: true });
  const program = path.join(scripts, 'local-dev-lock.py');
  copyFileSync(path.join(import.meta.dirname, 'local-dev-lock.py'), program);
  writeFileSync(path.join(scripts, 'app-dev.sh'), supervisor);
  return program;
}

describe('persistent local review', () => {
  test('refuses an outside symlink into the worktree before creating or resetting any state', () => {
    withDirectory((directory) => {
      const worktree = path.join(directory, 'worktree');
      mkdirSync(worktree);
      const program = lockFixture(worktree);
      const outsideLink = path.join(directory, 'outside-link');
      symlinkSync(worktree, outsideLink, 'dir');
      const saved = path.join(worktree, '.dunezone-runtime');
      mkdirSync(saved);
      writeFileSync(path.join(saved, 'saved.json'), 'authored');
      const before = readdirSync(worktree, { recursive: true });
      for (const candidate of [outsideLink, path.join(outsideLink, 'new-review')]) {
        expect(() => resolvePersistentDirectory(candidate, worktree)).toThrow('outside the disposable worktree');
        const result = spawnSync(
          '/usr/bin/python3',
          [program, 'supervise', '--local', '--data=snapshot', '--persist-dir', candidate],
          { encoding: 'utf8' }
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('outside the disposable worktree');
      }
      expect(readdirSync(worktree, { recursive: true })).toEqual(before);
      expect(readFileSync(path.join(saved, 'saved.json'), 'utf8')).toBe('authored');
      expect(existsSync(path.join(worktree, '.dunezone-runtime.flock'))).toBe(false);
    });
  });
  test('resolves a legitimate external directory before initializing the locked runtime', () => {
    withDirectory((directory) => {
      const worktree = path.join(directory, 'worktree');
      const external = path.join(directory, 'external');
      mkdirSync(worktree);
      mkdirSync(external);
      const program = lockFixture(worktree);
      const outsideLink = path.join(directory, 'outside-link');
      symlinkSync(external, outsideLink, 'dir');
      const candidate = path.join(outsideLink, 'new-review');
      const canonical = path.join(realpathSync(external), 'new-review');
      expect(resolvePersistentDirectory(candidate, worktree)).toBe(canonical);
      expect(existsSync(canonical)).toBe(false);
      const result = spawnSync(
        '/usr/bin/python3',
        [program, 'supervise', '--local', '--data=snapshot', '--persist-dir', candidate],
        { encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(path.join(canonical, '.dunezone-runtime.flock'));
      expect(readdirSync(worktree)).toEqual(['scripts']);
    });
  });
  test('the lock CLI refuses generic commands and extra supervisor arguments before creating state', () => {
    withDirectory((directory) => {
      const runtime = path.join(directory, 'must-not-exist');
      const program = path.join(import.meta.dirname, 'local-dev-lock.py');
      for (const args of [
        [runtime, '/bin/sh', '-c', 'exit 0'],
        ['supervise', '--local', '--data=snapshot', '--persist-dir', runtime, '/bin/sh'],
        ['build', '--state-directory', runtime],
      ]) {
        const result = spawnSync('/usr/bin/python3', [program, ...args], { encoding: 'utf8' });
        expect(result.status).not.toBe(0);
        expect(existsSync(runtime)).toBe(false);
      }
    });
  });

  test('a directory with shell metacharacters remains a literal argument to the fixed supervisor', () => {
    withDirectory((directory) => {
      const worktree = path.join(directory, 'worktree');
      const program = lockFixture(worktree);
      const runtime = path.join(directory, 'review; touch injected');
      const result = spawnSync(
        '/usr/bin/python3',
        [program, 'supervise', '--local', '--data=snapshot', '--persist-dir', runtime],
        { encoding: 'utf8' }
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(path.join(realpathSync(runtime), '.dunezone-runtime.flock'));
      expect(existsSync(path.join(directory, 'injected'))).toBe(false);
    });
  });

  test('the build operation executes only the fixed Bun entry with its scoped state argument', () => {
    withDirectory((directory) => {
      const worktree = path.join(directory, 'worktree');
      const program = lockFixture(worktree);
      const runtime = path.join(directory, 'review', '.dunezone-runtime');
      mkdirSync(runtime, { recursive: true });
      writeFileSync(
        path.join(worktree, 'scripts/local-dev-publisher.ts'),
        `import { writeFileSync } from 'node:fs'; import path from 'node:path'; if (process.argv[2] !== '--build') throw new Error('unexpected operation'); writeFileSync(path.join(process.argv[3], 'built'), 'fixed-entry');`
      );
      const bun = execFileSync('/usr/bin/which', ['bun'], { encoding: 'utf8' }).trim();
      const result = spawnSync('/usr/bin/python3', [program, 'build', '--state-directory', runtime], {
        env: { ...process.env, LOCAL_DEV_BUN_EXECUTABLE: bun },
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(path.join(runtime, 'built'), 'utf8')).toBe('fixed-entry');
    });
  });

  test('requires an explicit snapshot and absolute state directory, preserving disposable defaults', () => {
    expect(parseAppDevMode(['--local', '--data=snapshot', '--persist-dir=/tmp/gf9'])).toEqual({
      kind: 'local',
      data: { kind: 'snapshot', file: null },
      persistDir: '/tmp/gf9',
      reset: false,
    });
    expect(parseAppDevMode(['--local', '--data=snapshot', '--persist-dir', '/tmp/gf9', '--reset'])).toMatchObject({
      persistDir: '/tmp/gf9',
      reset: true,
    });
    for (const args of [
      ['--local', '--persist-dir=/tmp/gf9'],
      ['--local', '--data=snapshot', '--persist-dir='],
      ['--local', '--data=snapshot', '--persist-dir=relative'],
      ['--local', '--reset'],
      ['--persist-dir=/tmp/gf9'],
    ]) {
      expect(() => parseAppDevMode(args)).toThrow();
    }
  });
  test('retains stable service identities, rejects moved or tampered manifests', () => {
    withDirectory((directory) => {
      const manifest = createPersistentManifest(directory, 'source-sha');
      writePrivateJson(path.join(directory, 'manifest.json'), manifest);
      expect(readPersistentManifest(directory)).toEqual(manifest);
      manifest.instance.backendUrl = 'https://production.convex.cloud';
      writePrivateJson(path.join(directory, 'manifest.json'), manifest);
      expect(() => readPersistentManifest(directory)).toThrow('explicit http://127.0.0.1');
      manifest.instance.backendUrl = `http://127.0.0.1:${manifest.instance.backendPort}`;
      manifest.stateDirectory = '/tmp/another-runtime';
      writePrivateJson(path.join(directory, 'manifest.json'), manifest);
      expect(() => readPersistentManifest(directory)).toThrow('moved');
    });
  });
  test('rejects port collisions and keeps separate environment resources distinct', () => {
    withDirectory((directory) => {
      const first = createPersistentManifest(directory, 'source');
      const second = createPersistentManifest('/tmp/second', 'source');
      expect(first.instance.composeProjectName).not.toBe(second.instance.composeProjectName);
      first.publisherPort = first.instance.appPort;
      writePrivateJson(path.join(directory, 'manifest.json'), first);
      expect(() => readPersistentManifest(directory)).toThrow('overlap');
    });
  });
  test('refuses a full runtime without removing saved authoring files', () => {
    withDirectory((directory) => {
      writeFileSync(path.join(directory, 'saved.json'), 'saved');
      expect(assertPersistentDiskBudget(directory, 10)).toBe(5);
      expect(() => assertPersistentDiskBudget(directory, 4)).toThrow('budget');
      expect(readFileSync(path.join(directory, 'saved.json'), 'utf8')).toBe('saved');
    });
  });
  test('generates only local bindings and URLs without hosted defaults or deployment routes', () => {
    const config = localPublisherConfiguration(createPersistentManifest('/tmp/local-review', 'source'), 'source');
    expect(config).not.toHaveProperty('routes');
    expect(config).not.toHaveProperty('services');
    expect(config.browser.remote).toBe(false);
    expect(config.images.remote).toBe(false);
    expect(config.assets.not_found_handling).toBe('none');
    expect(config.vars.CAPTURE_BASE_URL).toBe(config.vars.PUBLIC_BASE_URL);
    expect(config.assets.directory).toBe('/tmp/local-review/publisher-build/assets');
    expect(config.alias['application-ssr-runtime']).toBe('/tmp/local-review/publisher-build/server/server.js');
    for (const bucket of config.r2_buckets) {
      expect(bucket).toMatchObject({ remote: false });
    }
    for (const [name, value] of Object.entries(config.vars)) {
      if (name.endsWith('_URL')) {
        expect(() => assertLoopbackUrl(value)).not.toThrow();
      }
    }
    expect(JSON.stringify(config)).not.toMatch(/dune\.zone|convex\.(cloud|site)|tanstack-start-faction-sheet-assets/);
    for (const value of [
      'https://dune.zone',
      'http://localhost:3000',
      'http://127.0.0.1',
      'http://user:pass@127.0.0.1:3000',
      'http://127.0.0.1:3000/#secret',
    ]) {
      expect(() => assertLoopbackUrl(value)).toThrow();
    }
  });
});

test('the OS lock rejects a second launcher, then releases after a crash', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'local-lock-'));
  const ready = path.join(directory, 'ready');
  const fixture = path.join(directory, 'wait.py');
  writeFileSync(
    fixture,
    `from pathlib import Path\nimport time\nPath(${JSON.stringify(ready)}).touch()\ntime.sleep(30)\n`
  );
  const worktree = path.join(directory, 'worktree');
  const runtime = path.join(directory, 'runtime');
  const program = lockFixture(worktree, 'exec /usr/bin/python3 "$TEST_LOCK_FIXTURE"');
  const args = [program, 'supervise', '--local', '--data=snapshot', '--persist-dir', runtime];
  const first = spawn('/usr/bin/python3', args, {
    env: { ...process.env, TEST_LOCK_FIXTURE: fixture },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const firstExit = new Promise((resolve) => first.once('exit', resolve));
  try {
    await expect
      .poll(() => {
        try {
          readFileSync(ready);
          return true;
        } catch {
          return false;
        }
      })
      .toBe(true);
    const second = spawn('/usr/bin/python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let error = '';
    second.stderr.on('data', (value) => {
      error += value;
    });
    const code = await new Promise((resolve) => second.once('exit', resolve));
    expect(code).toBe(1);
    expect(error).toContain('locked');
    first.kill('SIGTERM');
    await firstExit;
    writeFileSync(path.join(worktree, 'scripts/app-dev.sh'), 'exit 0');
    const third = spawn('/usr/bin/python3', args);
    expect(await new Promise((resolve) => third.once('exit', resolve))).toBe(0);
    mkdirSync(path.join(directory, 'authored')); // Runtime lock files never claim the authoring directory.
  } finally {
    first.kill('SIGTERM');
    await firstExit;
    rmSync(directory, { recursive: true, force: true });
  }
}, 10_000);
