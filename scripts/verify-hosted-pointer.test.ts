import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, expect, onTestFinished, test } from 'vite-plus/test';

import type { PointerSession } from '../src/app/widgets/tabletop/PointerSession';
import type { TablePiece, Vector3Tuple } from '../src/shared/play/model';
import { quickNativeDrag } from './verify-hosted-pointer';

let browser: Browser;
let script: string;
beforeAll(async () => {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../src/app/widgets/tabletop/PointerSession.ts', import.meta.url))],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'pointerProof',
  });
  script = compiled.outputFiles[0]!.text;
  browser = await chromium.launch();
});
afterAll(() => browser?.close(), 65_000);

type ProofWindow = Window & {
  pointerProof: { PointerSession: typeof PointerSession };
  pickup: ('top' | 'whole')[];
  events: { type: string; stamp: number; delivered: number }[];
};

async function tablePage(pressDelay: number) {
  const page = await browser.newPage();
  onTestFinished(() => page.close());
  await page.setContent('<canvas width="500" height="500"></canvas>');
  await page.addScriptTag({ content: script });
  await page.evaluate((delay) => {
    const proof = window as unknown as ProofWindow;
    proof.pickup = [];
    proof.events = [];
    const canvas = document.querySelector('canvas')!;
    const session = new proof.pointerProof.PointerSession();
    const piece = { id: 'troops' } as TablePiece;
    let hasDraft = false;
    session.bind({
      canvas,
      events: window,
      read: () => ({
        canHandleTable: true,
        hasDraft,
        piece: () => piece,
        point: (_piece, x, y): Vector3Tuple => [x, 0, y],
        isPublicPoint: () => true,
        beginGesture: (_id, pickup) => {
          hasDraft = true;
          proof.pickup.push(pickup);
        },
        updateGesture: () => {},
        finishGesture: () => {
          hasDraft = false;
        },
        cancelDraft: () => {
          hasDraft = false;
        },
        publishPointer: () => {},
        onActiveChange: () => {},
      }),
    });
    const record = (event: PointerEvent) =>
      proof.events.push({ type: event.type, stamp: event.timeStamp, delivered: performance.now() });
    canvas.addEventListener('pointerdown', (event) => {
      record(event);
      session.press(event, piece.id);
      /* A busy frame after the press, as software rendering can produce in the hosted homepage. */
      const until = performance.now() + delay;
      while (performance.now() < until) {
        // Keep the main thread busy while the browser queues the next native input.
      }
    });
    window.addEventListener('pointermove', record);
  }, pressDelay);
  return page;
}

test('quick native movement queued during a busy press takes the top piece once', async () => {
  const page = await tablePage(450);
  await quickNativeDrag(page, { x: 100, y: 100 }, { x: 140, y: 150 });
  const observed = await page.evaluate(() => {
    const proof = window as unknown as ProofWindow;
    const pressedAt = proof.events.findIndex((event) => event.type === 'pointerdown');
    const press = proof.events[pressedAt]!;
    const move = proof.events.slice(pressedAt + 1).find((event) => event.type === 'pointermove')!;
    return { pickup: proof.pickup, inputGap: move.stamp - press.stamp, deliveryGap: move.delivered - press.delivered };
  });
  expect(observed.inputGap).toBeLessThan(320);
  expect(observed.deliveryGap).toBeGreaterThanOrEqual(400);
  expect(observed.pickup).toEqual(['top']);
});

test('a stationary native press still lifts the whole stack before any movement', async () => {
  const page = await tablePage(0);
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.waitForFunction(() => (window as unknown as ProofWindow).pickup.length > 0);
  const observed = await page.evaluate(() => {
    const proof = window as unknown as ProofWindow;
    return { pickup: proof.pickup, lastInput: proof.events.at(-1)?.type };
  });
  expect(observed).toEqual({ pickup: ['whole'], lastInput: 'pointerdown' });
  await page.mouse.up();
});
