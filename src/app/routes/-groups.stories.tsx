import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Groups',
  ...pageStoryMeta,
});

export const Detail = meta.story({
  args: { path: '/groups/arrakeen-rules-council' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const faction = await page.findByRole('link', { name: 'House Atreides' }, { timeout: 30_000 });
    const ruleset = await page.findByRole('link', { name: 'ClassicRules' }, { timeout: 30_000 });

    expect(faction.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(ruleset.querySelector('[aria-hidden="true"]')).toBeNull();

    expect(faction.closest('li')).toBeNull();
    expect(ruleset.closest('li')).not.toBeNull();

    /*
     * A Stack stretches its children, so this chip once spanned the whole card and the empty half of the row navigated.
     * That shipped in this change and an earlier version of this story passed with it live.
     * The fallback to the chip itself is what stops a row-less path from passing.
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
