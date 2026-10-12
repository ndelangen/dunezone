/**
 * Spike for #2078: one Convex local backend in one Cloudflare Container, behind a fixed-name Durable Object.
 * The Durable Object fences writers: every container start gets a new generation number, Litestream replicates to gen-N/,
 * and a start restores from the newest generation that passed its readiness gate.
 */
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

export { S3Shim } from './s3';
import type { ShimProps } from './s3';

const OBJECT_NAME = 'convex-spike';
const READY_TIMEOUT_MS = 180_000;
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;

type ContainerApi = {
  running: boolean;
  start(options: { env: Record<string, string>; enableInternet: boolean; labels?: Record<string, string> }): void;
  monitor(): Promise<void>;
  signal(signal: number): void;
  inspect(): Promise<{ image: string; labels: Record<string, string> } | null>;
  setInactivityTimeout(ms: number): Promise<void>;
  getTcpPort(port: number): Fetcher;
  exec(cmd: string[], options?: Record<string, unknown>): Promise<{ output(): Promise<{ stdout: ArrayBuffer; stderr: ArrayBuffer; exitCode: number }> }>;
  interceptOutboundHttp(addr: string, binding: Fetcher): Promise<void>;
};

export class ConvexBackend extends DurableObject<Env> {
  private starting: Promise<number> | undefined;
  private readyGeneration: number | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS events (at INTEGER NOT NULL, generation INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL)'
    );
    if (this.container.running) {
      void ctx.blockConcurrencyWhile(async () => {
        // A throw here would reset the object; log it instead, and let the next boot re-register the intercept.
        try {
          await this.container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
          const generation = await this.runningGeneration();
          await this.intercept(generation);
          this.record(generation, 'object-restarted', 'container was already running');
        } catch (error) {
          console.error('[do] re-attaching to the running container failed', error);
        }
      });
    }
  }

  private get container() {
    return (this.ctx as unknown as { container: ContainerApi }).container;
  }

  private get kv() {
    return this.ctx.storage.kv;
  }

  private record(generation: number, kind: string, detail: string) {
    const tagged = `${detail} worker=${this.env.VERSION.id.slice(0, 8)}`;
    console.log(`[do] gen=${generation} ${kind} ${tagged}`);
    this.ctx.storage.sql.exec('INSERT INTO events VALUES (?, ?, ?, ?)', Date.now(), generation, kind, tagged);
  }

  private async runningGeneration() {
    const info = await this.container.inspect();
    return Number(info?.labels.generation ?? 0);
  }

  /** Routes the container's S3 traffic to the shim, which only accepts this generation's token and fences its writes. */
  private async intercept(generation: number) {
    // Generations started before tokens existed used the fixed key 'spike'.
    const token = this.kv.get<string>(`token:${generation}`) ?? 'spike';
    const props: ShimProps = { generation, token };
    const shim = (this.ctx as unknown as { exports: { S3Shim(options: { props: ShimProps }): Fetcher } }).exports.S3Shim({
      props,
    });
    await this.container.interceptOutboundHttp('r2.internal', shim);
    await this.container.interceptOutboundHttp('*.r2.internal', shim);
  }

  /** Starts the container if needed and resolves once Litestream has uploaded to this generation and the backend answers. */
  async ensureReady(): Promise<number> {
    if (this.readyGeneration !== undefined && this.container.running) {
      return this.readyGeneration;
    }
    this.starting ??= this.bootWithRetries().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  /** Cloudflare sometimes has no container instance to give right after a stop; each retry is a new generation. */
  private async bootWithRetries(): Promise<number> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.boot();
      } catch (error) {
        if (attempt >= 5 || this.container.running) {
          throw error;
        }
        console.warn(`[do] start attempt ${attempt} failed: ${String(error)}`);
        await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      }
    }
  }

  private async boot(): Promise<number> {
    const container = this.container;
    let generation: number;
    const requestedAt = Date.now();
    if (container.running) {
      generation = await this.runningGeneration();
    } else {
      generation = (this.kv.get<number>('generation') ?? 0) + 1;
      this.kv.put('generation', generation);
      this.kv.put(`token:${generation}`, crypto.randomUUID());
      // The bump must be durable before a container can write under gen-N/, or a crash could hand N to two writers.
      await this.ctx.storage.sync();
      const restoreGeneration = this.kv.get<number>('readyGeneration') ?? 0;
      await this.intercept(generation);
      const origin = this.env.CONVEX_ORIGIN;
      container.start({
        enableInternet: false,
        labels: { generation: String(generation) },
        env: {
          GENERATION: String(generation),
          RESTORE_GENERATION: String(restoreGeneration),
          INSTANCE_NAME: this.env.INSTANCE_NAME,
          INSTANCE_SECRET: this.env.INSTANCE_SECRET,
          CONVEX_ORIGIN: origin,
          CONVEX_SITE: `${origin}/http`,
          S3_ENDPOINT_URL: 'http://r2.internal',
          AWS_ACCESS_KEY_ID: this.kv.get<string>(`token:${generation}`)!,
          AWS_SECRET_ACCESS_KEY: 'spike',
          AWS_REGION: 'auto',
          AWS_S3_FORCE_PATH_STYLE: 'true',
          AWS_S3_DISABLE_SSE: 'true',
          AWS_S3_DISABLE_CHECKSUMS: 'true',
          LITESTREAM_BUCKET: 'convex-spike-litestream',
          LITESTREAM_SYNC_INTERVAL: this.env.LITESTREAM_SYNC_INTERVAL,
          S3_STORAGE_EXPORTS_BUCKET: 'convex-spike-exports',
          S3_STORAGE_SNAPSHOT_IMPORTS_BUCKET: 'convex-spike-imports',
          S3_STORAGE_MODULES_BUCKET: 'convex-spike-modules',
          S3_STORAGE_FILES_BUCKET: 'convex-spike-files',
          S3_STORAGE_SEARCH_BUCKET: 'convex-spike-search',
          ...(this.env.ISOLATE_ANALYZE_USER_TIMEOUT_SECONDS
            ? { ISOLATE_ANALYZE_USER_TIMEOUT_SECONDS: this.env.ISOLATE_ANALYZE_USER_TIMEOUT_SECONDS }
            : {}),
        },
      });
      this.record(generation, 'start', `restore_from=${restoreGeneration}`);
      this.ctx.waitUntil(
        container.monitor().then(
          () => this.stopped(generation, 'exited'),
          (error: unknown) => this.stopped(generation, `errored ${String(error)}`)
        )
      );
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const deadline = requestedAt + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!container.running) {
        throw new Error(`gen ${generation} stopped before it was ready`);
      }
      if (await this.isReady()) {
        this.readyGeneration = generation;
        if (generation > (this.kv.get<number>('readyGeneration') ?? 0)) {
          this.kv.put('readyGeneration', generation);
          await this.ctx.storage.sync();
        }
        this.record(generation, 'ready', `ms_since_request=${Date.now() - requestedAt}`);
        return generation;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`gen ${generation} not ready after ${READY_TIMEOUT_MS} ms`);
  }

  private stopped(generation: number, detail: string) {
    this.record(generation, 'stopped', detail);
    if (this.readyGeneration === generation) {
      this.readyGeneration = undefined;
    }
  }

  private async isReady() {
    try {
      const gate = await this.container.exec(['test', '-f', '/tmp/replica-ready']);
      if ((await gate.output()).exitCode !== 0) {
        return false;
      }
      const version = await this.container.getTcpPort(3210).fetch('http://container/version');
      return version.ok;
    } catch {
      return false;
    }
  }

  private async sh(script: string) {
    const process = await this.container.exec(['sh', '-c', script], { stderr: 'combined' });
    const output = await process.output();
    return new TextDecoder().decode(output.stdout);
  }

  async ping() {
    await this.keepAwake();
    const generation = await this.ensureReady();
    const version = await this.container.getTcpPort(3210).fetch('http://container/version');
    return { generation, status: version.status };
  }

  private async keepAwake() {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }

  /** Every minute: keeps the object awake and starts a new generation if the container stopped (host restart, rollout). */
  override async alarm() {
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
    if (!this.container.running) {
      this.record(this.kv.get<number>('generation') ?? 0, 'alarm-restart', 'container not running');
    }
    await this.ensureReady();
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/_spike/')) {
      return this.control(url, request);
    }
    try {
      await this.keepAwake();
      await this.ensureReady();
    } catch (error) {
      return new Response(`backend not ready: ${String(error)}`, { status: 503 });
    }
    // HTTP actions live on the site port under /http; everything else, including the sync WebSocket, goes to 3210.
    const site = url.pathname === '/http' || url.pathname.startsWith('/http/');
    const target = new URL(url);
    target.protocol = 'http:';
    target.host = 'container';
    if (site) {
      target.pathname = url.pathname.slice('/http'.length) || '/';
    }
    const forwarded = new Request(target, request);
    return this.container.getTcpPort(site ? 3211 : 3210).fetch(forwarded);
  }

  private async control(url: URL, request: Request): Promise<Response> {
    switch (url.pathname) {
      case '/_spike/status': {
        const events = this.ctx.storage.sql
          .exec('SELECT at, generation, kind, detail FROM events ORDER BY at DESC LIMIT 200')
          .toArray()
          .map((row) => ({ ...row, at: new Date(row.at as number).toISOString() }));
        return Response.json({
          running: this.container.running,
          runningGeneration: this.container.running ? await this.runningGeneration() : null,
          worker: this.env.VERSION.id,
          generation: this.kv.get('generation') ?? 0,
          readyGeneration: this.kv.get('readyGeneration') ?? 0,
          events,
        });
      }
      case '/_spike/start':
        await this.keepAwake();
        return Response.json({ generation: await this.ensureReady() });
      case '/_spike/stats':
        return new Response(
          await this.sh(
            'echo "rev=$IMAGE_REVISION"; date -u +%FT%TZ; cat /proc/loadavg; ' +
              'echo "memory.current $(cat /sys/fs/cgroup/memory.current 2>/dev/null)"; echo "memory.peak $(cat /sys/fs/cgroup/memory.peak 2>/dev/null)"; ' +
              'cat /sys/fs/cgroup/cpu.stat 2>/dev/null; nproc; free -m; ps -eo pid,rss,pcpu,etimes,args --sort=-rss | cut -c1-140 | head -8; ' +
              'ls -la /data; df -m /data | tail -1'
          )
        );
      case '/_spike/logs':
        return new Response(await this.sh(`tail -n ${Number(url.searchParams.get('n') ?? 200)} /tmp/spike.log`));
      case '/_spike/backend-env':
        return new Response(
          await this.sh("tr '\\0' '\\n' < /proc/$(pgrep -f '^convex-local-backend' | head -1)/environ | grep -E '^(ISOLATE|DATABASE|AWS_S3|LITESTREAM_SYNC)' ")
        );
      case '/_spike/sh': {
        // Debugging only: runs a shell snippet inside the container. The control token guards it.
        if (request.method !== 'POST') {
          return new Response('POST only', { status: 405 });
        }
        return new Response(await this.sh(await request.text()));
      }
      case '/_spike/bench': {
        // Times GET /version from inside the object, to separate the container hop from the Worker and network hops.
        const count = Number(url.searchParams.get('n') ?? 40);
        const parallel = Number(url.searchParams.get('parallel') ?? 1);
        const samples: number[] = [];
        const started = Date.now();
        let issued = 0;
        await Promise.all(
          Array.from({ length: parallel }, async () => {
            while (issued < count) {
              issued++;
              const t = performance.now();
              const response = await this.container.getTcpPort(3210).fetch('http://container/version');
              await response.arrayBuffer();
              samples.push(performance.now() - t);
            }
          })
        );
        samples.sort((a, b) => a - b);
        return Response.json({
          count,
          parallel,
          wallMs: Date.now() - started,
          p50: samples[Math.floor(samples.length / 2)],
          max: samples.at(-1),
        });
      }
      case '/_spike/purge': {
        // Teardown only: deletes up to 5,000 objects per bucket per call; repeat until every count is 0.
        if (request.method !== 'POST' || url.searchParams.get('confirm') !== 'delete-all-spike-data') {
          return new Response('POST with confirm=delete-all-spike-data', { status: 400 });
        }
        const deleted: Record<string, number> = {};
        for (const name of ['LITESTREAM', 'MODULES', 'FILES', 'SEARCH', 'EXPORTS', 'IMPORTS'] as const) {
          deleted[name] = 0;
          for (let round = 0; round < 5; round++) {
            const listed = await this.env[name].list({ limit: 1000 });
            if (listed.objects.length === 0) {
              break;
            }
            await this.env[name].delete(listed.objects.map((object) => object.key));
            deleted[name] += listed.objects.length;
          }
        }
        return Response.json(deleted);
      }
      case '/_spike/metrics':
        return new Response(await this.sh('curl -fsS http://127.0.0.1:9090/metrics | grep -E "^litestream_" | head -80'));
      case '/_spike/signal': {
        if (request.method !== 'POST') {
          return new Response('POST only', { status: 405 });
        }
        const signal = Number(url.searchParams.get('n') ?? 15);
        const generation = await this.runningGeneration();
        this.record(generation, 'signal', String(signal));
        this.container.signal(signal);
        return Response.json({ generation, signal });
      }
      default:
        return new Response('not found', { status: 404 });
    }
  }
}

function backend(env: Env) {
  return env.BACKEND.get(env.BACKEND.idFromName(OBJECT_NAME), { locationHint: 'weur' });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/_spike/')) {
      if (request.headers.get('authorization') !== `Bearer ${env.SPIKE_CONTROL_TOKEN}`) {
        return new Response('forbidden', { status: 403 });
      }
    }
    return backend(env).fetch(request);
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      backend(env)
        .ping()
        .then((result) => console.log(`[cron] gen=${result.generation} version=${result.status}`))
    );
  },
} satisfies ExportedHandler<Env>;
