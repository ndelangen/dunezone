import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, faction, ref, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import { expectFieldValue } from './pagePlay';
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
/** The slotted board shows below the Rulebooks, linking to its own page. */
export const Detail = meta.story({
  args: { path: '/rulesets/classicrules' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const board = within(await page.findByRole('region', { name: 'Board' }, { timeout: 30_000 }));
    await expect(board.getByRole('link', { name: 'Arrakis Official' })).toHaveAttribute(
      'href',
      '/assets/board/arrakis-official'
    );
    /* The face itself, not only the link: a missing publication would still render the link around the matte placeholder. */
    const face = await board.findByRole('img', { name: 'Arrakis Official' }, { timeout: 30_000 });
    await waitFor(() => expect((face as HTMLImageElement).naturalWidth).toBeGreaterThan(0), { timeout: 30_000 });
  },
});
/** A ruleset with no board keeps the section, drawn as the missing face with a line saying so. */
export const DetailWithoutBoard = meta.story({
  args: { path: '/rulesets/classicrules' },
  parameters: {
    database: db((baseline) => {
      const slots = baseline.ruleset_asset_slots;
      slots.splice(
        slots.findIndex((row) => row.slot === 'board'),
        1
      );
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const board = within(await page.findByRole('region', { name: 'Board' }, { timeout: 30_000 }));
    await expect(board.getByText('This ruleset has no board yet.')).toBeVisible();
    await expect(board.queryByRole('link')).toBeNull();
  },
});
/** Numbered questions on ClassicRules, asked after the baseline's storm question, so the storm question is the oldest. */
function seedQuestions(baseline: StorybookDatabase, count: number) {
  for (let index = 1; index <= count; index++) {
    const number = String(index).padStart(2, '0');
    baseline.faq_items.push({
      ruleset_id: ref('ruleset:classicrules'),
      slug: `question-${number}`,
      question: `Question ${number}?`,
      tags: ['rules'],
      asked_by: ref('storybook-viewer'),
      created_at: `2030-01-01T00:00:${number}.000Z`,
      updated_at: `2030-01-01T00:00:${number}.000Z`,
      accepted_answer_id: null,
    });
  }
}
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
/** A link from before the FAQ had its own page, which searched on the ruleset's page, lands on the FAQ's page with the same search. */
export const FaqFormerSearchLink = meta.story({
  args: { path: '/rulesets/classicrules?q=storm&tag=rules' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Back to ClassicRules' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Search FAQ questions' })).toHaveValue('storm');
    await expect(
      within(page.getByRole('main')).findByRole('link', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});
/** More factions on ClassicRules, linked after the baseline's House Atreides, so they follow it in the ruleset's order. */
function seedLinkedFactions(baseline: StorybookDatabase, names: string[]) {
  for (const name of names) {
    const key = `faction:${name.toLowerCase().replace(/\s+/g, '-')}`;
    baseline.factions.push({ ...faction({ name }), $key: key });
    baseline.ruleset_factions.push({ ruleset_id: ref('ruleset:classicrules'), faction_id: ref(key) });
  }
}
/** The ruleset's page shows its first three factions in its own order and links to the rest in the catalogue. */
export const DetailFactionRail = meta.story({
  args: { path: '/rulesets/classicrules' },
  parameters: { database: db((baseline) => seedLinkedFactions(baseline, ['Choam', 'Duncan', 'Ecaz', 'Fremen'])) },
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
/** The edit page lists the ruleset's factions as links in its own order, and a drag saves the new order. */
export const EditFactionOrder = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  parameters: { database: db((baseline) => seedLinkedFactions(baseline, ['Choam', 'Duncan'])) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = within(await page.findByRole('list', { name: 'Factions' }, { timeout: 30_000 }));
    const names = () => list.getAllByRole('link').map((link) => link.textContent);
    await waitFor(() => expect(names()).toEqual(['House Atreides', 'Choam', 'Duncan']), { timeout: 30_000 });
    await expect(list.getByRole('button', { name: 'Remove Duncan from ClassicRules' })).toBeVisible();

    const handle = list.getByRole('button', { name: 'Move House Atreides' });
    /* As in the sortable list's own story: let the runner's late resize land before the pickup, since dnd-kit cancels a drag on resize (#2309). */
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowDown]');
    /*
     * Drop only once the drag is over the next row and stays there:
     * the pickup's own row is announced first, and dnd-kit can still be measuring right after the move, so the check runs twice with a pause between.
     */
    const overAnotherRow = () => {
      const announcement = canvasElement.ownerDocument.querySelector('[id^="DndLiveRegion"]')?.textContent ?? '';
      const [, dragged, over] = /item (\S+) was moved over droppable area (\S+)/.exec(announcement) ?? [];
      if (!over || over === dragged) {
        throw new Error(`Not over another row yet: ${announcement}`);
      }
    };
    await waitFor(overAnotherRow);
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    await waitFor(overAnotherRow);
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(names()).toEqual(['Choam', 'House Atreides', 'Duncan']), { timeout: 30_000 });
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
/**
 * The same page reached through a ruleset slug that names nothing, which is the state the route's own frame exists for.
 * Its loader throws rather than returning nothing, so without that frame this path falls to the router's default and renders the error unstyled.
 */
export const AskQuestionMissingRuleset = meta.story({
  args: { path: '/rulesets/there-is-no-such-ruleset/faq/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Ask a question' }, { timeout: 30_000 })).resolves.toBeVisible();
    /* Not merely that something rendered: the router's default renders too, and without the route's
       own frame this page shows its unstyled block with no way out. The alert's own title and a way
       back that lives in the band are what only the frame produces. */
    await expect(page.findByText('This ruleset could not be loaded', {}, { timeout: 30_000 })).resolves.toBeVisible();
    const back = await page.findByRole('link', { name: 'Back to rulesets' }, { timeout: 30_000 });
    await expect(back.closest('main')).toBeNull();
  },
});
/** The question names itself in the header band, and the asker, who is the viewer here, gets Edit and Delete in the toolbar. */
export const Question = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const navigation = within(page.getByRole('group', { name: 'Navigation' }));
    await expect(navigation.getByRole('link', { name: 'Back to ruleset' })).toBeVisible();
    /* The shared page renders first; editing follows the viewer, which the browser resolves after it. */
    await expect(
      navigation.findByRole('button', { name: 'Edit question' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(
      within(page.getByRole('group', { name: 'Question actions' })).getByRole('button', { name: 'Delete question' })
    ).toBeVisible();
    await userEvent.click(navigation.getByRole('button', { name: 'Edit question' }));
    const question = await page.findByRole('textbox', { name: 'Edit question' });
    await userEvent.clear(question);
    await userEvent.type(question, 'When does the storm move in round two?');
    await userEvent.click(page.getByRole('checkbox', { name: 'Strategy' }));
    await expect(page.getByRole('checkbox', { name: 'Rules' })).toBeChecked();
    await expect(question).toHaveValue('When does the storm move in round two?');
    await userEvent.click(page.getByRole('button', { name: 'Save question' }));
    await waitFor(() =>
      expect(page.getByRole('heading', { name: 'When does the storm move in round two?' })).toBeVisible()
    );
    await expect(page.queryByRole('textbox', { name: 'Edit question' })).toBeNull();
  },
});

