import { Group, Slider, Stack, Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useAssetResolver } from '@game/assets/assetRenderMode';

import styles from './CheckpointPicker.module.css';
import { checkpointTitle, checkpointTurns } from './checkpointTurns';
import type { CheckpointPickerProps } from './checkpointTurns';

/** A phase's symbol on a sand disc, as the turn tracker draws it; a setup step without one shows its initial. */
function PhaseDisc({ symbol, label, size }: Readonly<{ symbol: string | null; label: string; size: number }>) {
  const resolve = useAssetResolver();
  return (
    <span className={styles.disc} style={{ width: size, height: size }} aria-hidden>
      {symbol ? <img src={resolve(symbol)} alt="" /> : label.slice(0, 1)}
    </span>
  );
}

/** The checkpoint a table review asks for: one slider across every checkpoint, marked at each turn, with arrows for one step at a time. */
export function CheckpointPicker({ checkpoints, value, onChange }: CheckpointPickerProps) {
  const turns = checkpointTurns(checkpoints);
  const index = Math.max(
    0,
    checkpoints.findIndex((checkpoint) => checkpoint.step === value)
  );
  const current = checkpoints[index];
  if (!current) {
    return <Text size="sm">No checkpoint has been saved yet.</Text>;
  }
  const choose = (next: number) => onChange(checkpoints[Math.min(checkpoints.length - 1, Math.max(0, next))]!.step);
  /* A mark where each turn starts, named by its number, so a long game reads as its turns; setup is the unnamed stretch before them. */
  const marks = turns
    .filter((turn) => turn.turn !== null)
    .map((turn) => ({ value: checkpoints.indexOf(turn.phases[0]!.checkpoints[0]!), label: String(turn.turn) }));
  return (
    <Stack gap="md">
      <Slider
        min={0}
        max={checkpoints.length - 1}
        step={1}
        value={index}
        onChange={choose}
        marks={marks}
        label={(position) => checkpointTitle(turns, checkpoints[position]!.step)}
        thumbLabel="Checkpoint"
        mb="md"
      />
      <Group gap="xs" wrap="nowrap">
        <IconAction
          label="Earlier checkpoint"
          emphasis="quiet"
          icon={<ChevronLeft size={18} aria-hidden />}
          disabled={index === 0}
          onClick={() => choose(index - 1)}
        />
        <PhaseDisc symbol={current.symbol} label={current.label} size={28} />
        <Text size="sm" style={{ flex: 1 }}>
          {value === null ? 'Choose a checkpoint.' : checkpointTitle(turns, current.step)}
        </Text>
        <IconAction
          label="Later checkpoint"
          emphasis="quiet"
          icon={<ChevronRight size={18} aria-hidden />}
          disabled={index === checkpoints.length - 1}
          onClick={() => choose(index + 1)}
        />
      </Group>
    </Stack>
  );
}
