import { BoundedLoadRoom, boundedLoadFetch } from './load-limits.fixture';
import type { LoadLimits } from './load-limits.fixture';

function matchesController(request: Request, env: GameEnv, limits: LoadLimits) {
  const url = new URL(request.url);
  const expected = `/__play/games/${limits.gameId}/load-control`;
  return url.origin === env.APPLICATION_ORIGIN && url.pathname === expected && !url.search;
}

function controllerOperation(request: Request, env: GameEnv, limits: LoadLimits, secret: string) {
  if (!matchesController(request, env, limits)) {
    return null;
  }
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const encoder = new TextEncoder();
  if (!/^[a-f0-9]{64}$/.test(secret) || !/^[a-f0-9]{64}$/.test(supplied)) {
    return null;
  }
  if (!crypto.subtle.timingSafeEqual(encoder.encode(supplied), encoder.encode(secret))) {
    return null;
  }
  const operations = { GET: 'status', DELETE: 'stop' } as const;
  return operations[request.method as keyof typeof operations] ?? null;
}

/** Only a generated isolated entry imports this controller and supplies its own secret. */
export function controlledLoadFetch(
  request: Parameters<typeof boundedLoadFetch>[0],
  env: GameEnv,
  limits: LoadLimits,
  secret: string
) {
  if (controllerOperation(request, env, limits, secret)) {
    return env.GAME_ROOMS.getByName(limits.gameId).fetch(request);
  }
  return boundedLoadFetch(request, env, limits);
}

/** The controller can inspect or stop only the configured room, including after expiry. */
export class ControlledLoadRoom extends BoundedLoadRoom {
  constructor(
    ctx: DurableObjectState,
    env: GameEnv,
    private readonly configuration: LoadLimits,
    private readonly controlSecret: string
  ) {
    super(ctx, env, configuration);
  }

  override async fetch(request: Request): Promise<Response> {
    const operation = controllerOperation(request, this.env, this.configuration, this.controlSecret);
    if (!operation) {
      return super.fetch(request);
    }
    if (operation === 'stop') {
      await this.stopLoad();
    }
    const tables = this.ctx.storage.sql
      .exec<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name != 'load_budget'"
      )
      .toArray();
    const rows = Object.fromEntries(
      tables.map(({ name }) => [
        name,
        this.ctx.storage.sql
          .exec<{ count: number }>(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`)
          .one().count,
      ])
    );
    return Response.json({
      ...this.loadStatus(),
      gameId: this.configuration.gameId,
      gitSha: this.env.GIT_SHA,
      backendOrigin: this.env.CONVEX_URL,
      applicationOrigin: this.env.APPLICATION_ORIGIN,
      alarm: await this.ctx.storage.getAlarm(),
      rows,
    });
  }
}
