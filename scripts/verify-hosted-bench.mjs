import sharp from 'sharp';

import { isSpicePiece } from '../src/shared/play/spice.ts';
import { stackTopHeight } from '../src/shared/play/tableGeometry.ts';
import { applyVariant, benchInPage, describeScene, installBench, undoVariant } from './render-bench-page.mjs';

/*
 * Diagnostic (#1343, not for merge): what each rendering setting costs per frame on the CI runner's SwiftShader,
 * and what it does to the pixel counts the regular flow's checks read. Every result goes into report.json's checks.
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* The regular flow's two pixel counters, copied with their thresholds. */
function redCount(data, channels) {
  let count = 0;
  for (let offset = 0; offset < data.length; offset += channels) {
    if (data[offset] > 45 && data[offset + 1] < data[offset] * 0.5 && data[offset + 2] < data[offset] * 0.75) {
      count++;
    }
  }
  return count;
}
function goldCount(data, channels) {
  let count = 0;
  for (let offset = 0; offset < data.length; offset += channels) {
    const [red, green, blue] = data.subarray(offset, offset + 3);
    if (red > 100 && green > 75 && red > green * 1.05 && blue < green * 0.82) {
      count++;
    }
  }
  return count;
}
async function counts(png, center, half, counter) {
  const clip = { left: Math.round(center.x) - half, top: Math.round(center.y) - half, width: half * 2, height: half * 2 };
  const { data, info } = await sharp(png).extract(clip).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return counter(data, info.channels);
}

