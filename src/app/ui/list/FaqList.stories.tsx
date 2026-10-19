import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import type { FaqItemWithDetails } from '@db/faq';

import { FaqList } from './FaqList';

const faqItems = [
  {
    _id: 'faq-question-1',
    _creationTime: Date.parse('2026-07-18T10:00:00.000Z'),
    ruleset_id: 'ruleset-1',
    slug: 'storm-movement',
    question: 'Can leaders move through the storm?',
    tags: ['rules'],
    asked_by: 'user-1',
    created_at: '2026-07-18T10:00:00.000Z',
    updated_at: '2026-07-18T10:00:00.000Z',
    accepted_answer_id: 'faq-answer-1',
    faq_answers: [
      {
        _id: 'faq-answer-1',
        _creationTime: Date.parse('2026-07-18T11:00:00.000Z'),
        faq_item_id: 'faq-question-1',
        answer: 'Only when the ruleset explicitly allows it.',
        answered_by: 'user-2',
        created_at: '2026-07-18T11:00:00.000Z',
      },
    ],
    asker_profile: {
      id: 'profile-1',
      slug: 'stilgar',
      username: 'Stilgar',
      avatar_url: null,
    },
  },
  {
    _id: 'faq-question-2',
    _creationTime: Date.parse('2026-07-18T12:00:00.000Z'),
    ruleset_id: 'ruleset-1',
    slug: 'reserve-forces',
    question: 'When do reserve forces enter play?',
    tags: ['strategy', 'army_list'],
    asked_by: 'user-2',
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:00:00.000Z',
    accepted_answer_id: null,
    faq_answers: [],
    asker_profile: null,
  },
] as unknown as FaqItemWithDetails[];

const meta = preview.meta({
  component: FaqList,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'padded',
  },
  args: {
    items: faqItems,
    rulesetSlug: 'dreamrules',
    onOpenQuestion: fn(),
    emptyLabel: 'No FAQ items yet.',
  },
});

export const Populated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Can leaders move through the storm?' })).toBeVisible();
    await expect(canvas.getByLabelText('Answered, 1 answer')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'When do reserve forces enter play?' })).toBeVisible();
    await expect(canvas.getByLabelText('Unanswered, 0 answers')).toBeVisible();
  },
});

/** Nothing has been asked yet. The words are the page's, so the story passes them like a page would. */
export const NoItems = meta.story({
  args: {
    items: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No FAQ items yet.')).toBeVisible();
  },
});

/** Drawn from several rulesets, as the global FAQ's search is: each question says which ruleset it belongs to and links there. */
export const AcrossRulesets = meta.story({
  args: {
    rulesetSlug: undefined,
    items: [
      { ...faqItems[0]!, ruleset: { name: 'Dreamrules', slug: 'dreamrules' } },
      { ...faqItems[1]!, ruleset: { name: 'ClassicRules', slug: 'classicrules' } },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Can leaders move through the storm?' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-movement'
    );
    await expect(canvas.getByRole('link', { name: 'When do reserve forces enter play?' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq/reserve-forces'
    );
    await expect(canvas.getByRole('link', { name: 'ClassicRules' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq'
    );
  },
});
