import { Stack, Text } from '@mantine/core';

import { MomentStrip, PhaseButton } from './CheckpointParts';
import styles from './CheckpointPicker.module.css';
import { checkpointTitle, checkpointTurns } from './checkpointTurns';
import type { CheckpointPickerProps } from './checkpointTurns';

/** Every turn as a row of phase discs, newest on top, so any checkpoint is one click away. */
export function TurnGridPicker({ checkpoints, value, onChange }: CheckpointPickerProps) {
  const turns = checkpointTurns(checkpoints);
  return (
    <Stack gap="xs">
      <div className={styles.grid} role="group" aria-label="Checkpoints by turn">
        {turns
          .slice()
          .reverse()
          .map((turn) => (
            <div
              key={turn.key}
              className={styles.gridRow}
              data-selected={
                turn.phases.some((phase) => phase.checkpoints.some((entry) => entry.step === value)) || undefined
              }
            >
              <Text size="xs" fw={700} c="dimmed">
                {turn.label}
              </Text>
              <div className={styles.gridPhases}>
                {turn.phases.map((phase) => (
                  <PhaseButton key={phase.key} phase={phase} value={value} onChange={onChange} turnLabel={turn.label} />
                ))}
              </div>
            </div>
          ))}
      </div>
      <MomentStrip turns={turns} value={value} onChange={onChange} />
      <Text size="sm">{value === null ? 'Choose a checkpoint.' : checkpointTitle(turns, value)}</Text>
    </Stack>
  );
}
