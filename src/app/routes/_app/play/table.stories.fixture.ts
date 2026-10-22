import { waitForFrame } from '@sb/storyWaits';
import { userEvent, within } from 'storybook/test';

/** Opens the game menu and returns its stack-count control. */
export async function openTableSettings(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(page.getByRole('button', { name: 'Game menu' }));
  return waitForFrame(() => page.getByRole('menuitemcheckbox', { name: /^Stack counts/ }));
}
