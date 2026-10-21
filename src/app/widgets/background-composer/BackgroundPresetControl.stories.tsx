import { Button } from '@mantine/core';
import preview from '@sb/preview';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import { useReducer, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { db } from '@db/storybook';
import { BackgroundLibrary } from '@game/assets/utils/BackgroundLibrary';
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

function ChoiceSession({ onChange }: { onChange?: (value: BackgroundData) => void }) {
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
      onChange={(value) => {
        dispatch({ kind: 'pick', value });
        onChange?.(value);
      }}
      declaredCustom={false}
      onDeclaredCustomChange={() => undefined}
      modeMemory={state.memory}
      onModeMemoryChange={(value) => dispatch({ kind: 'memory', value })}
    />
  );
}
export const PresetOrCustom = meta.story({
  parameters: {
    database: db((baseline) => {
      const { source: _source, ...value } = backgroundPresets.weapon;
      baseline.background_presets = [
        { key: 'custom/sunset', name: 'Sunset standard', value, revision: 1, updated_at: 0 },
        ...['front/treachery-weapon/header', 'front/treachery-weapon/icon', 'back/treachery'].map((key) => ({
          key,
          name: key,
          value,
          revision: 1,
          updated_at: 0,
        })),
      ];
    }),
  },
  render: () => <ChoiceSession />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('combobox', { name: 'Head background preset' }));
    for (const name of ['Header backgrounds', 'Icon backgrounds', 'Card-back backgrounds']) {
      const group = await page.findByRole('group', { name }, { timeout: 30_000 });
      await expect(group.querySelector('svg')).not.toBeNull();
    }
    await userEvent.click(await page.findByRole('option', { name: /^Custom$/ }));
    await expect(page.getByRole('region', { name: 'Background builder' })).toBeVisible();
    await userEvent.click(page.getByRole('combobox', { name: 'Head background preset' }));
    await userEvent.click(await page.findByRole('option', { name: /^Sunset standard$/ }, { timeout: 30_000 }));
    await expect(page.queryByRole('region', { name: 'Background builder' })).not.toBeInTheDocument();
    await expect(page.getByRole('combobox', { name: 'Head background preset' })).toHaveValue('Sunset standard');
  },
});

function ChangedStandardSession({ onChange }: { onChange: (value: BackgroundData) => void }) {
  const [changed, setChanged] = useState(false);
  return (
    <BackgroundLibrary
      presets={[
        {
          key: 'stock/weapon',
          name: 'Weapon',
          revision: changed ? 2 : 1,
          value: {
            ...backgroundPresets.weapon,
            colors: changed ? ['#112233', '#445566'] : backgroundPresets.weapon.colors,
          },
        },
      ]}
    >
      <Button onClick={() => setChanged(true)}>Update shared standard</Button>
      <ChoiceSession onChange={onChange} />
    </BackgroundLibrary>
  );
}
export const CustomKeepsTheCurrentAppearance = meta.story({
  parameters: {
    database: db((baseline) => {
      baseline.background_presets = INITIAL_BACKGROUND_PRESETS.filter((preset) => preset.key === 'stock/weapon').map(
        (preset) => ({ ...preset, updated_at: 0 })
      );
    }),
  },
  render: (args) => <ChangedStandardSession onChange={(value) => args.onChange(value, null)} />,
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('combobox', { name: 'Head background preset' }));
    await userEvent.click(await page.findByRole('option', { name: /^Weapon$/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Update shared standard' }));
    await expect(canvasElement.querySelector('svg rect[fill="#112233"]')).not.toBeNull();
    await userEvent.click(page.getByRole('combobox', { name: 'Head background preset' }));
    await userEvent.click(page.getByRole('option', { name: /^Custom$/ }));
    await expect(args.onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: ['#112233', '#445566'],
        source: { kind: 'custom' },
      }),
      null
    );
    await expect(page.getByRole('region', { name: 'Background builder' })).toBeVisible();
  },
});
