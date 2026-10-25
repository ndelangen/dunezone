import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { findFaqMain, seedRulesets, questionRows } from './faq.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'FAQ',
  ...pageStoryMeta,
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
    const { page, main } = await findFaqMain(canvasElement);
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
 * Picked rulesets split what one search may read between them, so with many picked a ruleset full of near misses runs out of reading before its share of the index is checked.
 * These fillers hold no questions;
 * ClassicRules holds more storm questions than its share reads.
 */
const CAPPED_FILLERS = 14;
const CAPPED_CLASSIC_QUESTIONS = 70;

function seedCappedSearch(baseline: StorybookDatabase) {
  for (let index = 1; index <= CAPPED_FILLERS; index++) {
    baseline.rulesets.push(ruleset({ name: `Filler ${String(index).padStart(2, '0')}` }));
  }
  return seedRulesets(baseline, CAPPED_CLASSIC_QUESTIONS);
}

const cappedRulesets = [
  'classicrules',
  'dreamrules',
  ...Array.from({ length: CAPPED_FILLERS }, (_, index) => `filler-${String(index + 1).padStart(2, '0')}`),
].join(',');

/** A search that ran out of reading before every question was checked ends in a word of advice instead of "Load more", with no count. */
export const SearchCapped = meta.story({
  args: { path: `/faq?q=storm ship&rulesets=${cappedRulesets}` },
  parameters: { database: db(seedCappedSearch) },
  play: async ({ canvasElement }) => {
    const { main } = await findFaqMain(canvasElement);
    await expect(
      main.findByRole('link', { name: 'Can I ship troops into the storm?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(questionRows(main)).toHaveLength(1);
    await expect(main.getByText("That's as far as this search goes. Add a word to narrow it.")).toBeVisible();
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
    await expect(main.queryByText(/\d+ questions/)).toBeNull();
  },
});

/** The same search with nothing found says that some questions went unchecked, so a word or two more may still find one. */
export const NothingMatchesCapped = meta.story({
  args: { path: `/faq?q=storm nowhere&rulesets=${cappedRulesets}` },
  parameters: { database: db(seedCappedSearch) },
  play: async ({ canvasElement }) => {
    const { main } = await findFaqMain(canvasElement);
    await expect(main.findByRole('heading', { name: 'Nothing matches' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(main.getByText(/some were not\. A word or two more might help\./)).toBeVisible();
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
});
