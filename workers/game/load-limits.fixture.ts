import { z } from 'zod';

import { PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission';
import worker, { GameRoom } from './index';

const limitsSchema = z
  .object({
    gameId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    startsAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    messages: z.number().int().min(1).max(25_000),
    incomingBytes: z
      .number()
      .int()
      .min(1)
      .max(8 * 1024 * 1024),
    requests: z.number().int().min(1).max(1000),
    connections: z.number().int().min(1).max(44),
  })
  .strict()
  .refine((value) => value.expiresAt > value.startsAt && value.expiresAt - value.startsAt <= 20 * 60_000);

export type LoadLimits = z.infer<typeof limitsSchema>;
type Counter = 'messages' | 'incomingBytes' | 'requests';
type BudgetRow = {
  configuration: string;
  stopped: string | null;
  messages: number;
  incomingBytes: number;
  requests: number;
};

async function readBody(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const bytes = new Uint8Array(8192);
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return bytes.subarray(0, length);
    }
    if (length + value.byteLength > bytes.length) {
      return new Response('Load request body is too large.', { status: 413 });
    }
    bytes.set(value, length);
    length += value.byteLength;
  }
}

async function boundedBody(request: Request, expiresAt: number): Promise<Request | Response> {
  if (!request.body) {
    return request;
  }
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => {
    timer = setTimeout(
      () => resolve(new Response('Load request body timed out.', { status: 408 })),
      Math.max(0, Math.min(PLAY_REQUEST_TIMEOUT_MS, expiresAt - Date.now()))
    );
  });
  try {
    const body = await Promise.race([readBody(reader), deadline]);
    return body instanceof Response ? body : new Request(request, { method: request.method, body });
  } catch {
    return new Response('Load request body failed.', { status: 400 });
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    void reader.cancel().catch(() => undefined);
  }
}

function isLoadTarget(request: Request, env: GameEnv, limits: LoadLimits) {
  const url = new URL(request.url);
  const gamePath = `/__play/games/${limits.gameId}/`;
  return url.origin === env.APPLICATION_ORIGIN && url.pathname.startsWith(gamePath);
}

/** This entry is built only for an isolated fixture, never imported by the production Worker. */
export function boundedLoadFetch(request: Parameters<typeof worker.fetch>[0], env: GameEnv, supplied: LoadLimits) {
  const limits = limitsSchema.parse(supplied);
  if (!isLoadTarget(request, env, limits)) {
    return Promise.resolve(new Response('Load target refused.', { status: 403 }));
  }
  if (Date.now() < limits.startsAt || Date.now() >= limits.expiresAt) {
    return Promise.resolve(new Response('Load run is inactive.', { status: 410 }));
  }
  return worker.fetch(request, env);
}

/**
 * Isolated load runs retain the real GameRoom admission, commands and delivery.
 * Reserved input budgets survive restarts;
 * unused reservations are never refunded.
 * The expiry timer and alarm stop the room independently of the coordinator.
 */
export class BoundedLoadRoom extends GameRoom {
  private readonly limits: LoadLimits;
  private readonly available: Record<Counter, number> = { messages: 0, incomingBytes: 0, requests: 0 };
  private readonly active = new Set<Promise<unknown>>();
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private stopping: Promise<void> | undefined;
  private stopped: string | null;

