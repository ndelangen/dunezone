import { cpus, platform, arch, totalmem } from 'node:os';

import { chromium } from 'playwright';

/** Browser instrumentation observes the real page's message handler after it applies each projection. */
export async function browsers({ origin, backend, onMessage, onBytes, stopping, directory }) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  const contexts = [];
  const reports = [];
  const hardware = {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    browser: browser.version(),
  };
  return {
    async connect(peer) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
        serviceWorkers: 'block',
      });
      contexts.push(context);
      const allowed = new Set([origin, backend]);
      const report = {
        peer: peer.index,
        role: peer.role,
        viewport: { width: 1440, height: 1000 },
        blockedOrigins: [],
        errors: [],
        imageLoads: [],
      };
      reports.push(report);
      await context.route(
        (url) => !allowed.has(url.origin),
        async (route) => {
          report.blockedOrigins.push(new URL(route.request().url()).origin);
          await route.abort();
        }
      );
      await context.routeWebSocket(
        (url) => !allowed.has(url.origin.replace('ws:', 'http:')),
        async (socket) => {
          report.blockedOrigins.push(new URL(socket.url()).origin);
          await socket.close();
        }
      );
      const page = await context.newPage();
      page.on('request', (request) => {
        if (!allowed.has(new URL(request.url()).origin)) {
          report.blockedOrigins.push(new URL(request.url()).origin);
          void page.close();
        }
      });
      peer.page = page;
      peer.responses = new Map();
      peer.socket = {
        terminate() {
          peer.browserCapture ??= page
            .evaluate(() => ({
              ...window.loadMeasurements,
              memoryAfter: performance.memory
                ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
                : null,
              revision: document.querySelector('[data-revision]')?.getAttribute('data-revision'),
              connection: document.querySelector('[data-connection]')?.getAttribute('data-connection'),
            }))
            .then((result) => Object.assign(report, result))
            .catch((error) => report.errors.push(error.message))
            .finally(() => page.close().catch(() => {}));
        },
      };
      page.on('pageerror', (error) => report.errors.push(error.message));
      await page.exposeFunction('loadAppliedMessage', (text) => {
        if (!stopping()) {
          onMessage(peer, JSON.parse(text));
        }
      });
      page.on('websocket', (socket) => {
        if (!socket.url().includes('/__play/games/')) {
          return;
        }
        socket.on('framesent', (frame) => onBytes(peer, 'sent', Buffer.byteLength(frame.payload)));
        socket.on('framereceived', (frame) => onBytes(peer, 'received', Buffer.byteLength(frame.payload)));
      });
      await context.addInitScript(() => {
        window.loadMeasurements = { frames: [], longTasks: [], started: false };
        let prototype = WebSocket.prototype;
        while (prototype && !Object.getOwnPropertyDescriptor(prototype, 'onmessage')) {
          prototype = Object.getPrototypeOf(prototype);
        }
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'onmessage');
        Object.defineProperty(WebSocket.prototype, 'onmessage', {
          configurable: true,
          get: descriptor.get,
          set(handler) {
            const observed = this.url.includes('/__play/games/');
            descriptor.set.call(
              this,
              observed && handler
                ? function (event) {
                    handler.call(this, event);
                    void window.loadAppliedMessage(event.data);
                  }
                : handler
            );
          },
        });
        let last;
        const frame = (now) => {
          const state = window.loadMeasurements;
          if (state.started && last !== undefined && state.frames.length < 30_000) {
            state.frames.push(now - last);
          }
          last = now;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
        new PerformanceObserver((list) => {
          if (window.loadMeasurements.started) {
            window.loadMeasurements.longTasks.push(
              ...list.getEntries().map((entry) => ({ start: entry.startTime, duration: entry.duration }))
            );
          }
        }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(`${origin}/auth/login`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Email', { exact: true }).fill(peer.user.email);
      await page.getByLabel('Password', { exact: true }).fill(peer.user.password);
      await page.getByTestId('local-auth-submit').click();
      await page.getByRole('heading', { name: "You're signed in" }).waitFor();
      /* HTTP interception disables Chromium's cache; requests remain observed and DNS is loopback-only. */
      await context.unrouteAll();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      for (const cached of [false, true]) {
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
        if (!cached) {
          await cdp.send('Network.clearBrowserCache');
        }
        await page.goto(`${origin}/play/hosted`, { waitUntil: 'domcontentloaded' });
        await page.locator('[data-connection="authorized"]').waitFor();
        await page.waitForTimeout(1000);
        report.imageLoads.push({
          cached,
          entries: await page.evaluate(() =>
            performance
              .getEntriesByType('resource')
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
      await page.screenshot({ path: `${directory}/browser-${peer.index}.png` });
      report.memoryBefore = await page.evaluate(() =>
        performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
          : null
      );
      report.gpu = await page.evaluate(() => {
        const gl = document.querySelector('canvas')?.getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return extension
          ? {
              vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),
              renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL),
            }
          : null;
      });
      peer.browserReport = report;
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
    async collect(peers) {
      await Promise.all(peers.map((peer) => peer.browserCapture));
      for (const peer of peers.filter((candidate) => candidate.page && !candidate.page.isClosed())) {
        Object.assign(
          peer.browserReport,
          await peer.page.evaluate(() => ({
            ...window.loadMeasurements,
            memoryAfter: performance.memory
              ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
              : null,
            revision: document.querySelector('[data-revision]')?.getAttribute('data-revision'),
            connection: document.querySelector('[data-connection]')?.getAttribute('data-connection'),
          }))
        );
      }
      return {
        hardware,
        recipients: reports,
        timing:
          'Samples reach the coordinator after the real WebSocket onmessage handler returns. Playwright transport and instrumentation overhead are included; frame intervals are recorded separately.',
      };
    },
    close() {
      return browser.close();
    },
  };
}
