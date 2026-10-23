import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { seedRulesets, questionRows } from './faq.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'FAQ',
  ...pageStoryMeta,
});

/**
 * "Load more" lengthens the list in place until every match is shown, and hands focus to the first new row so a keyboard reader carries on from there.
 * Another search starts at its first matches, and so does the first search when it comes back;
 * picking a ruleset starts it again too.
 */
export const LoadMore = meta.story({
  args: { path: '/faq?q=storm' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 25)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    const loadMore = await main.findByRole('button', { name: 'Load more' }, { timeout: 30_000 });
    await expect(questionRows(main)).toHaveLength(24);

    await userEvent.click(loadMore);
    await waitFor(() => expect(questionRows(main)).toHaveLength(28), { timeout: 30_000 });
    await waitFor(() => expect(questionRows(main)[24]).toHaveFocus());
    await expect(main.getByRole('status')).toHaveTextContent('More questions loaded');
    await expect(main.getByRole('link', { name: 'Storm question 03?' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq/storm-question-03'
    );
    await expect(main.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();

    /* The numbered questions alone outnumber one answer, so this search has more to load too, and starts at its first matches. */
    const searchBox = page.getByRole('textbox', { name: 'Search FAQ questions' });
    await userEvent.clear(searchBox);
    await userEvent.type(searchBox, 'question{Enter}');
    await waitFor(() => expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull(), {
      timeout: 30_000,
    });
    await expect(questionRows(main)).toHaveLength(24);
    await expect(main.getByRole('button', { name: 'Load more' })).toBeVisible();

    /* Back to the first search: its longer list is not remembered, and none is being asked for. */
    await userEvent.clear(searchBox);
    await userEvent.type(searchBox, 'storm{Enter}');
    await expect(
      main.findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(questionRows(main)).toHaveLength(24);
    await expect(questionRows(main)[0]?.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await expect(main.getByRole('button', { name: 'Load more' })).toBeVisible();

    await userEvent.click(page.getByRole('combobox', { name: 'Rulesets' }));
    await userEvent.click(await page.findByRole('option', { name: /Dreamrules/ }));
    /* Two questions are all that match in Dreamrules, so the list is short again and there is no more to load. */
    await waitFor(() => expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull(), {
      timeout: 30_000,
    });
    await expect(main.getByRole('link', { name: 'Can I ship troops into the storm?' })).toBeVisible();
    await expect(questionRows(main)).toHaveLength(2);
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
});
