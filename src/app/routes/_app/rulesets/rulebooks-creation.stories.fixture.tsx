import { expect, within } from 'storybook/test';

export async function expectDenied(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Rulebook creation is unavailable' }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
}
