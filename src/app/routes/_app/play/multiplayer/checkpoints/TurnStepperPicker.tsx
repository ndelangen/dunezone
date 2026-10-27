import { Stack, Text } from '@mantine/core';
import { Stepper } from '@ui/control/Stepper';
import { useState } from 'react';

import { MomentStrip, PhaseButton } from './CheckpointParts';
import styles from './CheckpointPicker.module.css';
import { checkpointTitle, checkpointTurns } from './checkpointTurns';
import type { CheckpointPickerProps } from './checkpointTurns';

/** Variant B: step through turns, then pick a phase of the one shown; the picker stays one strip high however long the game. */
export function TurnStepperPicker({ checkpoints, value, onChange }: CheckpointPickerProps) {
  const turns = checkpointTurns(checkpoints);
  const holding = turns.findIndex((turn) =>
    turn.phases.some((phase) => phase.checkpoints.some((entry) => entry.step === value))
  );
  const [browsed, setBrowsed] = useState<number | null>(null);
  const shown = browsed ?? (holding === -1 ? turns.length - 1 : holding);
  const turn = turns[shown];
  if (!turn) {
    return <Text size="sm">No checkpoint has been saved yet.</Text>;
  }
  return (
    <Stack gap="sm">
      <Stepper
        label="Turn"
        size="sm"
        value={shown}
        min={0}
        max={turns.length - 1}
        format={(index) => turns[index]?.label ?? ''}
        onChange={setBrowsed}
      />
      <div className={styles.strip} role="group" aria-label={`${turn.label} phases`}>
        {turn.phases.map((phase) => (
          <PhaseButton
            key={phase.key}
            phase={phase}
            value={value}
            onChange={onChange}
            turnLabel={turn.label}
            size={30}
          />
        ))}
      </div>
      <MomentStrip turns={turns} value={value} onChange={onChange} />
      <Text size="sm">{value === null ? 'Choose a checkpoint.' : checkpointTitle(turns, value)}</Text>
    </Stack>
  );
}
