import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { useNavigate } from '@tanstack/react-router';
import { expect, mocked, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';
import { loadCurrentAddress } from '@db/formerAddresses';
import { db } from '@db/storybook';

import { expectToolbarOnOneLine } from '../../../../authoringToolbarPlay';
import { pageStoryMeta } from '../../../../storybookConfig';

/* The choice is read from its own page before it can be loaded, so Load waits for that read. */
async function enabledLoadButton(page: ReturnType<typeof within>) {
  const load = page.getByRole('button', { name: /^Load card$/ });
  await waitFor(() => expect(load).toBeEnabled());
  return load;
}

const meta = preview.meta({
  ...pageStoryMeta,
  title: 'Assets/Load card',
  args: { path: '/assets/card-custom/create' },
});

/** Loading creates a separate authored card and keeps the original token link and layer properties. */
export const CustomCardCopy = meta.story({
  args: { path: '/assets/card-custom/battle-reference/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Name' });
    await userEvent.click(page.getByRole('tab', { name: /^Layers$/ }));
    await userEvent.click(page.getByRole('button', { name: 'Add token' }));
    await userEvent.click(await page.findByRole('option', { name: /Karama/ }));
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save card' })).toHaveAccessibleDescription(/Saved/));
    /* Storybook intercepts Link clicks; move the setup card's memory router to the create page. */
    const navigate = mocked(useNavigate)
      .mock.results.filter((result) => result.type === 'return')
      .at(-1)!.value;
    await navigate({
      to: '/assets/$type/create',
      params: { type: 'card-custom' },
    });
    const name = await page.findByRole('textbox', { name: 'Name' });
    await userEvent.type(name, 'Unsaved card');
    const source = await loadAssetPage('card-custom', 'battle-reference');
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: /Battle reference/ })));
    await expect(name).toHaveValue('Unsaved card');
    await userEvent.click(await enabledLoadButton(page));
    const loadedName = page.getByRole('textbox', { name: 'Name' });
    await expect(loadedName).toHaveValue('Battle reference');
    await expect(page.getByRole('tab', { name: '4. Token' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    const copy = await loadAssetPage('card-custom', 'battle-reference-1');
    await expect(copy?.asset.id).not.toEqual(source?.asset.id);
    await expect(copy?.asset.data).toEqual(source?.asset.data);
    await expect(copy?.assignedGroup).toBeNull();
    await expect(copy?.inDecks).toEqual([]);
    await expect((await loadAssetPage('card-custom', 'battle-reference'))?.asset.data).toEqual(source?.asset.data);
  },
});

/** Cancel preserves the unsaved draft; Reset still returns to the original empty draft after a load. */
export const CancelAndReset = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' });
    await userEvent.type(name, 'Keep this draft');
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: /Battle reference/ })));
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await expect(name).toHaveValue('Keep this draft');
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await waitForFrame(() => expect(page.getByRole('button', { name: /^Load card$/ })).toBeDisabled());
    await userEvent.click(page.getByRole('option', { name: /Battle reference/ }));
    await userEvent.click(await enabledLoadButton(page));
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(name).toHaveValue('');
    await expect(page.queryByRole('tab', { name: '1. Text' })).toBeNull();
  },
});

export const TreacheryCardCopy = meta.story({
  args: { path: '/assets/card-treachery/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' });
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: /Lasgun/ })));
    await expect(page.queryByRole('option', { name: /Arsunt|Battle reference/ })).toBeNull();
    await userEvent.click(await enabledLoadButton(page));
    await expect(name).toHaveValue('Lasgun');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    await expect((await loadAssetPage('card-treachery', 'lasgun-1'))?.asset.data).toEqual(
      (await loadAssetPage('card-treachery', 'lasgun'))?.asset.data
    );
  },
});

export const SpiceCardCopy = meta.story({
  args: { path: '/assets/card-spice/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' });
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: /Arsunt/ })));
    await userEvent.click(await enabledLoadButton(page));
    await expect(name).toHaveValue('Arsunt');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    await expect((await loadAssetPage('card-spice', 'arsunt-1'))?.asset.data).toEqual(publishingSpiceCard);
  },
});

