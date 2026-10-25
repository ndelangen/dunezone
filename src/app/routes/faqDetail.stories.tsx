import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

import { forumDatabase, acceptedThread, openReferencePicker, openTreacheryPicker } from './faqDetail.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'FAQ detail',
  ...pageStoryMeta,
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  parameters: { ...pageStoryMeta.parameters, database: db(forumDatabase) },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
});

export const Forum = meta.story({ play: acceptedThread });
export const Phone = meta.story({ globals: { viewport: { value: 'appMobileNarrow' } }, play: acceptedThread });

export const ReferencePicker = meta.story({ play: openReferencePicker });
export const ReferencePickerResults = meta.story({ play: openTreacheryPicker });
export const Unanswered = meta.story({
  parameters: {
    database: db((baseline) => {
      forumDatabase(baseline);
      baseline.faq_answers = [];
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('No answers yet. Be the first to answer.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('textbox', { name: 'Your answer' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByText('Accepted answer')).toBeNull();
  },
});
