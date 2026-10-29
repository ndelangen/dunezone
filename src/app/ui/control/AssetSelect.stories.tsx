import preview from '@sb/preview';
import { resolveAsset } from '@shared/media/resolveAsset';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { expect, screen, within } from 'storybook/test';

import { AssetSelect } from './AssetSelect';
import { ControlledAssetSelect, previews, options } from './AssetSelect.stories.fixture';

const meta = preview.meta({
  title: 'Asset Select',
  component: AssetSelect,
  render: ControlledAssetSelect,
  globals: {
    backgrounds: { value: 'dark', grid: false },
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

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Artifact symbol' })).toBeVisible();
    await expect(canvas.queryByText('Artifact symbol')).not.toBeInTheDocument();
    await expect(screen.queryByRole('listbox', { hidden: true })).not.toBeInTheDocument();
  },
});

export const TextOnlySelection = meta.story({
  args: {
    value: 'text-only',
  },
});

export const DropdownOpen = meta.story({
  args: {
    dropdownOpened: true,
  },
  play: async () => {
    // The dropdown is portalled to the document body, outside the story canvas.
    await expect(await screen.findByRole('option', { name: 'Dune emblem' })).toBeVisible();
    await expect(await screen.findByRole('option', { name: 'Text-only option' })).toBeVisible();
  },
});

export const MixedArtworkInDark = meta.story({
  args: {
    w: 420,
    maw: 'calc(100vw - 2rem)',
    data: stockAssetOptions(['/vector/decal/artillery-strike.svg', '/vector/decal/artillery-strike-multicolor.svg']),
    getPreviewSrc: (value) => resolveAsset(value, 'small'),
    value: '/vector/decal/artillery-strike.svg',
    dropdownOpened: true,
    glyphPreviews: true,
  },
  play: async () => {
    const colorPreview = screen.getByRole('option', { name: 'Artillery Strike Multicolor' }).querySelector('img');
    await expect(colorPreview).toHaveStyle({ filter: 'none' });
  },
});
