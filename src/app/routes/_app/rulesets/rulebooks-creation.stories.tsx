/* The Rulebook creation page: a new Rulebook, a copy of a saved one, and who may create (#1590). */
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { db } from '@db/storybook';

import { expectWithinWidth } from '../../pagePlay';
import { rulebooksMeta, withRulebooks } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Creation',
});

export const Creation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('radio', { name: 'A4 210 × 297 mm' }, { timeout: 30_000 })).resolves.toBeChecked();
    await expect(page.getByRole('radio', { name: 'Illustrated classic' })).toBeChecked();
  },
});

/** At 260 px the size and design choices stay inside the width. */
export const CreationNarrow = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('radio', { name: 'A4 210 × 297 mm' }, { timeout: 30_000 });
    const choices = page.getAllByRole('radio').map((radio) => radio.closest('label') ?? radio);
    await expectWithinWidth(canvasElement, choices);
  },
});

async function expectDenied(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Rulebook creation is unavailable' }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  await expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
}

export const Outsider = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'outsider', name: 'Outsider' } },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});

export const InactiveMember = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    identity: { subjectKey: 'member', name: 'Member' },
    database: db((baseline) => {
      withRulebooks(baseline);
      baseline.group_members[baseline.group_members.length - 1].status = 'removed';
    }),
  },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
