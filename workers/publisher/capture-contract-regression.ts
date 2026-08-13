import path from 'node:path';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

import { CAPTURE_PROTOCOL } from '../../src/shared/asset-publishing/capture-protocol';
import { assetPublishingFaction } from '../../src/shared/factions/fixtures/assetPublishingFaction';
import { assertCapturePhysicalBounds, waitForCaptureMarkerSettled } from './capture-lifecycle';
import { inspectChromiumPdf } from './pdf-inspection';
import { RECOMPRESSED_PDF_MAX_BYTES, recompressCapturedPdf } from './pdf-recompress';
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
  if (!condition) {
    throw new Error(message);
  }
}

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === CAPTURE_PROTOCOL.paths.snapshot) {
      return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
    }
    const relative =
      pathname === '/'
        ? CAPTURE_PROTOCOL.paths.bundleDocument.slice(1)
        : pathname.replace(/^\/+/, '');
    if (relative.split('/').includes('..')) {
      return new Response('Not found', { status: 404 });
    }
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

function waitForCaptureResult(page: Page) {
  return waitForCaptureMarkerSettled(page);
}

async function openCapture(page: Page) {
  await page.goto(`http://127.0.0.1:${server.port}${CAPTURE_PROTOCOL.paths.bundleDocument}`, {
    waitUntil: 'domcontentloaded',
  });
  return await waitForCaptureResult(page);
}

async function checkCorruptSvgImage(browser: Browser): Promise<void> {
  const page = await newPublisherPage(browser);
  try {
    // The sheet resolves keys to variant URLs (Train 1b): corrupt the variant it loads.
    await page.route('**/image/leader/official/jessica-large.webp', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/webp', body: 'not a webp' });
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
  await assertCapturePhysicalBounds(page);
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
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
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
    /*
     * In-place recompression contract (#257): portraits downsampled losslessly, page structure
     * untouched, output under the published ceiling.
     */
    const recompressed = await recompressCapturedPdf(new Uint8Array(pdf));
    invariant(
      recompressed.swappedImages > 0,
      'Recompression must downsample the fixture leader portraits'
    );
    invariant(
      recompressed.bytesAfter < recompressed.bytesBefore &&
        recompressed.bytesAfter <= RECOMPRESSED_PDF_MAX_BYTES,
      `Recompressed PDF is ${recompressed.bytesAfter} bytes`
    );
    const recompressedInspection = await inspectChromiumPdf(recompressed.bytes);
    invariant(
      recompressedInspection.pageCount === PUBLISHER_RENDERER_CONTRACT.pdf.pageCount,
      'Recompression must preserve the page count'
    );
    console.log(
      `Publisher capture Chromium regression passed: ${inspection.pageCount} pages, ${pdf.byteLength} bytes (recompressed: ${recompressed.bytesAfter} bytes, ${recompressed.swappedImages} images)`
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
