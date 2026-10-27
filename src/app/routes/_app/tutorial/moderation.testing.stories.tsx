import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Moderation',
  args: { path: '/tutorial/moderation' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

const HARKONNEN = 'House Harkonnen';

/* The step at hand, by its title in the rail. */
const currentStep = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.querySelector('[data-state="current"]')?.textContent ?? '';

/*
 * The whole chapter played through the page as a learner plays it: open the Harkonnen player's information from the chat bar,
 * start the vote from their header, and watch the others vote them off, so a guide that no longer finds what it reads fails here.
 */
export const PlayedThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const step = (title: string, timeout = 30_000) =>
      waitFor(() => expect(currentStep(canvasElement)).toContain(title), { timeout });
    await page.findByRole('banner', { name: 'Chapter 19: Moderation' }, { timeout: 60_000 });
    await step('Open the Harkonnen player’s information', 60_000);

    const token = await waitFor(
      () => {
        const found = document.querySelector<HTMLElement>(`[aria-label*=", ${HARKONNEN}"]`);
        if (!found) {
          throw new Error('The Harkonnen token is not on the chat bar yet.');
        }
        return found;
      },
      { timeout: 60_000 }
    );
    await userEvent.click(token);
    const info = await waitFor(
      () => {
        const found = document.querySelector<HTMLElement>(
          `[data-window^="player:"] header button[aria-label="${HARKONNEN} info"]`
        );
        if (!found) {
          throw new Error('The Harkonnen chat has no info button yet.');
        }
        return found;
      },
      { timeout: 20_000 }
    );
    await userEvent.click(info);

    await step('Start a removal vote');
    await userEvent.click(page.getByRole('button', { name: 'Start removal vote' }));
    await step('How a vote is decided');
    await waitFor(
      async () => {
        if (currentStep(canvasElement).includes('How a vote is decided')) {
          await userEvent.keyboard('{Enter}');
        }
        await expect(currentStep(canvasElement)).not.toContain('How a vote is decided');
      },
      { timeout: 20_000, interval: 1000 }
    );
    await step('Their seat is open', 30_000);
    await waitFor(
      async () => {
        if (!page.queryByRole('dialog')) {
          await userEvent.keyboard('{Enter}');
        }
        await expect(page.getByRole('dialog')).toBeVisible();
      },
      { timeout: 20_000, interval: 1000 }
    );
  },
});
