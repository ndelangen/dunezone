import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';

import type * as captureAssets from './captureSettle';

let browser: Browser;
let bundle: string;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeAll(async () => {
  const built = await build({
    entryPoints: [new URL('./captureSettle.ts', import.meta.url).pathname],
    bundle: true,
    format: 'iife',
    globalName: 'captureAssets',
    write: false,
  });
  bundle = built.outputFiles[0].text;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function startCapture(page: Page, html: string, beforeSettle?: () => Promise<void>) {
  /* The tracker has to be running before anything paints, exactly as the capture entry starts it before rendering. */
  await page.addInitScript({
    content: `${bundle};globalThis.captureAssets = captureAssets;captureAssets.trackArtworkPaint();`,
  });
  await page.route('https://capture.invalid/page', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://capture.invalid/page', { waitUntil: 'domcontentloaded' });
  await beforeSettle?.();
  await page.evaluate(() => {
    const runtime = window as typeof window & {
      captureAssets: typeof captureAssets;
      captureAbort: AbortController;
    };
    runtime.captureAbort = new AbortController();
    document.body.dataset.capture = 'loading';
    void runtime.captureAssets.settleCaptureAssets(runtime.captureAbort.signal).then(
      () => {
        document.body.dataset.capture = 'ready';
      },
      (error: unknown) => {
        document.body.dataset.capture = 'error';
        document.body.dataset.error = error instanceof Error ? error.message : String(error);
      }
    );
  });
}

async function afterPaint(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
}

test('capture waits for CSS artwork before accepting the painted frame', async () => {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  const gate = deferred();
  const requested = deferred();
  await page.route('https://capture.invalid/art.svg', async (route) => {
    requested.resolve();
    await gate.promise;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/></svg>',
    });
  });
  try {
    await startCapture(
      page,
      '<body style="margin:0"><div style="width:200px;height:200px;background:white url(https://capture.invalid/art.svg)"></div></body>'
    );
    await requested.promise;
    await afterPaint(page);
    expect(await page.locator('body').getAttribute('data-capture')).toBe('loading');
    gate.resolve();
    await page.waitForFunction(() => document.body.dataset.capture === 'ready');
    expect(await page.locator('body').getAttribute('data-error')).toBeNull();
  } finally {
    gate.resolve();
    await page.close();
  }
});

test('capture rescans artwork added by an image load callback before becoming ready', async () => {
  const page = await browser.newPage();
  const first = deferred();
  const late = deferred();
  const requested = deferred();
  await page.route('https://capture.invalid/first.svg', async (route) => {
    await first.promise;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>',
    });
  });
  await page.route('https://capture.invalid/late.svg', async (route) => {
    requested.resolve();
    await late.promise;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    });
  });
  try {
    await startCapture(
      page,
      `<style>
      .late { background-image:url('https://capture.invalid/late.svg'); }
      </style><img src="https://capture.invalid/first.svg" onload="this.parentElement.classList.add('late')">`
    );
    first.resolve();
    await requested.promise;
    await afterPaint(page);
    expect(await page.locator('body').getAttribute('data-capture')).toBe('loading');
    late.resolve();
    await page.waitForFunction(() => document.body.dataset.capture === 'ready');
  } finally {
    first.resolve();
    late.resolve();
    await page.close();
  }
});

test('the capture deadline aborts an unfinished CSS image instead of accepting it', async () => {
  const page = await browser.newPage();
  const gate = deferred();
  const requested = deferred();
  await page.route('https://capture.invalid/stalled.svg', async (route) => {
    requested.resolve();
    await gate.promise;
    await route.abort();
  });
  try {
    await startCapture(
      page,
      '<div style="width:200px;height:200px;background-image:url(https://capture.invalid/stalled.svg)"></div>'
    );
    await requested.promise;
    await page.evaluate(() => {
      const controller = Reflect.get(window, 'captureAbort') as AbortController;
      controller.abort(new Error('Capture deadline expired'));
    });
    await page.waitForFunction(() => document.body.dataset.capture !== 'loading');
    expect(await page.locator('body').getAttribute('data-capture')).toBe('error');
    expect(await page.locator('body').getAttribute('data-error')).toBe('Capture deadline expired');
  } finally {
    gate.resolve();
    await page.close();
  }
});