export const StormCardCopy = meta.story({
  args: { path: '/assets/card-storm/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' });
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: /3 Sectors/ })));
    await userEvent.click(await enabledLoadButton(page));
    await expect(name).toHaveValue('3 Sectors');
    await expect(page.getByText('Move the storm 3 sectors counter-clockwise.')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    const source = await loadAssetPage('card-storm', '3-sectors');
    const copy = await loadAssetPage('card-storm', '3-sectors-1');
    await expect(copy?.asset.id).not.toEqual(source?.asset.id);
    await expect(copy?.asset.data).toEqual(source?.asset.data);
    await expect(copy?.inDecks).toEqual([]);
    await userEvent.click(page.getByRole('combobox', { name: 'Storm movement' }));
    await userEvent.click(await page.findByRole('option', { name: /^6 sectors$/ }));
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Save card' })).toHaveAccessibleDescription(/Saved/));
    await expect((await loadAssetPage('card-storm', '3-sectors-1'))?.asset.data).toMatchObject({ sectors: 6 });
    await expect((await loadAssetPage('card-storm', '3-sectors'))?.asset.data).toEqual(source?.asset.data);
  },
});

export const EmptyCatalogue = meta.story({
  parameters: {
    database: db((baseline) => {
      baseline.assets = baseline.assets.filter((row) => row.type !== 'card-custom');
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load existing card' }));
    await waitForFrame(() => expect(page.getByText('No custom cards are available to load yet.')).toBeVisible());
    await expect(page.getByRole('button', { name: /^Load card$/ })).toBeDisabled();
  },
});

export const NarrowToolbar = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  play: async ({ canvasElement }) => {
    await expectToolbarOnOneLine(canvasElement, {
      statusDescribes: ['No unsaved changes'],
    });
    const page = within(canvasElement.ownerDocument.body);
    const overflow = page.queryByRole('button', { name: 'More actions' });
    if (overflow) {
      await userEvent.click(overflow);
    }
    await waitForFrame(() => expect(page.getByRole('button', { name: 'Load existing card' })).toBeVisible());
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    const search = await waitForFrame(() => page.getByRole('searchbox', { name: 'Search custom cards' }));
    await waitFor(() => expect(search).toBeVisible());
    const box = search.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
});

/** The loader survives the overflow handoff and restores focus to the persistent menu trigger. */
export const OverflowHandoff = meta.story({
  globals: { viewport: { value: 'appMobileNarrow' } },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const more = await waitForFrame(() => page.getByRole('button', { name: 'More actions' }));
    await userEvent.click(more);
    const load = await waitForFrame(() =>
      within(page.getByRole('group', { name: 'More actions' })).getByRole('button', { name: 'Load existing card' })
    );
    await userEvent.click(load);
    const search = await waitForFrame(() => page.getByRole('searchbox', { name: 'Search custom cards' }));
    /* The dialog starts its fade a frame after it mounts, so the search can be found before there is a transition to finish. */
    await waitForFrame(() => expect(finishTransitions(search)).toBeVisible());
    await expect(page.getByRole('dialog', { name: 'Load existing card' })).toBeVisible();
    await waitForFrame(() => expect(more).toHaveAttribute('aria-expanded', 'false'));
    await waitForFrame(() => expect(search).toHaveFocus());
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await waitForFrame(() => expect(more).toHaveFocus());
    await userEvent.click(more);
    await userEvent.click(await waitForFrame(() => page.getByRole('button', { name: 'Load existing card' })));
    await waitForFrame(() => page.getByRole('searchbox', { name: 'Search custom cards' }));
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(more).toHaveFocus());
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    await userEvent.click(await waitForFrame(() => page.getByRole('button', { name: 'Load existing card' })));
    await waitForFrame(() => expect(page.getByRole('searchbox', { name: 'Search custom cards' })).toHaveFocus());
    await userEvent.click(more);
    await waitForFrame(() => expect(page.queryByRole('dialog', { name: 'Load existing card' })).toBeNull());
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await waitForFrame(() =>
      expect(
        page.getByRole('group', { name: 'More actions' }).contains(canvasElement.ownerDocument.activeElement)
      ).toBe(true)
    );
  },
});

