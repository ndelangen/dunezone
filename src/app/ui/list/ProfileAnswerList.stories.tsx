import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import type { ProfileFaqAnswer } from '@db/profiles';

import { ProfileAnswerList } from './ProfileAnswerList';

const ruleset = { id: 'ruleset-1', name: 'Dreamrules', slug: 'dreamrules', coverThumbUrl: null };

const answers = [
  {
    _id: 'faq-answer-1',
    _creationTime: Date.parse('2026-07-18T11:00:00.000Z'),
    faq_item_id: 'faq-question-1',
    answer: 'Only when the ruleset explicitly allows it.',
    answered_by: 'user-1',
    created_at: '2026-07-18T11:00:00.000Z',
    faq_item: {
      id: 'faq-question-1',
      slug: 'storm-movement',
      question: 'Can leaders move through the storm?',
      ruleset_id: 'ruleset-1',
      asked_by: 'user-2',
      accepted_answer_id: 'faq-answer-1',
    },
    asker_profile: { id: 'profile-2', slug: 'stilgar', username: 'Stilgar', avatar_url: null },
    ruleset,
  },
  {
    _id: 'faq-answer-2',
    _creationTime: Date.parse('2026-07-19T11:00:00.000Z'),
    faq_item_id: 'faq-question-2',
    answer: 'At the start of the shipment phase.',
    answered_by: 'user-1',
    created_at: '2026-07-19T11:00:00.000Z',
    faq_item: {
      id: 'faq-question-2',
      slug: 'reserve-forces',
      question: 'When do reserve forces enter play?',
      ruleset_id: 'ruleset-1',
      asked_by: 'user-1',
      accepted_answer_id: null,
    },
    asker_profile: { id: 'profile-1', slug: 'chani', username: 'Chani', avatar_url: null },
    ruleset,
  },
] as unknown as ProfileFaqAnswer[];

const meta = preview.meta({
  component: ProfileAnswerList,
  globals: { backgrounds: { value: 'light', grid: false } },
  parameters: { layout: 'padded' },
  args: { items: answers, viewedProfileId: 'profile-1' },
});

/** An answer to someone else's question cites the asker; one to the viewed person's own question says so instead, and a picked answer wears its marker. */
export const Populated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Stilgar' })).toHaveAttribute('href', '/profiles/stilgar');
    await expect(canvas.getByText('Your question')).toBeVisible();
    await expect(canvas.getByText('Picked answer')).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Only when the ruleset explicitly allows it.' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-movement'
    );
  },
});
