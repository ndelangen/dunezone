import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { chromium, type Page } from 'playwright';

import {
  redactPublisherResource,
  sanitizePublisherDiagnostic,
} from '../../src/app/capture/publisher-diagnostics';
import { inspectChromiumPdf } from '../publisher/pdf-inspection';
import { EXPECTED_PAGE_COUNT, EXPECTED_PAGE_HEIGHT_MM, EXPECTED_PAGE_WIDTH_MM } from './core';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const referenceDirectory = path.join(repositoryRoot, 'tmp/asset-publishing-proof');
const proofPdfPath = path.join(referenceDirectory, 'local-proof.pdf');
const storybookPdfPath = path.join(referenceDirectory, 'storybook-reference.pdf');

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function startStaticServer(root: string) {
  return Bun.serve({
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      if (relativePath.split('/').includes('..')) {
        return new Response('Not found', { status: 404 });
      }
      const file = Bun.file(path.join(root, relativePath));
      if (!(await file.exists())) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(file);
    },
  });
}

async function waitForCaptureResult(page: Page): Promise<{ state: string | null; detail: string }> {
  const marker = page.locator('#capture-status');
  await marker.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () =>
      document.querySelector('#capture-status')?.getAttribute('data-capture-state') !== 'loading'
  );
  return {
    state: await marker.getAttribute('data-capture-state'),
    detail: (await marker.textContent()) ?? '',
  };
}

async function assertPdfContract(bytes: Uint8Array, label: string): Promise<void> {
  const inspection = await inspectChromiumPdf(bytes);
  invariant(
    inspection.pageCount === EXPECTED_PAGE_COUNT,
    `${label} produced ${inspection.pageCount} pages`
  );
  invariant(
    Math.abs(inspection.pageWidthMm - EXPECTED_PAGE_WIDTH_MM) <= 0.5,
    `${label} page width was ${inspection.pageWidthMm.toFixed(2)} mm`
  );
  invariant(
    Math.abs(inspection.pageHeightMm - EXPECTED_PAGE_HEIGHT_MM) <= 0.5,
    `${label} page height was ${inspection.pageHeightMm.toFixed(2)} mm`
  );
  console.log(
    `${label}: ${inspection.pageCount} pages at ${inspection.pageWidthMm.toFixed(2)} mm x ${inspection.pageHeightMm.toFixed(2)} mm`
  );
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
}

async function writeReferencePdf(bytes: Uint8Array, outputPath: string, identity: string) {
  await Bun.write(outputPath, bytes);
  console.log(
    JSON.stringify({
      event: 'asset_publishing_proof_local_reference',
      identity,
      path: outputPath,
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
    })
  );
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${sanitizePublisherDiagnostic(message.text())}`);
    }
  });
  page.on('pageerror', (error) =>
    errors.push(`page: ${sanitizePublisherDiagnostic(error.message)}`)
  );
  page.on('requestfailed', (request) =>
    errors.push(
      `request: ${redactPublisherResource(request.url())}: ${sanitizePublisherDiagnostic(
        request.failure()?.errorText ?? 'failed'
      )}`
    )
  );
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`response: ${response.status()} ${redactPublisherResource(response.url())}`);
    }
  });
  return errors;
}

async function waitForStorybookAssets(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;

    const decodeImage = async (source: string, label: string) => {
      const image = new Image();
      image.src = new URL(source, document.baseURI).href;
      try {
        await image.decode();
      } catch (error) {
        throw new Error(`${label} failed to decode: ${String(error)}`);
      }
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        throw new Error(`${label} decoded without dimensions`);
      }
    };

    await Promise.all(
      Array.from(document.images).map(async (image, index) => {
        if (!image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener(
              'error',
              () => reject(new Error(`img ${index} failed to load`)),
              {
                once: true,
              }
            );
          });
        }
        try {
          await image.decode();
        } catch (error) {
          throw new Error(`img ${index} failed to decode: ${String(error)}`);
        }
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          throw new Error(`img ${index} decoded without dimensions`);
        }
      })
    );

    const svgImages = Array.from(document.querySelectorAll('svg image'));
    await Promise.all(
      svgImages.map(async (image, index) => {
        const source = image.getAttribute('href') ?? image.getAttribute('xlink:href');
        if (!source) throw new Error(`svg image ${index} has no href`);
        await decodeImage(source, `svg image ${index}`);
      })
    );

    const externalUses = Array.from(document.querySelectorAll('svg use'))
      .map((use, index) => ({
        index,
        href: use.getAttribute('href') ?? use.getAttribute('xlink:href'),
      }))
      .filter((entry): entry is { index: number; href: string } =>
        Boolean(entry.href && !entry.href.startsWith('#'))
      );
    await Promise.all(
      externalUses.map(async ({ href, index }) => {
        const resource = new URL(href, document.baseURI);
        const symbolId = resource.hash.slice(1);
        resource.hash = '';
        const response = await fetch(resource, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`svg use ${index} returned ${response.status} for ${resource.href}`);
        }
        const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
        if (parsed.documentElement.localName !== 'svg' || parsed.querySelector('parsererror')) {
          throw new Error(`svg use ${index} returned malformed SVG for ${resource.href}`);
        }
        const decodedSymbolId = decodeURIComponent(symbolId);
        if (decodedSymbolId && !parsed.getElementById(decodedSymbolId)) {
          throw new Error(`svg use ${index} is missing #${decodedSymbolId} in ${resource.href}`);
        }
      })
    );
  });
}

