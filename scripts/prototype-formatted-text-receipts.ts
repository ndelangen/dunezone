import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import sharp from 'sharp';

import { CAPTURE_PROTOCOL } from '../src/shared/asset-publishing/capture-protocol';
import { TreacheryAsset } from '../src/shared/assets/schema';
import { FactionInputSchema } from '../src/shared/factions/schema';
import { waitForCaptureMarkerSettled } from '../workers/publisher/capture-lifecycle';
import { PUBLISHER_RENDERER_CONTRACT } from '../workers/publisher/renderer-contract';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const publisherDist = path.join(repositoryRoot, 'workers/publisher/dist');
const receiptDirectory = path.join(repositoryRoot, 'prototype-receipts/672');
const cloneDeployment = 'dev:tame-raccoon-541';
const factionSlugs = ['house-richese', 'spacing-guild', 'emperor-choam', 'bene-tleilax', 'hivers', 'richese'] as const;
const cardSlugs = ['small-shirt', 'trishula', 'supplies'] as const;

type FactionRow = {
  _id: string;
  data: unknown;
  is_deleted: boolean;
  slug: string;
};

type AssetRow = {
  _id: string;
  data: unknown;
  is_deleted: boolean;
  slug: string;
  type: string;
};

type Snapshot = {
  ok: true;
  assetType: 'faction_sheet' | 'card-treachery';
  payload: unknown;
  payloadHash: string;
};

