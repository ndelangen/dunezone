import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

export async function loadExisting(canvasElement: HTMLElement, noun: string, option: RegExp) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: `Load existing ${noun}` }));
  await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: option })));
  const load = await page.findByRole('button', { name: new RegExp(`^Load ${noun}$`) });
  /* The choice is read from its own page before it can be loaded. */
  await waitFor(() => expect(load).toBeEnabled());
  await userEvent.click(load);
  return page;
}
