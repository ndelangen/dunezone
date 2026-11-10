import { finishTransitions } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

export async function openVoiceMenu(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const menu = await page.findByRole('button', { name: 'Game menu' }, { timeout: 30_000 });
  await userEvent.click(menu);
  await waitFor(() => expect(finishTransitions(page.getByRole('menu'))).toBeVisible());
  return page;
}
