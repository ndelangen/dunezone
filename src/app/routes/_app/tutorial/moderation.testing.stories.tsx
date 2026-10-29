import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Moderation and disputes',
  args: { path: '/tutorial/moderation' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

const HARKONNEN = 'House Harkonnen';

/* The step at hand, by its title in the rail. */
const currentStep = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.querySelector('[data-state="current"]')?.textContent ?? '';

/*
 * Remove an absent player through the page's real controls after checking the log.
 * The guide must recognize each action and reach the Audit record.
 */
export const PlayedThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const step = (title: string, timeout = 30_000) =>
      waitForFrame(() => expect(currentStep(canvasElement)).toContain(title), { timeout });
    await page.findByRole('banner', { name: 'Chapter 21: Moderation and disputes' }, { timeout: 60_000 });
    const openWindow = async (name: string) => {
      await userEvent.keyboard(' ');
      await userEvent.type(await page.findByRole('textbox', { name: 'Search controls' }), name);
      await userEvent.keyboard('{Enter}');
    };
    await step('Check what happened', 60_000);
    await openWindow('Game log');
    await step('Open player details', 60_000);

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
    /* A vote just started says so in words, never with a clock at 0m 0s. */
    await page.findByText(/more Keep to decide/);
    await expect(page.queryByText(/0m 0s/)).toBeNull();
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
    await step('Read the Audit record');
    await openWindow('Audit');
    await step('Take a look at the record');
    await waitForFrame(() => expect(finishTransitions(page.getByRole('group', { name: 'Audit' }))).toBeVisible());
    await expect(page.queryByRole('dialog', { name: 'Chapter complete, congratulations!' })).toBeNull();
    await userEvent.keyboard('{Enter}');
    await page.findByRole('dialog', {}, { timeout: 20_000 });
  },
});
