import { ControlledLoadRoom, controlledLoadFetch } from './load-controller.fixture';
import type { LoadLimits } from './load-limits.fixture';

type NativeLoadEnv = GameEnv & { LOAD_LIMITS: string };
const limits = (env: NativeLoadEnv) => JSON.parse(env.LOAD_LIMITS) as LoadLimits;
const secret = 'd'.repeat(64);

/** Native tests alone expose the fixture controller over HTTP. */
export class GameRoom extends ControlledLoadRoom {
  constructor(ctx: DurableObjectState, env: NativeLoadEnv) {
    super(ctx, env, limits(env), secret);
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
  fetch(request: Parameters<typeof controlledLoadFetch>[0], env: NativeLoadEnv) {
    return controlledLoadFetch(request, env, limits(env), secret);
  },
};
