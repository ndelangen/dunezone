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
 * the ClassicRules ones are numbered so paging has something to page.
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

/** Before any search: how the FAQ works, told as one exchange, and the way to the rulesets to ask on. */
export const Explainer = meta.story({
  args: { path: '/faq' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Community FAQ' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('heading', { name: 'How the FAQ works' })).toBeVisible();
    await expect(page.getByText('Accepted answer')).toBeInTheDocument();
    await expect(page.getByRole('link', { name: 'Browse the rulesets' })).toHaveAttribute('href', '/rulesets');
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

/** A search across two picked rulesets: every result says which ruleset it belongs to and links into that ruleset's FAQ. */
export const SearchResults = meta.story({
  args: { path: '/faq?q=storm&rulesets=classicrules,dreamrules' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 3)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    await expect(
      main.findByRole('link', { name: 'Can I ship troops into the storm?' }, { timeout: 30_000 })
    ).resolves.toHaveAttribute('href', '/rulesets/dreamrules/faq/storm-and-shipment');
    await expect(main.getByRole('link', { name: 'Storm question 03?' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq/storm-question-03'
    );
    await expect(main.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
    await expect(main.getAllByRole('link', { name: 'Dreamrules' })[0]).toHaveAttribute(
      'href',
      '/rulesets/dreamrules/faq'
    );
    await expect(page.getByRole('textbox', { name: 'Search FAQ questions' })).toHaveValue('storm');
    /* The picked rulesets show as pills on the toolbar's select. */
    await expect(page.getByText('ClassicRules', { selector: '.mantine-Pill-label' })).toBeVisible();
    await expect(page.getByText('Dreamrules', { selector: '.mantine-Pill-label' })).toBeVisible();
  },
});

/** Every page of results has its own address, and dropping a ruleset from the pick starts the search again from its first page. */
export const SearchPages = meta.story({
  args: { path: '/faq?q=storm&page=2' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 24)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    await expect(page.findByText(/^25–27 of 27 questions$/, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'First page' })).toHaveAttribute('href', '/faq?q=storm');
    await expect(main.getAllByRole('link', { name: /storm/i }).length).toBeGreaterThan(0);

    await userEvent.click(page.getByRole('combobox', { name: 'Rulesets' }));
    await userEvent.click(await page.findByRole('option', { name: /Dreamrules/ }));
    /* Two questions fit on one page, so the pager and its count go; the first page is back. */
    await expect(
      main.findByRole('link', { name: 'Can I ship troops into the storm?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await waitFor(() => expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull());
    await expect(page.queryByRole('link', { name: 'First page' })).toBeNull();
  },
});

/** A page past the end answers as one that does not exist, and says where the results end. */
export const PastTheEnd = meta.story({
  args: { path: '/faq?q=storm&page=9' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Nothing on this page' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to the results' })).toHaveAttribute('href', '/faq?q=storm');
  },
});
