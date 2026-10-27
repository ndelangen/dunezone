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

/* `?step=3` opens on Open seats with Thialfi's name in the search, so only their games are left as the step says, and the chapter goes on. */
export const OpenedAtOpenSeats = meta.story({
  args: { path: '/tutorial/find-or-create?step=3' },
  play: async ({ canvasElement }) => {
    const page = await openedAt(canvasElement, 'Open seats');
    await expect(page.getByPlaceholderText(/^Search games/)).toHaveValue('Thialfi');
    const games = within(page.getByRole('list', { name: 'Games' })).getAllByRole('listitem');
    /* Thialfi shows as a seat round each table left, named on its face. */
    for (const game of games) {
      await expect(game.querySelector('[aria-label*="Thialfi"]')).not.toBeNull();
    }
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(currentStep(canvasElement)).toContain('Create a game'), { timeout: 20_000 });
  },
});

/* `?step=5` opens on the create page, where the ruleset is chosen. */
export const OpenedAtChooseARuleset = meta.story({
  args: { path: '/tutorial/find-or-create?step=5' },
  play: async ({ canvasElement }) => {
    const page = await openedAt(canvasElement, 'Choose a ruleset');
    const form = await page.findByRole('form', { name: 'New game' });
    await expect(form).toBeVisible();
    /* The arrow lands beside the ruleset field and leaves its label clear, however high the pass's name sets the form. */
    const label = form.querySelector('.mantine-Select-root label')!;
    const arrow = () =>
      canvasElement.ownerDocument.querySelector<SVGPathElement>('path[data-target]:not([data-target=""])');
    await waitFor(() => expect(arrow()).not.toBeNull(), { timeout: 20_000 });
    /* It aims at the whole field, label and all, so the gap its tip keeps holds from the label as well as the input. */
    const aimsAtField = () => {
      const field = label.closest('.mantine-Select-root')!.getBoundingClientRect();
      const [x, y] = arrow()!.getAttribute('data-target')!.split(' ').map(Number);
      return Math.abs(x! - (field.left + field.width / 2)) <= 1 && Math.abs(y! - (field.top + field.height / 2)) <= 1;
    };
    const covers = () => {
      const path = arrow()!;
      const origin = path.ownerSVGElement!.getBoundingClientRect();
      const box = label.getBoundingClientRect();
      for (let x = box.left; x <= box.right; x += 2) {
        for (let y = box.top; y <= box.bottom; y += 2) {
          if (path.isPointInFill(new DOMPoint(x - origin.left, y - origin.top))) {
            return true;
          }
        }
      }
      return false;
    };
    /* A name on one line sets the form higher; the barbs as well as the tip still leave the label clear (guideArrow.test.ts covers the slanted approach). */
    const custom = within(form).getByRole('switch', { name: 'Set a custom name' });
    if (!(custom as HTMLInputElement).checked) {
      await userEvent.click(custom);
    }
    const name = within(form).getByPlaceholderText('Name your game');
    await userEvent.clear(name);
    await userEvent.type(name, 'Caladan wedding traitor');
    await waitFor(() => expect(aimsAtField()).toBe(true), { timeout: 5000 });
    await expect(covers()).toBe(false);
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
