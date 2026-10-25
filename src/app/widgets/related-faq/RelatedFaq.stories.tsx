import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { RelatedFaqItem } from '@db/faq';

import { RelatedFaq } from './RelatedFaq';

const question = {
  _id: 'question-1',
  _creationTime: 1,
  ruleset_id: 'classic',
  slug: 'storm-movement',
  question: 'When does the storm move?',
  asked_by: 'asker',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  accepted_answer_id: null,
  faq_answers: [],
  asker_profile: null,
  ruleset: { id: 'classic', name: 'ClassicRules', slug: 'classicrules' },
} as unknown as RelatedFaqItem;
const meta = preview.meta({
  component: RelatedFaq,
  args: { items: [question], status: 'CanLoadMore' as const, onLoadMore: fn(), onOpenQuestion: fn() },
});

export const OneListWithRulesetLabels = meta.story({
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('link', { name: 'ClassicRules' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq'
    );
    await expect(page.getAllByRole('button', { name: 'Load more' })).toHaveLength(1);
    await userEvent.click(page.getByRole('button', { name: 'Load more' }));
    await expect(args.onLoadMore).toHaveBeenCalledOnce();
  },
});
export const Empty = meta.story({ args: { items: [], status: 'Exhausted' as const } });
