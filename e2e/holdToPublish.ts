import type { Locator } from '@playwright/test';

/**
 * Hold Publish through its five-second countdown in real time.
 * Unlike `holdToDelete` this needs no page clock, whose install would also freeze the editor's own timers mid-save.
 */
export async function holdToPublish(trigger: Locator) {
  const page = trigger.page();
  await trigger.hover();
  await page.mouse.down();
  try {
    await page.waitForTimeout(5500);
  } finally {
    await page.mouse.up();
  }
}
