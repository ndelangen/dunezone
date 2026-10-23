import { Menu } from '@mantine/core';
import { testingPreview } from '@sb/preview';
import { finishTransitions } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Default } from './Menu.stories';

const meta = testingPreview.meta({
  title: 'Menu',
  component: Menu,
  parameters: { layout: 'centered' },
  args: { position: 'bottom-end', shadow: 'md', withinPortal: true },
});

/**
 * The runner withholds animation frames for seconds while the page is busy, and a Mantine menu mounts its dropdown from inside one.
 * This story holds every frame back by a second and a half around the open, longer than Testing Library's default second, and expects the item all the same.
 * It is the guard for the suite-wide wait in `.storybook/storyWaits.ts` (https://github.com/ndelangen/dunezone/issues/1248): with that bound removed it fails naming the item.
 * The hold sits above the frame recorder, so a failure here reports the runner's own lag, not the hold.
 * The wait finishes the dropdown's fade, so it waits on the held frames that mount and open the dropdown and not on the frames that draw the fade (https://github.com/ndelangen/dunezone/issues/1303).
 */
export const OpensWhileFramesAreWithheld = meta.story({
  render: Default.input.render,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const view = canvasElement.ownerDocument.defaultView!;
    const requestFrame = view.requestAnimationFrame.bind(view);
    view.requestAnimationFrame = (callback: FrameRequestCallback) =>
      view.setTimeout(() => requestFrame(callback), 1500) as unknown as number;
    try {
      await userEvent.click(page.getByRole('button', { name: 'Actions for House Atreides' }));
      await waitFor(() =>
        expect(finishTransitions(page.getByRole('menuitem', { name: 'Remove from Dreamrules' }))).toBeVisible()
      );
    } finally {
      view.requestAnimationFrame = requestFrame;
    }
  },
});
