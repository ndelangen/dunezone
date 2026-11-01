import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters, playChapter } from './chapterStory';

/*
 * "Ending a game", as its page serves it: the table from the tutorial's recorded setup, running in the page,
 * with the rail beside it giving one task at a time. Its art comes from the recorded tutorial setup.
 */

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Ending a game',
  args: { path: '/tutorial/ending-a-game' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

/** The chapter as a player meets it: do what the rail says, where its arrow shows, and it moves on by itself. */
export const Chapter = meta.story({
  play: playChapter('Chapter 17: Ending a game', 'Determine the winner'),
});

/* Declaring the result completes the chapter through its real local session. */
export const PlayedThrough = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const step = (title: string) => waitForFrame(() => expect(current()).toContain(title), { timeout: 60_000 });
    const openWindow = async (name: string) => {
      await userEvent.click(await page.findByRole('button', { name: 'Controls Space' }));
      await userEvent.type(await page.findByRole('textbox', { name: 'Search controls' }), name);
      await userEvent.keyboard('{Enter}');
    };
    await page.findByRole('banner', { name: 'Chapter 17: Ending a game' }, { timeout: 60_000 });
    await step('Determine the winner');
    await openWindow('Phase');
    await userEvent.click(await page.findByRole('button', { name: 'Determine winner' }));
    await step('Declare the result');
    await userEvent.click(await page.findByRole('combobox', { name: 'Winning faction' }));
    await userEvent.click(await page.findByRole('option', { name: /Atreides/ }));
    await userEvent.click(page.getByRole('button', { name: 'Declare' }));
    await waitForFrame(
      () => expect(page.getByRole('dialog', { name: 'Chapter complete, congratulations!' })).toBeVisible(),
      { timeout: 20_000 }
    );
    await expect(page.queryByRole('button', { name: 'Keep playing' })).toBeNull();
  },
});
