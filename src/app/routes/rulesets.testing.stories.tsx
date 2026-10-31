import { testingPreview } from '@sb/preview';
import { FAQ_CATALOGUE_PAGE_SIZE } from '@shared/faq/catalogueSearch';
import { RULESET_CATALOGUE_PAGE_SIZE } from '@shared/rulesets/catalogueSearch';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ruleset, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import { readyForPlay, seedLinkedFactions, seedQuestions } from './rulesets.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Rulesets',
  ...pageStoryMeta,
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
/** The edit page lists the ruleset's factions as links in its own order, and a drag saves the new order. */
export const EditFactionOrder = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  parameters: {
    database: db((baseline) => seedLinkedFactions(baseline, ['Choam', 'Duncan'])),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = within(await page.findByRole('list', { name: 'Factions' }, { timeout: 30_000 }));
    const names = () => list.getAllByRole('link').map((link) => link.textContent);
    await waitFor(() => expect(names()).toEqual(['House Atreides', 'Choam', 'Duncan']), { timeout: 30_000 });
    await expect(list.getByRole('button', { name: 'Remove Duncan from ClassicRules' })).toBeVisible();

    const handle = list.getByRole('button', { name: 'Move House Atreides' });
    const announced = (text: string) => page.queryByText(text) !== null;
    /*
     * dnd-kit cancels a drag on any window resize (#2309), and this page can still be resizing in CI, so a cancelled drag is tried again; the list's own order decides the result.
     * Before each drop the drag must be over the next row and stay there: the pickup's own row is announced first, and without the pause the drop landed back on the dragged row in every run, as the keyboard sensor's target had not settled.
     */
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      handle.focus();
      await userEvent.keyboard('[Space]');
      await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
      await userEvent.keyboard('[ArrowDown]');
      await waitFor(() => expect(announced('House Atreides is over position 2 of 3.')).toBe(true));
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      if (announced('Moving House Atreides was cancelled.')) {
        continue;
      }
      await userEvent.keyboard('[Space]');
      await waitFor(() =>
        expect(
          announced('House Atreides was dropped at position 2 of 3.') ||
            announced('Moving House Atreides was cancelled.')
        ).toBe(true)
      );
      if (announced('House Atreides was dropped at position 2 of 3.')) {
        break;
      }
    }
    await waitFor(() => expect(names()).toEqual(['Choam', 'House Atreides', 'Duncan']), { timeout: 30_000 });
  },
});
/** The question has its own pane under the collapsed header; its asker can edit and delete it. */
export const Question = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'When does the storm move?' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    const navigation = within(page.getByRole('group', { name: 'Navigation' }));
    await expect(navigation.getByRole('link', { name: 'Back to FAQ' })).toBeVisible();
    /* The shared page renders first; editing follows the viewer, which the browser resolves after it. */
    await userEvent.click(await page.findByRole('button', { name: 'Actions for question' }, { timeout: 30_000 }));
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Hold to delete question' })).toBeVisible());
    await userEvent.click(page.getByRole('menuitem', { name: 'Edit question' }));
    const question = await page.findByRole('textbox', {
      name: 'Edit question',
    });
    await userEvent.clear(question);
    await userEvent.type(question, 'When does the storm move in round two?');
    await userEvent.click(page.getByRole('checkbox', { name: 'Strategy' }));
    await expect(page.getByRole('checkbox', { name: 'Rules' })).toBeChecked();
    await expect(question).toHaveValue('When does the storm move in round two?');
    await userEvent.click(page.getByRole('button', { name: 'Save question' }));
    await waitFor(() =>
      expect(
        page.getByRole('heading', {
          name: 'When does the storm move in round two?',
        })
      ).toBeVisible()
    );
    await expect(page.queryByRole('textbox', { name: 'Edit question' })).toBeNull();
  },
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

