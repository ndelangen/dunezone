import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { nodeExecutable } from './node-executable';

const root = path.resolve(import.meta.dirname, '..');
const node = nodeExecutable();
const { values } = parseArgs({
  options: {
    'backend-binary': { type: 'string' },
    'load-profile': { type: 'string' },
    'load-cpu': { type: 'boolean', default: false },
    'load-compression': { type: 'string', default: 'on' },
    'load-case': { type: 'string', default: 'probe' },
    'load-max-bytes': { type: 'string' },
    'load-seed': { type: 'string' },
    'load-repetition': { type: 'string' },
    'browser-only': { type: 'boolean', default: false },
    browser: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
  },
});
if (
  values['load-profile'] &&
  (!['baseline', 'stacked', 'separated'].includes(values['load-profile']) || values['browser-only'])
) {
  throw new Error('Choose one load profile and run browser verification separately.');
}
if (values['browser-only'] && values['skip-build']) {
  throw new Error("--browser-only requires a fresh frontend build for this run's backend URL.");
}
if (values['load-profile'] && values['load-case'] === 'browser' && values['skip-build']) {
  throw new Error('Browser load probes need a fresh build for their disposable backend.');
}
if (values.browser && !values['browser-only']) {
  throw new Error('--browser requires --browser-only.');
}
const loadCase = ['probe', 'peak', 'reconnect', 'trace', 'multitab', 'steady', 'slow', 'browser'].find(
  (candidate) => candidate === values['load-case']
);
if (!loadCase) {
  throw new Error('Choose a supported load case.');
}
const loadProfile = ['baseline', 'stacked', 'separated'].find((candidate) => candidate === values['load-profile']);
if (values['load-cpu'] && !loadProfile) {
  throw new Error('--load-cpu requires an isolated load profile.');
}
const runtime = mkdtempSync(path.join(tmpdir(), 'dunezone-hosted-proof-'));
const evidence = path.join(
  root,
  values['load-profile']
    ? `test-results/play-load/${loadProfile}-${loadCase}-${Date.now()}`
    : 'test-results/hosted-play'
);
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

type Invocation = { command: string; args: string[]; env?: NodeJS.ProcessEnv };

function run(invocation: Invocation & { label: string }): string {
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    env: invocation.env ?? environment,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${invocation.label} failed (${result.status ?? 'process error'}).`);
  }
  return result.stdout;
}

function start(invocation: Invocation & { logPath: string }): ChildProcess {
  const descriptor = openSync(invocation.logPath, 'w', 0o600);
  descriptors.push(descriptor);
  const child = spawn(invocation.command, invocation.args, {
    cwd: root,
    env: invocation.env ?? environment,
    stdio: ['ignore', descriptor, descriptor],
  });
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
    if (childExited(child)) {
      throw new Error(`Local service exited before ${url} was ready.`);
    }
    if (await serviceResponds(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local service did not become ready at ${url}.`);
}

function childExited(child: ChildProcess): boolean {
  return !child.pid || child.exitCode !== null || child.signalCode !== null;
}

