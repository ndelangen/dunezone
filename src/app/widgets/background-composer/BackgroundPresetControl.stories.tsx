import preview from '@sb/preview';
import { expect, fn, within } from 'storybook/test';

import { db } from '@db/storybook';
import { backgroundPresets } from '@game/data/backgrounds';

import { emptyBackgroundModeMemory } from './BackgroundComposer';
import { BackgroundPresetControl } from './BackgroundPresetControl';

const meta = preview.meta({
  parameters: { database: db(() => {}) },
  component: BackgroundPresetControl,
  title: 'Background Preset Control',
  args: {
    title: 'Head background',
    description: 'The band behind the card name.',
    usedOn: 'card head',
    presets: [],
    value: backgroundPresets.weapon,
    onChange: fn(),
    declaredCustom: false,
    onDeclaredCustomChange: fn(),
    modeMemory: emptyBackgroundModeMemory(),
    onModeMemoryChange: fn(),
  },
});
export const OnAPreset = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Head background preset' })).toHaveValue('Weapon');
    await expect(canvas.queryByRole('region', { name: 'Background builder' })).not.toBeInTheDocument();
  },
});
export const Custom = meta.story({
  args: { value: { ...backgroundPresets.weapon, source: { kind: 'custom' } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('region', { name: 'Background builder' })).toBeVisible();
  },
});
export const LegacyInline = meta.story({
  args: { value: { ...backgroundPresets.weapon, source: undefined } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('combobox', { name: 'Head background preset' })).toHaveValue('Custom');
  },
});
