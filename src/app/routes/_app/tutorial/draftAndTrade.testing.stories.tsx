import { testingPreview } from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { pageStoryMeta } from '../../storybookConfig';
import { chapterGlobals, chapterParameters } from './chapterStory';

const meta = testingPreview.meta({
  ...pageStoryMeta,
  title: 'Tutorial/Draft and trade',
  args: { path: '/tutorial/draft-and-trade' },
  globals: chapterGlobals,
  parameters: chapterParameters,
});

export const SearchDraftBanAndReady = meta.story({
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const current = () => document.querySelector('[data-state="current"]')?.textContent ?? '';
    const step = (name: string) => waitForFrame(() => expect(current()).toContain(name), { timeout: 60_000 });
    await step('Find a faction');
    const search = await page.findByRole('textbox', { name: 'Search factions' });
    await userEvent.type(search, 'atr');
    await step('Find a suitable faction');
    await expect(page.getByText('suitable for this ruleset', { exact: true })).toBeVisible();
    await expect(current()).toContain('drafting the same faction more than once gets confusing');
    await userEvent.clear(search);
    await userEvent.type(search, 'Emperor');
    await step('Draft Emperor');
    const emperor = within(page.getByText('suitable for this ruleset', { exact: true }).closest('li')!);
    await expect(emperor.getByText('Emperor', { exact: true })).toBeVisible();
    await userEvent.click(emperor.getByRole('button', { name: 'Draft' }));
    await step('Ban the Ixians');
    await userEvent.clear(search);
    await userEvent.type(search, 'Ixians');
    const ixians = within(page.getByText('suitable for this ruleset', { exact: true }).closest('li')!);
    await expect(ixians.getByText('Ixians', { exact: true })).toBeVisible();
    await userEvent.click(ixians.getByRole('button', { name: 'Ban' }));
    await step('Ready for the deal');
    await waitForFrame(() => expect(page.getByText('5 of 6 ready')).toBeVisible());
    await userEvent.click(page.getByRole('button', { name: 'Ready' }));
    await step('Offer a trade');
    await expect(current()).toContain('You got');
    await expect(current()).toContain('four minutes');
  },
});
