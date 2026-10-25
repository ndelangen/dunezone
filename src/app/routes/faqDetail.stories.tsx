import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';

import { forumDatabase, acceptedThread, openReferencePicker, expectPickerBounds } from './faqDetail.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = preview.meta({
  title: 'FAQ detail',
  ...pageStoryMeta,
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  parameters: { ...pageStoryMeta.parameters, database: db(forumDatabase) },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
});

export const Forum = meta.story({ play: acceptedThread });
export const Phone = meta.story({ globals: { viewport: { value: 'appMobileNarrow' } }, play: acceptedThread });
export const Constrained = meta.story({ globals: { viewport: { value: 'appAuthoringTablet' } }, play: acceptedThread });

async function openTreacheryPicker(context: { canvasElement: HTMLElement }) {
  await openReferencePicker(context);
  const picker = within(context.canvasElement.ownerDocument.body).getByRole('dialog', { name: 'Add references' });
  await expect(within(picker).findByRole('option', { name: 'Lasgun' }, { timeout: 30_000 })).resolves.toBeVisible();
  await expectPickerBounds(context.canvasElement, picker);
}

export const ReferencePicker = meta.story({ play: openReferencePicker });
export const ReferencePickerPhone = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: openReferencePicker,
});
export const ReferencePickerShortCanvas = meta.story({
  globals: { viewport: { value: 'appShortCanvas' } },
  play: openTreacheryPicker,
});
export const ReferencePickerResults = meta.story({ play: openTreacheryPicker });
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
export const Unanswered = meta.story({
  parameters: {
    database: db((baseline) => {
      forumDatabase(baseline);
      baseline.faq_answers = [];
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('No answers yet. Be the first to answer.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('textbox', { name: 'Your answer' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByText('Accepted answer')).toBeNull();
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
