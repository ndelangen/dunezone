import { expect, within } from 'storybook/test';

export const storyPage = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);

/** The detail page's heading names the asset, and its head shows the face beside it. */
export async function findDetailFace(canvasElement: HTMLElement, name: string) {
  const page = storyPage(canvasElement);
  await expect(page.findByRole('heading', { name, level: 1 }, { timeout: 30_000 })).resolves.toBeVisible();
  return page.getByRole('img', { name: `${name} face` });
}