/** A ruleset that has not chosen its Battle dialing reads as Advanced, how battles counted before rulesets chose. */
export const EditBattleDialingDefault = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const advanced = await page.findByRole('radio', { name: /^Advanced/ }, { timeout: 30_000 });
    await expect(advanced).toBeChecked();
  },
});

/** A ruleset's Battle dialing saves with the rest of the form and stays chosen after the save. */
export const EditSavesBattleDialing = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const kiss = await page.findByRole('radio', { name: /^KISS/ }, { timeout: 30_000 });
    await userEvent.click(kiss);
    await expect(kiss).toBeChecked();
    await userEvent.click(page.getByRole('button', { name: 'Save ruleset' }));
    await waitFor(
      () => expect(page.getByRole('button', { name: 'Save ruleset' })).toHaveAccessibleDescription('Saved'),
      {
        timeout: 30_000,
      }
    );
    await expect(page.getByRole('radio', { name: /^KISS/ })).toBeChecked();
  },
});

/** References save without submitting the question draft, and the saved tile opens its own page. */
export const QuestionReferences = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Actions for question' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Edit question' }));
    const question = await page.findByRole('textbox', {
      name: 'Edit question',
    });
    await userEvent.clear(question);
    await userEvent.type(question, 'An unsaved question draft?');
    await userEvent.click(await page.findByRole('button', { name: 'Add references' }));
    await userEvent.selectOptions(await page.findByRole('combobox', { name: 'Reference type' }), 'faction');
    await userEvent.type(await page.findByRole('searchbox', { name: 'Search factions' }), 'Atreides');
    await userEvent.click(await page.findByRole('option', { name: 'House Atreides' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Close reference picker' }));
    const remove = await page.findByRole('button', { name: 'Remove reference to House Atreides' }, { timeout: 30_000 });
    await expect(question).toHaveValue('An unsaved question draft?');
    await expect(page.getByRole('link', { name: /House Atreides ClassicRules/ })).toHaveAttribute(
      'href',
      '/factions/house-atreides'
    );
    await userEvent.click(remove);
    await waitFor(() =>
      expect(
        page.queryByRole('button', {
          name: 'Remove reference to House Atreides',
        })
      ).toBeNull()
    );
    await expect(question).toHaveValue('An unsaved question draft?');
  },
});

/** The ruleset editor's toolbar on one line at a phone, tablet, laptop and desktop width (#1423), stating only its save state at rest. */
export const EditToolbarAt360 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, {
      statusDescribes: ['No unsaved changes'],
    }),
});
export const EditToolbarAt768 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appTablet' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, {
      statusDescribes: ['No unsaved changes'],
    }),
});
export const EditToolbarAt1100 = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'appLaptop' } },
  play: async ({ canvasElement }) =>
    await expectToolbarOnOneLine(canvasElement, {
      statusDescribes: ['No unsaved changes'],
    }),
});