export async function verifyBench({ peer, signIn, enter, focus, openTab, point, capture, until, passed }) {
  const log = (name, detail) => {
    console.log(`BENCH ${name} ${JSON.stringify(detail)}`);
    passed(`bench: ${name}`, { bench: detail });
  };
  const timed = async (fn) => {
    const start = performance.now();
    await fn();
    return Math.round(performance.now() - start);
  };
  const a = await peer('player-a');
  await signIn(a);
  await enter(a);
  await a.page.waitForFunction(() => !!window.__duneBench, null, { timeout: 60_000 });
  await focus(a, 'map');
  await a.page.mouse.move(10, 10);
  await delay(2000);
  log('variants', await a.page.evaluate(installBench));

  /* A spice stack for the gold counter, spawned the way the regular flow's first spice check does. */
  await openTab(a, 'Table');
  const before = new Set(a.view().snapshot.table.pieces.map((value) => value.id));
  await a.page.getByRole('button', { name: 'Spawn 3 spice', exact: true }).click();
  await until(
    () => a.view().snapshot.table.pieces.some((value) => !before.has(value.id) && isSpicePiece(value)),
    'Spice did not spawn.'
  );
  await a.page.mouse.move(10, 10);
  await delay(2000);

  const pixelSamples = async (label) => {
    const pieces = a.view().snapshot.table.pieces;
    const spice = pieces.find((value) => !before.has(value.id) && isSpicePiece(value));
    const force = pieces.find((value) => value.id === 'harkonnen-force-stack');
    const spiceCenter = await point(a, [spice.position[0], spice.position[1] + stackTopHeight(spice), spice.position[2]], 'map');
    const forceCenter = await point(a, [force.position[0], force.position[1] + stackTopHeight(force), force.position[2]], 'map');
    /* The empty-board spots the regular flow takes its red baselines at. */
    const emptyA = await point(a, [0, 0.38, 1.6], 'map');
    const emptyB = await point(a, [-1.5, 0.38, 1.4], 'map');
    const png = await a.page.screenshot();
    return {
      label,
      spiceGold28: await counts(png, spiceCenter, 14, goldCount),
      forceRed48: await counts(png, forceCenter, 24, redCount),
      emptyRed48: [await counts(png, emptyA, 24, redCount), await counts(png, emptyB, 24, redCount)],
      emptyGold28: [await counts(png, emptyA, 14, goldCount), await counts(png, emptyB, 14, goldCount)],
    };
  };

  const pixelVariants = [
    'baseline',
    'samples 0',
    'pixel ratio 0.75',
    'pixel ratio 0.5',
    'anisotropy 1',
    'output target RGBA8',
    'no tone mapping (sRGB pass kept)',
    'no output pass (linear, straight to canvas)',
    'Lambert for Standard',
    'no point light',
    'samples 0 + anisotropy 1',
    'samples 0 + pixel ratio 0.75',
    'samples 0 + pixel ratio 0.5',
  ];
  for (const name of pixelVariants) {
    await a.page.evaluate(applyVariant, name);
    await delay(2500);
    const sample = await pixelSamples(name);
    if (['baseline', 'samples 0', 'pixel ratio 0.5', 'samples 0 + pixel ratio 0.75'].includes(name)) {
      await capture(a, `bench-${name.replaceAll(/[^a-z0-9]+/giu, '-')}`);
    }
    log('pixels', sample);
  }
  await a.page.evaluate(undoVariant);
  await delay(1500);

  log('scene 1440x1000', await a.page.evaluate(describeScene));
  log('frames 1440x1000', await a.page.evaluate(benchInPage, { frames: 6, warmup: 2, presented: 8 }));

  /* What the verifier's own screenshots cost: the gold counter takes a full-page capture per poll, the red one a clip. */
  const shots = { full: [], fullDecodeExtract: [], clip48: [], clip28: [] };
  const center = await point(a, [0, 0.38, 1.6], 'map');
  for (let index = 0; index < 5; index++) {
    shots.full.push(await timed(() => a.page.screenshot()));
    shots.fullDecodeExtract.push(
      await timed(async () => counts(await a.page.screenshot(), center, 14, goldCount))
    );
    shots.clip48.push(
      await timed(() =>
        a.page.screenshot({ clip: { x: Math.round(center.x) - 24, y: Math.round(center.y) - 24, width: 48, height: 48 } })
      )
    );
    shots.clip28.push(
      await timed(() =>
        a.page.screenshot({ clip: { x: Math.round(center.x) - 14, y: Math.round(center.y) - 14, width: 28, height: 28 } })
      )
    );
  }
  log('screenshots 1440x1000', shots);
  /* The same captures in other orders, to tell a clip's own cost from waiting on the frame the previous capture left. */
  const clip = (half) => ({ x: Math.round(center.x) - half, y: Math.round(center.y) - half, width: half * 2, height: half * 2 });
  const sequence = [];
  for (const [label, options] of [
    ['clip28', { clip: clip(14) }],
    ['clip28', { clip: clip(14) }],
    ['clip48', { clip: clip(24) }],
    ['clip48', { clip: clip(24) }],
    ['clip28', { clip: clip(14) }],
    ['full', {}],
    ['full', {}],
    ['clip28', { clip: clip(14) }],
    ['clip48', { clip: clip(24) }],
    ['clip28 animations disabled', { clip: clip(14), animations: 'disabled' }],
    ['clip28 caret initial', { clip: clip(14), caret: 'initial' }],
    ['clip28 caret initial', { clip: clip(14), caret: 'initial' }],
    ['full caret initial', { caret: 'initial' }],
    ['clip48 caret initial', { clip: clip(24), caret: 'initial' }],
  ]) {
    sequence.push([label, await timed(() => a.page.screenshot(options))]);
  }
  log('screenshot sequence 1440x1000', sequence);

  for (const viewport of [
    { width: 900, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ]) {
    await a.page.setViewportSize(viewport);
    await focus(a, 'map');
    await a.page.mouse.move(10, 10);
    await delay(2500);
    const label = `${viewport.width}x${viewport.height}`;
    log(`scene ${label}`, await a.page.evaluate(describeScene));
    log('pixels', await pixelSamples(`baseline ${label}`));
    await capture(a, `bench-baseline-${label}`);
    log(
      `frames ${label}`,
      await a.page.evaluate(benchInPage, { frames: 6, warmup: 2, presented: 0, variants: ['samples 0', 'pixel ratio 0.75'] })
    );
  }
  await a.page.setViewportSize({ width: 1440, height: 1000 });
  await focus(a, 'map');
  await a.page.mouse.move(10, 10);
  await delay(1500);

  /* A second table page in the same browser, as the regular flow runs player B: first idle, then drawing continuously. */
  const b = await peer('player-b');
  await signIn(b);
  await enter(b);
  await b.page.waitForFunction(() => !!window.__duneBench, null, { timeout: 60_000 });
  await focus(b, 'map');
  await b.page.mouse.move(10, 10);
  await delay(3000);
  log(
    'frames 1440x1000, player B idle',
    await a.page.evaluate(benchInPage, { frames: 6, warmup: 2, presented: 6, variants: ['samples 0'] })
  );

  /*
   * How many scene frames one player's pointer or carry costs the other table page: each page counts its renderer's
   * frames, and a test ends once the other page has drawn nothing for three seconds.
   */
  for (const who of [a, b]) {
    await who.page.evaluate(() => {
      const renderer = window.__duneBench.get().renderer;
      if (!renderer.__benchCounted) {
        const render = renderer.render.bind(renderer);
        window.__renders = 0;
        renderer.render = (...args) => {
          window.__renders++;
          return render(...args);
        };
        renderer.__benchCounted = true;
      }
    });
  }
  await b.page.evaluate(installBench);
  const renders = (who) => who.page.evaluate(() => window.__renders);
  const settle = async (who, started, quietMs = 3000, limitMs = 90_000) => {
    let last = await renders(who);
    let lastChange = Date.now();
    while (Date.now() - started < limitMs) {
      await delay(200);
      const count = await renders(who);
      if (count !== last) {
        last = count;
        lastChange = Date.now();
      } else if (Date.now() - lastChange >= quietMs) {
        break;
      }
    }
    return { frames: last, busyMs: lastChange - started };
  };
  const reset = () => Promise.all([a, b].map((who) => who.page.evaluate(() => (window.__renders = 0))));
  const first = await point(a, [0, 0.38, 1], 'map');
  const second = await point(a, [1, 0.38, 1], 'map');
  await a.page.mouse.move(first.x, first.y);
  await settle(b, Date.now());
  await reset();
  {
    const started = Date.now();
    const idle = await settle(b, started, 10_000, 10_000);
    log('remote frames', { test: 'nothing happens for 10 s', playerB: idle, playerA: await renders(a) });
  }
  const pointerTest = async (label, move) => {
    await reset();
    const started = Date.now();
    await move();
    const moved = Date.now() - started;
    const other = await settle(b, started);
    log('remote frames', { test: label, moveMs: moved, playerB: other, playerA: await renders(a) });
  };
  await pointerTest('player A moves the pointer one table unit in one step', () => a.page.mouse.move(second.x, second.y));
  await pointerTest('player A moves the pointer one table unit in 12 steps', () =>
    a.page.mouse.move(first.x, first.y, { steps: 12 })
  );
  await b.page.evaluate(applyVariant, 'samples 0');
  await settle(b, Date.now());
  await pointerTest('the same single step, player B without MSAA', () => a.page.mouse.move(second.x, second.y));
  await b.page.evaluate(applyVariant, 'samples 0 + pixel ratio 0.75');
  await settle(b, Date.now());
  await pointerTest('the same single step, player B without MSAA at pixel ratio 0.75', () =>
    a.page.mouse.move(first.x, first.y)
  );
  await b.page.evaluate(undoVariant);
  await settle(b, Date.now());
  {
    const force = a.view().snapshot.table.pieces.find((value) => value.id === 'harkonnen-force-stack');
    const start = await point(a, force.position.map((value, index) => (index === 1 ? value + 0.12 : value)), 'map');
    const target = await point(a, [0, 0.38, 1.6], 'map');
    await a.page.mouse.move(10, 10);
    await settle(b, Date.now());
    await reset();
    const started = Date.now();
    await a.page.mouse.move(start.x, start.y);
    await a.page.mouse.down();
    try {
      await delay(350);
      await a.page.mouse.move(target.x, target.y, { steps: 12 });
      const carried = await settle(b, started);
      log('remote frames', { test: 'player A picks up the force stack and carries it in 12 steps', playerB: carried, playerA: await renders(a) });
    } finally {
      await a.page.keyboard.press('Escape');
      await a.page.mouse.up();
    }
    await reset();
    const cancelled = await settle(b, Date.now());
    log('remote frames', { test: 'player A cancels the carry', playerB: cancelled, playerA: await renders(a) });
  }
  await b.page.evaluate(() => {
    const state = window.__duneBench.get();
    const stopAt = performance.now() + 90_000;
    const spin = () => {
      if (performance.now() < stopAt && !window.__benchStop) {
        state.invalidate();
        requestAnimationFrame(spin);
      }
    };
    spin();
  });
  await delay(2000);
  log(
    'frames 1440x1000, player B drawing',
    await a.page.evaluate(benchInPage, { frames: 6, warmup: 2, presented: 6, variants: ['samples 0'] })
  );
  await b.page.evaluate(() => {
    window.__benchStop = true;
  });
}
