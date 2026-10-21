import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

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
    await expect(canvas.getByRole('link', { name: /Answered, 1 answer/ })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'When do reserve forces enter play?' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: /Unanswered, 0 answers/ })).toBeVisible();
    await expect(canvas.getByText('Only when the ruleset explicitly allows it.')).toBeVisible();
    await expect(canvas.getAllByText('Answered by:')).toHaveLength(1);
    await expect(canvas.queryByText('No answers yet.')).not.toBeInTheDocument();
    await expect(canvas.queryByText('Nobody yet')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('link', { name: 'Dreamrules' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Chani' })).toHaveAttribute('href', '/profiles/chani');
    await expect(canvas.getByRole('link', { name: 'Lasgun' })).toHaveAttribute('href', '/assets/card-treachery/lasgun');
    await expect(canvas.getByRole('link', { name: 'Atreides' })).toHaveAttribute('href', '/factions/atreides');
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

/** The same component given less room, without a viewport breakpoint. */
export const Narrow = meta.story({
  render: (args) => (
    <div style={{ width: 320 }}>
      <FaqList {...args} />
    </div>
  ),
});

export const Medium = meta.story({
  render: (args) => (
    <div style={{ width: 560 }}>
      <FaqList {...args} />
    </div>
  ),
});

export const Wide = meta.story({
  render: (args) => (
    <div style={{ width: 960 }}>
      <FaqList {...args} />
    </div>
  ),
});

export const OpenDiscussion = meta.story({
  args: {
    items: [
      {
        ...faqItems[0]!,
        accepted_answer_id: null,
        list_details: {
          ...faqItems[0]!.list_details!,
          accepted_answer: null,
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Answered by:')).toBeVisible();
    await expect(canvas.queryByText('Only when the ruleset explicitly allows it.')).not.toBeInTheDocument();
  },
});

export const MoreReferences = meta.story({
  args: { items: [{ ...faqItems[0]!, list_details: { ...faqItems[0]!.list_details!, has_more_references: true } }] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'View all references' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-movement'
    );
  },
});

export const RowActivation = meta.story({
  decorators: [
    (Story) => (
      <div
        onClickCapture={(event) => {
          if ((event.target as Element).closest('a')) {
            event.preventDefault();
          }
        }}
      >
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('link', { name: /^Open question: Can leaders move through the storm\?/ });
    await userEvent.click(row);
    await expect(args.onOpenQuestion).toHaveBeenCalledWith('storm-movement', 'dreamrules');
    const calls = (args.onOpenQuestion as ReturnType<typeof fn>).mock.calls.length;
    await userEvent.click(canvas.getByRole('link', { name: 'Chani' }));
    await userEvent.click(canvas.getByRole('link', { name: 'Lasgun' }));
    await expect(args.onOpenQuestion).toHaveBeenCalledTimes(calls);
    row.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onOpenQuestion).toHaveBeenCalledTimes(calls + 1);
    await expect(canvas.getByRole('link', { name: 'Chani' }).querySelector('span:last-child')).not.toHaveStyle({
      textDecoration: 'underline',
    });
  },
});

export const LongDiscussion = meta.story({
  args: {
    items: [
      {
        ...faqItems[0]!,
        accepted_answer_id: null,
        list_details: {
          ...faqItems[0]!.list_details!,
          accepted_answer: null,
          has_more_answers: true,
        },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'View all answers' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-movement'
    );
  },
});
