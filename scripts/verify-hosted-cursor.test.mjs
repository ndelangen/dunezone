import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, onTestFinished, test } from 'vitest';

import { cursorBounds } from './verify-hosted-cursor.mjs';

/* Chromium can take 30 s to exit on a loaded Mac (scripts/play-load/browsers.test.mjs), so the teardown has its own budget. */
const teardownBudget = 65_000;

const sender = { view: () => ({ viewer: { displayName: 'Player B' } }) };

/* The drawn cursor as ScenePresence lays it out: the hand beside the name label, inside the wrapper drei's Html positions. */
const cursor = (wrapperStyle) => `
  <div id="wrapper" style="position: absolute; left: 100px; top: 120px; ${wrapperStyle}">
    <div style="display: flex"><svg width="26" height="32"><path d="M0 0h26v32H0z" /></svg><span>Player B</span></div>
  </div>`;

let browser;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});
afterAll(() => browser?.close(), teardownBudget);

async function fixturePage(content) {
  const page = await browser.newPage();
  onTestFinished(() => page.close());
  await page.setContent(content);
  return page;
}

/**
 * `page` as the check reaches it, except that `step` runs in the page each time one of the check's calls into the page returns.
 * That fixes the moment the cursor changes to the gap between two calls, whatever the host's load.
 */
function stepping(page, step) {
  const wrap = (target) =>
    new Proxy(target, {
      get(object, property) {
        const value = Reflect.get(object, property);
        if (typeof value !== 'function') {
          return value;
        }
        return (...args) => {
          const result = value.apply(object, args);
          if (result instanceof Promise) {
            return result.then(async (answer) => {
              await page.evaluate(step);
              return answer;
            });
          }
          return typeof result === 'object' && result !== null ? wrap(result) : result;
        };
      },
    });
  return wrap(page);
}

test('a cursor that moves and fades out after the first read is judged on that read alone', async () => {
  const page = await fixturePage(cursor(''));
  const recipient = {
    page: stepping(page, () => {
      const wrapper = document.getElementById('wrapper');
      wrapper.style.left = '300px';
      wrapper.style.opacity = '0';
    }),
  };
  await expect(cursorBounds(recipient, sender)).resolves.toEqual({ x: 100, y: 120, width: 26, height: 32 });
});

test('a cursor inside a fully transparent ancestor is refused', async () => {
  const page = await fixturePage(cursor('opacity: 0'));
  await expect(cursorBounds({ page }, sender)).rejects.toThrow(
    'The remote cursor or one of its ancestors is fully transparent.'
  );
});

test('the check waits for a cursor that is drawn later', async () => {
  const page = await fixturePage(`${cursor('display: none')}
    <script>setTimeout(() => { document.getElementById('wrapper').style.display = ''; }, 300);</script>`);
  await expect(cursorBounds({ page }, sender)).resolves.toEqual({ x: 100, y: 120, width: 26, height: 32 });
});
