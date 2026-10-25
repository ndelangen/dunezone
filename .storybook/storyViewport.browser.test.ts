import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { expect, test } from 'vite-plus/test';
import { createVitest } from 'vite-plus/test/node';

import type * as StoryViewport from './storyViewport';

async function viewportFixture() {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('./storyViewport.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'viewportProof',
  });
  const server = createServer((request, response) => {
    if (request.url === '/viewport.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(compiled.outputFiles[0]!.text);
    } else if (request.url === '/parent') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><iframe src="/" style="width:1200px;height:900px;border:0"></iframe>');
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><body><script src="/viewport.js"></script>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The viewport fixture has no HTTP port.');
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function controlledViewport(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const control = await browser.newBrowserCDPSession();
  const { browserContextIds } = await control.send('Target.getBrowserContexts');
  const [page] = await Promise.all([
    context.waitForEvent('page'),
    control.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: browserContextIds[0],
      enableBeginFrameControl: true,
    }),
  ]);
  const frames = await context.newCDPSession(page);
  return { page, draw: () => frames.send('HeadlessExperimental.beginFrame') };
}

/* Chromium reports that BeginFrameControl is unsupported on macOS; CI's browser_checks job runs Linux. */
test.skipIf(process.platform !== 'linux')(
  'story readiness waits for a real, delayed Chromium resize event',
  async () => {
    const fixture = await viewportFixture();
    try {
      const browser = await chromium.launch({
        args: ['--enable-begin-frame-control', '--run-all-compositor-stages-before-draw'],
      });
      try {
        const { page, draw } = await controlledViewport(browser);
        await page.goto(fixture.origin);
        await draw();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
          document.body.dataset.viewport = 'pending';
          const proof = (window as unknown as { viewportProof: typeof StoryViewport }).viewportProof;
          void proof.settleStoryViewport().then(() => {
            document.body.dataset.viewport = 'ready';
          });
        });
        expect(await page.locator('body').getAttribute('data-viewport')).toBe('pending');
        await draw();
        await expect.poll(() => page.locator('body').getAttribute('data-viewport')).toBe('ready');
      } finally {
        await browser.close();
      }
    } finally {
      await fixture.close();
    }
  },
  15_000
);

test.skipIf(process.platform !== 'linux')(
  'a file boundary does not resize a desktop story while native frames are stalled',
  async () => {
    const vitest = await createVitest({ config: 'vitest.storybook.config.ts', watch: false });
    const viewport = vitest.projects[0]!.config.browser.viewport;
    await vitest.close();
    const fixture = await viewportFixture();
    try {
      const browser = await chromium.launch({
        args: ['--enable-begin-frame-control', '--run-all-compositor-stages-before-draw'],
      });
      try {
        const { page, draw } = await controlledViewport(browser);
        await page.goto(`${fixture.origin}/parent`);
        const story = page.frames()[1]!;
        await story.waitForFunction(() => 'viewportProof' in window);
        await draw();
        /* Vitest resets this viewport between files; the addon then selects its 1200x900 default. */
        const resize = async (size: { width: number; height: number }) => {
          await page.evaluate(({ width, height }) => {
            const iframe = document.querySelector('iframe')!;
            iframe.style.width = `${width}px`;
            iframe.style.height = `${height}px`;
          }, size);
          await page.setViewportSize(size);
        };
        await resize(viewport);
        await draw();
        await resize({ width: 1200, height: 900 });
        /* No further native frame is available. A needless mobile reset leaves readiness blocked. */
        await story.evaluate(async () => {
          const proof = (window as unknown as { viewportProof: typeof StoryViewport }).viewportProof;
          await proof.settleStoryViewport();
        });
        expect(page.viewportSize()).toEqual({ width: 1200, height: 900 });
      } finally {
        await browser.close();
      }
    } finally {
      await fixture.close();
    }
  },
  15_000
);
