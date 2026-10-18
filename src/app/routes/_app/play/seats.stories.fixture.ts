import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, within } from 'storybook/test';

import { press } from './gameInteractions.stories.fixture';

/*
 * The seat helper is kept apart from the game fixtures so a unit test can load it without the product transport.
 * `game.stories.fixture` re-exports it for the stories.
 */

/** Opens a spectator's seat from the header toolbar and reads it as the named region. */
export async function seatPopover(canvasElement: HTMLElement, name: string) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Dreamrules', level: 1 }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await press(() => page.getByRole('button', { name: 'Seats' }));
  await waitForFrame(() => expect(finishTransitions(page.getByRole('region', { name }))).toBeVisible(), {
    timeout: 30_000,
  });
  return () => within(page.getByRole('region', { name }));
}
