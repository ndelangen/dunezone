import path from 'node:path';

import { type Browser, chromium, type Page } from 'playwright';

import { assetPublishingFaction } from '../../src/game/fixtures/assetPublishingFaction';
import { inspectChromiumPdf } from './pdf-inspection';
import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const publisherDist = path.join(repositoryRoot, 'workers/publisher/dist');
const payload = {
  factionId: 'k17publisherContractFaction',
  slug: 'publisher-contract-faction',
  faction: assetPublishingFaction,
};
const payloadHash = new Bun.CryptoHasher('sha256').update(JSON.stringify(payload)).digest('hex');
const snapshot = {
  ok: true,
  payload,
  payloadHash,
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === '/__asset-publisher/snapshot') {
      return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
    }
    const relative = pathname === '/' ? 'publisher-capture.html' : pathname.replace(/^\/+/, '');
    if (relative.split('/').includes('..')) return new Response('Not found', { status: 404 });
    const file = Bun.file(path.join(publisherDist, relative));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});

function newPublisherPage(browser: Browser): Promise<Page> {
  return browser.newPage({
    viewport: PUBLISHER_RENDERER_CONTRACT.viewport,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
}

async function waitForCaptureResult(page: Page): Promise<{
  detail: string;
  payloadHash: string | null;
  state: string | null;
}> {
  const marker = page.locator('#capture-status');
  await marker.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () =>
      document.querySelector('#capture-status')?.getAttribute('data-capture-state') !== 'loading'
  );
  return {
    detail: (await marker.textContent()) ?? '',
    payloadHash: await marker.getAttribute('data-payload-hash'),
    state: await marker.getAttribute('data-capture-state'),
  };
}

async function openCapture(page: Page) {
  await page.goto(`http://127.0.0.1:${server.port}/publisher-capture.html`, {
    waitUntil: 'domcontentloaded',
  });
  return await waitForCaptureResult(page);
}

async function checkCorruptSvgImage(browser: Browser): Promise<void> {
  const page = await newPublisherPage(browser);
  try {
    await page.route('**/image/leader/official/jessica.png', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: 'not a png' });
    });
    const result = await openCapture(page);
    invariant(
      result.state === 'error',
      `Corrupt SVG image was reported as ${result.state}: ${result.detail}`
    );
  } finally {
    await page.close();
  }
}

async function checkCorruptExternalUse(browser: Browser): Promise<void> {
  const page = await newPublisherPage(browser);
  try {
    await page.route('**/vector/logo/atreides.svg', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'not an svg' });
    });
    const result = await openCapture(page);
    invariant(
      result.state === 'error',
      `Corrupt external SVG use was reported as ${result.state}: ${result.detail}`
    );
  } finally {
    await page.close();
  }
}

async function assertPageBounds(page: Page): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  const bodyMargin = await page.evaluate(() => getComputedStyle(document.body).margin);
  invariant(bodyMargin === '0px', `Publisher body margin was ${bodyMargin}`);

  const expectedWidthPx = (PUBLISHER_RENDERER_CONTRACT.pdf.pageWidthMm * 96) / 25.4;
  const expectedHeightPx = (PUBLISHER_RENDERER_CONTRACT.pdf.pageHeightMm * 96) / 25.4;
  const pages = page.locator('[data-faction-sheet-page]');
  invariant(
    (await pages.count()) === PUBLISHER_RENDERER_CONTRACT.pdf.pageCount,
    `Production-shaped capture did not render exactly ${PUBLISHER_RENDERER_CONTRACT.pdf.pageCount} pages`
  );
  for (let index = 0; index < PUBLISHER_RENDERER_CONTRACT.pdf.pageCount; index += 1) {
    const bounds = await pages.nth(index).boundingBox();
    invariant(bounds, `Production-shaped capture page ${index + 1} had no bounds`);
    invariant(
      Math.abs(bounds.x) <= 0.5 &&
        Math.abs(bounds.y - index * expectedHeightPx) <= 0.5 &&
        Math.abs(bounds.width - expectedWidthPx) <= 0.5 &&
        Math.abs(bounds.height - expectedHeightPx) <= 0.5,
      `Production-shaped capture page ${index + 1} bounds were ${JSON.stringify(bounds)}`
    );
  }
  invariant(
    (await page.locator('[aria-label="Troop Token"]').count()) > 0,
    'Production-shaped capture must render omitted troop modifiers as bounded TroopToken components'
  );
  invariant(
    (await page.locator('[data-faction-starting-spice]').textContent())?.trim() ===
      'Starting spice: 10',
    'Production-shaped capture must render structured starting spice'
  );
  const troopSupplies = page.locator('[data-faction-troop-supply]');
  invariant(
    (await troopSupplies.count()) === 1 &&
      (await troopSupplies.first().textContent())?.trim() === '×20',
    'Production-shaped capture must render one physical-supply count per troop type'
  );
}

async function checkPublisherPdf(browser: Browser): Promise<void> {
  const page = await newPublisherPage(browser);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    errors.push(`request: ${request.method()} ${new URL(request.url()).pathname}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`response: ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });

  try {
    const result = await openCapture(page);
    invariant(
      result.state === 'ready',
      `Production-shaped capture reported ${result.state}: ${result.detail}`
    );
    invariant(
      result.payloadHash === payloadHash,
      'Production-shaped capture did not expose the exact payload hash'
    );
    invariant(
      errors.length === 0,
      `Production-shaped capture emitted errors: ${errors.join(' | ')}`
    );
    await assertPageBounds(page);

    const pdf = await page.pdf({
      displayHeaderFooter: PUBLISHER_RENDERER_CONTRACT.pdf.displayHeaderFooter,
      margin: PUBLISHER_RENDERER_CONTRACT.pdf.marginMm,
      preferCSSPageSize: PUBLISHER_RENDERER_CONTRACT.pdf.preferCssPageSize,
      printBackground: PUBLISHER_RENDERER_CONTRACT.pdf.printBackground,
    });
    const inspection = await inspectChromiumPdf(pdf);
    invariant(
      inspection.pageCount === PUBLISHER_RENDERER_CONTRACT.pdf.pageCount,
      `Production-shaped capture produced ${inspection.pageCount} pages`
    );
    invariant(
      Math.abs(inspection.pageWidthMm - PUBLISHER_RENDERER_CONTRACT.pdf.pageWidthMm) <=
        PUBLISHER_RENDERER_CONTRACT.pdf.pageSizeToleranceMm,
      `Production-shaped capture produced ${inspection.pageWidthMm.toFixed(2)} mm wide pages`
    );
    invariant(
      Math.abs(inspection.pageHeightMm - PUBLISHER_RENDERER_CONTRACT.pdf.pageHeightMm) <=
        PUBLISHER_RENDERER_CONTRACT.pdf.pageSizeToleranceMm,
      `Production-shaped capture produced ${inspection.pageHeightMm.toFixed(2)} mm tall pages`
    );
    console.log(
      `Publisher capture Chromium regression passed: ${inspection.pageCount} pages, ${pdf.byteLength} bytes`
    );
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  await checkCorruptSvgImage(browser);
  await checkCorruptExternalUse(browser);
  await checkPublisherPdf(browser);
} finally {
  await browser.close();
  server.stop(true);
}
