import { NumberInput, Text } from '@mantine/core';
import { MAX_LAST_TURN, MIN_LAST_TURN, lastTurnOf } from '@shared/play/lastTurn';
import { Section } from '@ui/block/Section';
import { useEffect, useRef, useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { isSpectator } from './tableFactions';

type Props = { client: TableSession; table: TableProjection };

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
export function LastTurnSettings({ client, table }: Props) {
  const lastTurn = lastTurnOf(table.snapshot);
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
  if (isSpectator(table)) {
    return (
      <Section title="Game length" description="The turn wheel counts up to the last turn.">
        <Text size="sm">Last turn: {lastTurn}</Text>
      </Section>
    );
  }
  return (
    <Section title="Game length" description="The turn wheel counts up to the last turn.">
      <NumberInput
        label="Last turn"
        min={MIN_LAST_TURN}
        max={MAX_LAST_TURN}
        value={draft}
        disabled={!table.canInteract || !table.snapshot.bank}
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
          void client.command({ kind: 'last-turn', turn: next });
        }}
      />
    </Section>
  );
}
