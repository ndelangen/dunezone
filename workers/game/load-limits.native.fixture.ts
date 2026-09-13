import { BoundedLoadRoom, boundedLoadFetch } from './load-limits.fixture';
import type { LoadLimits } from './load-limits.fixture';

type NativeLoadEnv = GameEnv & { LOAD_LIMITS: string };
const limits = (env: NativeLoadEnv) => JSON.parse(env.LOAD_LIMITS) as LoadLimits;

/** Native tests alone expose the fixture controller over HTTP. */
export class GameRoom extends BoundedLoadRoom {
  constructor(ctx: DurableObjectState, env: NativeLoadEnv) {
    super(ctx, env, limits(env));
  }

  override async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/native-test/load-stop') {
      await this.stopLoad();
    } else if (pathname !== '/native-test/load-status') {
      return super.fetch(request);
    }
    return Response.json({
      ...this.loadStatus(),
      alarm: await this.ctx.storage.getAlarm(),
      gameRows: this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM metadata').one().count,
      historyRows: this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM history').one().count,
    });
  }
}

export default {
  fetch(request: Parameters<typeof boundedLoadFetch>[0], env: NativeLoadEnv) {
    return boundedLoadFetch(request, env, limits(env));
  },
};