/** The ruleset editor's toolbar on one line at a phone, tablet, laptop and desktop width (#1423), stating only its save state at rest. */
export const EditToolbarAt360 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: ['No unsaved changes'] }),
});
export const EditToolbarAt768 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: ['No unsaved changes'] }),
});
export const EditToolbarAt1100 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, { statusDescribes: ['No unsaved changes'] }),
});

/**
 * The ruleset editor states only the latest save's failure, in the form and on Save (CodeRabbit on #1435).
 * The first save fails at the update, because another ruleset already has the name.
 * The second stops earlier, at the cover, because Storybook's Convex mock rejects every action.
 * The update's failure from the first save must not stay on the page beside the cover's.
 */
export const EditShowsOnlyTheLatestSaveFailure = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appLarge' } },
  parameters: {
    database: db((baseline) => {
      baseline.rulesets.push(ruleset({ name: 'Advanced Rules' }));
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const save = () => page.getByRole('button', { name: 'Save ruleset' });
    const name = await page.findByRole('textbox', { name: 'Name' }, { timeout: 30_000 });
    await userEvent.clear(name);
    await userEvent.type(name, 'Advanced Rules');
    await userEvent.click(page.getByRole('button', { name: 'Save ruleset' }));
    await expect(page.findByText('Ruleset could not be saved', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(save()).toHaveAccessibleDescription(/Ruleset name already exists/), { timeout: 30_000 });

    await userEvent.type(page.getByRole('textbox', { name: 'Cover image URL' }), 'https://example.com/cover.png');
    await userEvent.click(page.getByRole('button', { name: 'Save ruleset' }));
    await expect(page.findByText('Cover could not be stored', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(save()).toHaveAccessibleDescription(/The cover could not be stored/), {
      timeout: 30_000,
    });
    await expect(page.queryByText('Ruleset could not be saved')).toBeNull();
    await expect(save()).not.toHaveAccessibleDescription(/Ruleset name already exists/);
  },
});