async function checkStorybookBrokenArtwork(
  storybookOrigin: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>
) {
  const page = await browser.newPage();
  try {
    await page.route('**/image/leader/official/jessica.png', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: 'not a png' });
    });
    await page.goto(
      new URL('/iframe.html?id=faction-sheet--preview&viewMode=story', storybookOrigin).href,
      { waitUntil: 'networkidle' }
    );
    let failure = '';
    try {
      await waitForStorybookAssets(page);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    invariant(failure.length > 0, 'Storybook readiness accepted corrupt HTTP-200 artwork');
  } finally {
    await page.close();
  }
}

async function checkCorruptSvgImage(
  proofOrigin: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>
) {
  const page = await browser.newPage();
  try {
    await page.route('**/image/leader/official/jessica.png', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/png', body: 'not a png' });
    });
    await page.goto(new URL('/proof-capture.html', proofOrigin).href, {
      waitUntil: 'domcontentloaded',
    });
    const result = await waitForCaptureResult(page);
    invariant(
      result.state === 'error',
      `Corrupt SVG image was reported as ${result.state}: ${result.detail}`
    );
  } finally {
    await page.close();
  }
}

async function checkCorruptExternalUse(
  proofOrigin: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>
) {
  const page = await browser.newPage();
  try {
    await page.route('**/vector/logo/atreides.svg', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'not an svg' });
    });
    await page.goto(new URL('/proof-capture.html', proofOrigin).href, {
      waitUntil: 'domcontentloaded',
    });
    const result = await waitForCaptureResult(page);
    invariant(
      result.state === 'error',
      `Corrupt external SVG use was reported as ${result.state}: ${result.detail}`
    );
  } finally {
    await page.close();
  }
}

async function checkProofPdf(
  proofOrigin: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>
) {
  const page = await browser.newPage({ viewport: { width: 2_100, height: 2_970 } });
  try {
    await page.goto(new URL('/proof-capture.html', proofOrigin).href, {
      waitUntil: 'domcontentloaded',
    });
    const result = await waitForCaptureResult(page);
    invariant(
      result.state === 'ready',
      `Valid proof capture was reported as ${result.state}: ${result.detail}`
    );
    await page.emulateMedia({ media: 'print' });
    const bodyMargin = await page.evaluate(() => getComputedStyle(document.body).margin);
    invariant(bodyMargin === '0px', `Proof body margin was ${bodyMargin}`);

    const expectedWidthPx = (EXPECTED_PAGE_WIDTH_MM * 96) / 25.4;
    const expectedHeightPx = (EXPECTED_PAGE_HEIGHT_MM * 96) / 25.4;
    const pages = page.locator('[data-faction-sheet-page]');
    invariant(
      (await pages.count()) === EXPECTED_PAGE_COUNT,
      'Proof DOM did not contain exactly two pages'
    );
    for (let index = 0; index < EXPECTED_PAGE_COUNT; index += 1) {
      const bounds = await pages.nth(index).boundingBox();
      invariant(bounds, `Proof DOM page ${index + 1} had no bounds`);
      invariant(
        Math.abs(bounds.x) <= 0.5 &&
          Math.abs(bounds.y - index * expectedHeightPx) <= 0.5 &&
          Math.abs(bounds.width - expectedWidthPx) <= 0.5 &&
          Math.abs(bounds.height - expectedHeightPx) <= 0.5,
        `Proof DOM page ${index + 1} bounds were ${JSON.stringify(bounds)}`
      );
    }

    invariant(
      (await page.locator('[aria-label="Troop Token"]').count()) > 0,
      'Preview troops with omitted optional modifiers must render as bounded TroopToken components'
    );

    const bytes = await page.pdf({
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      printBackground: true,
    });
    await assertPdfContract(bytes, 'Proof capture');
    await writeReferencePdf(bytes, proofPdfPath, 'proof-capture.html representative faction');
  } finally {
    await page.close();
  }
}

async function checkStorybookPdf(
  storybookOrigin: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>
) {
  const page = await browser.newPage();
  const errors = collectPageErrors(page);
  try {
    await page.goto(
      new URL('/iframe.html?id=faction-sheet--preview&viewMode=story', storybookOrigin).href,
      { waitUntil: 'networkidle' }
    );
    await waitForStorybookAssets(page);
    const renderedPages = await page.locator('[data-faction-sheet-page]').count();
    invariant(
      renderedPages === EXPECTED_PAGE_COUNT,
      `Storybook preview rendered ${renderedPages} faction-sheet pages: ${errors.join(' | ') || 'no browser error was reported'}`
    );
    invariant(errors.length === 0, `Storybook emitted errors before PDF: ${errors.join(' | ')}`);
    const bytes = await page.pdf({
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      printBackground: true,
    });
    await assertPdfContract(bytes, 'Storybook faction-sheet--preview');
    invariant(errors.length === 0, `Storybook emitted errors: ${errors.join(' | ')}`);
    await writeReferencePdf(
      bytes,
      storybookPdfPath,
      'storybook faction-sheet--preview representative faction'
    );
  } finally {
    await page.close();
  }
}

const proofServer = startStaticServer(path.join(repositoryRoot, 'workers/proof/dist'));
const storybookServer = startStaticServer(path.join(repositoryRoot, 'storybook-static'));
const browser = await chromium.launch({ headless: true });
try {
  rmSync(referenceDirectory, { recursive: true, force: true });
  mkdirSync(referenceDirectory, { recursive: true });
  await checkCorruptSvgImage(proofServer.url.href, browser);
  await checkCorruptExternalUse(proofServer.url.href, browser);
  await checkProofPdf(proofServer.url.href, browser);
  await checkStorybookBrokenArtwork(storybookServer.url.href, browser);
  await checkStorybookPdf(storybookServer.url.href, browser);
  console.log(
    `Proof readiness, page bounds, PDF integrity, Storybook asset readiness, and references passed: ${referenceDirectory}`
  );
} finally {
  await browser.close();
  proofServer.stop(true);
  storybookServer.stop(true);
}