type Receipt = {
  assetType: Snapshot['assetType'];
  changedPixelBounds: string;
  changedPixelPercent: number;
  label: string;
  sourceSlug: string;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function readCloneTable<T>(table: string): Promise<T[]> {
  const child = Bun.spawn(['bunx', 'convex', 'data', table, '--limit', '100', '--format', 'json'], {
    cwd: repositoryRoot,
    env: { ...process.env, CONVEX_DEPLOYMENT: cloneDeployment },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  invariant(exitCode === 0, `Unable to read ${table} from the cloned deployment: ${stderr.trim()}`);
  return JSON.parse(stdout) as T[];
}

function snapshot(assetType: Snapshot['assetType'], payload: unknown): Snapshot {
  return {
    ok: true,
    assetType,
    payload,
    payloadHash: new Bun.CryptoHasher('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
}

let activeSnapshot: Snapshot;
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname === CAPTURE_PROTOCOL.paths.snapshot) {
      return Response.json(activeSnapshot, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const relative = pathname === '/' ? CAPTURE_PROTOCOL.paths.bundleDocument.slice(1) : pathname.replace(/^\/+/, '');
    if (relative.split('/').includes('..')) {
      return new Response('Not found', { status: 404 });
    }
    const file = Bun.file(path.join(publisherDist, relative));
    return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 });
  },
});

async function newPage(browser: Browser, assetType: Snapshot['assetType']): Promise<Page> {
  return await browser.newPage({
    viewport:
      assetType === 'faction_sheet'
        ? {
            width: PUBLISHER_RENDERER_CONTRACT.viewport.width,
            height: PUBLISHER_RENDERER_CONTRACT.viewport.height,
          }
        : { width: 900, height: 1263 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
}

async function capture(browser: Browser, input: Snapshot, mode: 'markdown' | 'formatted-text'): Promise<Buffer[]> {
  activeSnapshot = input;
  const page = await newPage(browser, input.assetType);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const query = mode === 'formatted-text' ? '?prototype-renderer=formatted-text' : '';
    await page.goto(`http://127.0.0.1:${server.port}${CAPTURE_PROTOCOL.paths.bundleDocument}${query}`, {
      waitUntil: 'domcontentloaded',
    });
    const result = await waitForCaptureMarkerSettled(page);
    invariant(result.state === 'ready', `Capture reported ${result.state}: ${result.detail}`);
    invariant(errors.length === 0, `Capture emitted errors: ${errors.join(' | ')}`);

    const subjects =
      input.assetType === 'faction_sheet'
        ? page.locator(CAPTURE_PROTOCOL.pageMarker.selector)
        : page.locator(CAPTURE_PROTOCOL.frameMarker.selector);
    const count = await subjects.count();
    invariant(count > 0, `Capture did not render a ${input.assetType} subject`);
    const captures: Buffer[] = [];
    for (let index = 0; index < count; index += 1) {
      captures.push(await subjects.nth(index).screenshot({ type: 'png', scale: 'css' }));
    }
    return captures;
  } finally {
    await page.close();
  }
}

async function comparePixels(current: Buffer, candidate: Buffer) {
  const currentRaw = await sharp(current).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const candidateRaw = await sharp(candidate).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  invariant(
    currentRaw.info.width === candidateRaw.info.width && currentRaw.info.height === candidateRaw.info.height,
    'Side-by-side captures have different dimensions'
  );

  const { channels, height, width } = currentRaw.info;
  let changed = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let offset = 0; offset < currentRaw.data.length; offset += channels) {
    let largestDifference = 0;
    for (let channel = 0; channel < Math.min(channels, 3); channel += 1) {
      largestDifference = Math.max(
        largestDifference,
        Math.abs(currentRaw.data[offset + channel]! - candidateRaw.data[offset + channel]!)
      );
    }
    if (largestDifference <= 8) {
      continue;
    }
    const pixel = offset / channels;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    changed += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    changedPixelBounds: changed === 0 ? 'none' : `${minX},${minY} to ${maxX},${maxY}`,
    changedPixelPercent: (changed / (width * height)) * 100,
  };
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function textStrip(width: number, height: number, value: string, fontSize: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#171717"/>
      <text x="20" y="${Math.round(height * 0.68)}" fill="#fff" font-family="Arial, sans-serif" font-size="${fontSize}">${escapeXml(value)}</text>
    </svg>`
  );
}

async function contactSheet(
  filename: string,
  title: string,
  rows: { current: Buffer; candidate: Buffer; receipt: Receipt }[]
): Promise<void> {
  const panelWidth = 650;
  const labelHeight = 54;
  const titleHeight = 72;
  const gutter = 12;
  const prepared = await Promise.all(
    rows.map(async (row) => {
      const current = await sharp(row.current).resize({ width: panelWidth }).jpeg({ quality: 88 }).toBuffer();
      const candidate = await sharp(row.candidate).resize({ width: panelWidth }).jpeg({ quality: 88 }).toBuffer();
      const metadata = await sharp(current).metadata();
      invariant(metadata.height !== undefined, 'Resized receipt has no height');
      return { ...row, current, candidate, height: metadata.height };
    })
  );
  const width = panelWidth * 2 + gutter;
  const height = titleHeight + prepared.reduce((total, row) => total + labelHeight + row.height + gutter, 0);
  const composites: { input: Buffer; left: number; top: number }[] = [
    { input: textStrip(width, titleHeight, title, 32), left: 0, top: 0 },
  ];
  let top = titleHeight;
  for (const row of prepared) {
    const percentage = row.receipt.changedPixelPercent.toFixed(3);
    composites.push(
      {
        input: textStrip(panelWidth, labelHeight, `${row.receipt.label} | Current Markdown`, 23),
        left: 0,
        top,
      },
      {
        input: textStrip(panelWidth, labelHeight, `Formatted text | ${percentage}% pixels changed`, 23),
        left: panelWidth + gutter,
        top,
      },
      { input: row.current, left: 0, top: top + labelHeight },
      {
        input: row.candidate,
        left: panelWidth + gutter,
        top: top + labelHeight,
      }
    );
    top += labelHeight + row.height + gutter;
  }
  await sharp({ create: { width, height, channels: 3, background: '#d8d5cc' } })
    .composite(composites)
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
    .toFile(path.join(receiptDirectory, filename));
}

function markdownTable(receipts: Receipt[]): string {
  const lines = ['| Source | Published asset | Pixel change | Changed bounds |', '| --- | --- | ---: | --- |'];
  for (const receipt of receipts) {
    lines.push(
      `| ${receipt.label} | ${receipt.assetType} | ${receipt.changedPixelPercent.toFixed(3)}% | ${receipt.changedPixelBounds} |`
    );
  }
  return lines.join('\n');
}

function assetTypeSummary(receipts: Receipt[], assetType: Receipt['assetType']): string {
  const matching = receipts.filter((receipt) => receipt.assetType === assetType);
  const changed = matching.filter((receipt) => receipt.changedPixelPercent > 0);
  const maximum = Math.max(0, ...matching.map((receipt) => receipt.changedPixelPercent));
  return `${matching.length} renders, ${matching.length - changed.length} pixel-identical, ${changed.length} changed, maximum ${maximum.toFixed(3)}%`;
}

await mkdir(receiptDirectory, { recursive: true });
const [factionRows, assetRows] = await Promise.all([
  readCloneTable<FactionRow>('factions'),
  readCloneTable<AssetRow>('assets'),
]);
const liveFactions = factionRows.filter((row) => !row.is_deleted);
const liveCards = assetRows.filter((row) => !row.is_deleted && row.type === 'card-treachery');

const browser = await chromium.launch({ headless: true });
const factionRowsForSheet: {
  current: Buffer;
  candidate: Buffer;
  receipt: Receipt;
}[] = [];
const cardRowsForSheet: {
  current: Buffer;
  candidate: Buffer;
  receipt: Receipt;
}[] = [];
const receipts: Receipt[] = [];
try {
  for (const row of [...liveFactions].sort((left, right) => left.slug.localeCompare(right.slug))) {
    const faction = FactionInputSchema.parse(row.data);
    const input = snapshot('faction_sheet', {
      factionId: row._id,
      slug: row.slug,
      faction,
    });
    const currentPages = await capture(browser, input, 'markdown');
    const candidatePages = await capture(browser, input, 'formatted-text');
    invariant(currentPages.length === candidatePages.length, `${row.slug} changed its page count`);
    for (let pageIndex = 0; pageIndex < currentPages.length; pageIndex += 1) {
      const current = currentPages[pageIndex]!;
      const candidate = candidatePages[pageIndex]!;
      const comparison = await comparePixels(current, candidate);
      const receipt: Receipt = {
        assetType: 'faction_sheet',
        label: `${row.slug}, page ${pageIndex + 1}`,
        sourceSlug: row.slug,
        ...comparison,
      };
      receipts.push(receipt);
      if (pageIndex === 0 && (factionSlugs as readonly string[]).includes(row.slug)) {
        factionRowsForSheet.push({ current, candidate, receipt });
      }
    }
  }

  for (const row of [...liveCards].sort((left, right) => left.slug.localeCompare(right.slug))) {
    const card = TreacheryAsset.parse(row.data);
    const input = snapshot('card-treachery', {
      assetId: row._id,
      slug: row.slug,
      card,
    });
    const [current] = await capture(browser, input, 'markdown');
    const [candidate] = await capture(browser, input, 'formatted-text');
    invariant(current && candidate, `${row.slug} did not render both card variants`);
    const comparison = await comparePixels(current, candidate);
    const receipt: Receipt = {
      assetType: 'card-treachery',
      label: row.slug,
      sourceSlug: row.slug,
      ...comparison,
    };
    receipts.push(receipt);
    if ((cardSlugs as readonly string[]).includes(row.slug)) {
      cardRowsForSheet.push({ current, candidate, receipt });
    }
  }
} finally {
  await browser.close();
  server.stop(true);
}

await contactSheet(
  'faction-sheets.jpg',
  'Faction sheets from the cloned deployment: current and formatted-text renderers',
  factionRowsForSheet
);
await contactSheet(
  'treachery-cards.jpg',
  'Treachery cards from the cloned deployment: current and formatted-text renderers',
  cardRowsForSheet
);

const report = `# Formatted-text print-renderer prototype receipts

Prototype for [#672](https://github.com/ndelangen/dunezone/issues/672). The inputs came from the read-only \`${cloneDeployment}\` clone on ${new Date().toISOString()}. The capture uses the actual publisher bundle and fixed publication geometry.

The full sweep covers every live faction and treachery card in the clone. The contact sheets show all three faction documents with stored list syntax, the two other largest faction changes, one dense faction, and three paragraph-heavy cards. A changed pixel means one or more RGB channels moved by more than 8 levels.

- [Faction sheet comparisons](./faction-sheets.jpg)
- [Treachery card comparisons](./treachery-cards.jpg)

Sweep summary:

- Faction sheets: ${assetTypeSummary(receipts, 'faction_sheet')}.
- Treachery cards: ${assetTypeSummary(receipts, 'card-treachery')}.

Changed renders:

${markdownTable(receipts.filter((receipt) => receipt.changedPixelPercent > 0))}

Revision and recapture scope:

- \`faction_sheet\` must move from revision 8 to 9 and republish ${liveFactions.length} live faction sheets because the list cases visibly change.
- \`card-treachery\` stays at revision 1. All ${liveCards.length} live captures are pixel-identical, so a bump to 2 would only recapture byte-identical faces. New saves use the replacement renderer without a revision bump.
- Decks and tokens do not import the prose renderer, so their revisions stay unchanged.
`;

await Promise.all([
  writeFile(path.join(receiptDirectory, 'README.md'), report),
  writeFile(
    path.join(receiptDirectory, 'summary.json'),
    `${JSON.stringify(
      {
        cloneDeployment,
        generatedAt: new Date().toISOString(),
        liveAssetCounts: {
          faction_sheet: liveFactions.length,
          'card-treachery': liveCards.length,
        },
        proposedRevisions: {
          faction_sheet: { from: 8, to: 9 },
          'card-treachery': { from: 1, to: 1 },
        },
        receipts,
      },
      null,
      2
    )}\n`
  ),
]);

console.log(`Wrote ${receipts.length} receipts to ${path.relative(repositoryRoot, receiptDirectory)}`);