/** Pasted data stays local until Save, and a rename requires a separate choice. */
export const RawJsonReplacement = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('textbox', { name: 'Name' });
    const original = (await loadAssetPage('card-treachery', 'lasgun'))!;
    const replacement = {
      ...(original.asset.data as Record<string, unknown>),
      name: 'Reviewed Lasgun',
      about: 'Reviewed card description.',
      bodyLayout: 'text-only',
    };
    const open = async () => {
      await userEvent.click(await page.findByRole('button', { name: 'Load existing card' }));
      await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
      const input = page.getByRole('textbox', { name: 'Writable JSON' });
      await userEvent.click(input);
      await userEvent.paste(JSON.stringify(replacement));
      await waitFor(() => expect(page.getByRole('button', { name: 'Load card' })).toBeEnabled());
    };
    await open();
    await expect(page.getByRole('checkbox', { name: 'Also rename' })).not.toBeChecked();
    await userEvent.click(page.getByRole('button', { name: 'Load card' }));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Lasgun');
    await expect((await loadAssetPage('card-treachery', 'lasgun'))!.asset.data).toEqual(original.asset.data);
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await open();
    await userEvent.click(page.getByRole('checkbox', { name: 'Also rename' }));
    await userEvent.click(page.getByRole('button', { name: 'Load card' }));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Reviewed Lasgun');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await waitFor(async () =>
      expect((await loadAssetPage('card-treachery', 'reviewed-lasgun'))?.asset.id).toBe(original.asset.id)
    );
    const saved = (await loadAssetPage('card-treachery', 'reviewed-lasgun'))!;
    await expect(saved.asset.data).toMatchObject(replacement);
    await expect(saved.assignedGroup).toEqual(original.assignedGroup);
    await expect(saved.inDecks).toEqual(original.inDecks);
  },
});

export const RawJsonErrorAndCancel = meta.story({
  args: { path: '/assets/card-treachery/lasgun/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    const input = page.getByRole('textbox', { name: 'Writable JSON' });
    await userEvent.click(input);
    await userEvent.paste('{"owner_id":"no"}');
    await expect(page.findByRole('alert')).resolves.toBeVisible();
    await expect(input).toHaveValue('{"owner_id":"no"}');
    await expect(page.getByRole('button', { name: 'Load card' })).toBeDisabled();
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Lasgun');
    await expect(page.getByRole('button', { name: 'Reset unsaved edits' })).toBeDisabled();
  },
});

