import { chromium } from 'playwright';
import { expect, test } from 'vite-plus/test';

import { expectFactionEditReady } from '../e2e/faction-lifecycle.fixture';

test('the edit URL and shared name cannot establish that the create form has unmounted', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('https://faction.invalid/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><input aria-label="Faction name" value="Shared faction">',
      })
    );
    /* The old create form retains this value after navigation updates the address. */
    await page.goto('https://faction.invalid/factions/shared/edit');
    await expect(expectFactionEditReady(page, 'Shared faction')).rejects.toThrow(/Delete faction/);

    /* Only the mounted edit page offers deletion. The shared field is still unchanged. */
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.textContent = 'Delete faction';
      document.body.append(button);
    });
    await expect(expectFactionEditReady(page, 'Shared faction')).resolves.toBeUndefined();
  } finally {
    await browser.close();
  }
}, 15_000);
