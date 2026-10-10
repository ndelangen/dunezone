import { NumberInput } from '@mantine/core';
import { MAX_LAST_TURN, MIN_LAST_TURN, lastTurnOf } from '@shared/play/lastTurn';
import { Section } from '@ui/block/Section';
import { useEffect, useRef, useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';

type Props = { client: TableSession; table: TableProjection };

/** A typed last turn the table accepts and does not already have, or null. */
function changedTurn(draft: number | string, current: number) {
  const next = Number(draft);
  const valid = Number.isInteger(next) && next >= MIN_LAST_TURN && next <= MAX_LAST_TURN;
  return valid && next !== current ? next : null;
}

/** The turn the game ends after, which the turn wheel counts up to; play carries on past it if the table wants. */
export function LastTurnSettings({ client, table }: Props) {
  const lastTurn = lastTurnOf(table.snapshot);
  const [draft, setDraft] = useState<number | string>(lastTurn);
  /* Another player's change replaces the shown turn, but never one this player is still typing; leaving the field settles it. */
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) {
      setDraft(lastTurn);
    }
  }, [lastTurn]);
  return (
    <Section title="Game length" description="The turn wheel counts up to the last turn.">
      <NumberInput
        label="Last turn"
        min={MIN_LAST_TURN}
        max={MAX_LAST_TURN}
        value={draft}
        disabled={!table.canInteract || !table.snapshot.bank}
        onChange={setDraft}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          const next = changedTurn(draft, lastTurn);
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
