import { createServer } from 'node:http';

import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';

import { decodeStoryImage } from './storybook-publication-images';

let browser: Browser;
let origin: string;
const server = createServer((request, response) => {
  if (request.url === '/valid.svg') {
    response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    response.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8" fill="red"/></svg>'
    );
  } else if (request.url === '/corrupt.jpg') {
    response.writeHead(200, { 'Content-Type': 'image/jpeg' });
    response.end('These bytes are not an image.');
  } else if (request.url === '/missing.jpg') {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Missing image');
  } else if (request.url === '/held.jpg') {
    response.writeHead(200, { 'Content-Type': 'image/jpeg' });
    response.flushHeaders();
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><img id="proof" alt="Cover">');
  }
});

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Missing image fixture server address');
  }
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test.each([
  { source: '/missing.jpg', status: 404 },
  { source: '/corrupt.jpg', status: 200 },
])('a $status decode failure identifies $source and its HTTP response', async ({ source, status }) => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.locator('#proof').evaluate((image: HTMLImageElement, src) => {
      image.src = src;
    }, source);
    const failure = await decodeStoryImage(page.locator('#proof')).then(
      () => null,
      (error: unknown) => error
    );
    expect(failure).toMatchObject({ message: expect.stringContaining(`${origin}${source}`) });
    expect(failure).toMatchObject({ message: expect.stringContaining(`"responseStatus":${status}`) });
    expect(failure).toMatchObject({ message: expect.stringContaining('EncodingError') });
  } finally {
    await page.close();
  }
});

test('a decoded publication image keeps its real pixels', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.locator('#proof').evaluate((image: HTMLImageElement) => {
      image.src = '/valid.svg';
    });
    await decodeStoryImage(page.locator('#proof'));
    await expect(
      page.locator('#proof').evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])
    ).resolves.toEqual([12, 8]);
  } finally {
    await page.close();
  }
});

test('a source replacement during decode identifies the interrupted image and its replacement', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.locator('#proof').evaluate((image: HTMLImageElement) => {
      image.src = '/held.jpg';
    });
    const failure = decodeStoryImage(page.locator('#proof')).then(
      () => null,
      (error: unknown) => error
    );
    await page.locator('#proof').evaluate((image: HTMLImageElement) => {
      image.src = '/valid.svg';
    });
    expect(await failure).toMatchObject({ message: expect.stringContaining(`${origin}/held.jpg`) });
    expect(await failure).toMatchObject({ message: expect.stringContaining(`${origin}/valid.svg`) });
    expect(await failure).toMatchObject({ message: expect.stringContaining('"sourceChanged":true') });
  } finally {
    await page.close();
  }
});