async function serviceResponds(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
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
  run({
    command: '/usr/bin/curl',
    args: [
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
    label: 'Pinned backend download',
  });
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== artifact.digest) {
    throw new Error('Pinned backend archive checksum differs.');
  }
  run({ command: '/usr/bin/unzip', args: ['-q', archive, '-d', runtime], label: 'Pinned backend extraction' });
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

async function provisionBrowserFixture(convex: (args: string[]) => string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const fixture = JSON.parse(convex(['run', 'playProvisioning:beginFixtureProvision', '{}']));
    if (fixture.state === 'ready') {
      console.log('Canonical browser fixture provisioned through the local Workers.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The local browser fixture did not finish provisioning within one minute.');
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
  const adminKey = run({
    command: binary,
    args: ['keygen', 'admin-key', '--instance-name', instanceName, '--instance-secret', instanceSecret],
    label: 'Local admin key generation',
  }).trim();
  const envFile = path.join(runtime, '.env.local');
  writeFileSync(envFile, `CONVEX_SELF_HOSTED_URL=${backendUrl}\nCONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}\n`, {
    mode: 0o600,
  });
  const backend = start({
    command: binary,
    args: [
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
    logPath: path.join(runtime, 'backend.log'),
  });
  await ready(`${backendUrl}/version`, backend, 30_000);
  const localEnv = { ...environment, CONVEX_SELF_HOSTED_URL: backendUrl, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey };
  const convex = (args: string[]) => {
    return run({
      command: node,
      args: [path.join(root, 'node_modules/convex/bin/main.js'), ...args, '--url', backendUrl, '--admin-key', adminKey],
      label: 'Local Convex configuration/deploy',
      env: localEnv,
    });
  };
  configureAuth(convex, origin);
  convex(['deploy', '--yes']);
  console.log(`Synthetic Auth backend ready at ${backendUrl}; same-origin publisher ${origin}.`);
  const worker = start({
    command: process.execPath,
    args: [
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
    logPath: path.join(evidence, 'worker.log'),
  });
  await ready(`${origin}/__play/health`, worker, 300_000);
  const browserOnly = values['browser-only'];
  if (browserOnly) {
    await provisionBrowserFixture(convex);
  }
  const verificationLog = path.join(evidence, browserOnly ? 'browser.log' : 'verification.log');
  const reportDirectory = path.join(evidence, 'browser');
  let verificationScript = 'scripts/verify-hosted-play.mjs';
  if (browserOnly) {
    verificationScript = 'scripts/verify-hosted-play-browser.mjs';
  }
  if (loadProfile) {
    verificationScript = 'scripts/play-load/run.mjs';
  }
  const verification = start({
    env: loadProfile
      ? { ...environment, CONVEX_SELF_HOSTED_URL: backendUrl, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey }
      : environment,
    command: browserOnly ? process.execPath : node,
    args: [
      ...(browserOnly ? ['--no-env-file'] : []),
      ...(loadProfile ? ['--experimental-strip-types'] : []),
      path.join(root, verificationScript),
      ...(loadProfile ? [] : ['--env-file', envFile]),
      '--origin',
      origin,
      ...(values['load-profile']
        ? [
            '--profile',
            values['load-profile'],
            '--compression',
            values['load-compression'],
            ...(values['load-cpu'] ? ['--profile-cpu'] : []),
            '--case',
            values['load-case']!,
            '--report-dir',
            evidence,
            '--worker-pid',
            String(worker.pid),
            '--backend-pid',
            String(backend.pid),
            ...(values['load-max-bytes'] ? ['--max-bytes', values['load-max-bytes']] : []),
            ...(values['load-seed'] ? ['--seed', values['load-seed']] : []),
            ...(values['load-repetition'] ? ['--repetition', values['load-repetition']] : []),
          ]
        : []),
      ...(browserOnly
        ? [
            '--credentials-file',
            path.join(runtime, 'browser-credentials.json'),
            '--report-dir',
            reportDirectory,
            ...(values.browser ? ['--browser', values.browser] : []),
          ]
        : []),
    ],
    logPath: verificationLog,
  });
  let verificationTimeout = 180_000;
  if (browserOnly || loadProfile) {
    verificationTimeout = 300_000;
  }
  if (loadProfile && loadCase === 'steady') {
    verificationTimeout = 540_000;
  }
  const timeout = setTimeout(() => verification.kill('SIGTERM'), verificationTimeout);
  await childExits.get(verification);
  clearTimeout(timeout);
  const report = readFileSync(verificationLog, 'utf8');
  console.log(report);
  if (browserOnly) {
    console.log(`Browser reports and captures remain in ${reportDirectory}.`);
  }
  if (verification.exitCode !== 0) {
    throw new Error(`Hosted ${browserOnly ? 'browser' : 'protocol'} verification failed; see ${verificationLog}.`);
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
