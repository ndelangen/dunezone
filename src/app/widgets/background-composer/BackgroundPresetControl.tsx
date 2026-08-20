import { Stack } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useState } from 'react';

import type { BackgroundData } from '@game/data/backgrounds';

import { BackgroundComposer } from './BackgroundComposer';
import { BackgroundPresetPicker } from './BackgroundPresetPicker';

/** Value equality, since a preset is only "selected" while the stored background still matches it exactly. */
function sameBackground(a: BackgroundData, b: BackgroundData): boolean {
  return (
    a.image === b.image &&
    a.invert === b.invert &&
    a.definition === b.definition &&
    a.influence === b.influence &&
    JSON.stringify(a.colors) === JSON.stringify(b.colors)
  );
}

/* A background chosen from named presets, with the composer behind a Custom option.
   "Custom" stays selected while the value still equals a preset — the choice itself opens the composer. */
export function BackgroundPresetControl({
  title,
  description,
  usedOn,
  presets,
  value,
  onChange,
}: {
  title: string;
  description: string;
  usedOn: string;
  presets: readonly { key: string; label: string; background: BackgroundData }[];
  value: BackgroundData;
  onChange: (background: BackgroundData, presetKey: string | null) => void;
}) {
  const presetKey = presets.find((preset) => sameBackground(preset.background, value))?.key ?? null;
  const [customChosen, setCustomChosen] = useState(presetKey === null);
  const selected = customChosen || presetKey === null ? 'custom' : presetKey;
  return (
    <ControlBlock
      title={title}
      description={description}
      input={
        <Stack gap="sm">
          <BackgroundPresetPicker
            presets={presets}
            selected={selected}
            customBackground={value}
            onSelect={(next) => {
              if (next === 'custom') {
                setCustomChosen(true);
                return;
              }
              const preset = presets.find((candidate) => candidate.key === next);
              if (preset) {
                setCustomChosen(false);
                onChange(preset.background, preset.key);
              }
            }}
          />
          {selected === 'custom' ? (
            <BackgroundComposer value={value} onChange={(background) => onChange(background, null)} usedOn={usedOn} />
          ) : null}
        </Stack>
      }
    />
  );
}
