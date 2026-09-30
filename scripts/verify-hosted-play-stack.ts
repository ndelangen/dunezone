import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import sharp from 'sharp';

import { loadCaseSchema } from '../src/shared/play/loadTarget';
import { nodeExecutable } from './node-executable';
import { bundleRunner } from './play-load/bundle';
import { prepareHostedBackend } from './play-load/hosted-backend';
import { runnerProfiles } from './play-load/profiles';
import { syntheticHostedTarget } from './play-load/synthetic-target';
import { backendCacheDirectory, cachedBackendArchive, spawnFailure } from './verify-hosted-backend-cache';
import { browserFlows, flowsInShard, isBrowserFlow } from './verify-hosted-flows';
import type { BrowserFlow } from './verify-hosted-flows';
import { parseExpectedRenderer } from './verify-hosted-renderer';

const root = path.resolve(import.meta.dirname, '..');
const node = nodeExecutable();
const { values } = parseArgs({
  options: {
    'backend-binary': { type: 'string' },
    'load-profile': { type: 'string' },
    'load-cpu': { type: 'boolean', default: false },
    'load-hosted-backend': { type: 'boolean', default: false },
    'load-compression': { type: 'string', default: 'on' },
    'load-case': { type: 'string', default: 'probe' },
    'load-max-bytes': { type: 'string' },
    'load-seed': { type: 'string' },
    'load-repetition': { type: 'string' },
    flow: { type: 'string', multiple: true },
    shard: { type: 'string' },
    'browser-only': { type: 'boolean', default: false },
    browser: { type: 'string' },
    'expect-renderer': { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    'skip-generate': { type: 'boolean', default: false },
  },
});
const loadProfile = runnerProfiles.find((candidate) => candidate === values['load-profile']);
if (values['load-profile'] && (!loadProfile || values['browser-only'] || values.flow || values.shard)) {
  throw new Error('Choose one load profile and run browser verification separately.');
}
if (values['load-profile'] && values['load-case'] === 'browser' && values['skip-build']) {
  throw new Error('Browser load probes need a fresh build for their disposable backend.');
}
if (values.shard !== undefined && values.flow) {
  throw new Error('Choose --shard or --flow, not both.');
}
/* --shard selects the flows that verify-hosted-flows.ts assigns to one hosted_play CI shard. */
const shardFlows = values.shard === undefined ? undefined : flowsInShard(values.shard);
if (shardFlows?.length === 0) {
  const shards = new Set(Object.values(browserFlows).map(({ shard }) => shard));
  throw new Error(`--shard must be one of ${[...shards].join(', ')}.`);
}
/* Without --browser-only the protocol verifier runs first, and the selected flows run after it on the same stack. */
const flows: BrowserFlow[] = [];
for (const name of shardFlows ?? values.flow ?? (values['browser-only'] ? ['regular'] : [])) {
  if (name !== 'all' && !isBrowserFlow(name)) {
    throw new Error(`--flow must be all or one of ${Object.keys(browserFlows).join(', ')}.`);
  }
  for (const selected of name === 'all' ? Object.keys(browserFlows).filter(isBrowserFlow) : [name]) {
    if (!flows.includes(selected)) {
      flows.push(selected);
    }
  }
}
if (flows.length > 0 && values['skip-build']) {
  throw new Error("Browser flows require a fresh frontend build for this run's backend URL.");
}
if (values.browser && flows.length === 0) {
  throw new Error('--browser requires a browser flow.');
}
/* Each flow's driver holds the first table it opens to this renderer and fails there; without it nothing is enforced. */
const expectedRenderer = parseExpectedRenderer(values['expect-renderer']);
if (expectedRenderer && flows.length === 0) {
  throw new Error('--expect-renderer requires a browser flow.');
}
const loadCase = loadCaseSchema.options.find((candidate) => candidate === values['load-case']);
if (!loadCase) {
  throw new Error('Choose a supported load case.');
}
if (values['load-cpu'] && !loadProfile) {
  throw new Error('--load-cpu requires an isolated load profile.');
}
if (values['load-hosted-backend'] && (!loadProfile || loadCase === 'browser')) {
  throw new Error('--load-hosted-backend requires a protocol load profile.');
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
const launchedAt = Date.now();
/* Set once the launcher stops its children, so only an exit it did not cause is reported. */
let stopping = false;

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

type Invocation = { command: string; args: string[]; env?: NodeJS.ProcessEnv; cwd?: string };

function run(invocation: Invocation & { label: string; timeoutMs?: number }): string {
  const timeoutMs = invocation.timeoutMs ?? 120_000;
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd ?? root,
    env: invocation.env ?? environment,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(spawnFailure(invocation.label, result, timeoutMs));
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

/** Runs one verifier within its timeout, prints its log and reports whether it passed. */
async function verify(invocation: Invocation & { logPath: string }, timeoutMs: number): Promise<boolean> {
  const verification = start(invocation);
  const timeout = setTimeout(() => verification.kill('SIGTERM'), timeoutMs);
  await childExits.get(verification);
  clearTimeout(timeout);
  console.log(readFileSync(invocation.logPath, 'utf8'));
  return verification.exitCode === 0;
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

/**
 * How long this local backend lets one query or mutation run, in whole seconds.
 * Convex's default, which hosted deployments keep, is 1 s.
 * Convex Auth runs Scrypt inside the `auth:store` mutation at every Password sign-in, and on a loaded machine that alone passed 1 s (#1493).
 * A query or mutation that takes between 1 and 2 s passes here and fails on a hosted deployment, so this is the smallest whole raise.
 * Sign-in's `auth:store` took at most 0.13 s in a run of every browser flow and 1.5 s under 120 busy loops on a 10-core Mac.
 * It applies to this launcher's own backend only, and the verifiers still never retry.
 */
const LOCAL_FUNCTION_LIMIT_SECONDS = 2;

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
  const url = `https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-08-10-c0cb7ae/${artifact.filename}`;
  /* The verified archive is kept across runs, so only a machine's first run downloads it; that one download gets room for a slow link. */
  const archive = cachedBackendArchive({
    directory: backendCacheDirectory(),
    digest: artifact.digest,
    download: (target) =>
      run({
        command: '/usr/bin/curl',
        args: [
          '--fail',
          '--location',
          '--silent',
          '--show-error',
          '--max-time',
          '240',
          '--retry',
          '1',
          '--output',
          target,
          url,
        ],
        label: 'Pinned backend download',
        timeoutMs: 540_000,
      }),
  });
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

type Publication = { key: string; href: string; face: string };

/** A flat local publication face: red for a front, blue for a back, as the pixel checks expect. */
async function render(file: string, face: string) {
  const color = face === 'back' ? '#253e5a' : '#8F2C1C';
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${color}"/><circle cx="300" cy="300" r="265" fill="none" stroke="#ead9bb" stroke-width="16"/><text x="300" y="290" text-anchor="middle" fill="#ead9bb" font-size="54" font-family="sans-serif">RECOVERY</text><text x="300" y="370" text-anchor="middle" fill="#ead9bb" font-size="44" font-family="sans-serif">${face.toUpperCase()}</text></svg>`
    )
  )
    .jpeg()
    .toFile(file);
}

/** Installs local bytes for each seeded publication in the isolated Worker's bucket, and checks the publisher serves them. */
async function installPublications(publications: Publication[], workerOutput: string, origin: string) {
  const workerRuntime = /Local state\/configuration: (.+)\. Removed/.exec(workerOutput)?.[1];
  if (!workerRuntime) {
    throw new Error('The isolated Worker storage path is missing.');
  }
  const config = path.join(workerRuntime, 'publisher.json');
  const settings = JSON.parse(readFileSync(config, 'utf8'));
  const bucket = settings.r2_buckets.find((entry: { binding: string }) => entry.binding === 'ASSET_BUCKET');
  if (!bucket || bucket.remote !== false) {
    throw new Error('The publication bucket must be local.');
  }
  /* One image per face, rendered once and uploaded for every publication of that face. */
  const rendered = new Set<string>();
  for (const publication of publications) {
    const file = path.join(runtime, `${publication.face}.jpg`);
    if (!rendered.has(publication.face)) {
      rendered.add(publication.face);
      await render(file, publication.face);
    }
    run({
      command: node,
      args: [
        path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
        'r2',
        'object',
        'put',
        `${bucket.bucket_name}/${publication.key}`,
        '--local',
        '--persist-to',
        path.join(workerRuntime, 'state'),
        '--config',
        config,
        '--file',
        file,
        '--content-type',
        'image/jpeg',
      ],
      env: environment,
      label: 'Local publication fixture',
    });
    const response = await fetch(`${origin}${publication.href}`);
    if (!response.ok) {
      throw new Error(`Local publication returned ${response.status}.`);
    }
  }
}

const interrupt = () => {
  stopping = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
};
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  /* A broken shared import fails here, before any backend or Worker starts. */
  const runnerBundle = loadProfile ? await bundleRunner() : undefined;
  const binary = backendBinary();
  const ports = new Set<number>();
  while (ports.size < 3) {
    ports.add(await freePort());
  }
  const [backendPort, sitePort, appPort] = [...ports];
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const siteUrl = `http://127.0.0.1:${sitePort}`;
  const origin = `http://127.0.0.1:${appPort}`;
  const hostedTarget = values['load-hosted-backend']
    ? syntheticHostedTarget(
        run({ command: '/usr/bin/git', args: ['rev-parse', 'HEAD'], label: 'Source revision' }).trim()
      )
    : null;
  const backendSource = hostedTarget ? path.join(runtime, 'backend-source') : root;
  if (hostedTarget) {
    await prepareHostedBackend(backendSource, hostedTarget);
    writeFileSync(
      path.join(evidence, 'hosted-backend-source.json'),
      readFileSync(path.join(backendSource, 'load-source.json'))
    );
  }
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
      hostedTarget?.backendOrigin ?? backendUrl,
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
    env: { ...environment, DATABASE_UDF_USER_TIMEOUT_SECONDS: String(LOCAL_FUNCTION_LIMIT_SECONDS) },
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
      cwd: backendSource,
    });
  };
  configureAuth(convex, hostedTarget?.applicationOrigin ?? origin);
  if (hostedTarget) {
    const startsAt = Date.now();
    const runId = randomBytes(16).toString('hex');
    convex(['env', 'set', 'PLAY_LOAD_RUN', JSON.stringify({ runId, startsAt, expiresAt: startsAt + 20 * 60_000 })]);
    convex(['env', 'set', 'PLAY_SERVICE_URL', origin]);
    environment.PLAY_LOAD_LOCAL_ACCOUNT_SUFFIX = runId;
  }
  convex(['deploy', '--yes']);
  console.log(`Synthetic Auth backend ready at ${backendUrl}; same-origin publisher ${origin}.`);
  /* Wrangler's own debug log goes to its global log directory by default, outside the evidence the artifact keeps. */
  const wranglerLog = path.join(evidence, 'wrangler.log');
  rmSync(wranglerLog, { force: true });
  const workerLog = path.join(evidence, 'worker.log');
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
      ...(values['skip-generate'] ? ['--skip-generate'] : []),
      ...(loadProfile ? ['--load-profile', loadProfile] : []),
    ],
    env: { ...environment, WRANGLER_LOG_PATH: wranglerLog },
    logPath: workerLog,
  });
  /* `scripts/workerd-exit-record.mjs` writes workerd's own exit into the Worker's log; this repeats it where the run's output is read. */
  worker.once('exit', (code, signal) => {
    if (stopping) {
      return;
    }
    const seconds = Math.round((Date.now() - launchedAt) / 1000);
    console.error(
      `The local Worker exited with ${signal ? `signal ${signal}` : `code ${code}`} ${seconds} s after launch. Its workerd lines from ${workerLog}:`
    );
    for (const line of readFileSync(workerLog, 'utf8').split('\n')) {
      if (line.includes('[workerd ')) {
        console.error(line);
      }
    }
  });
  await ready(`${origin}/__play/health`, worker, 300_000);
  /* Each verifier that failed. A failed verifier does not stop the ones after it, and the run fails at the end. */
  const failed: string[] = [];
  if (!values['browser-only']) {
    const verificationLog = path.join(evidence, 'verification.log');
    let verificationTimeout = 180_000;
    if (loadProfile) {
      verificationTimeout = loadCase === 'steady' ? 540_000 : 300_000;
    }
    /* The protocol verifier creates and provisions its own synthetic game, apart from the real games the browser flows create. */
    const passed = await verify(
      {
        env: loadProfile
          ? { ...environment, CONVEX_SELF_HOSTED_URL: backendUrl, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey }
          : environment,
        command: node,
        args: [
          loadProfile ? runnerBundle! : path.join(root, 'scripts/verify-hosted-play.mjs'),
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
        ],
        logPath: verificationLog,
      },
      verificationTimeout
    );
    if (!passed) {
      failed.push('protocol verification');
    }
  }
  if (flows.length > 0) {
    /* Every flow creates its own real game on this ruleset; the Recovery token is the catalogue some flows request. */
    const seeded = JSON.parse(convex(['run', 'playTesting:seedRealGameCatalogue', '{}'])) as {
      rulesetId: string;
      publications: Publication[];
    };
    const { rulesetId } = seeded;
    const publications = [...seeded.publications];
    if (flows.some((flow) => browserFlows[flow].needsCatalogue)) {
      publications.push(...(JSON.parse(convex(['run', 'playTesting:seedPublicCatalogue', '{}'])) as Publication[]));
    }
    await installPublications(publications, readFileSync(workerLog, 'utf8'), origin);
    const reportDirectory = path.join(evidence, 'browser');
    /*
     * A game takes its phase cooldown and its start stage from the backend when it is provisioned, and the game Worker accepts a test value only in this isolated stack.
     * The flow that checks the cooldown plays at the real one; every other flow's games change phase without waiting.
     * A flow that tests play starts its games at Turn 1 (#1594); the regular flow starts at creation and plays every stage.
     */
    let testPhaseCooldown: string | undefined;
    let testStartStage: string | undefined;
    for (const flow of flows) {
      const wanted = browserFlows[flow].checksPhaseCooldown ? undefined : '0';
      if (wanted !== testPhaseCooldown) {
        convex(
          wanted === undefined
            ? ['env', 'remove', 'PLAY_TEST_PHASE_COOLDOWN_MS']
            : ['env', 'set', 'PLAY_TEST_PHASE_COOLDOWN_MS', wanted]
        );
        testPhaseCooldown = wanted;
      }
      const start = browserFlows[flow].startsInPlay ? 'play' : undefined;
      if (start !== testStartStage) {
        convex(
          start === undefined
            ? ['env', 'remove', 'PLAY_TEST_START_STAGE']
            : ['env', 'set', 'PLAY_TEST_START_STAGE', start]
        );
        testStartStage = start;
      }
      const passed = await verify(
        {
          command: process.execPath,
          args: [
            '--no-env-file',
            path.join(root, 'scripts/verify-hosted-play-browser.mjs'),
            '--env-file',
            envFile,
            '--origin',
            origin,
            '--credentials-file',
            path.join(runtime, `${flow}-credentials.json`),
            '--report-dir',
            reportDirectory,
            '--flow',
            flow,
            '--ruleset-id',
            rulesetId,
            ...(values.browser ? ['--browser', values.browser] : []),
            ...(expectedRenderer ? ['--expect-renderer', expectedRenderer] : []),
          ],
          logPath: path.join(evidence, `${flow}.log`),
        },
        browserFlows[flow].timeoutMs
      );
      if (!passed) {
        failed.push(flow);
      }
    }
    console.log(`Browser reports and captures remain in ${reportDirectory}.`);
  }
  if (failed.length > 0) {
    throw new Error(`Hosted verification failed: ${failed.join(', ')}; see their logs in ${evidence}.`);
  }
  if (hostedTarget) {
    /* The runner retired its game, so the copied backend takes a new one and refuses a second while that one is live. */
    const fixtureArguments = '{}';
    const next = JSON.parse(convex(['run', 'playTesting:createFixture', fixtureArguments])) as { gameId: string };
    const refused = spawnSync(
      node,
      [
        path.join(root, 'node_modules/convex/bin/main.js'),
        'run',
        'playTesting:createFixture',
        fixtureArguments,
        '--url',
        backendUrl,
        '--admin-key',
        adminKey,
      ],
      { cwd: backendSource, env: localEnv, encoding: 'utf8', timeout: 120_000 }
    );
    if (refused.status === 0 || !refused.stderr.includes('already has a live game')) {
      throw new Error('The copied backend accepted a second live game.');
    }
    convex(['run', 'playTesting:retireFixture', JSON.stringify({ gameId: next.gameId })]);
    console.log('The copied backend accepted a new game after retirement and refused a second live game.');
  }
} finally {
  stopping = true;
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
