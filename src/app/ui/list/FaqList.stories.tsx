import { Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { FaqList } from './FaqList';
import { faqItems } from './FaqList.stories.fixture';

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
  play: async ({ canvasElement }) => {
    await expectLean(within(canvasElement));
  },
});

export const WidthBoundary = meta.story({
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--space-xl)', alignItems: 'start' }}>
      <div style={{ width: 400, flexShrink: 0, display: 'grid', gap: 'var(--space-sm)' }} data-testid="faq-at-400">
        <Text size="sm">400 px</Text>
        <FaqList {...args} />
      </div>
      <div style={{ width: 401, flexShrink: 0, display: 'grid', gap: 'var(--space-sm)' }} data-testid="faq-at-401">
        <Text size="sm">401 px</Text>
        <FaqList {...args} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const lean = within(canvas.getByTestId('faq-at-400'));
    const full = within(canvas.getByTestId('faq-at-401'));
    await expectLean(lean);
    await expect(full.getByRole('link', { name: 'Chani' })).toBeVisible();
    await expect(full.getByRole('link', { name: 'Lasgun' })).toBeVisible();
    await expect(full.queryByRole('link', { name: '2 related' })).not.toBeInTheDocument();
    await expect(getComputedStyle(lean.getByText('Only when the ruleset explicitly allows it.')).webkitLineClamp).toBe(
      '1'
    );
    await expect(getComputedStyle(full.getByText('Only when the ruleset explicitly allows it.')).webkitLineClamp).toBe(
      'none'
    );
  },
});

async function expectLean(canvas: ReturnType<typeof within>) {
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

export const LeanOverflow = meta.story({
  args: {
    items: [
      {
        ...faqItems[0]!,
        list_details: {
          ...faqItems[0]!.list_details!,
          accepted_answer: {
            excerpt:
              'The accepted answer stays available in full on the question page. A long excerpt occupies one line in the Lean list so it cannot push the next question further down the page.',
          },
          has_more_answers: true,
          has_more_references: true,
        },
      },
    ],
  },
  render: (args) => (
    <div style={{ width: 400 }}>
      <FaqList {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('link', { name: /Open question:.*Answered, 1\+ answer/ });
    await expect(row).toBeVisible();
    const excerpt = canvas.getByText(/^The accepted answer stays available/);
    await expect(excerpt.clientHeight).toBeLessThanOrEqual(
      Math.ceil(Number.parseFloat(getComputedStyle(excerpt).lineHeight))
    );
    await expect(canvas.getByRole('link', { name: '2+ related' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-movement'
    );
    row.focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onOpenQuestion).toHaveBeenCalledWith('storm-movement', 'dreamrules');
  },
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
