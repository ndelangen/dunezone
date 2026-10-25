import { expect, within } from 'storybook/test';

export async function findTitledPage(canvasElement: HTMLElement, name: RegExp) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(page.findByRole('heading', { level: 1, name }, { timeout: 30_000 })).resolves.toBeVisible();
  return page;
}

export const titled =
  (name: RegExp) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await findTitledPage(canvasElement, name);
  };
