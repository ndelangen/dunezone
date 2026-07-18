import path from 'node:path';

import { chromium } from 'playwright';

import { proofFaction } from '../../src/app/capture/proofFaction';
import { inspectChromiumPdf } from './pdf-inspection';
import { PUBLISHER_RENDERER_CONTRACT } from './renderer-contract';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const publisherDist = path.join(repositoryRoot, 'workers/publisher/dist');
const payload = {
  factionId: 'k17publisherContractFaction',
  slug: 'publisher-contract-faction',
  faction: proofFaction,
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

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: PUBLISHER_RENDERER_CONTRACT.viewport,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
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

  await page.goto(`http://127.0.0.1:${server.port}/publisher-capture.html`, {
    waitUntil: 'domcontentloaded',
  });
  const marker = page.locator('#capture-status');
  await marker.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () =>
      document.querySelector('#capture-status')?.getAttribute('data-capture-state') !== 'loading'
  );
  const state = await marker.getAttribute('data-capture-state');
  const detail = (await marker.textContent()) ?? '';
  invariant(state === 'ready', `Production-shaped capture reported ${state}: ${detail}`);
  invariant(
    (await marker.getAttribute('data-payload-hash')) === payloadHash,
    'Production-shaped capture did not expose the exact payload hash'
  );
  invariant(errors.length === 0, `Production-shaped capture emitted errors: ${errors.join(' | ')}`);

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
      PUBLISHER_RENDERER_CONTRACT.pdf.pageSizeToleranceMm &&
      Math.abs(inspection.pageHeightMm - PUBLISHER_RENDERER_CONTRACT.pdf.pageHeightMm) <=
        PUBLISHER_RENDERER_CONTRACT.pdf.pageSizeToleranceMm,
    `Production-shaped capture produced ${inspection.pageWidthMm.toFixed(2)} mm x ${inspection.pageHeightMm.toFixed(2)} mm pages`
  );
  console.log(
    `Publisher narrow-contract Chromium regression passed: ${inspection.pageCount} pages, ${pdf.byteLength} bytes`
  );
} finally {
  await browser.close();
  server.stop(true);
}
