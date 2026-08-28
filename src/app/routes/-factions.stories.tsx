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
 * Reset gives the create page its masthead back, because this is the one editor whose band carries the page title.
 *
 * The other eleven gate the header slot, so a stale band costs an empty strip; here it costs the breadcrumb, the title and the description.
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
 * Loading a draft over the current one releases the header too, which Reset alone would not have covered.
 *
 * Load replaces the draft from the toolbar, outside the editor's blur capture entirely, so no settle reaches the header on its own.
 * It is the second release the browser pass found, and the reason the release belongs to the settle counter rather than to twelve reset handlers.
 */
export const CreateLoadRestoresTheMasthead = meta.story({
  args: { path: '/factions/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await raiseAWarning(page);
    await userEvent.click(page.getByRole('button', { name: 'Load existing faction' }));
    await userEvent.click(await page.findByRole('option', { name: /Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('button', { name: 'Load faction' }, { timeout: 30_000 }));
    await waitFor(() => expect(page.queryByText('Needs attention')).toBeNull(), { timeout: 30_000 });
    await expect(page.findByText('Create faction', {}, { timeout: 30_000 })).resolves.toBeVisible();
  },
});
