import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { cpus, platform, arch, totalmem } from 'node:os';

import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';

import { KEEPALIVE_PING, KEEPALIVE_PONG } from '../../src/shared/play/protocol.ts';
import type { ServerMessage } from '../../src/shared/play/protocol.ts';
import { signIn } from '../lib/synthetic-accounts.ts';
import type { Recipient } from './types.ts';
import { readServerMessage } from './wire.ts';

type FrameMeasurements = { frames: number[]; longTasks: { start: number; duration: number }[]; started: boolean };
type HeapMemory = { used: number; total: number };
type BrowserSnapshot = FrameMeasurements & { memoryAfter: HeapMemory | null; revision?: string; connection?: string };
export type BrowserReport = Partial<BrowserSnapshot> & {
  peer: number;
  role?: string;
  viewport: { width: number; height: number };
  blockedOrigins: string[];
  errors: string[];
  imageLoads: {
    cached: boolean;
    entries: { path: string; transferSize: number; encodedBodySize: number; duration: number }[];
  }[];
  memoryBefore?: HeapMemory | null;
  gpu?: { vendor: unknown; renderer: unknown } | null;
};
export type BrowserPeer = Recipient & {
  user: { email: string; password: string };
  page?: Page;
  responses: Map<string, ServerMessage>;
  socket?: { terminate(): void };
  browserCapture?: Promise<void>;
  browserReport?: BrowserReport;
};
declare global {
  interface Window {
    loadMeasurements: FrameMeasurements;
    loadAppliedMessage(text: string): Promise<void>;
  }
  interface Performance {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
  }
}
function snapshot() {
  return {
    ...window.loadMeasurements,
    memoryAfter: performance.memory
      ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
      : null,
    revision: document.querySelector<HTMLElement>('[data-revision]')?.dataset.revision,
    connection: document.querySelector<HTMLElement>('[data-connection]')?.dataset.connection,
  };
}

function observeMessages() {
  let prototype: object | null = WebSocket.prototype;
  while (prototype && !Object.getOwnPropertyDescriptor(prototype, 'onmessage')) {
    prototype = Object.getPrototypeOf(prototype);
  }
  if (!prototype) {
    throw new Error('WebSocket has no onmessage descriptor.');
  }
  /* The accessors are typed as detached functions that take the socket as `this`, which is how they are called below. */
  const descriptor:
    | {
        get?: (this: WebSocket) => WebSocket['onmessage'];
        set?: (this: WebSocket, handler: WebSocket['onmessage']) => void;
      }
    | undefined = Object.getOwnPropertyDescriptor(prototype, 'onmessage');
  if (!descriptor?.get || !descriptor.set) {
    throw new Error('WebSocket onmessage descriptor is incomplete.');
  }
  const getter = descriptor.get;
  const setter = descriptor.set;
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    configurable: true,
    get: getter,
    set(this: WebSocket, handler: WebSocket['onmessage']) {
      if (!handler) {
        setter.call(this, handler);
        return;
      }
      if (!this.url.includes('/__play/games/')) {
        setter.call(this, handler);
        return;
      }
      setter.call(this, function (this: WebSocket, event: MessageEvent<string>) {
        handler.call(this, event);
        void window.loadAppliedMessage(event.data);
      });
    },
  });
}

function observeFrames() {
  window.loadMeasurements = { frames: [], longTasks: [], started: false };
  let last: number | undefined;
  const frame = (now: number) => {
    const state = window.loadMeasurements;
    const previous = last;
    last = now;
    requestAnimationFrame(frame);
    if (!state.started) {
      return;
    }
    if (previous === undefined) {
      return;
    }
    if (state.frames.length < 30_000) {
      state.frames.push(now - previous);
    }
  };
  requestAnimationFrame(frame);
  new PerformanceObserver((list) => {
    if (window.loadMeasurements.started) {
      window.loadMeasurements.longTasks.push(
        ...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))
      );
    }
  }).observe({ type: 'longtask', buffered: true });
}

