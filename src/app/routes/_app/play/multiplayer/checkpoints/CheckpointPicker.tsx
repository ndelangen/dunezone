import { Group, Slider, Stack, Text, Tooltip } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from 'react';

import { useAssetResolver } from '@game/assets/assetRenderMode';

import styles from './CheckpointPicker.module.css';
import { checkpointTitle, checkpointTurns } from './checkpointTurns';
import type { CheckpointPickerProps } from './checkpointTurns';
import { createSeekStore, shownStep } from './seekQueue';

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
  const thumbId = useId();
  /* Where a drag holds the thumb: the slider names the checkpoint under it, and the choice is made once when it is let go, so a drag across a recall moves the table once rather than at every checkpoint it passes. */
  const [dragged, setDragged] = useState<number | null>(null);
  /* One seek at a time, so the table's answers arrive in the order the choices were made. */
  const [seeks] = useState(createSeekStore);
  const seek = useSyncExternalStore(seeks.subscribe, seeks.get, seeks.get);
  /*
   * The slider applies a pointer's move on the next animation frame, so a quick press and release can end before the move lands and
   * report the thumb where it was. The choice is made a frame after the release, from the last position the slider moved to.
   */
  const latest = useRef<number | null>(null);
  const release = useRef(0);
  useEffect(() => () => cancelAnimationFrame(release.current), []);
  const turns = checkpointTurns(checkpoints);
  const land = useEffectEvent((now: number) => seeks.land(now, onChange));
  useEffect(() => land(value), [value]);
  const shown = shownStep(seek, value);
  /* Compared by step, so the first checkpoint is still a choice when the shown step is no longer offered. */
  const chosen = Math.max(
    0,
    checkpoints.findIndex((checkpoint) => checkpoint.step === shown)
  );
  const index = dragged === null ? chosen : Math.min(checkpoints.length - 1, dragged);
  const current = checkpoints[index];
  if (!current) {
    return <Text size="sm">No checkpoint has been saved yet.</Text>;
  }
  const title = checkpointTitle(turns, current.step) ?? current.context;
  const choose = (next: number) => {
    const step = checkpoints[Math.min(checkpoints.length - 1, Math.max(0, next))]!.step;
    seeks.choose(step, value, onChange);
  };
  /* The retained window can start mid-turn, so only a boundary between two offered checkpoints proves a turn's start. */
  const marks = checkpoints.flatMap((checkpoint, position) =>
    checkpoint.turn !== null && position > 0 && checkpoint.turn !== checkpoints[position - 1]!.turn
      ? [{ value: position, label: String(checkpoint.turn) }]
      : []
  );
  return (
    <Stack gap="md">
      {checkpoints.length > 1 && (
        <>
          <Slider
            min={0}
            max={checkpoints.length - 1}
            step={1}
            value={index}
            onChange={(next) => {
              latest.current = next;
              setDragged(next);
            }}
            onChangeEnd={(next) => {
              cancelAnimationFrame(release.current);
              release.current = requestAnimationFrame(() => {
                const settled = latest.current ?? next;
                latest.current = null;
                setDragged(null);
                choose(settled);
              });
            }}
            marks={marks}
            label={null}
            thumbProps={{ id: thumbId }}
            thumbLabel="Checkpoint"
            thumbValueText={title}
            mb="md"
          />
          <Tooltip target={`[id="${thumbId}"]`} label={title} withinPortal />
        </>
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
