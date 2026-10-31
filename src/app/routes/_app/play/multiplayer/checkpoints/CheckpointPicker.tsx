import { Group, Slider, Stack, Text, Tooltip } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

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
  const thumbId = useId();
  /* Where a drag holds the thumb: the slider names the checkpoint under it, and the choice is made once when it is let go, so a drag across a recall moves the table once rather than at every checkpoint it passes. */
  const [dragged, setDragged] = useState<number | null>(null);
  /*
   * The slider applies a pointer's move on the next animation frame, so a quick press and release can end before the move lands and
   * report the thumb where it was. The choice is made a frame after the release, from the last position the slider moved to.
   */
  const latest = useRef<number | null>(null);
  const release = useRef(0);
  /* A key step has already moved the slider when it ends, so it is chosen at once rather than a frame later, where a quick click on Ask could overtake it. */
  const keyed = useRef(false);
  /*
   * Each press or key on the slider starts a gesture, and an arrow choice ends it.
   * A pointer move or release the slider still has queued from an ended gesture is dropped, so it cannot bring back a choice the arrow replaced.
   */
  const gesture = useRef(0);
  const live = useRef(0);
  /* A new value from the table ends any preview, so the thumb shows where the table now is. */
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDragged(null);
  }
  useEffect(() => () => cancelAnimationFrame(release.current), []);
  const turns = checkpointTurns(checkpoints);
  /* Compared by step, so the first checkpoint is still a choice when the table's step is no longer offered. */
  const chosen = Math.max(
    0,
    checkpoints.findIndex((checkpoint) => checkpoint.step === value)
  );
  const index = dragged === null ? chosen : Math.min(checkpoints.length - 1, dragged);
  const current = checkpoints[index];
  if (!current) {
    return <Text size="sm">No checkpoint has been saved yet.</Text>;
  }
  const title = checkpointTitle(turns, current.step) ?? current.context;
  const choose = (next: number) => {
    /* A choice made while a release waits for its frame replaces that release, so the older choice cannot land after it. */
    cancelAnimationFrame(release.current);
    latest.current = null;
    setDragged(null);
    const step = checkpoints[Math.min(checkpoints.length - 1, Math.max(0, next))]!.step;
    /* Sent even for the shown checkpoint: an earlier ask may still be on its way, and this one must land after it. */
    onChange(step);
  };
  const chooseByArrow = (next: number) => {
    gesture.current += 1;
    choose(next);
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
          {/* The slider handles its keys on its own root, so a key is noted here, around it, before the slider acts on it. */}
          <div
            onKeyDownCapture={() => {
              keyed.current = true;
              live.current = ++gesture.current;
            }}
            onPointerDownCapture={() => {
              keyed.current = false;
              live.current = ++gesture.current;
            }}
          >
            <Slider
              min={0}
              max={checkpoints.length - 1}
              step={1}
              value={index}
              onChange={(next) => {
                if (live.current !== gesture.current) {
                  return;
                }
                latest.current = next;
                setDragged(next);
              }}
              onChangeEnd={(next) => {
                if (live.current !== gesture.current) {
                  return;
                }
                if (keyed.current) {
                  keyed.current = false;
                  choose(next);
                  return;
                }
                cancelAnimationFrame(release.current);
                release.current = requestAnimationFrame(() => {
                  choose(latest.current ?? next);
                });
              }}
              marks={marks}
              label={null}
              thumbProps={{ id: thumbId }}
              thumbLabel="Checkpoint"
              thumbValueText={title}
              mb="md"
            />
          </div>
          <Tooltip target={`[id="${thumbId}"]`} label={title} withinPortal />
        </>
      )}
      <Group gap="xs" wrap="nowrap">
        <IconAction
          label="Earlier checkpoint"
          emphasis="quiet"
          icon={<ChevronLeft size={18} aria-hidden />}
          disabled={index === 0}
          onClick={() => chooseByArrow(index - 1)}
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
          onClick={() => chooseByArrow(index + 1)}
        />
      </Group>
    </Stack>
  );
}
