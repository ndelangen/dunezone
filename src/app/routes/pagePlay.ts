import { expect, waitFor, within } from 'storybook/test';

/**
 * Small checks the page stories share.
 * Pure helpers over the page, no fixtures and no decorators.
 */
const TIMEOUT = { timeout: 30_000 } as const;

/**
 * An editor at rest is mounted once its text field named `label` reads what the page loaded.
 * A create page reads empty, and an edit page reads the stored value.
 */
export async function expectFieldValue(canvasElement: HTMLElement, label: string, value: string) {
  const field = await within(canvasElement.ownerDocument.body).findByRole('textbox', { name: label }, TIMEOUT);
  await waitFor(() => expect(field).toHaveValue(value), TIMEOUT);
}

/** Each element lies inside the page's width, and the page scrolls no wider than its window. */
export async function expectWithinWidth(canvasElement: HTMLElement, elements: readonly Element[]) {
  const { documentElement } = canvasElement.ownerDocument;
  const bounds = documentElement.getBoundingClientRect();
  for (const element of elements) {
    const box = element.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(bounds.left);
    await expect(box.right).toBeLessThanOrEqual(bounds.right);
  }
  await expect(documentElement.scrollWidth).toBeLessThanOrEqual(documentElement.clientWidth);
}
