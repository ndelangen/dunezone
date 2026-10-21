import type { BackgroundData, SharedBackgroundPreset } from '@shared/backgrounds/schema';
import { useEffect, useState } from 'react';

import { useBackgroundPresets } from '@db/backgroundPresets';
import { useResolvedBackground } from '@game/assets/utils/BackgroundLibrary';

import { BackgroundPickerView } from './BackgroundPicker.parts';

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
  const resolved = useResolvedBackground(value);
  return (
    <>
      {opened ? <BackgroundOptions onLoad={setPresets} /> : null}
      <BackgroundPickerView
        label={label}
        value={value}
        resolvedValue={resolved === value ? undefined : resolved}
        familyValue={familyValue}
        presets={presets}
        onDropdownChange={setOpened}
        onPick={(next) => {
          if (next) {
            onPick(next);
          }
        }}
      />
    </>
  );
}
