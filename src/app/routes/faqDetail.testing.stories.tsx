import { testingPreview } from '@sb/preview';
import { completeHold } from '@ui/control/useHoldToConfirm.stories.fixture';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { forumDatabase, acceptedThread, openReferencePicker, openTreacheryPicker } from './faqDetail.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'FAQ detail',
  ...pageStoryMeta,
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  parameters: { ...pageStoryMeta.parameters, database: db(forumDatabase) },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
});

export const PickReferences = meta.story({
  play: async (context) => {
    await openReferencePicker(context);
    const page = within(context.canvasElement.ownerDocument.body);
    const picker = within(page.getByRole('dialog', { name: 'Add references' }));
    const search = await picker.findByRole('searchbox', { name: 'Search treachery cards' });
    await expect(search).toHaveFocus();
    await userEvent.type(search, 'Lasgun');
    await waitFor(() => expect(picker.getByRole('option', { name: 'Lasgun' })).toBeVisible());
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(picker.findByRole('option', { name: 'Lasgun, already selected' })).resolves.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await userEvent.clear(search);
    await userEvent.type(search, 'unfindablexyz');
    await waitFor(() => expect(picker.getByText('No matching treachery cards.')).toBeVisible());
    await userEvent.clear(search);
    await userEvent.selectOptions(picker.getByRole('combobox', { name: 'Reference type' }), 'faction');
    await expect(picker.findByRole('option', { name: 'House Atreides, already selected' })).resolves.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await expect(picker.queryByRole('option', { name: 'Lasgun, already selected' })).toBeNull();
    await expect(picker.getByRole('searchbox', { name: 'Search factions' })).toHaveValue('');
    await userEvent.selectOptions(picker.getByRole('combobox', { name: 'Reference type' }), 'card-treachery');
    await userEvent.clear(picker.getByRole('searchbox', { name: 'Search treachery cards' }));
    await expect(picker.findByRole('option', { name: 'Lasgun, already selected' })).resolves.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await expect(picker.getByRole('searchbox', { name: 'Search treachery cards' })).toHaveValue('');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog', { name: 'Add references' })).toBeNull());
    await waitFor(() => expect(page.getByRole('button', { name: 'Add references' })).toHaveFocus());
    await expect(page.getByRole('button', { name: 'Remove reference to Lasgun' })).toBeVisible();
  },
});

