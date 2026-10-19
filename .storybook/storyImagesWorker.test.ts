import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright';
import { build, createServer, preview } from 'vite-plus';
import { expect, test } from 'vite-plus/test';

import { storyImagesWorker } from './storyImagesWorker.ts';

type Mode = 'development' | 'build';

async function fixtureServer(mode: Mode, root: string) {
  await writeFile(join(root, 'index.html'), '<!doctype html><title>Image worker fixture</title>');
  const config = { root, configFile: false as const, logLevel: 'silent' as const, plugins: [storyImagesWorker()] };
  if (mode === 'build') {
    await build(config);
    return preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
  }
  const server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
  try {
    await server.listen();
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}

function serverOrigin(server: Awaited<ReturnType<typeof fixtureServer>>) {
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('The image worker fixture has no HTTP port.');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function exerciseImageWorker() {
  await navigator.serviceWorker.register('/story-images.sw.js');
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
    });
  }
  const first = await fetch('/__story-images/fail-once/fixture');
  const recovered = await fetch('/__story-images/fail-once/fixture');
  const start = performance.now();
  const delayed = await fetch('/__story-images/after/150/fixture');
  const delayMs = performance.now() - start;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50);
  const held = await fetch('/__story-images/held/fixture', { signal: controller.signal })
    .then(
      () => 'answered',
      (error: unknown) => (error instanceof Error ? error.name : 'unknown')
    )
    .finally(() => clearTimeout(timer));
  const outside = await fetch('/index.html');
  return {
    first: first.status,
    recovered: recovered.status,
    artwork: await recovered.text(),
    delayed: delayed.status,
    delayMs,
    held,
    outside: outside.status,
  };
}

test.each(['development', 'build'] as const)(
  'the %s image worker controls requests after TypeScript compilation',
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), 'story-images-worker-'));
    try {
      const server = await fixtureServer(mode, root);
      try {
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(serverOrigin(server));
          const result = await page.evaluate(exerciseImageWorker);
          expect(result).toMatchObject({ first: 503, recovered: 200, delayed: 200, held: 'AbortError', outside: 200 });
          expect(result.artwork).toContain('<svg');
          expect(result.delayMs).toBeGreaterThanOrEqual(125);
        } finally {
          await browser.close();
        }
      } finally {
        await server.close();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  15_000
);
