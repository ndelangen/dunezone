/*
 * PROTOTYPE, throwaway: films the image-arrival variants for side-by-side review on a phone.
 * Run from the worktree root so Playwright and sharp resolve, against a Vite dev server serving this worktree:
 *   node src/app/widgets/asset-face/capture.prototype.mjs <outDir> [variants=B,C,D] [pages=assets,factions]
 * PROTO_BASE overrides the server (default http://localhost:6041).
 *
 * Deterministic by replay, not by wall clock.
 * Each page loads for real at 390 px, DPR 2 and ?slow=700 until every visible arrival has finished.
 * Then every animation from document.getAnimations() is paused, and the prototype's are stepped through their recorded start times at 30 frames a second by setting currentTime.
 * The arrivals are CSS animations with fill `both` and the loading layers stay mounted, so a negative currentTime shows the moment before each one started.
 *
 * Each clip holds 250 ms on the first frame (the empty start), plays from the first visible animation to the end of the last one, and holds 600 ms on the arrived page.
 * Consecutive identical frames are merged into one longer frame, which keeps the timing and trims the file.
 * The strip per page has a row per variant and columns loading, arriving (about 40% in) and arrived.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.PROTO_BASE ?? 'http://localhost:6041';
const [outDir, variantArg = 'B,C,D', pageArg = 'assets,factions'] = process.argv.slice(2);
if (!outDir) {
  throw new Error('usage: capture.prototype.mjs <outDir> [variants] [pages]');
}
const VARIANTS = variantArg.split(',');
const PAGES = pageArg.split(',');

const SLOW = 700;
const WIDTH = 390;
const HEIGHT = 844;
const DPR = 2;
const BAR = 40;
const FPS = 30;
const START_HOLD = 250;
const END_HOLD = 600;
/** Rows of the strip, top to bottom. */
const STRIP_ORDER = ['C', 'B', 'D'];

const NAMES = {
  A: 'Silhouette, then fade',
  B: 'Develops from its own colour',
  C: 'Arrives when ready',
  D: "C's wave with B's develop",
};
const PAGE_TITLES = { assets: 'Assets overview', factions: 'Factions overview' };

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = "font-family='Helvetica Neue, Helvetica, Arial, sans-serif'";

function labelBar(variant) {
  return Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${WIDTH}' height='${BAR}'>` +
      `<rect width='100%' height='100%' fill='#2a1d10'/>` +
      `<text x='14' y='27' ${FONT} font-size='18' font-weight='700' fill='#f3e6cc'>${escape(`${variant} · ${NAMES[variant]}`)}</text>` +
      `</svg>`
  );
}

