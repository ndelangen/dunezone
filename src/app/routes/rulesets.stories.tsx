import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db } from '@db/storybook';

import { expectFieldValue } from './pagePlay';
import { readyForPlay, seedLinkedFactions, seedQuestions } from './rulesets.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'Rulesets',
  ...pageStoryMeta,
});

export const Directory = meta.story({
  args: { path: '/rulesets' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const [entry] = await page.findAllByRole('link', { name: /ClassicRules/i }, { timeout: 30_000 });
    await expect(entry).toHaveAttribute('href', '/rulesets/classicrules');
  },
});
/** The ruleset's page shows its newest questions and links to the rest; its search opens the FAQ's own page. */
export const DetailFaqPreview = meta.story({
  args: { path: '/rulesets/classicrules' },
  parameters: { database: db((baseline) => seedQuestions(baseline, 8)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const faq = within(await page.findByRole('region', { name: 'Community FAQ' }, { timeout: 30_000 }));
    await expect(faq.findByRole('link', { name: 'Question 08?' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(faq.getByRole('link', { name: 'Question 04?' })).toBeVisible();
    await expect(faq.queryByRole('link', { name: 'Question 03?' })).toBeNull();
    await expect(faq.getByRole('link', { name: 'All 9 questions' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/faq'
    );

    await userEvent.type(faq.getByRole('textbox', { name: 'Search FAQ questions' }), 'storm{Enter}');
    /* The FAQ's own page, which only it has a way back from. */
    await expect(page.findByRole('link', { name: 'Back to ClassicRules' }, { timeout: 30_000 })).resolves.toBeVisible();
    const main = within(page.getByRole('main'));
    await expect(
      main.findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(main.queryByRole('link', { name: 'Question 08?' })).toBeNull();
  },
});
/** Every page of a ruleset's FAQ has its own address, and its search narrows the questions on the server. */
export const FaqPagesAndSearch = meta.story({
  args: { path: '/rulesets/classicrules/faq?page=2' },
  parameters: { database: db((baseline) => seedQuestions(baseline, 30)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    /* Newest first, so page two holds the six oldest numbered questions and the baseline's storm question. */
    await expect(main.findByRole('link', { name: 'Question 06?' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(main.getByRole('link', { name: 'When does the storm move?' })).toBeVisible();
    await expect(main.queryByRole('link', { name: 'Question 07?' })).toBeNull();
    await expect(page.findByText(/^25–31 of 31 questions$/)).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'First page' })).toHaveAttribute('href', '/rulesets/classicrules/faq');

    await userEvent.type(page.getByRole('textbox', { name: 'Search FAQ questions' }), 'Question 17');
    await expect(main.findByRole('link', { name: 'Question 17?' }, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull());
  },
});
/** The ruleset's page shows its first three factions in its own order and links to the rest in the catalogue. */
export const DetailFactionRail = meta.story({
  args: { path: '/rulesets/classicrules' },
  parameters: {
    database: db((baseline) => seedLinkedFactions(baseline, ['Choam', 'Duncan', 'Ecaz', 'Fremen'])),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const factions = within(await page.findByRole('region', { name: 'Factions' }, { timeout: 30_000 }));
    await expect(factions.findByRole('link', { name: /House Atreides/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(factions.getByRole('link', { name: /Choam/ })).toBeVisible();
    await expect(factions.getByRole('link', { name: /Duncan/ })).toBeVisible();
    await expect(factions.queryByRole('link', { name: /Ecaz/ })).toBeNull();
    await expect(factions.getByRole('link', { name: 'All 5 factions' })).toHaveAttribute(
      'href',
      '/factions?ruleset=classicrules'
    );
    /* Maintenance lives on the edit page now: the page's cards carry no menu. */
    await expect(factions.queryByRole('button', { name: /Actions for/ })).toBeNull();
  },
});
export const Edit = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: ({ canvasElement }) => expectFieldValue(canvasElement, 'Name', 'ClassicRules'),
});
export const AskQuestion = meta.story({
  args: { path: '/rulesets/classicrules/faq/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('textbox', { name: 'Ask a question' }, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/** The edit page says whether a game can start with the ruleset, by the table's own captures, and names what is left to fix. */
export const EditPlayReadiness = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Ready for Play' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(
      page.findByText('Spice deck: A ruleset needs a non-empty spice deck.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(
      page.getByText('A game cannot start with this ruleset yet. Fix the ruleset problems below.')
    ).toBeVisible();
  },
});

/** A ruleset the table can take still names each faction the draft sets aside, and what to fix on it. */
export const EditPlayReadinessFactionSetAside = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  parameters: { database: db(readyForPlay) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText(
        'A game can start. The draft sets aside the faction below until it is fixed.',
        {},
        { timeout: 30_000 }
      )
    ).resolves.toBeVisible();
    await expect(page.getByText('Leader Duncan Idaho: This leader has no published face.')).toBeVisible();
  },
});
