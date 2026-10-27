import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Find or create a game',
  args: { path: '/tutorial/find-or-create' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

/*
 * Create a game pressed before its step keeps the lobby, so the steps that read it can still be done;
 * once the chapter reaches it, the same button opens the create page.
 */
export const CreateWaitsForItsStep = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const banner = await page.findByRole('banner', { name: 'Chapter 2: Find or create a game' }, { timeout: 60_000 });
    await within(banner).findByText('The lobby', {}, { timeout: 60_000 });
    const create = () =>
      [...canvasElement.ownerDocument.querySelectorAll<HTMLElement>('[data-tutorial-target="create"]')].find((button) =>
        button.checkVisibility()
      )!;
    await userEvent.click(create());
    await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
    /* The lobby's steps still play: go on, find Thialfi's game, and go on again to Create a game. */
    const current = () => canvasElement.ownerDocument.querySelector('[data-state="current"]')?.textContent ?? '';
    const pressEnterUntil = (next: string) =>
      waitFor(
        async () => {
          if (!current().includes(next)) {
            await userEvent.keyboard('{Enter}');
          }
          await expect(current()).toContain(next);
        },
        { timeout: 20_000, interval: 1000 }
      );
    await pressEnterUntil('Find a friend’s game');
    await userEvent.type(page.getByPlaceholderText(/^Search games/), 'Thialfi');
    await waitFor(() => expect(current()).toContain('Open seats'), { timeout: 20_000 });
    await pressEnterUntil('Create a game');
    await waitFor(
      async () => {
        await userEvent.click(create());
        await expect(page.getByRole('form', { name: 'New game' })).toBeVisible();
      },
      { timeout: 20_000, interval: 1000 }
    );
  },
});
