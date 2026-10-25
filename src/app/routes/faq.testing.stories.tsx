import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ruleset } from '@db/storybook';

import { findFaqMain, seedRulesets, questionRows } from './faq.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'FAQ',
  ...pageStoryMeta,
});

/**
 * "Load more" lengthens the list in place until every match is shown, and hands focus to the first new row so a keyboard reader carries on from there.
 * Another search starts at its first matches, and so does the first search when it comes back;
 * picking a ruleset starts it again too.
 */
export const LoadMore = meta.story({
  args: { path: '/faq?q=storm' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 25)) },
  play: async ({ canvasElement }) => {
    const { page, main } = await findFaqMain(canvasElement);
    const loadMore = await main.findByRole('button', { name: 'Load more' }, { timeout: 30_000 });
    await expect(questionRows(main)).toHaveLength(24);

    await userEvent.click(loadMore);
    await waitFor(() => expect(questionRows(main)).toHaveLength(28), { timeout: 30_000 });
    await waitFor(() => expect(questionRows(main)[24]).toHaveFocus());
    await expect(main.getByRole('status')).toHaveTextContent('More questions loaded');
    await expect(main.getByRole('link', { name: 'Storm question 03?' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq/storm-question-03'
    );
    await expect(main.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();

    /* The numbered questions alone outnumber one answer, so this search has more to load too, and starts at its first matches. */
    const searchBox = page.getByRole('textbox', { name: 'Search FAQ questions' });
    await userEvent.clear(searchBox);
    await userEvent.type(searchBox, 'question{Enter}');
    await waitFor(() => expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull(), {
      timeout: 30_000,
    });
    await expect(questionRows(main)).toHaveLength(24);
    await expect(main.getByRole('button', { name: 'Load more' })).toBeVisible();

    /* Back to the first search: its longer list is not remembered, and none is being asked for. */
    await userEvent.clear(searchBox);
    await userEvent.type(searchBox, 'storm{Enter}');
    await expect(
      main.findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(questionRows(main)).toHaveLength(24);
    await expect(questionRows(main)[0]?.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
    await expect(main.getByRole('button', { name: 'Load more' })).toBeVisible();

    await userEvent.click(page.getByRole('combobox', { name: 'Rulesets' }));
    await userEvent.click(await page.findByRole('option', { name: /Dreamrules/ }));
    /* Two questions are all that match in Dreamrules, so the list is short again and there is no more to load. */
    await waitFor(() => expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull(), {
      timeout: 30_000,
    });
    await expect(main.getByRole('link', { name: 'Can I ship troops into the storm?' })).toBeVisible();
    await expect(questionRows(main)).toHaveLength(2);
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
});

/** Before any search: how the FAQ works, told as one exchange, and the way to the rulesets to ask on. */
export const Explainer = meta.story({
  globals: { motion: 'on' },
  args: { path: '/faq' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Community FAQ' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'How the FAQ works' })).toBeVisible();
    await expect(page.getByText('Accepted answer')).toBeInTheDocument();
    await expect(page.getByRole('link', { name: 'Browse the rulesets' })).toHaveAttribute('href', '/rulesets');
    await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
    await expect(page.queryByRole('main')?.querySelector('table')).toBeNull();
  },
});

/**
 * A picked ruleset that holds no questions yet is not among the select's options.
 * Its pill still stands, named by its slug, since the picks are listed in slug order and it comes first, and the search runs within the rulesets that do have questions.
 */
export const PickedRulesetWithoutQuestions = meta.story({
  args: { path: '/faq?q=storm&rulesets=barren,classicrules' },
  parameters: {
    database: db((baseline) => {
      baseline.rulesets.push(ruleset({ name: 'Barren' }));
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const { page, main } = await findFaqMain(canvasElement);
    await expect(
      main.findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const pill = page.getByText('barren', { selector: '.mantine-Pill-label' });
    await expect(pill).toBeVisible();
    /* Mantine keeps a pill's remove button from assistive tech, since Backspace drops the last pick, so it is found by its class. */
    await expect(pill.closest('.mantine-Pill-root')?.querySelector('.mantine-Pill-remove')).not.toBeNull();
    await expect(page.getByText('and 1 more rulesets')).toBeInTheDocument();
  },
});

/** A single selected ruleset supplies the context for every result. */
export const SingleRuleset = meta.story({
  args: { path: '/faq?q=storm&rulesets=classicrules' },
  play: async ({ canvasElement }) => {
    const { main } = await findFaqMain(canvasElement);
    await expect(
      main.findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(main.queryByRole('link', { name: /^ClassicRules$/ })).toBeNull();
  },
});

/** Unknown filters fall back to global search, so rows keep their real ruleset and destination. */
export const MissingRuleset = meta.story({
  args: { path: '/faq?q=storm&rulesets=missing' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 0)) },
  play: async ({ canvasElement }) => {
    const { main } = await findFaqMain(canvasElement);
    await expect(
      main.findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toHaveAttribute('href', '/rulesets/classicrules/faq/when-does-the-storm-move');
    await expect(main.getByRole('link', { name: 'Can I ship troops into the storm?' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-and-shipment'
    );
    await expect(main.getByRole('link', { name: 'ClassicRules' })).toBeVisible();
    await expect(main.getAllByRole('link', { name: 'Dreamrules' })[0]).toBeVisible();
  },
});

/** Wrapped replies keep the normal list gap before acceptance. */
export const ExplainerSpacing = meta.story({
  args: { path: '/faq' },
  globals: { motion: 'on', viewport: { value: 'appAuthoringTablet' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Pause animation' }, { timeout: 30_000 }));
    const list = page.getByRole('list', { name: 'Example answers' });
    for (const animation of list.parentElement!.getAnimations({ subtree: true })) {
      const timing = animation.effect!.getTiming();
      animation.currentTime = (timing.delay ?? 0) + Number(timing.duration) * 1.7;
    }
    const first = page.getByRole('article', { name: "Stilgar's example answer" }).getBoundingClientRect();
    const second = page.getByRole('article', { name: "Liet's example answer" }).getBoundingClientRect();
    const third = page.getByRole('article', { name: "Jessica's example answer" }).getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(list).rowGap);
    await expect(second.top - first.bottom).toBeCloseTo(gap, 0);
    await expect(third.top - second.bottom).toBeCloseTo(gap, 0);
  },
});
