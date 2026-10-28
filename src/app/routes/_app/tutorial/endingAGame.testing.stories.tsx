import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Ending a game',
  args: { path: '/tutorial/ending-a-game' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

/* The result, public replay and return to play all run through the chapter's real local session. */
export const PlayedThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const step = (title: string) => waitFor(() => expect(current()).toContain(title), { timeout: 60_000 });
    const openWindow = async (name: string) => {
      await userEvent.click(await page.findByRole('button', { name: 'Controls Space' }));
      await userEvent.type(await page.findByRole('textbox', { name: 'Search controls' }), name);
      await userEvent.keyboard('{Enter}');
    };
    await page.findByRole('banner', { name: 'Chapter 16: Ending a game' }, { timeout: 60_000 });
    await step('Start determining the winner');
    await openWindow('Phase');
    await userEvent.click(await page.findByRole('button', { name: 'Determine winner' }));
    await step('Declare a winner');
    await userEvent.click(await page.findByRole('combobox', { name: 'Winning faction' }));
    await userEvent.click(await page.findByRole('option', { name: /Atreides/ }));
    await userEvent.click(page.getByRole('button', { name: 'Declare' }));
    await step('Replay the finished game');
    await openWindow('Replay');
    await userEvent.click(await page.findByRole('button', { name: 'Replay from start' }));
    await step('Step through the saved phases');
    await userEvent.click(page.getAllByRole('button', { name: 'Later phase' })[0]!);
    await step('Return to the live table');
    await userEvent.click(page.getAllByRole('button', { name: 'Return to live' })[0]!);
    await step('Take it back and play on');
    await userEvent.click(await page.findByRole('button', { name: 'Continue playing' }));
    await step('Replay closes when play resumes');
    await expect(page.queryByRole('button', { name: 'Replay from start' })).toBeNull();
    await waitFor(
      async () => {
        if (current().includes('Replay closes when play resumes')) {
          await userEvent.keyboard('{Enter}');
        }
        await expect(page.getByRole('dialog')).toBeVisible();
      },
      { timeout: 20_000, interval: 1000 }
    );
  },
});
