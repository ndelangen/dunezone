import { expect, within } from 'storybook/test';

/** The deletion page once loaded, with its delete control held back until the outcome is acknowledged. */
export async function findDeletionPage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Delete account', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await expect(page.findByRole('button', { name: 'Delete account' }, { timeout: 30_000 })).resolves.toBeDisabled();
  return page;
}
