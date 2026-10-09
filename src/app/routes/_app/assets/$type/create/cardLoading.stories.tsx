import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { useNavigate } from '@tanstack/react-router';
import { expect, mocked, userEvent, waitFor, within } from 'storybook/test';

import { loadAssetPage } from '@db/assets';
import { db } from '@db/storybook';

import { expectToolbarOnOneLine } from '../../../../authoringToolbarPlay';
import { pageStoryMeta } from '../../../../storybookConfig';

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
    await userEvent.click(page.getByRole('button', { name: /^Load card$/ }));
    const loadedName = page.getByRole('textbox', { name: 'Name' });
    await expect(loadedName).toHaveValue('Battle reference');
    await expect(page.getByRole('tab', { name: '4. Token' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    const copy = await loadAssetPage('card-custom', 'battle-reference-1');
    expect(copy?.asset.id).not.toEqual(source?.asset.id);
    expect(copy?.asset.data).toEqual(source?.asset.data);
    expect(copy?.viewerAccess.assignedGroup).toBeNull();
    expect(copy?.inDecks).toEqual([]);
    expect((await loadAssetPage('card-custom', 'battle-reference'))?.asset.data).toEqual(source?.asset.data);
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
    await userEvent.click(page.getByRole('button', { name: /^Load card$/ }));
    await userEvent.click(page.getByRole('button', { name: 'Reset unsaved edits' }));
    await expect(name).toHaveValue('');
    expect(page.queryByRole('tab', { name: '1. Text' })).toBeNull();
  },
});

export const TreacheryCardCopy = meta.story({
  args: { path: '/assets/card-treachery/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const name = await page.findByRole('textbox', { name: 'Name' });
    await userEvent.click(page.getByRole('button', { name: 'Load existing card' }));
    await userEvent.click(await waitForFrame(() => page.getByRole('option', { name: /Lasgun/ })));
    expect(page.queryByRole('option', { name: /Arsunt|Battle reference/ })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: /^Load card$/ }));
    await expect(name).toHaveValue('Lasgun');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    expect((await loadAssetPage('card-treachery', 'lasgun-1'))?.asset.data).toEqual(
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
    await userEvent.click(page.getByRole('button', { name: /^Load card$/ }));
    await expect(name).toHaveValue('Arsunt');
    await userEvent.click(page.getByRole('button', { name: 'Save card' }));
    await expect(page.findByRole('button', { name: 'Delete card' })).resolves.toBeVisible();
    expect((await loadAssetPage('card-spice', 'arsunt-1'))?.asset.data).toEqual(publishingSpiceCard);
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
    await waitForFrame(() => expect(page.getByText('No cards of this type are available to load yet.')).toBeVisible());
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
    const search = await waitForFrame(() => page.getByRole('searchbox', { name: 'Search cards' }));
    await waitFor(() => expect(search).toBeVisible());
    const box = search.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
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
    const search = await waitForFrame(() => page.getByRole('searchbox', { name: 'Search cards' }));
    await expect(finishTransitions(search)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Load existing card' })).toBeVisible();
    await waitForFrame(() => expect(more).toHaveAttribute('aria-expanded', 'false'));
    await waitForFrame(() => expect(search).toHaveFocus());
    await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
    await waitForFrame(() => expect(more).toHaveFocus());
    await userEvent.click(more);
    await userEvent.click(await waitForFrame(() => page.getByRole('button', { name: 'Load existing card' })));
    await waitForFrame(() => page.getByRole('searchbox', { name: 'Search cards' }));
    await userEvent.keyboard('{Escape}');
    await waitForFrame(() => expect(more).toHaveFocus());
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    await userEvent.click(await waitForFrame(() => page.getByRole('button', { name: 'Load existing card' })));
    await waitForFrame(() => expect(page.getByRole('searchbox', { name: 'Search cards' })).toHaveFocus());
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
