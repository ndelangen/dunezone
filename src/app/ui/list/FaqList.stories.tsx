import preview from '@sb/preview';
import { fn } from 'storybook/test';

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
    searchQuery: '',
    onOpenQuestion: fn(),
    emptyLabel: 'No FAQ items yet.',
    noMatchesLabel: 'No questions match your search.',
  },
});

export const Populated = meta.story({});

/** Nothing has been asked yet. The words are the page's, so the story passes them like a page would. */
export const NoItems = meta.story({
  args: {
    items: [],
  },
});

/** Questions exist, but the reader's search excludes them all, which reads differently from having none. */
export const NoFilteredMatches = meta.story({
  args: {
    searchQuery: 'ornithopter timing',
  },
});
