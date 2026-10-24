import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ruleset } from '@db/storybook';

import { expectToolbarOnOneLine } from './authoringToolbarPlay';
import { seedLinkedFactions } from './rulesets.stories.fixture';
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

/** References save without submitting the question draft, and the saved tile opens its own page. */
export const QuestionReferences = meta.story({
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Actions for question' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Edit question' }));
    const question = await page.findByRole('textbox', { name: 'Edit question' });
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
    await waitFor(() => expect(page.queryByRole('button', { name: 'Remove reference to House Atreides' })).toBeNull());
    await expect(question).toHaveValue('An unsaved question draft?');
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
