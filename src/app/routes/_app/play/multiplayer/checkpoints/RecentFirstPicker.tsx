import { Accordion, Stack, Text, UnstyledButton } from '@mantine/core';

import { MomentDots, PhaseButton, PhaseDisc } from './CheckpointParts';
import styles from './CheckpointPicker.module.css';
import { checkpointTitle, checkpointTurns } from './checkpointTurns';
import type { CheckpointPickerProps } from './checkpointTurns';

/* A dispute is nearly always about what just happened, so the newest moments are listed and the rest wait folded. */
const RECENT = 5;

/** Variant D: the latest moments as a short list, newest first, and every earlier turn folded into its own row of phases. */
export function RecentFirstPicker({ checkpoints, value, onChange }: CheckpointPickerProps) {
  const turns = checkpointTurns(checkpoints);
  const recent = checkpoints.slice(-RECENT).reverse();
  const recentSteps = new Set(recent.map((checkpoint) => checkpoint.step));
  const earlier = turns.slice().reverse();
  return (
    <Stack gap="xs">
      <Stack gap={2} role="group" aria-label="Latest checkpoints">
        {recent.map((checkpoint) => (
          <UnstyledButton
            key={checkpoint.step}
            className={styles.recentRow}
            data-selected={checkpoint.step === value || undefined}
            aria-pressed={checkpoint.step === value}
            onClick={() => onChange(checkpoint.step)}
          >
            <PhaseDisc symbol={checkpoint.symbol} label={checkpoint.label} />
            <Text size="sm">{checkpointTitle(turns, checkpoint.step)}</Text>
          </UnstyledButton>
        ))}
      </Stack>
      <Accordion variant="contained" chevronPosition="left">
        <Accordion.Item value="earlier">
          <Accordion.Control>
            <Text size="sm">Earlier turns</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={4}>
              {earlier.map((turn) => (
                <div key={turn.key} className={styles.gridRow}>
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {value !== null && !recentSteps.has(value) && <Text size="sm">{checkpointTitle(turns, value)}</Text>}
    </Stack>
  );
}
