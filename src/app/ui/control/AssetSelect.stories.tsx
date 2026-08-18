import preview from '@sb/preview';
import { expect, screen, within } from 'storybook/test';

import { AssetSelect } from './AssetSelect';

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
  globals: {
    backgrounds: { value: 'light', grid: false },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Artifact symbol',
    data: options,
    getPreviewSrc: (value) => previews[value as keyof typeof previews],
    onChange: () => {},
    value: 'dune',
  },
});

export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Artifact symbol' })).toBeVisible();
    await expect(canvas.queryByText('Artifact symbol')).not.toBeInTheDocument();
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
