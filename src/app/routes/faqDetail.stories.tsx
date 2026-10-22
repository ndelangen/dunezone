import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref, ruleset } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectWithinWidth } from './pagePlay';
import { pageStoryMeta } from './storybookConfig';

const time = '2025-12-24T18:30:00.000Z';

function forumDatabase(baseline: StorybookDatabase) {
  baseline.profiles[0]!.username = 'Leonard van der Meer';
  const question = baseline.faq_items[0]!;
  question.question = 'When should we declare a Karama card?';
  question.created_at = time;
  question.updated_at = time;

  baseline.faq_answers[0]!.answer =
    'We pause before resolving an advantage and check whether anyone wants to play a Karama.';
  baseline.faq_answers[0]!.created_at = '2025-12-27T10:06:00.000Z';
  for (const [key, name, answer, created] of [
    [
      'idris',
      'IdrisTheKeeperOfDuneTraditions',
      'Declare the card before resolving the effect you want to stop. In this ruleset, the cancelled advantage remains unavailable for the rest of the phase.',
      '2025-12-28T09:40:00.000Z',
    ],
    [
      'mara',
      'Mara N.',
      'I read the timing as being before the advantage takes effect. We should make that explicit in our table rules.',
      '2025-12-24T19:12:00.000Z',
    ],
  ]) {
    baseline.users.push({ $key: `forum-${key}`, name });
    baseline.profiles.push({
      user_id: ref(`forum-${key}`),
      username: name!,
      slug: key!,
      avatar_url: null,
      account_state: 'active',
      created_at: time,
      updated_at: time,
    });
    baseline.group_members.push({
      group_id: ref('group:arrakeen-rules-council'),
      user_id: ref(`forum-${key}`),
      status: 'active',
      requested_at: time,
      approved_at: time,
      approved_by: ref('storybook-viewer'),
    });
    baseline.faq_answers.push({
      $key: key === 'idris' ? 'forum-accepted' : 'forum-mara-answer',
      faq_item_id: ref(question.$key!),
      answered_by: ref(`forum-${key}`),
      answer: answer!,
      created_at: created!,
    });
  }
  baseline.faq_references.push({
    faq_item_id: ref(question.$key!),
    kind: 'faction',
    target_id: ref('faction:house-atreides'),
    question_created_at: time,
  });
  const token = ref('asset:token-disc:karama');
  const faction = ref('faction:house-atreides');
  baseline.faq_references.push({
    faq_item_id: ref(question.$key!),
    kind: 'asset',
    target_id: token,
    question_created_at: time,
  });
  baseline.rulesets.push(ruleset({ name: 'Dreamrules' }));
  for (let index = 0; index < 7; index++) {
    const key = `forum-related-${index}`;
    const created = `2025-12-${25 + index}T12:00:00.000Z`;
    baseline.faq_items.push({
      $key: key,
      ruleset_id: ref(index % 2 ? 'ruleset:dreamrules' : 'ruleset:classicrules'),
      slug: key,
      question: `Related Karama question ${index + 1}?`,
      asked_by: ref('storybook-viewer'),
      tags: ['rules'],
      created_at: created,
      updated_at: created,
      accepted_answer_id: null,
    });
    baseline.faq_references.push({
      faq_item_id: ref(key),
      kind: 'asset',
      target_id: token,
      question_created_at: created,
    });
    if (index < 2) {
      baseline.faq_references.push({
        faq_item_id: ref(key),
        kind: 'faction',
        target_id: faction,
        question_created_at: created,
      });
    }
  }
}

const meta = preview.meta({
  title: 'FAQ detail',
  ...pageStoryMeta,
  args: { path: '/rulesets/classicrules/faq/when-does-the-storm-move' },
  parameters: { ...pageStoryMeta.parameters, database: db(forumDatabase) },
  globals: { motion: 'reduce', backgrounds: { value: undefined, grid: false } },
});

