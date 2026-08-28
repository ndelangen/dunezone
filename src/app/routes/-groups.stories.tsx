import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Groups',
  ...pageStoryMeta,
});

/**
 * The group's two lists, which deliberately do not match.
 *
 * A faction is a chip: it wears the faction glyph and stands on its own, the way a faction is cited on every other screen.
 * A ruleset beside it is still a `Links` row inside the bulleted list.
 * Both halves are pinned here, because a change to either that left the other alone would otherwise pass unnoticed.
 */
export const Detail = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const faction = await page.findByRole('link', { name: 'House Atreides' }, { timeout: 30_000 });
    const ruleset = await page.findByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });

    /* The chip carries a decorative glyph beside its name; a plain list link has no child element at all. */
    expect(faction.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(ruleset.querySelector('[aria-hidden="true"]')).toBeNull();

    /* And the chip stands outside the bulleted list its sibling still renders a row of. */
    expect(faction.closest('li')).toBeNull();
    expect(ruleset.closest('li')).not.toBeNull();

    /*
     * The chip is sized by its own name rather than stretched across the card.
     * A column that stretches its children turns the whole width into a link, so most of the row navigates while looking like empty space.
     * The fallback to the chip itself keeps this from passing when there is no row to compare against.
     */
    const row = faction.parentElement ?? faction;
    expect(faction.getBoundingClientRect().width).toBeLessThan(row.getBoundingClientRect().width);
  },
});
export const Create = meta.story({ args: { path: '/groups/create' } });

/**
 * The create page reached by a reader who is not signed in: the gate frame, not the form.
 * Coverable since the session gate reads `useSessionViewer` and the seam's signed-out answer stopped collapsing into the pending shape (#803).
 */
export const CreateSignedOut = meta.story({
  args: { path: '/groups/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Back to profiles' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('button', { name: 'Save group' })).toBeNull();
  },
});
export const Edit = meta.story({
  args: { path: '/groups/arrakeen-rules-council/edit' },
});
