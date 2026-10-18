import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'FAQ',
  ...pageStoryMeta,
});

/**
 * A second ruleset with its own questions, so a search reaches across rulesets.
 * Every question names the storm, so one search finds them all;
 * the ClassicRules ones are numbered so there is more to load than one answer shows.
 */
function seedRulesets(baseline: StorybookDatabase, classicQuestions: number) {
  baseline.rulesets.push(ruleset({ name: 'Dreamrules' }));
  const dreamQuestions = [
    { slug: 'storm-and-shipment', question: 'Can I ship troops into the storm?' },
    { slug: 'storm-over-a-stronghold', question: 'Does the storm kill troops in a stronghold?' },
  ];
  for (const [index, entry] of dreamQuestions.entries()) {
    baseline.faq_items.push({
      ruleset_id: ref('ruleset:dreamrules'),
      slug: entry.slug,
      question: entry.question,
      tags: ['rules'],
      asked_by: ref('storybook-viewer'),
      created_at: `2030-02-01T00:00:0${index}.000Z`,
      updated_at: `2030-02-01T00:00:0${index}.000Z`,
      accepted_answer_id: null,
    });
  }
  for (let index = 1; index <= classicQuestions; index++) {
    const number = String(index).padStart(2, '0');
    baseline.faq_items.push({
      ruleset_id: ref('ruleset:classicrules'),
      slug: `storm-question-${number}`,
      question: `Storm question ${number}?`,
      tags: ['rules'],
      asked_by: ref('storybook-viewer'),
      created_at: `2030-01-01T00:00:${number}.000Z`,
      updated_at: `2030-01-01T00:00:${number}.000Z`,
      accepted_answer_id: null,
    });
  }
  return baseline;
}

/** The list's rows, each named by the question it opens. */
function questionRows(main: ReturnType<typeof within>) {
  return main.getAllByRole('link', { name: /^Open question: / });
}

/** Before any search: how the FAQ works, told as one exchange, and the way to the rulesets to ask on. */
export const Explainer = meta.story({
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

/** With the site's motion off the exchange stands at its end, so a reader who asked for less motion still sees the whole of it. */
export const ExplainerStill = meta.story({
  args: { path: '/faq' },
  globals: { motion: 'reduce' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Accepted answer', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.getByText('Unless your faction has an advantage that says otherwise. Check your sheet.')
    ).toBeVisible();
  },
});

/**
 * A search across two picked rulesets: every result says which ruleset it belongs to and links into that ruleset's FAQ.
 * The matches outnumber what one answer shows, so the list ends in "Load more" with no count and no pages.
 */
export const SearchResults = meta.story({
  args: { path: '/faq?q=storm&rulesets=classicrules,dreamrules' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 24)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    await expect(
      main.findByRole('link', { name: 'Can I ship troops into the storm?' }, { timeout: 30_000 })
    ).resolves.toHaveAttribute('href', '/rulesets/dreamrules/faq/storm-and-shipment');
    await expect(main.getByRole('link', { name: 'Does the storm kill troops in a stronghold?' })).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq/storm-over-a-stronghold'
    );
    await expect(main.getAllByRole('link', { name: 'Dreamrules' })[0]).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq'
    );
    await expect(questionRows(main)).toHaveLength(24);
    await expect(main.getByRole('button', { name: 'Load more' })).toBeVisible();
    await expect(main.queryByText(/of \d+ questions/)).toBeNull();
    await expect(page.getByRole('textbox', { name: 'Search FAQ questions' })).toHaveValue('storm');
    /* The toolbar's select has room for one pill, so the second pick folds into a count. */
    await expect(page.getByText('ClassicRules', { selector: '.mantine-Pill-label' })).toBeVisible();
    await expect(page.getByText('and 1 more rulesets')).toBeInTheDocument();
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
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
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

/** "Load more" lengthens the list in place until every match is shown; picking a ruleset starts the search again at its first matches. */
export const LoadMore = meta.story({
  args: { path: '/faq?q=storm' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 24)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    const loadMore = await main.findByRole('button', { name: 'Load more' }, { timeout: 30_000 });
    await expect(questionRows(main)).toHaveLength(24);

    await userEvent.click(loadMore);
    await waitFor(() => expect(questionRows(main)).toHaveLength(27), { timeout: 30_000 });
    await expect(main.getByRole('link', { name: 'Storm question 03?' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq/storm-question-03'
    );
    await expect(main.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();

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
