import { testingPreview } from '@sb/preview';
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
 * Review a saved position, resume play, then remove an absent player through the page's real controls.
 * The guide must recognize each action and reach the Audit record.
 */
export const PlayedThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const step = (title: string, timeout = 30_000) =>
      waitFor(() => expect(currentStep(canvasElement)).toContain(title), { timeout });
    await page.findByRole('banner', { name: 'Chapter 19: Moderation and disputes' }, { timeout: 60_000 });
    const openWindow = async (name: string) => {
      await userEvent.keyboard(' ');
      await userEvent.type(await page.findByRole('textbox', { name: 'Search controls' }), name);
      await userEvent.keyboard('{Enter}');
    };
    const enterAt = async (title: string) => {
      await step(title);
      await waitFor(
        async () => {
          if (currentStep(canvasElement).includes(title)) {
            await userEvent.keyboard('{Enter}');
          }
          await expect(currentStep(canvasElement)).not.toContain(title);
        },
        { timeout: 20_000, interval: 1000 }
      );
    };
    await step('Check the Game log', 60_000);
    await openWindow('Game log');
    await step('Ask to review Storm');
    await openWindow('Table review');
    await userEvent.click(await page.findByRole('button', { name: 'Earlier checkpoint' }));
    await expect(page.getByRole('slider', { name: 'Checkpoint' })).toHaveAttribute('aria-valuenow', '0');
    await userEvent.click(page.getByRole('button', { name: 'Ask the table to review' }));
    await enterAt('A review needs the table to agree');
    await step('Discuss the saved position');
    await expect(page.getByRole('group', { name: 'Table review in progress' })).toBeVisible();
    await enterAt('Discuss the saved position');
    await userEvent.click(page.getAllByRole('button', { name: 'Resume play' })[0]!);
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
    await enterAt('Their seat is open');
    await step('Read the Audit record');
    await openWindow('Audit');
    await page.findByRole('dialog', {}, { timeout: 20_000 });
  },
});
