import { testingPreview } from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import {
  chooseMerge,
  chooseMove,
  chooseParent,
  expectUnblocked,
  factionMergePath,
  mergeFactions,
  review,
} from './adminFactionMerge.stories.fixture';
import { expectRefused, withoutAdmins } from './adminPages.stories.fixture';
import { pageStoryMeta } from './storybookConfig';

const meta = testingPreview.meta({
  title: 'Admin/Faction merge',
  ...pageStoryMeta,
  args: { path: factionMergePath },
  parameters: { ...pageStoryMeta.parameters, database: mergeFactions },
});

const LOAD = { timeout: 30_000 };

/** The preview says, a label first, what stays custom, what follows the parent and what moves along; the confirmed merge links to the merged variant. */
export const MergesTheDuplicate = meta.story({
  play: async ({ canvasElement }) => {
    const page = await chooseMerge(canvasElement, 'advanced', 'Add Atreides (advanced) · Advanced game');
    await expect(
      page.findByText('Stays custom: Starting instructions, Starting spice', {}, LOAD)
    ).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Follows the parent (13)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Moves along (2, 1 deleted)' })).toBeVisible();
    await review(page, 'Review merge');
    await expect(page.getByText(/will lead to House Atreides once it has no live variant left/)).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Merge into House Atreides' }));
    const merged = await page.findByRole('link', { name: 'Advanced game' }, LOAD);
    await expect(merged).toHaveAttribute('href', '/factions/house-atreides-advanced-game');
    await expect(page.queryByRole('button', { name: 'Review merge' })).toBeNull();
  },
});

/** The references are counted only once their line is opened, since the count reads every Rulebook draft and Edition. */
export const CountsReferencesWhenOpened = meta.story({
  play: async ({ canvasElement }) => {
    const page = await chooseMerge(canvasElement, 'advanced', 'Add Atreides (advanced) · Advanced game');
    await expect(page.queryByText(/^Advanced rules,/)).toBeNull();
    await userEvent.click(await page.findByRole('button', { name: 'References to rewrite' }, LOAD));
    await expect(page.findByText('Advanced rules, draft: 2', {}, LOAD)).resolves.toBeVisible();
    await expect(page.getByText('Advanced rules, Edition 1: 2')).toBeVisible();
  },
});

/** A taken name is said on the name field and holds the review until the admin gives another; the review then opens. */
export const NameClashBlocksReview = meta.story({
  play: async ({ canvasElement }) => {
    const page = await chooseMerge(canvasElement, 'copy', 'Add Atreides copy');
    await expect(
      page.findByText('House Atreides already has a variant called “Original”.', {}, LOAD)
    ).resolves.toBeVisible();
    const button = page.getByRole('button', { name: 'Review merge' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    const name = page.getByRole('textbox', { name: 'Variant name' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Second printing');
    await expect(page.queryByText(/already has a variant called/)).toBeNull();
    await expectUnblocked(button);
    await userEvent.click(button);
    await expect(page.findByText('This is a production write. It cannot be undone.')).resolves.toBeVisible();
    await expect(page.getByRole('button', { name: 'Merge into House Atreides' })).toBeVisible();
  },
});

/** A variant cannot go under its own branch, so the parents on offer leave that branch out; the move itself is one write. */
export const MovesAVariant = meta.story({
  play: async ({ canvasElement }) => {
    const page = await chooseMove(canvasElement, 'Dreamrules');
    await expect(page.getByRole('button', { name: 'Review move' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(page.getByRole('combobox', { name: 'Parent variant' }));
    await expect(page.findByRole('option', { name: 'Tournament play' })).resolves.toBeVisible();
    await expect(page.queryByRole('option', { name: 'Two-player duel' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await chooseParent(page, 'Tournament play');
    await review(page, 'Review move');
    await userEvent.click(page.getByRole('button', { name: 'Move variant' }));
    await expect(page.findByRole('link', { name: 'Dreamrules' }, LOAD)).resolves.toHaveAttribute(
      'href',
      '/factions/house-atreides-dreamrules'
    );
  },
});

export const MemberRefused = meta.story({
  parameters: withoutAdmins,
  play: async ({ canvasElement }) => {
    await expectRefused(canvasElement, 'Admin access required', { role: 'button', name: 'Review merge' });
    await expect(within(canvasElement.ownerDocument.body).queryByRole('button', { name: /Choose faction/ })).toBeNull();
  },
});
