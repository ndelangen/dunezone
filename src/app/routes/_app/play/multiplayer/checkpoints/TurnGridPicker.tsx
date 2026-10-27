import { Stack, Text } from '@mantine/core';

import { MomentDots, PhaseButton } from './CheckpointParts';
import styles from './CheckpointPicker.module.css';
import { checkpointTitle, checkpointTurns } from './checkpointTurns';
import type { CheckpointPickerProps } from './checkpointTurns';

/** Variant A: every turn as a row of phase discs, newest on top, so any checkpoint is one click away. */
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
                  <span key={phase.key} className={styles.gridCell}>
                    <PhaseButton phase={phase} value={value} onChange={onChange} turnLabel={turn.label} />
                    <MomentDots phase={phase} value={value} onChange={onChange} />
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
      <Text size="sm">{value === null ? 'Choose a checkpoint.' : checkpointTitle(turns, value)}</Text>
    </Stack>
  );
}
