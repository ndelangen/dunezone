import { Stack } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';

import type { BackgroundData } from '@game/data/backgrounds';

import { BackgroundComposer } from './BackgroundComposer';
import { BackgroundPresetPicker } from './BackgroundPresetPicker';
import { CUSTOM_PRESET, presetKeyFor, presetSelection } from './presetChoice';

/* A background chosen from named presets, with the composer behind a Custom option.
   "Custom" stays selected while the value still equals a preset; the choice itself opens the composer. */
export function BackgroundPresetControl({
  title,
  description,
  usedOn,
  presets,
  value,
  onChange,
  declaredCustom,
  onDeclaredCustomChange,
}: {
  title: string;
  description: string;
  usedOn: string;
  presets: readonly { key: string; label: string; background: BackgroundData }[];
  value: BackgroundData;
  onChange: (background: BackgroundData, presetKey: string | null) => void;
  /**
   * The author's declared Custom intent, which the value cannot express once it happens to equal a preset.
   * It lives in the owning page's reducer memory, so a Reset this control cannot see discards it (D3 and D4 on «Work the editors wave»).
   */
  declaredCustom: boolean;
  onDeclaredCustomChange: (next: boolean) => void;
}) {
  const presetKey = presetKeyFor(presets, value);
  const selected = presetSelection(presetKey, declaredCustom);
  return (
    <ControlBlock
      title={title}
      description={description}
      input={
        <Stack gap="sm">
          <BackgroundPresetPicker
            label={title}
            presets={presets}
            selected={selected}
            customBackground={value}
            onSelect={(next) => {
              if (next === CUSTOM_PRESET) {
                onDeclaredCustomChange(true);
                return;
              }
              const preset = presets.find((candidate) => candidate.key === next);
              if (preset) {
                onDeclaredCustomChange(false);
                onChange(preset.background, preset.key);
              }
            }}
          />
          {selected === CUSTOM_PRESET ? (
            <BackgroundComposer value={value} onChange={(background) => onChange(background, null)} usedOn={usedOn} />
          ) : null}
        </Stack>
      }
    />
  );
}
