import type { Page } from 'playwright';

import type { Point } from './verify-hosted-types';

/** A quick native drag, with the press and first move queued before either waits for the page. */
export async function quickNativeDrag(page: Page, start: Point, finish: Point, steps = 2) {
  await page.mouse.move(start.x, start.y);
  const input = await page.context().newCDPSession(page);
  const move = (step: number) =>
    input.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x + ((finish.x - start.x) * step) / steps,
      y: start.y + ((finish.y - start.y) * step) / steps,
      button: 'left',
      buttons: 1,
    });
  try {
    /* Playwright awaits each native input acknowledgement, even with Promise.all. A slow press handler can
     * turn that round trip into a hold. CDP queues both actual inputs without waiting for the first handler. */
    await Promise.all([
      input.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...start,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      }),
      move(1),
    ]);
    for (let step = 2; step <= steps; step++) {
      await move(step);
    }
  } finally {
    try {
      await input.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...finish,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      });
    } finally {
      await input.detach();
    }
    /* Keep Playwright's next move in sync with where the native drag left the pointer. */
    await page.mouse.move(finish.x, finish.y);
  }
}
