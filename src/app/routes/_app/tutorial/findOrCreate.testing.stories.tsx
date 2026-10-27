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
 * Before its step, Create a game shows disabled, says when it opens, and keeps the lobby when pressed, so the steps that read it can still be done;
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
    const early = page.getAllByRole('button', { name: 'Create a game' }).find((button) => button.checkVisibility())!;
    await expect(early).toHaveAttribute('aria-disabled', 'true');
    await expect(early).toHaveAccessibleDescription('You’ll create a game in a later step');
    await userEvent.click(early);
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

/* The step at hand, by its title in the rail. */
const currentStep = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.querySelector('[data-state="current"]')?.textContent ?? '';

async function openedAt(canvasElement: HTMLElement, step: string) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('banner', { name: 'Chapter 2: Find or create a game' }, { timeout: 60_000 });
  await waitFor(() => expect(currentStep(canvasElement)).toContain(step), { timeout: 20_000 });
  return page;
}

/* `?step=5` opens on the create page, where the ruleset is chosen. */
export const OpenedAtChooseARuleset = meta.story({
  args: { path: '/tutorial/find-or-create?step=5' },
  play: async ({ canvasElement }) => {
    const page = await openedAt(canvasElement, 'Choose a ruleset');
    await expect(await page.findByRole('form', { name: 'New game' })).toBeVisible();
  },
});

/* `?step=6` opens on the create page with Dreamrules chosen, so Create game creates the game and the chapter goes on. */
export const OpenedAtCreateTheGame = meta.story({
  args: { path: '/tutorial/find-or-create?step=6' },
  play: async ({ canvasElement }) => {
    const page = await openedAt(canvasElement, 'Create the game');
    const form = await page.findByRole('form', { name: 'New game' });
    await userEvent.click(within(form).getByRole('button', { name: /Create game/ }));
    await waitFor(() => expect(currentStep(canvasElement)).toContain('Copy its link'), { timeout: 20_000 });
  },
});

/* `?step=7` opens on a created game, whose link can be copied. */
export const OpenedAtCopyItsLink = meta.story({
  args: { path: '/tutorial/find-or-create?step=7' },
  play: async ({ canvasElement }) => {
    const page = await openedAt(canvasElement, 'Copy its link');
    await expect(await page.findByText('Your new game')).toBeVisible();
    await expect(page.getByRole('button', { name: /game link/i })).toBeVisible();
  },
});
