import { NumberInput, Text } from '@mantine/core';
import { MAX_LAST_TURN, MIN_LAST_TURN } from '@shared/play/lastTurn';
import { Section } from '@ui/block/Section';
import { useEffect, useRef, useState } from 'react';

import { GAME_LENGTH_HELP } from '../../multiplayer/panelGuidance';

export type GameLengthPanelProps = Readonly<{
  /** The turn the table has as its last. */
  lastTurn: number;
  disabled: boolean;
  /** An observer, or a replay, reads the last turn with no field to change it. */
  observing: boolean;
  /** Sets a new last turn, sent once the player leaves the field. */
  onLastTurn: (turn: number) => void;
}>;

/** A typed last turn, held within the allowed range as the field shows it, when the table does not already have it; else null. */
function changedTurn(draft: number | string, current: number) {
  const typed = Number(draft);
  if (!Number.isInteger(typed)) {
    return null;
  }
  const next = Math.min(MAX_LAST_TURN, Math.max(MIN_LAST_TURN, typed));
  return next !== current ? next : null;
}

/** The turn the game ends after, which the turn wheel counts up to; play carries on past it if the table wants. */
export function GameLengthPanel({ lastTurn, disabled, observing, onLastTurn }: GameLengthPanelProps) {
  const [draft, setDraft] = useState<number | string>(lastTurn);
  /* Another player's change replaces the shown turn, but never one this player is still typing; leaving the field settles it. */
  const editing = useRef(false);
  /* Only a typed change is sent: focusing and leaving the field never undoes a change another player made meanwhile. */
  const edited = useRef(false);
  useEffect(() => {
    if (!editing.current) {
      setDraft(lastTurn);
    }
  }, [lastTurn]);
  if (observing) {
    return (
      <Section hiddenHeading title="Game length" description={GAME_LENGTH_HELP}>
        <Text size="sm">Last turn: {lastTurn}</Text>
      </Section>
    );
  }
  return (
    <Section hiddenHeading title="Game length" description={GAME_LENGTH_HELP}>
      <NumberInput
        label="Last turn"
        min={MIN_LAST_TURN}
        max={MAX_LAST_TURN}
        value={draft}
        disabled={disabled}
        onChange={(value) => {
          edited.current = true;
          setDraft(value);
        }}
        onFocus={() => {
          editing.current = true;
          edited.current = false;
        }}
        onBlur={() => {
          editing.current = false;
          const next = edited.current ? changedTurn(draft, lastTurn) : null;
          if (next === null) {
            setDraft(lastTurn);
            return;
          }
          onLastTurn(next);
        }}
      />
    </Section>
  );
}