test.each([
  '<div style="width:200px;height:200px;background-image:url(https://capture.invalid/broken.webp)"></div>',
  '<style>div::after { content:""; background-image:url(https://capture.invalid/broken.webp); }</style><div></div>',
  '<div style="mask-image:url(https://capture.invalid/broken.webp)"></div>',
  '<div style="border-image-source:url(https://capture.invalid/broken.webp)"></div>',
  '<div style="content:url(https://capture.invalid/broken.webp)"></div>',
])('capture refuses undecodable CSS artwork in %s', async (html) => {
  const page = await browser.newPage();
  await page.route('https://capture.invalid/broken.webp', (route) =>
    route.fulfill({ contentType: 'image/webp', body: 'not an image' })
  );
  try {
    await startCapture(page, html);
    await page.waitForFunction(() => document.body.dataset.capture !== 'loading');
    expect(await page.locator('body').getAttribute('data-capture')).toBe('error');
  } finally {
    await page.close();
  }
});

test('capture refuses CSS artwork that its element never painted, even when a later fetch decodes', async () => {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  let requests = 0;
  await page.route('https://capture.invalid/frame.svg', async (route) => {
    requests += 1;
    await route.fulfill(
      requests === 1
        ? { contentType: 'image/svg+xml', body: 'not an image' }
        : {
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/></svg>',
          }
    );
  });
  try {
    /* Settlement starts only after the element's own fetch has failed, so its refetch is a separate request. */
    await startCapture(
      page,
      '<body style="margin:0"><div style="width:200px;height:200px;background-image:url(https://capture.invalid/frame.svg)"></div></body>',
      async () => {
        await page.waitForFunction(() =>
          performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/frame.svg'))
        );
        await afterPaint(page);
      }
    );
    await page.waitForFunction(() => document.body.dataset.capture !== 'loading');
    expect({ state: await page.locator('body').getAttribute('data-capture'), requests }).toEqual({
      state: 'error',
      requests: 2,
    });
    expect(await page.locator('body').getAttribute('data-error')).toContain('never painted');
  } finally {
    await page.close();
  }
}, 15_000);

test('capture settles artwork added while it waits for artwork to paint', async () => {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  const late = deferred();
  const secondFrameRequest = deferred();
  let frameRequests = 0;
  const svg = (fill: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${fill}"/></svg>`;
  /* The element's own fetch does not decode, the settlement refetch does, so readiness waits for a paint that never comes. */
  await page.route('https://capture.invalid/frame.svg', async (route) => {
    frameRequests += 1;
    if (frameRequests === 2) {
      secondFrameRequest.resolve();
    }
    await route.fulfill({ contentType: 'image/svg+xml', body: frameRequests === 1 ? 'not an image' : svg('red') });
  });
  await page.route('https://capture.invalid/replacement.svg', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: svg('green') })
  );
  await page.route('https://capture.invalid/late-image.svg', async (route) => {
    await late.promise;
    await route.fulfill({ contentType: 'image/svg+xml', body: svg('blue') });
  });
  try {
    await startCapture(
      page,
      '<body style="margin:0"><div id="frame" style="width:200px;height:200px;background-image:url(https://capture.invalid/frame.svg)"></div></body>',
      async () => {
        await page.waitForFunction(() =>
          performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('/frame.svg'))
        );
        await afterPaint(page);
      }
    );
    await secondFrameRequest.promise;
    await afterPaint(page);
    /* Inside the paint wait: new artwork paints the frame, and an image arrives that settlement has not seen. */
    await page.evaluate(() => {
      document.querySelector<HTMLElement>('#frame')!.style.backgroundImage =
        'url(https://capture.invalid/replacement.svg)';
      const image = document.createElement('img');
      image.src = 'https://capture.invalid/late-image.svg';
      document.body.append(image);
    });
    for (let frame = 0; frame < 10; frame += 1) {
      await afterPaint(page);
    }
    expect(await page.locator('body').getAttribute('data-capture')).toBe('loading');
    late.resolve();
    await page.waitForFunction(() => document.body.dataset.capture !== 'loading');
    expect(await page.locator('body').getAttribute('data-capture')).toBe('ready');
  } finally {
    late.resolve();
    await page.close();
  }
});

test('capture does not wait for a background layer sized to nothing', async () => {
  const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
  await page.route('https://capture.invalid/art.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/></svg>',
    })
  );
  try {
    await startCapture(
      page,
      '<body style="margin:0"><div style="width:200px;height:200px;background:url(https://capture.invalid/art.svg) 0 0 / 0 0 no-repeat"></div></body>'
    );
    await page.waitForFunction(() => document.body.dataset.capture !== 'loading', undefined, { timeout: 3000 });
    expect(await page.locator('body').getAttribute('data-capture')).toBe('ready');
  } finally {
    await page.close();
  }
});
