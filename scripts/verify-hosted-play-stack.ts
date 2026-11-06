import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import type { ConvexHttpClient } from 'convex/browser';
import sharp from 'sharp';

import { matchPublishedPath, publishedR2Key } from '../src/shared/asset-publishing/publicationTargets';
import { loadCaseSchema } from '../src/shared/play/loadTarget';
import { SPICE_TOKEN_HREF } from '../src/shared/play/spiceToken';
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
    'stop-on-failure': { type: 'boolean', default: false },
    browser: { type: 'string' },
    'expect-renderer': { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    'skip-generate': { type: 'boolean', default: false },
    /* Boots the stack for a person to play on (and a bot to join, see tools/play-bot) and keeps it up until Ctrl-C; runs no verifier. */
    serve: { type: 'boolean', default: false },
    /* With --serve: GF9 base factions for the seeded ruleset in place of the synthetic pair, such as `fremen,emperor`. */
    factions: { type: 'string' },
    /*
     * With --serve: a catalogue `bun run play:bot:pull` copied from the live site. The game Worker drafts, deals and supplies
     * that ruleset's real decks, factions, leaders and Traitors, and its images are served locally.
     */
    mirror: { type: 'string' },
    /* With --serve: how many bot accounts to create (1 to 5), each a separate player with an ordinary name. */
    bots: { type: 'string', default: '1' },
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
if (values.serve && (flows.length > 0 || loadProfile || values['browser-only'])) {
  throw new Error('--serve runs no verifier: leave out --flow, --shard, --browser-only and --load-profile.');
}
if ((values.mirror || values.factions) && !values.serve) {
  throw new Error('--mirror and --factions only apply with --serve.');
}
if (values.mirror && values.factions) {
  throw new Error('Choose --mirror or --factions: a mirror brings its own factions.');
}
const mirror = values.mirror
  ? (await import('../tools/play-bot/mirror')).readMirror(path.resolve(values.mirror))
  : undefined;
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
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    verification.kill('SIGTERM');
  }, timeoutMs);
  await childExits.get(verification);
  clearTimeout(timeout);
  console.log(readFileSync(invocation.logPath, 'utf8'));
  /* Stopping the verifier closes its browsers, so its own last error reads as a closed page rather than the time limit. */
  if (timedOut) {
    console.log(`${path.basename(invocation.logPath, '.log')} was stopped at its ${timeoutMs / 1000} s limit.`);
  }
  return !timedOut && verification.exitCode === 0;
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
 * The macOS runner draws the table with WebGPU on the same three cores, and on 12 Oct 2026 single-read functions such as `playGames:getGameByAddress` passed 2 s there on 8 of 58 runs, with nothing else running in the backend's log (#1045), so macOS gets 3 s.
 * It applies to this launcher's own backend only, and the verifiers still never retry.
 */
const LOCAL_FUNCTION_LIMIT_SECONDS = process.platform === 'darwin' ? 3 : 2;

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
      digest: 'eba2eeab62632e0c153e83f9f1c5ada9e98834e2db3386e32f825a3a97f8c093',
    },
    'darwin-arm64': {
      filename: 'convex-local-backend-aarch64-apple-darwin.zip',
      digest: 'f89a9dc8189148b0aa67b50dbcb202ce429b541df83e36cab4438c2b7955d5c2',
    },
  };
  const artifact = artifacts[`${process.platform}-${process.arch}`];
  if (!artifact) {
    throw new Error('This platform needs an explicit --backend-binary.');
  }
  const url = `https://github.com/get-convex/convex-backend/releases/download/precompiled-2026-10-06-a3538c6/${artifact.filename}`;
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
  /*
   * PLAY_TEST_PASSWORD_HASH makes Password check the synthetic accounts' random passwords with PBKDF2 at 1,000 iterations instead of Scrypt (#1493).
   * Scrypt was most of each sign-in's `auth:store` time, and a stall of the macOS runner during it ended a sign-in at the function limit.
   * Only a loopback backend honours the variable (`convex/lib/syntheticPasswords.ts`), so the --load-hosted-backend copy, whose own URL is the hosted one, keeps Scrypt.
   */
  for (const [name, value] of [
    ['SITE_URL', origin],
    ['PLAY_SERVICE_URL', origin],
    ['IS_TEST', 'true'],
    ['E2E_LOCAL_AUTH', 'true'],
    ['PLAY_TEST_PASSWORD_HASH', 'pbkdf2'],
  ]) {
    convex(['env', 'set', name!, value!]);
  }
  convex(['env', 'set', 'JWT_PRIVATE_KEY', '--from-file', privatePath]);
  convex(['env', 'set', 'JWKS', '--from-file', jwksPath]);
}