export const RawNativeSpiceSave = meta.story({
  args: { path: '/assets/card-spice/arsunt/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'storybook-viewer' });
    await page.findByRole('textbox', { name: 'Name' });
    const before = (await loadAssetPage('card-spice', 'arsunt'))!;
    const board = (await loadAssetPage('board', 'arrakis-official'))!;
    const token = (await loadAssetPage('token-disc', 'karama'))!;
    const replacement = {
      ...(before.asset.data as object),
      text: '*Spice blow:* Take 6 spice.\n\n*Discovery:* Place a marker.',
      board: {
        asset_id: board.asset.id,
        typeToken: { asset_id: token.asset.id },
        look: { style: 'textured-burn', strength: 0.8 },
        tokens: [],
        tints: [],
      },
    };
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    const input = page.getByRole('textbox', { name: 'Writable JSON' });
    const unresolved = JSON.stringify({
      ...replacement,
      board: { ...replacement.board, typeToken: { asset_id: before.asset.id } },
    });
    await userEvent.click(input);
    await userEvent.paste(unresolved);
    await expect(page.findByRole('alert')).resolves.toHaveTextContent('$.board.tokens');
    await expect(page.getByRole('button', { name: 'Load card' })).toBeDisabled();
    await expect(input).toHaveValue(unresolved);
    await expect((await loadAssetPage('card-spice', 'arsunt'))!.asset.data).toEqual(before.asset.data);
    await expect(page.getByRole('button', { name: 'Reset unsaved edits' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.paste(JSON.stringify(replacement));
    await waitFor(() => expect(page.getByRole('button', { name: 'Load card' })).toBeEnabled());
    await userEvent.click(page.getByRole('button', { name: 'Load card' }));
    await expect((await loadAssetPage('card-spice', 'arsunt'))!.asset.data).toEqual(before.asset.data);
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await waitFor(async () => expect((await loadAssetPage('card-spice', 'arsunt'))?.asset.data).toEqual(replacement));
    const saved = (await loadAssetPage('card-spice', 'arsunt'))!;
    await expect(saved.asset.id).toBe(before.asset.id);
    await expect(saved.assignedGroup).toEqual(before.assignedGroup);
    await expect(saved.inDecks).toEqual(before.inDecks);
  },
});

export const RawConversionKeepsIdentity = meta.story({
  args: { path: '/assets/card-custom/battle-reference/convert-to-spice' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'storybook-viewer' });
    const name = await page.findByRole('textbox', { name: 'Name' });
    const before = (await loadAssetPage('card-custom', 'battle-reference'))!;
    const replacement = {
      ...publishingSpiceCard,
      name: 'Reviewed native conversion',
      subName: 'Discovery proof',
      amount: 9,
    };
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    await userEvent.click(page.getByRole('textbox', { name: 'Writable JSON' }));
    await userEvent.paste(JSON.stringify(replacement));
    await waitFor(() => expect(page.getByRole('button', { name: 'Load card' })).toBeEnabled());
    await expect(page.getByRole('checkbox', { name: 'Also rename' })).not.toBeChecked();
    await userEvent.click(page.getByRole('button', { name: 'Load card' }));
    await expect(name).toHaveValue(before.asset.name);
    await expect(page.getByRole('textbox', { name: 'Type' })).toHaveValue('Discovery proof');
    await expect((await loadAssetPage('card-custom', 'battle-reference'))!.asset.data).toEqual(before.asset.data);
    await userEvent.click(page.getByRole('button', { name: 'Reset spice draft' }));
    await expect(name).toHaveValue(before.asset.name);
    await expect(page.getByRole('textbox', { name: 'Type' })).toHaveValue('Spice blow');
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await page.findByRole('button', { name: 'Paste JSON' }));
    await userEvent.click(page.getByRole('textbox', { name: 'Writable JSON' }));
    await userEvent.paste(JSON.stringify(replacement));
    await waitFor(() => expect(page.getByRole('button', { name: 'Load card' })).toBeEnabled());
    await userEvent.click(page.getByRole('checkbox', { name: 'Also rename' }));
    await userEvent.click(page.getByRole('button', { name: 'Load card' }));
    await expect(name).toHaveValue(replacement.name);
    await expect((await loadAssetPage('card-custom', 'battle-reference'))!.asset.data).toEqual(before.asset.data);
    await waitForFrame(() => expect(page.getByRole('button', { name: 'Load existing card' })).toHaveFocus());
    const convert = page.getByRole('button', { name: 'Convert to spice card' });
    await userEvent.pointer([{ keys: '[MouseLeft>]', target: convert }]);
    await waitFor(
      async () =>
        expect((await loadAssetPage('card-spice', 'reviewed-native-conversion'))?.asset.id).toBe(before.asset.id),
      { timeout: 10_000 }
    );
    await userEvent.pointer([{ keys: '[/MouseLeft]' }]);
    const after = (await loadAssetPage('card-spice', 'reviewed-native-conversion'))!;
    await expect(after.assignedGroup).toEqual(before.assignedGroup);
    await expect(after.inDecks).toEqual(before.inDecks);
    await expect(after.asset.data).toEqual(replacement);
    await expect(await loadCurrentAddress({ kind: 'asset', type: 'card-custom', slug: 'battle-reference' })).toBe(
      '/assets/card-spice/reviewed-native-conversion'
    );
    await expect(await loadAssetPage('card-custom', 'battle-reference')).toBeNull();
  },
});
