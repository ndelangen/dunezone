import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    'backend-binary': { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
  },
});
const runtime = mkdtempSync(path.join(tmpdir(), 'dunezone-hosted-proof-'));
const evidence = path.join(root, 'test-results/hosted-play');
mkdirSync(evidence, { recursive: true });
const environment: NodeJS.ProcessEnv = Object.fromEntries(
  ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SSL_CERT_FILE', 'CI'].flatMap((name) =>
    process.env[name] ? [[name, process.env[name]]] : []
  )
);
environment.CONVEX_DISABLE_TELEMETRY = '1';
const children: ChildProcess[] = [];
const childExits = new Map<ChildProcess, Promise<void>>();
const descriptors: number[] = [];

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('No loopback port was allocated.');
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

function run(command: string, args: string[], label: string, env = environment): string {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed (${result.status ?? 'process error'}).`);
  }
  return result.stdout;
}

function start(command: string, args: string[], logPath: string, env = environment): ChildProcess {
  const descriptor = openSync(logPath, 'w', 0o600);
  descriptors.push(descriptor);
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', descriptor, descriptor] });
  children.push(child);
  childExits.set(
    child,
    new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    })
  );
  return child;
}

async function ready(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null || !child.pid) {
      throw new Error(`Local service exited before ${url} was ready.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) {
        return;
      }
    } catch {
      /* Startup is observed by the next bounded readiness probe. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local service did not become ready at ${url}.`);
}

function backendBinary(): string {
  if (values['backend-binary']) {
    if (!path.isAbsolute(values['backend-binary'])) {
      throw new Error('--backend-binary must be an absolute local path.');
    }
    return values['backend-binary'];
  }
  const artifacts: Record<string, { filename: string; digest: string }> = {
    'linux-x64': {
      filename: 'convex-local-backend-x86_64-unknown-linux-gnu.zip',
      digest: '25a5c7c6969b36b382a2651a8e44a30452879b5c8194e89f6e972b5857919d46',
    },
    'darwin-arm64': {
      filename: 'convex-local-backend-aarch64-apple-darwin.zip',
      digest: '95159c96cf9348fc49d94a1fd5bdffb49fe27a5e0442f8787939b4d871ec0b5e',
    },
  };
  const artifact = artifacts[`${process.platform}-${process.arch}`];
  if (!artifact) {
    throw new Error('This platform needs an explicit --backend-binary.');
  }
  const archive = path.join(runtime, 'backend.zip');
  const url = `https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-08-10-c0cb7ae/${artifact.filename}`;
  run(
    'curl',
    [
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      '--max-time',
      '90',
      '--retry',
      '2',
      '--retry-max-time',
      '110',
      '--output',
      archive,
      url,
    ],
    'Pinned backend download'
  );
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== artifact.digest) {
    throw new Error('Pinned backend archive checksum differs.');
  }
  run('unzip', ['-q', archive, '-d', runtime], 'Pinned backend extraction');
  const binary = path.join(runtime, 'convex-local-backend');
  chmodSync(binary, 0o700);
  return binary;
}

function configureAuth(convex: (args: string[]) => void, origin: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePath = path.join(runtime, 'jwt-private-key.pem');
  const jwksPath = path.join(runtime, 'jwks.json');
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(jwksPath, JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), use: 'sig' }] }), {
    mode: 0o600,
  });
  for (const [name, value] of [
    ['SITE_URL', origin],
    ['PLAY_SERVICE_URL', origin],
    ['IS_TEST', 'true'],
    ['E2E_LOCAL_AUTH', 'true'],
  ]) {
    convex(['env', 'set', name!, value!]);
  }
  convex(['env', 'set', 'JWT_PRIVATE_KEY', '--from-file', privatePath]);
  convex(['env', 'set', 'JWKS', '--from-file', jwksPath]);
}

const interrupt = () => {
  for (const child of children) {
    child.kill('SIGTERM');
  }
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  const binary = backendBinary();
  const ports = new Set<number>();
  while (ports.size < 3) {
    ports.add(await freePort());
  }
  const [backendPort, sitePort, appPort] = [...ports];
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const siteUrl = `http://127.0.0.1:${sitePort}`;
  const origin = `http://127.0.0.1:${appPort}`;
  const instanceName = 'dunezone-hosted-proof';
  const instanceSecret = randomBytes(32).toString('hex');
  const adminKey = run(
    binary,
    ['keygen', 'admin-key', '--instance-name', instanceName, '--instance-secret', instanceSecret],
    'Local admin key generation'
  ).trim();
  const envFile = path.join(runtime, '.env.local');
  writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=${backendUrl}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`, {
    mode: 0o600,
  });
  const backend = start(
    binary,
    [
      '--interface',
      '127.0.0.1',
      '--port',
      String(backendPort),
      '--site-proxy-port',
      String(sitePort),
      '--convex-origin',
      backendUrl,
      '--convex-site',
      siteUrl,
      '--instance-name',
      instanceName,
      '--instance-secret',
      instanceSecret,
      '--local-storage',
      path.join(runtime, 'storage'),
      '--disable-beacon',
      path.join(runtime, 'backend.sqlite3'),
    ],
    path.join(runtime, 'backend.log')
  );
  await ready(`${backendUrl}/version`, backend, 30_000);
  const localEnv = { ...environment, CONVEX_SELF_HOSTED_URL: backendUrl, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey };
  const convex = (args: string[]) => {
    run(
      'node',
      [path.join(root, 'node_modules/convex/bin/main.js'), ...args, '--url', backendUrl, '--admin-key', adminKey],
      'Local Convex configuration/deploy',
      localEnv
    );
  };
  configureAuth(convex, origin);
  convex(['deploy', '--yes']);
  console.log(`Synthetic Auth backend ready at ${backendUrl}; same-origin publisher ${origin}.`);
  const worker = start(
    'bun',
    [
      '--no-env-file',
      path.join(root, 'scripts/play-local.ts'),
      '--convex-url',
      backendUrl,
      '--convex-site-url',
      siteUrl,
      '--port',
      String(appPort),
      ...(values['skip-build'] ? ['--skip-build'] : []),
    ],
    path.join(evidence, 'worker.log')
  );
  await ready(`${origin}/__play/health`, worker, 300_000);
  const verification = start(
    'node',
    [path.join(root, 'scripts/verify-hosted-play.mjs'), '--env-file', envFile, '--origin', origin],
    path.join(evidence, 'verification.log')
  );
  const timeout = setTimeout(() => verification.kill('SIGTERM'), 180_000);
  await childExits.get(verification);
  clearTimeout(timeout);
  const report = readFileSync(path.join(evidence, 'verification.log'), 'utf8');
  console.log(report);
  if (verification.exitCode !== 0) {
    throw new Error('Hosted integration failed; see test-results/hosted-play/verification.log.');
  }
} finally {
  for (const child of [...children].reverse()) {
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    await childExits.get(child);
    clearTimeout(timeout);
  }
  for (const descriptor of descriptors) {
    closeSync(descriptor);
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
  rmSync(runtime, { recursive: true, force: true });
}
