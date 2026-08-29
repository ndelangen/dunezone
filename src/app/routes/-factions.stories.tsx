import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { pageStoryMeta } from './-storybookConfig';

const meta = preview.meta({
  title: 'Factions',
  ...pageStoryMeta,
});

export const Catalogue = meta.story({ args: { path: '/factions' } });
export const Detail = meta.story({ args: { path: '/factions/house-atreides' } });
export const Create = meta.story({ args: { path: '/factions/create' } });
export const Edit = meta.story({ args: { path: '/factions/house-atreides/edit' } });

/* The faction leader's name is a field `factionAuthoringWarnings` answers for.
   The faction's own name is not: an empty one is `isNameBlank`, which drives the toolbar and an inline
   field error and contributes nothing to the header's list, so a regression written against it would
   pass whatever the header did. */
async function raiseAWarning(page: ReturnType<typeof within>) {
  await userEvent.click(await page.findByRole('tab', { name: 'Faction leader' }, { timeout: 30_000 }));
  const leaderName = await page.findByRole('textbox', { name: 'Faction leader name' }, { timeout: 30_000 });
  await userEvent.clear(leaderName);
  await expect(page.findByText('Needs attention', {}, { timeout: 30_000 })).resolves.toBeVisible();
}

/**
 * Reset closes the band it opened, rather than leaving the strip standing with nothing in it.
 *
 * Reset is a settle: discrete, deliberate, and exactly as much a "the draft has stopped moving" signal as the chapter switch that already counts as one.
 * The blur that comes from clicking Reset does not save it, because it lands one render too early, so this only passes if the reset itself releases the header.
 * Asserting the chip first is what stops this passing when no band ever opened.
 */
export const EditResetClosesTheValidationBand = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await raiseAWarning(page);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await waitFor(() => expect(page.queryByText('Needs attention')).toBeNull(), { timeout: 30_000 });
  },
});

/**
 * Reset discards the gradient the composer was keeping for you, the mechanism PR #850 removed from the token widgets.
 *
 * `BackgroundComposer` remembered the last value per colour mode so flipping solid/linear/radial and back restored what you had.
 * The memory was a ref, and a Reset arriving through TanStack Form replaces the draft without remounting the composer, so the ref stood and a flip afterwards restored a gradient the author had already discarded.
 *
 * The angle is the assertion rather than the mode, because both outcomes land on a linear gradient;
 * only its shape tells them apart.
 * With the memory discarded, Linear is derived afresh from the restored solid and opens at 90 degrees.
 * With the memory surviving, it reopens at the 135 typed before the Reset.
 */
export const EditResetDiscardsTheKeptGradient = meta.story({
  args: { path: '/factions/house-atreides/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Edit pattern color layer' }, { timeout: 30_000 }));

    const mode = async () =>
      within(await page.findByRole('radiogroup', { name: 'Pattern color mode' }, { timeout: 30_000 }));
    /* The stored pattern layer is a solid, so choosing Linear is what gives the composer a gradient to keep. */
    await userEvent.click((await mode()).getByRole('radio', { name: 'Linear' }));
    const angle = await page.findByRole('textbox', { name: 'Gradient angle' }, { timeout: 30_000 });
    await userEvent.clear(angle);
    await userEvent.type(angle, '135');

    /* A gradient where the saved faction has a solid leaves the draft dirty, so Reset is armed. */
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await waitFor(() => expect(page.queryByRole('textbox', { name: 'Gradient angle' })).toBeNull(), {
      timeout: 30_000,
    });

    await userEvent.click((await mode()).getByRole('radio', { name: 'Linear' }));
    await expect(page.findByRole('textbox', { name: 'Gradient angle' }, { timeout: 30_000 })).resolves.toHaveValue(
      '90°'
    );
  },
});

/**
 * Reset gives the create page its masthead back, because this is the one editor whose band carries the page title.
 *
 * The other eleven gate the header slot, so a stale band costs an empty strip;
 * here it costs the breadcrumb, the title and the description.
 * The title returning is the assertion rather than the band's absence, since on this page the band is occupied either way.
 */
export const CreateResetRestoresTheMasthead = meta.story({
  args: { path: '/factions/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Create faction', {}, { timeout: 30_000 })).resolves.toBeVisible();
    await raiseAWarning(page);
    expect(page.queryByText('Create faction')).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await waitFor(() => expect(page.queryByText('Needs attention')).toBeNull(), { timeout: 30_000 });
    await expect(page.findByText('Create faction', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/**
 * Loading a draft over the current one clears the band as well, which Reset alone would not have covered.
 *
 * Load replaces the draft from the toolbar, outside the editor's blur capture entirely, so no settle reaches the header on its own.
 * It is the second release the browser pass found, and the reason the release belongs to the settle counter rather than to twelve reset handlers.
 *
 * This runs on the create page because the story database holds one faction and the edit page's picker excludes the faction being edited, so there is nothing to load there.
 * That makes it an end-to-end check rather than an isolating one: this page's own masthead gate would clear the strip even if the release did not fire, so the release itself is pinned by `useValidationHeader.test.tsx`.
 */
export const CreateLoadRestoresTheMasthead = meta.story({
  args: { path: '/factions/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await raiseAWarning(page);
    await userEvent.click(page.getByRole('button', { name: 'Load existing faction' }));
    await userEvent.click((await page.findAllByRole('option', {}, { timeout: 30_000 }))[0]!);
    await userEvent.click(await page.findByRole('button', { name: 'Load faction' }, { timeout: 30_000 }));
    await waitFor(() => expect(page.queryByText('Needs attention')).toBeNull(), { timeout: 30_000 });
    await expect(page.findByText('Create faction', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
