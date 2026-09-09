import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { nodeExecutable } from './node-executable';

const root = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    'convex-url': { type: 'string' },
    'convex-site-url': { type: 'string' },
    'game-convex-url': { type: 'string' },
    port: { type: 'string', default: '8787' },
    'skip-build': { type: 'boolean', default: false },
  },
});

function loopbackOrigin(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required; only an isolated local backend is supported.`);
  }
  const url = new URL(value);
  const explicitLoopback = new URL(`http://127.0.0.1:${url.port}`);
  if (!url.port || url.href !== explicitLoopback.href) {
    throw new Error(`${label} must be an explicit http://127.0.0.1:PORT origin.`);
  }
  return url.origin;
}

const convexUrl = loopbackOrigin(values['convex-url'], '--convex-url');
const convexSiteUrl = loopbackOrigin(values['convex-site-url'], '--convex-site-url');
const gameConvexUrl = loopbackOrigin(values['game-convex-url'] ?? convexUrl, '--game-convex-url');
const port = Number(values.port);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('--port must be between 1 and 65535.');
}
const origin = `http://127.0.0.1:${port}`;
if ([convexUrl, convexSiteUrl, gameConvexUrl].includes(origin)) {
  throw new Error('The publisher needs its own port.');
}
const node = nodeExecutable();

const environment: NodeJS.ProcessEnv = { ...process.env, VITE_CONVEX_URL: convexUrl, VITE_E2E_LOCAL_AUTH: 'true' };
for (const key of Object.keys(environment)) {
  if (/^(CLOUDFLARE_|CF_|CONVEX_)/u.test(key)) {
    delete environment[key];
  }
}
environment.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
environment.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
environment.WRANGLER_SEND_METRICS = 'false';

async function command(args: string[]) {
  const child = spawn(process.execPath, args, { cwd: root, env: environment, stdio: 'inherit' });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`bun ${args.join(' ')} exited ${code}`))));
  });
}

if (!values['skip-build']) {
  await command(['run', 'generate:images']);
  await command(['run', 'generate:objs']);
  await command(['run', 'publisher:assets']);
}
const assets = path.join(root, 'workers/publisher/dist');
const renderer = path.join(root, 'workers/publisher/runtime-generated/rulebook-html-renderer.mjs');
if (!existsSync(path.join(assets, 'index.html')) || !existsSync(renderer)) {
  throw new Error('Publisher assets are missing. Run without --skip-build to create the local-auth build.');
}

const runtime = mkdtempSync(path.join(tmpdir(), 'dunezone-play-local-'));
const suffix = randomUUID();
const gameName = `dunezone-game-local-${suffix}`;
const publisher = JSON.parse(readFileSync(path.join(root, 'workers/publisher/wrangler.jsonc'), 'utf8'));
const game = JSON.parse(readFileSync(path.join(root, 'workers/game/wrangler.jsonc'), 'utf8'));
const local = {
  workers_dev: false,
  preview_urls: false,
  routes: [],
  dev: {
    ip: '127.0.0.1',
    port,
    inspector_port: 0,
    local_protocol: 'http',
  },
};
Object.assign(publisher, local, {
  name: `dunezone-publisher-local-${suffix}`,
  main: path.join(root, 'workers/publisher/index.ts'),
  alias: { 'rulebook-html-renderer-runtime': renderer },
  assets: { ...publisher.assets, directory: assets },
  services: [{ binding: 'GAME_SERVICE', service: gameName }],
  triggers: { crons: [] },
  vars: {
    ...publisher.vars,
    PUBLIC_BASE_URL: origin,
    USER_IMAGE_PUBLIC_BASE_URL: origin,
    CAPTURE_BASE_URL: origin,
    CONVEX_CLOUD_BASE_URL: convexUrl,
    CONVEX_EXECUTOR_BASE_URL: `${convexSiteUrl}/asset-publishing/executor`,
    CONVEX_RENDER_URL: `${convexSiteUrl}/asset-publishing/render`,
    GIT_SHA: 'local-isolated',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'isolated-local-executor-not-for-deployment',
  },
});
delete publisher.secrets;
publisher.r2_buckets = publisher.r2_buckets.map((binding: { binding: string }) => ({
  binding: binding.binding,
  bucket_name: `${binding.binding.toLowerCase().replaceAll('_', '-')}-${suffix}`,
  remote: false,
}));
Object.assign(game, local, {
  name: gameName,
  main: path.join(root, 'workers/game/index.ts'),
  vars: { CONVEX_URL: gameConvexUrl, APPLICATION_ORIGIN: origin, GIT_SHA: 'local-isolated' },
});
const publisherConfig = path.join(runtime, 'publisher.json');
const gameConfig = path.join(runtime, 'game.json');
writeFileSync(publisherConfig, JSON.stringify(publisher, null, 2));
writeFileSync(gameConfig, JSON.stringify(game, null, 2));
writeFileSync(
  path.join(runtime, 'runtime.json'),
  JSON.stringify({ origin, convexUrl, convexSiteUrl, gameConvexUrl }, null, 2)
);
environment.WRANGLER_REGISTRY_PATH = path.join(runtime, 'registry');
console.log(`Isolated Play: ${origin}; Convex ${convexUrl}; game authorization ${gameConvexUrl}`);
console.log(`Local state/configuration: ${runtime}. Removed when this runner stops.`);

const child = spawn(
  node,
  [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'dev',
    '--local',
    '--config',
    publisherConfig,
    '--config',
    gameConfig,
    '--persist-to',
    path.join(runtime, 'state'),
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--inspector-port',
    '0',
  ],
  { cwd: runtime, env: environment, stdio: 'inherit' }
);
const stop = () => child.kill('SIGTERM');
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
  process.exitCode = exitCode;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  rmSync(runtime, { recursive: true, force: true });
}
