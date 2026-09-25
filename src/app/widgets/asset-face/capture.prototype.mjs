/*
 * PROTOTYPE, throwaway: films the image-arrival variants for side-by-side review on a phone.
 * Run from the worktree root so Playwright and sharp resolve, against a Vite dev server serving this worktree:
 *   node src/app/widgets/asset-face/capture.prototype.mjs <outDir> [variants=B,C,D] [pages=assets,factions] [scatter=600]
 * PROTO_BASE overrides the server (default http://localhost:6041).
 *
 * Every variant runs on one arrival schedule.
 * A priming load per page fetches each /published/ image once through the dev server's proxy; the filmed loads get those bytes from page.route at once, so only ?slow's deterministic hold decides when an image lands, and a filmed request the priming load did not see stops the run.
 * The clips are filmed at ?slow=700&scatter=600: the scatter stays inside C's 700 ms cap, so the gate never forces a reveal and C and D show their top-down wave.
 * The prototype's default scatter (0 to 1080 ms) lets the cap fire and a later tile overtake an earlier one; pass a third argument, e.g. `1080`, to film that instead.
 *
 * Deterministic by replay, not by wall clock.
 * Each page loads at 390 px and DPR 2 until every visible arrival has finished.
 * Then every animation from document.getAnimations() is paused, and the prototype's are stepped through their recorded start times at 30 frames a second by setting currentTime.
 * The arrivals are CSS animations with fill `both` and the loading layers stay mounted, so a negative currentTime shows the moment before each one started.
 *
 * Each clip holds 250 ms on the first frame (the empty start), plays from the first visible animation to the end of the last one, and holds 600 ms on the arrived page.
 * Consecutive identical frames are merged into one longer frame, which keeps the timing and trims the file.
 * The strip per page has a row per variant and columns loading, arriving (the frame with the most images mid-arrival, marked with how far into the arrival window it falls) and arrived.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.PROTO_BASE ?? 'http://localhost:6041';
const [outDir, variantArg = 'B,C,D', pageArg = 'assets,factions', scatterArg = '600'] = process.argv.slice(2);
if (!outDir) {
  throw new Error('usage: capture.prototype.mjs <outDir> [variants] [pages]');
}
const VARIANTS = variantArg.split(',');
const PAGES = pageArg.split(',');

const SLOW = 700;
const SCATTER = Number(scatterArg);
const QUERY = `slow=${SLOW}&scatter=${SCATTER}`;
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

/*
 * Published image bytes by URL, filled by the priming load and served to every filmed load.
 * `filming` turns a miss into a recorded failure instead of a network fetch.
 */
const published = new Map();
const inFlight = new Set();
let filming = false;
const misses = [];

async function servePublished(context) {
  await context.route('**/published/**', async (request) => {
    const url = request.request().url();
    const cached = published.get(url);
    if (cached) {
      await request.fulfill(cached);
      return;
    }
    if (filming) {
      misses.push(url);
    }
    const pending = (async () => {
      const response = await request.fetch();
      const entry = { status: response.status(), headers: response.headers(), body: await response.body() };
      published.set(url, entry);
      await request.fulfill(entry);
    })();
    inFlight.add(pending);
    await pending.finally(() => inFlight.delete(pending));
  });
}

async function newContext(browser) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: DPR,
    reducedMotion: 'no-preference',
  });
  await servePublished(context);
  return context;
}

/** Waits until the tile count has stopped changing and no tile in the viewport is still loading. */
async function settle(page) {
  await page.waitForSelector('[data-variant][data-phase]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
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
}

/** Loads a page once with D's 1600 px prefetch, which covers every image B and C fetch, so the filmed loads never touch the network. */
async function prime(browser, route) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto(`${BASE}/${route}?variant=D&slow=1&scatter=0`, { waitUntil: 'load' });
  await settle(page);
  await page.waitForLoadState('networkidle');
  await Promise.all(inFlight);
  await context.close();
}

/** Loads the page, then pauses every animation and exposes a seek over the prototype's recorded start times. */
async function prepare(page, route, variant) {
  await page.goto(`${BASE}/${route}?variant=${variant}&${QUERY}`, { waitUntil: 'load' });
  await settle(page);
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
  const context = await newContext(browser);
  const page = await context.newPage();
  filming = true;
  const info = await prepare(page, route, variant);
  filming = false;
  if (misses.length > 0) {
    throw new Error(`${route} ${variant}: requests the priming load did not see ${JSON.stringify(misses)}`);
  }
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
   * Arriving is the frame with the most images mid-arrival, the one nearest 40% into the arrival window on a tie; the strip prints where it fell.
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
  const arriving = frames
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
  /* Whether the visible tiles began arriving in reading order, which C and D promise and B does not. */
  timings.inReadingOrder = timings.arrivals.every(
    (arrival, index, all) => index === 0 || arrival.at >= all[index - 1].at
  );
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
    ['arriving', 'arriving (most mid-reveal)'],
    ['arrived', 'arrived'],
  ];
  const rows = STRIP_ORDER.filter((variant) => results[variant]);
  const width = labelWidth + columns.length * (WIDTH + gap) + gap;
  const height = titleHeight + headHeight + rows.length * (HEIGHT + gap) + gap;

  let svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>`;
  svg += text(gap, 58, 42, `${PAGE_TITLES[route]} at 390 px, ?${QUERY}`, { anchor: 'start' });
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
      const top = titleHeight + headHeight + row * (HEIGHT + gap);
      const left = labelWidth + column * (WIDTH + gap);
      composites.push({ input: results[variant].stills[key], top, left });
      if (key === 'arriving') {
        /* How far into the arrival window this frame falls, over the header's Login link, where it hides no artwork. */
        const pill =
          `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='44'>` +
          `<rect width='150' height='44' rx='22' fill='#2a1d10' fill-opacity='0.86'/>` +
          text(75, 31, 26, `${results[variant].timings.arrivingPercent}% in`, { fill: '#f3e6cc' }) +
          `</svg>`;
        composites.push({ input: Buffer.from(pill), top: top + 8, left: left + WIDTH - 158 });
      }
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
  await prime(browser, route);
  const results = {};
  for (const variant of VARIANTS) {
    results[variant] = await film(browser, route, variant);
    report.push(results[variant].timings);
  }
  await strip(route, results);
}
await browser.close();
await writeFile(join(outDir, 'timings.json'), `${JSON.stringify(report, null, 2)}\n`);
