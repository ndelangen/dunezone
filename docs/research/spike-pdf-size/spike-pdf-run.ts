// PDF-size spike runner (wayfinder #256). Untracked scratch harness — mirrors
// workers/publisher/capture-contract-regression.ts server + browser.ts capture options.
import path from 'node:path';

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';

import { assetPublishingFaction } from './src/game/fixtures/assetPublishingFaction';
import { PUBLISHER_RENDERER_CONTRACT } from './workers/publisher/renderer-contract';

const repoRoot = import.meta.dirname;
const publisherDist = path.join(repoRoot, 'workers/publisher/dist');
const publicDir = path.join(repoRoot, 'public');
const spikeDir =
  '/private/tmp/claude-501/-Users-me-Projects-Dune-dunezone--claude-worktrees-image-optimization-web-pdf-298fff/3b954549-5ba3-4782-b17f-7f59ef03554c/scratchpad/spike';
const variantsDir = path.join(spikeDir, 'variants');
const outDir = path.join(spikeDir, 'out');

const payload = {
  factionId: 'k17spikeFaction',
  slug: 'spike-faction',
  faction: assetPublishingFaction,
};
const payloadHash = new Bun.CryptoHasher('sha256').update(JSON.stringify(payload)).digest('hex');
const snapshot = { ok: true, payload, payloadHash };

type Cell = {
  name: string;
  overrides?: Record<string, string>;
  stripPatternFilter?: boolean;
  injectCss?: string;
  deviceScaleFactor?: number;
  screenshotPages?: boolean;
};

const TEX = '/image/texture/021.jpg';
const NO_FX_CSS = `
  * { filter: none !important; box-shadow: none !important; text-shadow: none !important; }
`;

const CELLS: Cell[] = [
  { name: 'baseline', screenshotPages: true },
  { name: 'tex-w1280', overrides: { [TEX]: `${variantsDir}/021-w1280.jpg` } },
  { name: 'tex-w640', overrides: { [TEX]: `${variantsDir}/021-w640.jpg` } },
  {
    name: 'baked-full',
    overrides: { [TEX]: `${variantsDir}/021-baked-full.jpg` },
    stripPatternFilter: true,
  },
  {
    name: 'baked-w1280',
    overrides: { [TEX]: `${variantsDir}/021-baked-w1280.jpg` },
    stripPatternFilter: true,
    screenshotPages: true,
  },
  {
    name: 'baked-w640',
    overrides: { [TEX]: `${variantsDir}/021-baked-w640.jpg` },
    stripPatternFilter: true,
  },
  {
    name: 'no-fx-baked-w1280',
    overrides: { [TEX]: `${variantsDir}/021-baked-w1280.jpg` },
    stripPatternFilter: true,
    injectCss: NO_FX_CSS,
  },
  { name: 'baseline-dsf2', deviceScaleFactor: 2 },
];

let activeOverrides: Record<string, string> = {};

const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === '/__asset-publisher/snapshot') {
      return Response.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
    }
    const override = activeOverrides[pathname];
    if (override) {
      return new Response(Bun.file(override), { headers: { 'Cache-Control': 'no-store' } });
    }
    const relative = pathname === '/' ? 'publisher-capture.html' : pathname.replace(/^\/+/, '');
    if (relative.split('/').includes('..')) return new Response('Not found', { status: 404 });
    const fromDist = Bun.file(path.join(publisherDist, relative));
    if (await fromDist.exists()) {
      return new Response(fromDist, { headers: { 'Cache-Control': 'no-store' } });
    }
    const fromPublic = Bun.file(path.join(publicDir, relative));
    if (await fromPublic.exists()) {
      return new Response(fromPublic, { headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response('Not found', { status: 404 });
  },
});

async function waitReady(page: Page) {
  const marker = page.locator('#capture-status');
  await marker.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () =>
      document.querySelector('#capture-status')?.getAttribute('data-capture-state') !== 'loading',
    undefined,
    { timeout: 60_000 }
  );
  const state = await marker.getAttribute('data-capture-state');
  if (state !== 'ready') {
    throw new Error(`capture state ${state}: ${await marker.textContent()}`);
  }
}

type ImageX = { w: number; h: number; filter: string; kb: number; smask: boolean };

async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const images: ImageX[] = [];
  let flateNonImageKb = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict = obj.dict;
    const subtype = dict.get(PDFName.of('Subtype'));
    if (subtype === PDFName.of('Image')) {
      images.push({
        w: Number(dict.get(PDFName.of('Width'))?.toString() ?? 0),
        h: Number(dict.get(PDFName.of('Height'))?.toString() ?? 0),
        filter: dict.get(PDFName.of('Filter'))?.toString() ?? 'none',
        kb: Math.round(obj.contents.length / 1024),
        smask: dict.has(PDFName.of('SMask')),
      });
    } else {
      flateNonImageKb += obj.contents.length / 1024;
    }
  }
  images.sort((a, b) => b.kb - a.kb);
  return { images, flateNonImageKb: Math.round(flateNonImageKb) };
}

async function runCell(browser: Browser, cell: Cell) {
  activeOverrides = cell.overrides ?? {};
  const page = await browser.newPage({
    viewport: PUBLISHER_RENDERER_CONTRACT.viewport,
    deviceScaleFactor: cell.deviceScaleFactor ?? PUBLISHER_RENDERER_CONTRACT.deviceScaleFactor,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await page.goto(`http://127.0.0.1:${server.port}/publisher-capture.html`, {
    waitUntil: 'domcontentloaded',
  });
  await waitReady(page);

  const inventory = await page.evaluate(() => {
    const withAttr = document.querySelectorAll('[filter]').length;
    let computedFilter = 0;
    let boxShadow = 0;
    let masked = 0;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const cs = getComputedStyle(el as Element);
      if (cs.filter && cs.filter !== 'none') computedFilter += 1;
      if (cs.boxShadow && cs.boxShadow !== 'none') boxShadow += 1;
      if ((cs.mask && cs.mask !== 'none') || (el as Element).getAttribute('mask')) masked += 1;
    }
    return {
      filterAttrs: withAttr,
      computedFilter,
      boxShadow,
      masked,
      patterns: document.querySelectorAll('pattern').length,
      patternImages: document.querySelectorAll('pattern image').length,
    };
  });

  if (cell.stripPatternFilter) {
    await page.evaluate(() => {
      document.querySelectorAll('pattern image[filter]').forEach((el) => {
        el.removeAttribute('filter');
      });
    });
  }
  if (cell.injectCss) await page.addStyleTag({ content: cell.injectCss });

  if (cell.screenshotPages) {
    const pages = page.locator('[data-faction-sheet-page]');
    const count = await pages.count();
    for (let i = 0; i < count; i += 1) {
      await pages.nth(i).screenshot({ path: path.join(outDir, `${cell.name}-page${i + 1}.png`) });
    }
  }

  await page.emulateMedia({ media: 'print' });
  const bytes = await page.pdf({
    displayHeaderFooter: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
    printBackground: true,
  });
  await Bun.write(path.join(outDir, `${cell.name}.pdf`), bytes);
  const anatomy = await inspect(new Uint8Array(bytes));
  await page.close();
  return { cell: cell.name, totalKb: Math.round(bytes.length / 1024), inventory, ...anatomy };
}

const browser = await chromium.launch();
const results = [];
for (const cell of CELLS) {
  const result = await runCell(browser, cell);
  console.log(JSON.stringify(result));
  results.push(result);
}
await browser.close();
server.stop();
await Bun.write(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