/** Loads the page for real, then pauses every animation and exposes a seek over the prototype's recorded start times. */
async function prepare(page, route, variant) {
  const url = `${BASE}/${route}?variant=${variant}&slow=${SLOW}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('[data-variant][data-phase]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  /* Settled: the tile count has stopped changing and no tile in the viewport is still loading. */
  await page.waitForFunction(
    () => {
      const roots = [...document.querySelectorAll('[data-variant][data-phase]')];
      const visible = roots.filter((root) => {
        const rect = root.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
      });
      const state = `${roots.length}:${visible.filter((root) => root.dataset.phase === 'loading').length}`;
      const previous = window.__settle;
      window.__settle = { state, since: previous?.state === state ? previous.since : performance.now() };
      return (
        visible.length > 0 &&
        visible.every((root) => root.dataset.phase !== 'loading') &&
        performance.now() - window.__settle.since > 1500
      );
    },
    undefined,
    { timeout: 60_000, polling: 100 }
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => undefined))
    )
  );

  return page.evaluate(
    ({ expected }) => {
      const style = document.createElement('style');
      style.textContent = '[data-prototype-switcher] { display: none !important; }';
      document.head.append(style);

      const onScreen = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
      };
      const all = document.getAnimations();
      const records = [];
      for (const animation of all) {
        const target = animation.effect?.target;
        const root = target?.closest?.('[data-variant][data-phase]');
        const startTime = animation.startTime;
        if (root && startTime !== null) {
          const endTime = animation.effect.getComputedTiming().endTime;
          const className = String(target.className);
          records.push({
            animation,
            startTime,
            end: Number.isFinite(endTime) ? startTime + endTime : null,
            layer: className.includes('slot') ? 'slot' : className.includes('art') ? 'art' : 'other',
            name: animation.animationName ?? '',
            order: Number(root.dataset.order),
            visible: onScreen(root),
          });
        }
      }
      /* Record every start time before pausing: a paused animation reports a null startTime. */
      for (const animation of all) {
        animation.pause();
      }
      window.__seek = (time) => {
        for (const record of records) {
          record.animation.currentTime = time - record.startTime;
        }
        return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };

      const roots = [...document.querySelectorAll('[data-variant][data-phase]')];
      const visibleRoots = roots.filter(onScreen);
      const visible = records.filter((record) => record.visible && record.end !== null);
      const arts = visible.filter((record) => record.layer === 'art');
      return {
        wrongVariant: roots.filter((root) => root.dataset.variant !== expected).length,
        visibleTiles: visibleRoots.length,
        visibleMissing: visibleRoots.filter((root) => root.dataset.phase === 'missing').length,
        visibleInstant: visibleRoots.filter(
          (root) => root.dataset.phase === 'shown' && root.dataset.arrival === 'instant'
        ).length,
        first: Math.min(...visible.map((record) => record.startTime)),
        last: Math.max(...visible.map((record) => record.end)),
        arts: arts.map(({ startTime, end, name, order }) => ({ startTime, end, name, order })),
        slots: visible
          .filter((record) => record.layer === 'slot')
          .map(({ startTime, end, order }) => ({ startTime, end, order })),
      };
    },
    { expected: variant }
  );
}

async function film(browser, route, variant) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: DPR,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const info = await prepare(page, route, variant);
  if (info.wrongVariant > 0 || info.visibleTiles === 0 || info.arts.length === 0) {
    throw new Error(`${route} ${variant}: setup did not take effect ${JSON.stringify(info)}`);
  }

  const step = 1000 / FPS;
  const times = [];
  for (let time = info.first; time < info.last; time += step) {
    times.push(time);
  }
  times.push(info.last);

  const bar = labelBar(variant);
  const frames = [];
  for (const time of times) {
    await page.evaluate((t) => window.__seek(t), time);
    const shot = await page.screenshot({ type: 'png' });
    const small = await sharp(shot).resize(WIDTH, HEIGHT, { kernel: 'lanczos3' }).png().toBuffer();
    const raw = await sharp({ create: { width: WIDTH, height: HEIGHT + BAR, channels: 4, background: '#2a1d10' } })
      .composite([
        { input: bar, top: 0, left: 0 },
        { input: small, top: BAR, left: 0 },
      ])
      .raw()
      .toBuffer();
    frames.push({ time, raw, small });
  }
  await context.close();

  /* Delays: 30 fps without drift, the first and last frames holding the empty start and the arrived page. */
  const delays = frames.map((_, index) => Math.round(((index + 1) * 1000) / FPS) - Math.round((index * 1000) / FPS));
  delays[0] = START_HOLD;
  delays[delays.length - 1] = END_HOLD;
  const merged = [];
  for (const [index, frame] of frames.entries()) {
    const previous = merged.at(-1);
    if (previous && index > 1 && index < frames.length - 1 && previous.raw.equals(frame.raw)) {
      previous.delay += delays[index];
      continue;
    }
    merged.push({ raw: frame.raw, delay: delays[index] });
  }
  const file = join(outDir, `1310-prototype-images-${route}-${variant}.webp`);
  await sharp(Buffer.concat(merged.map((frame) => frame.raw)), {
    raw: { width: WIDTH, height: (HEIGHT + BAR) * merged.length, channels: 4, pageHeight: HEIGHT + BAR },
  })
    .webp({ loop: 0, delay: merged.map((frame) => frame.delay), quality: 82, effort: 4 })
    .toFile(file);

  /*
   * Strip moments: the last frame before any image starts, the arriving frame, and the arrived page.
   * Arriving is the frame between 25% and 60% of the arrival window with the most images mid-arrival, the one nearest 40% on a tie.
   */
  const artStart = Math.min(...info.arts.map((art) => art.startTime));
  const artEnd = Math.max(...info.arts.map((art) => art.end));
  const loading = frames.filter((frame) => frame.time < artStart).at(-1) ?? frames[0];
  const span = artEnd - artStart;
  const target = artStart + 0.4 * span;
  const inFlight = (time) =>
    info.arts.filter((art) => {
      const progress = (time - art.startTime) / (art.end - art.startTime);
      return progress > 0.1 && progress < 0.75;
    }).length;
  const window = frames.filter((frame) => frame.time >= artStart + 0.25 * span && frame.time <= artStart + 0.6 * span);
  const arriving = (window.some((frame) => inFlight(frame.time) > 0) ? window : frames)
    .filter((frame) => inFlight(frame.time) > 0)
    .sort((a, b) => inFlight(b.time) - inFlight(a.time) || Math.abs(a.time - target) - Math.abs(b.time - target))[0];
  const arrived = frames.at(-1);

  const origin = info.first;
  const byOrder = new Map();
  for (const art of info.arts) {
    byOrder.set(art.order, Math.min(byOrder.get(art.order) ?? Infinity, art.startTime));
  }
  const timings = {
    route,
    variant,
    frames: frames.length,
    webpFrames: merged.length,
    clipMs: merged.reduce((sum, frame) => sum + frame.delay, 0),
    visibleTiles: info.visibleTiles,
    visibleMissing: info.visibleMissing,
    visibleInstant: info.visibleInstant,
    arrivalNames: [...new Set(info.arts.map((art) => art.name))],
    placeholderAt: Math.round(Math.min(...info.slots.map((slot) => slot.startTime)) - origin),
    arrivingAt: Math.round(arriving.time - origin),
    arrivingInFlight: inFlight(arriving.time),
    arrivingPercent: Math.round(((arriving.time - artStart) / span) * 100),
    /* Start of each visible tile's arrival, ms after the first visible animation, in reading order. */
    arrivals: [...byOrder]
      .sort((a, b) => a[0] - b[0])
      .map(([order, start]) => ({ order, at: Math.round(start - origin) })),
  };
  console.log(JSON.stringify(timings));
  return { timings, stills: { loading: loading.small, arriving: arriving.small, arrived: arrived.small } };
}

function text(x, y, size, content, { weight = 700, anchor = 'middle', fill = '#2a1d10' } = {}) {
  return `<text x='${x}' y='${y}' ${FONT} font-size='${size}' font-weight='${weight}' text-anchor='${anchor}' fill='${fill}'>${escape(content)}</text>`;
}

async function strip(route, results) {
  const labelWidth = 190;
  const gap = 16;
  const titleHeight = 84;
  const headHeight = 60;
  const columns = [
    ['loading', 'loading'],
    ['arriving', 'arriving (about 40% in)'],
    ['arrived', 'arrived'],
  ];
  const rows = STRIP_ORDER.filter((variant) => results[variant]);
  const width = labelWidth + columns.length * (WIDTH + gap) + gap;
  const height = titleHeight + headHeight + rows.length * (HEIGHT + gap) + gap;

  let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>`;
  svg += text(gap, 58, 42, `${PAGE_TITLES[route]} at 390 px, ?slow=${SLOW}`, { anchor: 'start' });
  columns.forEach(([, label], column) => {
    svg += text(labelWidth + column * (WIDTH + gap) + WIDTH / 2, titleHeight + 42, 34, label);
  });
  rows.forEach((variant, row) => {
    const top = titleHeight + headHeight + row * (HEIGHT + gap);
    svg += text(labelWidth / 2, top + HEIGHT / 2 - 10, 130, variant);
    const lines = [];
    for (const word of NAMES[variant].split(' ')) {
      const last = lines.at(-1);
      if (last && `${last} ${word}`.length <= 12) {
        lines[lines.length - 1] = `${last} ${word}`;
      } else {
        lines.push(word);
      }
    }
    lines.forEach((line, index) => {
      svg += text(labelWidth / 2, top + HEIGHT / 2 + 50 + index * 34, 28, line, { weight: 600 });
    });
  });
  svg += '</svg>';

  const composites = [];
  rows.forEach((variant, row) => {
    columns.forEach(([key], column) => {
      composites.push({
        input: results[variant].stills[key],
        top: titleHeight + headHeight + row * (HEIGHT + gap),
        left: labelWidth + column * (WIDTH + gap),
      });
    });
  });
  await sharp({ create: { width, height, channels: 4, background: '#f3e8d3' } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }, ...composites])
    .png()
    .toFile(join(outDir, `1310-prototype-images-${route}-combination.png`));
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const route of PAGES) {
  const results = {};
  for (const variant of VARIANTS) {
    results[variant] = await film(browser, route, variant);
    report.push(results[variant].timings);
  }
  await strip(route, results);
}
await browser.close();
await writeFile(join(outDir, 'timings.json'), `${JSON.stringify(report, null, 2)}\n`);
