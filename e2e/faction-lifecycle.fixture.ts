import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export async function expectFactionEditReady(page: Page, name: string) {
  /* The address and name can already match while the departing create form remains mounted. */
  await expect(page.getByRole('button', { name: 'Delete faction', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Faction name', exact: true })).toHaveValue(name);
}
