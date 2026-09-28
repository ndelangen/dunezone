import { ControlledLoadRoom, controlledLoadFetch } from './load-controller.fixture';
import type { LoadLimits } from './load-limits.fixture';

/*
 * The room's test clock, as in `game-room.native.fixture.ts`, with the room's timeouts and intervals on it.
 * Moving the clock forward fires every timer it passes, in order, with `Date.now()` at each timer's own time, so a case never waits for a deadline on the real clock.
 * Between moves, a timer fires when the moved clock reaches it.
 * The clock only moves forward.
 * Alarms and `AbortSignal.timeout` stay on the real clock.
 */
const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

type Timer = { due: number; period: number | undefined; run: () => void; handle: number };
const timers = new Map<number, Timer>();
/* Far above the runtime's own ids, so clearing an id the runtime issued still reaches the runtime. */
let lastTimer = 2 ** 30;

function arm(id: number, timer: Timer) {
  timer.handle = realSetTimeout(() => fire(id), Math.max(0, timer.due - Date.now()));
}

function fire(id: number) {
  const timer = timers.get(id);
  if (!timer) {
    return;
  }
  realClearTimeout(timer.handle);
  if (timer.period === undefined) {
    timers.delete(id);
  } else {
    timer.due = Math.max(timer.due, Date.now()) + timer.period;
    arm(id, timer);
  }
  try {
    timer.run();
  } catch (error) {
    reportError(error);
  }
}

function schedule(run: () => void, delay: number | undefined, repeat: boolean) {
  const wait = Math.max(0, Number(delay) || 0);
  const timer: Timer = { due: Date.now() + wait, period: repeat ? Math.max(1, wait) : undefined, run, handle: 0 };
  const id = ++lastTimer;
  timers.set(id, timer);
  arm(id, timer);
  return id;
}

function cancel(id: number | null | undefined) {
  if (id == null) {
    return;
  }
  const timer = timers.get(id);
  if (timer) {
    realClearTimeout(timer.handle);
    timers.delete(id);
  } else {
    realClearTimeout(id);
  }
}

globalThis.setTimeout = ((run: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
  schedule(() => run(...args), delay, false)) as typeof setTimeout;
globalThis.setInterval = ((run: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) =>
  schedule(() => run(...args), delay, true)) as typeof setInterval;
globalThis.clearTimeout = cancel as typeof clearTimeout;
globalThis.clearInterval = cancel as typeof clearInterval;

function moveClock(offset: number) {
  const target = realNow() + Math.max(clockOffset, offset);
  /* A timer set during the move waits for the real clock, so a timer that sets another cannot hold the move open. */
  const passed = new Set(timers.keys());
  while (true) {
    let next: { id: number; due: number } | undefined;
    for (const [id, timer] of timers) {
      if (passed.has(id) && timer.due <= target && (!next || timer.due < next.due)) {
        next = { id, due: timer.due };
      }
    }
    if (!next) {
      break;
    }
    clockOffset = Math.max(clockOffset, next.due - realNow());
    fire(next.id);
  }
  clockOffset = Math.max(clockOffset, offset);
  for (const [id, timer] of timers) {
    realClearTimeout(timer.handle);
    arm(id, timer);
  }
}

type NativeLoadEnv = GameEnv & { LOAD_LIMITS: string };
const limits = (env: NativeLoadEnv) => JSON.parse(env.LOAD_LIMITS) as LoadLimits;
const secret = 'd'.repeat(64);

/** Native tests alone expose the fixture controller over HTTP. */
export class GameRoom extends ControlledLoadRoom {
  constructor(ctx: DurableObjectState, env: NativeLoadEnv) {
    super(ctx, env, limits(env), secret);
  }

  override async fetch(request: Request): Promise<Response> {
    /* A request can move the clock as it arrives, so the time it finds does not depend on how long it took to arrive. */
    const arrival = request.headers.get('X-Native-Test-Now');
    if (arrival !== null) {
      moveClock(Number(arrival) - realNow());
    }
    const url = new URL(request.url);
    if (url.pathname === '/native-test/clock') {
      moveClock(Number(url.searchParams.get('offset')));
      return Response.json({ now: Date.now() });
    }
    if (url.pathname === '/native-test/alarm') {
      const scheduledAt = await this.ctx.storage.getAlarm();
      if (request.method === 'POST' && scheduledAt !== null) {
        /* Workerd fires an alarm at its time on the real clock, which the room's clock does not move. */
        await this.ctx.storage.setAlarm(realNow());
      }
      return Response.json({ scheduledAt, observedAt: Date.now() });
    }
    if (url.pathname === '/native-test/load-stop') {
      await this.stopLoad();
    } else if (url.pathname !== '/native-test/load-status') {
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
