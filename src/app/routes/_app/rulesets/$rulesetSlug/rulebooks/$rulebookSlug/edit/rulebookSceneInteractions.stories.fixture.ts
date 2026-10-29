import { waitForFrame } from '@sb/storyWaits';
import { userEvent, within } from 'storybook/test';

/** Adds an item from a scene editor's collapsed section. */
export async function addSceneItem(canvasElement: HTMLElement, section: string, action: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: section }));
  await userEvent.click(await waitForFrame(() => canvas.getByRole('button', { name: action })));
}
