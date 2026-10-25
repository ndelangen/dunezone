import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FaqList } from './FaqList';
import { faqItems, expectLean } from './FaqList.stories.fixture';

const meta = testingPreview.meta({
  title: 'FaqList',
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

/** The same component given less room, without a viewport breakpoint. */
export const Narrow = meta.story({
  render: (args) => (
    <div style={{ width: 320 }}>
      <FaqList {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expectLean(within(canvasElement));
  },
});

export const NarrowMixedRulesets = meta.story({
  args: {
    rulesetSlug: undefined,
    items: faqItems.map((item) => ({ ...item, ruleset: { name: 'Dreamrules', slug: 'dreamrules' } })),
  },
  render: (args) => (
    <div style={{ width: 400 }}>
      <FaqList {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectLean(canvas);
    await expect(canvas.getAllByRole('link', { name: 'Dreamrules' })).toHaveLength(2);
    await expect(canvas.getByRole('link', { name: /Open question:.*Unanswered, 0 answers/ })).toBeVisible();
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
