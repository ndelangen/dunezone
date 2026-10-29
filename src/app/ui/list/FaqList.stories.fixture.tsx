import type { within } from 'storybook/test';
import { expect } from 'storybook/test';

import type { FaqItemWithDetails } from '@db/faq';

export const faqItems = [
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
    list_details: {
      accepted_answer: { excerpt: 'Only when the ruleset explicitly allows it.' },
      answerers: [{ id: 'profile-2', slug: 'chani', username: 'Chani', avatar_url: null }],
      references: [
        { kind: 'asset', name: 'Lasgun', slug: 'lasgun', type: 'card-treachery' },
        { kind: 'faction', name: 'Atreides', slug: 'atreides' },
      ],
      has_more_references: false,
      has_more_answers: false,
    },
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
    list_details: {
      accepted_answer: null,
      answerers: [],
      references: [],
      has_more_references: false,
      has_more_answers: false,
    },
  },
] as unknown as FaqItemWithDetails[];

export async function expectLean(canvas: ReturnType<typeof within>) {
  await expect(canvas.getByRole('link', { name: 'Can leaders move through the storm?' })).toBeVisible();
  await expect(canvas.queryByRole('link', { name: 'Chani' })).not.toBeInTheDocument();
  await expect(canvas.queryByRole('link', { name: 'Stilgar' })).not.toBeInTheDocument();
  await expect(canvas.queryByRole('link', { name: 'Lasgun' })).not.toBeInTheDocument();
  await expect(canvas.getByRole('link', { name: '2 related' })).toHaveAttribute(
    'href',
    '/rulesets/dreamrules/faq/storm-movement'
  );
  for (const label of canvas.getAllByText('Asked by:')) {
    await expect(label).not.toBeVisible();
  }
  await expect(canvas.getByText('Answered by:')).not.toBeVisible();
  await expect(canvas.getByText('Rules', { exact: true })).not.toBeVisible();
}
