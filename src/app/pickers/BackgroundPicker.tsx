import { Select } from '@mantine/core';
import { INITIAL_BACKGROUND_PRESETS } from '@shared/backgrounds/defaults';
import type { BackgroundData, SharedBackgroundPreset } from '@shared/backgrounds/schema';
import { customBackground, linkedBackground } from '@shared/backgrounds/schema';
import { useEffect, useState } from 'react';

import { useBackgroundPresets } from '@db/backgroundPresets';

type Option = { value: string; label: string };
function choiceKey(value: BackgroundData) {
  if (value.source?.kind === 'preset') {
    return value.source.key;
  }
  return value.source?.kind === 'family' ? 'family' : 'custom';
}
function fallbackLabel(key: string) {
  const stock = INITIAL_BACKGROUND_PRESETS.find((preset) => preset.key === key);
  if (stock) {
    return stock.name;
  }
  if (key.startsWith('custom/')) {
    return 'Shared background';
  }
  return key
    .split('/')
    .slice(1)
    .join(' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function pickerOptions(presets: SharedBackgroundPreset[], key: string, family: boolean): Option[] {
  const options = presets.map((preset) => ({ value: preset.key, label: preset.name }));
  if (!['custom', 'family'].includes(key) && !options.some((option) => option.value === key)) {
    options.unshift({ value: key, label: fallbackLabel(key) });
  }
  if (family) {
    options.push({ value: 'family', label: 'Family standard' });
  }
  options.push({ value: 'custom', label: 'Custom' });
  return options;
}
function pickedValue(
  next: string | null,
  value: BackgroundData,
  presets: SharedBackgroundPreset[],
  familyValue?: BackgroundData
) {
  if (next === 'family') {
    return { ...(familyValue ?? value), source: { kind: 'family' as const } };
  }
  if (next === 'custom') {
    if (choiceKey(value) === 'custom') {
      return value;
    }
    const current = presets.find((preset) => preset.key === choiceKey(value));
    return customBackground(familyValueFor(value, familyValue, current?.value));
  }
  const preset = presets.find((candidate) => candidate.key === next);
  return preset ? linkedBackground(preset) : undefined;
}
function familyValueFor(value: BackgroundData, familyValue?: BackgroundData, presetValue?: BackgroundData) {
  if (value.source?.kind === 'family') {
    return familyValue ?? value;
  }
  return presetValue ?? value;
}

function BackgroundOptions({ onLoad }: Readonly<{ onLoad: (presets: SharedBackgroundPreset[]) => void }>) {
  const presets = useBackgroundPresets();
  useEffect(() => {
    if (presets) {
      onLoad(presets);
    }
  }, [presets, onLoad]);
  return null;
}
/** Inline choices subscribe only while their dropdown is open. */
export function BackgroundPicker({
  label,
  value,
  onPick,
  familyValue,
}: Readonly<{
  label: string;
  value: BackgroundData;
  onPick: (value: BackgroundData) => void;
  familyValue?: BackgroundData;
}>) {
  const [opened, setOpened] = useState(false);
  /* Keep option labels after the dropdown releases its subscription. */
  const [presets, setPresets] = useState<SharedBackgroundPreset[]>([]);
  const key = choiceKey(value);
  return (
    <>
      {opened ? <BackgroundOptions onLoad={setPresets} /> : null}
      <Select
        label={label}
        value={key}
        data={pickerOptions(presets, key, Boolean(familyValue) || key === 'family')}
        searchable
        allowDeselect={false}
        onDropdownOpen={() => setOpened(true)}
        onDropdownClose={() => setOpened(false)}
        onChange={(next) => {
          const picked = pickedValue(next, value, presets, familyValue);
          if (picked) {
            onPick(picked);
          }
        }}
      />
    </>
  );
}
