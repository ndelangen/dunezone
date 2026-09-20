import type { Locator } from '@playwright/test';

/** Install the page clock before navigation, then advance every countdown tick while the pointer stays down. */
export async function holdToDelete(trigger: Locator) {
  const page = trigger.page();
  await trigger.hover();
  await page.mouse.down();
  try {
    /* fastForward fires an interval only once; the hold needs all five ticks. */
    await page.clock.runFor(5000);
  } finally {
    await page.mouse.up();
  }
}
