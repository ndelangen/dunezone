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
  const title = checkpointTitle(turns, current.step) ?? current.context;
  const choose = (next: number) => onChange(checkpoints[Math.min(checkpoints.length - 1, Math.max(0, next))]!.step);
  /* The retained window can start mid-turn, so only a boundary between two offered checkpoints proves a turn's start. */
  const marks = checkpoints.flatMap((checkpoint, position) =>
    checkpoint.turn !== null && position > 0 && checkpoint.turn !== checkpoints[position - 1]!.turn
      ? [{ value: position, label: String(checkpoint.turn) }]
      : []
  );
  return (
    <Stack gap="md">
      {checkpoints.length > 1 && (
        <Slider
          min={0}
          max={checkpoints.length - 1}
          step={1}
          value={index}
          onChange={choose}
          marks={marks}
          label={(position) => checkpointTitle(turns, checkpoints[position]!.step)}
          thumbLabel="Checkpoint"
          thumbValueText={title}
          mb="md"
        />
      )}
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
          {title}
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
