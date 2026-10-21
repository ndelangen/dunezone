import { Stack } from '@mantine/core';
import { customBackground } from '@shared/backgrounds/schema';
import { ControlBlock } from '@ui/control/ControlBlock';

import { BackgroundPicker } from '@app/pickers/BackgroundPicker';
import type { BackgroundData } from '@game/data/backgrounds';

import { BackgroundComposer } from './BackgroundComposer';
import type { BackgroundModeMemory } from './BackgroundComposer';

/* A background chosen from named presets, with the composer behind a Custom option.
   "Custom" stays selected while the value still equals a preset; the choice itself opens the composer. */
export function BackgroundPresetControl({
  title,
  description,
  usedOn,
  presets,
  value,
  familyValue,
  onChange,
  declaredCustom: _declaredCustom,
  onDeclaredCustomChange,
  modeMemory,
  onModeMemoryChange,
}: {
  title: string;
  description: string;
  usedOn: string;
  presets: readonly { key: string; label: string; background: BackgroundData }[];
  value: BackgroundData;
  familyValue?: BackgroundData;
  onChange: (background: BackgroundData, presetKey: string | null) => void;
  /**
   * The author's declared Custom intent, which the value cannot express once it happens to equal a preset.
   * It lives in the owning page's reducer memory, so a Reset this control cannot see discards it (D3 and D4 on «Work the editors wave»).
   */
  declaredCustom: boolean;
  onDeclaredCustomChange: (next: boolean) => void;
  /**
   * The composer's colour-mode memory, which lives in the same place and for the same reason as `declaredCustom`.
   * A value matching no preset keeps the composer mounted through a Reset, so a memory held in here would outlive the draft exactly as a ref did (#893).
   */
  modeMemory: BackgroundModeMemory;
  onModeMemoryChange: (memory: BackgroundModeMemory) => void;
}) {
  const custom = value.source?.kind !== 'preset' && value.source?.kind !== 'family';
  return (
    <ControlBlock
      title={title}
      description={description}
      input={
        <Stack gap="sm">
          <BackgroundPicker
            label={`${title} preset`}
            value={value}
            familyValue={familyValue}
            onPick={(background) => {
              onDeclaredCustomChange(background.source?.kind !== 'preset' && background.source?.kind !== 'family');
              const local = presets.find(
                (preset) =>
                  preset.background.source?.kind === 'preset' &&
                  background.source?.kind === 'preset' &&
                  preset.background.source.key === background.source.key
              );
              onChange(background, local?.key ?? null);
            }}
          />
          {custom ? (
            <BackgroundComposer
              value={value}
              onChange={(background) => onChange(customBackground(background), null)}
              usedOn={usedOn}
              modeMemory={modeMemory}
              onModeMemoryChange={onModeMemoryChange}
            />
          ) : null}
        </Stack>
      }
    />
  );
}