async function acceptedThread({ canvasElement }: { canvasElement: HTMLElement }) {
  const page = within(canvasElement.ownerDocument.body);
  const text = await page.findByText(/^Declare the card before resolving/, {}, { timeout: 30_000 });
  const answer = within(text.closest('li')!);
  if (!answer.queryByText('Accepted answer')) {
    await userEvent.click(await answer.findByRole('button', { name: 'Accept answer' }, { timeout: 30_000 }));
  }
  await expect(answer.findByText('Accepted answer')).resolves.toBeVisible();
  await expect(page.queryByRole('button', { name: 'Accept answer' })).toBeNull();
  await expect(answer.getByText(/Accepted by Leonard van der Meer/)).toBeVisible();
  const thread = page.getByRole('region', { name: '3 answers' });
  await expect(thread.querySelector('li')?.textContent).toContain('IdrisTheKeeperOfDuneTraditions');
  const related = within(page.getByRole('region', { name: 'Related questions' }));
  await expect(related.getAllByRole('link', { name: /^Open question:/ })).toHaveLength(5);
  await expect(
    related.getAllByRole('link', { name: /^Related Karama question/ }).map((link) => link.textContent)
  ).toEqual([
    'Related Karama question 2?',
    'Related Karama question 1?',
    'Related Karama question 7?',
    'Related Karama question 6?',
    'Related Karama question 5?',
  ]);
  await expect(page.getAllByRole('link', { name: 'Arrakeen Rules Council' }).length).toBeGreaterThanOrEqual(3);
  await expectWithinWidth(canvasElement, [
    page.getByRole('group', { name: 'Navigation' }),
    thread,
    ...thread.querySelectorAll('a'),
  ]);
  canvasElement.ownerDocument.defaultView?.scrollTo(0, 0);
}

export const Forum = meta.story({ play: acceptedThread });
export const Phone = meta.story({ globals: { viewport: { value: 'appMobileNarrow' } }, play: acceptedThread });
export const Constrained = meta.story({ globals: { viewport: { value: 'appAuthoringTablet' } }, play: acceptedThread });

async function openReferencePicker({ canvasElement }: { canvasElement: HTMLElement }) {
  const page = within(canvasElement.ownerDocument.body);
  await page.findByRole('heading', { name: 'When should we declare a Karama card?' }, { timeout: 30_000 });
  const toggle = page.queryByRole('button', { name: 'Ruleset and references' });
  if (toggle) {
    await userEvent.click(toggle);
  }
  await userEvent.click(await page.findByRole('button', { name: 'Add references' }, { timeout: 30_000 }));
  const picker = await page.findByRole('dialog', { name: 'Add references' });
  await waitFor(
    () => expect(within(picker).getByRole('option', { name: 'House Atreides, already selected' })).toBeVisible(),
    { timeout: 30_000 }
  );
  await waitFor(() => expect(within(picker).getByRole('option', { name: 'Lasgun' })).toBeVisible(), {
    timeout: 30_000,
  });
  await waitFor(() => expectWithinWidth(canvasElement, [picker]));
  await waitFor(async () => {
    const box = picker.getBoundingClientRect();
    await expect(box.top).toBeGreaterThanOrEqual(0);
    await expect(box.bottom).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientHeight);
  });
}

export const ReferencePicker = meta.story({ play: openReferencePicker });
export const ReferencePickerPhone = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: openReferencePicker,
});

export const PickReferences = meta.story({
  play: async (context) => {
    await openReferencePicker(context);
    const page = within(context.canvasElement.ownerDocument.body);
    const picker = within(page.getByRole('dialog', { name: 'Add references' }));
    const search = picker.getByRole('searchbox', { name: 'Search the catalogue' });
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
    await waitFor(() => expect(picker.getByText('No matching factions or assets.')).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog', { name: 'Add references' })).toBeNull());
    await waitFor(() => expect(page.getByRole('button', { name: 'Add references' })).toHaveFocus());
    await expect(page.getByRole('button', { name: 'Remove reference to Lasgun' })).toBeVisible();
  },
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

export const DeleteAnswer = meta.story({
  play: async ({ canvasElement }) => {
    await acceptedThread({ canvasElement });
    const page = within(canvasElement.ownerDocument.body);
    const answer = within(page.getByRole('article', { name: "Mara N.'s answer" }));
    await userEvent.click(answer.getByRole('button', { name: 'Actions for answer' }));
    const deletion = await page.findByRole('menuitem', { name: 'Hold to delete answer' });
    await waitFor(() => expect(deletion).toBeVisible());
    await userEvent.pointer([{ keys: '[MouseLeft>]', target: deletion }]);
    try {
      await waitFor(() => expect(page.getByText('Deleting in 5..')).toBeVisible());
      await waitFor(() => expect(page.queryByRole('article', { name: "Mara N.'s answer" })).toBeNull(), {
        timeout: 10_000,
      });
    } finally {
      await userEvent.pointer([{ keys: '[/MouseLeft]', target: canvasElement.ownerDocument.body }]);
    }
    await expect(page.getByRole('region', { name: '2 answers' })).toBeVisible();
    await expect(page.queryByRole('button', { name: 'Accept answer' })).toBeNull();
  },
});