async function measureImages(
  context: BrowserContext,
  page: Page,
  origin: string,
  gameId: string,
  report: BrowserReport
) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  for (const cached of [false, true]) {
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
    if (!cached) {
      await cdp.send('Network.clearBrowserCache');
    }
    await page.goto(`${origin}/play/${gameId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-connection="authorized"]').waitFor();
    await page.waitForTimeout(1000);
    report.imageLoads.push({
      cached,
      entries: await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
          .filter((entry) => entry.initiatorType === 'img' || /\.(png|jpg|webp|svg)(\?|$)/.test(entry.name))
          .map((entry) => ({
            path: new URL(entry.name).pathname,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            duration: entry.duration,
          }))
      ),
    });
  }
}

/** A socket is allowed when its origin, read as the HTTP origin it upgrades from, is one of the two allowed. */
export function socketOriginAllowed(allowed: ReadonlySet<string>, socketUrl: string | URL) {
  return allowed.has(new URL(socketUrl).origin.replace(/^ws/, 'http'));
}

async function guardedPage(context: BrowserContext, allowed: ReadonlySet<string>, report: BrowserReport) {
  context.on('request', (request: { url: () => string | URL }) => {
    if (!allowed.has(new URL(request.url()).origin)) {
      report.blockedOrigins.push(new URL(request.url()).origin);
    }
  });
  await context.routeWebSocket(
    (url: string | URL) => !socketOriginAllowed(allowed, url),
    async (socket) => {
      report.blockedOrigins.push(new URL(socket.url()).origin);
      await socket.close();
    }
  );
  const page = await context.newPage();
  return page;
}

/** Allowed origins stay direct and cacheable; the browser sends every other target to a proxy that never forwards. */
async function originGuard(origins: string[]) {
  const blockedOrigins: string[] = [];
  const blockedTunnels: (string | undefined)[] = [];
  const deny = createServer((request, response) => {
    assert.ok(request.url);
    blockedOrigins.push(new URL(request.url).origin);
    response.writeHead(403);
    response.end('Blocked origin.');
  });
  deny.on('connect', (request, socket) => {
    blockedTunnels.push(request.url);
    socket.destroy();
  });
  deny.on('upgrade', (request, socket) => {
    assert.ok(request.url);
    blockedOrigins.push(new URL(request.url).origin);
    socket.destroy();
  });
  deny.listen(0, '127.0.0.1');
  await once(deny, 'listening');
  const bypass = origins.flatMap((origin: string | URL) => {
    const { protocol, hostname, port } = new URL(origin);
    const address = `${hostname}:${port || (protocol === 'https:' ? 443 : 80)}`;
    return [`${protocol}//${address}`, `${protocol.replace(/^http/, 'ws')}//${address}`];
  });
  const address = deny.address();
  assert.ok(address && typeof address === 'object');
  return {
    blockedOrigins,
    blockedTunnels,
    proxy: {
      server: `http://127.0.0.1:${address.port}`,
      /* Chromium otherwise lets all loopback origins bypass the proxy, including other ports. */
      bypass: ['<-loopback>', ...bypass].join(','),
    },
    close: () => new Promise<void>((resolve, reject) => deny.close((error) => (error ? reject(error) : resolve()))),
  };
}

/**
 * Browser instrumentation observes the real page's message handler after it applies each projection.
 * The browser can resolve only the two allowed hosts, and every request to another origin is blocked and recorded.
 */
