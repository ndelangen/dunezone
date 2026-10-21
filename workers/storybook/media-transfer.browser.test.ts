import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vite-plus/test';

import worker from './index';

const imagePath = '/image/rulebook-cover/stone-circle-small.jpg';
const server = createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><img alt="Cover" src="${imagePath}">`);
    return;
  }
  void (async () => {
    const result = await worker.fetch(new Request(`https://storybook.dune.zone${request.url}`), {
      ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    const reader = result.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        response.end();
        return;
      }
      response.write(value);
    }
  })().catch(() => response.destroy());
});
let browser: Browser;
let origin: string;
let pixels: Uint8Array;
let digest: string;

beforeAll(async () => {
  pixels = await sharp({ create: { width: 12, height: 8, channels: 3, background: 'red' } })
    .jpeg()
    .toBuffer();
  digest = createHash('sha256').update(pixels).digest('hex');
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The media transfer fixture has no HTTP port.');
  }
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test('a 200 response interrupted mid-image still delivers decodable pixels through the Worker', async () => {
  let interrupt = () => {};
  const headers = { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': digest };
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(pixels.subarray(0, 100));
            interrupt = () => controller.error(new Error('The image transfer dropped after its headers'));
          },
        }),
        { headers }
      )
    )
    .mockResolvedValueOnce(new Response(pixels, { headers }));
  const page = await browser.newPage();
  const statuses: number[] = [];
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === imagePath) {
      requests.push(request.url());
    }
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === imagePath) {
      statuses.push(response.status());
      interrupt();
    }
  });
  try {
    await page.goto(origin);
    const image = page.getByRole('img', { name: 'Cover' });
    await image.evaluate((element: HTMLImageElement) => element.decode());
    expect(await image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([
      12, 8,
    ]);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(statuses).toEqual([200]);
    expect(requests).toEqual([`${origin}${imagePath}`]);
  } finally {
    await page.close();
  }
});

test('a complete response containing corrupt image bytes still fails decoding without a retry', async () => {
  const upstream = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response('Not a JPEG', { headers: { 'Content-Type': 'image/jpeg', 'X-Media-SHA256': 'corrupt-image' } })
    );
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await expect(
      page.getByRole('img', { name: 'Cover' }).evaluate((element: HTMLImageElement) => element.decode())
    ).rejects.toThrow('EncodingError');
    expect(upstream).toHaveBeenCalledTimes(1);
  } finally {
    await page.close();
  }
});