export const ReferenceSelectionBeyondPage = meta.story({
  parameters: {
    database: db((baseline) => {
      forumDatabase(baseline);
      const question = baseline.faq_items[0]!;
      baseline.faq_references = baseline.faq_references.filter((row) => row.faq_item_id !== ref(question.$key!));
      for (const asset of baseline.assets.filter((row) => row.data.name !== 'Lasgun')) {
        baseline.faq_references.push({
          faq_item_id: ref(question.$key!),
          kind: 'asset',
          target_id: ref(asset.$key!),
          question_created_at: question.created_at,
        });
      }
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add references' }, { timeout: 30_000 }));
    const picker = within(await page.findByRole('dialog', { name: 'Add references' }));
    await userEvent.selectOptions(picker.getByRole('combobox', { name: 'Reference type' }), 'board');
    const search = await picker.findByRole('searchbox', { name: 'Search boards' });
    await expect(page.queryByRole('button', { name: 'Remove reference to Arrakis Official' })).toBeNull();
    await userEvent.type(search, 'Arrakis');
    await expect(
      picker.findByRole('option', { name: 'Arrakis Official, already selected' }, { timeout: 30_000 })
    ).resolves.toHaveAttribute('aria-disabled', 'true');
    await userEvent.selectOptions(picker.getByRole('combobox', { name: 'Reference type' }), 'card-treachery');
    await userEvent.clear(picker.getByRole('searchbox', { name: 'Search treachery cards' }));
    await userEvent.type(await picker.findByRole('searchbox', { name: 'Search treachery cards' }), 'Lasgun');
    await userEvent.click(await picker.findByRole('option', { name: 'Lasgun' }));
    await expect(picker.findByRole('option', { name: 'Lasgun, already selected' })).resolves.toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await expect(page.queryByRole('button', { name: 'Remove reference to Lasgun' })).toBeNull();
  },
});
export const EditAnswer = meta.story({
  play: async ({ canvasElement }) => {
    await acceptedThread({ canvasElement });
    const page = within(canvasElement.ownerDocument.body);
    const thread = page.getByRole('region', { name: '3 answers' });
    const own = within(page.getByRole('article', { name: "Leonard van der Meer's answer" }));
    await userEvent.click(own.getByRole('button', { name: 'Actions for answer' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Edit answer' }));
    const answer = page.getByRole('textbox', { name: 'Edit your answer' });
    await userEvent.clear(answer);
    await userEvent.type(answer, 'My existing answer has been updated.');
    await userEvent.click(page.getByRole('button', { name: 'Save answer' }));
    await expect(page.findByText('My existing answer has been updated.')).resolves.toBeVisible();
    await expect(thread.querySelectorAll('li')).toHaveLength(3);
    await waitFor(() => expect(page.queryByRole('textbox', { name: 'Edit your answer' })).toBeNull());
  },
});

export const ChangeAcceptedAnswer = meta.story({
  play: async ({ canvasElement }) => {
    await acceptedThread({ canvasElement });
    const page = within(canvasElement.ownerDocument.body);
    const thread = page.getByRole('region', { name: '3 answers' });
    const accepted = within(page.getByRole('article', { name: "IdrisTheKeeperOfDuneTraditions's answer" }));
    await userEvent.click(accepted.getByRole('button', { name: 'Actions for answer' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Unmark accepted answer' }));
    await waitFor(() => expect(page.getAllByRole('button', { name: 'Accept answer' })).toHaveLength(3));
    await expect(page.queryByText('Accepted answer', { exact: true })).toBeNull();
    await expect(thread.querySelector('li')?.textContent).toContain('Mara N.');
    const replacement = within(page.getByRole('article', { name: "Mara N.'s answer" }));
    await userEvent.click(replacement.getByRole('button', { name: 'Accept answer' }));
    await expect(replacement.findByText('Accepted answer', { exact: true })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: 'Accept answer' })).toBeNull();
    await expect(thread.querySelector('li')?.textContent).toContain('Mara N.');
    await userEvent.click(replacement.getByRole('button', { name: 'Actions for answer' }));
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Unmark accepted answer' })).toBeVisible());
    await expect(page.queryByRole('menuitem', { name: 'Edit answer' })).toBeNull();
    await userEvent.keyboard('{Escape}');
  },
});

export const EditQuestion = meta.story({
  play: async ({ canvasElement }) => {
    await acceptedThread({ canvasElement });
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Actions for question' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Edit question' }));
    const question = page.getByRole('textbox', { name: 'Edit question' });
    await expect(page.getByRole('button', { name: 'Save question' })).toBeDisabled();
    await userEvent.clear(question);
    await userEvent.type(question, 'Discard this question draft.');
    await userEvent.click(page.getByRole('button', { name: 'Cancel editing question' }));
    await expect(page.getByRole('heading', { name: 'When should we declare a Karama card?' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Actions for question' }));
    await userEvent.click(await page.findByRole('menuitem', { name: 'Edit question' }));
    await userEvent.clear(page.getByRole('textbox', { name: 'Edit question' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Edit question' }), 'When can we play Karama?');
    await userEvent.click(page.getByRole('button', { name: 'Save question' }));
    await expect(page.findByRole('heading', { name: 'When can we play Karama?' })).resolves.toBeVisible();
  },
});

export const DeleteAnswer = meta.story({
  play: async ({ canvasElement }) => {
    await acceptedThread({ canvasElement });
    const page = within(canvasElement.ownerDocument.body);
    const answer = within(page.getByRole('article', { name: "Mara N.'s answer" }));
    await userEvent.click(answer.getByRole('button', { name: 'Actions for answer' }));
    const deletion = await page.findByRole('menuitem', { name: 'Hold to delete answer' });
    await waitFor(() => expect(deletion).toBeVisible());
    await completeHold(deletion);
    await waitFor(() => expect(page.queryByRole('article', { name: "Mara N.'s answer" })).toBeNull());
    await expect(page.getByRole('region', { name: '2 answers' })).toBeVisible();
    await expect(page.queryByRole('button', { name: 'Accept answer' })).toBeNull();
  },
});

export const Constrained = meta.story({ globals: { viewport: { value: 'appAuthoringTablet' } }, play: acceptedThread });
export const ReferencePickerPhone = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: openReferencePicker,
});
export const ReferencePickerShortCanvas = meta.story({
  globals: { viewport: { value: 'appShortCanvas' } },
  play: openTreacheryPicker,
});
export const ReferencePickerResultsPhone = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: openTreacheryPicker,
});
export const SignedOut = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Sign in to answer' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('button', { name: /^Actions for / })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Accept answer' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Add references' })).toBeNull();
    await expect(page.getAllByRole('link', { name: 'Arrakeen Rules Council' }).length).toBeGreaterThanOrEqual(3);
  },
});

export const AnswerAuthor = meta.story({
  parameters: {
    database: db((baseline) => {
      forumDatabase(baseline);
      baseline.faq_items[0]!.asked_by = ref('forum-mara');
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const own = within(
      await page.findByRole('article', { name: "Leonard van der Meer's answer" }, { timeout: 30_000 })
    );
    await expect(page.queryByRole('button', { name: 'Accept answer' })).toBeNull();
    await expect(own.findByRole('button', { name: 'Actions for answer' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getAllByRole('button', { name: 'Actions for answer' })).toHaveLength(1);
    await expect(page.queryByRole('button', { name: 'Actions for question' })).toBeNull();
    await userEvent.click(own.getByRole('button', { name: 'Actions for answer' }));
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Edit answer' })).toBeVisible());
    await expect(page.getByRole('menuitem', { name: 'Hold to delete answer' })).toBeVisible();
    await expect(page.queryByRole('menuitem', { name: 'Unmark accepted answer' })).toBeNull();
    await userEvent.keyboard('{Escape}');
  },
});