/* `source` is a mirrored image's published path: its bytes are installed instead of a synthetic face. */
type Publication = { key: string; href: string; face: string; source?: string };

/** Synthetic local faces: red fronts, blue backs, and a gold spice face labelled as a fixture. */
async function render(file: string, face: string) {
  const fixture =
    face === 'spice'
      ? { color: '#f6d77f', ink: '#6b431d', title: 'SPICE', subtitle: 'FIXTURE' }
      : {
          color: face === 'back' ? '#253e5a' : '#8F2C1C',
          ink: '#ead9bb',
          title: 'RECOVERY',
          subtitle: face.toUpperCase(),
        };
  await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${fixture.color}"/><circle cx="300" cy="300" r="265" fill="none" stroke="${fixture.ink}" stroke-width="16"/><text x="300" y="290" text-anchor="middle" fill="${fixture.ink}" font-size="54" font-family="sans-serif">${fixture.title}</text><text x="300" y="370" text-anchor="middle" fill="${fixture.ink}" font-size="44" font-family="sans-serif">${fixture.subtitle}</text></svg>`
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
    const source = publication.source ? mirrorImage(publication.source) : undefined;
    const file = source?.file ?? path.join(runtime, `${publication.face}.jpg`);
    if (!source && !rendered.has(publication.face)) {
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
        source?.contentType ?? 'image/jpeg',
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

/** The mirror's local copy of a published image, by the path (or address) its answers name it with. */
function mirrorImage(published: string) {
  const wanted = new URL(published, 'http://local').pathname;
  const image = mirror?.file.media.find((entry) => new URL(entry.path, 'http://local').pathname === wanted);
  return image && mirror
    ? { file: path.join(mirror.directory, image.file), contentType: image.contentType }
    : undefined;
}

/**
 * The mirrored ruleset's own decks and factions on the seeded ruleset, for the create page's manifest: the page reads the local backend, while games read the mirror.
 * Each deck shows the back the live site resolves for it, and each faction its token.
 */
async function seedMirrorPreview(source: NonNullable<typeof mirror>, adminClient: ConvexHttpClient, rulesetId: string) {
  const { makeFunctionReference } = await import('convex/server');
  const { publishingCustomDeckCardback } = await import('../src/shared/assets/fixtures/publishingDeckCardback');
  const image = (published: string | null | undefined) => (published && mirrorImage(published) ? published : undefined);
  const decks = source.ruleset.slots.flatMap(({ slot, asset }) => {
    const supply = source.assets.get(`${asset.type}/${asset.slug}`);
    if (slot === 'board' || !supply) {
      return [];
    }
    return [
      {
        slot,
        type: asset.type,
        name: asset.name,
        /* Its own cardback, so the page shows the back installed for it rather than a preset or another deck the local backend lacks. */
        data:
          asset.type === 'deck'
            ? { ...(supply.asset.data as object), cardback: publishingCustomDeckCardback }
            : supply.asset.data,
        image: image(supply.back ?? supply.front),
        members: supply.members.map((member, index) => ({
          type: member.asset.type,
          name: member.asset.name,
          count: member.count,
          ...(index === 0 && image(member.front) ? { image: member.front! } : {}),
        })),
      },
    ];
  });
  const factions = source.draftable.flatMap((draftable) => {
    const definition = source.factions.get(draftable.id);
    return definition?.data
      ? [
          {
            data: definition.data,
            ...(image(definition.token) ? { token: definition.token! } : {}),
            ...(image(definition.tokenBack) ? { tokenBack: definition.tokenBack! } : {}),
          },
        ]
      : [];
  });
  const boardId = source.ruleset.board?.asset.id;
  const boardImage = boardId
    ? source.file.media.find((entry) => entry.path.startsWith(`/published/boards/${boardId}/`))?.path
    : undefined;
  return (await adminClient.mutation(makeFunctionReference<'mutation'>('playTesting:seedMirrorPreview'), {
    rulesetId,
    boardName: source.ruleset.board?.asset.name ?? 'Board',
    ...(boardImage ? { boardImage } : {}),
    decks,
    factions,
  })) as Publication[];
}

/** The mirror's images under the keys the live site stores them at, so the local publisher serves the paths its answers name. */
async function installMirrorMedia(source: NonNullable<typeof mirror>, workerOutput: string, origin: string) {
  const { publishedKey } = await import('../tools/play-bot/mirror');
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
  console.log(`Installing ${source.file.media.length} mirrored images...`);
  for (const image of source.file.media) {
    run({
      command: node,
      args: [
        path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
        'r2',
        'object',
        'put',
        `${bucket.bucket_name}/${publishedKey(image.path)}`,
        '--local',
        '--persist-to',
        path.join(workerRuntime, 'state'),
        '--config',
        config,
        '--file',
        path.join(source.directory, image.file),
        '--content-type',
        image.contentType,
      ],
      env: environment,
      label: 'Mirrored image',
    });
  }
  /* A Leader is served as a component: an envelope holding its image, under the revision the executor proxy names. */
  const { mirroredLeaders, MIRROR_COMPONENT_REVISION } = await import('../tools/play-bot/mirror');
  const { componentEnvelopeKey } = await import('../src/shared/asset-publishing/componentPublication');
  const leaders = mirroredLeaders(source.file);
  if (leaders.length) {
    console.log(`Installing ${leaders.length} mirrored Leaders...`);
  }
  for (const leader of leaders) {
    const image = readFileSync(path.join(source.directory, leader.file));
    const envelope = {
      schemaVersion: 1,
      assetId: leader.assetId,
      assetType: 'faction-leader',
      revision: MIRROR_COMPONENT_REVISION,
      payloadHash: createHash('sha256').update(image).digest('hex'),
      geometry: { width: 600, height: 600, parts: [] },
      image: { contentType: 'image/jpeg', base64: image.toString('base64') },
    };
    const envelopeFile = path.join(runtime, 'leader-envelope.json');
    writeFileSync(envelopeFile, JSON.stringify(envelope));
    run({
      command: node,
      args: [
        path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
        'r2',
        'object',
        'put',
        `${bucket.bucket_name}/${componentEnvelopeKey(leader.assetId, MIRROR_COMPONENT_REVISION)}`,
        '--local',
        '--persist-to',
        path.join(workerRuntime, 'state'),
        '--config',
        config,
        '--file',
        envelopeFile,
        '--content-type',
        'application/json',
      ],
      env: environment,
      label: 'Mirrored Leader',
    });
  }
  const sample = source.file.media[0];
  if (sample) {
    const response = await fetch(`${origin}${sample.path}`);
    if (!response.ok) {
      throw new Error(`The local publisher does not serve ${sample.path} (${response.status}).`);
    }
  }
}

/* Ordinary first names for the bot accounts, so a seat's name gives nothing away. */
const BOT_NAMES = ['Alex', 'Sam', 'Robin', 'Kim', 'Jordan'];

/** The local ruleset a served stack seeds; the catalogue proxy answers reads of it from the mirror. */
let servedRulesetId: string | undefined;

/**
 * `--serve`: games play out in full, from the draft through trading and setup, with no phase cooldown.
 * Two synthetic accounts exist (one for the person, one for a bot), and the stack stays up until Ctrl-C.
 * With a mirror, the ruleset's catalogue answers come from it (see tools/play-bot/catalogue-proxy.ts) and its images are installed locally.
 * The accounts and addresses go to tools/play-bot/out/stack.json for the bot runner.
 */
async function serveForPlay({
  convex,
  seedCatalogue,
  origin,
  backendUrl,
  adminKey,
}: {
  convex: (args: string[]) => string;
  seedCatalogue: (withPublicCatalogue: boolean, gf9Factions?: string[], rulesetName?: string) => Promise<string>;
  origin: string;
  backendUrl: string;
  adminKey: string;
}) {
  const rulesetName = mirror ? `${mirror.ruleset.ruleset.name} (local copy)` : undefined;
  const rulesetId = await seedCatalogue(true, values.factions?.split(',').filter(Boolean), rulesetName);
  servedRulesetId = rulesetId;
  if (mirror) {
    await installMirrorMedia(mirror, readFileSync(path.join(evidence, 'worker.log'), 'utf8'), origin);
  }
  convex(['env', 'set', 'PLAY_TEST_PHASE_COOLDOWN_MS', '0']);
  /* PLAY_TEST_START_STAGE stays unset: a game plays its draft, trading and setup, so Traitors and predictions are dealt. */
  const { ConvexHttpClient } = await import('convex/browser');
  const { setAdminAuth } = await import('./lib/convex-admin');
  const { provisionAccounts } = await import('./lib/synthetic-accounts');
  const botCount = Number(values.bots);
  if (!Number.isInteger(botCount) || botCount < 1 || botCount > BOT_NAMES.length) {
    throw new Error(`--bots must be between 1 and ${BOT_NAMES.length}.`);
  }
  /*
   * Each bot is its own account with an ordinary name and address, so nothing at the table marks a seat as a bot:
   * a bot cannot tell another bot from a person, and plays as if everyone else is a person.
   */
  const bots = BOT_NAMES.slice(0, botCount).map((name) => ({
    name,
    email: `${name.toLowerCase()}@example.invalid`,
    password: randomBytes(24).toString('hex'),
  }));
  const accounts = {
    player: { name: 'Player', email: 'player@example.invalid', password: randomBytes(9).toString('base64url') },
    /* `bot` stays for a runner that predates `bots`. */
    bot: bots[0]!,
    bots,
  };
  const admin = new ConvexHttpClient(backendUrl, { logger: false });
  setAdminAuth(admin, adminKey);
  await provisionAccounts(admin, [accounts.player, ...bots]);
  if (mirror) {
    /* The create page reads the local backend, so the seeded ruleset takes on the mirror's decks and factions for its manifest. */
    const publications = await seedMirrorPreview(mirror, admin, rulesetId);
    await installPublications(publications, readFileSync(path.join(evidence, 'worker.log'), 'utf8'), origin);
  }
  const out = path.join(root, 'tools/play-bot/out');
  mkdirSync(out, { recursive: true });
  const stackFile = path.join(out, 'stack.json');
  /* The mirror's directory lets each bot find the ruleset's rulebook.md beside its catalogue. */
  const stackInfo = { origin, backendUrl, rulesetId, accounts, ...(mirror ? { mirror: mirror.directory } : {}) };
  writeFileSync(stackFile, JSON.stringify(stackInfo, null, 2), { mode: 0o600 });
  console.log(
    [
      '',
      `Play is up at ${origin}`,
      `1. Sign in at ${origin}/auth/login as ${accounts.player.email} with password ${accounts.player.password}`,
      `2. Create a game at ${origin}/play/create on "${rulesetName ?? 'Synthetic ruleset'}" with ${botCount + 1} players (you and ${botCount === 1 ? 'one bot' : `${botCount} bots`}).`,
      `3. Start the bots from their manager page (bun run play:bot:watch, or play:bot:up starts it for you) with the game page URL, then approve each seat request.`,
      '4. Talk to the bot at the table: it acts only when someone writes to it.',
      `Accounts and addresses: ${stackFile}. Ctrl-C stops everything.`,
      '',
    ].join('\n')
  );
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
  });
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
  const ports = new Set<number>();
  while (ports.size < 3) {
    ports.add(await freePort());
  }
  const [backendPort, sitePort, appPort] = [...ports];
  const backendUrl = `http://127.0.0.1:${backendPort}`;
  const siteUrl = `http://127.0.0.1:${sitePort}`;
  const origin = `http://127.0.0.1:${appPort}`;
  /*
   * The frontend build needs only the origins above, so it runs while the backend boots and deploys instead of after them.
   * The steps below block on spawnSync, which leaves this child running; the Worker starts on the finished build after the deploy.
   */
  /* With a mirror, the game Worker asks its catalogue questions through a proxy that answers them from the mirror. */
  const proxyPort = mirror ? await freePort() : undefined;
  /* And the publisher asks about the mirror's Leaders through one that says each is published (see installMirrorMedia). */
  const executorPort = mirror ? await freePort() : undefined;
  const workerArguments = [
    '--no-env-file',
    path.join(root, 'scripts/play-local.ts'),
    '--convex-url',
    backendUrl,
    '--convex-site-url',
    siteUrl,
    ...(proxyPort ? ['--game-convex-url', `http://127.0.0.1:${proxyPort}`] : []),
    ...(executorPort ? ['--publisher-executor-url', `http://127.0.0.1:${executorPort}/asset-publishing/executor`] : []),
    '--port',
    String(appPort),
    ...(values['skip-generate'] ? ['--skip-generate'] : []),
  ];
  const buildLog = path.join(evidence, 'build.log');
  const build = values['skip-build']
    ? undefined
    : start({
        command: process.execPath,
        args: [...workerArguments, '--build-only'],
        logPath: buildLog,
      });
  const binary = backendBinary();
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
    /* CI uploads evidence after cleanup deletes the private runtime directory. */
    logPath: path.join(evidence, 'backend.log'),
  });
  await ready(`${backendUrl}/version`, backend, 30_000);
  if (mirror && proxyPort) {
    const { startCatalogueProxy, startExecutorProxy } = await import('../tools/play-bot/catalogue-proxy');
    await startCatalogueProxy({ mirror, backendUrl, localRulesetId: () => servedRulesetId, port: proxyPort });
    await startExecutorProxy({ mirror, siteUrl, port: executorPort });
  }
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
  /* Retain execution times and request IDs after the disposable backend is removed. */
  start({
    command: node,
    args: [
      path.join(root, 'node_modules/convex/bin/main.js'),
      'logs',
      '--history',
      '10000',
      '--success',
      '--jsonl',
      '--url',
      backendUrl,
      '--admin-key',
      adminKey,
    ],
    env: localEnv,
    logPath: path.join(evidence, 'functions.log'),
  });
  if (flows.includes('regular')) {
    const { verifyColdDirectoryRead } = await import('./verify-cold-directory-read');
    const coldDirectory = {
      ...(await verifyColdDirectoryRead(backendUrl, backend.pid)),
      nativeUdfLimitSeconds: LOCAL_FUNCTION_LIMIT_SECONDS,
    };
    writeFileSync(path.join(evidence, 'cold-directory-read.json'), JSON.stringify(coldDirectory, null, 2));
    console.log(`Cold directory-read initialization passed: ${JSON.stringify(coldDirectory)}`);
    const { verifyColdNameRead } = await import('./verify-cold-name-read');
    const coldRead = {
      ...(await verifyColdNameRead(backendUrl, backend.pid)),
      nativeUdfLimitSeconds: LOCAL_FUNCTION_LIMIT_SECONDS,
    };
    writeFileSync(path.join(evidence, 'cold-name-read.json'), JSON.stringify(coldRead, null, 2));
    console.log(`Cold name-read initialization passed: ${JSON.stringify(coldRead)}`);
  }
  console.log(`Synthetic Auth backend ready at ${backendUrl}; same-origin publisher ${origin}.`);
  /* Wrangler's own debug log goes to its global log directory by default, outside the evidence the artifact keeps. */
  const wranglerLog = path.join(evidence, 'wrangler.log');
  rmSync(wranglerLog, { force: true });
  const workerLog = path.join(evidence, 'worker.log');
  if (build) {
    /* The same bound the Worker's readiness wait gave the build when the Worker ran it. */
    const timeout = setTimeout(() => build.kill('SIGTERM'), 300_000);
    await childExits.get(build);
    clearTimeout(timeout);
    if (build.exitCode !== 0) {
      console.error(readFileSync(buildLog, 'utf8').split('\n').slice(-60).join('\n'));
      throw new Error(`The frontend build exited with ${build.exitCode ?? build.signalCode}; see ${buildLog}.`);
    }
  }
  const worker = start({
    command: process.execPath,
    args: [...workerArguments, '--skip-build', ...(loadProfile ? ['--load-profile', loadProfile] : [])],
    env: { ...environment, WRANGLER_LOG_PATH: wranglerLog },
    logPath: workerLog,
  });
  /* `scripts/workerd-exit-record.ts` writes workerd's own exit into the Worker's log; this repeats it where the run's output is read. */
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
  if (!values['browser-only'] && !values.serve) {
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
          loadProfile ? runnerBundle! : path.join(root, 'scripts/verify-hosted-play.ts'),
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
  /* Seeds the real-game ruleset with local bytes for its faces, and the Recovery token's catalogue when asked; returns the ruleset. */
  const seedCatalogue = async (withPublicCatalogue: boolean, gf9Factions?: string[], rulesetName?: string) => {
    const seeded = JSON.parse(
      convex([
        'run',
        'playTesting:seedRealGameCatalogue',
        JSON.stringify({ ...(gf9Factions ? { gf9Factions } : {}), ...(rulesetName ? { rulesetName } : {}) }),
      ])
    ) as {
      rulesetId: string;
      publications: Publication[];
    };
    const publications = [...seeded.publications];
    /* Physical spice uses a fixed publication address, so its synthetic face needs local R2 bytes too. */
    const spiceToken = matchPublishedPath(SPICE_TOKEN_HREF);
    if (!spiceToken) {
      throw new Error('The spice token must have a publication path.');
    }
    publications.push({
      key: publishedR2Key(spiceToken.assetType, spiceToken.assetId),
      href: SPICE_TOKEN_HREF,
      face: 'spice',
    });
    if (withPublicCatalogue) {
      publications.push(...(JSON.parse(convex(['run', 'playTesting:seedPublicCatalogue', '{}'])) as Publication[]));
    }
    await installPublications(publications, readFileSync(workerLog, 'utf8'), origin);
    return seeded.rulesetId;
  };
  if (values.serve) {
    await serveForPlay({ convex, seedCatalogue, origin, backendUrl, adminKey });
  }
  if (flows.length > 0) {
    /* Every flow creates its own real game on this ruleset; the Recovery token is the catalogue some flows request. */
    const rulesetId = await seedCatalogue(flows.some((flow) => browserFlows[flow].needsCatalogue));
    const reportDirectory = path.join(evidence, 'browser');
    /*
     * A game takes its phase cooldown and its start stage from the backend when it is provisioned, and the game Worker accepts a test value only in this isolated stack.
     * The flow that checks the cooldown plays at the real one; every other flow's games change phase without waiting.
     * A flow that tests play starts its games at Turn 1 (#1594); the regular flow starts at creation and plays every stage.
     */
    const testVariables = new Map<string, string | undefined>();
    const setTestVariable = (name: string, wanted: string | undefined) => {
      /* The stack's fresh backend starts with neither variable, so a first flow that wants none makes no call. */
      if (testVariables.get(name) === wanted) {
        return;
      }
      convex(wanted === undefined ? ['env', 'remove', name] : ['env', 'set', name, wanted]);
      testVariables.set(name, wanted);
    };
    for (const flow of flows) {
      setTestVariable('PLAY_TEST_PHASE_COOLDOWN_MS', browserFlows[flow].checksPhaseCooldown ? undefined : '0');
      setTestVariable('PLAY_TEST_START_STAGE', browserFlows[flow].startsInPlay ? 'play' : undefined);
      const passed = await verify(
        {
          command: process.execPath,
          args: [
            '--no-env-file',
            path.join(root, 'scripts/verify-hosted-play-browser.ts'),
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
        if (values['stop-on-failure']) {
          console.log(`Stopping the browser flow batch after ${flow} failed.`);
          break;
        }
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
