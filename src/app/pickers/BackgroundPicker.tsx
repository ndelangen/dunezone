import { Select } from '@mantine/core';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import type { BackgroundData } from '@shared/backgrounds/schema';
import { customBackground, linkedBackground } from '@shared/backgrounds/schema';
import { useState } from 'react';

import { useBackgroundPresets } from '@db/backgroundPresets';

/** Inline choices subscribe only while their dropdown is open. */
export function BackgroundPicker({
  label,
  value,
  onPick,
  familyValue,
}: {
  label: string;
  value: BackgroundData;
  onPick: (value: BackgroundData) => void;
  familyValue?: BackgroundData;
}) {
  const [opened, setOpened] = useState(false);
  const presets = useBackgroundPresets(opened);
  const key =
    value.source?.kind === 'preset' ? value.source.key : value.source?.kind === 'family' ? 'family' : 'custom';
  const options = presets?.map((preset) => ({ value: preset.key, label: preset.name })) ?? [];
  if (key !== 'custom' && key !== 'family' && !options.some((option) => option.value === key)) {
    options.unshift({
      value: key,
      label:
        INITIAL_BACKGROUND_PRESETS.find((preset) => preset.key === key)?.name ??
        (key.startsWith('custom/')
          ? 'Shared background'
          : key
              .split('/')
              .slice(1)
              .join(' ')
              .replace(/^./, (letter) => letter.toUpperCase())),
    });
  }
  return (
    <Select
      label={label}
      value={key}
      data={[
        ...options,
        ...(familyValue || key === 'family' ? [{ value: 'family', label: 'Family standard' }] : []),
        { value: 'custom', label: 'Custom' },
      ]}
      searchable
      allowDeselect={false}
      onDropdownOpen={() => setOpened(true)}
      onDropdownClose={() => setOpened(false)}
      onChange={(next) => {
        if (next === 'family') {
          onPick({ ...(familyValue ?? value), source: { kind: 'family' } });
        } else if (next === 'custom') {
          const current = presets?.find((preset) => preset.key === key);
          onPick(customBackground(key === 'family' ? (familyValue ?? value) : (current?.value ?? value)));
        } else {
          const preset = presets?.find((candidate) => candidate.key === next);
          if (preset) {
            onPick(linkedBackground(preset));
          }
        }
      }}
    />
  );
}
