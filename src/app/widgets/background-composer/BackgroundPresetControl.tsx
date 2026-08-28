import { Stack } from '@mantine/core';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useState } from 'react';

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
   * Controlled by the editors migrated onto the authoring session, where it lives in the session's memory and so resets with the draft.
   */
  declaredCustom?: boolean;
  onDeclaredCustomChange?: (next: boolean) => void;
}) {
  const presetKey = presetKeyFor(presets, value);
  /*
   * The uncontrolled half is the pre-migration latch, kept only for the mounts that have not moved yet.
   * It is the shape «Reset leaves the validation header open» and #587 both indict: component state whose correctness depends on a draft the caller owns, wrong after a Reset it cannot see.
   * Delete this state and make both props required once the remaining editors are migrated; nothing else here changes when it goes.
   */
  const [latchedCustom, setLatchedCustom] = useState(presetKey === null);
  const customChosen = declaredCustom ?? latchedCustom;
  const setCustomChosen = onDeclaredCustomChange ?? setLatchedCustom;
  const selected = presetSelection(presetKey, customChosen);
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
          {selected === CUSTOM_PRESET ? (
            <BackgroundComposer value={value} onChange={(background) => onChange(background, null)} usedOn={usedOn} />
          ) : null}
        </Stack>
      }
    />
  );
}
