import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hostedRunSchema, hostedTargetSchema } from '../../src/shared/play/loadTarget.ts';
import { privateOutputDirectory } from './hosted-paths.ts';

const root = path.resolve(import.meta.dirname, '../..');

function gameEntry(limits) {
  return `import { ControlledLoadRoom, controlledLoadFetch } from ${JSON.stringify(path.join(root, 'workers/game/load-controller.fixture'))};
const limits = ${JSON.stringify(limits)};
type LoadEnv = GameEnv & { LOAD_CONTROL_SECRET: string };
export class GameRoom extends ControlledLoadRoom {
  constructor(ctx: DurableObjectState, env: LoadEnv) { super(ctx, env, limits, env.LOAD_CONTROL_SECRET); }
}
export default { fetch(request: Request, env: LoadEnv) {
  if (!/^[a-f0-9]{64}$/.test(env.LOAD_CONTROL_SECRET ?? '')) { return new Response('Load controller unavailable.', { status: 503 }); }
  return controlledLoadFetch(request, env, limits, env.LOAD_CONTROL_SECRET);
} };
`;
}

function applicationEntry(target, run, gameId) {
  return `import publisher from ${JSON.stringify(path.join(root, 'workers/publisher/index'))};
const origin = ${JSON.stringify(target.applicationOrigin)};
const gamePath = ${JSON.stringify(`/__play/games/${gameId}/`)};
export default { async fetch(request: Request, env: Parameters<typeof publisher.fetch>[1], ctx: ExecutionContext) {
  const url = new URL(request.url);
  if (url.origin !== origin) { return new Response('Load target refused.', { status: 403 }); }
  if (url.pathname === gamePath + 'load-control') { return publisher.fetch(request, env, ctx); }
  if (Date.now() < ${run.startsAt} || Date.now() >= ${run.expiresAt}) { return new Response('Load run is inactive.', { status: 410 }); }
  if (url.pathname.startsWith(gamePath)) { return publisher.fetch(request, env, ctx); }
  if (url.pathname.startsWith('/__') || url.pathname.startsWith('/published') || url.pathname.startsWith('/user-images') || url.pathname.startsWith('/publisher-capture')) {
    return new Response('Not found.', { status: 404 });
  }
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  response.headers.set('Content-Security-Policy', ${JSON.stringify(`connect-src 'self' ${target.backendOrigin} ${target.backendOrigin.replace('https:', 'wss:')}; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'`)});
  return response;
} };
`;
}

/** Generates dedicated Workers with no production routes, storage, publishing credentials or scheduled work. */
export async function prepareHostedWorkers({
  directory: requested,
  target: suppliedTarget,
  run: suppliedRun,
  gameId,
  assets,
}) {
  const target = hostedTargetSchema.parse(suppliedTarget);
  const run = hostedRunSchema.parse(suppliedRun);
  const revision = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(revision, target.sourceRevision, 'Worker sources must use the selected revision.');
  assert.match(gameId, /^[a-zA-Z0-9_-]{1,128}$/);
  const directory = await privateOutputDirectory(requested);
  const limits = {
    gameId,
    startsAt: run.startsAt,
    expiresAt: run.expiresAt,
    messages: 25_000,
    incomingBytes: 8 * 1024 * 1024,
    requests: 1000,
    connections: 44,
  };
  const common = {
    compatibility_date: '2026-08-11',
    compatibility_flags: ['nodejs_compat'],
    preview_urls: false,
    routes: [],
    triggers: { crons: [] },
    limits: { cpu_ms: 1000 },
    observability: { enabled: false },
    version_metadata: { binding: 'CF_VERSION_METADATA' },
  };
  const game = {
    ...common,
    name: target.gameWorker,
    main: './game.ts',
    workers_dev: false,
    durable_objects: {
      bindings: [{ name: 'GAME_ROOMS', class_name: 'GameRoom' }],
    },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['GameRoom'] }],
    secrets: { required: ['LOAD_CONTROL_SECRET'] },
    vars: {
      CONVEX_URL: target.backendOrigin,
      APPLICATION_ORIGIN: target.applicationOrigin,
      GIT_SHA: target.sourceRevision,
    },
  };
  const application = {
    ...common,
    name: new URL(target.applicationOrigin).hostname.split('.')[0],
    main: './application.ts',
    workers_dev: true,
    alias: {
      'rulebook-html-renderer-runtime': path.join(
        root,
        'workers/publisher/runtime-generated/rulebook-html-renderer.mjs'
      ),
    },
    assets: {
      directory: path.resolve(assets),
      binding: 'ASSETS',
      html_handling: 'none',
      not_found_handling: 'single-page-application',
      run_worker_first: true,
    },
    services: [{ binding: 'GAME_SERVICE', service: target.gameWorker }],
    ratelimits: [
      {
        name: 'PLAY_INGRESS_RATE_LIMIT',
        namespace_id: '11050001',
        simple: { limit: 120, period: 10 },
      },
    ],
    rules: [
      { type: 'Text', globs: ['**/*.css'], fallthrough: true },
      { type: 'Data', globs: ['**/*.woff2'], fallthrough: true },
    ],
    vars: {
      PUBLIC_BASE_URL: target.applicationOrigin,
      GIT_SHA: target.sourceRevision,
    },
  };
  await writeFile(path.join(directory, 'game.ts'), gameEntry(limits));
  await writeFile(path.join(directory, 'application.ts'), applicationEntry(target, run, gameId));
  await writeFile(path.join(directory, 'game.jsonc'), JSON.stringify(game, null, 2));
  await writeFile(path.join(directory, 'application.jsonc'), JSON.stringify(application, null, 2));
  return {
    limits,
    gameConfig: path.join(directory, 'game.jsonc'),
    applicationConfig: path.join(directory, 'application.jsonc'),
  };
}