/** Numbered rulesets beside ClassicRules, so the catalogue has more than one page holds. */
function seedRulesets(baseline: StorybookDatabase, count: number) {
  for (let index = 1; index <= count; index++) {
    baseline.rulesets.push(ruleset({ name: `Ruleset ${String(index).padStart(2, '0')}` }));
  }
}
/** The catalogue's tiles, each the link that opens its ruleset. */
function rulesetTiles(main: ReturnType<typeof within>, name: RegExp) {
  return main.getAllByRole('link', { name });
}
/** The FAQ's rows, each the link that opens its question. */
function questionRows(main: ReturnType<typeof within>, name: RegExp) {
  return main.getAllByRole('link', { name });
}
/** More rulesets than one page holds, so the catalogue pages them with an exact count, and a search narrows them. */
export const DirectoryPagesAndSearch = meta.story({
  args: { path: '/rulesets?page=2' },
  parameters: { database: db((baseline) => seedRulesets(baseline, 30)) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const main = within(await page.findByRole('main', {}, { timeout: 30_000 }));
    /* A to Z, ClassicRules sorts before every numbered ruleset, so page two holds the last seven of the thirty-one. */
    await expect(main.findByRole('link', { name: /Ruleset 24/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(main.getByRole('link', { name: /Ruleset 30/ })).toBeVisible();
    await expect(main.queryByRole('link', { name: /Ruleset 23/ })).toBeNull();
    await expect(main.queryByRole('link', { name: /ClassicRules/ })).toBeNull();
    await expect(page.findByText(/^25–31 of 31 rulesets$/)).resolves.toBeVisible();
    await expect(page.getByRole('link', { name: 'First page' })).toHaveAttribute('href', '/rulesets');

    await userEvent.type(page.getByRole('textbox', { name: 'Search rulesets' }), 'Ruleset 07');
    await expect(main.findByRole('link', { name: /Ruleset 07/ }, { timeout: 30_000 })).resolves.toBeVisible();
    await waitFor(() => expect(main.queryByRole('link', { name: /Ruleset 24/ })).toBeNull());
    /* The search is one short grid: no pages and no count. */
    await expect(page.queryByRole('link', { name: 'First page' })).toBeNull();
    await expect(page.queryByText(/of \d+ rulesets/)).toBeNull();
  },
});
/**
 * A search shows its best matches and loads more in place: no pages, no count, and the sort is best match alone.
 * An old link's page and order are dropped, so it opens the search's first matches.
 * "Load more" lengthens the grid until every match is shown, and hands focus to the first new tile.
 */
export const DirectorySearched = meta.story({
  args: { path: '/rulesets?q=ruleset&page=2&sort=newest' },
  /* One past the first step: the smallest search that has more to load. */
  parameters: {
    database: db((baseline) => seedRulesets(baseline, RULESET_CATALOGUE_PAGE_SIZE + 1)),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Found on the body, not within a `main` found earlier: the pending frame has a `main` of its own, which the loaded page replaces. */
    const loadMore = await page.findByRole('button', { name: 'Load more' }, { timeout: 60_000 });
    const main = within(page.getByRole('main'));
    await expect(rulesetTiles(main, /^Ruleset \d\d$/)).toHaveLength(RULESET_CATALOGUE_PAGE_SIZE);
    await expect(main.queryByRole('link', { name: /ClassicRules/ })).toBeNull();
    await expect(page.queryByLabelText('Ruleset pages')).toBeNull();
    await expect(page.queryByText(/of \d+ rulesets/)).toBeNull();
    await expect(page.getByRole('textbox', { name: 'Search rulesets' })).toHaveValue('ruleset');
    const sort = page.getByRole('combobox', { name: 'Sort' });
    await expect(sort).toHaveValue('Best match');
    await expect(sort).toBeDisabled();

    await userEvent.click(loadMore);
    await waitFor(() => expect(rulesetTiles(main, /^Ruleset \d\d$/)).toHaveLength(RULESET_CATALOGUE_PAGE_SIZE + 1), {
      timeout: 60_000,
    });
    /* Focus moves in an effect after the longer grid is committed, so it is waited for rather than read off the first paint. */
    await waitFor(() => expect(rulesetTiles(main, /^Ruleset \d\d$/)[RULESET_CATALOGUE_PAGE_SIZE]).toHaveFocus());
    await expect(main.getByRole('status')).toHaveTextContent('More rulesets loaded');
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
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

/**
 * A search shows its best matches and loads more in place: no pages and no count.
 * An old link's page is dropped, so it opens the search's first matches.
 * "Load more" lengthens the list until every match is shown, and hands focus to the first new row.
 */
export const FaqSearched = meta.story({
  args: { path: '/rulesets/classicrules/faq?q=question&page=2' },
  /* One past the first step: the smallest search that has more to load. */
  parameters: {
    database: db((baseline) => seedQuestions(baseline, FAQ_CATALOGUE_PAGE_SIZE + 1)),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* Found on the body, not within a `main` found earlier: the pending frame has a `main` of its own, which the loaded page replaces. */
    const loadMore = await page.findByRole('button', { name: 'Load more' }, { timeout: 60_000 });
    const main = within(page.getByRole('main'));
    await expect(questionRows(main, /^Question \d\d\?$/)).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE);
    await expect(main.queryByRole('link', { name: 'When does the storm move?' })).toBeNull();
    await expect(page.queryByLabelText('FAQ pages')).toBeNull();
    await expect(page.queryByText(/of \d+ questions/)).toBeNull();
    await expect(page.getByRole('textbox', { name: 'Search FAQ questions' })).toHaveValue('question');

    await userEvent.click(loadMore);
    await waitFor(() => expect(questionRows(main, /^Question \d\d\?$/)).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE + 1), {
      timeout: 60_000,
    });
    await waitFor(() =>
      expect(main.getAllByRole('link', { name: /^Open question: Question/ })[FAQ_CATALOGUE_PAGE_SIZE]).toHaveFocus()
    );
    await expect(main.getByRole('status')).toHaveTextContent('More questions loaded');
    await expect(main.queryByRole('button', { name: 'Load more' })).toBeNull();
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

/** One native cursor list spans rulesets and appends the final range without duplicating rows. */
export const AssetRelatedFaqLoadMore = meta.story({
  args: { path: '/assets/card-treachery/lasgun' },
  parameters: {
    database: db((baseline) => {
      baseline.rulesets.push(ruleset({ name: 'Dreamrules' }));
      const target = baseline.assets.find((row) => row.type === 'card-treachery' && row.data.name === 'Lasgun')!;
      for (let index = 1; index <= 14; index++) {
        const key = `related-faq-${index}`;
        const created = `2030-01-${String(index).padStart(2, '0')}T00:00:00.000Z`;
        baseline.faq_items.push({
          $key: key,
          ruleset_id: ref(index % 2 === 0 ? 'ruleset:classicrules' : 'ruleset:dreamrules'),
          slug: `reference-${index}`,
          question: `Storm reference ${index}?`,
          tags: ['rules'],
          asked_by: ref('storybook-viewer'),
          created_at: created,
          updated_at: created,
          accepted_answer_id: null,
        });
        baseline.faq_references.push({
          faq_item_id: ref(key),
          question_created_at: created,
          kind: 'asset',
          target_id: ref(target.$key!),
        });
      }
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = within(await page.findByRole('region', { name: 'Related FAQ' }, { timeout: 30_000 }));
    await waitFor(() => expect(list.getAllByRole('link', { name: /^Open question:/ })).toHaveLength(12));
    await expect(list.getAllByRole('link', { name: /^Open question:/ })[0]).toHaveAccessibleName(
      'Open question: Storm reference 14?. Unanswered, 0 answers'
    );
    await expect(list.getAllByRole('link', { name: 'ClassicRules' })).toHaveLength(6);
    await expect(list.getAllByRole('link', { name: 'Dreamrules' })).toHaveLength(6);
    const loadMore = await list.findByRole('button', { name: 'Load more' }, { timeout: 30_000 });
    await expect(list.getAllByRole('button', { name: 'Load more' })).toHaveLength(1);
    await userEvent.click(loadMore);
    await waitFor(() => expect(list.getAllByRole('link', { name: /^Open question:/ })).toHaveLength(14));
    await expect(list.queryByRole('button', { name: 'Load more' })).toBeNull();
  },
});

/** A slot change on the page checks again: removing the treachery deck stops a game at once. */
export const EditPlayReadinessFollowsTheSlots = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  parameters: { database: db(readyForPlay) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText(/^A game can start\./, {}, { timeout: 30_000 })).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: /^Remove .+ from Treachery deck$/ }));
    await expect(
      page.findByText('Treachery deck: A ruleset needs a non-empty treachery deck.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(
      page.getByText('A game cannot start with this ruleset yet. Fix the ruleset problems below.')
    ).toBeVisible();
  },
});
