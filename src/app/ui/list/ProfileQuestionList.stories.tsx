import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import type { ProfileFaqQuestion } from '@db/profiles';

import { ProfileQuestionList } from './ProfileQuestionList';

const questions = [
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
    accepted_answer_id: null,
    ruleset: { id: 'ruleset-1', name: 'Dreamrules', slug: 'dreamrules', coverThumbUrl: '/image/texture/021.jpg' },
  },
  {
    _id: 'faq-question-2',
    _creationTime: Date.parse('2026-07-18T12:00:00.000Z'),
    ruleset_id: 'ruleset-2',
    slug: 'reserve-forces',
    question: 'When do reserve forces enter play?',
    tags: ['strategy'],
    asked_by: 'user-1',
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:00:00.000Z',
    accepted_answer_id: null,
    ruleset: { id: 'ruleset-2', name: 'ClassicRules', slug: 'classicrules', coverThumbUrl: null },
  },
] as unknown as ProfileFaqQuestion[];

const meta = preview.meta({
  component: ProfileQuestionList,
  globals: { backgrounds: { value: 'light', grid: false } },
  parameters: { layout: 'padded' },
  args: { items: questions },
});

/** Each question cites its ruleset, by its cover where the ruleset has one, and links to its own thread. */
export const Populated = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Can leaders move through the storm?' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-movement'
    );
    await expect(canvas.getByRole('link', { name: 'Dreamrules' })).toHaveAttribute('href', '/rulesets/dreamrules');
    await expect(canvas.getByRole('link', { name: 'ClassicRules' })).toHaveAttribute('href', '/rulesets/classicrules');
  },
});