  constructor(ctx: DurableObjectState, env: GameEnv, supplied: LoadLimits) {
    const limits = limitsSchema.parse(supplied);
    if (limits.startsAt > Date.now()) {
      throw new Error('A load budget must start when it is provisioned.');
    }
    super(ctx, env);
    this.limits = limits;
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS load_budget (id INTEGER PRIMARY KEY CHECK(id=1), configuration TEXT NOT NULL, stopped TEXT, messages INTEGER NOT NULL DEFAULT 0, incomingBytes INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0)'
    );
    const configuration = JSON.stringify(limits);
    ctx.storage.sql.exec('INSERT OR IGNORE INTO load_budget (id, configuration) VALUES (1, ?)', configuration);
    const stored = this.budget();
    if (stored.configuration !== configuration) {
      throw new Error('A load run cannot replace an existing budget.');
    }
    this.stopped = stored.stopped;
    ctx.blockConcurrencyWhile(async () => {
      if (this.stopped || Date.now() >= limits.expiresAt) {
        await this.stopLoad(this.stopped ?? 'expiry');
      } else {
        this.deadline = setTimeout(() => {
          this.ctx.waitUntil(this.stopLoad('expiry'));
        }, limits.expiresAt - Date.now());
        await this.armDeadline();
      }
    });
  }

  private budget() {
    return this.ctx.storage.sql.exec<BudgetRow>('SELECT * FROM load_budget WHERE id=1').one();
  }

  loadStatus() {
    const { configuration: _, ...budget } = this.budget();
    return { ...budget, expiresAt: this.limits.expiresAt, connections: this.ctx.getWebSockets().length };
  }

  private consume(counter: Counter, amount: number, reservation: number) {
    if (this.available[counter] < amount) {
      const remaining = this.limits[counter] - this.budget()[counter];
      const grant = Math.min(remaining, Math.max(reservation, amount - this.available[counter]));
      if (grant > 0) {
        /* The column comes only from Counter; values remain SQL bindings. */
        this.ctx.storage.sql.exec(`UPDATE load_budget SET ${counter} = ${counter} + ? WHERE id=1`, grant);
        this.available[counter] += grant;
      }
    }
    if (this.available[counter] < amount) {
      this.ctx.waitUntil(this.stopLoad(`${counter}-budget`));
      return false;
    }
    this.available[counter] -= amount;
    return true;
  }

  private running() {
    if (this.stopped || Date.now() < this.limits.startsAt) {
      return false;
    }
    if (Date.now() >= this.limits.expiresAt) {
      this.ctx.waitUntil(this.stopLoad('expiry'));
      return false;
    }
    return true;
  }

  private async armDeadline() {
    if (this.stopped) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const alarm = await this.ctx.storage.getAlarm();
    if (this.stopped) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (alarm === null || alarm > this.limits.expiresAt) {
      await this.ctx.storage.setAlarm(this.limits.expiresAt);
    }
  }

  private async track<T>(work: () => Promise<T>): Promise<T> {
    const operation = work();
    this.active.add(operation);
    try {
      return await operation;
    } finally {
      this.active.delete(operation);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (!isLoadTarget(request, this.env, this.limits)) {
      return new Response('Load target refused.', { status: 403 });
    }
    if (!this.running() || !this.consume('requests', 1, 1)) {
      return new Response('Load run stopped.', { status: 410 });
    }
    try {
      const response = await this.track(() => this.forward(request));
      return this.running() ? response : new Response('Load run stopped.', { status: 410 });
    } finally {
      await this.armDeadline();
    }
  }

  private async forward(request: Request): Promise<Response> {
    const bounded = await boundedBody(request, this.limits.expiresAt);
    if (bounded instanceof Response) {
      return bounded;
    }
    if (
      bounded.headers.get('Upgrade')?.toLowerCase() === 'websocket' &&
      this.ctx.getWebSockets().length >= this.limits.connections
    ) {
      return new Response('Load connection limit reached.', { status: 429 });
    }
    return this.running() ? super.fetch(bounded) : new Response('Load run stopped.', { status: 410 });
  }

  override async webSocketMessage(socket: WebSocket, input: string | ArrayBuffer) {
    if (!this.running() || !this.consume('messages', 1, 128)) {
      return;
    }
    if (typeof input !== 'string' || input.length > 8192) {
      await this.stopLoad('input-size');
      return;
    }
    const bytes = new TextEncoder().encode(input).byteLength;
    if (!this.consume('incomingBytes', bytes, 64 * 1024)) {
      return;
    }
    await this.track(() => super.webSocketMessage(socket, input));
  }

  override async alarm() {
    if (!this.running()) {
      await this.stopLoad(this.stopped ?? 'expiry');
      return;
    }
    try {
      await this.track(() => super.alarm());
    } finally {
      await this.armDeadline();
    }
  }

  /** The test controller can stop its own fixture through its dedicated namespace binding. */
  stopLoad(reason = 'operator-stop'): Promise<void> {
    if (this.stopping) {
      return this.stopping;
    }
    this.stopped ??= reason;
    this.ctx.storage.sql.exec('UPDATE load_budget SET stopped=? WHERE id=1', this.stopped);
    if (this.deadline !== undefined) {
      clearTimeout(this.deadline);
    }
    this.deadline = undefined;
    this.stopping = this.cleanStoppedRun().catch((error: unknown) => {
      this.stopping = undefined;
      throw error;
    });
    return this.stopping;
  }

  private async cleanStoppedRun() {
    await this.stopConnections();
    /* In-flight admission and provisioning must finish before their data is removed. */
    await Promise.allSettled(this.active);
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.transactionSync(() => {
      const tables = this.ctx.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name != 'load_budget'"
        )
        .toArray();
      for (const { name } of tables) {
        this.ctx.storage.sql.exec(`DELETE FROM "${name.replaceAll('"', '""')}"`);
      }
    });
  }
}
