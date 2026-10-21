import preview from '@sb/preview';
import { useReducer } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';
import { backgroundPresets } from '@game/data/backgrounds';
import type { BackgroundData } from '@game/data/backgrounds';

import { emptyBackgroundModeMemory } from './BackgroundComposer';
import type { BackgroundModeMemory } from './BackgroundComposer';
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

function ChoiceSession() {
  const [state, dispatch] = useReducer(
    (
      current: { value: BackgroundData; memory: BackgroundModeMemory },
      event: { kind: 'pick'; value: BackgroundData } | { kind: 'memory'; value: BackgroundModeMemory }
    ) => (event.kind === 'pick' ? { ...current, value: event.value } : { ...current, memory: event.value }),
    { value: backgroundPresets.weapon, memory: emptyBackgroundModeMemory() }
  );
  return (
    <BackgroundPresetControl
      title="Head background"
      description="The band behind the card name."
      usedOn="card head"
      presets={[]}
      value={state.value}
      onChange={(value) => dispatch({ kind: 'pick', value })}
      declaredCustom={false}
      onDeclaredCustomChange={() => undefined}
      modeMemory={state.memory}
      onModeMemoryChange={(value) => dispatch({ kind: 'memory', value })}
    />
  );
}
export const PresetOrCustom = meta.story({
  render: () => <ChoiceSession />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('combobox', { name: 'Head background preset' }));
    await userEvent.click(await page.findByRole('option', { name: /^Custom$/ }));
    await expect(page.getByRole('region', { name: 'Background builder' })).toBeVisible();
    await userEvent.click(page.getByRole('combobox', { name: 'Head background preset' }));
    await userEvent.click(await page.findByRole('option', { name: /^Weapon$/ }, { timeout: 30_000 }));
    await expect(page.queryByRole('region', { name: 'Background builder' })).not.toBeInTheDocument();
  },
});
