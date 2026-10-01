import preview from '@sb/preview';
import { ALL, LOGO } from '@shared/assetIds';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { useState } from 'react';
import { expect, screen, within } from 'storybook/test';

import { resolveAsset } from '@game/assets/resolveAsset';

import { AssetSelect } from './AssetSelect';
import type { AssetSelectProps } from './AssetSelect';

function ControlledAssetSelect(args: AssetSelectProps) {
  const [value, setValue] = useState(args.value);
  return (
    <AssetSelect
      {...args}
      value={value}
      onChange={(next, option) => {
        args.onChange?.(next, option);
        setValue(next);
      }}
    />
  );
}

const previews = {
  dune: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="#c78346"/></svg>'
  )}`,
  ocean: `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="5" fill="#287f8f"/></svg>'
  )}`,
} as const;

const options = [
  { value: 'dune', label: 'Dune emblem' },
  { value: 'ocean', label: 'Ocean emblem' },
  { value: 'text-only', label: 'Text-only option' },
];

const meta = preview.meta({
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

export const Disabled = meta.story({
  args: {
    disabled: true,
  },
});

export const FactionEmblems = meta.story({
  args: {
    'aria-label': 'Faction emblem',
    w: 680,
    maw: 'calc(100vw - 2rem)',
    data: stockAssetOptions(LOGO.options),
    getPreviewSrc: (value) => resolveAsset(value, 'small'),
    value: '/vector/logo/atreides.svg',
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Faction emblem' }));
    await expect(screen.getByRole('listbox').querySelectorAll('[role="option"]')).toHaveLength(LOGO.options.length);
    await expect(screen.getByRole('group', { name: 'Faction emblems / Board game factions' })).toBeVisible();
  },
});

export const MixedArtworkInDark = meta.story({
  globals: { colorScheme: 'dark' },
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
