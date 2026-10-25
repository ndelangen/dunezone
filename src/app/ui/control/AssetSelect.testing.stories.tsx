import { testingPreview } from '@sb/preview';
import { ALL, LEADERS } from '@shared/assetIds';
import { resolveAsset } from '@shared/media/resolveAsset';
import { act } from '@testing-library/react/pure';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { Plus } from 'lucide-react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { AssetSelect } from './AssetSelect';
import { ControlledAssetSelect, previews, options, emblems } from './AssetSelect.stories.fixture';

const meta = testingPreview.meta({
  title: 'Asset Select',
  component: AssetSelect,
  render: ControlledAssetSelect,
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Artifact symbol',
    data: options,
    getPreviewSrc: (value): string | undefined => previews[value as keyof typeof previews],
    onChange: () => {},
    value: 'dune',
  },
});

export const LeaderPortraitSearch = meta.story({
  args: {
    'aria-label': 'Leader portrait',
    w: 680,
    maw: 'calc(100vw - 2rem)',
    data: stockAssetOptions(LEADERS.options),
    getPreviewSrc: (value) => resolveAsset(value, 'small'),
    value: '/image/leader/official/dryeuh.png',
  },
  play: async ({ canvasElement, userEvent }) => {
    const field = within(canvasElement).getByRole('combobox', { name: 'Leader portrait' });
    await expect(field).toHaveValue('Dr. Yueh');
    await userEvent.click(field);
    await userEvent.type(field, 'nafud');
    await expect(screen.getByRole('option', { name: 'Nefud' })).toBeVisible();
    await userEvent.clear(field);
    await userEvent.type(field, 'bain');
    await expect(screen.getAllByRole('option')[0]).toHaveAccessibleName('Bain');
  },
});

const allSymbols = stockAssetOptions(ALL.options.flatMap((category) => category.options));

export const AllSymbols = meta.story({
  args: {
    'aria-label': 'Symbol',
    w: 680,
    maw: 'calc(100vw - 2rem)',
    data: allSymbols,
    getPreviewSrc: (value) => resolveAsset(value, 'small'),
    value: '/vector/decal/artillery-strike.svg',
    allowDeselect: false,
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Symbol' }));
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(allSymbols.length);
    await userEvent.click(canvas.getByRole('button', { name: 'Filter Symbol collections' }));
    await userEvent.click(screen.getByRole('option', { name: 'Custom emblems / Creatures 22' }));
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(22);
    await userEvent.click(screen.getByRole('option', { name: 'Glass Owl' }));
    await expect(canvas.getByRole('combobox', { name: 'Symbol' })).toHaveValue('Glass Owl');

    await userEvent.click(canvas.getByRole('button', { name: 'Filter Symbol collections' }));
    await userEvent.click(screen.getByRole('option', { name: 'Decals / Medical care and rescue 14' }));
    await expect(screen.getByRole('option', { name: 'Bone Setter' })).toBeVisible();
    await expect(screen.getByRole('option', { name: 'Bone Setter Multicolor' })).toBeVisible();
    const newDecal = screen.getByRole('option', { name: 'Pulse Examiner Multicolor' });
    await expect(newDecal.querySelector('img')).toHaveStyle({ filter: 'none' });
    await userEvent.click(newDecal);
    await expect(canvas.getByRole('combobox', { name: 'Symbol' })).toHaveValue('Pulse Examiner Multicolor');
  },
});

export const IconPicker = meta.story({
  args: { value: null, trigger: { label: 'Add decal', icon: <Plus size={17} /> } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add decal' }));
    const search = await screen.findByRole('textbox', { name: 'Search artwork' });
    await expect(search).toHaveFocus();
    await userEvent.type(search, 'ocean');
    const ocean = await screen.findByRole('option', { name: 'Ocean emblem' });
    await act(async () => ocean.click());
    await expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Add decal' })).toHaveFocus());
  },
});

export const FactionEmblems = meta.story({
  args: {
    'aria-label': 'Faction emblem',
    w: 680,
    maw: 'calc(100vw - 2rem)',
    data: stockAssetOptions(emblems),
    getPreviewSrc: (value) => resolveAsset(value, 'small'),
    value: '/vector/logo/atreides.svg',
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Faction emblem' }));
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(emblems.length);
    await expect(screen.getByRole('group', { name: 'Faction emblems / Board game factions' })).toBeVisible();
  },
});
