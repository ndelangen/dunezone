import { Stack } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useState } from 'react';

import type { BackgroundData } from '@game/data/backgrounds';

import { BackgroundComposer } from './BackgroundComposer';
import { BackgroundPresetPicker } from './BackgroundPresetPicker';

/**
 * Value equality for a background, since a preset is only "selected" while the stored value still matches it exactly.
 * Scalars compare field by field;
 * `colors` alone compares by stringify, because a colour element may be a gradient object and a round-tripped clone never satisfies reference equality.
 * Stringifying the whole background would be unsafe, since a clone that round-tripped through the database carries Zod's key order, but `colors` is an array whose element order is the contract, so its stringify is stable.
 * Every stock matcher that embeds a background (`sameCardback`, `sameBand`) delegates here rather than restating the split.
 */
export function sameBackground(a: BackgroundData, b: BackgroundData): boolean {
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