export async function browsers<P extends BrowserPeer>({
  origin,
  backend,
  gameId,
  onMessage,
  onBytes,
  stopping,
  directory,
}: {
  origin: string;
  backend: string;
  gameId: () => string;
  onMessage: (peer: P, message: ServerMessage) => void;
  onBytes: (peer: P, direction: 'sent' | 'received', bytes: number, keepalive: boolean) => void;
  stopping: () => boolean;
  directory: string;
}) {
  const resolvable = [...new Set([origin, backend].map((value) => new URL(value).hostname))];
  const resolverRules = ['MAP * ~NOTFOUND', ...resolvable.map((host) => `EXCLUDE ${host}`)].join(', ');
  const guard = await originGuard([origin, backend]);
  const browser = await chromium
    .launch({
      headless: true,
      args: [`--host-resolver-rules=${resolverRules}`],
      proxy: guard.proxy,
    })
    .catch(async (error) => {
      await guard.close();
      throw error;
    });
  const contexts: BrowserContext[] = [];
  const reports: BrowserReport[] = [];
  const hardware = {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    browser: browser.version(),
  };
  return {
    resolverRules,
    async connect(peer: P) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      contexts.push(context);
      const allowed = new Set([origin, backend]);
      const report: BrowserReport = {
        peer: peer.index,
        role: peer.role,
        viewport: { width: 1440, height: 1000 },
        blockedOrigins: [],
        errors: [],
        imageLoads: [],
      };
      reports.push(report);
      peer.browserReport = report;
      const page = await guardedPage(context, allowed, report);
      peer.page = page;
      peer.responses = new Map<string, ServerMessage>();
      peer.socket = {
        terminate() {
          peer.browserCapture ??= page
            .evaluate(snapshot)
            .then((result) => {
              Object.assign(report, result);
            })
            .catch((error: unknown) => {
              report.errors.push(error instanceof Error ? error.message : String(error));
            })
            .finally(() => page.close().catch(() => {}));
        },
      };
      page.on('pageerror', (error) => report.errors.push(error.message));
      await page.exposeFunction('loadAppliedMessage', (text: string) => {
        if (!stopping() && text !== KEEPALIVE_PONG) {
          onMessage(peer, readServerMessage(text));
        }
      });
      page.on('websocket', (socket) => {
        if (!socket.url().includes('/__play/games/')) {
          return;
        }
        const keepalive = (frame: { payload: { toString: () => string } }) =>
          [KEEPALIVE_PING, KEEPALIVE_PONG].includes(frame.payload.toString());
        socket.on('framesent', (frame: { payload: string | Buffer }) =>
          onBytes(peer, 'sent', Buffer.byteLength(frame.payload), keepalive(frame))
        );
        socket.on('framereceived', (frame: { payload: string | Buffer }) =>
          onBytes(peer, 'received', Buffer.byteLength(frame.payload), keepalive(frame))
        );
      });
      await context.addInitScript(observeFrames);
      await context.addInitScript(observeMessages);
      await signIn(page, origin, peer.user, `peer ${peer.index}`);
      await measureImages(context, page, origin, gameId(), report);
      await page.screenshot({ path: `${directory}/browser-${peer.index}.png` });
      report.memoryBefore = await page.evaluate(() =>
        performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
          : null
      );
      report.gpu = await page.evaluate(() => {
        const gl = document.querySelector('canvas')?.getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl && extension
          ? {
              vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),
              renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
            }
          : null;
      });
    },
    async start() {
      for (const context of contexts) {
        for (const page of context.pages()) {
          await page.evaluate(() => {
            window.loadMeasurements.started = true;
          });
        }
      }
    },
    async collect(peers: P[]) {
      await Promise.all(peers.flatMap((peer) => peer.browserCapture ?? []));
      for (const peer of peers.filter((candidate) => candidate.page && !candidate.page.isClosed())) {
        try {
          assert.ok(peer.browserReport);
          Object.assign(peer.browserReport, await peer.page!.evaluate(snapshot));
        } catch (error) {
          peer.browserReport?.errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      return {
        hardware,
        resolverRules,
        blockedOrigins: guard.blockedOrigins,
        blockedTunnels: guard.blockedTunnels,
        recipients: reports,
        timing:
          'Samples reach the coordinator after the real WebSocket onmessage handler returns. Playwright transport and instrumentation overhead are included; frame intervals are recorded separately.',
      };
    },
    async close() {
      try {
        await browser.close();
      } finally {
        await guard.close();
      }
    },
  };
}
