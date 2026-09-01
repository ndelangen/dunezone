import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { expect, test } from 'vitest';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const realBun = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim();
const worker = fileURLToPath(new URL('./local-dev-supervision-fixtures/targeting-worker.ts', import.meta.url));

function stopProcessGroup(pid: number) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

test.each(['configure', 'migrations', 'conflicting-targets'] as const)(
  '%s does not select hosted credentials from an env file',
  async (mode) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'local-convex-targeting-'));
    const requests: Array<{ url: string | undefined; authorization: string | undefined }> = [];
    const server = createServer((request, response) => {
      requests.push({ url: request.url, authorization: request.headers.authorization });
      request.resume();
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'success', value: null }));
    });
    let child: ReturnType<typeof spawn> | undefined;
    let exited: Promise<number | null> | undefined;
    try {
      mkdirSync(path.join(directory, 'scripts'));
      for (const name of ['provision.ts', 'migration-guards.ts']) {
        copyFileSync(path.join(import.meta.dirname, name), path.join(directory, 'scripts', name));
      }
      for (const name of ['convex', 'node_modules']) {
        symlinkSync(path.join(rootDirectory, name), path.join(directory, name), 'dir');
      }
      copyFileSync(path.join(rootDirectory, 'package.json'), path.join(directory, 'package.json'));
      writeFileSync(
        path.join(directory, '.env.local'),
        [
          'CONVEX_DEPLOY_KEY=<missing_deploy_key:HOSTED_KEY_SELECTED>',
          'CONVEX_DEPLOYMENT_TOKEN=<missing_deploy_key:HOSTED_TOKEN_SELECTED>',
          'CONVEX_DEPLOYMENT=dev:hosted-fixture',
        ].join('\n')
      );
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('The local Convex stub did not bind a port');
      }
      const url = `http://127.0.0.1:${address.port}`;
      const args =
        mode === 'configure'
          ? [worker, pathToFileURL(path.join(directory, 'scripts/provision.ts')).href, directory]
          : [
              path.join(directory, 'scripts/migration-guards.ts'),
              mode === 'conflicting-targets' ? 'deploy' : 'dev-strict',
              '1000',
              '10',
              ...(mode === 'conflicting-targets' ? ['--prod'] : []),
            ];
      child = spawn(realBun, ['--no-env-file', ...args], {
        cwd: directory,
        detached: true,
        env: {
          PATH: process.env.PATH,
          CI: 'true',
          CONVEX_DEPLOYMENT: '',
          CONVEX_SELF_HOSTED_URL: url,
          CONVEX_SELF_HOSTED_ADMIN_KEY: 'fixture-local-admin',
          CONVEX_OVERRIDE_ACCESS_TOKEN: 'fixture-access-token',
          CONVEX_PROVISION_HOST: url,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        killSignal: 'SIGKILL',
      });
      let output = '';
      child.stdout?.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        output += chunk;
      });
      exited = new Promise((resolve, reject) => {
        child!.once('error', reject);
        child!.once('exit', resolve);
      });
      const exitCode = await exited;
      if (mode === 'conflicting-targets') {
        expect(exitCode, output).not.toBe(0);
        expect(output).toContain('Production migration guards cannot use self-hosted credentials');
        expect(requests).toHaveLength(0);
        return;
      }
      expect(exitCode, output).toBe(0);
      expect(requests.length).toBeGreaterThanOrEqual(mode === 'configure' ? 7 : 3);
      for (const request of requests) {
        expect(request.url).toBe(mode === 'configure' ? '/api/update_environment_variables' : '/api/function');
        expect(request.authorization).toBe('Convex fixture-local-admin');
      }
    } finally {
      if (child?.pid) {
        stopProcessGroup(child.pid);
      }
      await exited;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  },
  20_000
);
