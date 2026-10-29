import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Join an existing game',
  args: { path: '/tutorial/find-a-game' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

export const FindAndOpen = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const current = () => canvasElement.ownerDocument.querySelector('[data-state="current"]')?.textContent ?? '';
    await page.findByRole('banner', { name: 'Chapter 3: Join an existing game' }, { timeout: 60_000 });
    await waitForFrame(() => expect(current()).toContain("Find your friend's game"));
    await expect(within(page.getByRole('list', { name: 'Games' })).getAllByRole('listitem')).toHaveLength(4);
    const search = page.getByPlaceholderText(/^Search games/);
    await userEvent.type(search, 'Ja');
    await expect(current()).toContain("Find your friend's game");
    await userEvent.type(search, 'd');
    await waitForFrame(() => expect(current()).toContain('Visit their table'), { timeout: 20_000 });
    await expect(within(page.getByRole('list', { name: 'Games' })).getAllByRole('listitem')).toHaveLength(1);
    await waitForFrame(() =>
      expect(page.getByRole('button', { name: 'Open Midnight Caladan tea break' })).toBeEnabled()
    );
    await userEvent.click(page.getByRole('button', { name: 'Open Midnight Caladan tea break' }));
    await page.findByRole('heading', { name: 'Midnight Caladan tea break' }, { timeout: 60_000 });
    await page.findByRole('region', { name: 'Players' }, { timeout: 60_000 });
    await page.findByRole('heading', { name: /Chapter complete/ }, { timeout: 60_000 });
  },
});

export const OpenAtFriend = meta.story({
  args: { path: '/tutorial/find-a-game?step=2' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('banner', { name: 'Chapter 3: Join an existing game' }, { timeout: 60_000 });
    await expect(page.getByPlaceholderText(/^Search games/)).toHaveValue('Jad');
    await userEvent.click(page.getByRole('button', { name: /^Reset$/ }));
    await expect(page.getByPlaceholderText(/^Search games/)).toHaveValue('');
    await expect(within(page.getByRole('list', { name: 'Games' })).getAllByRole('listitem')).toHaveLength(4);
  },
});

export const OldLink = meta.story({
  args: { path: '/tutorial/find-or-create' },
  play: async ({ canvasElement }) => {
    await within(canvasElement.ownerDocument.body).findByRole(
      'banner',
      { name: 'Chapter 3: Join an existing game' },
      { timeout: 60_000 }
    );
  },
});
